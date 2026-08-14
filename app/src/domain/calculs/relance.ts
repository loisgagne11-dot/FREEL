import type { DateISO, Euros } from '../types';
import { euros } from '../types';
import { INDEMNITE_RECOUVREMENT } from './facture';

/**
 * Relancer une facture impayée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE BESOIN QUI N'AVAIT AUCUN REMPLAÇANT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'application savait déjà désigner « précisément celle qu'il faut relancer »
 * — c'est écrit tel quel dans les sélecteurs — et ne proposait rien au bout.
 * La fonction correspondante de l'ancienne version avait été écartée au motif
 * qu'un envoi de courriel suppose un service d'expédition. Le motif répondait à
 * la FORME et pas au besoin : relancer ne demande pas d'envoyer, cela demande
 * de savoir quoi écrire, ce qu'on peut réclamer, et quand on l'a déjà fait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EST DÛ, ET QUE PRESQUE PERSONNE NE RÉCLAME
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Entre professionnels, un retard de paiement ouvre droit de PLEIN DROIT à
 * deux choses distinctes (art. L441-10 du code de commerce) :
 *
 *  1. une **indemnité forfaitaire de 40 €** par facture — un montant fixe, qui
 *     ne dépend ni de la durée du retard ni de la somme ;
 *  2. des **pénalités de retard**, au taux convenu aux conditions de vente.
 *
 * Les deux se cumulent, et aucune n'a besoin d'être réclamée en justice pour
 * être due. Mais elles ne sont exigibles que si la facture les ANNONCE — ce
 * que fait déjà le document émis par cette application.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE TAUX NE S'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le taux de pénalité est celui des conditions de vente. À défaut de stipulation,
 * le code retient le taux de refinancement de la BCE majoré de dix points, avec
 * un plancher à trois fois l'intérêt légal — deux valeurs qui changent chaque
 * semestre et qu'aucune source automatisable ne fournit.
 *
 * Ce module calcule donc les pénalités **à partir du taux qu'on lui donne**, et
 * rend `null` sans lui. Avancer un taux plausible ferait réclamer un montant
 * faux à un client, ce qui est la pire façon de relancer.
 */

/** Ce qui est dû sur une facture en retard, à une date donnée. */
export interface DetteDeRetard {
  /** Jours écoulés depuis l'échéance. Zéro ou négatif si elle n'est pas passée. */
  readonly joursDeRetard: number;
  /** Due de plein droit, par facture, indépendamment de la durée du retard. */
  readonly indemniteForfaitaire: Euros;
  /**
   * Pénalités de retard, ou `null` si le taux n'est pas connu.
   *
   * `null` n'est pas zéro : c'est « je ne peux pas le dire ». Les afficher à
   * zéro ferait croire qu'il n'y a rien à réclamer.
   */
  readonly penalites: Euros | null;
}

/**
 * Nombre de jours entre deux dates ISO, en jours calendaires pleins.
 *
 * Le calcul se fait en UTC : passer par l'heure locale ferait varier le résultat
 * d'un jour selon le fuseau, et une pénalité se compte en jours.
 */
function joursEntre(du: DateISO, au: DateISO): number {
  const a = Date.parse(`${du}T00:00:00Z`);
  const b = Date.parse(`${au}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/**
 * Ce qu'on peut réclamer sur une facture échue.
 *
 * `tauxAnnuel` est le taux de pénalité des conditions de vente, en part (0,12
 * pour 12 %). `null` quand il n'est pas renseigné.
 *
 * Les pénalités courent **par jour de retard** sur le montant de la facture, en
 * proportion de l'année. On retient 365 jours : c'est la base usuelle des
 * intérêts commerciaux, et l'écart avec une année bissextile est inférieur à ce
 * que l'arrondi à l'euro absorbe.
 */
export function detteDeRetard(
  montant: Euros,
  echeanceLe: DateISO,
  aujourdhui: DateISO,
  tauxAnnuel: number | null
): DetteDeRetard {
  const joursDeRetard = Math.max(0, joursEntre(echeanceLe, aujourdhui));

  // Pas de retard, rien n'est dû : l'indemnité elle-même suppose l'échéance
  // passée. L'annoncer avant serait une menace, pas une information.
  if (joursDeRetard <= 0) {
    return { joursDeRetard: 0, indemniteForfaitaire: euros(0), penalites: null };
  }

  return {
    joursDeRetard,
    indemniteForfaitaire: INDEMNITE_RECOUVREMENT.valeur,
    penalites: tauxAnnuel === null
      ? null
      : euros(Math.round(montant * tauxAnnuel * joursDeRetard / 365))
  };
}

/** Une relance déjà envoyée, telle qu'on la conserve. */
export interface RelanceEnvoyee {
  readonly le: DateISO;
}

/**
 * Le ton d'une relance, déduit de ce qui a déjà été fait.
 *
 * Trois degrés, parce que trois messages différents. Écrire la mise en demeure
 * en premier brûle la relation commerciale ; répéter un rappel courtois au
 * cinquième mois n'obtient rien et fait perdre le bénéfice du temps écoulé.
 */
export type TonRelance = 'rappel' | 'ferme' | 'mise_en_demeure';

/**
 * Le ton à employer.
 *
 * Il dépend du NOMBRE de relances déjà faites, pas de la durée du retard : un
 * client qui n'a jamais été relancé mérite un rappel, même à trois mois — il
 * arrive qu'une facture n'ait simplement jamais été reçue.
 */
export function tonRelance(relancesFaites: number): TonRelance {
  if (relancesFaites === 0) return 'rappel';
  if (relancesFaites === 1) return 'ferme';
  return 'mise_en_demeure';
}

/** De quoi rédiger la relance : ce que le texte doit dire, et sous quel ton. */
export interface BrouillonRelance {
  readonly ton: TonRelance;
  readonly objet: string;
  readonly corps: string;
}

/**
 * Rédige la relance.
 *
 * Le texte reste à relire et à envoyer par l'utilisateur, depuis sa propre
 * messagerie : l'application ne dispose d'aucun service d'expédition, et un
 * envoi qu'elle ne saurait ni tracer ni prouver ne vaudrait rien le jour où il
 * faudrait démontrer qu'on a relancé.
 *
 * Les montants réclamés ne sont mentionnés QUE s'ils sont connus. Une mise en
 * demeure qui réclamerait des pénalités calculées sur un taux supposé serait
 * contestable — et c'est précisément le document qu'on ne veut pas fragiliser.
 */
export function redigerRelance(
  { numero, montant, echeanceLe, dette, relancesFaites }: {
    readonly numero: string;
    readonly montant: Euros;
    readonly echeanceLe: DateISO;
    readonly dette: DetteDeRetard;
    readonly relancesFaites: number;
  }
): BrouillonRelance {
  const ton = tonRelance(relancesFaites);
  const somme = `${montant.toLocaleString('fr-FR')} €`;
  const echeance = new Date(`${echeanceLe}T00:00:00Z`)
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  const objets: Readonly<Record<TonRelance, string>> = {
    rappel: `Rappel — facture ${numero} échue`,
    ferme: `Relance — facture ${numero} impayée depuis ${dette.joursDeRetard} jours`,
    mise_en_demeure: `Mise en demeure — facture ${numero}`
  };

  const ouvertures: Readonly<Record<TonRelance, string>> = {
    rappel:
      `Bonjour,\n\nSauf erreur de ma part, la facture ${numero} d'un montant de `
      + `${somme}, échue le ${echeance}, n'a pas encore été réglée.\n\n`
      + 'Il est possible qu\'elle vous ait échappé ou qu\'un règlement soit déjà '
      + 'parti : dans ce cas, merci de ne pas tenir compte de ce message.',
    ferme:
      `Bonjour,\n\nJe reviens vers vous au sujet de la facture ${numero} d'un montant `
      + `de ${somme}, échue le ${echeance} et toujours impayée à ce jour, soit `
      + `${dette.joursDeRetard} jours de retard.\n\n`
      + 'Je vous remercie de bien vouloir procéder à son règlement sous huitaine.',
    mise_en_demeure:
      `Madame, Monsieur,\n\nMalgré mes relances précédentes, la facture ${numero} d'un `
      + `montant de ${somme}, échue le ${echeance}, demeure impayée — soit `
      + `${dette.joursDeRetard} jours de retard.\n\n`
      + 'Par la présente, je vous mets en demeure de procéder à son règlement '
      + 'sous quinzaine à compter de la réception de ce courrier.'
  };

  // Ce qui est dû de plein droit, et qui n'est presque jamais réclamé. On ne
  // l'annonce qu'à partir de la relance ferme : le mentionner dans un premier
  // rappel courtois donnerait à celui-ci un ton qu'il n'a pas.
  const droits = ton === 'rappel'
    ? ''
    : `\n\nJe vous rappelle qu'en application des articles L441-10 et L441-11 du `
      + `code de commerce, ce retard ouvre droit à une indemnité forfaitaire de `
      + `${dette.indemniteForfaitaire} € pour frais de recouvrement`
      + (dette.penalites === null
        ? ', ainsi qu\'aux pénalités de retard prévues à mes conditions de vente.'
        : `, ainsi qu'à des pénalités de retard s'élevant à ce jour à `
          + `${dette.penalites.toLocaleString('fr-FR')} €.`);

  return {
    ton,
    objet: objets[ton],
    corps: `${ouvertures[ton]}${droits}\n\nBien cordialement,`
  };
}
