import type { DateISO } from '../types';
import type { AjustementJour, Ajustements, Quotite, Rythme } from './planning';
import { planifier } from './planification';

/**
 * Arrêter un client opérationnel, et savoir qu'il l'est.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ARRÊTER, C'EST BORNER SES FAITS — RIEN DE STOCKÉ EN PLUS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une mission passée par une agence peut perdre l'un de ses clients finaux en
 * cours de route : le donneur d'ordre B s'arrête fin mars, A continue. Ce qui
 * remplit le planning de B, ce sont ses plages de rythme et ses corrections
 * datées ; l'arrêter, c'est donc borner les unes et retirer les autres après
 * le jour dit. Il n'y a ni champ « arrêté le », ni statut : la date se lit sur
 * les faits (`finDuClient`), et un champ à côté finirait par contredire les
 * plages qu'il prétend résumer — c'est l'invariant n° 2.
 *
 * La fin de la MISSION n'y entre pas : les plages ne la suivent pas — le
 * formulaire découpe le rythme au mois, et une mission prolongée ne rallonge
 * pas d'elle-même les plages déjà saisies. Lire l'arrêt sur `mission.fin`
 * donnerait pour arrêté un client qui travaille encore.
 *
 * Ce module est chargé à la demande : seul l'écran Activité et la reprise de
 * l'ancienne application le lisent, jamais le premier rendu.
 */

/** Ce qu'un client opérationnel porte et que ce module lit : ses faits datés. */
export interface FaitsDuClient {
  readonly id: string;
  readonly rythmes: readonly Rythme[];
  readonly ajustements: Ajustements;
}

/** Ce que l'arrêt a changé, pour pouvoir le dire avant de l'écrire. */
export interface BilanDeLArret {
  /** Plages qui couraient au-delà du jour dit, désormais closes ce jour-là. */
  readonly plagesBornees: number;
  /** Plages qui commençaient après le jour dit : elles n'ont plus d'objet. */
  readonly plagesRetirees: number;
  /** Corrections datées après le jour dit, zéros compris. */
  readonly correctionsRetirees: number;
  /** Ce que ces corrections déclaraient de travail, en jours. */
  readonly joursCorriges: Quotite;
}

export type ResultatArret<E extends FaitsDuClient> =
  | { readonly entite: E; readonly bilan: BilanDeLArret }
  | { readonly refus: string };

/** Une plage qui produit des journées : une semaine type non vide. */
const plageActive = (r: Rythme): boolean =>
  Object.values(r.parJour).some((q) => (q ?? 0) > 0);

/** Le premier jour où le client a quelque chose, ou `null`. */
function debutDuClient(e: FaitsDuClient): DateISO | null {
  const dates = [
    ...e.rythmes.filter(plageActive).map((r) => r.du),
    ...Object.entries(e.ajustements).filter(([, a]) => a.quotite > 0).map(([d]) => d as DateISO)
  ];
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b));
}

/**
 * Le dernier jour où un client opérationnel a quelque chose, ou `null`.
 *
 * La fin des plages qui prévoient du travail, ou une correction positive
 * posée plus tard — une journée déclarée à la main après la dernière plage
 * prouve que le client n'était pas fini. Une plage vide ne compte pas : elle
 * ne remplit rien. Un zéro non plus : il dit justement qu'on n'y était pas.
 */
export function finDuClient(e: FaitsDuClient): DateISO | null {
  const dates = [
    ...e.rythmes.filter(plageActive).map((r) => r.au),
    ...Object.entries(e.ajustements).filter(([, a]) => a.quotite > 0).map(([d]) => d as DateISO)
  ];
  return dates.length === 0 ? null : dates.reduce((a, b) => (a > b ? a : b));
}

/**
 * La date à laquelle ce client s'est arrêté, ou `null` s'il ne l'est pas.
 *
 * Un client SEUL n'est jamais « arrêté » : sa fin est celle de la mission, et
 * c'est la mission qui se termine. Deux clients qui finissent le même jour ne
 * le sont pas davantage — rien ne continue sans eux. Il faut qu'un autre
 * client de la même mission travaille encore après lui.
 */
export function arretDuClient(
  mission: { readonly entites: readonly FaitsDuClient[] },
  e: FaitsDuClient
): DateISO | null {
  const fin = finDuClient(e);
  if (fin === null) return null;
  const unAutreContinue = mission.entites.some((autre) => {
    if (autre.id === e.id) return false;
    const finAutre = finDuClient(autre);
    return finAutre !== null && finAutre > fin;
  });
  return unAutreContinue ? fin : null;
}

/**
 * Arrête un client opérationnel au jour dit : il garde ce jour-là, perd la suite.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES ZÉROS PARTENT AUSSI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une correction à zéro après l'arrêt ne compte rien aujourd'hui. Elle n'est
 * pas inoffensive pour autant : si l'arrêt est un jour levé — une plage
 * rallongée —, elle effacerait en silence une journée que personne n'a
 * annulée. Elle est donc retirée, et comptée, comme les autres.
 *
 * Deux refus. Arrêter avant le premier jour du client, c'est le retirer de la
 * mission, avec ce qu'il a déjà travaillé : ce n'est pas le même geste, et le
 * confondre effacerait des journées faites. Arrêter un client qui n'a rien
 * après le jour dit ne changerait rien, et l'écrire ferait croire le
 * contraire.
 */
export function arreterClient<E extends FaitsDuClient>(entite: E, le: DateISO): ResultatArret<E> {
  const debut = debutDuClient(entite);
  if (debut !== null && le < debut) {
    return {
      refus: 'Ce client n’a encore rien travaillé à cette date : l’arrêter avant son '
        + 'premier jour reviendrait à le retirer de la mission. C’est « Retirer » qu’il faut.'
    };
  }

  let plagesBornees = 0;
  let plagesRetirees = 0;
  const rythmes: Rythme[] = [];
  for (const r of entite.rythmes) {
    if (r.du > le) { plagesRetirees += 1; continue; }
    if (r.au > le) { plagesBornees += 1; rythmes.push({ ...r, au: le }); continue; }
    rythmes.push(r);
  }

  let correctionsRetirees = 0;
  let joursCorriges = 0;
  const ajustements: Record<string, AjustementJour> = {};
  for (const [date, pose] of Object.entries(entite.ajustements)) {
    if (date > le) {
      correctionsRetirees += 1;
      joursCorriges += pose.quotite;
      continue;
    }
    ajustements[date] = pose;
  }

  if (plagesBornees + plagesRetirees + correctionsRetirees === 0) {
    return { refus: 'Rien n’est prévu pour ce client après cette date : il n’y a rien à arrêter.' };
  }

  return {
    entite: { ...entite, rythmes, ajustements },
    bilan: { plagesBornees, plagesRetirees, correctionsRetirees, joursCorriges }
  };
}

/** Les dates du lendemain de `apres` jusqu'à `jusquA` compris. */
function datesApres(apres: DateISO, jusquA: DateISO): readonly DateISO[] {
  const dates: DateISO[] = [];
  const d = new Date(`${apres}T00:00:00Z`);
  for (;;) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10) as DateISO;
    if (iso > jusquA) return dates;
    dates.push(iso);
  }
}

interface Contexte {
  readonly feries: ReadonlySet<string>;
  readonly conges: Readonly<Record<string, Quotite>>;
}

/**
 * Les journées qu'un arrêt au jour dit ferait cesser de compter, jusqu'à une
 * date donnée — corrections comprises, fériés et congés déduits.
 *
 * Par `planifier`, et non par un décompte des plages : c'est lui qui remplit
 * le planning, le CRA et la facture, et le chiffre annoncé avant l'arrêt doit
 * être exactement celui qui disparaîtra de ces trois-là.
 */
export function joursPerdusApres(
  entite: FaitsDuClient,
  le: DateISO,
  jusquA: DateISO,
  feries: Contexte['feries'],
  conges: Contexte['conges']
): Quotite {
  return planifier(datesApres(le, jusquA), {
    rythmes: entite.rythmes, ajustements: entite.ajustements, feries, conges
  }).reduce((s, j) => s + j.retenu, 0);
}

/** Ce que retirer un client de la mission emporterait avec lui. */
export interface BilanDuRetrait {
  /** Journées retenues jusqu'à aujourd'hui inclus : du travail fait. */
  readonly joursPasses: Quotite;
  /** Corrections posées à la main, toutes dates confondues. */
  readonly corrections: number;
  /** Journées que le planning prévoit encore après aujourd'hui. */
  readonly joursAVenir: Quotite;
}

/**
 * Ce que retirer un client ferait disparaître, passé et avenir séparés.
 *
 * Les deux ne pèsent pas pareil : retirer un client qui a déjà travaillé efface
 * des journées qu'un CRA a peut-être déjà portées, et c'est à dire avant le
 * geste ; retirer ce qui reste à venir ne fait que vider une prévision. Les
 * journées à venir sont les RETENUES — un jour de repos déjà posé à zéro n'est
 * pas prévu.
 */
export function bilanDuRetrait(
  entite: FaitsDuClient,
  aujourdhui: DateISO,
  feries: Contexte['feries'],
  conges: Contexte['conges']
): BilanDuRetrait {
  const debut = debutDuClient(entite);
  const fin = finDuClient(entite);
  const corrections = Object.keys(entite.ajustements).length;
  if (debut === null || fin === null) return { joursPasses: 0, corrections, joursAVenir: 0 };

  const veille = new Date(`${debut}T00:00:00Z`);
  veille.setUTCDate(veille.getUTCDate() - 1);
  const planning = planifier(datesApres(veille.toISOString().slice(0, 10) as DateISO, fin), {
    rythmes: entite.rythmes, ajustements: entite.ajustements, feries, conges
  });
  let joursPasses = 0;
  let joursAVenir = 0;
  for (const j of planning) {
    if (j.date <= aujourdhui) joursPasses += j.retenu;
    else joursAVenir += j.retenu;
  }
  return { joursPasses, corrections, joursAVenir };
}
