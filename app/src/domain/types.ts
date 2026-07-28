/**
 * Types du domaine fiscal.
 *
 * Les types nominaux qui suivent existent pour une raison précise : dans
 * l'application précédente, un taux, un montant et un pourcentage étaient
 * tous des `number`, si bien que `montant * taux` et `taux * montant` se
 * compilaient aussi bien qu'une addition de deux euros et d'un ratio. Ici,
 * le compilateur refuse.
 */

/** Un montant en euros. Toujours arrondi au centime au moment d'être stocké. */
export type Euros = number & { readonly __marque: 'Euros' };

/** Un ratio entre 0 et 1. 0.261 signifie 26,1 %. */
export type Ratio = number & { readonly __marque: 'Ratio' };

/** Un mois au format 'YYYY-MM'. La granularité de toutes les périodes fiscales. */
export type Mois = string & { readonly __marque: 'Mois' };

/** Une date au format 'YYYY-MM-DD'. */
export type DateISO = string & { readonly __marque: 'DateISO' };

export const euros = (n: number): Euros => Math.round(n * 100) / 100 as Euros;
export const ratio = (n: number): Ratio => n as Ratio;

/** Construit un Mois, en refusant tout ce qui n'en est pas un. */
export function mois(valeur: string): Mois {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(valeur)) {
    throw new RangeError(`Mois invalide : "${valeur}" (attendu 'YYYY-MM')`);
  }
  return valeur as Mois;
}

export function dateISO(valeur: string): DateISO {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    throw new RangeError(`Date invalide : "${valeur}" (attendu 'YYYY-MM-DD')`);
  }
  return valeur as DateISO;
}

/** Le mois d'une date. */
export const moisDe = (d: DateISO): Mois => d.slice(0, 7) as Mois;

/**
 * Type d'activité au sens du régime micro. Détermine le taux de
 * cotisations, l'abattement et le plafond de chiffre d'affaires.
 */
export type TypeActivite = 'BNC' | 'BIC_vente' | 'BIC_service';

/**
 * Résultat d'une résolution de barème.
 *
 * Un barème peut être absent, et cette absence n'est pas un cas d'erreur
 * exceptionnel : c'est un état normal, qui arrive chaque fois qu'un taux
 * n'a pas encore été publié. Le type force donc l'appelant à traiter les
 * trois cas, au lieu de recevoir un nombre dont il ignore la fiabilité.
 *
 * - `publie`   : valeur officielle, couvrant la période demandée
 * - `hypothese`: valeur extrapolée vers le futur, utilisable en PRÉVISION
 *                seulement, et à afficher comme telle
 * - `refuse`   : aucune valeur défendable. Un chiffre qui engage doit
 *                s'abstenir de s'afficher.
 */
export type Resolution<T> =
  | { readonly statut: 'publie'; readonly valeur: T; readonly source: string; readonly verifieLe: DateISO }
  | { readonly statut: 'hypothese'; readonly valeur: T; readonly source: string; readonly verifieLe: DateISO; readonly depuis: Mois }
  | { readonly statut: 'refuse'; readonly motif: string };

/** Une valeur peut-elle servir à produire un montant qui engage l'utilisateur ? */
export function peutEngager<T>(r: Resolution<T>): r is Extract<Resolution<T>, { statut: 'publie' }> {
  return r.statut === 'publie';
}

/** Une valeur est-elle utilisable, ne serait-ce qu'en prévision ? */
export function estUtilisable<T>(
  r: Resolution<T>
): r is Exclude<Resolution<T>, { statut: 'refuse' }> {
  return r.statut !== 'refuse';
}
