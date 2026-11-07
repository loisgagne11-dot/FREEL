import { type Euros, euros } from '../types';
import type { MouvementBancaire } from './banque';

/*
 * Isolée de `banque.ts` pour le paquet d'entrée : le solde est calculé au
 * premier rendu, et cette addition de trois lignes y tirait tout le module —
 * import de relevé, empreintes, recherche des candidats au rapprochement —
 * qu'aucun écran du premier rendu n'emploie. 1,4 Ko quand le code d'entrée
 * venait de franchir son budget.
 */

/**
 * Solde initial plus la somme d'un ensemble de mouvements.
 *
 * Volontairement générique dans ce qu'elle reçoit : elle sert au solde
 * purement bancaire (tous les mouvements d'un relevé), mais aussi de brique à
 * `soldeDerive` (`./solde.ts`), qui ne lui passe que le sous-ensemble des
 * mouvements « sans contrepartie » pour ne pas compter deux fois ce que les
 * faits — recettes, dépenses, échéances — comptent déjà.
 *
 * Le SOLDE DE L'APPLICATION, celui qu'un écran doit afficher, n'est plus
 * cette fonction seule : voir `soldeDerive`, qui ajoute aux mouvements les
 * faits que le relevé ne reflète pas encore. Une source unique par notion
 * (invariant n°4) — cette fonction-ci n'en est qu'un rouage.
 */
export function soldeBancaire(
  soldeInitial: Euros,
  mouvements: readonly MouvementBancaire[]
): Euros {
  return euros(mouvements.reduce<number>((s, m) => s + m.montant, soldeInitial));
}
