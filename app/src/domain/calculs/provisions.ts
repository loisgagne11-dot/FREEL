/**
 * Provisions : la somme à garder de côté pour honorer ce qui est dû.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX VOLETS, ET POURQUOI C'EST LE POINT LE PLUS DÉLICAT DU DOMAINE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'application précédente calculait `provisions()` comme la somme de TOUTES
 * les échéances, y compris celles déjà payées. Le commentaire du code disait
 * l'inverse de ce que faisait le code. Conséquence : l'argent déjà sorti du
 * compte était compté une seconde fois, et `dispo()` — le chiffre le plus
 * important de l'application — était faux.
 *
 * La correction évidente est d'exclure les échéances payées. Elle est juste,
 * mais elle est INCOMPLÈTE, et s'arrêter là recrée le problème inverse :
 *
 *   La dette sociale et fiscale naît à l'ENCAISSEMENT d'une recette, pas à
 *   l'émission d'une échéance par l'URSSAF.
 *
 * Autrement dit : entre le moment où l'argent d'un client arrive et le moment
 * où l'URSSAF émet l'appel du trimestre, la dette existe déjà — elle n'est
 * simplement pas encore matérialisée par une échéance. Ne provisionner que
 * les échéances émises revient à croire, en milieu de trimestre, qu'on peut
 * se verser de l'argent qui est déjà dû. L'erreur grandit tout au long du
 * trimestre et culmine juste avant la déclaration.
 *
 * D'où les deux volets :
 *
 *   VOLET 1 — dettes constatées : échéances émises et non encore payées.
 *   VOLET 2 — charges à provisionner : cotisations et impôt dus sur les
 *             recettes déjà encaissées mais dont la période n'est pas encore
 *             déclarée.
 *
 * Les deux volets sont EXCLUSIFS l'un de l'autre par construction : une fois
 * une période déclarée, ses recettes quittent le volet 2 et la dette
 * correspondante apparaît en volet 1 sous forme d'échéance. C'est le fait
 * « période déclarée » qui opère la bascule, et c'est pour cela qu'il est
 * indispensable — sans lui, on ne peut pas savoir où s'arrête le volet 2 sans
 * compter deux fois.
 */

import {
  type DateISO, type Euros, type Mois, type Resolution, type TypeActivite,
  euros, moisDe
} from '../types';
import { type PeriodeBareme, tauxCotisations } from '../bareme/urssaf';

/** Nature d'une somme due. Sert à expliquer un montant, jamais à le calculer. */
export type NatureDette = 'urssaf' | 'tva' | 'impot' | 'cfe' | 'cfp';

/** Une échéance émise : un appel de cotisations, un avis d'impôt, la CFE… */
export interface Echeance {
  readonly id: string;
  readonly nature: NatureDette;
  readonly montant: Euros;
  /** Date à laquelle le paiement est attendu. */
  readonly echeanceLe: DateISO;
  /**
   * Date à laquelle l'argent a QUITTÉ le compte, ou `null` tant qu'il ne l'a
   * pas fait.
   *
   * ───────────────────────────────────────────────────────────────────────
   * UNE DATE, PAS UN BOOLÉEN
   * ───────────────────────────────────────────────────────────────────────
   *
   * La première version portait `payee: boolean`. C'était exactement le défaut
   * reproché à l'ancienne application sur les factures : un statut qu'aucune
   * écriture ne prouve. On exige une date et un mode de règlement pour
   * encaisser une recette ; accepter une case à cocher pour une échéance était
   * incohérent.
   *
   * La date sert à trois choses qu'un booléen ne peut pas rendre : rapprocher
   * le paiement du relevé bancaire, savoir de quel mois la sortie relève, et
   * constater un règlement en retard après coup.
   *
   * Une échéance payée n'est plus une provision : le solde bancaire la reflète
   * déjà.
   */
  readonly payeeLe: DateISO | null;
  /**
   * Montant réellement débité, quand il diffère de celui appelé.
   *
   * Un échéancier annonce un montant ; ce qui part du compte peut différer —
   * régularisation de fin de trimestre, changement de taux, majoration de
   * retard. `null` quand les deux coïncident, ce qui est le cas ordinaire.
   *
   * L'écart n'est pas une erreur à corriger mais une information à garder :
   * c'est lui qui explique un solde qui ne tombe pas juste.
   */
  readonly montantPaye: Euros | null;
}

/** Une échéance est payée dès qu'une date de paiement existe. */
export const estPayee = (e: Echeance): boolean => e.payeeLe !== null;

/** Une recette encaissée. Le fait générateur de la dette sociale. */
export interface RecetteEncaissee {
  readonly id: string;
  readonly montant: Euros;
  /** Date d'ENCAISSEMENT, pas de facturation. C'est elle qui compte. */
  readonly encaisseeLe: DateISO;
}

/**
 * Périodes dont la déclaration a été faite.
 *
 * Ce fait n'existait nulle part dans l'ancienne application, et c'est
 * précisément ce qui rendait le volet 2 incalculable. Une période déclarée
 * voit ses recettes sortir du volet 2 : leur dette est désormais matérialisée
 * par une échéance, donc portée par le volet 1.
 */
export interface PeriodesDeclarees {
  /** Les mois déjà déclarés, au format 'YYYY-MM'. */
  readonly mois: readonly Mois[];
}

export const estDeclare = (p: PeriodesDeclarees, m: Mois): boolean => p.mois.includes(m);

export interface ContexteProvisions {
  readonly typeActivite: TypeActivite;
  readonly sousAcreLe: (m: Mois) => boolean;
  /**
   * Le barème de cotisations à appliquer.
   *
   * Passé en paramètre plutôt que lu directement : l'utilisateur peut ajouter
   * une période sans redéploiement (voir `bareme/urssaf`, `fusionnerPeriodes`),
   * et le calcul doit voir cette table-là, pas seulement celle du code.
   * Omis, il retombe sur le barème livré.
   */
  readonly periodesUrssaf?: readonly PeriodeBareme[];
  /**
   * Part de l'impôt et des contributions à provisionner en plus des
   * cotisations sociales, exprimée en ratio du chiffre d'affaires encaissé.
   *
   * Volontairement passée en paramètre plutôt que calculée ici : elle dépend
   * du régime d'imposition (versement libératoire ou barème), qui est un
   * discriminant exclusif traité par le module `bareme/impot`. Ce module-ci
   * ne doit pas avoir d'opinion sur le régime.
   */
  readonly tauxImpotEtContributions: number;
}

/**
 * Ce que le total de provision recouvre, nature par nature.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * « SUR CETTE SOMME, QUELLE CATÉGORIE »
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un total de provision ne dit pas ce qu'il faut en faire. « 6 200 € de côté »
 * et « 4 100 € d'URSSAF, 1 800 € de TVA, 300 € de CFE » ne se pilotent pas
 * pareil : la première formulation ne permet ni de vérifier une provision
 * contre un avis reçu, ni de savoir ce qui se libère après une déclaration.
 *
 * Les deux volets se ventilent différemment, et c'est normal :
 *
 *  - le VOLET 1 se ventile par échéance — chacune porte déjà sa nature ;
 *  - le VOLET 2 se ventile par RÈGLE DE CALCUL, puisqu'aucune échéance
 *    n'existe encore : la part cotisations va en `urssaf`, la part impôt et
 *    contributions en `impot`.
 *
 * La TVA collectée n'apparaît en volet 2 sous aucune forme : elle ne se déduit
 * pas d'un taux appliqué aux recettes, elle se relève sur les factures. Elle
 * n'entre donc dans la ventilation qu'une fois l'échéance émise.
 */
export type VentilationProvisions = Readonly<Record<NatureDette, Euros>>;

/** Les natures, dans l'ordre où on les lit. */
export const NATURES_DETTE: readonly NatureDette[] = ['urssaf', 'tva', 'impot', 'cfe', 'cfp'];

/**
 * Le nom de chaque nature, dit une seule fois.
 *
 * Comme `LIBELLE_STATUT` pour les factures : trois écrans nommaient les mêmes
 * dettes, et rien ne garantissait qu'ils les nomment pareil. Le libellé porte
 * l'interlocuteur autant que la dette — « URSSAF » et « cotisations sociales »
 * sont la même ligne, mais on ne les cherche pas sous le même mot.
 */
export const LIBELLE_NATURE: Readonly<Record<NatureDette, string>> = {
  urssaf: 'URSSAF — cotisations sociales',
  tva: 'TVA à reverser',
  impot: 'Impôt sur le revenu',
  cfe: 'CFE — cotisation foncière',
  cfp: 'CFP — formation professionnelle'
};

const ventilationVide = (): Record<NatureDette, number> =>
  ({ urssaf: 0, tva: 0, impot: 0, cfe: 0, cfp: 0 });

const figer = (v: Record<NatureDette, number>): VentilationProvisions => ({
  urssaf: euros(v.urssaf), tva: euros(v.tva), impot: euros(v.impot),
  cfe: euros(v.cfe), cfp: euros(v.cfp)
});

export interface DetailProvisions {
  /** Échéances émises et non payées. */
  readonly voletConstate: Euros;
  /** Charges dues sur recettes encaissées non encore déclarées. */
  readonly voletAProvisionner: Euros;
  readonly total: Euros;
  /**
   * Le total, ventilé par nature. La somme des parts vaut `total`.
   *
   * Les natures sans montant valent zéro plutôt que d'être absentes : une
   * catégorie qui disparaît de l'écran quand elle tombe à zéro donne à croire
   * qu'elle n'existe pas, alors qu'elle vient d'être soldée.
   */
  readonly parNature: VentilationProvisions;
  /**
   * Recettes encaissées dont le barème ne permet pas de calculer la charge.
   * Non silencieux : le total ci-dessus les EXCLUT, donc il est sous-évalué,
   * et l'appelant doit le dire à l'utilisateur au lieu d'afficher un chiffre
   * qui a l'air complet.
   */
  readonly recettesNonCalculables: readonly { readonly id: string; readonly motif: string }[];
}

/** Volet 1 — les dettes déjà constatées. */
export function voletConstate(echeances: readonly Echeance[]): Euros {
  return euros(
    echeances.reduce((somme, e) => (estPayee(e) ? somme : somme + e.montant), 0)
  );
}

/**
 * Volet 1, ventilé — chaque échéance porte déjà sa nature.
 *
 * Une échéance payée sort de la ventilation comme elle sort du total : le
 * solde bancaire la reflète déjà, et la laisser ferait provisionner deux fois.
 */
export function voletConstateParNature(
  echeances: readonly Echeance[]
): VentilationProvisions {
  const v = ventilationVide();
  for (const e of echeances) {
    if (estPayee(e)) continue;
    v[e.nature] += e.montant;
  }
  return figer(v);
}

/**
 * Volet 2 — les charges à provisionner sur les recettes encaissées dont la
 * période n'est pas encore déclarée.
 *
 * Le taux est résolu au mois d'ENCAISSEMENT de chaque recette, jamais à
 * l'année : le taux de cotisations change en cours d'année (1er juillet 2024
 * et 1er juillet 2026), donc un `CA_annuel × taux` serait faux par
 * construction. Voir `bareme/urssaf.ts`.
 */
export function voletAProvisionner(
  recettes: readonly RecetteEncaissee[],
  declarees: PeriodesDeclarees,
  ctx: ContexteProvisions
): {
  readonly montant: Euros;
  /**
   * La ventilation par RÈGLE DE CALCUL, faute d'échéance à qui la demander :
   * la part cotisations en `urssaf`, la part impôt et contributions en
   * `impot`. Les autres natures restent à zéro — elles n'existent qu'une fois
   * l'appel émis.
   */
  readonly parNature: VentilationProvisions;
  readonly nonCalculables: readonly { readonly id: string; readonly motif: string }[];
} {
  let somme = 0;
  const parNature = ventilationVide();
  const nonCalculables: { id: string; motif: string }[] = [];

  for (const r of recettes) {
    const m = moisDe(r.encaisseeLe);
    // Période déjà déclarée : la dette est passée en volet 1, ne pas la
    // compter deux fois.
    if (estDeclare(declarees, m)) continue;

    const taux: Resolution<number> = tauxCotisations(
      m, ctx.typeActivite, ctx.sousAcreLe(m), ctx.periodesUrssaf
    );
    if (taux.statut === 'refuse') {
      nonCalculables.push({ id: r.id, motif: taux.motif });
      continue;
    }
    somme += r.montant * (taux.valeur + ctx.tauxImpotEtContributions);
    parNature.urssaf += r.montant * taux.valeur;
    parNature.impot += r.montant * ctx.tauxImpotEtContributions;
  }

  return { montant: euros(somme), parNature: figer(parNature), nonCalculables };
}

/** Les deux volets, et leur total. */
export function provisions(
  echeances: readonly Echeance[],
  recettes: readonly RecetteEncaissee[],
  declarees: PeriodesDeclarees,
  ctx: ContexteProvisions
): DetailProvisions {
  const constate = voletConstate(echeances);
  const aProvisionner = voletAProvisionner(recettes, declarees, ctx);
  const ventileConstate = voletConstateParNature(echeances);

  // Les deux ventilations s'additionnent nature par nature. Elles ne peuvent
  // pas se recouvrir : une période déclarée quitte le volet 2 au moment même
  // où son échéance entre au volet 1.
  const parNature = ventilationVide();
  for (const n of NATURES_DETTE) {
    parNature[n] = ventileConstate[n] + aProvisionner.parNature[n];
  }

  return {
    voletConstate: constate,
    voletAProvisionner: aProvisionner.montant,
    total: euros(constate + aProvisionner.montant),
    parNature: figer(parNature),
    recettesNonCalculables: aProvisionner.nonCalculables
  };
}
