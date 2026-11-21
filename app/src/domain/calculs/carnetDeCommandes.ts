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

import { joursEntre } from '../dates';
import { type DateISO, type Euros, type Mois, type Resolution, euros, moisDe } from '../types';

/**
 * Combien de jours avant la fin d'une mission l'annoncer, quand rien n'est
 * choisi : deux mois. C'est le temps de négocier une suite avec le client, ou
 * d'en trouver une autre — un mois ne suffit pas à signer quoi que ce soit
 * chez un grand compte, trois annonceraient une fin qu'on n'a pas encore
 * envie de regarder. Une constante, la seule : le fait (`preavisFinJours`)
 * reste `null` tant que rien n'est choisi.
 */
export const PREAVIS_FIN_PAR_DEFAUT_JOURS = 60;

/** Le motif d'une mission signée dont le reste ne se dit pas en jours. */
export const SANS_FIN_FIXEE = 'sans fin fixée';

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

const reconduite = (m: CommandeDeMission): boolean => (m.reconduction?.dureeMois ?? 0) >= 1;

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
