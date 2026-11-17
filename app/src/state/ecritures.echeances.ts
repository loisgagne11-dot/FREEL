import type { DateISO, Euros } from '../domain/types';
import type { Echeance } from '../domain/calculs/provisions';
import type { NatureDeclaration } from '../domain/calculs/declarations.declarees';
import { ordreDesDeclarees } from '../domain/calculs/declarations';
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
 * Marque des périodes d'une nature déclarées, À UNE DATE — ou corrige cette
 * date.
 *
 * Pour l'URSSAF, c'est ce fait qui fait basculer la dette du volet « à
 * provisionner » vers le volet « constaté » — sans lui, les provisions
 * surestiment la dette (voir `calculs/provisions.ts`). Pour la DES, c'est lui
 * qui dit le dépôt fait, et éteint le retard.
 *
 * Toutes les périodes en UNE écriture : un trimestre marqué mois par mois
 * faisait trois écritures, et une interruption entre deux laissait un
 * trimestre déclaré aux deux tiers — que la règle lit « pas déclaré », pendant
 * que les provisions en avaient déjà sorti deux mois.
 *
 * Une période déjà déclarée prend la nouvelle date : c'est ainsi que se
 * complète une période cochée avant que la date existe (`null`), et que se
 * corrige une date mal saisie. Seules les périodes de CETTE nature sont
 * touchées : la DES de mai et la déclaration URSSAF de mai sont deux faits.
 */
export function declarerPeriode(
  nature: NatureDeclaration, periodes: readonly string[], declareeLe: DateISO | null
): void {
  const actuel = faitsCourants();
  const autres = actuel.periodesDeclarees
    .filter((p) => !(p.nature === nature && periodes.includes(p.periode)));
  const nouvelles = periodes.map((periode) => ({ nature, periode, declareeLe }));
  ecrireFaits({
    ...actuel,
    periodesDeclarees: [...autres, ...nouvelles].sort(ordreDesDeclarees)
  });
}

/** Retire la déclaration de périodes d'une nature, et d'elle seule. */
export function annulerDeclaration(nature: NatureDeclaration, periodes: readonly string[]): void {
  const actuel = faitsCourants();
  ecrireFaits({
    ...actuel,
    periodesDeclarees: actuel.periodesDeclarees
      .filter((p) => !(p.nature === nature && periodes.includes(p.periode)))
  });
}

/**
 * Un appel URSSAF saisi à la main ne règle aucune période tant qu'on ne le dit
 * pas : `null`, posé, plutôt qu'un champ absent que la migration rattacherait
 * par l'ancienne règle au premier compte relu (voir `Echeance.periode`).
 */
function avecPeriodeDite<E extends Partial<Echeance>>(e: E): E {
  return e.nature === 'urssaf' && e.periode === undefined ? { ...e, periode: null } : e;
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
  const nouvelles = saisies.map((saisie, i) => avecPeriodeDite({
    ...saisie, id: `ech-${base}-${actuel.echeances.length + i}`
  }));
  ecrireFaits({ ...actuel, echeances: [...actuel.echeances, ...nouvelles] });
  return nouvelles.length;
}

export function modifierEcheance(id: string, modification: Partial<Omit<Echeance, 'id'>>): void {
  const actuel = faitsCourants();
  ecrireFaits({
    ...actuel,
    echeances: actuel.echeances.map((e) => (e.id === id ? avecPeriodeDite({ ...e, ...modification }) : e))
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
