/*
 * À part de `format.ts` : celui-ci est dans le paquet d'entrée, et seuls les
 * graphes d'Argent (écran différé) abrègent en k€. Le paquet d'entrée a
 * franchi son budget au lot 7 en l'accueillant ; l'invariant n°7 dit
 * d'extraire.
 */
import { eur } from './format';

/**
 * Les montants abrégés des étiquettes de graphe. Source unique : l'écran
 * Trésorerie et l'écran Performance en avaient chacun une, avec deux arrondis.
 *
 * Sous mille euros, l'abréviation perdrait le seul chiffre significatif :
 * « 0,3 k€ » se lit moins bien que « 340 € ».
 *
 * Une décimale partout, même au-delà de 10 k€. La variante qui arrondissait à
 * l'entier dès 10 k€ affichait « 11 k€ » pour douze mois variant entre 10 500 et
 * 11 400 € : neuf étiquettes identiques sur une courbe qui bouge. L'arrondi est
 * symétrique autour de zéro (−1 250 → « −1,3 k€ », comme +1 250 → « 1,3 k€ »),
 * ce que `Math.round` seul ne ferait pas sur les négatifs.
 */
export function enKiloEuros(valeur: number): string {
  if (Math.abs(valeur) < 1000) return eur(Math.round(valeur));
  const dixiemes = Math.sign(valeur) * Math.round(Math.abs(valeur) / 100);
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(dixiemes / 10)} k€`;
}
