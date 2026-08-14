import type { DateISO, Euros } from '../types';
import { euros } from '../types';

/**
 * Le dossier de déclaration de TVA — tout ce qu'il faut pour remplir le
 * formulaire, sans chercher ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CRITÈRE DE RÉUSSITE N'EST PAS UN AFFICHAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Je dois déclarer ma TVA pour un trimestre. Au clic, j'ai toutes les
 * informations pour remplir ma déclaration. » L'exigence est d'usage : le
 * critère est qu'on puisse remplir le formulaire officiel **sans quitter
 * l'écran ni chercher ailleurs**. Un total sans le détail des pièces oblige à
 * rouvrir le facturier pour vérifier une ligne, et c'est perdu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DATE QUI COMPTE N'EST PAS LA MÊME DES DEUX CÔTÉS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * C'est le piège de la TVA sur les prestations de services, et il fait
 * déclarer faux ceux qui l'ignorent.
 *
 * La TVA collectée est exigible à l'**ENCAISSEMENT** (art. 269-2-c du CGI), et
 * non à la facturation. Une facture émise en juin et réglée en août relève du
 * trimestre d'AOÛT. C'est l'inverse de la règle qui range les factures partout
 * ailleurs dans cette application — où c'est la date d'émission qui trie — et
 * les confondre décale toute une déclaration d'un trimestre.
 *
 * La TVA déductible suit la même logique côté achats : elle se déduit sur la
 * période de **PAIEMENT** de la dépense.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ON NE SAIT PAS NE VAUT PAS ZÉRO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une recette dont la TVA n'est pas connue — facture d'avant que
 * l'application la conserve — est COMPTÉE À PART, jamais ajoutée pour zéro.
 * Sous-évaluer une TVA collectée est le sens dangereux de l'erreur : c'est
 * celui qui produit un rappel.
 */

/** Une facture qui entre dans la déclaration. */
export interface PieceCollectee {
  readonly id: string;
  readonly numero: string;
  readonly clientNom: string;
  readonly encaisseeLe: DateISO;
  /** Base hors taxes portée au livre. */
  readonly montantHt: Euros;
  /** TVA du document, ou `null` si elle n'a pas été conservée. */
  readonly tva: Euros | null;
}

/** Une dépense qui ouvre droit à déduction. */
export interface PieceDeduite {
  readonly id: string;
  readonly libelle: string;
  readonly payeeLe: DateISO;
  readonly montantTtc: Euros;
  readonly tvaRecuperable: Euros;
}

export interface DossierTva {
  readonly du: DateISO;
  readonly au: DateISO;
  /** TVA collectée sur les encaissements de la période. */
  readonly collectee: Euros;
  /** TVA déductible sur les dépenses payées dans la période. */
  readonly deductible: Euros;
  /**
   * Ce qu'il reste à verser. Négatif quand la déduction dépasse la collecte —
   * c'est un crédit de TVA, pas un montant à payer, et l'écran doit le dire.
   */
  readonly aPayer: Euros;
  /** Les factures encaissées de la période, dans l'ordre d'encaissement. */
  readonly encaissements: readonly PieceCollectee[];
  /** Les achats payés dans la période dont la TVA est récupérable. */
  readonly achats: readonly PieceDeduite[];
  /**
   * Les encaissements dont la TVA n'a pas été conservée.
   *
   * Ils ne sont PAS comptés dans `collectee`, donc celle-ci est sous-évaluée
   * de ce qu'ils portaient. Le dossier le dit plutôt que d'annoncer un total
   * qui a l'air complet — c'est un montant qui part sur un formulaire.
   */
  readonly encaissementsSansTva: readonly PieceCollectee[];
  /** Base hors taxes des encaissements de la période, ligne du formulaire. */
  readonly baseHt: Euros;
}

const dansLaPeriode = (d: DateISO, du: DateISO, au: DateISO): boolean => d >= du && d <= au;

/**
 * Rassemble le dossier d'une période.
 *
 * Les listes sont rendues en entier et non résumées : l'exigence est de
 * pouvoir vérifier une ligne sans quitter l'écran, et un total seul oblige à
 * rouvrir le facturier.
 */
export function dossierTva(
  { du, au, encaissements, achats }: {
    readonly du: DateISO;
    readonly au: DateISO;
    readonly encaissements: readonly PieceCollectee[];
    readonly achats: readonly PieceDeduite[];
  }
): DossierTva {
  const retenus = encaissements
    .filter((e) => dansLaPeriode(e.encaisseeLe, du, au))
    .sort((a, b) => a.encaisseeLe.localeCompare(b.encaisseeLe));

  const retenusAchats = achats
    .filter((a) => dansLaPeriode(a.payeeLe, du, au) && a.tvaRecuperable > 0)
    .sort((a, b) => a.payeeLe.localeCompare(b.payeeLe));

  const connus = retenus.filter((e) => e.tva !== null);
  const inconnus = retenus.filter((e) => e.tva === null);

  const collectee = euros(connus.reduce((s, e) => s + (e.tva ?? 0), 0));
  const deductible = euros(retenusAchats.reduce((s, a) => s + a.tvaRecuperable, 0));

  return {
    du,
    au,
    collectee,
    deductible,
    aPayer: euros(collectee - deductible),
    encaissements: retenus,
    achats: retenusAchats,
    encaissementsSansTva: inconnus,
    // La base porte TOUS les encaissements, y compris ceux dont la TVA est
    // inconnue : le chiffre d'affaires, lui, est connu — c'est le montant porté
    // au livre. Seule la taxe manque.
    baseHt: euros(retenus.reduce((s, e) => s + e.montantHt, 0))
  };
}

/** Le dossier annonce-t-il un crédit de TVA plutôt qu'une somme à verser ? */
export function estUnCredit(d: DossierTva): boolean {
  return d.aPayer < 0;
}

/**
 * Le dossier est-il complet ?
 *
 * Il ne l'est pas dès qu'un encaissement a perdu sa TVA : le total annoncé est
 * alors inférieur au dû. On ne bloque pas pour autant — l'utilisateur peut
 * connaître le montant manquant et le corriger sur le formulaire — mais
 * l'écran doit le dire, et compter combien de pièces sont concernées.
 */
export function estComplet(d: DossierTva): boolean {
  return d.encaissementsSansTva.length === 0;
}
