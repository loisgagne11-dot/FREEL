/**
 * Le tracé lissé d'une série — monotone, comme la direction le demande.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI MONOTONE, ET PAS UNE COURBE DE BÉZIER QUELCONQUE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un lissage ordinaire (Catmull-Rom, cardinal) fait passer la courbe AU-DELÀ
 * de ses points entre deux mois contrastés : une occupation de 0 % puis 90 %
 * se dessinait avec un creux sous zéro, et un carnet qui tombe à zéro remontait
 * avant de s'y poser. La courbe inventait un pic ou un creux que rien ne
 * porte — `DIRECTION-VISUELLE.md`, « Graphiques ». La méthode de Steffen borne
 * la pente en chaque point par les pentes voisines : entre deux points, la
 * courbe ne sort jamais de l'intervalle qu'ils forment.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

const arrondi = (n: number): string => String(Math.round(n * 10) / 10);
const signe = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

/** Le chemin SVG (`d`) qui passe par chaque point sans jamais les dépasser. */
export function cheminMonotone(points: readonly Point[]): string {
  const n = points.length;
  const p = (i: number): Point => points[i] as Point;
  if (n === 0) return '';
  const depart = `M${arrondi(p(0).x)},${arrondi(p(0).y)}`;
  if (n === 1) return depart;

  const h: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = p(i + 1).x - p(i).x;
    h.push(dx);
    s.push(dx === 0 ? 0 : (p(i + 1).y - p(i).y) / dx);
  }
  const pente = (i: number): number => s[i] as number;
  const ecart = (i: number): number => h[i] as number;

  const m: number[] = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i += 1) {
    const a = pente(i - 1);
    const b = pente(i);
    const moyenne = (a * ecart(i) + b * ecart(i - 1)) / (ecart(i - 1) + ecart(i));
    m[i] = (signe(a) + signe(b)) * Math.min(Math.abs(a), Math.abs(b), 0.5 * Math.abs(moyenne)) || 0;
  }
  // Aux bouts, la pente qui prolonge la voisine sans dépasser la sécante.
  m[0] = n > 2 ? (3 * pente(0) - (m[1] as number)) / 2 : pente(0);
  m[n - 1] = n > 2 ? (3 * pente(n - 2) - (m[n - 2] as number)) / 2 : pente(n - 2);

  let chemin = depart;
  for (let i = 0; i < n - 1; i += 1) {
    const tiers = ecart(i) / 3;
    const a = p(i);
    const b = p(i + 1);
    chemin += `C${arrondi(a.x + tiers)},${arrondi(a.y + (m[i] as number) * tiers)} `
      + `${arrondi(b.x - tiers)},${arrondi(b.y - (m[i + 1] as number) * tiers)} `
      + `${arrondi(b.x)},${arrondi(b.y)}`;
  }
  return chemin;
}
