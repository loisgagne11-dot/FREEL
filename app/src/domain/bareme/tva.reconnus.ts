/*
 * Les taux de TVA que lisent les documents — facture, dossier de déclaration,
 * détail de la dette —, à part de `tva.ts`.
 *
 * `tva.ts` est au premier rendu : le Pilote y lit le franchissement des
 * seuils. Ces trois valeurs-ci n'y servaient à rien, et le paquet d'entrée
 * frôlait son plafond au lot 34-bis après avoir reçu l'histoire de l'option
 * pour le versement libératoire. L'invariant n°7 dit d'extraire ; elles
 * restent au barème, datées et sourcées comme avant.
 */

import { dateISO } from '../types';

/**
 * Les taux de TVA en vigueur en France, du plus courant au plus rare.
 *
 * Ils servent à RECONNAÎTRE un taux, pas à en proposer un : voir
 * `factureDepuisRecette` et la ventilation du dossier de déclaration. Une
 * liste qui sert à reconnaître peut être fermée, là où une liste qui sert à
 * proposer devrait suivre les évolutions du barème. Une seule liste pour les
 * deux lecteurs : deux listes finiraient par ne pas reconnaître le même taux.
 */
export const TAUX_TVA_CONNUS: readonly number[] = [0.2, 0.1, 0.055, 0.021, 0];

/**
 * Le taux unique qu'une base et sa TVA trahissent, s'il est légal.
 *
 * `null` quand le rapport ne tombe sur aucun taux — ce qui arrive dès qu'une
 * facture en mêlait deux. La tolérance d'un demi-centime absorbe les arrondis
 * sans jamais accepter un taux voisin : le plus serré des écarts entre deux
 * taux légaux est de 3,4 points, très loin devant. Le signe est celui d'un
 * avoir : un HT et une TVA tous deux négatifs portent le taux de la facture
 * qu'ils annulent.
 */
export function tauxReconnu(ht: number, tva: number): number | null {
  const [base, taxe] = ht < 0 && tva <= 0 ? [-ht, -tva] : [ht, tva];
  if (base <= 0) return taxe === 0 ? 0 : null;
  return TAUX_TVA_CONNUS.find((t) => Math.abs(base * t - taxe) < 0.005) ?? null;
}

/**
 * Provenance de la TVA autoliquidée sur un achat de service à un fournisseur
 * de l'Union. Le MONTANT est sûr (art. 283-2 CGI, la franchise y est sans
 * incidence — confirmé au lot 7) ; seule la date de dépôt ne l'est pas, et
 * aucune n'est inventée : d'où l'hypothèse plutôt que le publié.
 */
export const AUTOLIQUIDATION_TVA = {
  source: 'art. 283-2 du CGI ; échéance de dépôt à confirmer auprès de ton service des impôts',
  verifieLe: dateISO('2026-11-07')
} as const;
