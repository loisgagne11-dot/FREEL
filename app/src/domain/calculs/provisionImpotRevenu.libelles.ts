/**
 * Les libellés des réserves de la provision d'impôt sur le revenu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE À PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le calcul, lui, est appelé au PREMIER RENDU : la provision entre au volet 2
 * et détermine le versable affiché sur le Pilote. Ces libellés, non — ils ne
 * se lisent que dans la carte des enveloppes de l'écran Argent, chargé à la
 * demande. Les laisser dans le module de calcul les faisait emporter dans le
 * lot d'entrée, où rien ne les affiche : le budget l'a signalé en dépassant.
 *
 * Le motif de REFUS, lui, reste dans le module de calcul : il remonte jusqu'au
 * bandeau du Pilote, qui doit dire pourquoi le versable est sous-évalué avant
 * qu'on le lise.
 */

import type { IgnoreParLaProvisionIr } from './provisionImpotRevenu';

export const LIBELLE_IGNORE_IR: Readonly<Record<IgnoreParLaProvisionIr, string>> = {
  encaissements_a_venir_non_fournis:
    'Assiette limitée à l’encaissé constaté : montant plancher, il montera.',
  aucun_encaissement_attendu:
    'Aucune facture à encaisser ni revenu planifié d’ici décembre : l’impôt est estimé sur l’encaissé seul et montera si d’autres recettes arrivent.',
  autres_revenus_foyer_non_renseignes:
    'Autres revenus du foyer non renseignés, comptés pour zéro : impôt sous-estimé.',
  versement_per_non_renseigne: 'Versement PER non renseigné, donc non déduit : impôt au plus haut.',
  plafonnement_quotient_familial:
    'Plafonnement du quotient familial non appliqué : impôt réel plus élevé.',
  situation_familiale_non_renseignee:
    'Mariage ou Pacs non renseigné : la décote est prise au cas le moins favorable.',
  reductions_et_credits_d_impot: 'Ni réductions ni crédits d’impôt : impôt réel plus faible.',
  bareme_de_l_annee_non_publie: 'Barème non publié pour cette année : dernier connu repris.'
};
