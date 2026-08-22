/**
 * Franchise en base de TVA : les DEUX seuils, par PÉRIODE et par type
 * d'activité, et l'état d'assujettissement qui en découle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX SEUILS, ET POURQUOI C'EST LE PIÈGE LE PLUS COÛTEUX DU BARÈME
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Il existe un seuil de franchise ET un seuil majoré, et seul le second
 * déclenche un assujettissement immédiat :
 *
 *   - sous la franchise : pas de TVA à facturer ;
 *   - entre la franchise et le seuil majoré : la franchise est MAINTENUE
 *     jusqu'à la fin de l'année en cours (sous condition de la règle N-1/N-2
 *     ci-dessous), mais perdue au 1er janvier suivant ;
 *   - au-delà du seuil majoré : assujettissement IMMÉDIAT, dès la facture qui
 *     fait franchir le seuil.
 *
 * L'ancienne application affichait « au-delà de 37 500 € encaissés
 * (obligation légale) » pour déclencher l'assujettissement — c'est
 * juridiquement FAUX (audit comptable §3) : 37 500 € est le seuil de
 * franchise, pas celui qui oblige à facturer la TVA sur-le-champ. Cette
 * mention n'est PAS reproduite ici, volontairement.
 *
 * Mécanique N-1/N-2 pour l'ÉLIGIBILITÉ à la franchise au 1er janvier d'une
 * année N (distincte du suivi en cours d'année N ci-dessus, qui ne regarde
 * que le CA encaissé de l'année N elle-même) : la franchise s'applique en N
 * si le CA de N-1 ne dépasse pas le seuil de franchise, ou s'il est resté
 * dans la zone tolérée [franchise ; majoré] à condition que le CA de N-2
 * n'ait pas dépassé le seuil de franchise. Confiance moyenne-haute sur cette
 * structure, moyenne sur le fait générateur exact (jour du dépassement vs
 * 1er jour du mois de dépassement — à vérifier au BOFiP).
 *
 * `assujettissementTva` (plus bas) calcule la partie N-1 de cette règle —
 * c'est le bug remonté qui motive sa présence : un CA encaissé en décembre
 * N-1 rend redevable dès le 1er janvier N, et une application qui ne regarde
 * que le CA de l'année en cours ne peut structurellement pas le voir. Elle
 * simplifie volontairement la nuance N-2 : elle traite tout dépassement de la
 * franchise en N-1 (zone tolérée comprise) comme perdant la franchise en N,
 * SANS vérifier si N-2 aurait accordé la tolérance. C'est le sens prudent de
 * l'erreur — elle peut dire « redevable » un peu trop tôt dans un cas rare de
 * zone tolérée deux années de suite, jamais trop tard — mais ce n'est pas la
 * règle exacte : le calcul de N-2 reste un historique que ce module ne
 * détient pas encore.
 *
 * `seuilsTvaPourAnnee` calcule le prorata temporis de la première année
 * d'activité (à partir de `debutActivite`) : les deux seuils sont réduits au
 * nombre de jours d'activité rapporté à 365, une convention usuelle pour ce
 * type de prorata en droit fiscal français — confiance moyenne, la
 * formulation exacte (365 fixes vs jours réels de l'année) n'a pas été
 * recoupée au BOFiP pour ce module précis.
 *
 * ⚠️ RÉSERVE MAJEURE, NON IMPLÉMENTÉE DÉLIBÉRÉMENT : un projet de seuil
 * unique à 25 000 € a été voté en loi de finances 2025 puis suspendu et
 * renvoyé aux débats budgétaires suivants. Le rapport comptable indique
 * qu'il aurait été rejeté, mais je ne connais pas son sort définitif à la
 * date de vérification ci-dessous. C'est le paramètre le plus volatile de
 * tout le barème fiscal — NE PAS implémenter cette hypothèse tant qu'elle
 * n'est pas confirmée à la source (impots.gouv.fr / texte de loi promulgué).
 *
 * ⚠️ RATTACHEMENT À L'ENCAISSEMENT : pour une prestation de services, la TVA
 * est exigible au PAIEMENT, pas à la facturation (art. 269 CGI). Toutes les
 * fonctions ci-dessous prennent donc en paramètre un chiffre d'affaires
 * ENCAISSÉ, jamais facturé — c'est à L'APPELANT de garantir que le montant
 * transmis provient bien du livre des recettes (dates d'encaissement), et
 * non d'un total de factures émises. Ce module ne peut pas le vérifier
 * lui-même : il n'a pas accès aux factures, seulement à un montant.
 */

import {
  type DateISO, type Euros, type Mois, type Resolution, type TypeActivite,
  dateISO, estUtilisable, euros, mois
} from '../types';

export interface SeuilsTva {
  readonly franchise: Euros;
  readonly majore: Euros;
}

export interface PeriodeTva {
  readonly du: Mois;
  readonly au: Mois | null;
  readonly seuils: Readonly<Record<TypeActivite, SeuilsTva>>;
  readonly source: string;
  readonly verifieLe: DateISO;
}

const seuils = (franchise: number, majore: number): SeuilsTva => ({
  franchise: euros(franchise), majore: euros(majore)
});

const p = (
  du: string, au: string | null,
  serviceFranchise: number, serviceMajore: number,
  venteFranchise: number, venteMajore: number,
  source: string, verifieLe: string
): PeriodeTva => ({
  du: mois(du),
  au: au === null ? null : mois(au),
  seuils: {
    // BNC et BIC_service sont tous deux des prestations de services au sens
    // de la franchise de TVA.
    BNC: seuils(serviceFranchise, serviceMajore),
    BIC_service: seuils(serviceFranchise, serviceMajore),
    BIC_vente: seuils(venteFranchise, venteMajore)
  },
  source,
  verifieLe: dateISO(verifieLe)
});

export const PERIODES_TVA: readonly PeriodeTva[] = [
  p(
    '2025-01', null,
    37500, 41250,
    85000, 93500,
    'Ancienne application ; issues de la transposition de la directive UE 2020/285 '
      + 'applicable depuis 2025 — confiance MOYENNE-HAUTE (audit comptable §3). '
      + 'Voir réserve sur le projet de seuil unique à 25 000 € en tête de fichier : '
      + 'NON pris en compte ici, sort définitif inconnu à la date de vérification.',
    '2026-07-27'
  )
];

/** La période couvrant ce mois, ou `undefined` si aucune ne le couvre. */
export function periodeTvaPour(m: Mois): PeriodeTva | undefined {
  return PERIODES_TVA.find((per) => m >= per.du && (per.au === null || m <= per.au));
}

const premiere = (): PeriodeTva | undefined => PERIODES_TVA[0];
const derniere = (): PeriodeTva | undefined => PERIODES_TVA[PERIODES_TVA.length - 1];

/**
 * Les deux seuils applicables à un mois. Même asymétrie du temps que
 * `urssaf.ts` : extrapolation légitime vers le futur, refus vers le passé.
 */
export function seuilsTva(m: Mois, type: TypeActivite): Resolution<SeuilsTva> {
  const couvrante = periodeTvaPour(m);
  if (couvrante) {
    return {
      statut: 'publie',
      valeur: couvrante.seuils[type],
      source: couvrante.source,
      verifieLe: couvrante.verifieLe
    };
  }

  const debut = premiere();
  if (debut !== undefined && m < debut.du) {
    return {
      statut: 'refuse',
      motif: `Aucun seuil de TVA connu pour ${m} : période antérieure au plus ancien barème `
        + `saisi (${debut.du}). Un seuil passé est un fait publié, il ne peut pas être `
        + `extrapolé.`
    };
  }

  const fin = derniere();
  if (fin === undefined) {
    return { statut: 'refuse', motif: 'Aucun seuil de TVA saisi.' };
  }

  return {
    statut: 'hypothese',
    valeur: fin.seuils[type],
    source: fin.source,
    verifieLe: fin.verifieLe,
    depuis: fin.du
  };
}

/** Reporte le statut d'une résolution de seuils sur une valeur dérivée. */
function porterResolution<A>(
  base: Exclude<Resolution<SeuilsTva>, { statut: 'refuse' }>,
  valeur: A
): Resolution<A> {
  return base.statut === 'publie'
    ? { statut: 'publie', valeur, source: base.source, verifieLe: base.verifieLe }
    : { statut: 'hypothese', valeur, source: base.source, verifieLe: base.verifieLe, depuis: base.depuis };
}

export type EtatAssujettissementTva =
  | { readonly cas: 'sous_franchise' }
  /**
   * CA de l'année en cours au-delà de la franchise mais sous le seuil
   * majoré : la franchise est maintenue jusqu'au 31 décembre de l'année en
   * cours (sous condition de la règle N-1/N-2, voir tête de fichier),
   * assujettissement au 1er janvier suivant.
   */
  | { readonly cas: 'depassement_franchise' }
  /** CA de l'année en cours au-delà du seuil majoré : TVA due sur-le-champ. */
  | { readonly cas: 'depassement_majore' };

/**
 * État d'assujettissement pour un chiffre d'affaires ENCAISSÉ cumulé sur
 * l'année (voir l'avertissement sur l'encaissement en tête de fichier).
 */
export function etatAssujettissement(
  caEncaisseAnnee: Euros,
  m: Mois,
  type: TypeActivite
): Resolution<EtatAssujettissementTva> {
  const seuilsR = seuilsTva(m, type);
  if (!estUtilisable(seuilsR)) return seuilsR;

  const etat: EtatAssujettissementTva =
    caEncaisseAnnee > seuilsR.valeur.majore ? { cas: 'depassement_majore' }
    : caEncaisseAnnee > seuilsR.valeur.franchise ? { cas: 'depassement_franchise' }
    : { cas: 'sous_franchise' };

  return porterResolution(seuilsR, etat);
}

/**
 * Reste facturable avant de franchir le SEUIL MAJORÉ, donc avant
 * l'assujettissement immédiat.
 *
 * C'est la fonction qui a le plus de valeur métier de tout ce barème : sans
 * elle, l'utilisateur franchit le seuil majoré sans le savoir et doit la TVA
 * sur des factures déjà émises sans elle — de l'ordre de 1 667 € à sortir de
 * sa poche pour 10 000 € facturés trop tard (audit comptable, risque R6) :
 * une facture émise sans TVA après franchissement est réputée TTC, et la
 * part de TVA (1/6 à 20 %) doit être reversée sans avoir pu être répercutée
 * au client.
 *
 * Toujours ≥ 0 : au-delà du seuil majoré, il ne reste rien à facturer sans
 * TVA, jamais un montant négatif.
 */
export function resteAvantMajore(
  caEncaisseAnnee: Euros,
  m: Mois,
  type: TypeActivite
): Resolution<Euros> {
  const seuilsR = seuilsTva(m, type);
  if (!estUtilisable(seuilsR)) return seuilsR;

  const reste = euros(Math.max(0, seuilsR.valeur.majore - caEncaisseAnnee));
  return porterResolution(seuilsR, reste);
}

/**
 * Reste facturable avant de franchir le seuil de FRANCHISE simple —
 * information plus douce que `resteAvantMajore` : le franchir ne déclenche
 * rien d'immédiat, seulement une perte de la franchise au 1er janvier
 * suivant (sous condition N-1/N-2). Utile pour prévenir tôt, avant l'urgence
 * du seuil majoré.
 */
export function resteAvantFranchise(
  caEncaisseAnnee: Euros,
  m: Mois,
  type: TypeActivite
): Resolution<Euros> {
  const seuilsR = seuilsTva(m, type);
  if (!estUtilisable(seuilsR)) return seuilsR;

  const reste = euros(Math.max(0, seuilsR.valeur.franchise - caEncaisseAnnee));
  return porterResolution(seuilsR, reste);
}

/* ─────────────────────────────────────────────────────────────────────────
   Prorata de la première année, et redevabilité au regard de N-1
   ─────────────────────────────────────────────────────────────────────────
   Ce qui suit répond au bug remonté : les seuils ci-dessus ne regardaient que
   le CA encaissé de l'année en cours, ce qui rend invisible tout encaissement
   antérieur au 1er janvier — y compris une TVA déjà collectée en décembre de
   l'année précédente sur une facture émise plus tôt. Voir tête de fichier. */

/** Dénominateur du prorata temporis : 365 jours fixes, jamais 366 même une
 * année bissextile — convention usuelle des prorata fiscaux français (voir
 * confiance en tête de fichier), qui évite qu'un début d'activité au même
 * jour calendaire donne un seuil légèrement différent selon l'année. */
const JOURS_PRORATA = 365;

/**
 * Jours d'activité entre `debutActivite` et le 31 décembre de `annee`,
 * bornes incluses. Un début au 1er janvier rend exactement `JOURS_PRORATA`
 * jours (année pleine, prorata neutre) ; c'est le garde-fou qui vérifie que
 * la formule ne mord pas sur elle-même.
 */
function joursDActivite(debutActivite: DateISO, annee: number): number {
  const debut = Date.parse(`${debutActivite}T00:00:00Z`);
  const fin = Date.parse(`${annee}-12-31T00:00:00Z`);
  return Math.round((fin - debut) / 86_400_000) + 1;
}

/** Les deux seuils réduits au prorata des jours d'activité sur l'année. */
function proraterSeuils(base: SeuilsTva, jours: number): SeuilsTva {
  return {
    franchise: euros(Math.round((base.franchise * jours) / JOURS_PRORATA)),
    majore: euros(Math.round((base.majore * jours) / JOURS_PRORATA))
  };
}

/**
 * Les deux seuils applicables sur l'ANNÉE ENTIÈRE `annee`, prorata temporis
 * compris.
 *
 * `seuilsTva` répond pour un MOIS et ignore la date de création : c'est
 * suffisant pour le suivi mois par mois en cours d'année (les seuils ne
 * varient pas dans l'année pour la période actuelle), mais insuffisant pour
 * juger si une entreprise créée en cours d'année a dépassé SON seuil, réduit
 * au nombre de jours qu'elle a réellement exploités. Une entreprise créée le
 * 1er octobre n'a que trois mois pour atteindre un seuil pensé pour douze —
 * le comparer au seuil plein la pénaliserait de neuf mois qu'elle n'a jamais
 * eus.
 *
 * Prorata appliqué seulement si `debutActivite` tombe dans `annee` : les
 * années suivantes sont pleines, et une entreprise sans date de création
 * connue (`null`) reçoit le seuil plein — abstention plutôt qu'une
 * pénalisation inventée sur une date qu'on ne connaît pas.
 */
export function seuilsTvaPourAnnee(
  annee: number,
  type: TypeActivite,
  debutActivite: DateISO | null
): Resolution<SeuilsTva> {
  const base = seuilsTva(mois(`${annee}-01`), type);
  if (!estUtilisable(base)) return base;
  if (debutActivite === null || Number(debutActivite.slice(0, 4)) !== annee) return base;

  const jours = joursDActivite(debutActivite, annee);
  return porterResolution(base, proraterSeuils(base.valeur, jours));
}

/** Ce que dit l'état détaillé d'assujettissement, avec la date à partir de
 * laquelle collecter — la question à laquelle `EtatAssujettissementTva`
 * (ci-dessus) ne répond pas, faute de regarder N-1. */
export type StatutAssujettissementTva =
  | { readonly cas: 'sous_franchise' }
  /** Franchise dépassée cette année (zone tolérée) : perdue au 1er janvier
   * suivant, indiqué par `depuis`. */
  | { readonly cas: 'perte_franchise'; readonly depuis: Mois }
  /**
   * Redevable de la TVA à compter de `depuis` (premier jour de ce mois).
   *
   * `motif` distingue POURQUOI, ce qui change le message à l'écran :
   *  - `annee_precedente` : le CA de N-1 dépassait déjà la franchise de N-1 ;
   *    la franchise n'a jamais existé en N, redevable dès le 1er janvier —
   *    c'est le cas du bug remonté ;
   *  - `annee_en_cours` : le seuil majoré a été franchi pendant l'année en
   *    cours, redevable dès le mois du dépassement.
   */
  | {
      readonly cas: 'redevable';
      readonly depuis: Mois;
      readonly motif: 'annee_precedente' | 'annee_en_cours';
    };

/** Le premier mois où le cumulé dépasse `seuil`, ou `null` s'il ne le
 * dépasse jamais sur la série fournie. Les mois futurs (sans encaissement
 * encore) valent zéro et ne modifient pas le cumul : la fonction peut donc
 * recevoir les douze mois de l'année sans risque de conclure trop tôt. */
function moisDeDepassementCumule(
  parMois: readonly { readonly mois: Mois; readonly encaisse: Euros }[],
  seuil: Euros
): Mois | null {
  let cumule = 0;
  for (const m of parMois) {
    cumule += m.encaisse;
    if (cumule > seuil) return m.mois;
  }
  return null;
}

/** Ce qu'il faut pour établir, avec sa date, la redevabilité de TVA d'une
 * année — voir `assujettissementTva`. */
export interface DonneesAssujettissementTva {
  readonly annee: number;
  readonly type: TypeActivite;
  readonly debutActivite: DateISO | null;
  /**
   * CA encaissé de l'année N-1. Ignoré quand `annee` est l'année de début
   * d'activité (l'entreprise n'existait pas en N-1, ce chiffre ne peut être
   * qu'un encaissement d'une activité antérieure sans rapport, jamais un
   * signal de dépassement).
   */
  readonly caAnneePrecedente: Euros;
  /**
   * CA encaissé de l'année N, mois par mois, dans l'ordre janvier → décembre.
   * Sert à situer le mois exact de dépassement du seuil majoré — un total
   * annuel seul ne le permettrait pas.
   */
  readonly parMoisAnneeEnCours: readonly { readonly mois: Mois; readonly encaisse: Euros }[];
}

/**
 * L'état d'assujettissement d'une année, avec la date à partir de laquelle
 * collecter — en tenant compte du CA encaissé l'année PRÉCÉDENTE, ce que
 * `etatAssujettissement` ne fait pas.
 *
 * C'EST LA FONCTION QUI CORRIGE LE BUG : un CA encaissé en décembre N-1, avec
 * TVA collectée dessus, rendait l'application aveugle dès le 1er janvier —
 * elle ne regardait que N. Ici, si le CA de N-1 dépassait déjà la franchise
 * de N-1 (voir la simplification sur N-2 en tête de fichier), l'année N n'a
 * jamais eu de franchise : redevable dès le 1er janvier N, sans avoir besoin
 * de refranchir quoi que ce soit en cours d'année N.
 */
export function assujettissementTva(
  d: DonneesAssujettissementTva
): Resolution<StatutAssujettissementTva> {
  const anneeDebut = d.debutActivite === null ? null : Number(d.debutActivite.slice(0, 4));
  const premiereAnnee = anneeDebut === d.annee;

  if (!premiereAnnee) {
    const seuilsPrecedents = seuilsTvaPourAnnee(d.annee - 1, d.type, d.debutActivite);
    if (!estUtilisable(seuilsPrecedents)) return seuilsPrecedents;

    if (d.caAnneePrecedente > seuilsPrecedents.valeur.franchise) {
      return porterResolution(seuilsPrecedents, {
        cas: 'redevable', depuis: mois(`${d.annee}-01`), motif: 'annee_precedente'
      });
    }
  }

  const seuilsCourants = seuilsTvaPourAnnee(d.annee, d.type, d.debutActivite);
  if (!estUtilisable(seuilsCourants)) return seuilsCourants;

  const moisDepassement = moisDeDepassementCumule(
    d.parMoisAnneeEnCours, seuilsCourants.valeur.majore
  );
  if (moisDepassement !== null) {
    return porterResolution(seuilsCourants, {
      cas: 'redevable', depuis: moisDepassement, motif: 'annee_en_cours'
    });
  }

  const totalAnnee = euros(d.parMoisAnneeEnCours.reduce<number>((s, m) => s + m.encaisse, 0));
  if (totalAnnee > seuilsCourants.valeur.franchise) {
    return porterResolution(seuilsCourants, {
      cas: 'perte_franchise', depuis: mois(`${d.annee + 1}-01`)
    });
  }

  return porterResolution(seuilsCourants, { cas: 'sous_franchise' });
}

/**
 * Contrôle d'intégrité de la table, exécuté par les tests.
 * Renvoie la liste des anomalies ; vide si la table est saine.
 */
export function verifierIntegriteTva(): readonly string[] {
  const anomalies: string[] = [];

  PERIODES_TVA.forEach((per, i) => {
    if (!per.source) anomalies.push(`Période ${per.du} : source manquante.`);
    if (per.au !== null && per.au < per.du) {
      anomalies.push(`Période ${per.du} : fin (${per.au}) antérieure au début.`);
    }
    (Object.keys(per.seuils) as readonly TypeActivite[]).forEach((type) => {
      const s = per.seuils[type];
      if (s.majore < s.franchise) {
        anomalies.push(`Période ${per.du}, ${type} : seuil majoré (${s.majore}) sous la franchise (${s.franchise}).`);
      }
    });
    const estDerniere = i === PERIODES_TVA.length - 1;
    if (!estDerniere && per.au === null) {
      anomalies.push(`Période ${per.du} : seule la dernière période peut rester ouverte.`);
    }
    if (estDerniere && per.au !== null) {
      anomalies.push(`Période ${per.du} : la dernière période doit rester ouverte.`);
    }
    const suivante = PERIODES_TVA[i + 1];
    if (suivante !== undefined && per.au !== null && !(per.au < suivante.du)) {
      anomalies.push(`Périodes ${per.du} et ${suivante.du} : chevauchement ou désordre.`);
    }
  });

  return anomalies;
}
