import type { DateISO, Euros } from '../types';
import { euros } from '../types';
import { type Franchissement, franchissementPrevu, partDeLAnneeEcoulee } from './allure';

/**
 * Où l'on en est de son objectif de chiffre d'affaires.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN OBJECTIF N'EST PAS UN SEUIL, ET SE TRAITE POURTANT PAREIL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le plafond micro et le seuil de TVA sont subis : on les regarde pour ne pas
 * les franchir. L'objectif est choisi : on le regarde pour le franchir. Le
 * sentiment est inverse, l'arithmétique est la même — un montant, une année
 * civile, et la question « à ce rythme, quand ? ».
 *
 * `franchissementPrevu` est donc réemployé tel quel. Refaire la division ici
 * aurait produit deux prévisions qui finissent par ne pas tomber d'accord, et
 * aurait surtout perdu l'abstention sous un trimestre d'activité, qui vaut
 * exactement autant pour un objectif que pour un plafond.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉCART SE DIT EN JOURS, PAS SEULEMENT EN EUROS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application traçait une ligne horizontale à l'objectif mensuel.
 * C'est un repère, pas une réponse : elle disait où viser, jamais si l'on
 * était en avance.
 *
 * « Il vous manque 4 200 € sur l'allure attendue » est déjà mieux, mais le
 * chiffre ne se compare à rien : 4 200 € de retard au 15 janvier n'ont rien à
 * voir avec 4 200 € au 15 décembre. Ramené au rythme de l'objectif lui-même,
 * l'écart devient « vous avez trois semaines de retard » — une quantité que
 * l'on sait interpréter sans calculer, et qui reste juste à toute date.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ASSIETTE EST L'ENCAISSÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le reste de l'application compte en encaissé : les plafonds, la TVA, l'impôt
 * et les cotisations s'y calculent tous. Poser l'objectif sur le facturé aurait
 * fabriqué un troisième référentiel, et un objectif « atteint » que le compte
 * n'aurait jamais vu passer. Le facturé reste affiché à côté — l'écart entre
 * les deux est du travail vendu qui n'est pas encore rentré, et c'est une autre
 * question, traitée par l'encours.
 */

/** Nombre de jours de l'année civile, bissextiles comprises. */
function joursDeLAnnee(annee: number): number {
  const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
  return bissextile ? 366 : 365;
}

export interface AllureObjectif {
  readonly objectif: Euros;
  /** Part de l'année écoulée, entre 0 et 1. Fait de calendrier, rien d'extrapolé. */
  readonly partDeLAnnee: number;
  /** Ce qu'il faudrait avoir encaissé à cette date pour tenir l'objectif. */
  readonly attenduADate: Euros;
  readonly realise: Euros;
  /** Réalisé moins attendu. Positif : de l'avance. */
  readonly ecart: Euros;
  /**
   * L'écart ramené au rythme de l'objectif, en jours. Négatif : du retard.
   *
   * Arrondi à l'entier : la demi-journée d'avance sur un objectif annuel n'est
   * pas une information, c'est du bruit de division.
   */
  readonly joursDEcart: number;
  /** Part de l'objectif déjà encaissée, entre 0 et 1 — non bornée au-delà. */
  readonly partRealisee: number;
  /** Au rythme constaté : déjà atteint, prévu tel mois, hors année, ou indéterminable. */
  readonly franchissement: Franchissement;
}

/**
 * L'allure sur l'objectif, ou `null` si aucun objectif n'est fixé.
 *
 * Un objectif à zéro n'est pas un objectif : c'est l'absence de réglage. Le
 * rendre comme un objectif atteint à 100 % dès le 1er janvier serait une
 * félicitation pour rien — et une division par zéro dans la foulée.
 */
export function allureObjectif(
  objectif: Euros | null,
  realise: Euros,
  aujourdhui: DateISO
): AllureObjectif | null {
  if (objectif === null || objectif <= 0) return null;

  const partDeLAnnee = partDeLAnneeEcoulee(aujourdhui);
  const attenduADate = euros(Math.round(objectif * partDeLAnnee));
  const ecart = euros(realise - attenduADate);
  const parJour = objectif / joursDeLAnnee(Number(aujourdhui.slice(0, 4)));

  return {
    objectif,
    partDeLAnnee,
    attenduADate,
    realise,
    ecart,
    joursDEcart: Math.round(ecart / parJour),
    partRealisee: realise / objectif,
    franchissement: franchissementPrevu(realise, objectif, aujourdhui)
  };
}
