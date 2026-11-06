import type { Resolution } from '../domain/types';

/*
 * Lire une Resolution dans un test sans jamais laisser le test se vider.
 *
 * Contre-exemple qui a motivé ce fichier : `if (r.statut === 'refuse') return;`
 * placé avant les assertions. Le jour où le calcul se met à s'abstenir, le test
 * sort avant sa première vérification et reste vert, sans rien tenir. Ici, un
 * refus ou une absence LÈVE : le test échoue, avec le motif dans le message.
 */

/** Rend la valeur d'une résolution `publie` ou `hypothese` ; lève sinon. */
export function valeurPubliee<T>(r: Resolution<T> | null | undefined): T {
  if (r === null || r === undefined) {
    throw new Error('Résolution absente : le calcul ne rend rien là où une valeur est attendue.');
  }
  if (r.statut === 'refuse') {
    throw new Error(`Résolution refusée alors qu'une valeur est attendue : ${r.motif}`);
  }
  return r.valeur;
}

/** Rend le motif d'un refus ; lève si la résolution porte une valeur ou manque. */
export function valeurRefusee<T>(r: Resolution<T> | null | undefined): string {
  if (r === null || r === undefined) {
    throw new Error('Résolution absente : un refus motivé était attendu.');
  }
  if (r.statut !== 'refuse') {
    throw new Error(`Résolution ${r.statut} alors qu'un refus était attendu.`);
  }
  return r.motif;
}
