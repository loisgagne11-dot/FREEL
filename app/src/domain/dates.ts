import type { DateISO } from './types';

/**
 * Le nombre de jours calendaires de `debut` à `fin`, signé : positif quand `fin`
 * est postérieure.
 *
 * Source unique. Il existait six copies, qui divergeaient : `facturier`
 * bornait à zéro et rendait 0 sur une date illisible, `banque` rendait une
 * valeur absolue, `aTraiter` passait par `new Date(iso)` (juste seulement parce
 * qu'une date seule se lit en UTC), `relance`/`des`/`activite` rendaient le
 * signe tel quel. Une borne ou une valeur absolue est l'affaire de l'appelant :
 * `Math.max(0, …)` pour un retard, `Math.abs` pour une fenêtre de rapprochement.
 *
 * Le calcul est en UTC pur : en heure locale, le jour du passage à l'heure d'été
 * fait 23 heures, et une division tronquée donnerait 0 pour un retard d'un jour.
 * Une date illisible donne NaN et non 0 : un retard inconnu ne doit pas passer
 * pour « pas de retard ».
 */
export function joursEntre(debut: DateISO, fin: DateISO): number {
  const a = Date.parse(`${debut}T00:00:00Z`);
  const b = Date.parse(`${fin}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
