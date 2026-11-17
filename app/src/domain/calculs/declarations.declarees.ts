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
 * Ce qu'une déclaration déclare, et la forme de sa période (schéma 25) :
 *
 *  · `urssaf` — un mois `AAAA-MM` ; un trimestre se déclare en ses trois mois,
 *    parce que c'est au mois que les provisions basculent (voir plus bas) ;
 *  · `des` — un mois, celui de l'exigibilité de la prestation ;
 *  · `ca3` — un mois, ou un trimestre `AAAA-Tn` (TVA au réel normal) ;
 *  · `ca12`, `revenus`, `cfe_1447c` — une année `AAAA`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LA DES AVAIT BESOIN DE CE FAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Jusqu'au schéma 24, seule une période URSSAF pouvait être « déclarée le … ».
 * Rien ne disait qu'une DES avait été déposée : passé sa limite, tout mois de
 * prestation à l'Union se comptait en retard pour deux ans, avec « 750 € ×
 * N encourus » — un montant faux affiché à qui déclarait à l'heure.
 */
export type NatureDeclaration = 'urssaf' | 'des' | 'ca3' | 'ca12' | 'revenus' | 'cfe_1447c';

/**
 * Une période déclarée, et le jour où elle l'a été.
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
  readonly nature: NatureDeclaration;
  readonly periode: string;
  readonly declareeLe: DateISO | null;
}

/**
 * Les mois déclarés À L'URSSAF, sans leur date — ce que lisent les provisions
 * et la règle des périodes à déclarer, qui n'ont besoin que de savoir SI.
 *
 * Le filtre sur la nature n'est pas une précaution : une DES de mai déposée
 * ferait sinon basculer les cotisations de mai hors du volet « à
 * provisionner », sans qu'aucune déclaration URSSAF n'ait été faite.
 */
export function moisDeclares(declarees: readonly PeriodeDeclaree[]): readonly Mois[] {
  return declarees.filter((p) => p.nature === 'urssaf').map((p) => p.periode as Mois);
}
