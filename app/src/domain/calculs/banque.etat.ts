import type { MouvementBancaire } from './banque';

/*
 * Isolé de `banque.ts` pour le paquet d'entrée, comme `banque.solde.ts` avant
 * lui : le solde calculé au premier rendu doit savoir si un mouvement attend
 * une décision, et cet unique test importé depuis `banque.ts` y ramenait tout
 * le module — import de relevé, empreintes, candidats au rapprochement —,
 * 1,3 Ko qu'aucun écran du premier rendu n'emploie.
 */

/** Ni rapprochée, ni pointée sans contrepartie, ni ignorée : elle attend une décision. */
export function estATraiter(m: MouvementBancaire): boolean {
  return m.rapprocheAvec === null && m.sansContrepartie === null && !m.ignoree;
}
