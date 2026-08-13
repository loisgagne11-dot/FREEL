import type { DateISO } from '../types';

/**
 * Répéter une échéance dans le temps.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE COMMODITÉ DE SAISIE, PAS UN NOUVEAU FAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un échéancier URSSAF trimestriel donne quatre appels par an, tous connus
 * d'avance. Les saisir un par un est trois fois trop de travail — mais en
 * faire une « échéance récurrente » stockée comme telle serait pire.
 *
 * L'ancienne application avait ce concept, et il produisait le défaut qu'on
 * retrouve partout chez elle : une règle d'un côté, des instances de l'autre,
 * et rien pour dire laquelle fait foi quand un appel réel diffère de la règle.
 * Or il diffère : le dernier trimestre est régularisé, un taux change, un mois
 * est reporté.
 *
 * Ici la répétition ne produit RIEN de nouveau. Elle crée N échéances
 * ordinaires, en une fois, et s'efface. Chacune reste ensuite corrigeable,
 * supprimable et marquable payée indépendamment des autres — parce que c'est
 * ce qui va arriver.
 */

export type Cadence = 'mensuelle' | 'trimestrielle';

/** Nombre d'occurrences maximal. Au-delà, on saisit un échéancier, pas une vie. */
export const REPETITIONS_MAX = 12;

/**
 * Les dates d'une série, la première comprise.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE 31 N'EXISTE PAS TOUS LES MOIS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ajouter un mois au 31 janvier donne le 31 février, que `Date` interprète
 * comme le 3 mars. Une échéance sauterait donc un mois, silencieusement, et
 * l'utilisateur découvrirait le trou en fin d'année.
 *
 * La date est donc ramenée au dernier jour du mois visé quand le quantième
 * n'y existe pas : le 31 janvier répété donne le 28 février, puis le 31 mars.
 * On conserve le quantième d'origine pour les mois qui l'acceptent, plutôt que
 * de le raboter une fois pour toutes — sans quoi une série partie du 31
 * finirait toute entière au 28.
 */
export function datesRepetees(
  premiere: DateISO, cadence: Cadence, nombre: number
): readonly DateISO[] {
  const total = Math.max(1, Math.min(REPETITIONS_MAX, Math.trunc(nombre)));
  const pas = cadence === 'mensuelle' ? 1 : 3;

  const annee = Number(premiere.slice(0, 4));
  const mois = Number(premiere.slice(5, 7));
  const quantieme = Number(premiere.slice(8, 10));
  if (!Number.isFinite(annee) || !Number.isFinite(mois) || !Number.isFinite(quantieme)) {
    return [premiere];
  }

  const dates: DateISO[] = [];
  for (let i = 0; i < total; i += 1) {
    const absolu = (annee * 12 + (mois - 1)) + i * pas;
    const a = Math.floor(absolu / 12);
    const m = (absolu % 12) + 1;
    const jour = Math.min(quantieme, joursDuMois(a, m));
    dates.push(
      `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(jour).padStart(2, '0')}` as DateISO
    );
  }
  return dates;
}

/** Le 0 du mois suivant, en UTC : le dernier jour du mois demandé. */
function joursDuMois(annee: number, mois: number): number {
  return new Date(Date.UTC(annee, mois, 0)).getUTCDate();
}
