import type { Euros, Mois } from '../types';
import { euros } from '../types';

/**
 * Où va l'argent disponible, mois après mois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ON PROJETTE LE DISPONIBLE, PAS LE SOLDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * C'est la décision qui rend cette projection honnête, et elle mérite d'être
 * dite.
 *
 * Projeter le SOLDE obligerait à deviner QUAND chaque dette sortira du compte.
 * Or la moitié d'entre elles n'a pas encore de date : les charges dues sur des
 * recettes déjà encaissées mais non déclarées existent, se chiffrent, et
 * l'URSSAF ne les a pas encore appelées. Une courbe de solde qui les
 * ignorerait monterait joliment jusqu'au trimestre où elle s'effondre — et
 * c'est exactement la courbe qui fait se verser de l'argent qu'on doit.
 *
 * Le DISPONIBLE, lui, a déjà retiré toutes les dettes connues, datées ou non.
 * Il part donc du bon niveau, et sa mécanique d'évolution est simple :
 *
 *   • un encaissement de X augmente le solde de X, mais augmente aussi les
 *     provisions de X × taux de charges. Il n'ajoute donc au disponible que
 *     **X × (1 − taux)** — ce que la journée rapporte vraiment ;
 *   • une dépense courante de Y le diminue de Y ;
 *   • une échéance qu'on paie ne le change pas : elle sort du solde ET des
 *     provisions en même temps. C'est ce qui rend cette projection stable là
 *     où une courbe de solde ferait des marches d'escalier trimestrielles.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX SCÉNARIOS, PARCE QUE LA QUESTION EN A DEUX
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Sans versement » dit ce que le compte devient si l'on n'y touche pas.
 * « Avec versement » dit ce qu'il devient si l'on se verse chaque mois le
 * maximum soutenable. Le second seul serait une prescription ; le premier
 * seul ne répondrait pas à la question qu'on se pose vraiment, qui est
 * « combien puis-je me verser sans me mettre en difficulté ? ».
 */

/** Ce qu'un mois futur apporte, et ce qu'il coûte. */
export interface MoisProjete {
  readonly mois: Mois;
  /** Encaissements attendus, avant charges. */
  readonly encaissements: Euros;
  /** Part de ces encaissements qui part en cotisations et impôt. */
  readonly charges: Euros;
  /** Dépenses courantes attendues. Hypothèse, jamais un fait. */
  readonly depenses: Euros;
  /** Disponible à la fin du mois, si l'on ne se verse rien. */
  readonly sansVersement: Euros;
  /** Disponible à la fin du mois, versement mensuel soutenable déduit. */
  readonly avecVersement: Euros;
  /** Total versé depuis le début de la projection, dans ce scénario. */
  readonly verseCumule: Euros;
}

export interface ProjectionSolde {
  /** Le disponible d'aujourd'hui — le point de départ, et un fait. */
  readonly depart: Euros;
  readonly mois: readonly MoisProjete[];
  /**
   * Le versement mensuel le plus élevé qui ne fasse jamais passer le
   * disponible sous la réserve, sur toute la durée projetée.
   */
  readonly versementMensuel: Euros;
  /**
   * Le mois qui limite le versement — celui où la contrainte mord.
   *
   * `null` quand aucun mois ne contraint. Le nommer évite la question
   * « pourquoi si peu ? », qui est la première qu'on se pose.
   */
  readonly moisContraignant: Mois | null;
}

/** Ce qu'on sait d'un mois à venir, avant tout calcul. */
export interface EntreeMois {
  readonly mois: Mois;
  /** Encaissements attendus : factures échues ce mois, revenu prévu au planning. */
  readonly encaissements: Euros;
}

/**
 * Le versement mensuel constant le plus élevé qui tienne la réserve.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MONTANT CONSTANT, ET POURQUOI LE MINIMUM DES CONTRAINTES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Constant, parce qu'on se verse une rémunération et non une part variable :
 * un montant qui change chaque mois n'est pas un revenu, c'est un solde de
 * tout compte, et il ne permet pas de s'organiser.
 *
 * Le minimum, parce qu'une contrainte violée un seul mois suffit. Se verser
 * ce que la moyenne autorise conduit à passer sous la réserve en février pour
 * le rattraper en juin — et à découvrir en février qu'on ne peut pas payer
 * l'URSSAF. Chaque mois `m` impose que le cumul versé, soit `V × (m + 1)`, ne
 * dépasse pas ce qui reste au-dessus de la réserve à ce moment-là.
 *
 * Jamais négatif : on ne se verse pas une dette. Zéro veut alors dire « rien,
 * pour l'instant », et c'est une réponse.
 */
export function versementSoutenable(
  disponiblesCumules: readonly Euros[],
  reserve: Euros
): { readonly montant: Euros; readonly moisLimitant: number | null } {
  let montant = Number.POSITIVE_INFINITY;
  let moisLimitant: number | null = null;

  disponiblesCumules.forEach((dispo, i) => {
    const plafond = (dispo - reserve) / (i + 1);
    if (plafond < montant) {
      montant = plafond;
      moisLimitant = i;
    }
  });

  if (!Number.isFinite(montant) || montant <= 0) {
    return { montant: euros(0), moisLimitant: null };
  }
  return { montant: euros(Math.floor(montant)), moisLimitant };
}

/**
 * Projette le disponible sur les mois fournis.
 *
 * `tauxDeCharges` est la part d'un encaissement qui part en cotisations et
 * impôt. `depensesMensuelles` est l'hypothèse de dépenses courantes — passée
 * en paramètre parce que ce n'est PAS un fait : le modèle ne porte aucune
 * dépense future, et l'appelant doit dire d'où vient son chiffre.
 */
export function projeterDisponible(
  { depart, reserve, entrees, tauxDeCharges, depensesMensuelles }: {
    readonly depart: Euros;
    readonly reserve: Euros;
    readonly entrees: readonly EntreeMois[];
    readonly tauxDeCharges: number;
    readonly depensesMensuelles: Euros;
  }
): ProjectionSolde {
  // Première passe : le disponible cumulé sans se verser quoi que ce soit.
  let courant = depart as number;
  const sansVersement: number[] = [];
  const detail = entrees.map((e) => {
    const charges = e.encaissements * tauxDeCharges;
    courant += e.encaissements - charges - depensesMensuelles;
    sansVersement.push(courant);
    return { entree: e, charges };
  });

  const { montant, moisLimitant } = versementSoutenable(
    sansVersement.map((d) => euros(d)), reserve
  );

  return {
    depart,
    versementMensuel: montant,
    moisContraignant: moisLimitant === null
      ? null
      : entrees[moisLimitant]?.mois ?? null,
    mois: detail.map(({ entree, charges }, i) => ({
      mois: entree.mois,
      encaissements: entree.encaissements,
      charges: euros(Math.round(charges)),
      depenses: depensesMensuelles,
      sansVersement: euros(Math.round(sansVersement[i] ?? 0)),
      avecVersement: euros(Math.round((sansVersement[i] ?? 0) - montant * (i + 1))),
      verseCumule: euros(montant * (i + 1))
    }))
  };
}

/**
 * La moyenne des dépenses courantes d'un historique, ramenée au mois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE HYPOTHÈSE QUI DOIT SAVOIR SE TAIRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le modèle ne porte aucune dépense future : rien ne dit qu'on paiera encore
 * son hébergement le mois prochain. Les ignorer rendrait pourtant la
 * projection OPTIMISTE, et l'optimisme est le sens dangereux de l'erreur sur
 * une trésorerie.
 *
 * On les extrapole donc du passé — mais sous trois mois d'historique, une
 * seule dépense exceptionnelle déforme la moyenne au point de la rendre
 * absurde. `null` dit alors qu'on ne sait pas, et l'écran doit projeter sans
 * dépenses en le disant, plutôt que d'inventer un montant.
 */
export const MOIS_MINIMUM_POUR_MOYENNER = 3;

export function depensesMensuellesMoyennes(
  parMois: readonly Euros[]
): Euros | null {
  if (parMois.length < MOIS_MINIMUM_POUR_MOYENNER) return null;
  return euros(Math.round(parMois.reduce((s, d) => s + d, 0) / parMois.length));
}
