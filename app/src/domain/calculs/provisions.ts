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
   * `true` dès que l'argent a quitté le compte. Une échéance payée n'est plus
   * une provision : elle est déjà reflétée dans le solde bancaire.
   */
  readonly payee: boolean;
}

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

export interface DetailProvisions {
  /** Échéances émises et non payées. */
  readonly voletConstate: Euros;
  /** Charges dues sur recettes encaissées non encore déclarées. */
  readonly voletAProvisionner: Euros;
  readonly total: Euros;
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
    echeances.reduce((somme, e) => (e.payee ? somme : somme + e.montant), 0)
  );
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
): { readonly montant: Euros; readonly nonCalculables: readonly { readonly id: string; readonly motif: string }[] } {
  let somme = 0;
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
  }

  return { montant: euros(somme), nonCalculables };
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
  return {
    voletConstate: constate,
    voletAProvisionner: aProvisionner.montant,
    total: euros(constate + aProvisionner.montant),
    recettesNonCalculables: aProvisionner.nonCalculables
  };
}
