/**
 * L'option pour le versement libératoire, mois par mois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CHANGER D'OPTION NE RÉÉCRIT PAS LE PASSÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'option était un booléen du jour. La décocher en 2026 faisait recalculer
 * la déclaration des revenus 2025 en 5HQ — des recettes déjà imposées par le
 * versement libératoire, déclarées au barème — et inventait un solde d'impôt
 * 2025 que personne ne doit : le dû montait d'autant, et la déclaration
 * proposée était fausse.
 *
 * L'option vaut au 1er janvier : on opte ou on renonce au plus tard le 30
 * septembre pour l'année suivante, sauf l'année de création. La perte du droit
 * (revenu fiscal, dépassement de seuil) prend effet au 1er janvier aussi. Ce
 * qui valait AVANT se garde donc en périodes closes — `jusquA` inclus —, et le
 * booléen de l'entreprise dit ce qui vaut après la dernière.
 *
 * Ce module ne fait que lire : le sélecteur `vlAu` l'emporte au premier rendu,
 * et ce qui écrit une histoire vit à part (`optionVl.changement`), chargé avec
 * les Réglages.
 */

import type { Mois } from '../types';

/** Ce que valait l'option jusqu'à ce mois inclus. Triées, sans chevauchement. */
export interface PeriodeOptionVl {
  readonly jusquA: Mois;
  readonly actif: boolean;
}

/**
 * L'option à un mois : la première période close qui le couvre, sinon la
 * dernière option choisie. Une histoire vide — tout dossier d'avant le
 * schéma 26 — dit que l'option du jour vaut depuis toujours.
 */
export function optionVlAu(historique: readonly PeriodeOptionVl[], derniere: boolean, m: Mois): boolean {
  return historique.find((p) => m <= p.jusquA)?.actif ?? derniere;
}
