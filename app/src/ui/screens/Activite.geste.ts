import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import type { Creneau } from '../../domain/calculs/planning';
import { decaler } from '../../domain/calculs/calendrier';
import type { DateISO } from '../../domain/types';
import type { JourDeLaSemaine } from '../../state/selecteurs.activite';
import { sautSurUnePlage } from '../../state/pinceau';

/** Une moitié de journée de la grille, telle que ses attributs la désignent. */
export interface CaseVisee {
  readonly date: DateISO;
  readonly creneau: Creneau;
}

/**
 * Combien de temps le doigt reste posé avant que le glissé ne prenne la main.
 *
 * Au téléphone, glisser le doigt sur une page FAIT DÉFILER : c'est le geste le
 * plus fréquent de l'appareil, et le voler pour peindre ferait d'une grille
 * qu'on traverse en lisant une grille qu'on repeint par erreur. Le glissé
 * n'est donc armé qu'après un appui immobile ; bouger avant, c'est défiler.
 * Un peu moins que le menu contextuel d'Android (~500 ms), qu'il devance.
 */
const APPUI_LONG = 450;
/** Au-delà, le doigt a bougé : c'est un défilement, pas un appui. */
const TOLERANCE = 10;

interface Glisse {
  readonly debut: CaseVisee;
  fin: CaseVisee;
  readonly doigt: boolean;
  arme: boolean;
  readonly x0: number;
  readonly y0: number;
  minuteur: number | null;
}

const cle = (c: CaseVisee): string => `${c.date}|${c.creneau}`;

/**
 * Les dates d'une plage, bornées à ce qui est affiché : un glissé, un Maj +
 * clic ou une sélection au clavier ne posent jamais sur un jour qu'on ne voit
 * pas — le CRA d'un autre mois changerait sans que rien ne l'ait montré.
 */
function plageDans(jours: readonly JourDeLaSemaine[], a: DateISO, b: DateISO): readonly DateISO[] {
  const [du, au] = a <= b ? [a, b] : [b, a];
  return jours.filter((j) => j.date >= du && j.date <= au).map((j) => j.date);
}

/** La moitié de journée sous un élément, d'après `data-date` et `data-creneau`. */
function lireCase(cible: EventTarget | Element | null): CaseVisee | null {
  const el = cible instanceof Element ? cible.closest<HTMLElement>('[data-date]') : null;
  const date = el?.dataset['date'];
  const creneau = el?.dataset['creneau'];
  return date !== undefined && (creneau === 'matin' || creneau === 'apresMidi')
    ? { date: date as DateISO, creneau }
    : null;
}

/**
 * Les gestes du pinceau sur la grille : toucher, glisser, Maj + clic, clavier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DÉLÉGUÉS AU CONTENEUR, POUR LES DEUX VUES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La semaine et le mois ne savent que dire quelle moitié est sous le pointeur
 * (`data-date`, `data-creneau`) et laquelle s'allume (`apercu`). Le geste vit
 * ici, une fois : deux reconnaissances du glissé, une par vue, auraient fini
 * par ne pas sauter les mêmes jours — et l'aperçu aurait menti sur l'une.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SANS PINCEAU, RIEN NE CHANGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le clic laisse passer jusqu'au bouton, qui ouvre l'éditeur comme avant. Seul
 * le clavier gagne les flèches, qui servent aussi sans pinceau.
 */
export function useGestePinceau({
  actif, jours, creneaux, onPoser, onOuvrir, onLacher
}: {
  /** Un pinceau est choisi. */
  readonly actif: boolean;
  /** Les jours affichés : une plage ne déborde jamais de ce qu'on voit. */
  readonly jours: readonly JourDeLaSemaine[];
  /** Les créneaux de la portée, pour l'aperçu. */
  readonly creneaux: readonly Creneau[];
  /** `isole` : un seul jour visé, posé même s'il est chômé. */
  readonly onPoser: (dates: readonly DateISO[], isole: boolean, origine: CaseVisee) => void;
  /** `double` : un double-clic, dont le premier clic a déjà posé le pinceau. */
  readonly onOuvrir: (c: CaseVisee, double: boolean) => void;
  /** Échap sans sélection : on repose le pinceau. */
  readonly onLacher: () => void;
}) {
  const [selection, setSelection] = useState<{ readonly debut: CaseVisee; readonly fin: CaseVisee } | null>(null);
  const glisse = useRef<Glisse | null>(null);
  /** Le clic qui suit un glissé ou un appui long a déjà été traité. */
  const ignorerClicDepuis = useRef(0);
  /** Le dernier jour touché, d'où part Maj + clic. */
  const dernier = useRef<CaseVisee | null>(null);
  /** L'origine d'une sélection au clavier (Maj + flèches). */
  const ancre = useRef<CaseVisee | null>(null);
  const conteneur = useRef<HTMLDivElement | null>(null);

  // Les écouteurs du document lisent les derniers rappels sans être recréés à
  // chaque rendu : un glissé en cours ne doit pas perdre son `pointerup`.
  const rappels = useRef({ onPoser, onOuvrir, jours });
  useEffect(() => { rappels.current = { onPoser, onOuvrir, jours }; });

  const plage = (a: DateISO, b: DateISO): readonly DateISO[] => plageDans(rappels.current.jours, a, b);

  const ignorer = (): void => { ignorerClicDepuis.current = Date.now(); };

  useEffect(() => {
    if (!actif) return undefined;
    const terminer = (): void => {
      const g = glisse.current;
      glisse.current = null;
      if (g === null) return;
      if (g.minuteur !== null) window.clearTimeout(g.minuteur);
      setSelection(null);
      // Un appui long sans glisser ouvre l'éditeur : au téléphone, c'est le
      // seul chemin vers le détail quand un pinceau est en main — le
      // double-toucher zoome.
      if (g.doigt && g.arme && cle(g.fin) === cle(g.debut)) {
        ignorer();
        rappels.current.onOuvrir(g.debut, false);
        return;
      }
      if (!g.arme || cle(g.fin) === cle(g.debut)) return; // le clic s'en charge
      ignorer();
      const dates = plage(g.debut.date, g.fin.date);
      rappels.current.onPoser(dates, dates.length === 1, g.debut);
      dernier.current = g.fin;
    };
    const abandonner = (): void => {
      const g = glisse.current;
      if (g?.minuteur !== null && g?.minuteur !== undefined) window.clearTimeout(g.minuteur);
      glisse.current = null;
      setSelection(null);
    };
    /*
     * Une fois le glissé armé, le doigt ne fait plus défiler la page. Il faut
     * un écouteur NON passif, et React n'en pose pas pour `touchmove` : on
     * l'attache au document, et seulement tant qu'un pinceau est en main —
     * hors de ce mode, le défilement ne l'attend jamais.
     */
    const retenirLeDefilement = (e: TouchEvent): void => {
      if (glisse.current?.doigt === true && glisse.current.arme) e.preventDefault();
    };
    document.addEventListener('pointerup', terminer);
    document.addEventListener('pointercancel', abandonner);
    document.addEventListener('touchmove', retenirLeDefilement, { passive: false });
    return () => {
      document.removeEventListener('pointerup', terminer);
      document.removeEventListener('pointercancel', abandonner);
      document.removeEventListener('touchmove', retenirLeDefilement);
      abandonner();
    };
  }, [actif]);

  const apercu = useMemo(() => {
    if (selection === null) return null;
    const dates = plageDans(jours, selection.debut.date, selection.fin.date);
    const seul = dates.length === 1;
    const allumees = new Set<string>();
    for (const j of jours) {
      if (!dates.includes(j.date)) continue;
      // L'aperçu ne promet que ce qui sera posé : une plage saute les
      // week-ends, fériés et congés, un jour seul non.
      if (!seul && sautSurUnePlage(j) !== null) continue;
      for (const c of creneaux) allumees.add(`${j.date}|${c}`);
    }
    return allumees;
  }, [selection, jours, creneaux]);

  const proprietes = {
    ref: conteneur,
    onPointerDown(e: PointerEvent<HTMLDivElement>): void {
      ignorerClicDepuis.current = 0;
      if (!actif || e.shiftKey || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const c = lireCase(e.target);
      if (c === null) return;
      const doigt = e.pointerType === 'touch';
      const g: Glisse = { debut: c, fin: c, doigt, arme: !doigt, x0: e.clientX, y0: e.clientY, minuteur: null };
      if (doigt) {
        g.minuteur = window.setTimeout(() => {
          g.arme = true;
          g.minuteur = null;
          setSelection({ debut: c, fin: c });
        }, APPUI_LONG);
      }
      glisse.current = g;
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>): void {
      const g = glisse.current;
      if (g === null) return;
      if (!g.arme) {
        if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > TOLERANCE) {
          if (g.minuteur !== null) window.clearTimeout(g.minuteur);
          glisse.current = null; // le doigt défile
        }
        return;
      }
      // Le doigt reste capturé par la case où il s'est posé : c'est le point
      // sous lui, et non la cible de l'événement, qui dit où il est.
      const sous = g.doigt ? document.elementFromPoint(e.clientX, e.clientY) : e.target;
      const c = lireCase(sous);
      if (c === null || cle(c) === cle(g.fin)) return;
      g.fin = c;
      setSelection({ debut: g.debut, fin: c });
    },
    onClickCapture(e: MouseEvent<HTMLDivElement>): void {
      const c = lireCase(e.target);
      if (c === null) return;
      if (ignorerClicDepuis.current !== 0 && Date.now() - ignorerClicDepuis.current < 1000) {
        ignorerClicDepuis.current = 0;
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (!actif) return;
      // Le pinceau est en main : le bouton n'ouvre pas l'éditeur.
      e.stopPropagation();
      e.preventDefault();
      const depuis = e.shiftKey ? dernier.current : null;
      if (depuis !== null && depuis.date !== c.date
        && rappels.current.jours.some((j) => j.date === depuis.date)) {
        onPoser(plage(depuis.date, c.date), false, c);
      } else {
        onPoser([c.date], true, c);
      }
      dernier.current = c;
    },
    onDoubleClick(e: MouseEvent<HTMLDivElement>): void {
      const c = lireCase(e.target);
      if (c !== null && actif) onOuvrir(c, true);
    },
    onContextMenu(e: MouseEvent<HTMLDivElement>): void {
      // L'appui long d'Android ouvrirait son menu par-dessus le glissé.
      if (actif && lireCase(e.target) !== null) e.preventDefault();
    },
    onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
      const c = lireCase(e.target);
      if (c === null) return;
      const pas = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as const)[
        e.key as 'ArrowLeft'
      ] as readonly [number, number] | undefined;
      if (pas !== undefined) {
        e.preventDefault();
        const [dx, dy] = pas;
        // À l'horizontale, d'un jour ; à la verticale, du matin à l'après-midi,
        // puis à la semaine d'à côté — l'ordre où l'œil lit une case de mois.
        const voisine: CaseVisee = dx !== 0
          ? { date: decaler(c.date, dx), creneau: c.creneau }
          : dy > 0
            ? (c.creneau === 'matin' ? { date: c.date, creneau: 'apresMidi' } : { date: decaler(c.date, 7), creneau: 'matin' })
            : (c.creneau === 'apresMidi' ? { date: c.date, creneau: 'matin' } : { date: decaler(c.date, -7), creneau: 'apresMidi' });
        const bouton = conteneur.current?.querySelector<HTMLElement>(
          `[data-date="${voisine.date}"][data-creneau="${voisine.creneau}"]`
        );
        if (bouton === null || bouton === undefined) return;
        bouton.focus();
        if (e.shiftKey && actif) {
          ancre.current ??= c;
          setSelection({ debut: ancre.current, fin: voisine });
        } else {
          ancre.current = null;
          setSelection(null);
        }
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && ancre.current !== null && actif) {
        e.preventDefault();
        // L'Espace active un bouton au relâchement : ce clic-là est déjà posé.
        ignorer();
        const dates = plage(ancre.current.date, c.date);
        onPoser(dates, dates.length === 1, ancre.current);
        dernier.current = c;
        ancre.current = null;
        setSelection(null);
        return;
      }
      if (e.key === 'Escape') {
        if (ancre.current !== null || selection !== null) {
          ancre.current = null;
          setSelection(null);
        } else if (actif) {
          onLacher();
        }
      }
    }
  };

  return { apercu, proprietes };
}
