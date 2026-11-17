import type { DateISO } from '../types';
import { decaler } from './calendrier';

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

/**
 * Où en est une pièce, dérivé de ses dates et de la règle de sa sorte.
 *
 *  · `a_obtenir` — aucune date d'obtention : la pièce n'est pas en main ;
 *  · `a_jour` — valable aujourd'hui ;
 *  · `a_renouveler` — valable encore, mais plus pour `RAPPEL_JOURS` jours ;
 *  · `expiree` — la fin de validité est passée ;
 *  · `sans_validite` — rien ne fixe de fin : l'avis SIRENE (aucune durée
 *    officielle), une pièce dont la date n'est pas saisie. On dit « obtenue
 *    le … », jamais « à jour » : ce serait affirmer ce que personne n'a dit.
 */
export type EtatPiece = 'a_obtenir' | 'a_jour' | 'a_renouveler' | 'expiree' | 'sans_validite';

/** Quinze jours : le temps de télécharger une attestation et de l'envoyer avant qu'on la réclame. */
export const RAPPEL_JOURS = 15;

/** Six mois : l'ancienneté au-delà de laquelle une attestation de vigilance ne vaut plus (D8222-5). */
export const MOIS_VIGILANCE = 6;

/**
 * Ajoute des mois à une date en restant dans le mois d'arrivée : le 31 août
 * plus six mois donne le 28 février — le 29 une année bissextile —, et non le
 * 3 mars, où un `setMonth` naïf déborde. Une attestation obtenue le 31 août
 * se dirait sinon valable trois jours de trop.
 */
export function ajouterMoisSansDeborder(d: DateISO, mois: number): DateISO {
  const annee = Number(d.slice(0, 4));
  const total = (Number(d.slice(5, 7)) - 1) + mois;
  const cibleAnnee = annee + Math.floor(total / 12);
  const cibleMois = ((total % 12) + 12) % 12;
  const dernier = new Date(Date.UTC(cibleAnnee, cibleMois + 1, 0)).getUTCDate();
  const jour = Math.min(Number(d.slice(8, 10)), dernier);
  return new Date(Date.UTC(cibleAnnee, cibleMois, jour)).toISOString().slice(0, 10) as DateISO;
}

export interface EtatDePiece {
  readonly etat: EtatPiece;
  /** Le dernier jour où la pièce vaut ; `null` quand rien ne le fixe. */
  readonly finValidite: DateISO | null;
  /** Le jour où elle devient « à renouveler » ; `null` sans fin de validité. */
  readonly rappelLe: DateISO | null;
}

/**
 * L'état d'une pièce le jour dit.
 *
 * `premiereEcheance` ne sert qu'à l'attestation PROVISOIRE d'un débutant :
 * elle vaut « jusqu'à la première échéance déclarative ou de paiement »
 * (CSS L243-15) — la première limite URSSAF qui suit son obtention, que
 * l'appelant calcule avec la périodicité.
 *
 * Une attestation de vigilance ordinaire est « à jour » tant que six mois ne
 * sont pas passés depuis son obtention (le jour anniversaire compris) : le
 * texte ne fixe aucune durée de validité, il exige une attestation « datant
 * de moins de six mois », et le client la redemande tous les six mois.
 */
export function etatDePiece(
  piece: PieceAFournir,
  aujourdhui: DateISO,
  premiereEcheance: DateISO | null = null
): EtatDePiece {
  if (piece.obtenueLe === null) return { etat: 'a_obtenir', finValidite: null, rappelLe: null };
  const fin = piece.sorte === 'sirene'
    ? null
    : piece.sorte === 'vigilance'
      ? (piece.provisoire ? premiereEcheance : ajouterMoisSansDeborder(piece.obtenueLe, MOIS_VIGILANCE))
      : piece.valableJusquau;
  if (fin === null) return { etat: 'sans_validite', finValidite: null, rappelLe: null };
  const rappelLe = decaler(fin, -RAPPEL_JOURS);
  const etat: EtatPiece = aujourdhui > fin ? 'expiree' : aujourdhui >= rappelLe ? 'a_renouveler' : 'a_jour';
  return { etat, finValidite: fin, rappelLe };
}
