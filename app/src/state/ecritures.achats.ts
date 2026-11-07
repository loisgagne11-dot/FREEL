import type { MotifSansContrepartie } from '../domain/calculs/banque';
import type { EtatRapprochement } from '../domain/calculs/depenses';
import type { Depense, Faits } from './schema';
import { ecrireFaits, useFaits } from './store';

/**
 * Les écritures des dépenses et du relevé bancaire.
 *
 * Même motif que `ecritures.echeances` : aucune n'est déclenchable depuis le
 * Pilote, et le code d'entrée avait dépassé son budget. Elles appartiennent à
 * Achats et au relevé, chargés à la demande. Même état, même porte vers le
 * disque (`ecrireFaits`) : pas de second magasin.
 */

const faitsCourants = (): Faits => useFaits.getState().faits;

/**
 * Identifiant d'une nouvelle dépense — attribué ici, jamais par l'écran : deux
 * écrans qui les fabriqueraient chacun de leur côté finiraient par en produire
 * deux identiques. L'horloge seule ne suffit pas : deux ajouts dans la même
 * milliseconde — un import de plusieurs lignes — produiraient le même, et la
 * seconde dépense écraserait la première à la relecture.
 */
function identifiantDepense(existantes: readonly Depense[]): string {
  const connus = new Set(existantes.map((d) => d.id));
  let id = '';
  do {
    id = `dep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } while (connus.has(id));
  return id;
}

export function ajouterDepense(saisie: Omit<Depense, 'id'>): string {
  const actuel = faitsCourants();
  const id = identifiantDepense(actuel.depenses);
  ecrireFaits({ ...actuel, depenses: [...actuel.depenses, { ...saisie, id }] });
  return id;
}

/**
 * `id` est retiré de la modification par le type : une dépense ne change pas
 * d'identité, sinon les pièces qui la référencent la perdent.
 */
export function modifierDepense(id: string, modification: Partial<Omit<Depense, 'id'>>): void {
  const actuel = faitsCourants();
  ecrireFaits({
    ...actuel,
    depenses: actuel.depenses.map((d) => (d.id === id ? { ...d, ...modification } : d))
  });
}

export function supprimerDepense(id: string): void {
  const actuel = faitsCourants();
  ecrireFaits({ ...actuel, depenses: actuel.depenses.filter((d) => d.id !== id) });
}

/**
 * Rattache une pièce à une dépense — ou la détache avec `null`.
 *
 * C'est la seule action qui rend une TVA récupérable, et c'est voulu :
 * l'invariant « pas de TVA récupérable sans pièce » n'est pas contournable par
 * une autre porte.
 */
export function attacherJustificatif(id: string, justificatifId: string | null): void {
  modifierDepense(id, { justificatifId });
}

/** Corrige l'état de rapprochement d'une dépense. */
export function definirRapprochement(id: string, etat: EtatRapprochement): void {
  modifierDepense(id, { rapprochement: etat });
}

/**
 * Rattache un mouvement à une écriture — ou le détache avec `null`.
 *
 * L'appariement est une décision de l'utilisateur, jamais une déduction :
 * l'ancienne application appariait seule et n'en laissait aucune trace.
 * Rapprocher lève l'état « sans contrepartie » : les deux se contrediraient.
 */
export function rapprocherMouvement(mouvementId: string, ecritureId: string | null): void {
  const actuel = faitsCourants();
  ecrireFaits({
    ...actuel,
    mouvementsBancaires: actuel.mouvementsBancaires.map((m) =>
      (m.id === mouvementId ? { ...m, rapprocheAvec: ecritureId, sansContrepartie: null } : m))
  });
}

/**
 * Déclare qu'aucune écriture ne correspond, et POURQUOI : `remuneration` pour
 * un virement qu'on s'est versé, `autre` pour des frais ou un remboursement,
 * `null` pour remettre le mouvement dans la file « à traiter ». Le motif ne
 * change aucun total ; il permet de répondre à « combien me suis-je versé ce
 * mois-ci ».
 */
export function marquerSansContrepartie(mouvementId: string, motif: MotifSansContrepartie | null): void {
  const actuel = faitsCourants();
  ecrireFaits({
    ...actuel,
    mouvementsBancaires: actuel.mouvementsBancaires.map((m) =>
      (m.id === mouvementId ? { ...m, sansContrepartie: motif, rapprocheAvec: null } : m))
  });
}

/** Efface tous les mouvements importés. Ne touche à aucune écriture. */
export function viderReleve(): void {
  ecrireFaits({ ...faitsCourants(), mouvementsBancaires: [] });
}
