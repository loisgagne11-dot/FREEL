/**
 * Jours fériés et jours d'un mois, sans le reste du plan de charge.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EST À PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La provision d'impôt lit le pipeline des encaissements attendus, donc le
 * planning, donc ces jours. Importer `activite.ts` pour eux faisait entrer
 * dans le paquet de premier rendu tout le plan de charge, que seul l'écran
 * Activité lit : le budget d'entrée a signalé +3 Ko. Les règles (Pâques, les
 * onze fériés légaux) sont décrites dans l'en-tête d'`activite.ts`.
 */

import type { DateISO, Mois } from '../types';

/**
 * Zone d'application des jours fériés.
 *
 * L'Alsace-Moselle conserve deux jours fériés supplémentaires du droit local :
 * le Vendredi saint et la Saint-Étienne. Les ignorer ferait surestimer les
 * jours ouvrés — et donc sous-estimer l'occupation — pour qui y travaille.
 */
export type ZoneFeries = 'general' | 'alsace_moselle';

/**
 * Dimanche de Pâques, par le comput grégorien (algorithme de Meeus).
 *
 * Quatre des onze jours fériés en découlent. Le calcul est reproduit ici parce
 * qu'aucune dépendance ne mérite d'être ajoutée pour vingt lignes, et parce
 * qu'une table de dates serait à compléter chaque année.
 */
export function paques(annee: number): DateISO {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return dateDe(annee, mois, jour);
}

export function dateDe(annee: number, mois: number, jour: number): DateISO {
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}` as DateISO;
}

/** Décale une date ISO d'un nombre de jours, sans passer par le fuseau local. */
export function decaler(d: DateISO, jours: number): DateISO {
  const t = Date.UTC(
    Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))
  ) + jours * 86_400_000;
  return new Date(t).toISOString().slice(0, 10) as DateISO;
}

/**
 * Les jours fériés légaux d'une année.
 *
 * Le 1er mai est le seul obligatoirement chômé ; les autres le sont par usage.
 * La distinction ne change rien ici : un indépendant qui ne facture pas ces
 * jours-là ne doit pas les voir comptés dans son dénominateur.
 */
export function joursFeries(annee: number, zone: ZoneFeries = 'general'): readonly DateISO[] {
  const p = paques(annee);
  const dates: DateISO[] = [
    dateDe(annee, 1, 1),    // Jour de l'an
    decaler(p, 1),          // Lundi de Pâques
    dateDe(annee, 5, 1),    // Fête du Travail
    dateDe(annee, 5, 8),    // Victoire 1945
    decaler(p, 39),         // Ascension
    decaler(p, 50),         // Lundi de Pentecôte
    dateDe(annee, 7, 14),   // Fête nationale
    dateDe(annee, 8, 15),   // Assomption
    dateDe(annee, 11, 1),   // Toussaint
    dateDe(annee, 11, 11),  // Armistice 1918
    dateDe(annee, 12, 25)   // Noël
  ];
  if (zone === 'alsace_moselle') {
    dates.push(decaler(p, -2)); // Vendredi saint
    dates.push(dateDe(annee, 12, 26)); // Saint-Étienne
  }
  return [...dates].sort();
}

/** Un samedi ou un dimanche. */
export function estWeekEnd(d: DateISO): boolean {
  const jour = new Date(`${d}T00:00:00Z`).getUTCDay();
  return jour === 0 || jour === 6;
}

/** Toutes les dates d'un mois, dans l'ordre. */
export function joursDuMois(m: Mois): readonly DateISO[] {
  const annee = Number(m.slice(0, 4));
  const mois = Number(m.slice(5, 7));
  const nombre = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  const dates: DateISO[] = [];
  for (let j = 1; j <= nombre; j++) dates.push(dateDe(annee, mois, j));
  return dates;
}
