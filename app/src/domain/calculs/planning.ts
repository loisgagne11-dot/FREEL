import type { DateISO, Euros, Mois } from '../types';
import { euros } from '../types';

/**
 * Le planning : ce qui est prévu, ce qui a été fait, et le CRA qui en sort.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CRA EST UN LIVRABLE, PAS UNE SAISIE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'enchaînement réel du métier va dans ce sens :
 *
 *     rythme de mission → planning rempli d'office → ajustements → CRA
 *
 * On déclare une fois « je travaille lundi à jeudi, et le vendredi à
 * mi-temps », le planning se remplit tout seul, on corrige à la semaine ce
 * qui s'est passé autrement, et le compte rendu d'activité tombe à la fin.
 *
 * Deux faits seulement sont donc conservés : le RYTHME et les AJUSTEMENTS.
 * Le planning et le CRA sont dérivés — les stocker les ferait diverger de
 * leurs sources dès la première correction, ce qui est le défaut que ce
 * projet combat partout ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ORDRE DE PRIORITÉ EST UNE RÈGLE, PAS UNE COMMODITÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un ajustement l'emporte TOUJOURS sur le rythme, y compris pour dire « je
 * n'ai pas travaillé ». Sans cela, effacer une journée serait impossible :
 * le rythme la remettrait à chaque calcul, et le CRA facturerait un jour
 * qui n'a pas eu lieu.
 *
 * Un jour férié ou un week-end ne se travaille pas — sauf ajustement
 * explicite. Cette exception compte : les astreintes et les rendus de nuit
 * existent, et un CRA qui les efface fait perdre de l'argent.
 */

/** Quotité travaillée un jour donné : 0, 0,5 ou 1 dans l'usage courant. */
export type Quotite = number;

/** Les sept jours, du lundi au dimanche, tels que l'ancienne app les nomme. */
export const JOURS_SEMAINE = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const;
export type JourDeSemaine = typeof JOURS_SEMAINE[number];

/**
 * Un rythme de travail, sur une plage de dates.
 *
 * Le TJM y figure parce qu'il change en cours de mission : une renégociation
 * en juin ne doit pas réécrire ce qui a été facturé en mai.
 */
export interface Rythme {
  readonly du: DateISO;
  readonly au: DateISO;
  readonly parJour: Readonly<Partial<Record<JourDeSemaine, Quotite>>>;
  /** TJM de la période. `null` quand celui de la mission s'applique. */
  readonly tjm: Euros | null;
}

/** Ce qui a réellement été travaillé un jour donné, quand ça diffère du rythme. */
export type Ajustements = Readonly<Record<string, Quotite>>;

export interface JourPlanifie {
  readonly date: DateISO;
  /** Ce que le rythme prévoit, avant tout ajustement. */
  readonly prevu: Quotite;
  /** Ce qui compte réellement : ajustement s'il existe, rythme sinon. */
  readonly retenu: Quotite;
  readonly ajuste: boolean;
  readonly ferie: boolean;
  readonly weekEnd: boolean;
  /** Quotité de congé posée ce jour-là : 0, 0,5 ou 1. */
  readonly conge: Quotite;
}

/** Le jour de la semaine d'une date ISO, sans dépendre du fuseau local. */
export function jourDeSemaine(date: DateISO): JourDeSemaine {
  // `getUTCDay()` rend 0 pour dimanche ; nos clés commencent au lundi.
  const n = new Date(`${date}T00:00:00Z`).getUTCDay();
  return JOURS_SEMAINE[(n + 6) % 7] as JourDeSemaine;
}

/** Le rythme qui couvre une date, ou `undefined`. Le dernier déclaré l'emporte. */
export function rythmePour(date: DateISO, rythmes: readonly Rythme[]): Rythme | undefined {
  // Parcours à l'envers : quand deux rythmes se chevauchent — ce que
  // l'ancienne application autorisait — le plus récemment déclaré décrit
  // l'intention la plus fraîche.
  for (let i = rythmes.length - 1; i >= 0; i -= 1) {
    const r = rythmes[i] as Rythme;
    if (date >= r.du && date <= r.au) return r;
  }
  return undefined;
}

/** Ce que le rythme prévoit pour une date, hors ajustement. */
export function quotitePrevue(date: DateISO, rythmes: readonly Rythme[]): Quotite {
  const r = rythmePour(date, rythmes);
  return r === undefined ? 0 : r.parJour[jourDeSemaine(date)] ?? 0;
}

/**
 * Le planning d'une plage de dates.
 *
 * `feries` et `conges` viennent du contexte : ce module ne sait pas calculer
 * Pâques ni lire les faits, et n'a pas à le savoir.
 */
export function planifier(
  dates: readonly DateISO[],
  {
    rythmes, ajustements, feries, conges
  }: {
    readonly rythmes: readonly Rythme[];
    readonly ajustements: Ajustements;
    readonly feries: ReadonlySet<string>;
    /** Quotité de congé par date. Absent = aucun congé. */
    readonly conges: Readonly<Record<string, Quotite>>;
  }
): readonly JourPlanifie[] {
  return dates.map((date) => {
    const jour = jourDeSemaine(date);
    const weekEnd = jour === 'sam' || jour === 'dim';
    const ferie = feries.has(date);
    const conge = conges[date] ?? 0;

    const prevuBrut = quotitePrevue(date, rythmes);
    // Ni les fériés ni les week-ends ne sont prévus par le rythme : les
    // laisser passer gonflerait le CRA de journées que personne n'a
    // travaillées.
    const prevu = weekEnd || ferie ? 0 : Math.max(0, prevuBrut - conge);

    const ajuste = Object.hasOwn(ajustements, date);
    // L'ajustement l'emporte TOUJOURS, y compris à zéro et y compris un jour
    // férié : c'est la seule façon de dire « j'ai travaillé ce jour-là », ou
    // « finalement non ».
    const retenu = ajuste ? (ajustements[date] as Quotite) : prevu;

    return { date, prevu, retenu, ajuste, ferie, weekEnd, conge };
  });
}

export interface LigneCra {
  readonly date: DateISO;
  readonly quotite: Quotite;
}

export interface Cra {
  readonly mois: Mois;
  readonly lignes: readonly LigneCra[];
  readonly totalJours: Quotite;
  /** Valorisation au TJM en vigueur à chaque date. */
  readonly montant: Euros;
}

/**
 * Le compte rendu d'activité d'un mois — le livrable.
 *
 * Seuls les jours effectivement travaillés y figurent : un CRA qui liste des
 * zéros n'est pas plus complet, il est seulement plus long à relire, et le
 * client le signe moins volontiers.
 *
 * Chaque jour est valorisé au TJM en vigueur À SA DATE. Appliquer le tarif du
 * jour de l'édition réécrirait le passé à chaque renégociation.
 */
export function craDuMois(
  mois: Mois,
  planning: readonly JourPlanifie[],
  rythmes: readonly Rythme[],
  tjmMission: Euros
): Cra {
  const lignes = planning
    .filter((j) => j.date.startsWith(mois) && j.retenu > 0)
    .map((j) => ({ date: j.date, quotite: j.retenu }));

  const totalJours = lignes.reduce((s, l) => s + l.quotite, 0);
  const montant = lignes.reduce((s, l) => {
    const r = rythmePour(l.date, rythmes);
    const tjm = r?.tjm ?? tjmMission;
    return s + l.quotite * tjm;
  }, 0);

  return { mois, lignes, totalJours, montant: euros(montant) };
}
