import type { DateISO, Euros } from '../domain/types';
import type { Echeance } from '../domain/calculs/provisions';
import type { NatureDeclaration, PeriodeDeclaree } from '../domain/calculs/declarations.declarees';
import {
  type PeriodeUrssaf, idAppelDeDeclaration, ordreDesDeclarees
} from '../domain/calculs/declarations';
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
  ecrireFaits({
    ...actuel,
    periodesDeclarees: avecDeclarees(actuel.periodesDeclarees, nature, periodes, declareeLe)
  });
}

function avecDeclarees(
  declarees: readonly PeriodeDeclaree[], nature: NatureDeclaration,
  periodes: readonly string[], declareeLe: DateISO | null
): readonly PeriodeDeclaree[] {
  const autres = declarees.filter((p) => !(p.nature === nature && periodes.includes(p.periode)));
  const nouvelles = periodes.map((periode) => ({ nature, periode, declareeLe }));
  return [...autres, ...nouvelles].sort(ordreDesDeclarees);
}

/**
 * Le geste URSSAF : « déclarée le … pour … € » — la déclaration ET l'appel
 * qu'elle produit, en une écriture.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DÉCLARER SANS L'APPEL FAISAIT BAISSER LE DÛ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une période déclarée quitte aussitôt le volet « à provisionner »
 * (`provisions.ts`) : sa dette est censée passer au volet « constaté », sous
 * forme d'appel. Tant que personne ne saisissait l'appel, elle n'était plus
 * nulle part — le dû baissait de toute la déclaration, et « à te verser »
 * montait d'autant : l'application invitait à se verser des cotisations
 * déclarées, donc dues. Le détail de la dette l'écrivait lui-même : « attend
 * son appel ».
 *
 * Le montant est celui que le site de l'Urssaf a calculé, prérempli et
 * corrigeable par l'écran. L'appel est daté de la limite de la période : en
 * micro, le prélèvement a lieu à l'échéance. Il n'est pas payé — le
 * prélèvement est un fait distinct, qui se pointe, jamais une conséquence de
 * la déclaration.
 *
 * Un seul appel par période : une période qui en porte déjà un — saisi à la
 * main, ou rattaché par la migration — n'en reçoit pas un second ; l'appel
 * qu'une déclaration précédente avait créé est corrigé s'il n'est pas payé.
 * Une déclaration à zéro n'appelle rien.
 */
export function declarerUrssaf(periode: PeriodeUrssaf, declareeLe: DateISO, montant: Euros): void {
  const actuel = faitsCourants();
  const id = idAppelDeDeclaration(periode.id);
  const cree = actuel.echeances.find((e) => e.id === id);
  const dejaAppelee = actuel.echeances
    .some((e) => e.id !== id && e.nature === 'urssaf' && e.periode === periode.id);

  let echeances = actuel.echeances;
  if (cree === undefined) {
    if (montant > 0 && !dejaAppelee) {
      echeances = [...echeances, {
        id, nature: 'urssaf', montant, echeanceLe: periode.limite,
        payeeLe: null, montantPaye: null, periode: periode.id
      }];
    }
  } else if (cree.payeeLe === null) {
    echeances = montant > 0
      ? echeances.map((e) => (e.id === id ? { ...e, montant, echeanceLe: periode.limite } : e))
      : echeances.filter((e) => e.id !== id);
  }

  ecrireFaits({
    ...actuel,
    echeances,
    periodesDeclarees: avecDeclarees(actuel.periodesDeclarees, 'urssaf', periode.mois, declareeLe)
  });
}

/**
 * Défait le geste : la période redevient à déclarer, et l'appel que la
 * déclaration avait créé s'en va avec elle, s'il n'est pas payé — sinon le
 * dû le compterait en plus de l'estimation qui revient. Un appel payé reste :
 * l'argent est parti, et son pointage ne se perd pas sur un clic.
 */
export function annulerDeclarationUrssaf(periode: Pick<PeriodeUrssaf, 'id' | 'mois'>): void {
  const actuel = faitsCourants();
  const id = idAppelDeDeclaration(periode.id);
  ecrireFaits({
    ...actuel,
    echeances: actuel.echeances.filter((e) => !(e.id === id && e.payeeLe === null)),
    periodesDeclarees: actuel.periodesDeclarees
      .filter((p) => !(p.nature === 'urssaf' && (periode.mois as readonly string[]).includes(p.periode)))
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
