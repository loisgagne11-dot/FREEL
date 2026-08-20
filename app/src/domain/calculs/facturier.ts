import type { DateISO, Euros } from '../types';
import { euros } from '../types';

/**
 * Le suivi des factures — de l'émission au règlement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le livre des recettes ne montre que les ENCAISSEMENTS : c'est sa définition,
 * et il a raison de s'y tenir. Mais celui qui facture a besoin de voir ses
 * factures, toutes, dans un seul endroit — y compris celles qui ne sont pas
 * encore réglées, et celles qui ne le seront jamais.
 *
 * Sans cette vue, l'application demandait de deviner : les brouillons nulle
 * part, les factures en attente dans un écran, les encaissements dans un
 * autre, et aucun moyen de passer de l'un à l'autre. On ne pouvait donc PAS
 * enregistrer un règlement — le geste le plus fréquent de tous.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE STATUT EST DÉRIVÉ, JAMAIS STOCKÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Invariant n°5. L'ancienne application portait un champ `status` que l'on
 * pouvait mettre à « payée » sans date d'encaissement : le registre affichait
 * alors une facture réglée dont aucune écriture ne prouvait le règlement.
 *
 * Ici, le statut se LIT sur les faits : la date d'émission, la date
 * d'encaissement, l'écriture d'annulation. Deux faits ne peuvent pas se
 * contredire, parce qu'il n'y a qu'un seul jeu de faits.
 */

/**
 * Le délai supplétif, faute de client rattaché au carnet.
 *
 * Trente jours : c'est le délai légal à défaut de convention (art. L441-10 du
 * code de commerce). Retenir zéro afficherait « en retard » dès le jour de
 * l'émission, et une étiquette qu'on voit toujours cesse d'être lue.
 */
/* `DELAI_PAIEMENT_DEFAUT` et `echeanceDe` vivaient ici, en nombre de jours.
   Ils sont partis dans `delaiPaiement.ts`, qui sait dire « fin de mois » — ce
   qu'une addition de jours ne peut pas. Deux représentations d'une même notion
   finissent par ne pas tomber d'accord ; il n'en reste qu'une. */

/**
 * Les états d'une facture.
 *
 * `annulation` et `annulee` sont deux choses distinctes : l'avoir lui-même, et
 * la facture qu'il neutralise. Les confondre ferait disparaître l'un des deux
 * de la liste, alors que le registre exige que les DEUX restent visibles.
 */
export type StatutFacture =
  | 'brouillon'
  | 'emise'
  | 'envoyee'
  | 'en_retard'
  | 'encaissee'
  | 'annulee'
  | 'annulation';

/** Ce qu'il faut d'une recette pour la suivre. Volontairement minimal. */
export interface RecetteSuivie {
  readonly id: string;
  readonly clientNom: string;
  readonly libelle: string;
  readonly montant: Euros;
  readonly emiseLe: DateISO | null;
  /** Date d'envoi au client. `undefined` sur les recettes d'avant le schéma 8. */
  readonly envoyeeLe?: DateISO | null;
  readonly encaisseeLe: DateISO | null;
  readonly numero: string;
  readonly annuleEcriture?: string | null;
  /**
   * L'échéance imprimée sur la facture. `undefined` avant le schéma 13.
   *
   * C'est elle qui fait foi. Voir `suivre`.
   */
  readonly echeanceLe?: DateISO | null;
}

export interface FactureSuivie<R extends RecetteSuivie = RecetteSuivie> {
  readonly recette: R;
  readonly statut: StatutFacture;
  /** `null` pour un brouillon : sans émission, il n'y a pas d'exigibilité. */
  readonly echeanceLe: DateISO | null;
  /** Jours de retard, 0 si l'échéance n'est pas dépassée ou sans objet. */
  readonly joursDeRetard: number;
}

/**
 * Range les factures par état.
 *
 * L'ordre des tests n'est pas indifférent : une facture annulée reste au
 * registre, et l'afficher « encaissée » parce qu'elle porte une date
 * d'encaissement donnerait à croire que l'argent est acquis. L'annulation
 * l'emporte donc sur l'encaissement.
 */
/**
 * L'échéance est LUE sur la recette, plus recalculée.
 *
 * Elle est imprimée sur le document envoyé au client : c'est un fait, et le
 * papier ne change pas parce qu'on a renégocié depuis. La recalculer depuis
 * les conditions du client faisait changer de réponse à « cette facture
 * était-elle en retard ? », rétroactivement, et le compteur de retards avec.
 *
 * `secours` ne sert qu'aux recettes qu'aucune migration n'aurait comblées —
 * un bloc écrit à la main, un jeu d'essai. Une facture émise sans échéance
 * serait autrement réputée jamais échue, et les retards les plus anciens
 * seraient précisément ceux qu'on ne verrait pas.
 */
export function suivre<R extends RecetteSuivie>(
  recettes: readonly R[],
  secours: (clientNom: string, emiseLe: DateISO) => DateISO,
  aujourdhui: DateISO
): readonly FactureSuivie<R>[] {
  const annulees = new Set(
    recettes.map((r) => r.annuleEcriture).filter((id): id is string => typeof id === 'string')
  );

  return recettes.map((recette) => {
    const echeanceLe = recette.emiseLe === null
      ? null
      : recette.echeanceLe ?? secours(recette.clientNom, recette.emiseLe);

    const statut = statutDe(recette, annulees, echeanceLe, aujourdhui);
    const enRetard = statut === 'en_retard' && echeanceLe !== null;

    return {
      recette,
      statut,
      echeanceLe,
      joursDeRetard: enRetard ? joursEntre(echeanceLe as DateISO, aujourdhui) : 0
    };
  });
}

function statutDe(
  recette: RecetteSuivie,
  annulees: ReadonlySet<string>,
  echeanceLe: DateISO | null,
  aujourdhui: DateISO
): StatutFacture {
  if (typeof recette.annuleEcriture === 'string') return 'annulation';
  if (annulees.has(recette.id)) return 'annulee';
  if (recette.emiseLe === null) return 'brouillon';
  if (recette.encaisseeLe !== null) return 'encaissee';
  // Strictement supérieur : une facture n'est pas en retard LE jour de son
  // échéance, elle l'est le lendemain.
  if (echeanceLe !== null && aujourdhui > echeanceLe) return 'en_retard';

  // ÉMISE N'EST PAS ENVOYÉE. Le document peut exister, porter son numéro, et
  // dormir dans un dossier — c'est même le cas courant en fin de mois, où l'on
  // établit les factures d'un coup avant de les envoyer. Les confondre fait
  // relancer un client qui n'a jamais rien reçu.
  //
  // Le retard l'emporte sur les deux : une facture échue est en retard qu'on
  // l'ait envoyée ou non, et si on ne l'a pas envoyée, c'est le premier
  // problème à régler.
  return recette.envoyeeLe == null ? 'emise' : 'envoyee';
}

/**
 * Le nombre de jours entre deux dates ISO.
 *
 * Calculé en UTC : en heure locale, un passage à l'heure d'été fait un jour de
 * 23 heures, et la division donnerait 0,96 jour — tronqué à zéro, un retard
 * d'un jour disparaîtrait.
 */
function joursEntre(depuis: DateISO, jusqua: DateISO): number {
  const a = Date.parse(`${depuis}T00:00:00Z`);
  const b = Date.parse(`${jusqua}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Ce qui a été facturé et qui n'est pas rentré. */
export interface Encours {
  /** Émis et non réglé, annulations déduites. */
  readonly resteARentrer: Euros;
  /** La part de ce reste dont l'échéance est passée. */
  readonly enRetard: Euros;
  /**
   * Combien de factures composent ce reste.
   *
   * L'écran écrit « 3 610 € · 2 factures en attente ». Ce nombre se compte ICI
   * et non à l'écran : recompter à côté avec un filtre écrit une seconde fois,
   * c'est se donner deux définitions de « en attente » qui finiront par ne pas
   * s'accorder — un montant sur trois factures et un compte de deux.
   */
  readonly nombre: number;
}

/**
 * L'encours d'une liste de factures suivies.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE SEULE DÉFINITION DE « RESTE À RENTRER »
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'écran Argent en portait une seconde, et elle était fausse : la différence
 * entre le CA réalisé et le CA encaissé de l'année, bornée à zéro. Deux
 * agrégats annuels ne se soustraient pas — une facture émise en décembre et
 * encaissée en janvier gonfle l'encaissé d'une année sans contrepartie dans le
 * réalisé de la même. Sur 50 000 € réalisés et 52 000 € encaissés dont 8 000 €
 * venus de l'an dernier, le vrai reste à rentrer est de 6 000 € et l'écran
 * affichait 0 €. La borne à zéro n'était pas une protection : elle effaçait le
 * signal au lieu de le corriger.
 *
 * Le reste à rentrer ne se déduit pas d'agrégats. Il se COMPTE, facture par
 * facture : celles qui sont émises et que rien n'a réglées. C'est ce que fait
 * cette fonction, et c'est désormais la seule à le faire.
 */
export function encoursDe(factures: readonly FactureSuivie[]): Encours {
  const somme = (garde: (f: FactureSuivie) => boolean): Euros =>
    euros(factures.filter(garde).reduce((t, f) => t + f.recette.montant, 0));

  // Une facture non encore envoyée est due autant qu'une envoyée : le client
  // n'a simplement pas encore été mis au courant. L'exclure ferait disparaître
  // du « reste à rentrer » les factures de fin de mois, c'est-à-dire les plus
  // récentes.
  const dues = (f: FactureSuivie): boolean =>
    f.statut === 'emise' || f.statut === 'envoyee' || f.statut === 'en_retard';

  return {
    resteARentrer: somme(dues),
    enRetard: somme((f) => f.statut === 'en_retard'),
    nombre: factures.filter(dues).length
  };
}

/** Les libellés d'état, au singulier de ce que la facture EST. */
export const LIBELLE_STATUT: Readonly<Record<StatutFacture, string>> = {
  brouillon: 'Brouillon',
  // « À envoyer » plutôt que « Émise » : le libellé dit ce qu'il reste à
  // faire, là où l'état seul laissait croire que la facture était partie.
  emise: 'À envoyer',
  envoyee: 'Envoyée',
  en_retard: 'En retard',
  encaissee: 'Encaissée',
  annulee: 'Annulée',
  annulation: 'Avoir'
};
