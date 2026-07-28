/**
 * Dépenses, justificatifs et TVA déductible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES DE CONFORMITÉ, ET POURQUOI ELLES SONT ICI ET PAS DANS L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 1. **Pas de TVA récupérable sans justificatif.** C'est l'invariant central
 *    du modèle cible, et le seul que l'ancienne application portait
 *    correctement. Déduire une TVA sans pièce, c'est un rappel assuré en
 *    contrôle. La règle vit dans le domaine pour qu'aucun écran ne puisse
 *    l'oublier ni la contourner.
 *
 * 2. **Pas de TVA déductible en franchise en base.** L'ancienne application
 *    affichait « TVA déductible 760 € » à un utilisateur en franchise, qui
 *    n'a droit à rien. Ce n'était pas une approximation, c'était une
 *    affirmation fausse. Toute la chaîne est donc conditionnée au régime.
 *
 * 3. **Autoliquidation sur les achats hors de France.** Un micro en franchise
 *    qui achète un service à un prestataire étranger est redevable de la TVA
 *    française sur cet achat, doit la déclarer, et **ne peut pas la déduire**.
 *    L'audit comptable classe cet oubli en risque majeur : il porte sur
 *    plusieurs années et une obligation déclarative totalement ignorée.
 *    Ici, on détecte et on signale — on ne calcule pas la déclaration.
 */

import { type DateISO, type Euros, type Ratio, euros, ratio } from '../types';

/** Régime de TVA de l'entreprise. Discriminant de toute la chaîne. */
export type RegimeTva = 'franchise' | 'assujetti';

/**
 * Provenance du fournisseur. Détermine qui doit la TVA.
 *
 * `ue` et `hors_ue` diffèrent par la déclaration à produire, pas par le
 * principe : dans les deux cas l'acheteur autoliquide.
 */
export type ProvenanceFournisseur = 'france' | 'ue' | 'hors_ue';

/**
 * État de rapprochement bancaire, **explicite et stocké**.
 *
 * L'ancienne application rapprochait automatiquement par candidats mais ne
 * posait aucun état consultable ni corrigeable : « chaque opération est
 * rapprochée » n'était donc pas vérifiable. Les trois états ci-dessous sont
 * des faits, pas des déductions refaites à chaque affichage.
 */
export type EtatRapprochement =
  /** Une opération bancaire correspond, et l'utilisateur l'a confirmé. */
  | 'rapproche'
  /** En attente : ni confirmé, ni écarté. */
  | 'en_attente'
  /** Aucune opération ne peut correspondre : compte non synchronisé, espèces… */
  | 'sans_banque';

export interface Depense {
  readonly id: string;
  readonly libelle: string;
  readonly fournisseur: string;
  readonly provenance: ProvenanceFournisseur;
  /** Montant toutes taxes comprises, tel que payé. */
  readonly montantTtc: Euros;
  /** Taux de TVA de la facture. Saisi, jamais supposé. */
  readonly tauxTva: Ratio;
  /**
   * Date de paiement, ou `null` quand elle est inconnue.
   *
   * `null` n'est pas une commodité : les charges de l'ancienne application
   * n'étaient parfois datées qu'au mois, et une dépense non datée ne peut être
   * rattachée ni à un exercice ni à un régime de TVA. Le dire vaut mieux que
   * de fabriquer une date plausible.
   */
  readonly payeeLe: DateISO | null;
  /**
   * Identifiant du justificatif conservé, ou `null` s'il manque.
   *
   * Un booléen ne suffirait pas : la pièce doit être retrouvable. C'est un
   * identifiant de fichier stocké, pas une case cochée.
   */
  readonly justificatifId: string | null;
  readonly rapprochement: EtatRapprochement;
}

export interface ContexteDepenses {
  readonly regimeTva: RegimeTva;
  /** `false` quand aucun compte bancaire n'est relié. */
  readonly banqueSynchronisee: boolean;
}

/**
 * Pourquoi une TVA n'est pas récupérable. Un motif, jamais un simple `false` :
 * l'utilisateur doit savoir ce qu'il lui manque pour agir.
 */
export type MotifNonRecuperable =
  | 'franchise'
  | 'justificatif_manquant'
  | 'autoliquidation'
  | 'taux_nul';

export interface TvaDepense {
  readonly recuperable: Euros;
  readonly motifNonRecuperable: MotifNonRecuperable | null;
  /** Montant de TVA que l'acheteur doit autoliquider, le cas échéant. */
  readonly aAutoliquider: Euros;
}

/** Part de TVA contenue dans un montant TTC. */
function tvaContenue(montantTtc: Euros, taux: Ratio): Euros {
  if (taux <= 0) return euros(0);
  return euros(montantTtc - montantTtc / (1 + taux));
}

/**
 * TVA d'une dépense : ce qui est récupérable, ce qui ne l'est pas et pourquoi,
 * et ce qui doit être autoliquidé.
 *
 * L'ordre des conditions n'est pas indifférent. Le régime est vérifié en
 * premier parce qu'il rend la question sans objet : en franchise, l'absence de
 * justificatif n'est pas le motif de non-récupération, et l'annoncer ainsi
 * enverrait l'utilisateur chercher une pièce qui ne changerait rien.
 */
export function tvaDeDepense(depense: Depense, contexte: ContexteDepenses): TvaDepense {
  const brute = tvaContenue(depense.montantTtc, depense.tauxTva);

  // Achat hors de France : l'acheteur autoliquide. La TVA est due ET non
  // déductible pour un assujetti en franchise — c'est ce double effet que
  // l'ancienne application ignorait complètement.
  if (depense.provenance !== 'france') {
    const aAutoliquider = contexte.regimeTva === 'franchise'
      ? tvaContenue(depense.montantTtc, ratio(0.20))
      : brute;
    return {
      recuperable: euros(0),
      motifNonRecuperable: 'autoliquidation',
      aAutoliquider
    };
  }

  if (contexte.regimeTva === 'franchise') {
    return { recuperable: euros(0), motifNonRecuperable: 'franchise', aAutoliquider: euros(0) };
  }

  if (depense.tauxTva <= 0) {
    return { recuperable: euros(0), motifNonRecuperable: 'taux_nul', aAutoliquider: euros(0) };
  }

  // L'invariant central : pas de pièce, pas de récupération.
  if (depense.justificatifId === null) {
    return {
      recuperable: euros(0),
      motifNonRecuperable: 'justificatif_manquant',
      aAutoliquider: euros(0)
    };
  }

  return { recuperable: brute, motifNonRecuperable: null, aAutoliquider: euros(0) };
}

/**
 * L'état de rapprochement affichable.
 *
 * Invariant : **une dépense n'est jamais présentée comme rapprochée quand
 * aucun compte n'est synchronisé.** Sans cette règle, un état « rapproché »
 * hérité d'une ancienne configuration survivrait à la déconnexion du compte et
 * laisserait croire à un contrôle qui n'a plus lieu.
 */
export function rapprochementEffectif(
  depense: Depense,
  contexte: ContexteDepenses
): EtatRapprochement {
  if (!contexte.banqueSynchronisee) return 'sans_banque';
  return depense.rapprochement;
}

/**
 * De quoi obtenir le contexte d'une dépense.
 *
 * Un contexte unique pour tout un lot serait faux dès qu'une entreprise
 * franchit le seuil de TVA en cours d'année : les dépenses payées avant
 * l'assujettissement relèvent de la franchise, celles d'après non. La forme
 * fonction permet de résoudre le régime **à la date de paiement** de chaque
 * dépense, comme les taux URSSAF se résolvent au mois d'encaissement.
 */
export type SourceContexte =
  | ContexteDepenses
  | ((depense: Depense) => ContexteDepenses);

export function contexteDe(source: SourceContexte): (d: Depense) => ContexteDepenses {
  return typeof source === 'function' ? source : () => source;
}

export interface ResumeDepenses {
  readonly nombre: number;
  readonly totalTtc: Euros;
  readonly tvaRecuperable: Euros;
  readonly tvaAAutoliquider: Euros;
  /** Dépenses dont la TVA serait récupérable s'il y avait une pièce. */
  readonly sansJustificatif: number;
  /** Montant de TVA perdu faute de justificatif. Ce que l'oubli coûte. */
  readonly tvaPerdueFauteDePiece: Euros;
  readonly aRapprocher: number;
}

/**
 * Résumé d'un ensemble de dépenses.
 *
 * `tvaPerdueFauteDePiece` mérite un mot : c'est la seule manière de rendre
 * l'invariant tangible. Dire « justificatif manquant » n'incite personne à
 * chercher une pièce ; dire « 340 € de TVA que vous ne récupérerez pas »
 * change la décision.
 */
export function resumerDepenses(
  depenses: readonly Depense[],
  source: SourceContexte
): ResumeDepenses {
  const contexteDeLaDepense = contexteDe(source);
  let totalTtc = 0;
  let tvaRecuperable = 0;
  let tvaAAutoliquider = 0;
  let sansJustificatif = 0;
  let tvaPerdue = 0;
  let aRapprocher = 0;

  for (const depense of depenses) {
    const contexte = contexteDeLaDepense(depense);
    const tva = tvaDeDepense(depense, contexte);
    totalTtc += depense.montantTtc;
    tvaRecuperable += tva.recuperable;
    tvaAAutoliquider += tva.aAutoliquider;

    if (tva.motifNonRecuperable === 'justificatif_manquant') {
      sansJustificatif += 1;
      // Ce qui aurait été récupérable avec la pièce.
      tvaPerdue += tvaContenue(depense.montantTtc, depense.tauxTva);
    }
    if (rapprochementEffectif(depense, contexte) === 'en_attente') aRapprocher += 1;
  }

  return {
    nombre: depenses.length,
    totalTtc: euros(totalTtc),
    tvaRecuperable: euros(tvaRecuperable),
    tvaAAutoliquider: euros(tvaAAutoliquider),
    sansJustificatif,
    tvaPerdueFauteDePiece: euros(tvaPerdue),
    aRapprocher
  };
}

/** Libellé du motif, à l'attention de l'utilisateur. */
export function libelleMotif(motif: MotifNonRecuperable): string {
  switch (motif) {
    case 'franchise':
      return 'Franchise en base : aucune TVA n’est déductible.';
    case 'justificatif_manquant':
      return 'Justificatif manquant : sans pièce, la TVA n’est pas récupérable.';
    case 'autoliquidation':
      return 'Achat hors de France : TVA à autoliquider, due et non déductible.';
    case 'taux_nul':
      return 'Aucune TVA sur cette dépense.';
  }
}
