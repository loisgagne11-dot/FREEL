/**
 * Le plafond de revenu fiscal de référence au-delà duquel le versement
 * libératoire n'est pas ouvert (CGI art. 151-0).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN NOMBRE QUI NE SE RECOPIE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Pour opter en année Y, le revenu fiscal de référence de Y−2 ne doit pas
 * dépasser, pour une part, la limite supérieure de la DEUXIÈME tranche du
 * barème fixé l'année précédant l'option — celui des revenus de Y−2. Majoré de
 * 50 % par demi-part et de 25 % par quart : le plafond vaut cette limite fois
 * le nombre de parts. 29 315 € pour 2026 (barème des revenus 2024), 29 579 €
 * pour 2027 (revenus 2025).
 *
 * Ces montants ne sont écrits nulle part ici : ils se lisent sur les tranches
 * de `PERIODES_IR`. Une copie aurait sa propre date de vérification, et le jour
 * où le barème des revenus 2026 entre dans `impot.ts`, le plafond de 2028 se
 * trouverait sans personne pour le recopier.
 *
 * Un barème qui manque REFUSE : `baremeIR` reprend le dernier millésime en
 * hypothèse vers le futur, ce qui vaut pour une provision qui sera corrigée,
 * pas pour un droit d'opter. Un plafond reconduit d'un an trop bas de
 * quelques centaines d'euros dirait « non » à qui a le droit — ou « oui » à
 * qui ne l'a pas, et l'option se paierait d'un rappel.
 *
 * Chargé avec le seul comparateur : rien de ceci n'a sa place au premier
 * rendu.
 */

import { type DateISO, type Euros, type Resolution, dateISO, euros, mois } from '../types';
import { periodeTranchesIRPour } from './impot';

export function plafondRfrVersementLiberatoire(annee: number, parts: number | null): Resolution<Euros> {
  const revenus = annee - 2;
  const periode = periodeTranchesIRPour(mois(`${revenus}-01`));
  // L'index, et non le taux de 11 % : le texte dit « deuxième tranche », et
  // c'est la deuxième qu'il vise si une loi de finances en change le taux.
  const limite = periode?.tranches[2]?.seuil;
  if (periode === undefined || limite === undefined) {
    return {
      statut: 'refuse',
      motif: `Le barème de l’impôt sur les revenus ${revenus} n’est pas dans l’application : `
        + `le plafond de ${annee} ne se devine pas. Il vaut la limite haute de la deuxième tranche `
        + `de ce barème, par part.`
    };
  }
  return {
    statut: 'publie',
    valeur: euros(limite * (parts ?? 1)),
    source: `CGI art. 151-0 ; limite haute de la deuxième tranche du barème des revenus ${revenus} — `
      + periode.source,
    verifieLe: periode.verifieLe
  };
}

/**
 * L'année pour laquelle une option prise aujourd'hui vaudrait.
 *
 * L'année suivante — l'option se demande au plus tard le 30 septembre, pour le
 * 1er janvier —, sauf dans les premiers mois d'activité : à la création,
 * l'option se demande jusqu'au dernier jour du troisième mois qui suit, et
 * vaut dès le début. Annoncer le plafond de l'an prochain à qui crée en
 * février et peut encore opter pour cette année-ci lui ferait vérifier le
 * mauvais revenu.
 */
export function anneeDOptionVl(aujourdhui: DateISO, debutActivite: DateISO | null): number {
  if (debutActivite !== null) {
    const a = Number(debutActivite.slice(0, 4));
    // Le premier jour du quatrième mois qui suit celui du début : la fin du
    // troisième en est la veille. Février → 1er juin ; novembre → 1er mars.
    const m = Number(debutActivite.slice(5, 7)) + 4;
    const lendemainLimite = dateISO(`${a + Math.floor((m - 1) / 12)}-${String(((m - 1) % 12) + 1).padStart(2, '0')}-01`);
    if (aujourdhui < lendemainLimite) return a;
  }
  return Number(aujourdhui.slice(0, 4)) + 1;
}
