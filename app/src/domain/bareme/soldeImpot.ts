import { type DateISO, type Euros, type Resolution, dateISO, euros, mois } from '../types';

/**
 * Le paiement du solde de l'impôt sur le revenu : combien de prélèvements, et
 * quand.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE OFFICIELLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le solde de l'année N-1, révélé par l'avis d'imposition de l'été N, est
 * prélevé :
 *   · en UNE fois, fin septembre, s'il ne dépasse pas 300 € ;
 *   · en QUATRE prélèvements égaux, de septembre à décembre, au-delà ;
 *   · en DEUX prélèvements, fin novembre et fin décembre, pour un avis édité
 *     tardivement (en octobre).
 *
 * Sources :
 *   impots.gouv.fr, « Le montant de mon impôt ou taxe est supérieur à 300 €,
 *     comment dois-je payer ? » ;
 *   impots.gouv.fr, « PART 25/09/2026 Impôt sur le revenu-prélèvements
 *     sociaux : date de prélèvement » ;
 *   economie.gouv.fr, « Impôt : vos échéances du mois » (avis tardifs).
 *   Relevé le 11/11/2026 (liste de sortie, dates officielles).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LE CAS DU PROPRIÉTAIRE PASSE PAR ICI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Première année d'activité sans acompte : à l'automne suivant, il paie
 * chaque mois le quart du solde de l'année écoulée ET l'acompte de l'année en
 * cours, qui démarre en septembre. Deux séries le même mois, qui règlent deux
 * années différentes. Les saisir à la main obligeait à découper l'avis en
 * quatre, à retrouver les dates, et à ne pas se tromper d'exercice — sans
 * quoi le solde passait pour un acompte et la provision le comptait deux
 * fois. La règle le fait.
 */

/** Au-delà de ce montant, le solde est étalé. */
export const SEUIL_ETALEMENT_SOLDE = euros(300);

/**
 * Les dates PUBLIÉES par l'administration, année par année.
 *
 * Elles ne suivent pas une règle simple — le 25 novembre 2026 était un jour
 * ouvré, le prélèvement a eu lieu le 26 : on ne les calcule pas, on les lit.
 */
const DATES_PUBLIEES: Readonly<Record<number, { readonly normal: readonly string[]; readonly tardif: readonly string[] }>> = {
  2026: {
    normal: ['2026-09-25', '2026-10-26', '2026-11-26', '2026-12-28'],
    tardif: ['2026-11-25', '2026-12-28']
  }
};

const SOURCE = 'impots.gouv.fr — paiement du solde de l’impôt sur le revenu (au-delà de 300 €, quatre prélèvements de septembre à décembre)';
const VERIFIE_LE = dateISO('2026-11-11');

/**
 * Une date approchée pour une année non relevée : le 25 du mois, ou le jour
 * ouvré suivant (samedi, dimanche, 25 décembre). Une hypothèse, dite comme
 * telle : la date exacte est sur l'avis.
 */
function vingtCinqOuvre(annee: number, mois: number): DateISO {
  const d = new Date(Date.UTC(annee, mois - 1, 25));
  const ferie = (x: Date) => x.getUTCMonth() === 11 && x.getUTCDate() === 25;
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || ferie(d)) d.setUTCDate(d.getUTCDate() + 1);
  return dateISO(d.toISOString().slice(0, 10));
}

export interface PrelevementDuSolde {
  readonly date: DateISO;
  readonly montant: Euros;
}

/**
 * Les prélèvements du solde d'un avis.
 *
 * `annee` est l'année des PRÉLÈVEMENTS (N), pas celle des revenus (N-1).
 * Les parts sont égales au centime ; ce que la division laisse va au dernier
 * prélèvement, pour que la somme retombe exactement sur l'avis.
 *
 * `publie` pour une année dont les dates sont relevées, `hypothese` sinon :
 * la date approchée se corrige ensuite, échéance par échéance.
 */
export function prelevementsDuSolde(
  montantDeLAvis: Euros,
  annee: number,
  avisTardif = false
): Resolution<readonly PrelevementDuSolde[]> {
  if (!(montantDeLAvis > 0)) {
    return { statut: 'refuse', motif: 'Le solde de l’avis doit être un montant positif.' };
  }
  const publiees = DATES_PUBLIEES[annee];
  const dates: readonly DateISO[] = publiees !== undefined
    ? (avisTardif ? publiees.tardif : publiees.normal).map(dateISO)
    : (avisTardif ? [11, 12] : [9, 10, 11, 12]).map((m) => vingtCinqOuvre(annee, m));

  const nombre = montantDeLAvis <= SEUIL_ETALEMENT_SOLDE ? 1 : dates.length;
  const centimes = Math.round(montantDeLAvis * 100);
  const part = Math.floor(centimes / nombre);
  const prelevements = dates.slice(0, nombre).map((date, i) => ({
    date,
    montant: euros((i === nombre - 1 ? centimes - part * (nombre - 1) : part) / 100)
  }));

  return publiees !== undefined
    ? { statut: 'publie', valeur: prelevements, source: SOURCE, verifieLe: VERIFIE_LE }
    : {
      statut: 'hypothese',
      valeur: prelevements,
      source: `${SOURCE} — dates de ${annee} non relevées : le 25 du mois, ou le jour ouvré suivant`,
      verifieLe: VERIFIE_LE,
      depuis: mois(`${annee}-${avisTardif ? '11' : '09'}`)
    };
}
