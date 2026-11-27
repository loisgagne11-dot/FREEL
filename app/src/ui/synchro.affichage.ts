import { useSyncExternalStore } from 'react';
import { type EtatSynchroAppareil, abonnerEtatSynchro, etatSynchro } from '../infra/synchro.etat';

/**
 * Ce que la pastille du haut et l'écran Compte partagent pour dire où en est
 * la synchronisation automatique (lot 42) : l'état publié par le moteur, et
 * l'heure à la française.
 *
 * À part de `format.ts`, qui vit dans le paquet d'entrée : la pastille et
 * l'écran Compte sont tous deux différés, et ce module voyage avec eux.
 */
export function useEtatSynchro(): EtatSynchroAppareil {
  return useSyncExternalStore(abonnerEtatSynchro, etatSynchro, etatSynchro);
}

/**
 * L'heure d'une synchronisation, dans le fuseau de l'appareil.
 *
 * `court` tient dans la barre du haut — « à 9 h 41 », « hier », « le 20/11 » ;
 * `long` dit tout — « hier à 18 h 05 ». Une heure seule, la veille, se lirait
 * « ce matin » : c'est exactement le retard que la pastille doit montrer.
 */
export function quandSynchro(iso: string, maintenant: Date = new Date()): { readonly court: string; readonly long: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { court: '', long: '' };
  // Insécables, comme la maquette (« 9&nbsp;h&nbsp;41 ») : à 390 px, l'heure
  // se coupait en « 9 h » et « 41 » sur deux lignes.
  const heure = `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
  const veille = new Date(maintenant);
  veille.setDate(veille.getDate() - 1);
  if (d.toDateString() === maintenant.toDateString()) return { court: `à ${heure}`, long: `à ${heure}` };
  if (d.toDateString() === veille.toDateString()) return { court: 'hier', long: `hier à ${heure}` };
  const jour = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { court: `le ${jour}`, long: `le ${jour} à ${heure}` };
}
