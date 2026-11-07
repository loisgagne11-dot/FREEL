import { dernierMoisAcre } from '../domain/bareme';
import { type Mois, type Resolution, moisDe } from '../domain/types';
import type { Faits } from './schema';
import { recettesEncaissees } from './selecteurs';
import { type ProvenanceSolde, soldeDerive } from '../domain/calculs/solde';

/*
 * Des sélecteurs que seuls des écrans différés lisent (Config, Argent).
 *
 * Ils vivaient dans `selecteurs.ts`, qui est dans le paquet d'entrée : un
 * module y entre tout entier, fonctions inutiles au premier écran comprises.
 * Le paquet a franchi son budget au lot 6, et l'invariant n°7 dit d'extraire.
 */

/**
 * Le dernier mois d'ACRE, pour que l'écran Config puisse l'écrire en clair.
 *
 * `null` quand l'ACRE n'est pas déclarée ou que le début d'activité manque :
 * il n'y a alors rien à afficher, et une date inventée serait recoupée contre
 * l'attestation URSSAF puis crue.
 */
export function finAcreDe(faits: Faits): Resolution<Mois> | null {
  const debut = faits.entreprise.debutActivite;
  if (!faits.entreprise.acre || debut === null) return null;
  return dernierMoisAcre(moisDe(debut));
}

/**
 * D'où vient le solde affiché — dérivé des faits, rapproché d'un relevé,
 * simplement saisi faute des deux, ou saisi SANS DATE (voir `ProvenanceSolde`
 * pour ce que distingue chaque état — en particulier `'sansDate'`, l'état
 * d'abstention tant que `soldeInitialAu` est `null`).
 */
export function provenanceSoldeDe(faits: Faits): ProvenanceSolde {
  return soldeDerive(
    faits.soldeInitial, faits.soldeInitialAu,
    recettesEncaissees(faits), faits.depenses, faits.echeances,
    faits.mouvementsBancaires
  ).provenance;
}
