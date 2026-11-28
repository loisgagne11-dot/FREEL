/**
 * La saisie au pinceau : on choisit une fois ce qu'on pose, puis on le pose
 * sur un jour, une plage, une semaine ou un mois — en un seul geste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PINCEAU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Demandé par le propriétaire le 22/11 : « je dois reparamétrer chaque jour ;
 * mieux vaut un paramétrage appliqué à tous les jours ou demi-journées que je
 * veux — le moins de clics possible, et flexible ». L'éditeur d'une
 * demi-journée demandait quatre gestes par jour (ouvrir, type, client,
 * enregistrer) : une semaine de déplacement chez un client, c'était vingt
 * gestes pour une seule intention.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE SEULE RÈGLE DE SAISIE, POUR LE PINCEAU ET POUR L'ÉDITEUR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'éditeur passe par ici avec une date et un clic « isolé » : c'est la même
 * opération. Elle vivait dans l'écran, qui écrivait une fois par mission et
 * une fois pour le congé ; deux implémentations de « poser une demi-journée »
 * auraient fini par ne pas libérer la moitié de la même façon — et c'est cette
 * libération qui empêche une journée et demie sur un seul vendredi.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DES FAITS, ET RIEN DE PLUS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le pinceau n'est pas stocké : seuls les ajustements et les congés qu'il pose
 * le sont, exactement ceux que l'éditeur aurait posés jour par jour. Ce que le
 * geste a changé (`Changements`) ne vit qu'en mémoire, le temps de pouvoir
 * l'annuler.
 */

import type { DateISO } from '../domain/types';
import type { AjustementJour, JourPlanifie, Lieu, Portee } from '../domain/calculs/planning';
import {
  congeApresSaisie, creneauxDeLaPortee, creneauxOccupes, planifier, saisirSurPortee
} from '../domain/calculs/planning';
import { estWeekEnd } from '../domain/calculs/calendrier';
import { type NomDeFerie, nommerFeries } from '../domain/calculs/calendrier.noms';
import { arretDuClient } from '../domain/calculs/clientsOperationnels.lecture';
import type { Faits } from './schema';

/**
 * Ce qu'on pose.
 *
 * « Effacer » n'est pas « Libre » : libre DÉCLARE qu'on n'a pas travaillé, et
 * c'est un ajustement à zéro qui l'emporte sur le rythme ; effacer RETIRE la
 * correction, et la journée redevient ce que le rythme prévoit. Confondre les
 * deux ferait d'un geste de retour au rythme une journée vide déclarée.
 */
export type Pinceau =
  | {
    readonly type: 'travail';
    readonly missionId: string;
    readonly entiteId: string;
    /** `null` : non précisé. Jamais deviné — voir `EditeurDemiJournee`. */
    readonly lieu: Lieu | null;
  }
  | { readonly type: 'conge' | 'libre' | 'effacer' };

export interface Geste {
  readonly pinceau: Pinceau;
  readonly portee: Portee;
  readonly dates: readonly DateISO[];
  /**
   * Un clic sur UN jour, et non une plage.
   *
   * Il pose même un samedi, un férié ou un jour de congé : c'est ainsi qu'on
   * déclare une astreinte ou un rendu — l'ancienne application le permettait,
   * et un CRA qui les efface fait perdre de l'argent.
   */
  readonly isole: boolean;
}

/** Pourquoi une plage a sauté un jour. */
export type MotifDeSaut = 'weekEnd' | 'ferie' | 'conge' | 'arret';

/**
 * Ce qu'une PLAGE saute, ou `null` si elle pose ce jour-là.
 *
 * Glisser du lundi au lundi suivant veut dire « mes jours ouvrés » : poser
 * aussi le samedi, l'Ascension et la journée de congé déjà prise ferait trois
 * corrections à défaire une par une, et le congé effacé sortirait du solde
 * sans qu'on l'ait voulu. La même règle dessine l'aperçu de la plage : ce qui
 * s'allume est ce qui sera posé.
 */
export function sautSurUnePlage(
  jour: { readonly weekEnd: boolean; readonly ferie: boolean; readonly conge: number }
): Exclude<MotifDeSaut, 'arret'> | null {
  if (jour.weekEnd) return 'weekEnd';
  if (jour.ferie) return 'ferie';
  if (jour.conge > 0) return 'conge';
  return null;
}

/** Un ajustement remplacé : de quoi le rétablir, et de quoi savoir s'il a bougé depuis. */
export interface Retouche {
  readonly missionId: string;
  readonly entiteId: string;
  readonly date: DateISO;
  readonly avant: AjustementJour | null;
  readonly apres: AjustementJour | null;
}

/** Un congé remplacé. `0` : aucun congé ce jour-là. */
export interface RetoucheDeConge {
  readonly date: DateISO;
  readonly avant: number;
  readonly apres: number;
}

/** Ce qu'un geste a changé — et donc ce qu'« Annuler » rétablit. */
export interface Changements {
  readonly ajustements: readonly Retouche[];
  readonly conges: readonly RetoucheDeConge[];
}

export interface Application {
  /** Les faits après le geste — les mêmes, à la référence près, s'il n'a rien changé. */
  readonly faits: Faits;
  readonly changements: Changements;
  /** Les jours posés, sauts déduits. */
  readonly jours: readonly DateISO[];
  /** Les demi-journées posées : les jours, fois les créneaux de la portée. */
  readonly demiJournees: number;
  readonly sautes: readonly {
    readonly date: DateISO;
    readonly motif: MotifDeSaut;
    /** Le nom du férié, pour que le message dise « Ascension » et non « 1 férié ». */
    readonly ferie: NomDeFerie | null;
  }[];
}

/** Rien n'a changé : on n'écrit pas, et rien ne s'empile à annuler. */
export const aucunChangement = (c: Changements): boolean =>
  c.ajustements.length === 0 && c.conges.length === 0;

/** Deux ajustements qui disent la même chose. */
function memeAjustement(a: AjustementJour | null, b: AjustementJour | null): boolean {
  if (a === null || b === null) return a === b;
  return a.quotite === b.quotite && a.lieu === b.lieu
    && (a.creneaux ?? null)?.join() === (b.creneaux ?? null)?.join();
}

/**
 * Cette affectation tient-elle une partie de la portée ?
 *
 * Sans ce filtre, chaque geste écrirait un ajustement sur TOUTES les missions
 * du dossier, y compris celles qui n'avaient rien ce jour-là : il dirait la
 * même chose que le rythme, ne se verrait pas — jusqu'au jour où le rythme
 * change et où ces journées-là ne suivent pas.
 */
function toucheLaPortee(jour: JourPlanifie, portee: Portee): boolean {
  const vises = creneauxDeLaPortee(portee);
  return creneauxOccupes(jour.retenu, jour.creneaux).some((o) => vises.includes(o.creneau));
}

/**
 * Pose le pinceau sur les dates du geste. Pur : rend les faits d'après, ce qui
 * a changé, et ce qui a été sauté.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE MOITIÉ DE JOURNÉE N'A QU'UN OCCUPANT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le client peint prend la portée, tous les autres la RENDENT : c'est ce qui
 * corrige une journée et demie posée sur un seul vendredi (voir
 * `saisirSurPortee`). On parcourt toutes les missions, terminées comprises :
 * un ajustement peut survivre sur une mission close, et l'ignorer laisserait
 * sur place le doublon qu'on vient précisément défaire.
 *
 * Le lieu choisi ne vaut que pour le client peint. Celui qui rend la matinée
 * garde le sien pour l'après-midi : l'écran passait le lieu de la saisie à
 * TOUS les occupants, et rendre le matin à un client « sur site » requalifiait
 * son après-midi en télétravail sans que personne l'ait dit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN CLIENT ARRÊTÉ NE REÇOIT PLUS DE JOURNÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'arrêt borne ses plages (lot 31). Lui peindre une journée après l'arrêt
 * repousserait sa fin d'autant, et le CRA comme la facture compteraient une
 * journée chez un client parti. Le jour est sauté, et le message le dit.
 */
export function appliquerPinceau(faits: Faits, geste: Geste): Application {
  const { pinceau, portee } = geste;

  // Les fériés peuvent tomber sur deux années : une semaine à cheval sur le
  // 31 décembre. La zone est celle de tout le planning (régime général).
  const nomsDesFeries = new Map<string, NomDeFerie>();
  for (const a of new Set(geste.dates.map((d) => Number(d.slice(0, 4))))) {
    for (const [d, n] of nommerFeries(a)) nomsDesFeries.set(d, n);
  }
  const feries = new Set<string>(nomsDesFeries.keys());
  const conges: Record<string, number> = {};
  for (const c of faits.conges) conges[c.date] = c.quotite;

  let arret: DateISO | null = null;
  if (pinceau.type === 'travail') {
    const m = faits.missions.find((x) => x.id === pinceau.missionId);
    const e = m?.entites.find((x) => x.id === pinceau.entiteId);
    if (m !== undefined && e !== undefined) arret = arretDuClient(m, e);
  }

  const sautes: Application['sautes'][number][] = [];
  const jours: DateISO[] = [];
  for (const date of new Set(geste.dates)) {
    const motif: MotifDeSaut | null = !geste.isole
      ? sautSurUnePlage({ weekEnd: estWeekEnd(date), ferie: feries.has(date), conge: conges[date] ?? 0 })
      : null;
    if (motif !== null || (arret !== null && date > arret)) {
      sautes.push({ date, motif: motif ?? 'arret', ferie: nomsDesFeries.get(date) ?? null });
    } else {
      jours.push(date);
    }
  }

  const retouches: Retouche[] = [];
  const missions = faits.missions.map((m) => {
    let toucheeIci = false;
    const entites = m.entites.map((e) => {
      let ajustements: Record<string, AjustementJour> | null = null;
      for (const date of jours) {
        const avant = e.ajustements[date] ?? null;
        let apres: AjustementJour | null = null;
        if (pinceau.type !== 'effacer') {
          const [jour] = planifier([date], {
            rythmes: e.rythmes, ajustements: e.ajustements, feries, conges
          });
          if (jour === undefined) continue;
          const occupe = pinceau.type === 'travail'
            && m.id === pinceau.missionId && e.id === pinceau.entiteId;
          if (!occupe && !toucheLaPortee(jour, portee)) continue;
          apres = saisirSurPortee(jour, portee, occupe, occupe && pinceau.type === 'travail' ? pinceau.lieu : null);
        }
        if (memeAjustement(avant, apres)) continue;
        ajustements ??= { ...e.ajustements };
        if (apres === null) delete ajustements[date];
        else ajustements[date] = apres;
        retouches.push({ missionId: m.id, entiteId: e.id, date, avant, apres });
      }
      if (ajustements === null) return e;
      toucheeIci = true;
      return { ...e, ajustements };
    });
    return toucheeIci ? { ...m, entites } : m;
  });

  // Effacer ne touche pas aux congés : « revenir au rythme » retire des
  // corrections, et un congé n'en est pas une — il se retire avec « Libre ».
  const retouchesDeConges: RetoucheDeConge[] = [];
  const parDate = new Map(faits.conges.map((c) => [c.date as string, c]));
  if (pinceau.type !== 'effacer') {
    for (const date of jours) {
      const avant = conges[date] ?? 0;
      const apres = congeApresSaisie(avant, portee, pinceau.type);
      if (apres === avant) continue;
      if (apres === 0) parDate.delete(date);
      else parDate.set(date, { date, quotite: apres });
      retouchesDeConges.push({ date, avant, apres });
    }
  }

  const changements = { ajustements: retouches, conges: retouchesDeConges };
  return {
    faits: aucunChangement(changements)
      ? faits
      : {
        ...faits,
        missions,
        conges: retouchesDeConges.length === 0
          ? faits.conges
          : [...parDate.values()].sort((a, b) => a.date.localeCompare(b.date))
      },
    changements,
    jours,
    demiJournees: jours.length * (pinceau.type === 'effacer' ? 2 : creneauxDeLaPortee(portee).length),
    sautes
  };
}

/**
 * Défait un geste. Pur : rend les faits d'après et le nombre de retouches
 * rétablies.
 *
 * Seul ce qui porte ENCORE ce que le geste a posé est rétabli. Entre le geste
 * et l'annulation, l'éditeur, la pose d'une plage de congés ou un autre
 * appareil ont pu réécrire la même journée : remettre l'état d'avant par-dessus
 * effacerait cette saisie-là en silence, pour défaire une saisie plus ancienne.
 */
export function annulerChangements(
  faits: Faits, changements: Changements
): { readonly faits: Faits; readonly rendus: number } {
  let rendus = 0;
  const missions = faits.missions.map((m) => ({
    ...m,
    entites: m.entites.map((e) => {
      const lot = changements.ajustements
        .filter((r) => r.missionId === m.id && r.entiteId === e.id);
      if (lot.length === 0) return e;
      const ajustements = { ...e.ajustements };
      for (const r of lot) {
        if (!memeAjustement(ajustements[r.date] ?? null, r.apres)) continue;
        if (r.avant === null) delete ajustements[r.date];
        else ajustements[r.date] = r.avant;
        rendus += 1;
      }
      return { ...e, ajustements };
    })
  }));

  const parDate = new Map(faits.conges.map((c) => [c.date as string, c]));
  for (const r of changements.conges) {
    if ((parDate.get(r.date)?.quotite ?? 0) !== r.apres) continue;
    if (r.avant === 0) parDate.delete(r.date);
    else parDate.set(r.date, { date: r.date, quotite: r.avant });
    rendus += 1;
  }

  return {
    faits: rendus === 0
      ? faits
      : {
        ...faits,
        missions,
        conges: [...parDate.values()].sort((a, b) => a.date.localeCompare(b.date))
      },
    rendus
  };
}
