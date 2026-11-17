import type { DateISO } from '../types';

/**
 * Les pièces qu'un client demande à son prestataire, et ce qu'on en sait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DES FAITS, PAS DES ÉTATS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * On enregistre QUAND une pièce a été obtenue, et la date de validité que la
 * pièce elle-même porte quand elle en porte une. « À jour », « à renouveler »
 * se dérivent de ces dates et de la règle de chaque sorte — jamais stockés :
 * un état écrit le 1er mars serait encore « à jour » le 1er octobre.
 *
 * Les règles, relevées le 17/11/2026, ne sont pas les mêmes d'une sorte à
 * l'autre, et c'est ce qui interdit un champ « valable jusqu'au » unique :
 *
 *  · `vigilance` — l'attestation URSSAF. Le texte ne fixe AUCUNE durée de
 *    validité : le donneur d'ordre d'un contrat d'au moins 5 000 € HT
 *    (C. trav. R8222-1) l'exige à la conclusion puis tous les six mois
 *    (D8222-5), « datant de moins de six mois ». C'est la date d'obtention qui
 *    compte. Celle d'un débutant est PROVISOIRE (CSS L243-15) : elle vaut
 *    jusqu'à la première échéance déclarative ou de paiement, d'où `provisoire`.
 *  · `rc_pro` — l'assurance de responsabilité civile professionnelle. Aucune
 *    obligation générale (service-public F23668) ; sa fin de garantie est
 *    celle de l'attestation de l'assureur, saisie dans `valableJusquau`.
 *  · `sirene` — l'avis de situation au répertoire SIRENE. Aucune durée
 *    officielle : une photographie du répertoire la veille du téléchargement
 *    (insee.fr). L'usage « de moins de trois mois » n'a pas de source ; il ne
 *    devient pas une règle ici.
 *  · `autre` — ce qu'un client demande d'autre, avec son libellé.
 *
 * Sources : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000046078939
 * (D8222-5), https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044627403
 * (L243-15), https://entreprendre.service-public.gouv.fr/vosdroits/F23668,
 * https://www.insee.fr/fr/information/1972132.
 */
export interface PieceAFournir {
  readonly id: string;
  readonly sorte: 'vigilance' | 'rc_pro' | 'sirene' | 'autre';
  /** Le nom sous lequel la pièce se reconnaît — celui de l'assureur, d'une demande d'un client. */
  readonly libelle: string;
  /** Le jour où la pièce a été délivrée ou téléchargée ; `null` tant qu'on ne l'a pas. */
  readonly obtenueLe: DateISO | null;
  /** La fin de validité IMPRIMÉE sur la pièce, quand elle en porte une ; jamais déduite. */
  readonly valableJusquau: DateISO | null;
  /** Une attestation de vigilance provisoire de début d'activité (CSS L243-15). */
  readonly provisoire: boolean;
}
