/**
 * Livre des recettes — le registre obligatoire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI REND UN REGISTRE OPPOSABLE, ET CE QUI LE DISQUALIFIE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un micro-entrepreneur doit tenir un livre des recettes présentant, pour
 * chaque encaissement : sa **date**, son **montant**, l'**identité du client**,
 * le **mode de règlement** et la **référence de la pièce**. L'ancienne
 * application ne portait ni date d'encaissement ni mode de règlement — son
 * registre n'était donc pas conforme, et l'audit comptable le relevait comme
 * un manquement de premier rang.
 *
 * Trois propriétés font la différence entre un registre et une liste :
 *
 *  1. **AJOUT SEUL.** Une recette encaissée ne se modifie pas et ne se
 *     supprime pas. Elle s'annule par une écriture inverse, datée, qui laisse
 *     la trace de la correction. Un registre qu'on peut réécrire ne prouve
 *     rien : c'est précisément ce qu'un contrôle cherche à vérifier.
 *  2. **CHRONOLOGIE.** Les écritures se suivent dans l'ordre des
 *     encaissements. Une écriture antérieure à la précédente signale soit une
 *     saisie rétroactive, soit une erreur — dans les deux cas, quelque chose
 *     à regarder.
 *  3. **NUMÉROTATION CONTINUE.** Les factures se suivent sans trou. Un numéro
 *     manquant, en contrôle, se lit comme une facture retirée du registre.
 *
 * Ce module ne corrige rien : il CONSTATE. Corriger d'office un registre
 * comptable serait exactement le geste qu'il faut rendre impossible.
 */

import { type DateISO, type Euros, euros } from '../types';
import { SEUIL_GLOBALISATION_DETAIL } from '../bareme/recettes';

export type ModeReglement = 'virement' | 'cheque' | 'especes' | 'carte' | 'autre';

/**
 * Une écriture du livre.
 *
 * `annuleEcriture` porte l'identifiant de l'écriture corrigée. Une écriture
 * d'annulation a un montant négatif et pointe vers l'originale : les deux
 * restent visibles, et leur somme est nulle.
 */
export interface EcritureRecette {
  readonly id: string;
  readonly clientNom: string;
  readonly libelle: string;
  readonly montant: Euros;
  readonly emiseLe: DateISO | null;
  readonly encaisseeLe: DateISO | null;
  readonly modeReglement: ModeReglement | null;
  readonly numero: string;
  /** Identifiant de l'écriture que celle-ci annule, le cas échéant. */
  readonly annuleEcriture?: string | null;
  /** Recette globalisée en fin de journée, sans identité de client. */
  readonly globalisee?: boolean;
}

export type NatureEcart =
  | 'date_encaissement_manquante'
  | 'mode_reglement_manquant'
  | 'client_manquant'
  | 'numero_manquant'
  | 'numero_duplique'
  | 'numero_manquant_dans_la_suite'
  | 'ordre_non_chronologique'
  | 'annulation_orpheline';

export interface EcartConformite {
  readonly nature: NatureEcart;
  /** L'écriture concernée, ou `null` pour un écart portant sur la suite. */
  readonly ecritureId: string | null;
  readonly message: string;
}

/** Une écriture est-elle une annulation ? */
export const estAnnulation = (e: EcritureRecette): boolean =>
  e.annuleEcriture !== undefined && e.annuleEcriture !== null;

/**
 * Les écritures encaissées, dans l'ordre du livre.
 *
 * L'ordre est celui de l'encaissement, pas celui de la saisie : c'est la date
 * de l'encaissement qui fait entrer la recette dans le registre.
 */
export function ecrituresDuLivre(
  recettes: readonly EcritureRecette[]
): readonly EcritureRecette[] {
  return recettes
    .filter((r) => r.encaisseeLe !== null)
    .sort((a, b) => (a.encaisseeLe as DateISO).localeCompare(b.encaisseeLe as DateISO));
}

/**
 * Constate les écarts de conformité.
 *
 * Chaque écart dit quoi et pourquoi. « Registre non conforme » sans plus de
 * précision n'aide personne à le rendre conforme.
 */
export function verifierConformite(
  recettes: readonly EcritureRecette[]
): readonly EcartConformite[] {
  const ecarts: EcartConformite[] = [];
  const encaissees = ecrituresDuLivre(recettes);
  const identifiants = new Set(recettes.map((r) => r.id));

  for (const e of encaissees) {
    if (e.encaisseeLe === null) {
      ecarts.push({
        nature: 'date_encaissement_manquante',
        ecritureId: e.id,
        message: 'Date d’encaissement absente : mention obligatoire du livre des recettes.'
      });
    }
    // Une annulation hérite du mode de règlement de l'écriture qu'elle
    // corrige ; le réclamer une seconde fois n'aurait pas de sens.
    if (e.modeReglement === null && !estAnnulation(e)) {
      ecarts.push({
        nature: 'mode_reglement_manquant',
        ecritureId: e.id,
        message: `Mode de règlement absent pour ${reference(e)} : mention obligatoire.`
      });
    }
    // L'identité du client n'est exigible que hors globalisation, et
    // au-dessus du seuil de tolérance des recettes au détail.
    const globalisationPossible = e.globalisee === true
      && Math.abs(e.montant) <= SEUIL_GLOBALISATION_DETAIL.valeur;
    if (e.clientNom.trim() === '' && !globalisationPossible && !estAnnulation(e)) {
      ecarts.push({
        nature: 'client_manquant',
        ecritureId: e.id,
        message: `Identité du client absente pour ${reference(e)} : obligatoire au-delà de `
          + `${SEUIL_GLOBALISATION_DETAIL.valeur} € ou hors recette globalisée.`
      });
    }
    if (e.numero.trim() === '' && !estAnnulation(e)) {
      ecarts.push({
        nature: 'numero_manquant',
        ecritureId: e.id,
        message: 'Référence de pièce absente : le registre doit renvoyer à la facture.'
      });
    }
    // Une annulation qui ne pointe vers rien laisse un montant négatif
    // inexpliqué dans le registre.
    if (estAnnulation(e) && !identifiants.has(e.annuleEcriture as string)) {
      ecarts.push({
        nature: 'annulation_orpheline',
        ecritureId: e.id,
        message: 'Écriture d’annulation sans écriture d’origine retrouvée.'
      });
    }
  }

  ecarts.push(...ecartsDeNumerotation(recettes));
  ecarts.push(...ecartsDeChronologie(encaissees));
  return ecarts;
}

function reference(e: EcritureRecette): string {
  return e.numero.trim() === '' ? 'une recette sans numéro' : `la facture ${e.numero}`;
}

/**
 * Numéros dupliqués et trous dans la suite.
 *
 * La suite n'est contrôlée que sur les numéros de la forme `AAAA-NNN`, celle
 * que l'application produit. Un numéro d'une autre forme n'est pas une erreur :
 * il peut venir d'un logiciel antérieur, et le déclarer fautif ferait crier au
 * loup sur tout un historique repris.
 */
function ecartsDeNumerotation(
  recettes: readonly EcritureRecette[]
): readonly EcartConformite[] {
  const ecarts: EcartConformite[] = [];
  const vus = new Map<string, string>();
  const parAnnee = new Map<string, number[]>();

  for (const e of recettes) {
    const numero = e.numero.trim();
    if (numero === '' || estAnnulation(e)) continue;

    const premier = vus.get(numero);
    if (premier !== undefined) {
      ecarts.push({
        nature: 'numero_duplique',
        ecritureId: e.id,
        message: `Le numéro ${numero} est utilisé deux fois : une numérotation `
          + 'doit identifier une facture et une seule.'
      });
    } else {
      vus.set(numero, e.id);
    }

    const correspond = /^(\d{4})-(\d+)$/.exec(numero);
    if (correspond === null) continue;
    const annee = correspond[1] as string;
    const rang = Number(correspond[2]);
    const rangs = parAnnee.get(annee);
    if (rangs) rangs.push(rang); else parAnnee.set(annee, [rang]);
  }

  for (const [annee, rangs] of parAnnee) {
    const tries = [...new Set(rangs)].sort((a, b) => a - b);
    const premier = tries[0];
    const dernier = tries[tries.length - 1];
    if (premier === undefined || dernier === undefined) continue;

    const manquants: number[] = [];
    for (let n = premier; n <= dernier; n++) {
      if (!tries.includes(n)) manquants.push(n);
    }
    if (manquants.length > 0) {
      ecarts.push({
        nature: 'numero_manquant_dans_la_suite',
        ecritureId: null,
        message: `Numérotation ${annee} : ${manquants.length} numéro(s) manquant(s) `
          + `(${manquants.slice(0, 5).join(', ')}${manquants.length > 5 ? '…' : ''}). `
          + 'En contrôle, un numéro absent se lit comme une facture retirée du registre.'
      });
    }
  }

  return ecarts;
}

/**
 * Écritures antérieures à la date d'émission de leur propre facture.
 *
 * Un encaissement avant émission est soit un acompte mal daté, soit une saisie
 * fautive. Le registre lui-même reste chronologique par construction — il est
 * trié à la lecture —, mais cette incohérence-là ne se voit pas au tri.
 */
function ecartsDeChronologie(
  encaissees: readonly EcritureRecette[]
): readonly EcartConformite[] {
  return encaissees
    .filter((e) =>
      e.emiseLe !== null && e.encaisseeLe !== null && e.encaisseeLe < e.emiseLe)
    .map((e) => ({
      nature: 'ordre_non_chronologique' as const,
      ecritureId: e.id,
      message: `Encaissement (${e.encaisseeLe}) antérieur à l’émission (${e.emiseLe}) : `
        + 'acompte mal daté, ou erreur de saisie.'
    }));
}

export interface TotalLivre {
  readonly ecritures: number;
  /** Somme des montants encaissés, annulations déduites. */
  readonly total: Euros;
  readonly annulations: number;
}

/** Le total du livre. Les annulations s'y soustraient, elles ne s'y cachent pas. */
export function totaliser(recettes: readonly EcritureRecette[]): TotalLivre {
  const encaissees = ecrituresDuLivre(recettes);
  return {
    ecritures: encaissees.length,
    total: euros(encaissees.reduce<number>((s, e) => s + e.montant, 0)),
    annulations: encaissees.filter(estAnnulation).length
  };
}
