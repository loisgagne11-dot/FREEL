/**
 * Impôt sur le revenu et régime d'imposition du micro-entrepreneur.
 *
 * Trois briques par PÉRIODE — tranches du barème progressif, versement
 * libératoire, contribution à la formation professionnelle (CFP) — et un
 * discriminant qui rend le régime d'imposition EXCLUSIF par construction.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE FACTEUR 1,56 NE DOIT JAMAIS REVENIR
 * ─────────────────────────────────────────────────────────────────────────
 * L'ancienne application calculait `cotisIR() = base × tauxIR × 1,56`. Ce
 * facteur n'a aucun fondement légal (audit comptable §2, anomalie D — quatre
 * origines possibles envisagées, toutes fautives) : le versement libératoire
 * est un forfait de 2,2 % des recettes encaissées HT, sans multiplicateur.
 * Toute réintroduction d'un coefficient correctif sur ce calcul, sous
 * quelque forme que ce soit, est une régression.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ACOMPTE DE PRÉLÈVEMENT À LA SOURCE N'EST PAS CALCULÉ ICI
 * ─────────────────────────────────────────────────────────────────────────
 * Sous le régime du barème (sans option pour le versement libératoire),
 * l'acompte contemporain de prélèvement à la source est NOTIFIÉ par la
 * DGFiP à partir du revenu déclaré l'année précédente : c'est un FAIT SAISI
 * par l'utilisateur depuis son avis, pas une grandeur que ce module peut
 * calculer à partir du barème. Le reconstituer serait recréer l'anomalie E
 * de l'audit (double imposition IR : l'ancienne version cumulait un acompte
 * PAS saisi ET un `cotisIR()` calculé pour la même dette). D'où
 * `RegimeImposition.bareme.acomptePasSaisi`, qui est une entrée, jamais une
 * sortie de calcul.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EXCLUSIVITÉ VERSEMENT LIBÉRATOIRE / BARÈME
 * ─────────────────────────────────────────────────────────────────────────
 * Les deux régimes sont mutuellement exclusifs pour un même contribuable :
 * versement libératoire ⇒ 2,2 % (BNC) payés avec les cotisations URSSAF, et
 * AUCUN acompte de PAS distinct ; barème ⇒ acompte de PAS saisi, et AUCUNE
 * ligne de versement libératoire. `RegimeImposition` est un type à
 * discriminant : le compilateur interdit de renseigner les deux à la fois,
 * et `calculerLigneFiscale` renvoie une structure où l'un des deux champs
 * est toujours `null` — impossible à contourner par erreur d'appel.
 */

import {
  type DateISO, type Euros, type Mois, type Ratio, type Resolution, type TypeActivite,
  dateISO, estUtilisable, euros, mois, ratio
} from '../types';

// ───────────────────────────── Barème de l'IR ─────────────────────────────

export interface TrancheIR {
  /** Borne basse de la tranche, en euros de revenu imposable. */
  readonly seuil: Euros;
  readonly taux: Ratio;
}

/**
 * Un jeu de tranches s'applique à une ANNÉE DE REVENUS entière (le barème
 * voté en loi de finances de l'année N+1 s'applique aux revenus de N) — pas
 * à une fenêtre glissante comme le taux URSSAF. Contrairement à
 * `urssaf.ts`, la dernière période connue ici est donc VOLONTAIREMENT
 * fermée (`au` renseigné) plutôt que laissée ouverte : le barème 2024 était
 * applicable spécifiquement aux revenus 2024, et rien ne garantit qu'il
 * reste inchangé pour l'année suivante (le seuil est même réévalué chaque
 * année par indexation à l'inflation). Une période close signale
 * honnêtement « c'est tout ce que je sais », et la fonction de résolution
 * ci-dessous extrapole quand même vers le futur — la fermeture ne change
 * que la lecture, pas le mécanisme.
 */
export interface PeriodeIR {
  readonly du: Mois;
  readonly au: Mois | null;
  readonly tranches: readonly TrancheIR[];
  readonly source: string;
  readonly verifieLe: DateISO;
}

/**
 * Tranches applicables aux revenus 2024 (déclaration 2025), seul millésime
 * identifié avec confiance haute par l'audit comptable (§3). Les tranches
 * applicables aux revenus 2025 (déclaration 2026) — donc à l'année en cours
 * au moment d'écrire ce fichier — ne sont PAS saisies : un gel du barème a
 * été discuté en loi de finances 2026 sans que je puisse trancher son
 * issue. Un mois de 2025 ou 2026 sera donc résolu en HYPOTHÈSE (reprise du
 * dernier barème connu), jamais en `publie` — ce qui est le comportement
 * honnête recherché.
 */
export const PERIODES_IR: readonly PeriodeIR[] = [
  {
    du: mois('2024-01'),
    au: mois('2024-12'),
    tranches: [
      { seuil: euros(0), taux: ratio(0) },
      { seuil: euros(11497), taux: ratio(0.11) },
      { seuil: euros(29315), taux: ratio(0.30) },
      { seuil: euros(83823), taux: ratio(0.41) },
      { seuil: euros(180294), taux: ratio(0.45) }
    ],
    source: 'Audit comptable §3 — tranches revenus 2024, déclaration 2025',
    verifieLe: dateISO('2026-07-27')
  }
];

export function periodeTranchesIRPour(m: Mois): PeriodeIR | undefined {
  return PERIODES_IR.find((per) => m >= per.du && (per.au === null || m <= per.au));
}

const premiereIR = (): PeriodeIR | undefined => PERIODES_IR[0];
const derniereIR = (): PeriodeIR | undefined => PERIODES_IR[PERIODES_IR.length - 1];

/** Tranches applicables à un mois. Même asymétrie du temps que `urssaf.ts`. */
export function tranchesIR(m: Mois): Resolution<readonly TrancheIR[]> {
  const couvrante = periodeTranchesIRPour(m);
  if (couvrante) {
    return { statut: 'publie', valeur: couvrante.tranches, source: couvrante.source, verifieLe: couvrante.verifieLe };
  }

  const debut = premiereIR();
  if (debut !== undefined && m < debut.du) {
    return {
      statut: 'refuse',
      motif: `Aucun barème IR connu pour ${m} : période antérieure au plus ancien barème saisi `
        + `(${debut.du}). Un barème passé est un fait publié, il ne peut pas être extrapolé.`
    };
  }

  const fin = derniereIR();
  if (fin === undefined) {
    return { statut: 'refuse', motif: 'Aucun barème IR saisi.' };
  }

  return { statut: 'hypothese', valeur: fin.tranches, source: fin.source, verifieLe: fin.verifieLe, depuis: fin.du };
}

/**
 * Applique le barème progressif à un revenu imposable : chaque tranche ne
 * taxe que la part de revenu qui lui appartient. Calcul pur, indépendant du
 * quotient familial (hors périmètre — ce module ne connaît pas le foyer).
 */
export function irParTranches(revenuImposable: Euros, tranches: readonly TrancheIR[]): Euros {
  let impot = 0;
  for (let i = 0; i < tranches.length; i++) {
    const tranche = tranches[i];
    if (tranche === undefined) continue;
    const suivante = tranches[i + 1];
    const borneHaute = suivante !== undefined ? suivante.seuil : Infinity;
    if (revenuImposable <= tranche.seuil) break;
    const partDansTranche = Math.min(revenuImposable, borneHaute) - tranche.seuil;
    impot += partDansTranche * tranche.taux;
  }
  return euros(Math.max(0, impot));
}

// ────────────────────────── Versement libératoire ─────────────────────────

export interface PeriodeVersementLiberatoire {
  readonly du: Mois;
  readonly au: Mois | null;
  readonly taux: Readonly<Record<TypeActivite, Ratio>>;
  readonly source: string;
  readonly verifieLe: DateISO;
}

/**
 * 2,2 % BNC, 1 % BIC vente, 1,7 % BIC service — repris de l'ancienne
 * application, confiance HAUTE (corroboré par l'audit comptable §3). Taux
 * stables historiquement ; table par période au cas où ils changeraient,
 * même convention que `urssaf.ts` : ajouter, ne jamais modifier après coup.
 * Non réduit par l'ACRE (voir `urssaf.ts`, `ABATTEMENT_ACRE`, qui ne
 * s'applique qu'aux cotisations sociales).
 */
export const PERIODES_VERSEMENT_LIBERATOIRE: readonly PeriodeVersementLiberatoire[] = [
  {
    du: mois('2024-01'),
    au: null,
    taux: { BNC: ratio(0.022), BIC_vente: ratio(0.01), BIC_service: ratio(0.017) },
    source: 'Ancienne application, confiance haute (audit comptable §3)',
    verifieLe: dateISO('2026-07-27')
  }
];

export function periodeVersementLiberatoirePour(m: Mois): PeriodeVersementLiberatoire | undefined {
  return PERIODES_VERSEMENT_LIBERATOIRE.find((per) => m >= per.du && (per.au === null || m <= per.au));
}

const premiereVL = (): PeriodeVersementLiberatoire | undefined => PERIODES_VERSEMENT_LIBERATOIRE[0];
const derniereVL = (): PeriodeVersementLiberatoire | undefined =>
  PERIODES_VERSEMENT_LIBERATOIRE[PERIODES_VERSEMENT_LIBERATOIRE.length - 1];

export function tauxVersementLiberatoire(m: Mois, type: TypeActivite): Resolution<Ratio> {
  const couvrante = periodeVersementLiberatoirePour(m);
  if (couvrante) {
    return { statut: 'publie', valeur: couvrante.taux[type], source: couvrante.source, verifieLe: couvrante.verifieLe };
  }

  const debut = premiereVL();
  if (debut !== undefined && m < debut.du) {
    return {
      statut: 'refuse',
      motif: `Aucun taux de versement libératoire connu pour ${m} : période antérieure au plus `
        + `ancien barème saisi (${debut.du}).`
    };
  }

  const fin = derniereVL();
  if (fin === undefined) {
    return { statut: 'refuse', motif: 'Aucun taux de versement libératoire saisi.' };
  }

  return { statut: 'hypothese', valeur: fin.taux[type], source: fin.source, verifieLe: fin.verifieLe, depuis: fin.du };
}

// ──────────────────── Contribution à la formation pro. (CFP) ──────────────

export interface PeriodeCfp {
  readonly du: Mois;
  readonly au: Mois | null;
  readonly taux: Readonly<Record<TypeActivite, Ratio>>;
  readonly source: string;
  readonly verifieLe: DateISO;
}

/**
 * 0,2 % pour les professions libérales (BNC), 0,1 % pour les commerçants
 * (BIC_vente) — confiance haute (audit comptable §3).
 *
 * BIC_service : ce projet ne distingue pas « prestation de service
 * commerciale ou libérale non réglementée » (0,2 %, retenu ici) de
 * « prestation de service ARTISANALE » (0,3 %) — `TypeActivite` n'a pas de
 * variante « artisan ». Confiance MOYENNE sur ce choix pour BIC_service
 * précisément : à corriger si une activité artisanale doit un jour être
 * représentée.
 */
export const PERIODES_CFP: readonly PeriodeCfp[] = [
  {
    du: mois('2024-01'),
    au: null,
    taux: { BNC: ratio(0.002), BIC_vente: ratio(0.001), BIC_service: ratio(0.002) },
    source: 'Ancienne application / connaissance générale du régime micro, confiance haute sauf '
      + 'BIC_service (moyenne, voir commentaire ci-dessus)',
    verifieLe: dateISO('2026-07-27')
  }
];

export function periodeCfpPour(m: Mois): PeriodeCfp | undefined {
  return PERIODES_CFP.find((per) => m >= per.du && (per.au === null || m <= per.au));
}

const premiereCfp = (): PeriodeCfp | undefined => PERIODES_CFP[0];
const derniereCfp = (): PeriodeCfp | undefined => PERIODES_CFP[PERIODES_CFP.length - 1];

/** Non réduit par l'ACRE (audit comptable §2, anomalie M). */
export function tauxCfp(m: Mois, type: TypeActivite): Resolution<Ratio> {
  const couvrante = periodeCfpPour(m);
  if (couvrante) {
    return { statut: 'publie', valeur: couvrante.taux[type], source: couvrante.source, verifieLe: couvrante.verifieLe };
  }

  const debut = premiereCfp();
  if (debut !== undefined && m < debut.du) {
    return {
      statut: 'refuse',
      motif: `Aucun taux de CFP connu pour ${m} : période antérieure au plus ancien barème saisi `
        + `(${debut.du}).`
    };
  }

  const fin = derniereCfp();
  if (fin === undefined) {
    return { statut: 'refuse', motif: 'Aucun taux de CFP saisi.' };
  }

  return { statut: 'hypothese', valeur: fin.taux[type], source: fin.source, verifieLe: fin.verifieLe, depuis: fin.du };
}

// ───────────────────── Régime d'imposition — discriminant ─────────────────

/**
 * Le régime d'imposition d'un micro-entrepreneur, à discriminant exclusif :
 * impossible de renseigner à la fois un versement libératoire et un
 * acompte de PAS pour la même période, le compilateur refuse la construction
 * d'un objet qui aurait les deux formes à la fois.
 */
export type RegimeImposition =
  | { readonly regime: 'versement_liberatoire' }
  | { readonly regime: 'bareme'; readonly acomptePasSaisi: Euros };

export interface VersementLiberatoireCalcule {
  readonly taux: Ratio;
  readonly montant: Euros;
}

export interface LigneFiscale {
  /** `null` sous le régime du barème : jamais les deux à la fois. */
  readonly versementLiberatoire: Resolution<VersementLiberatoireCalcule> | null;
  /** `null` sous le régime du versement libératoire : jamais les deux à la fois. */
  readonly acomptePas: Euros | null;
}

/**
 * Calcule la ligne d'imposition du mois selon le régime choisi. C'est la
 * fonction qui rend l'exclusivité versement libératoire / barème impossible
 * à contourner par erreur : le type de retour a toujours l'un des deux
 * champs à `null`, jamais les deux renseignés, jamais les deux à `null` sauf
 * en cas de barème non résolu (voir ci-dessous).
 */
export function calculerLigneFiscale(
  regime: RegimeImposition,
  recettesEncaisseesHT: Euros,
  m: Mois,
  type: TypeActivite
): LigneFiscale {
  if (regime.regime === 'bareme') {
    // L'acompte est un fait saisi par l'utilisateur depuis son avis DGFiP,
    // jamais un calcul : voir l'avertissement en tête de fichier.
    return { versementLiberatoire: null, acomptePas: regime.acomptePasSaisi };
  }

  const tauxR = tauxVersementLiberatoire(m, type);
  if (!estUtilisable(tauxR)) {
    return { versementLiberatoire: tauxR, acomptePas: null };
  }

  const montant = euros(recettesEncaisseesHT * tauxR.valeur);
  const vl: Resolution<VersementLiberatoireCalcule> = tauxR.statut === 'publie'
    ? { statut: 'publie', valeur: { taux: tauxR.valeur, montant }, source: tauxR.source, verifieLe: tauxR.verifieLe }
    : { statut: 'hypothese', valeur: { taux: tauxR.valeur, montant }, source: tauxR.source, verifieLe: tauxR.verifieLe, depuis: tauxR.depuis };

  return { versementLiberatoire: vl, acomptePas: null };
}

/**
 * Part d'impôt et de contributions à provisionner EN PLUS des cotisations
 * sociales (`urssaf.ts`, `tauxCotisations`) : CFP toujours due, plus 2,2 %
 * (BNC) de versement libératoire si — et seulement si — ce régime est
 * choisi. Sous le régime du barème, l'acompte de PAS n'entre pas dans ce
 * ratio : c'est un montant saisi séparément (voir `calculerLigneFiscale`),
 * pas un taux appliqué aux recettes.
 *
 * Conçu pour alimenter directement `ContexteProvisions.tauxImpotEtContributions`
 * (`domain/calculs/provisions.ts`), qui attend exactement cette grandeur.
 */
export function tauxImpotEtContributions(
  regime: RegimeImposition,
  m: Mois,
  type: TypeActivite
): Resolution<Ratio> {
  const cfpR = tauxCfp(m, type);
  if (!estUtilisable(cfpR)) return cfpR;

  if (regime.regime === 'bareme') {
    return cfpR;
  }

  const vlR = tauxVersementLiberatoire(m, type);
  if (!estUtilisable(vlR)) return vlR;

  const total = ratio(cfpR.valeur + vlR.valeur);
  // Le résultat le plus prudent des deux résolutions : une hypothèse sur
  // l'une des deux composantes rend l'ensemble une hypothèse.
  if (cfpR.statut === 'publie' && vlR.statut === 'publie') {
    return { statut: 'publie', valeur: total, source: `${cfpR.source} + ${vlR.source}`, verifieLe: cfpR.verifieLe };
  }
  const hypothese = cfpR.statut === 'hypothese' ? cfpR : (vlR as Extract<Resolution<Ratio>, { statut: 'hypothese' }>);
  return {
    statut: 'hypothese',
    valeur: total,
    source: `${cfpR.source} + ${vlR.source}`,
    verifieLe: hypothese.verifieLe,
    depuis: hypothese.depuis
  };
}

/**
 * Contrôle d'intégrité des trois tables (tranches IR, versement libératoire,
 * CFP), exécuté par les tests. Renvoie la liste des anomalies ; vide si les
 * tables sont saines.
 */
export function verifierIntegriteImpot(): readonly string[] {
  const anomalies: string[] = [];

  const controler = <T extends { readonly du: Mois; readonly au: Mois | null; readonly source: string }>(
    label: string,
    periodes: readonly T[]
  ): void => {
    periodes.forEach((per, i) => {
      if (!per.source) anomalies.push(`${label} ${per.du} : source manquante.`);
      if (per.au !== null && per.au < per.du) {
        anomalies.push(`${label} ${per.du} : fin (${per.au}) antérieure au début.`);
      }
      const suivante = periodes[i + 1];
      if (suivante !== undefined && per.au !== null && !(per.au < suivante.du)) {
        anomalies.push(`${label} ${per.du} et ${suivante.du} : chevauchement ou désordre.`);
      }
    });
  };

  controler('Tranches IR', PERIODES_IR);
  controler('Versement libératoire', PERIODES_VERSEMENT_LIBERATOIRE);
  controler('CFP', PERIODES_CFP);

  return anomalies;
}
