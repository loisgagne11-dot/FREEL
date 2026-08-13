import type { DateISO, Euros } from '../types';
import { ajouterJours } from './aTraiter';

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
export const DELAI_PAIEMENT_DEFAUT = 30;

/** La date à laquelle le règlement devient exigible. */
export function echeanceDe(emiseLe: DateISO, delaiJours: number): DateISO {
  return ajouterJours(emiseLe, delaiJours);
}

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
  readonly encaisseeLe: DateISO | null;
  readonly numero: string;
  readonly annuleEcriture?: string | null;
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
export function suivre<R extends RecetteSuivie>(
  recettes: readonly R[],
  delaiPour: (clientNom: string) => number,
  aujourdhui: DateISO
): readonly FactureSuivie<R>[] {
  const annulees = new Set(
    recettes.map((r) => r.annuleEcriture).filter((id): id is string => typeof id === 'string')
  );

  return recettes.map((recette) => {
    const echeanceLe = recette.emiseLe === null
      ? null
      : echeanceDe(recette.emiseLe, delaiPour(recette.clientNom));

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
  return 'emise';
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

/** Les libellés d'état, au singulier de ce que la facture EST. */
export const LIBELLE_STATUT: Readonly<Record<StatutFacture, string>> = {
  brouillon: 'Brouillon',
  emise: 'Émise',
  en_retard: 'En retard',
  encaissee: 'Encaissée',
  annulee: 'Annulée',
  annulation: 'Avoir'
};
