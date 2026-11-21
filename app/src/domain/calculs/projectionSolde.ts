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
  /** Encaissements attendus, avant charges, hors taxes : le chiffre d'affaires. */
  readonly encaissements: Euros;
  /**
   * La TVA qui arrive avec eux, chez un redevable : elle entre sur le compte et
   * n'est pas à soi — le disponible la retire aussitôt, le solde la garde
   * jusqu'à sa déclaration. Zéro en franchise.
   */
  readonly tva: Euros;
  /** La part de `charges` qui est l'impôt sur le revenu au barème (lot 50). */
  readonly impot: Euros;
  /**
   * Le dû que ces encaissements font naître : cotisations et contributions au
   * taux, l'impôt sur le revenu au barème, la TVA encaissée.
   */
  readonly charges: Euros;
  /** Dépenses courantes attendues. Hypothèse, jamais un fait. */
  readonly depenses: Euros;
  /** Disponible à la fin du mois, si l'on ne se verse rien. */
  readonly sansVersement: Euros;
  /** Disponible à la fin du mois, versement mensuel soutenable déduit. */
  readonly avecVersement: Euros;
  /** Total versé depuis le début de la projection, dans ce scénario. */
  readonly verseCumule: Euros;
  /**
   * Ce qui quitte le compte ce mois-ci pour régler le dû — l'URSSAF à la
   * limite de sa déclaration, la TVA à sa CA3, l'impôt à son prélèvement, la
   * CFE en décembre. Zéro quand l'appelant n'a pas daté le dû.
   */
  readonly chargesPayees: Euros;
  /**
   * Le SOLDE du compte à la fin du mois, le versement tenable pris chaque
   * mois — `null` quand l'appelant ne donne pas le solde de départ.
   *
   * ───────────────────────────────────────────────────────────────────────
   * LE DÛ NAÎT À L'ENCAISSEMENT, LE SOLDE BAISSE À L'ÉCHÉANCE
   * ───────────────────────────────────────────────────────────────────────
   *
   * Le disponible retire la charge le jour où l'argent entre ; le solde, lui,
   * ne la perd que le jour où elle quitte le compte. Les deux se rejoignent
   * par construction — solde − dû = disponible, chaque mois —, et c'est ce
   * qui rend la courbe du solde sûre : elle porte les marches que l'URSSAF
   * fait au compte, sans qu'aucune date ne fasse bouger le disponible.
   */
  readonly solde: Euros | null;
  /** Le dû à la fin du mois : celui d'aujourd'hui, plus ce qui naît, moins ce qui sort. */
  readonly du: Euros | null;
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
  /**
   * Le mois où le disponible, versement tenable pris chaque mois, est le plus
   * bas — et ce qu'il vaut alors. C'est lui que la courbe annote : « jusqu'en
   * mai » dit quel mois limite, le point bas dit de combien il passe.
   * `null` sans aucun mois projeté.
   */
  readonly pointBas: { readonly mois: Mois; readonly montant: Euros } | null;
}

/** Ce qu'on sait d'un mois à venir, avant tout calcul. */
export interface EntreeMois {
  readonly mois: Mois;
  /** Encaissements attendus, hors taxes : factures échues ce mois, revenu prévu au planning. */
  readonly encaissements: Euros;
  /** La TVA encaissée avec eux ; zéro, ou absente, en franchise. */
  readonly tva?: Euros;
  /**
   * L'impôt sur le revenu au barème qu'ils font naître (lot 50) — un montant et
   * non un taux : il se lit sur la provision d'impôt de l'année, qui n'est pas
   * proportionnelle d'un mois sur l'autre une fois les acomptes retranchés.
   */
  readonly impot?: Euros;
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
  { depart, reserve, entrees, tauxDeCharges, depensesMensuelles, soldeDepart, chargesPayees }: {
    readonly depart: Euros;
    readonly reserve: Euros;
    readonly entrees: readonly EntreeMois[];
    readonly tauxDeCharges: number;
    readonly depensesMensuelles: Euros;
    /** Le solde du compte aujourd'hui : sans lui, la projection ne dit que le disponible. */
    readonly soldeDepart?: Euros;
    /** Ce qui quitte le compte pour le dû, mois par mois, aligné sur `entrees`. */
    readonly chargesPayees?: readonly Euros[];
  }
): ProjectionSolde {
  // Première passe : le disponible cumulé sans se verser quoi que ce soit.
  let courant = depart as number;
  const sansVersement: number[] = [];
  const detail = entrees.map((e) => {
    // La TVA et l'impôt naissent avec l'encaissement, comme les cotisations :
    // le disponible les retire ce jour-là, le solde à leur échéance.
    const tva = e.tva ?? 0;
    const charges = e.encaissements * tauxDeCharges + (e.impot ?? 0) + tva;
    courant += e.encaissements + tva - charges - depensesMensuelles;
    sansVersement.push(courant);
    return { entree: e, charges };
  });

  const { montant, moisLimitant } = versementSoutenable(
    sansVersement.map((d) => euros(d)), reserve
  );

  /* Le solde suit les mêmes mouvements que le disponible, sauf la charge :
     elle n'en sort qu'à l'échéance. Le dû se déduit des deux, il ne se
     calcule pas une seconde fois. */
  let solde: number | null = soldeDepart ?? null;
  const mois = detail.map(({ entree, charges }, i) => {
    const payees = chargesPayees?.[i] ?? 0;
    const avecVersement = (sansVersement[i] ?? 0) - montant * (i + 1);
    if (solde !== null) solde += entree.encaissements + (entree.tva ?? 0) - payees - depensesMensuelles - montant;
    return {
      mois: entree.mois,
      encaissements: entree.encaissements,
      tva: entree.tva ?? euros(0),
      impot: entree.impot ?? euros(0),
      charges: euros(Math.round(charges)),
      depenses: depensesMensuelles,
      sansVersement: euros(Math.round(sansVersement[i] ?? 0)),
      avecVersement: euros(Math.round(avecVersement)),
      verseCumule: euros(montant * (i + 1)),
      chargesPayees: euros(Math.round(payees)),
      solde: solde === null ? null : euros(Math.round(solde)),
      du: solde === null ? null : euros(Math.round(solde - avecVersement))
    };
  });

  /* Le premier des plus bas : à égalité, c'est le plus proche qui presse. */
  const bas = mois.reduce<MoisProjete | null>(
    (pire, m) => (pire === null || m.avecVersement < pire.avecVersement ? m : pire), null
  );

  return {
    depart,
    versementMensuel: montant,
    moisContraignant: moisLimitant === null
      ? null
      : entrees[moisLimitant]?.mois ?? null,
    pointBas: bas === null ? null : { mois: bas.mois, montant: bas.avecVersement },
    mois
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
