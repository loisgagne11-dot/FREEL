import type { DateISO } from '../types';
import type { Ajustements, Rythme } from './planning';

/**
 * Lire qu'un client opérationnel est arrêté — sans rien de ce qu'il faut pour
 * l'arrêter.
 *
 * L'écran Activité ne consulte que cette lecture : l'éditeur de journée ne
 * propose plus un client après son arrêt. Les gestes — arrêter, chiffrer ce
 * qu'un arrêt ou un retrait emporte, nommer les factures déjà parties — vivent
 * dans `clientsOperationnels`, qui ne s'ouvre qu'avec le formulaire de mission.
 * Tout dans un seul module, importé par l'écran, faisait payer ces gestes à
 * chaque consultation du planning : son fragment passait de 37,7 à 40,0 Ko,
 * pour un plafond de 40.
 *
 * `clientsOperationnels` réexporte ces lectures : une seule source, deux portes.
 */

/** Ce qu'un client opérationnel porte et que ce module lit : ses faits datés. */
export interface FaitsDuClient {
  readonly id: string;
  readonly rythmes: readonly Rythme[];
  readonly ajustements: Ajustements;
}

/** Une plage qui produit des journées : une semaine type non vide. */
export const plageActive = (r: Rythme): boolean =>
  Object.values(r.parJour).some((q) => (q ?? 0) > 0);

/**
 * Le dernier jour où un client opérationnel a quelque chose, ou `null`.
 *
 * La fin des plages qui prévoient du travail, ou une correction positive
 * posée plus tard — une journée déclarée à la main après la dernière plage
 * prouve que le client n'était pas fini. Une plage vide ne compte pas : elle
 * ne remplit rien. Un zéro non plus : il dit justement qu'on n'y était pas.
 */
export function finDuClient(e: FaitsDuClient): DateISO | null {
  const dates = [
    ...e.rythmes.filter(plageActive).map((r) => r.au),
    ...Object.entries(e.ajustements).filter(([, a]) => a.quotite > 0).map(([d]) => d as DateISO)
  ];
  return dates.length === 0 ? null : dates.reduce((a, b) => (a > b ? a : b));
}

/**
 * La date à laquelle ce client s'est arrêté, ou `null` s'il ne l'est pas.
 *
 * Un client SEUL n'est jamais « arrêté » : sa fin est celle de la mission, et
 * c'est la mission qui se termine. Deux clients qui finissent le même jour ne
 * le sont pas davantage — rien ne continue sans eux. Il faut qu'un autre
 * client de la même mission travaille encore après lui.
 */
export function arretDuClient(
  mission: { readonly entites: readonly FaitsDuClient[] },
  e: FaitsDuClient
): DateISO | null {
  const fin = finDuClient(e);
  if (fin === null) return null;
  const unAutreContinue = mission.entites.some((autre) => {
    if (autre.id === e.id) return false;
    const finAutre = finDuClient(autre);
    return finAutre !== null && finAutre > fin;
  });
  return unAutreContinue ? fin : null;
}
