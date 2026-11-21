import type { EtatDeMission, FinAnnoncee } from '../../domain/calculs/carnetDeCommandes';
import type { DateISO, Mois } from '../../domain/types';
import type { Mission } from '../../state/schema';
import { formaterJours } from '../format';
import { enumeration, suiteDesClients } from './Activite.clientsMission.lecture';
import { MOIS_COURTS, MOIS_LONGS, annee, jour, jourEtMoisLong, rangDuMois } from './Activite.missions.titre';

export { MOIS_COURTS, MOIS_LETTRES, jourEtMoisLong } from './Activite.missions.titre';

/**
 * Ce que l'onglet Missions DIT — dates, titres, états, phrases —, sans React.
 *
 * Les règles sont dans `calculs/carnetDeCommandes` ; ici, seulement leur mise
 * en mots. Le titre de l'écran, lu avant que l'onglet ne soit chargé, vit à
 * part (`Activite.missions.titre`).
 */

export const jourEtMoisCourt = (d: DateISO, aujourdhui: DateISO): string =>
  `${jour(d)} ${MOIS_COURTS[rangDuMois(d)] ?? ''}${annee(d, aujourdhui)}`;

export const moisCourt = (m: Mois | DateISO): string => MOIS_COURTS[rangDuMois(m)] ?? '';
export const moisLongSeul = (m: Mois | DateISO): string => MOIS_LONGS[rangDuMois(m)] ?? '';

/** La pastille d'état : un signe et un mot, jamais la couleur seule. */
export interface PastilleDEtat {
  readonly texte: string;
  readonly ton: 'ok' | 'attention' | 'neutre';
  /** Le montant que la pastille porte, à masquer en mode confidentiel. */
  readonly montant?: number;
  /** Ce qui suit le montant (« à facturer »). */
  readonly suite?: string;
}

/** « dans 51 jours », « demain », « aujourd'hui ». */
export function dansNJours(n: number): string {
  if (n <= 0) return 'aujourd’hui';
  if (n === 1) return 'demain';
  return `dans ${n} jours`;
}

export function pastilleDeLEtat(e: EtatDeMission, aujourdhui: DateISO): PastilleDEtat {
  switch (e.type) {
    case 'en_cours': return { texte: '● En cours', ton: 'ok' };
    case 'fin_annoncee':
      return e.reconduitLe !== null
        ? { texte: `◇ Reconduite le ${jourEtMoisCourt(e.reconduitLe, aujourdhui)}`, ton: 'attention' }
        : { texte: `◇ Fin ${dansNJours(e.jours)}`, ton: 'attention' };
    case 'fin_passee': return { texte: `◇ Finie le ${jourEtMoisCourt(e.le, aujourdhui)}, à clore`, ton: 'attention' };
    case 'a_facturer': return { texte: '◇', ton: 'attention', montant: e.montant, suite: 'à facturer' };
    case 'prospect':
      return { texte: e.probabilite === null ? '○ Prospect' : `○ Prospect, ${e.probabilite} %`, ton: 'neutre' };
    case 'terminee':
      if (e.aEncaisser > 0) return { texte: '● Terminée,', ton: 'neutre', montant: e.aEncaisser, suite: 'à encaisser' };
      return { texte: e.soldee ? '● Terminée, soldée' : '● Terminée', ton: 'neutre' };
    case 'perdue': return { texte: '× Perdue', ton: 'neutre' };
  }
}

/**
 * Le bandeau d'une fin annoncée : ce qui arrive, puis ce qu'il faut en faire.
 * Avec reconduction, le contrat continue sans geste : la phrase dit le jour,
 * et que c'est d'une dénonciation qu'il faudrait parler.
 */
export function phraseDeFin(nom: string, f: FinAnnoncee, aujourdhui: DateISO): { readonly fort: string; readonly suite: string } {
  if (f.reconduitLe !== null) {
    return {
      fort: `◇ ${nom} se reconduit le ${jourEtMoisLong(f.reconduitLe, aujourdhui)} sauf dénonciation.`,
      suite: 'Pour l’arrêter, préviens le client avant l’échéance.'
    };
  }
  return {
    fort: f.jours <= 0 ? `◇ ${nom} se termine aujourd’hui.` : `◇ ${nom} se termine ${dansNJours(f.jours)}.`,
    suite: 'C’est le moment d’en parler au client.'
  };
}

/** Les clients opérationnels nommés autrement que le payeur : ceux d'un intermédiaire. */
export function clientsFinaux(m: Mission): readonly string[] {
  const payeur = m.clientNom.trim().toLowerCase();
  return [...new Set(m.entites.map((e) => e.nom.trim()).filter((n) => n !== '' && n.toLowerCase() !== payeur))];
}

/**
 * La ligne sous le nom d'une mission : sa commande, ses clients finaux, ou ce
 * qui la date. La référence de commande passe en premier — c'est elle qu'on
 * cherche en préparant la facture (lot 46).
 */
export function sousTitreDeMission(m: Mission, aujourdhui: DateISO): string | null {
  if (m.referenceCommande != null && m.referenceCommande.trim() !== '') {
    return `Commande n° ${m.referenceCommande.trim()}`;
  }
  /* Une mission qui a changé de client en route se lit d'une ligne (lot 31) :
     sans elle, la liste ne montre que le payeur. */
  const suite = suiteDesClients(m);
  if (suite !== null) return suite;
  const finaux = clientsFinaux(m);
  if (finaux.length > 0) return `Pour ${enumeration(finaux)}`;
  if (m.statut === 'prospect') return m.debut === null ? null : `À partir de ${moisLongSeul(m.debut)}${annee(m.debut, aujourdhui)}`;
  if (m.statut === 'terminee' && m.fin !== null) return `Terminée en ${moisLongSeul(m.fin)}${annee(m.fin, aujourdhui)}`;
  const commandes = m.joursCommandes ?? null;
  if (commandes !== null) return `${formaterJours(commandes)} ${commandes > 1 ? 'jours commandés' : 'jour commandé'}`;
  return null;
}

/** Les petits nombres en lettres, comme la maquette : « trois missions signées ». */
const EN_LETTRES = ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
export const enLettres = (n: number): string => EN_LETTRES[n] ?? String(n);
