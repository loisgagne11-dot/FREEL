/**
 * Les ÉCHÉANCES du carnet de commandes (lot 48) : quand une mission signée
 * s'arrête, quand sa fin s'annonce, jusqu'où ce qui est signé couvre l'avenir.
 *
 * À part du reste du carnet (`carnetDeCommandes`), qui le réexporte : ces
 * règles ne lisent que les dates d'une mission, et trois lecteurs n'ont besoin
 * que d'elles — le titre de l'écran Activité, « à traiter », la frise. Tout le
 * carnet dans le paquet de l'écran le portait à 39,2 Ko pour un plafond de 40,
 * pour une phrase de titre.
 */

import { joursEntre } from '../dates';
import type { DateISO } from '../types';

/**
 * Combien de jours avant la fin d'une mission l'annoncer, quand rien n'est
 * choisi : deux mois. C'est le temps de négocier une suite avec le client, ou
 * d'en trouver une autre — un mois ne suffit pas à signer quoi que ce soit
 * chez un grand compte, trois annonceraient une fin qu'on n'a pas encore
 * envie de regarder. Une constante, la seule : le fait (`preavisFinJours`)
 * reste `null` tant que rien n'est choisi.
 */
export const PREAVIS_FIN_PAR_DEFAUT_JOURS = 60;

/** Ce que ces règles lisent d'une mission : ses dates et sa commande. */
export interface CommandeDeMission {
  readonly id: string;
  readonly statut: 'active' | 'terminee' | 'prospect' | 'perdue';
  readonly debut: DateISO | null;
  readonly fin: DateISO | null;
  readonly joursCommandes?: number | null;
  readonly preavisFinJours?: number | null;
  readonly reconduction?: { readonly dureeMois: number } | null;
}

/** Une mission est signée quand elle est en cours ; un prospect ne l'est pas. */
export const estSignee = (m: { readonly statut: CommandeDeMission['statut'] }): boolean =>
  m.statut === 'active';

export const preavisDe = (m: CommandeDeMission): number =>
  m.preavisFinJours ?? PREAVIS_FIN_PAR_DEFAUT_JOURS;

export const reconduite = (m: CommandeDeMission): boolean => (m.reconduction?.dureeMois ?? 0) >= 1;

/** Le dernier jour d'un mois, `annee` et `mois` (1 à 12) donnés. */
function dernierJour(annee: number, mois: number): number {
  return new Date(Date.UTC(annee, mois, 0)).getUTCDate();
}

/**
 * Une date, `n` mois plus tard.
 *
 * Un contrat qui finit le 30 avril se reconduit au 31 juillet, pas au 30 : la
 * fin de mois reste une fin de mois. Un 31 janvier donne un 28 ou 29 février,
 * et le mois suivant revient au 31 — d'où le calcul depuis la date d'origine,
 * jamais de proche en proche, qui ferait glisser chaque reconduction d'un
 * jour.
 */
export function ajouterMoisALaDate(d: DateISO, n: number): DateISO {
  const annee = Number(d.slice(0, 4));
  const mois = Number(d.slice(5, 7));
  const jour = Number(d.slice(8, 10));
  const total = annee * 12 + (mois - 1) + n;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const finDeMois = jour === dernierJour(annee, mois);
  const j = finDeMois ? dernierJour(a, m) : Math.min(jour, dernierJour(a, m));
  return `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}` as DateISO;
}

/**
 * L'échéance de la période EN COURS, ou `null` sans fin.
 *
 * Sans reconduction, c'est `fin`. Avec, `fin` est l'échéance de la période que
 * l'utilisateur a saisie, et les suivantes s'en déduisent par pas de
 * `dureeMois` tant que l'échéance est passée : un contrat trimestriel signé
 * fin mars est, en juin, à l'échéance du 30 juin — pas à celle de mars.
 */
export function echeanceEnCours(m: CommandeDeMission, aujourdhui: DateISO): DateISO | null {
  if (m.fin === null) return null;
  const duree = m.reconduction?.dureeMois ?? 0;
  if (duree < 1 || m.fin >= aujourdhui) return m.fin;
  // Le nombre de pas se borne par l'écart : au plus un pas par mois écoulé.
  const borne = Math.ceil(joursEntre(m.fin, aujourdhui) / 28) + 1;
  for (let k = 1; k <= borne; k += 1) {
    const e = ajouterMoisALaDate(m.fin, k * duree);
    if (e >= aujourdhui) return e;
  }
  return m.fin;
}

const lendemain = (d: DateISO): DateISO => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10) as DateISO;
};

/** Une fin qui s'annonce : dans combien de jours, et ce qui se passe alors. */
export interface FinAnnoncee {
  readonly echeance: DateISO;
  /** De 0 (aujourd'hui) au préavis. */
  readonly jours: number;
  /** Le jour où le contrat se reconduit sans dénonciation ; `null` s'il s'arrête. */
  readonly reconduitLe: DateISO | null;
}

/**
 * La fin d'une mission signée, quand elle tombe dans son préavis.
 *
 * Un prospect, une mission terminée ou perdue n'annoncent rien : il n'y a pas
 * de suite à préparer à ce qui n'a pas commencé ou ce qui est clos. Une fin
 * DÉJÀ passée non plus — elle ne tombe plus dans le préavis, elle est derrière ;
 * l'état de la mission le dit (`fin_passee`), sans répéter une alerte que plus
 * aucune négociation ne peut prévenir.
 */
export function finAnnoncee(m: CommandeDeMission, aujourdhui: DateISO): FinAnnoncee | null {
  if (!estSignee(m)) return null;
  const echeance = echeanceEnCours(m, aujourdhui);
  if (echeance === null) return null;
  const jours = joursEntre(aujourdhui, echeance);
  if (!(jours >= 0 && jours <= preavisDe(m))) return null;
  return { echeance, jours, reconduitLe: reconduite(m) ? lendemain(echeance) : null };
}

/** Jusqu'où ce qui est signé couvre l'avenir. */
export type FinDeVisibilite =
  | { readonly type: 'rien' }
  | { readonly type: 'sans_fin'; readonly missions: readonly string[] }
  | {
    readonly type: 'date';
    readonly date: DateISO;
    readonly jours: number;
    readonly missionId: string;
    /** La mission qui la porte est dans son préavis, et ne se reconduit pas : une suite à préparer. */
    readonly aPreparer: boolean;
    /** Elle se reconduit tacitement : « plus rien n'est signé » serait faux. */
    readonly reconduite: boolean;
  };

/**
 * La plus tardive des échéances des missions signées.
 *
 * Une mission signée sans fin couvre tout l'horizon : la visibilité est
 * « sans fin fixée », quelle que soit la date des autres. Une mission signée
 * dont l'échéance est déjà passée ne couvre plus rien — elle est restée « en
 * cours » par oubli, et la compter dirait « couvert jusqu'au 3 mai » en juin.
 */
export function finDeVisibilite(
  missions: readonly CommandeDeMission[],
  aujourdhui: DateISO
): FinDeVisibilite {
  const signees = missions.filter(estSignee);
  const ouvertes = signees.filter((m) => m.fin === null);
  if (ouvertes.length > 0) return { type: 'sans_fin', missions: ouvertes.map((m) => m.id) };

  let porteuse: { readonly m: CommandeDeMission; readonly e: DateISO } | null = null;
  for (const m of signees) {
    const e = echeanceEnCours(m, aujourdhui);
    if (e === null || e < aujourdhui) continue;
    if (porteuse === null || e > porteuse.e) porteuse = { m, e };
  }
  if (porteuse === null) return { type: 'rien' };
  const annoncee = finAnnoncee(porteuse.m, aujourdhui);
  return {
    type: 'date',
    date: porteuse.e,
    jours: joursEntre(aujourdhui, porteuse.e),
    missionId: porteuse.m.id,
    aPreparer: annoncee !== null && annoncee.reconduitLe === null,
    reconduite: reconduite(porteuse.m)
  };
}
