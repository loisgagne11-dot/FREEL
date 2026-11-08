/**
 * Dépenses récurrentes — DÉRIVÉES, jamais stockées.
 *
 * Une dépense est récurrente quand le même fournisseur a une dépense du même
 * montant dans le mois précédent OU le suivant. Un indicateur « récurrente »
 * saisi à la main se périmerait au premier abonnement résilié et ne dirait
 * plus rien ; dérivé des faits, il suit la réalité (invariant n°1).
 *
 * Précédent OU suivant, pas « les deux » : la première mensualité n'a pas de
 * précédente et la dernière pas de suivante, et ce sont pourtant des
 * mensualités. Exiger les deux n'accorderait le titre qu'aux mois du milieu.
 *
 * Le trou d'un mois ne rompt pas la récurrence des autres mois mais ne la
 * crée pas non plus : avril et juin sans mai ne sont pas voisins. Deux
 * dépenses le même mois ne sont pas non plus récurrentes — un achat fait deux
 * fois n'est pas un abonnement.
 */

import type { Depense } from './depenses';

/** Un euro d'écart : une mensualité varie de quelques centimes (change, TVA). */
export const TOLERANCE_RECURRENCE_EUROS = 1;

/** Casse, accents et espaces : « OVH Cloud » et « ovh  cloud » sont le même. */
export function normaliserFournisseur(nom: string): string {
  return nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const indexMois = (date: string): number =>
  Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;

/**
 * Les identifiants des dépenses récurrentes.
 *
 * Un fournisseur vide n'apparie rien : « sans fournisseur » n'est pas un
 * fournisseur, et deux achats anonymes de même montant ne font pas un
 * abonnement. Une dépense sans date n'a pas de mois voisin.
 */
export function depensesRecurrentes(depenses: readonly Depense[]): ReadonlySet<string> {
  const parFournisseur = new Map<string, Depense[]>();
  for (const d of depenses) {
    const cle = normaliserFournisseur(d.fournisseur);
    if (cle === '' || d.payeeLe === null) continue;
    parFournisseur.set(cle, [...(parFournisseur.get(cle) ?? []), d]);
  }

  const recurrentes = new Set<string>();
  for (const groupe of parFournisseur.values()) {
    for (const d of groupe) {
      const m = indexMois(d.payeeLe as string);
      const voisine = groupe.some((autre) =>
        autre.id !== d.id
        && autre.payeeLe !== null
        && Math.abs(indexMois(autre.payeeLe) - m) === 1
        && Math.abs(autre.montantTtc - d.montantTtc) <= TOLERANCE_RECURRENCE_EUROS);
      if (voisine) recurrentes.add(d.id);
    }
  }
  return recurrentes;
}
