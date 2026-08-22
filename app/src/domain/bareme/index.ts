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
 * Contrôle d'intégrité global : `verifierIntegriteBareme()`, dans
 * `./integrite` — il ne s'exécute qu'en test, et le garder ici alourdissait
 * le paquet de premier rendu.
 */

export {
  ABATTEMENT_ACRE, PERIODES_URSSAF,
  libelleHypothese, periodePour, tauxCotisations, verifierIntegrite as verifierIntegriteUrssaf
} from './urssaf';

export type { PeriodeBareme } from './urssaf';

export {
  PERIODES_ACRE,
  dernierMoisAcre, moisSousAcre, periodeAcrePour, verifierIntegriteAcre
} from './acre';
export type { PeriodeAcre } from './acre';

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
  assujettissementTva, etatAssujettissement, periodeTvaPour, resteAvantFranchise,
  resteAvantMajore, seuilsTva, seuilsTvaPourAnnee, verifierIntegriteTva
} from './tva';
export type {
  DonneesAssujettissementTva, EtatAssujettissementTva, PeriodeTva, SeuilsTva,
  StatutAssujettissementTva
} from './tva';

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

/*
 * LE CONTRÔLE D'INTÉGRITÉ GLOBAL A DÉMÉNAGÉ dans `./integrite`.
 *
 * Il n'a aucun appelant applicatif — il s'exécute en test. Tant qu'il vivait
 * ici, ses `import` traînaient `calculs/facture` et `calculs/des` dans le
 * paquet de PREMIER RENDU, parce qu'un contrôle de test les nommait. Le budget
 * d'entrée l'a signalé en dépassant, et on n'y touche pas : on extrait le
 * module qui n'a rien à faire là.
 */
