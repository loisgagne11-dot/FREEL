import type { DateISO, Euros } from '../types';
import { euros } from '../types';
import { tauxReconnu } from '../bareme/tva';

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

/** La base et la TVA d'une pièce, ou d'un dossier, à un taux donné. */
export interface PartTaux {
  readonly taux: number;
  readonly base: Euros;
  readonly tva: Euros;
}

/**
 * La ventilation par taux d'un encaissement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE FORMULAIRE DEMANDE LA BASE PAR TAUX, PAS UN TOTAL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Trois sources, dans cet ordre, et jamais une quatrième :
 *
 *  1. les LIGNES conservées depuis le schéma 20 — le document lui-même ;
 *  2. à défaut, le taux UNIQUE que trahit le rapport TVA / HT, quand il tombe
 *     sur un taux légal ;
 *  3. sinon `null` : la facture mêlait des taux et son détail est perdu. Elle
 *     est « à ventiler » à la main, et l'écran le dit. La répartir au prorata,
 *     ou tout mettre à 20 %, ce serait inventer une base sur un formulaire
 *     officiel.
 *
 * Des lignes qui ne retombent pas sur le montant et la TVA du livre ne sont
 * pas crues : c'est le livre qui fait foi, comme à la réédition.
 *
 * `null` aussi quand la TVA elle-même est inconnue : ce cas-là est déjà compté
 * à part (`encaissementsSansTva`).
 */
export function ventilationParTaux(
  montantHt: Euros,
  tva: Euros | null,
  lignes: readonly { readonly quantite: number; readonly prixUnitaireHt: number; readonly tauxTva: number }[] | null
): readonly PartTaux[] | null {
  if (tva === null) return null;
  if (lignes !== null && lignes.length > 0) {
    const parts = new Map<number, number>();
    for (const l of lignes) parts.set(l.tauxTva, (parts.get(l.tauxTva) ?? 0) + l.quantite * l.prixUnitaireHt);
    const ventilee = [...parts.entries()]
      .map(([taux, base]) => ({ taux, base: euros(base), tva: euros(base * taux) }));
    const base = ventilee.reduce((s, p) => s + p.base, 0);
    const taxe = ventilee.reduce((s, p) => s + p.tva, 0);
    if (Math.abs(base - montantHt) < 0.005 && Math.abs(taxe - tva) < 0.005) return ventilee;
    return null;
  }
  const taux = tauxReconnu(montantHt, tva);
  return taux === null ? null : [{ taux, base: montantHt, tva }];
}

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
  /**
   * La pièce est un avoir : elle porte le numéro de la facture qu'elle annule,
   * en négatif. Sans la mention, la ligne se lit comme un doublon de saisie.
   */
  readonly avoir?: boolean;
  /** Sa base et sa TVA par taux — voir `ventilationParTaux` ; `null` si elles ne se lisent pas. */
  readonly ventilation: readonly PartTaux[] | null;
}

/** Une dépense qui ouvre droit à déduction. */
export interface PieceDeduite {
  readonly id: string;
  readonly libelle: string;
  readonly payeeLe: DateISO;
  readonly montantTtc: Euros;
  readonly tvaRecuperable: Euros;
}

/**
 * Un achat de service à un fournisseur étranger, dont l'acheteur autoliquide la
 * TVA (art. 283-2 CGI). Le prestataire facture hors taxe : la TVA se déclare
 * côté acheteur.
 */
export interface PieceAutoliquidee {
  readonly id: string;
  readonly libelle: string;
  readonly fournisseur: string;
  /** `ue` ou `hors_ue` : la ligne du formulaire n'est pas la même. */
  readonly provenance: 'ue' | 'hors_ue';
  readonly payeeLe: DateISO;
  readonly baseHt: Euros;
  readonly tvaDue: Euros;
  /**
   * Le régime AU MOIS DE PAIEMENT, pas celui d'aujourd'hui : un franchisé
   * devenu redevable en cours d'année a des achats des deux espèces dans la
   * même année, et seul le second côté déduit.
   */
  readonly regime: 'franchise' | 'assujetti';
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
  /**
   * Base et TVA de la période par taux, du plus fort au plus faible — ce que
   * le formulaire demande ligne par ligne. Ne porte que les pièces ventilées.
   */
  readonly parTaux: readonly PartTaux[];
  /**
   * Les encaissements dont la TVA est connue mais pas sa répartition : une
   * facture d'avant le schéma 20 qui mêlait des taux. Leur TVA compte dans
   * `collectee` ; leur base est à répartir à la main entre les lignes du
   * formulaire.
   */
  readonly aVentiler: readonly PieceCollectee[];
  /** Les achats autoliquidés payés dans la période, dans l'ordre de paiement. */
  readonly autoliquidations: readonly PieceAutoliquidee[];
  readonly autoliquideeBase: Euros;
  /** TVA due sur ces achats, quel que soit le régime. */
  readonly autoliquideeDue: Euros;
  /**
   * La part de cette TVA qui se déduit : toute celle d'un redevable, rien en
   * franchise. Sans cette asymétrie, un franchisé verrait son solde baisser de
   * ce qu'il doit réellement.
   */
  readonly autoliquideeDeductible: Euros;
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
  { du, au, encaissements, achats, autoliquidations = [] }: {
    readonly du: DateISO;
    readonly au: DateISO;
    readonly encaissements: readonly PieceCollectee[];
    readonly achats: readonly PieceDeduite[];
    readonly autoliquidations?: readonly PieceAutoliquidee[];
  }
): DossierTva {
  const retenus = encaissements
    .filter((e) => dansLaPeriode(e.encaisseeLe, du, au))
    .sort((a, b) => a.encaisseeLe.localeCompare(b.encaisseeLe));

  const retenusAchats = achats
    .filter((a) => dansLaPeriode(a.payeeLe, du, au) && a.tvaRecuperable > 0)
    .sort((a, b) => a.payeeLe.localeCompare(b.payeeLe));

  const retenusAuto = autoliquidations
    .filter((a) => dansLaPeriode(a.payeeLe, du, au))
    .sort((a, b) => a.payeeLe.localeCompare(b.payeeLe));
  const somme = (l: readonly PieceAutoliquidee[], f: (a: PieceAutoliquidee) => number): Euros =>
    euros(l.reduce((s, a) => s + f(a), 0));
  const autoliquideeDue = somme(retenusAuto, (a) => a.tvaDue);
  const autoliquideeDeductible = somme(
    retenusAuto.filter((a) => a.regime === 'assujetti'), (a) => a.tvaDue
  );

  const connus = retenus.filter((e) => e.tva !== null);
  const inconnus = retenus.filter((e) => e.tva === null);

  const collectee = euros(connus.reduce((s, e) => s + (e.tva ?? 0), 0));
  const deductible = euros(retenusAchats.reduce((s, a) => s + a.tvaRecuperable, 0));

  return {
    du,
    au,
    collectee,
    deductible,
    // L'autoliquidée due s'ajoute, sa part déductible se retranche : nette nulle
    // chez un redevable, due en entier chez un franchisé. C'est ce que la
    // provision retient aussi — deux chiffres, une règle.
    aPayer: euros(collectee + autoliquideeDue - deductible - autoliquideeDeductible),
    encaissements: retenus,
    achats: retenusAchats,
    encaissementsSansTva: inconnus,
    // La base porte TOUS les encaissements, y compris ceux dont la TVA est
    // inconnue : le chiffre d'affaires, lui, est connu — c'est le montant porté
    // au livre. Seule la taxe manque.
    baseHt: euros(retenus.reduce((s, e) => s + e.montantHt, 0)),
    parTaux: totauxParTaux(connus),
    aVentiler: connus.filter((e) => e.ventilation === null),
    autoliquidations: retenusAuto,
    autoliquideeBase: somme(retenusAuto, (a) => a.baseHt),
    autoliquideeDue,
    autoliquideeDeductible
  };
}

/**
 * Les parts des pièces ventilées, cumulées par taux. Un avoir y entre au signe
 * opposé : il diminue la base et la TVA du taux de la facture qu'il annule,
 * dans le trimestre où il est porté.
 */
function totauxParTaux(pieces: readonly PieceCollectee[]): readonly PartTaux[] {
  const cumul = new Map<number, { base: number; tva: number }>();
  for (const p of pieces) {
    for (const part of p.ventilation ?? []) {
      const c = cumul.get(part.taux) ?? { base: 0, tva: 0 };
      cumul.set(part.taux, { base: c.base + part.base, tva: c.tva + part.tva });
    }
  }
  return [...cumul.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([taux, c]) => ({ taux, base: euros(c.base), tva: euros(c.tva) }));
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
