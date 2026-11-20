import type { Mois } from '../types';
import type { PeriodeBareme } from './urssaf';

/*
 * Le contrôle d'une période saisie, à part de `urssaf.ts` : seul l'écran du
 * barème, chargé à la demande, s'en sert, et ses deux refus — deux longues
 * phrases — pesaient dans le paquet de premier rendu, que `urssaf.ts` habite
 * parce que le Pilote calcule des cotisations. Le paquet d'entrée a franchi
 * son plafond au lot 34-bis en recevant le barème de la Cipav ; l'invariant
 * n°7 dit d'extraire ce qui n'y a rien à faire, et c'est ceci.
 */

/** Refus motivé d'un ajout, ou `null` quand l'ajout est recevable. */
export function validerAjout(
  existantes: readonly PeriodeBareme[],
  nouvelle: { readonly du: Mois; readonly source: string }
): string | null {
  if (nouvelle.source.trim() === '') {
    return 'Une source est obligatoire : d\'où vient ce taux ? '
      + 'Un taux sans provenance ne peut pas être vérifié plus tard.';
  }

  const derniereConnue = existantes[existantes.length - 1];
  if (derniereConnue === undefined) return null;

  // Le point dur : recalculer un trimestre passé doit redonner le montant
  // réellement déclaré à l'époque. Réécrire une période close le rendrait
  // impossible, et ferait diverger l'application des déclarations envoyées.
  const couvre = existantes.find((per) => nouvelle.du > per.du && (per.au === null || nouvelle.du <= per.au));
  if (couvre !== undefined && couvre.au !== null) {
    return `La période ${nouvelle.du} tombe à l'intérieur d'une période close `
      + `(${couvre.du} à ${couvre.au}). Modifier un barème passé ferait diverger `
      + 'les recalculs des déclarations déjà envoyées. Seul un début de période '
      + 'existant peut être corrigé, à l\'identique.';
  }

  return null;
}
