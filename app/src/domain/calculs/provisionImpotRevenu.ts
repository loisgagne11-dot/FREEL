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
import {
  baremeIR, impotDuFoyer, situationDecote, situationDecoteDecisive, surcroitDImpot
} from '../bareme/impot';

/** Les faits du foyer fiscal. `null` veut dire « pas renseigné », jamais zéro. */
export interface FoyerFiscalImpot {
  readonly partsFiscales: number | null;
  readonly autresRevenusFoyer: Euros | null;
  readonly versementPerDeductible: Euros | null;
  /**
   * Marié ou pacsé, soumis à imposition commune — ou `null`, pas renseigné.
   * Facultatif pour l'appelant : il ne sert qu'à la décote.
   */
  readonly impositionCommune?: boolean | null;
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
  /**
   * L'année est terminée : rien ne peut plus s'y ajouter. Sans ce drapeau, le
   * solde de l'année précédente portait « l'impôt montera si d'autres
   * recettes arrivent » — faux pour une année close.
   */
  readonly anneeClose?: boolean;
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
  | 'aucun_encaissement_attendu'
  | 'autres_revenus_foyer_non_renseignes'
  | 'versement_per_non_renseigne'
  | 'plafonnement_quotient_familial'
  | 'situation_familiale_non_renseignee'
  | 'reductions_et_credits_d_impot'
  | 'bareme_de_l_annee_non_publie';

export interface ProvisionImpotRevenu {
  readonly annee: number;
  /** Le chiffre d'affaires retenu : constaté, plus l'attendu s'il est fourni. */
  readonly assiette: Euros;
  /**
   * Le chiffre d'affaires de l'année PROJETÉE : encaissé constaté plus
   * encaissements attendus d'ici décembre. C'est l'assiette, nommée pour ce
   * que l'écran en dit.
   */
  readonly caProjete: Euros;
  /** L'assiette après abattement forfaitaire : le revenu imposable du micro. */
  readonly revenuImposableMicro: Euros;
  /** Micro + autres revenus du foyer − versement PER. */
  readonly revenuImposableFoyer: Euros;
  /** Impôt du foyer entier, quotient familial appliqué. */
  readonly impotFoyer: Euros;
  /** Ce que l'activité ajoute à cet impôt (avec − sans elle), sur l'année projetée. */
  readonly impotMicro: Euros;
  /** Le même montant, sous le nom que lit la règle : l'impôt de l'année PROJETÉE. */
  readonly impotAnneeProjetee: Euros;
  /**
   * Part du chiffre d'affaires projeté déjà entrée sur le compte, de 0 à 1 ;
   * 1 quand l'assiette est nulle. C'est elle qui tient la provision à ce qui
   * est entré, sans appliquer à un solde de juin l'impôt d'un argent de
   * décembre.
   */
  readonly partEncaissee: number;
  readonly acomptesPasSaisis: Euros;
  /**
   * Ce qu'il faut avoir mis de côté AUJOURD'HUI :
   * `impôt de l'année projetée × part encaissée − acomptes`, jamais négatif.
   */
  readonly resteAProvisionner: Euros;
  /** Mois restants de l'année, mois courant inclus. */
  readonly moisRestants: number;
  /**
   * Ce qu'il restera à mettre de côté au fil des encaissements À VENIR :
   * `impôt de l'année − acomptes − déjà à mettre de côté`, jamais négatif.
   * Ce n'est pas un montant dû aujourd'hui, et il ne doit pas se lire comme tel.
   */
  readonly resteSurEncaissementsAVenir: Euros;
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
 * et le sens dangereux de l'erreur. Sans encaissement attendu (`null` ou 0),
 * l'impôt de l'année projetée est celui de l'encaissé seul, et la part
 * encaissée vaut 1 : le montant reste un PLANCHER, qui monte si d'autres
 * recettes arrivent. Le manque est porté par `ignore`, donc dit à l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AU TAUX DE L'ANNÉE, PAS AU TAUX DU SOLDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Contre-exemple qui a motivé la règle : 30 000 € encaissés au 30 juin à
 * rythme constant, une part, aucun autre revenu. Calculé sur l'encaissé seul,
 * l'impôt tombait à 413 € (le taux moyen d'un revenu de demi-année) alors que
 * l'année entière coûtera environ 5 080 €, dont environ 2 520 € pour ce qui est
 * déjà entré : le versable était surévalué de 2 100 € puis s'effondrait au
 * second semestre. On provisionne donc `impôt de l'année projetée × part déjà
 * encaissée` : à rythme constant c'est le prorata du temps, avec des
 * encaissements irréguliers cela suit l'argent reçu, et au 31 décembre c'est
 * l'impôt entier. Les acomptes se retranchent ENSUITE, sur le total : leur
 * appliquer la part les ferait compter deux fois à moitié.
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
      motif: 'Impôt sur le revenu non provisionné : le nombre de parts fiscales n’est pas '
        + 'renseigné (Config). Une part supposée surestimerait l’impôt d’un foyer qui en '
        + 'compte plusieurs.'
    };
  }

  const bareme = baremeIR(entree.moisCourant);
  if (bareme.statut === 'refuse') return bareme;

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
  const { tranches } = bareme.valeur;
  const decoteFoyer = {
    parametres: bareme.valeur.decote,
    situation: situationDecote(partsFiscales, entree.foyer.impositionCommune ?? null)
  };
  const impotFoyer = impotDuFoyer(revenuFoyer, partsFiscales, tranches, decoteFoyer);

  // Ce que l'activité AJOUTE à l'impôt du foyer, pas sa quote-part au taux
  // moyen : voir `surcroitDImpot`, la même fonction que le comparateur.
  const impotMicro = surcroitDImpot(revenuMicro, autres, per, partsFiscales, tranches, decoteFoyer);

  // Assiette nulle : rien n'est entré ni attendu, la part est sans objet et
  // vaut 1 plutôt qu'une division par zéro.
  const partEncaissee = assiette > 0 ? entree.caEncaisseConstate / assiette : 1;
  const resteAProvisionner = euros(
    Math.max(0, impotMicro * partEncaissee - entree.acomptesPasSaisis)
  );
  const resteSurEncaissementsAVenir = euros(
    Math.max(0, impotMicro - entree.acomptesPasSaisis - resteAProvisionner)
  );
  const moisRestants = Math.max(0, 12 - Number(entree.moisCourant.slice(5, 7)) + 1);

  const ignore: IgnoreParLaProvisionIr[] = [];
  if (entree.caAttendu === null) ignore.push('encaissements_a_venir_non_fournis');
  else if (entree.caAttendu === 0 && entree.anneeClose !== true) ignore.push('aucun_encaissement_attendu');
  if (autresRevenusFoyer === null) ignore.push('autres_revenus_foyer_non_renseignes');
  if (versementPerDeductible === null) ignore.push('versement_per_non_renseigne');
  if (situationDecoteDecisive(revenuMicro, autres, per, partsFiscales, tranches, decoteFoyer)) {
    ignore.push('situation_familiale_non_renseignee');
  }
  ignore.push('plafonnement_quotient_familial', 'reductions_et_credits_d_impot');
  if (bareme.statut === 'hypothese') ignore.push('bareme_de_l_annee_non_publie');

  const valeur: ProvisionImpotRevenu = {
    annee: entree.annee,
    assiette,
    caProjete: assiette,
    revenuImposableMicro: revenuMicro,
    revenuImposableFoyer: revenuFoyer,
    impotFoyer,
    impotMicro,
    impotAnneeProjetee: impotMicro,
    partEncaissee,
    acomptesPasSaisis: entree.acomptesPasSaisis,
    resteAProvisionner,
    moisRestants,
    resteSurEncaissementsAVenir,
    ignore
  };

  // La résolution la plus prudente des composantes : une hypothèse sur le
  // barème ou sur l'abattement rend l'ensemble une hypothèse. Les
  // encaissements attendus en sont une aussi : factures non réglées et
  // planning sont des promesses, pas des faits. Sans eux (`null` ou 0), la
  // provision ne repose que sur du constaté et reste `publie`.
  const pipelineContribue = entree.caAttendu !== null && entree.caAttendu > 0;
  if (pipelineContribue) {
    return {
      statut: 'hypothese', valeur,
      source: `${bareme.source} + ${apresAbattement.source} ; encaissements attendus : factures émises et planning`,
      verifieLe: bareme.verifieLe,
      depuis: bareme.statut === 'hypothese'
        ? bareme.depuis
        : apresAbattement.statut === 'hypothese' ? apresAbattement.depuis : entree.moisCourant
    };
  }
  if (bareme.statut === 'publie' && apresAbattement.statut === 'publie') {
    return {
      statut: 'publie', valeur,
      source: `${bareme.source} + ${apresAbattement.source}`, verifieLe: bareme.verifieLe
    };
  }
  const depuis = bareme.statut === 'hypothese'
    ? bareme.depuis
    : (apresAbattement as Extract<typeof apresAbattement, { statut: 'hypothese' }>).depuis;
  return {
    statut: 'hypothese', valeur,
    source: `${bareme.source} + ${apresAbattement.source}`,
    verifieLe: bareme.verifieLe,
    depuis
  };
}
