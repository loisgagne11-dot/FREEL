/**
 * Barème fiscal — point d'entrée unique.
 *
 * Tout ce qui est officiel et susceptible de changer vit ici, sous forme de
 * données datées par période, jamais de constantes dispersées dans le code.
 * C'est l'invariant n°1 du projet : l'ancienne application portait cinq
 * valeurs concurrentes du taux de cotisations parce que chaque écran gardait
 * la sienne.
 *
 * Trois règles pour toute contribution à ce dossier :
 *
 *  1. Un nouveau taux s'AJOUTE en période. On ne modifie jamais une période
 *     passée : recalculer un trimestre antérieur doit redonner le montant
 *     déclaré à l'époque.
 *  2. Chaque valeur porte sa `source` et sa date `verifieLe`. Une valeur sans
 *     provenance n'entre pas.
 *  3. Une absence se dit. `Resolution<T>` force l'appelant à distinguer une
 *     valeur publiée, une hypothèse de prévision et un refus — plutôt que de
 *     recevoir un nombre dont il ignore la fiabilité.
 *
 * Contrôle d'intégrité global : `verifierIntegriteBareme()`.
 */

export {
  ABATTEMENT_ACRE, PERIODES_URSSAF,
  libelleHypothese, periodePour, tauxCotisations, verifierIntegrite as verifierIntegriteUrssaf
} from './urssaf';

export type { PeriodeBareme } from './urssaf';

export {
  MINIMUM_ABATTEMENT, PERIODES_ABATTEMENT,
  periodeAbattementPour, revenuApresAbattement, tauxAbattement, verifierIntegriteAbattement
} from './abattement';
export type { PeriodeAbattement } from './abattement';

export {
  PERIODES_PLAFONDS,
  depasseLePlafond, periodePlafondPour, plafondMicro, verifierIntegritePlafonds
} from './plafonds';
export type { PeriodePlafond } from './plafonds';

export {
  PERIODES_TVA,
  etatAssujettissement, periodeTvaPour, resteAvantFranchise, resteAvantMajore,
  seuilsTva, verifierIntegriteTva
} from './tva';
export type { EtatAssujettissementTva, PeriodeTva, SeuilsTva } from './tva';

export {
  PERIODES_CFP, PERIODES_IR, PERIODES_VERSEMENT_LIBERATOIRE,
  calculerLigneFiscale, irParTranches, periodeCfpPour, periodeTranchesIRPour,
  periodeVersementLiberatoirePour, tauxCfp, tauxImpotEtContributions,
  tauxVersementLiberatoire, tranchesIR, verifierIntegriteImpot
} from './impot';
export type {
  LigneFiscale, PeriodeCfp, PeriodeIR, PeriodeVersementLiberatoire,
  RegimeImposition, TrancheIR, VersementLiberatoireCalcule
} from './impot';

export {
  ANNEES_CONSERVATION, SEUIL_GLOBALISATION_DETAIL, verifierIntegriteRecettes
} from './recettes';

import { verifierIntegriteAbattement } from './abattement';
import { verifierIntegriteImpot } from './impot';
import { verifierIntegritePlafonds } from './plafonds';
import { verifierIntegriteTva } from './tva';
import { verifierIntegrite as verifierIntegriteUrssafInterne } from './urssaf';
import { verifierIntegriteRecettes as verifierIntegriteRecettesInterne } from './recettes';
import { verifierIntegriteDes as verifierIntegriteDesInterne } from '../calculs/des';
import { verifierIntegriteFacture as verifierIntegriteFactureInterne } from '../calculs/facture';

/**
 * Contrôle d'intégrité de l'ensemble du barème, préfixé par table.
 * Renvoie la liste des anomalies ; vide si tout est sain.
 *
 * À exécuter en test, et utile au moment d'ajouter une période : une table
 * trouée ou qui se chevauche produit des résolutions silencieusement fausses.
 */
export function verifierIntegriteBareme(): readonly string[] {
  return [
    ...verifierIntegriteUrssafInterne().map((a) => `[cotisations] ${a}`),
    ...verifierIntegriteAbattement().map((a) => `[abattement] ${a}`),
    ...verifierIntegritePlafonds().map((a) => `[plafonds] ${a}`),
    ...verifierIntegriteTva().map((a) => `[tva] ${a}`),
    ...verifierIntegriteImpot().map((a) => `[impôt] ${a}`),
    ...verifierIntegriteRecettesInterne().map((a) => `[recettes] ${a}`),
    ...verifierIntegriteDesInterne().map((a) => `[des] ${a}`),
    ...verifierIntegriteFactureInterne().map((a) => `[facture] ${a}`)
  ];
}
