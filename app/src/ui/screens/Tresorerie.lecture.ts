import type { DateISO, Mois } from '../../domain/types';
import type { ProvenanceSolde } from '../../domain/calculs/solde';
import type { LigneDuDu } from '../../state/selecteurs.tresorerie';
import { MOIS_LONGS, jour, jourEtMoisLong, rangDuMois } from './Activite.missions.titre';

/**
 * Ce que la Trésorerie DIT — dates, phrases, libellés —, sans React. Les
 * nombres viennent de `selecteurs.tresorerie` ; ici, seulement leur mise en
 * mots, testée à part de l'écran.
 */

export { jourEtMoisLong };

/** « juillet » */
export const moisSeul = (m: Mois | DateISO): string => MOIS_LONGS[rangDuMois(m)] ?? '';

/** « mai 2027 » : le mois qui limite se dit avec son année, il est souvent l'an prochain. */
export const moisEtAnnee = (m: Mois): string => `${moisSeul(m)} ${m.slice(0, 4)}`;

/** « Juillet » en tête de phrase. */
export const capitale = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** « le 31 » quand le mois est déjà nommé dans la phrase. */
export const leJour = (d: DateISO): string => `le ${jour(d)}`;

/**
 * L'indication du haut de la cascade : d'où vient le solde, et de quand.
 *
 * `sansDate` passe en premier et c'est une invitation : sans date de départ,
 * l'application ne dérive rien, et le dire évite de lire « saisi » comme « à
 * jour de tout ce qui a été enregistré depuis ».
 */
export function provenanceDuSolde(
  provenance: ProvenanceSolde, soldeInitialAu: DateISO | null, dernierReleve: DateISO | null, aujourdhui: DateISO
): string {
  switch (provenance) {
    case 'rapproche':
      return dernierReleve === null ? 'lu sur le relevé' : `relevé du ${jourEtMoisLong(dernierReleve, aujourdhui)}`;
    case 'derive':
      return `dérivé des faits depuis le ${jourEtMoisLong(soldeInitialAu as DateISO, aujourdhui)}`;
    case 'saisi':
      return `solde saisi le ${jourEtMoisLong(soldeInitialAu as DateISO, aujourdhui)}`;
    case 'sansDate':
      return 'date-le dans Réglages pour qu’il suive tes entrées et tes sorties';
  }
}

/** Les quatre lignes de « Ce qui est dû », dans les mots de la maquette. */
export const NOM_LIGNE_DU: Readonly<Record<LigneDuDu['cle'], string>> = {
  urssaf: 'URSSAF et formation',
  impot: 'Impôt sur le revenu',
  tva: 'TVA à reverser',
  cfe: 'CFE'
};

/**
 * Ce qui fonde une ligne du dû et quand elle sort : « Sur tes encaissements
 * depuis avril · à payer le 31 juillet ». Une ligne à zéro dit pourquoi, au
 * lieu de laisser lire « rien à payer jamais » — la CFE n'a pas d'avis avant
 * novembre.
 */
export function detailDeLaLigne(l: LigneDuDu, aujourdhui: DateISO): string {
  const quand = l.prochaine === null || l.prochaine.startsWith('9999') ? null
    // Un retard se dit par un signe ET un mot, jamais par la couleur seule.
    : l.prochaine < aujourdhui ? `▲ était à payer le ${jourEtMoisLong(l.prochaine, aujourdhui)}`
      : `à payer le ${jourEtMoisLong(l.prochaine, aujourdhui)}`;
  const avec = (base: string): string => (quand === null ? base : `${base} · ${quand}`);
  switch (l.cle) {
    case 'urssaf':
      if (l.montant <= 0) return 'Rien à garder de côté';
      return avec(l.depuis === null ? 'Appel reçu' : `Sur tes encaissements depuis ${moisSeul(l.depuis)}`);
    case 'impot':
      if (l.avecUrssaf) return 'Versement libératoire, payé avec l’URSSAF';
      if (l.montant <= 0) return 'Rien à garder de côté';
      return avec('Mis de côté pour ton impôt');
    case 'tva':
      if (l.montant <= 0) return 'Rien à reverser';
      return quand === null
        ? (l.autoliquidee ? 'Sur un achat hors de France' : 'Collectée sur tes factures')
        : `${l.autoliquidee ? 'Sur un achat hors de France' : 'Collectée sur tes factures'} · ${quand.replace(/^à payer le /u, '')}`;
    case 'cfe':
      return l.montant > 0 ? avec('Avis saisi') : 'Avis en novembre · rien à garder avant';
  }
}
