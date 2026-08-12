/**
 * Règles chiffrées de tenue du livre des recettes.
 *
 * Une seule valeur ici, mais elle suit le même régime que les taux de
 * cotisations : datée, sourcée, et accompagnée de la date à laquelle un humain
 * l'a vérifiée. L'invariant du projet ne souffre pas d'exception pour les
 * petits nombres — c'est justement ceux-là qu'on recopie sans y penser et
 * qu'on oublie de mettre à jour.
 */

import { type DateISO, type Euros, dateISO, euros } from '../types';

export interface SeuilDate {
  readonly valeur: Euros;
  readonly source: string;
  readonly verifieLe: DateISO;
  /** À partir de quand ce seuil s'applique. */
  readonly depuis: DateISO;
}

/**
 * Seuil de globalisation des recettes au détail.
 *
 * En BNC, les recettes doivent être inscrites une par une avec l'identité du
 * client. Les règlements au détail n'excédant pas ce montant peuvent être
 * inscrits globalement en fin de journée — tolérance qui vise le commerce de
 * comptoir, pas la prestation intellectuelle.
 *
 * Pour un indépendant qui facture des missions, aucune recette n'entre dans
 * cette tolérance : elle sert ici à ne PAS réclamer l'identité du client sur
 * une écriture globalisée légitime, et non à en dispenser les autres.
 */
export const SEUIL_GLOBALISATION_DETAIL: SeuilDate = {
  valeur: euros(76),
  source: 'CGI, art. 286 — tolérance de globalisation des recettes au détail',
  verifieLe: dateISO('2026-08-12'),
  depuis: dateISO('2000-01-01')
};

/**
 * Durée de conservation du livre des recettes et des pièces justificatives.
 *
 * Six ans à compter de la dernière opération, au titre du droit de reprise de
 * l'administration fiscale. C'est cette durée qui interdit au module de
 * justificatifs de supprimer une pièce rattachée à une dépense existante.
 */
export const ANNEES_CONSERVATION = {
  valeur: 6,
  source: 'LPF, art. L102 B — délai de conservation des documents',
  verifieLe: dateISO('2026-08-12')
} as const;

/** Contrôle d'intégrité, agrégé par `bareme/index`. */
export function verifierIntegriteRecettes(): readonly string[] {
  const ecarts: string[] = [];
  if (SEUIL_GLOBALISATION_DETAIL.valeur <= 0) {
    ecarts.push('recettes : le seuil de globalisation doit être strictement positif.');
  }
  if (SEUIL_GLOBALISATION_DETAIL.source.trim() === '') {
    ecarts.push('recettes : le seuil de globalisation est sans source.');
  }
  if (ANNEES_CONSERVATION.valeur < 1) {
    ecarts.push('recettes : la durée de conservation doit couvrir au moins un exercice.');
  }
  return ecarts;
}
