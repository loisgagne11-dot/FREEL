/**
 * Provision d'impôt sur le revenu : ce que l'année va coûter, et ce qu'il
 * reste à mettre de côté.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE N'EST PAS L'ACOMPTE DE PRÉLÈVEMENT À LA SOURCE, ET LA DIFFÉRENCE EST TOUT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `bareme/impot.ts` interdit — et continue d'interdire — de RECONSTITUER
 * l'acompte de PAS : la DGFiP le notifie, l'utilisateur le saisit depuis son
 * avis, et le recalculer produisait une double imposition (anomalie E de
 * l'audit). Ce module ne le recalcule pas.
 *
 * Ce qu'il calcule est d'une autre nature :
 *
 *   · l'acompte de PAS est un FAIT — un avis reçu, une date, un montant.
 *     Il vit dans les échéances, donc au volet 1 des provisions ;
 *   · cette provision-ci est une ESTIMATION de ce que l'année va coûter,
 *     dû mais pas encore appelé, donc au volet 2.
 *
 * Les deux cohabitent À UNE CONDITION, et elle est appliquée plus bas : la
 * provision RETRANCHE les acomptes déjà saisis, payés ou non. Sans cette
 * soustraction, la double imposition revient sous un autre nom.
 *
 * Pourquoi « payés ou non » et pas seulement « payés » : le volet 1 reprend
 * déjà les acomptes non payés. La somme des deux volets vaut donc
 * `impôt de l'année − acomptes déjà décaissés`, ce qui est exactement la
 * dette d'impôt restante. Ne retrancher que les acomptes payés compterait
 * deux fois ceux qui sont appelés et pas encore réglés.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE PROVISION FAUSSE EST PIRE QU'UNE ABSENCE DE PROVISION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle fait se verser de l'argent qu'on doit. Le module refuse donc, avec un
 * motif lisible, plutôt que de rendre un montant, quand le barème de l'année
 * se dérobe ou quand le nombre de parts manque. Et quand il calcule, il porte
 * la liste de CE QU'IL IGNORE, pour que l'écran ne présente jamais le montant
 * comme un résultat fini.
 */

import {
  type Euros, type Mois, type Resolution, type TypeActivite,
  euros
} from '../types';
import { revenuApresAbattement } from '../bareme/abattement';
import { irParTranches, tranchesIR } from '../bareme/impot';

/** Les faits du foyer fiscal. `null` veut dire « pas renseigné », jamais zéro. */
export interface FoyerFiscalImpot {
  readonly partsFiscales: number | null;
  readonly autresRevenusFoyer: Euros | null;
  readonly versementPerDeductible: Euros | null;
}

export interface EntreeProvisionIr {
  readonly annee: number;
  /** Le mois d'où l'on regarde : il donne le barème et les mois restants. */
  readonly moisCourant: Mois;
  readonly typeActivite: TypeActivite;
  /** Chiffre d'affaires encaissé CONSTATÉ depuis le 1er janvier. Un fait. */
  readonly caEncaisseConstate: Euros;
  /**
   * Encaissements ATTENDUS sur le reste de l'année, ou `null` quand
   * l'appelant n'est pas en mesure de les fournir.
   *
   * Ils ne se fabriquent pas ici : ils viennent du pipeline construit une
   * seule fois par `etatProjection` — factures émises non réglées, revenu
   * prévu au planning. Une seconde projection du même chiffre d'affaires
   * finirait par ne pas tomber d'accord avec la première, et personne ne
   * saurait alors laquelle fait foi.
   */
  readonly caAttendu: Euros | null;
  readonly foyer: FoyerFiscalImpot;
  /**
   * Acomptes de prélèvement à la source déjà saisis pour l'année, payés ou
   * non. Un fait, pris des échéances de nature `impot`.
   */
  readonly acomptesPasSaisis: Euros;
}

/**
 * Ce que ce montant NE contient PAS, énuméré pour que l'écran puisse l'écrire.
 *
 * Une provision d'impôt qui ne dit pas ce qu'elle ignore se lit comme « ce
 * que je dois », et on se verse le reste.
 */
export type IgnoreParLaProvisionIr =
  | 'encaissements_a_venir_non_fournis'
  | 'autres_revenus_foyer_non_renseignes'
  | 'versement_per_non_renseigne'
  | 'plafonnement_quotient_familial'
  | 'decote_et_reductions_d_impot'
  | 'bareme_de_l_annee_non_publie';

/** Le nom de chaque réserve, dit une seule fois pour tous les écrans. */
export const LIBELLE_IGNORE_IR: Readonly<Record<IgnoreParLaProvisionIr, string>> = {
  encaissements_a_venir_non_fournis:
    'Calculé sur le chiffre d’affaires déjà encaissé seulement : les encaissements '
    + 'attendus d’ici la fin de l’année ne sont pas dans l’assiette. Le montant est un '
    + 'plancher, il montera.',
  autres_revenus_foyer_non_renseignes:
    'Les autres revenus imposables du foyer ne sont pas renseignés : ils sont comptés '
    + 'pour zéro, donc la tranche retenue est trop basse et l’impôt sous-estimé.',
  versement_per_non_renseigne:
    'Aucun versement PER renseigné : il n’est pas déduit. L’impôt est donc au plus haut.',
  plafonnement_quotient_familial:
    'Le plafonnement de l’avantage du quotient familial n’est pas appliqué : au-delà '
    + 'd’un certain revenu, l’impôt réel est plus élevé.',
  decote_et_reductions_d_impot:
    'Ni décote, ni réductions ou crédits d’impôt : l’impôt réel peut être plus faible.',
  bareme_de_l_annee_non_publie:
    'Le barème de l’impôt n’est pas publié pour cette année : celui de la dernière '
    + 'année connue est repris, à titre de prévision.'
};

export interface ProvisionImpotRevenu {
  readonly annee: number;
  /** Le chiffre d'affaires retenu : constaté, plus l'attendu s'il est fourni. */
  readonly assiette: Euros;
  /** L'assiette après abattement forfaitaire : le revenu imposable du micro. */
  readonly revenuImposableMicro: Euros;
  /** Micro + autres revenus du foyer − versement PER. */
  readonly revenuImposableFoyer: Euros;
  /** Impôt du foyer entier, quotient familial appliqué. */
  readonly impotFoyer: Euros;
  /** La part de cet impôt qui revient au micro : c'est elle qu'on provisionne. */
  readonly impotMicro: Euros;
  readonly acomptesPasSaisis: Euros;
  /** Ce qui reste dû après les acomptes déjà saisis. Jamais négatif. */
  readonly resteAProvisionner: Euros;
  /** Mois restants de l'année, mois courant inclus. */
  readonly moisRestants: number;
  /** Le rythme de mise de côté conseillé, ou `null` si l'année est finie. */
  readonly parMoisRestant: Euros | null;
  readonly ignore: readonly IgnoreParLaProvisionIr[];
}

/**
 * L'impôt sur le revenu de l'année, et ce qu'il reste à provisionner.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE ABSENCE DE PIPELINE NE FAIT PAS REFUSER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le refus serait le réflexe du projet, et il serait faux ici : sans montant,
 * la ligne « impôt » du volet 2 retombe à ZÉRO — l'état exact qu'on répare,
 * et le sens dangereux de l'erreur. Calculé sur le seul encaissé constaté, le
 * montant reste un PLANCHER : c'est l'impôt dû sur de l'argent déjà reçu, et
 * il ne peut que monter quand le reste de l'année s'ajoute. Le manque est
 * porté par `ignore`, donc dit à l'écran.
 *
 * Les parts, elles, font refuser : sans elles, aucun quotient familial ne
 * peut être formé, et en supposer une seule surestimerait l'impôt du simple
 * au double pour un foyer de trois parts.
 */
export function provisionImpotRevenu(
  entree: EntreeProvisionIr
): Resolution<ProvisionImpotRevenu> {
  const { partsFiscales, autresRevenusFoyer, versementPerDeductible } = entree.foyer;

  if (partsFiscales === null || partsFiscales <= 0) {
    return {
      statut: 'refuse',
      motif: 'Nombre de parts fiscales non renseigné : l’impôt sur le revenu ne peut pas être '
        + 'estimé sans quotient familial. Renseignez-le dans Config — une part supposée '
        + 'surestimerait l’impôt d’un foyer qui en compte plusieurs.'
    };
  }

  const tranches = tranchesIR(entree.moisCourant);
  if (tranches.statut === 'refuse') return tranches;

  const assiette = euros(entree.caEncaisseConstate + (entree.caAttendu ?? 0));
  const apresAbattement = revenuApresAbattement(assiette, entree.moisCourant, entree.typeActivite);
  if (apresAbattement.statut === 'refuse') return apresAbattement;

  const autres = autresRevenusFoyer ?? 0;
  const per = versementPerDeductible ?? 0;
  const revenuMicro = apresAbattement.valeur;
  const revenuFoyer = euros(Math.max(0, revenuMicro + autres - per));

  // Quotient familial : le barème s'applique à une part, le résultat se
  // remultiplie. L'appliquer au revenu entier ferait payer la tranche haute
  // à un foyer qui la divise en plusieurs parts.
  const impotFoyer = euros(irParTranches(euros(revenuFoyer / partsFiscales), tranches.valeur) * partsFiscales);

  // La quote-part du micro, au prorata des revenus qui composent l'assiette
  // AVANT déduction PER : le PER profite au foyer entier, l'imputer au seul
  // micro lui attribuerait un avantage qu'il ne porte pas seul.
  const totalRevenus = revenuMicro + autres;
  const quotePart = totalRevenus > 0 ? revenuMicro / totalRevenus : 0;
  const impotMicro = euros(impotFoyer * quotePart);

  const resteAProvisionner = euros(Math.max(0, impotMicro - entree.acomptesPasSaisis));
  const moisRestants = Math.max(0, 12 - Number(entree.moisCourant.slice(5, 7)) + 1);

  const ignore: IgnoreParLaProvisionIr[] = [];
  if (entree.caAttendu === null) ignore.push('encaissements_a_venir_non_fournis');
  if (autresRevenusFoyer === null) ignore.push('autres_revenus_foyer_non_renseignes');
  if (versementPerDeductible === null) ignore.push('versement_per_non_renseigne');
  ignore.push('plafonnement_quotient_familial', 'decote_et_reductions_d_impot');
  if (tranches.statut === 'hypothese') ignore.push('bareme_de_l_annee_non_publie');

  const valeur: ProvisionImpotRevenu = {
    annee: entree.annee,
    assiette,
    revenuImposableMicro: revenuMicro,
    revenuImposableFoyer: revenuFoyer,
    impotFoyer,
    impotMicro,
    acomptesPasSaisis: entree.acomptesPasSaisis,
    resteAProvisionner,
    moisRestants,
    parMoisRestant: moisRestants > 0 ? euros(resteAProvisionner / moisRestants) : null,
    ignore
  };

  // La résolution la plus prudente des deux composantes : une hypothèse sur
  // le barème ou sur l'abattement rend l'ensemble une hypothèse.
  if (tranches.statut === 'publie' && apresAbattement.statut === 'publie') {
    return {
      statut: 'publie', valeur,
      source: `${tranches.source} + ${apresAbattement.source}`, verifieLe: tranches.verifieLe
    };
  }
  const depuis = tranches.statut === 'hypothese'
    ? tranches.depuis
    : (apresAbattement as Extract<typeof apresAbattement, { statut: 'hypothese' }>).depuis;
  return {
    statut: 'hypothese', valeur,
    source: `${tranches.source} + ${apresAbattement.source}`,
    verifieLe: tranches.verifieLe,
    depuis
  };
}
