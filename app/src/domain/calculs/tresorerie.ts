/**
 * Trésorerie : « combien je peux me verser sans me mettre en danger ».
 *
 * C'est la question à laquelle l'application existe pour répondre, donc le
 * chiffre le plus regardé et le plus dangereux à se tromper.
 *
 *   dispo    = solde − provisions
 *   versable = max(0, dispo − réserve)
 *
 * La réserve est un MONTANT ABSOLU, réglé au curseur sur l'écran Pilote
 * (décision D4). L'ancienne version en avait trois implémentations
 * concurrentes — un montant dans le store, un curseur en pourcentage sur
 * Argent > Performance, et un pourcentage dans Config non câblé. Une seule
 * source subsiste ici, et un seul écran l'écrit.
 */

import { type Euros, euros } from '../types';
import type { DetailProvisions } from './provisions';

export interface EtatTresorerie {
  /** Solde bancaire réel, tel que constaté sur le compte. */
  readonly solde: Euros;
  /** Matelas de sécurité, montant absolu (D4). */
  readonly reserve: Euros;
}

export interface ResultatTresorerie {
  readonly solde: Euros;
  readonly provisions: Euros;
  /** Ce qui reste après avoir mis de côté ce qui est dû. Peut être négatif. */
  readonly dispo: Euros;
  readonly reserve: Euros;
  /** Ce qu'on peut se verser. Jamais négatif : on ne se verse pas une dette. */
  readonly versable: Euros;
  /**
   * `true` si le calcul est incomplet parce que le barème ne couvre pas
   * certaines recettes. Le montant affiché est alors SOUS-ÉVALUÉ, et
   * l'interface doit le signaler plutôt que de le présenter comme un
   * résultat : un versable trop élevé conduit à se verser de l'argent dû.
   */
  readonly incomplet: boolean;
  readonly motifsIncomplets: readonly string[];
}

export function calculerTresorerie(
  etat: EtatTresorerie,
  detail: DetailProvisions
): ResultatTresorerie {
  const dispo = euros(etat.solde - detail.total);
  // `versable` est borné à zéro : un dispo négatif signifie que les dettes
  // excèdent le solde, situation qu'il faut montrer telle quelle sur `dispo`
  // sans pour autant proposer un versement négatif.
  const versable = euros(Math.max(0, dispo - etat.reserve));

  return {
    solde: etat.solde,
    provisions: detail.total,
    dispo,
    reserve: etat.reserve,
    versable,
    // L'impôt sur le revenu non provisionné entre par la même porte que les
    // recettes non calculables : ce sont deux façons de rendre le total
    // sous-évalué, et l'écran doit les dire de la même manière. Le distinguer
    // aurait laissé un écran ne traiter que l'une des deux.
    incomplet: detail.recettesNonCalculables.length > 0
      || detail.impotRevenuNonProvisionne !== null,
    motifsIncomplets: [
      ...detail.recettesNonCalculables.map((r) => r.motif),
      ...(detail.impotRevenuNonProvisionne !== null ? [detail.impotRevenuNonProvisionne] : [])
    ]
  };
}

/**
 * Autonomie : combien de mois le versable couvre-t-il le train de vie.
 *
 * `null` quand le besoin mensuel n'est pas renseigné ou nul — l'ancienne
 * version affichait dans ce cas une autonomie fantaisiste qui bondissait sans
 * cause réelle (au 1er janvier, les dépenses de l'année tombant à zéro,
 * l'autonomie passait de 5,3 à 9,3 mois).
 */
export function autonomieMois(versable: Euros, besoinMensuel: Euros): number | null {
  if (besoinMensuel <= 0) return null;
  return Math.round((versable / besoinMensuel) * 10) / 10;
}
