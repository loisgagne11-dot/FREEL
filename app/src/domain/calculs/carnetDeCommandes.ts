/**
 * Le carnet de commandes : ce qui est signé, ce qui reste à produire, ce qui
 * s'arrête (lot 48).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE NE LIT PAS LE PLANNING
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les jours faits et les jours à venir viennent du planning — rythmes,
 * ajustements, fériés, congés —, le même que celui du CRA et de la facture du
 * mois (`selecteurs.carnet`). Les recompter ici en ferait un second compte, et
 * deux comptes d'une même journée finissent par ne pas tomber d'accord.
 *
 * Ce module reçoit donc ces nombres et ne garde que les RÈGLES : quand une
 * mission est signée, quand sa fin s'annonce, ce que vaut ce qui reste, quand
 * un nombre ne peut pas se dire. Sans le planning, il se charge aussi là où le
 * planning n'a rien à faire : l'en-tête de l'écran et « à traiter » ne lisent
 * que les dates d'une mission.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN PROSPECT N'EST JAMAIS COMPTÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le carnet signé est ce sur quoi l'on décide de refuser une mission ou d'en
 * chercher une autre. Y mettre un devis envoyé, même pondéré par sa
 * probabilité, ferait lire comme acquis un mois que rien ne garantit — et
 * c'est précisément ce mois-là qu'on découvre vide.
 */

import { type DateISO, type Euros, type Mois, type Resolution, euros, moisDe } from '../types';
import {
  type CommandeDeMission, type FinAnnoncee, type FinDeVisibilite, PREAVIS_FIN_PAR_DEFAUT_JOURS,
  ajouterMoisALaDate, echeanceEnCours, estSignee, finAnnoncee, finDeVisibilite, preavisDe, reconduite
} from './carnetDeCommandes.echeance';

/* Les échéances vivent à part (`carnetDeCommandes.echeance`) : une source, deux
   portes — les lecteurs du carnet entier les trouvent ici. */
export {
  type CommandeDeMission, type FinAnnoncee, type FinDeVisibilite, PREAVIS_FIN_PAR_DEFAUT_JOURS,
  ajouterMoisALaDate, echeanceEnCours, estSignee, finAnnoncee, finDeVisibilite, preavisDe
};

/** Le motif d'une mission signée dont le reste ne se dit pas en jours. */
export const SANS_FIN_FIXEE = 'sans fin fixée';

/**
 * Ce qu'il reste à produire d'une mission signée, en jours.
 *
 * Le volume commandé l'emporte quand il est connu : c'est ce que le client a
 * signé, et le planning ne dit que ce qu'on a prévu d'en faire. Sans volume,
 * ce sont les jours planifiés d'aujourd'hui à l'échéance. Sans volume ni fin,
 * rien ne borne la mission : elle se dit « sans fin fixée », et aucun nombre
 * n'est inventé — compter zéro la ferait passer pour soldée, compter le
 * planning jusqu'à l'horizon donnerait un carnet qui dépend de la largeur de
 * l'écran.
 *
 * Un volume dépassé (plus de jours faits que commandés) laisse zéro : le
 * carnet ne devient pas négatif, et le dépassement se lit sur la ligne.
 */
export function resteAProduire(
  m: CommandeDeMission,
  joursFaits: number,
  joursAVenir: number,
  aujourdhui: DateISO
): Resolution<number> {
  if (!estSignee(m)) return { statut: 'refuse', motif: 'mission non signée' };
  const commandes = m.joursCommandes ?? null;
  if (commandes !== null) {
    return {
      statut: 'publie', valeur: Math.max(0, commandes - joursFaits),
      source: 'volume commandé, moins les jours faits', verifieLe: aujourdhui
    };
  }
  if (m.fin === null) return { statut: 'refuse', motif: SANS_FIN_FIXEE };
  return {
    statut: 'publie', valeur: joursAVenir,
    source: 'jours planifiés jusqu’à l’échéance', verifieLe: aujourdhui
  };
}

/** Une mission telle que le carnet la totalise. */
export interface ResteDeMission {
  readonly statut: CommandeDeMission['statut'];
  readonly nom: string;
  readonly tjm: Euros;
  readonly reste: Resolution<number>;
}

export interface CarnetSigne {
  readonly jours: number;
  readonly euros: Euros;
  /** Les missions signées dont le reste ne se compte pas : nommées, jamais comptées pour zéro. */
  readonly sansFinFixee: readonly string[];
  /** Les missions signées sans tarif : leurs jours sont comptés, leurs euros non. */
  readonly sansTarif: readonly string[];
  /** Combien de missions signées le carnet porte. */
  readonly signees: number;
}

/**
 * Le carnet signé : Σ reste à produire, en jours et en euros (jours × TJM).
 *
 * Les missions signées SEULES — le filtre est ici, et non chez l'appelant :
 * un appelant qui l'oublierait compterait les prospects, et rien à l'écran ne
 * le trahirait. Le TJM est celui de la mission, le tarif de la commande.
 */
export function carnetSigne(missions: readonly ResteDeMission[]): CarnetSigne {
  let jours = 0;
  let montant = 0;
  const sansFinFixee: string[] = [];
  const sansTarif: string[] = [];
  let signees = 0;
  for (const m of missions) {
    if (!estSignee(m)) continue;
    signees += 1;
    if (m.reste.statut === 'refuse') { sansFinFixee.push(m.nom); continue; }
    jours += m.reste.valeur;
    if (m.tjm > 0) montant += m.reste.valeur * m.tjm;
    else if (m.reste.valeur > 0) sansTarif.push(m.nom);
  }
  return { jours, euros: euros(montant), sansFinFixee, sansTarif, signees };
}

/**
 * Le dernier mois où une mission signée ou un prospect court encore :
 * `'toujours'` si l'un d'eux n'a pas de fin, `null` si aucun ne court.
 *
 * C'est la borne entre « 0 » et « — » sur la rangée des jours signés : un mois
 * à zéro sous un prospect est un mois à remplir, un mois au-delà de tout
 * contrat n'a encore rien à dire.
 */
export function courtJusquA(
  missions: readonly CommandeDeMission[],
  aujourdhui: DateISO
): Mois | 'toujours' | null {
  let dernier: Mois | null = null;
  for (const m of missions) {
    if (m.statut !== 'active' && m.statut !== 'prospect') continue;
    const e = m.statut === 'active' ? echeanceEnCours(m, aujourdhui) : m.fin;
    if (e === null) return 'toujours';
    const mois = moisDe(e);
    if (dernier === null || mois > dernier) dernier = mois;
  }
  return dernier;
}

/**
 * Les jours signés de chaque mois : le nombre tant qu'une mission ou un
 * prospect court, `null` (« — ») au-delà.
 */
export function joursSignesDesMois(
  mois: readonly Mois[],
  joursParMois: ReadonlyMap<Mois, number>,
  jusqua: Mois | 'toujours' | null
): readonly (number | null)[] {
  return mois.map((m) => (jusqua === null || (jusqua !== 'toujours' && m > jusqua)
    ? null
    : joursParMois.get(m) ?? 0));
}

/**
 * Le travail d'une mission signée est-il achevé ? Son volume commandé est
 * atteint, ou son échéance passée sans reconduction.
 *
 * Seule une mission achevée a quelque chose « à facturer » au sens de l'état :
 * en cours de mois, le travail fait et non facturé est la règle — la facture
 * du mois part à sa fin, et le facturier la prépare. L'annoncer sur chaque
 * ligne n'apprendrait rien ; l'annoncer sur la mission finie dont la dernière
 * facture n'est pas partie, si.
 */
export function travailAcheve(m: CommandeDeMission, joursFaits: number, aujourdhui: DateISO): boolean {
  if (!estSignee(m)) return false;
  const commandes = m.joursCommandes ?? null;
  if (commandes !== null && joursFaits >= commandes) return true;
  return !reconduite(m) && m.fin !== null && m.fin < aujourdhui;
}

/** L'état d'une mission, tel que la liste le dit — un signe et un mot. */
export type EtatDeMission =
  | { readonly type: 'en_cours' }
  | { readonly type: 'fin_annoncee'; readonly jours: number; readonly reconduitLe: DateISO | null }
  | { readonly type: 'fin_passee'; readonly le: DateISO }
  | { readonly type: 'a_facturer'; readonly montant: Euros }
  | { readonly type: 'prospect'; readonly probabilite: number | null }
  /** `soldee` : facturée, et tout est rentré. Une mission dont rien n'est rattaché n'est pas « soldée ». */
  | { readonly type: 'terminee'; readonly aEncaisser: Euros; readonly soldee: boolean }
  | { readonly type: 'perdue' };

/**
 * L'état d'une mission, dérivé — jamais stocké.
 *
 * Pour une mission signée, ce qui appelle un geste passe d'abord : l'argent
 * qui attend sa facture, puis la fin qui approche, puis la fin dépassée sans
 * que la mission soit close. Une mission terminée dit si elle est soldée :
 * c'est la seule question qu'on lui pose encore.
 */
export function etatDeLaMission(
  m: CommandeDeMission & { readonly probabilite?: number | null },
  chiffres: {
    readonly aujourdhui: DateISO;
    readonly aFacturer: Euros;
    readonly facture: Euros;
    readonly resteARentrer: Euros;
  }
): EtatDeMission {
  switch (m.statut) {
    case 'prospect': return { type: 'prospect', probabilite: m.probabilite ?? null };
    case 'perdue': return { type: 'perdue' };
    case 'terminee': {
      const aEncaisser = euros(Math.max(0, chiffres.resteARentrer));
      return { type: 'terminee', aEncaisser, soldee: chiffres.facture > 0 && aEncaisser === 0 };
    }
    case 'active': break;
  }
  if (chiffres.aFacturer > 0) return { type: 'a_facturer', montant: chiffres.aFacturer };
  const annoncee = finAnnoncee(m, chiffres.aujourdhui);
  if (annoncee !== null) return { type: 'fin_annoncee', jours: annoncee.jours, reconduitLe: annoncee.reconduitLe };
  const echeance = echeanceEnCours(m, chiffres.aujourdhui);
  if (echeance !== null && echeance < chiffres.aujourdhui) return { type: 'fin_passee', le: echeance };
  return { type: 'en_cours' };
}
