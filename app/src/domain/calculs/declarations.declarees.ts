import type { DateISO, Mois } from '../types';

/*
 * Isolé de `declarations.ts` pour le paquet d'entrée : les provisions du
 * premier rendu n'ont besoin que de savoir QUELS mois sont déclarés. Tant que
 * `moisDeclares` vivait dans `declarations.ts`, son import par `selecteurs.ts`
 * tirait dans l'entrée tout le module — périodes à déclarer, dates limites,
 * rapprochement des appels — que seul l'échéancier, chargé à la demande,
 * emploie : 1,8 Ko de plus quand le lot 28 l'y a importé, et le budget
 * d'entrée franchi.
 */

/**
 * Un mois déclaré, et le jour où il l'a été.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE DATE, PAS UNE CASE COCHÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Jusqu'au schéma 20, `periodesDeclarees` était une liste de mois nus : la
 * période était déclarée ou ne l'était pas. Le cycle réel d'une obligation est
 * « à déclarer → déclarée le … → payée le … », et la seule étape datée était
 * la dernière. Une déclaration faite le 2 août pour une limite au 31 juillet
 * se lisait donc « Déclarée », exactement comme une déclaration faite à
 * l'heure — le retard, qui coûte une majoration, n'avait aucune trace.
 *
 * `null` quand la date n'est pas connue : toute période cochée avant le
 * schéma 21. On ne pose ni la date limite ni le jour de la migration — aucune
 * des deux n'est le jour où la déclaration a été faite, et une date inventée
 * serait indiscernable d'une vraie. Elle se complète depuis l'échéancier.
 */
export interface PeriodeDeclaree {
  readonly mois: Mois;
  readonly declareeLe: DateISO | null;
}

/**
 * Les mois déclarés, sans leur date — ce que lisent les provisions et la
 * règle des périodes à déclarer, qui n'ont besoin que de savoir SI.
 */
export function moisDeclares(declarees: readonly PeriodeDeclaree[]): readonly Mois[] {
  return declarees.map((p) => p.mois);
}
