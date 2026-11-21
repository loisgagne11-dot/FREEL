import { type KeyboardEvent, type PointerEvent, useCallback, useState } from 'react';

/**
 * Le mois qu'on lit sur un graphe : au survol, au doigt, ET au clavier — le
 * même état, pour que l'infobulle dise la même chose quel que soit le geste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE CIBLE, PAS QUINZE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Quinze colonnes sur 340 px font des cibles de 22 px : trop petites pour un
 * doigt, et quinze arrêts de tabulation pour traverser une courbe. Le graphe
 * entier est donc UNE cible (focusable, `role="group"`) : le doigt ou la souris
 * choisit le mois le plus proche de sa position, les flèches passent au
 * suivant, Échap referme. L'infobulle est annoncée (`aria-live`).
 */
export function useMoisLu(nombre: number, initial: number | null = null): {
  readonly actif: number | null;
  readonly choisir: (i: number | null) => void;
  readonly auPointeur: (e: PointerEvent<SVGSVGElement>, xDe: (i: number) => number, largeur: number) => void;
  readonly auClavier: (e: KeyboardEvent<SVGSVGElement>) => void;
} {
  const [actif, setActif] = useState<number | null>(initial);
  const choisir = useCallback((i: number | null) => setActif(i), []);

  const auPointeur = useCallback((e: PointerEvent<SVGSVGElement>, xDe: (i: number) => number, largeur: number) => {
    const cadre = e.currentTarget.getBoundingClientRect();
    if (cadre.width <= 0) return;
    const x = ((e.clientX - cadre.left) / cadre.width) * largeur;
    let proche = 0;
    for (let i = 1; i < nombre; i += 1) {
      if (Math.abs(xDe(i) - x) < Math.abs(xDe(proche) - x)) proche = i;
    }
    setActif(proche);
  }, [nombre]);

  const auClavier = useCallback((e: KeyboardEvent<SVGSVGElement>) => {
    const pas = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (e.key === 'Escape') { setActif(initial); return; }
    if (e.key === 'Home') { e.preventDefault(); setActif(0); return; }
    if (e.key === 'End') { e.preventDefault(); setActif(nombre - 1); return; }
    if (pas === 0) return;
    e.preventDefault();
    setActif((a) => Math.max(0, Math.min(nombre - 1, (a ?? (pas > 0 ? -1 : nombre)) + pas)));
  }, [nombre, initial]);

  return { actif, choisir, auPointeur, auClavier };
}

/**
 * Trois graduations « rondes » au-dessus de zéro : 5k, 10k, 15k — jamais 4 712.
 * Des pas assez serrés pour que la plus haute colle au maximum : avec 1, 2, 5
 * seulement, un pic à 20 435 € montait l'axe à 30k, et la courbe n'occupait
 * plus que les deux tiers bas de la carte.
 */
export function graduations(maximum: number): readonly number[] {
  if (maximum <= 0) return [];
  const brut = maximum / 3;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10].map((k) => k * puissance).find((p) => p >= brut) ?? brut;
  return [pas, pas * 2, pas * 3];
}

/** « 5k », « 12,5k », « −4k » : l'axe parle en milliers, comme la maquette. */
export function enMilliers(v: number): string {
  const k = Math.round((v / 1000) * 10) / 10;
  return `${String(k).replace('.', ',').replace('-', '−')}k`;
}
