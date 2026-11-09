/**
 * Le calcul du planning d'une plage de dates, sans le CRA ni la saisie.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EST À PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le pipeline des encaissements attendus a besoin de `planifier` pour valoriser
 * le planning à venir, et il entre au premier rendu avec la provision d'impôt.
 * Le laisser dans `planning.ts` y faisait entrer aussi la saisie par créneau et
 * le CRA, que seul l'écran Activité lit. Les règles de priorité (l'ajustement
 * l'emporte toujours) sont décrites dans l'en-tête de `planning.ts`.
 */

import type { DateISO } from '../types';
import type { Ajustements, JourPlanifie, Quotite, Rythme } from './planning';

/** Les sept jours, du lundi au dimanche, tels que l'ancienne app les nomme. */
export const JOURS_SEMAINE = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const;
export type JourDeSemaine = typeof JOURS_SEMAINE[number];

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
    const pose = ajustements[date];
    const retenu = ajuste && pose !== undefined ? pose.quotite : prevu;

    return {
      date, prevu, retenu, ajuste, ferie, weekEnd, conge,
      creneaux: pose?.creneaux ?? null,
      lieu: pose?.lieu ?? null
    };
  });
}
