/**
 * Formatage pour l'affichage. Aucun calcul ici : ces fonctions présentent des
 * valeurs déjà calculées par le domaine.
 *
 * Le format est français : espace insécable avant le symbole monétaire, virgule
 * décimale, séparateur de milliers. `Intl` s'en charge, et le faire à la main
 * produirait des écarts entre les écrans.
 */

const EUROS = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0
});

const EUROS_CENTIMES = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2
});

const POURCENT = new Intl.NumberFormat('fr-FR', {
  style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 2
});

/** Montant arrondi à l'euro. Le format d'affichage courant. */
export const eur = (montant: number): string => EUROS.format(montant);

/** Montant au centime, pour les écrans où le détail compte (déclarations, exports). */
export const eurExact = (montant: number): string => EUROS_CENTIMES.format(montant);

export const pct = (ratio: number): string => POURCENT.format(ratio);

/** Un mois 'YYYY-MM' en français lisible : « juillet 2026 ». */
export function moisLong(m: string): string {
  const [annee, mois] = m.split('-');
  if (annee === undefined || mois === undefined) return m;
  const d = new Date(Number(annee), Number(mois) - 1, 1);
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(d);
}

/**
 * Une date ISO en français court : « 10 juil. 2026 ».
 *
 * `null` rend un tiret cadratin et non une date du jour : une date inconnue
 * doit se voir, pas se deviner.
 */
export function dateCourte(d: string | null): string {
  if (d === null || d === '') return '—';
  const t = new Date(`${d}T00:00:00`);
  if (Number.isNaN(t.getTime())) return d;
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric'
  }).format(t);
}

/**
 * Nombre de mois en texte. `null` quand la valeur n'a pas de sens — l'ancienne
 * application affichait dans ce cas une autonomie fantaisiste.
 */
export function moisTexte(nombre: number | null): string {
  if (nombre === null) return '—';
  const arrondi = Math.round(nombre * 10) / 10;
  const valeur = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(arrondi);
  return `${valeur} mois`;
}

/**
 * Un nombre de jours travaillés.
 *
 * Une décimale au plus, et jamais d'arrondi à l'entier : un montant divisé par
 * un tarif tombe rarement juste, et arrondir ferait disparaître les
 * demi-journées — qui sont précisément ce dont on discute quand on regarde un
 * plan de charge.
 */
export function formaterJours(jours: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(jours);
}
