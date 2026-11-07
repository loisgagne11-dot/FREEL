import type { DateISO, Euros, Mois } from '../domain/types';
import type { Echeance } from '../domain/calculs/provisions';
import type { Faits } from './schema';
import { ecrireFaits, useFaits } from './store';

/**
 * Les écritures des échéances émises et des périodes déclarées.
 *
 * Même motif que `ecritures.carnet` et `ecritures.recettes` : la règle unique
 * des périodes à déclarer (lot 2) a fait entrer le module des déclarations
 * dans le premier rendu, et le code d'entrée a dépassé son budget — 81,86 /
 * 80 Ko. Aucune de ces écritures n'est déclenchable depuis le Pilote : elles
 * appartiennent à l'échéancier et au détail d'une dette, chargés à la demande.
 *
 * Elles lisent le même état (`useFaits.getState()`) et passent par la même
 * porte vers le disque (`ecrireFaits`) : pas de second magasin.
 */

const faitsCourants = (): Faits => useFaits.getState().faits;

/**
 * Marque une période comme déclarée. C'est ce fait qui fait basculer la dette
 * du volet « à provisionner » vers le volet « constaté » — sans lui, les
 * provisions surestiment la dette (voir `calculs/provisions.ts`).
 */
export function marquerPeriodeDeclaree(m: Mois): void {
  const actuel = faitsCourants();
  if (actuel.periodesDeclarees.includes(m)) return; // idempotent
  ecrireFaits({ ...actuel, periodesDeclarees: [...actuel.periodesDeclarees, m].sort() });
}

export function annulerPeriodeDeclaree(m: Mois): void {
  const actuel = faitsCourants();
  ecrireFaits({ ...actuel, periodesDeclarees: actuel.periodesDeclarees.filter((p) => p !== m) });
}

/**
 * Enregistre une ou plusieurs échéances d'un seul geste : appel de cotisations,
 * avis d'impôt, CFE.
 *
 * C'est un FAIT — elle existe parce qu'un appel est arrivé. Il n'y a plus de
 * version au singulier : `ajouterEcheance` a existé, `verifier:cablage` l'a
 * trouvée morte, et deux chemins pour le même fait finissent par diverger.
 * Une commodité de SAISIE, pas un nouveau fait : elle crée N échéances
 * ordinaires, chacune ensuite corrigeable indépendamment. Une seule écriture
 * pour toute la série : une interruption au milieu laisserait sinon un
 * échéancier à moitié saisi.
 */
export function ajouterEcheances(saisies: readonly Omit<Echeance, 'id'>[]): number {
  if (saisies.length === 0) return 0;
  const actuel = faitsCourants();
  const base = Date.now();
  const nouvelles = saisies.map((saisie, i) => ({
    ...saisie, id: `ech-${base}-${actuel.echeances.length + i}`
  }));
  ecrireFaits({ ...actuel, echeances: [...actuel.echeances, ...nouvelles] });
  return nouvelles.length;
}

export function modifierEcheance(id: string, modification: Partial<Omit<Echeance, 'id'>>): void {
  const actuel = faitsCourants();
  ecrireFaits({
    ...actuel,
    echeances: actuel.echeances.map((e) => (e.id === id ? { ...e, ...modification } : e))
  });
}

export function supprimerEcheance(id: string): void {
  const actuel = faitsCourants();
  ecrireFaits({ ...actuel, echeances: actuel.echeances.filter((e) => e.id !== id) });
}

/**
 * Enregistre le paiement d'une échéance — ou l'annule avec `null`.
 *
 * La DATE est exigée, pas un booléen : elle permet de rapprocher le paiement
 * du relevé, de savoir de quel mois la sortie relève, et de constater après
 * coup un règlement en retard. `montantPaye` recueille l'écart quand ce qui
 * est parti diffère de ce qui était appelé ; `null` quand les deux coïncident.
 * Payée, l'échéance sort des provisions : le solde bancaire la reflète déjà.
 */
export function enregistrerPaiement(id: string, payeeLe: DateISO | null, montantPaye: Euros | null): void {
  modifierEcheance(id, { payeeLe, montantPaye });
}
