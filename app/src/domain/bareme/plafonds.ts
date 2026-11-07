/**
 * Plafonds de chiffre d'affaires du régime micro, par PÉRIODE et par type
 * d'activité.
 *
 * Mécanique du plafond, à ne jamais trahir dans une jauge : le régime micro
 * reste applicable en N si les recettes de N-1 OU de N-2 ne dépassent pas le
 * plafond. Un dépassement en cours d'année N ne fait donc PAS sortir du
 * régime en N — la sortie n'intervient qu'au 1er janvier N+1, et seulement
 * après DEUX années consécutives de dépassement. Une jauge « X % du plafond »
 * ne doit jamais être présentée comme un couperet immédiat (audit comptable
 * `docs/audit/06-critique-comptable.md` §3).
 *
 * Les plafonds sont revalorisés par période TRIENNALE (dernière période
 * connue avec confiance haute : 2023-2025), pas annuellement — d'où une
 * table à deux lignes plutôt qu'une par an.
 *
 * Les plafonds 2026 (83 600 € / 203 100 €, arrêté du 27/01/2026) sont
 * confirmés pour 2026-2028 (vérifié le 07/11/2026).
 *
 * L'année de création, le plafond est proratisé : plafond × jours d'existence
 * dans l'année / 365 (exemple officiel : 203 100 × 335 / 365 = 186 407 €,
 * fiche F23267 vérifiée le 13/05/2026). Le plein plafond à une entreprise
 * créée en octobre lui laisserait trois mois pour un seuil pensé pour douze.
 */

import {
  type DateISO, type Euros, type Mois, type Resolution, type TypeActivite,
  dateISO, estUtilisable, euros, mois
} from '../types';
import { JOURS_PRORATA, joursDActivite } from './tva';

export interface PeriodePlafond {
  readonly du: Mois;
  readonly au: Mois | null;
  readonly plafond: Readonly<Record<TypeActivite, Euros>>;
  readonly source: string;
  readonly verifieLe: DateISO;
}

const p = (
  du: string, au: string | null,
  bnc: number, bicVente: number, bicService: number,
  source: string, verifieLe: string
): PeriodePlafond => ({
  du: mois(du),
  au: au === null ? null : mois(au),
  plafond: { BNC: euros(bnc), BIC_vente: euros(bicVente), BIC_service: euros(bicService) },
  source,
  verifieLe: dateISO(verifieLe)
});

export const PERIODES_PLAFONDS: readonly PeriodePlafond[] = [
  // BIC_service partage le plafond du BNC : c'est la convention usuelle du
  // régime micro (le couple de plafonds oppose « vente de marchandises » à
  // « prestations de services et professions libérales »), mais cette
  // équivalence n'a pas été spécifiquement vérifiée pour ce projet —
  // confiance moyenne sur ce point précis, indépendamment du millésime.
  p(
    '2023-01', '2025-12',
    77700, 188700, 77700,
    'https://entreprendre.service-public.gouv.fr/vosdroits/F23267',
    '2026-11-07'
  ),
  p(
    '2026-01', null,
    83600, 203100, 83600,
    'arrêté du 27/01/2026, https://entreprendre.service-public.gouv.fr/actualites/A18813',
    '2026-11-07'
  )
];

/** La période couvrant ce mois, ou `undefined` si aucune ne le couvre. */
export function periodePlafondPour(m: Mois): PeriodePlafond | undefined {
  return PERIODES_PLAFONDS.find((per) => m >= per.du && (per.au === null || m <= per.au));
}

const premiere = (): PeriodePlafond | undefined => PERIODES_PLAFONDS[0];
const derniere = (): PeriodePlafond | undefined => PERIODES_PLAFONDS[PERIODES_PLAFONDS.length - 1];

/**
 * Plafond applicable à un mois. Même asymétrie du temps que `urssaf.ts` :
 * on extrapole vers le futur (le plafond en vigueur le reste jusqu'à
 * publication du suivant), jamais vers le passé.
 */
export function plafondMicro(
  m: Mois,
  type: TypeActivite,
  debutActivite: DateISO | null = null
): Resolution<Euros> {
  const r = plafondDuMois(m, type);
  // Date inconnue : plafond plein, comme `seuilsTvaPourAnnee` — pas de
  // pénalisation inventée sur une date qu'on ne connaît pas.
  if (r.statut === 'refuse' || debutActivite === null
      || Number(debutActivite.slice(0, 4)) !== Number(m.slice(0, 4))) return r;
  const prorate = euros(Math.round((r.valeur * joursDActivite(debutActivite, Number(m.slice(0, 4)))) / JOURS_PRORATA));
  return { ...r, valeur: prorate };
}

function plafondDuMois(m: Mois, type: TypeActivite): Resolution<Euros> {
  const couvrante = periodePlafondPour(m);
  if (couvrante) {
    return {
      statut: 'publie',
      valeur: couvrante.plafond[type],
      source: couvrante.source,
      verifieLe: couvrante.verifieLe
    };
  }

  const debut = premiere();
  if (debut !== undefined && m < debut.du) {
    return {
      statut: 'refuse',
      motif: `Aucun plafond connu pour ${m} : période antérieure au plus ancien barème saisi `
        + `(${debut.du}). Un plafond passé est un fait publié, il ne peut pas être extrapolé.`
    };
  }

  const fin = derniere();
  if (fin === undefined) {
    return { statut: 'refuse', motif: 'Aucun plafond saisi.' };
  }

  return {
    statut: 'hypothese',
    valeur: fin.plafond[type],
    source: fin.source,
    verifieLe: fin.verifieLe,
    depuis: fin.du
  };
}

/**
 * Le chiffre d'affaires encaissé d'une année dépasse-t-il le plafond de
 * cette même année ?
 *
 * ⚠️ Ce dépassement seul ne dit RIEN sur le maintien au régime micro : voir
 * la mécanique N-1/N-2 en tête de fichier. C'est une brique de calcul, pas
 * un verdict de sortie de régime — ne jamais l'afficher comme tel.
 */
export function depasseLePlafond(
  caEncaisseAnnee: Euros,
  m: Mois,
  type: TypeActivite,
  debutActivite: DateISO | null = null
): Resolution<boolean> {
  const plafondR = plafondMicro(m, type, debutActivite);
  if (!estUtilisable(plafondR)) return plafondR;

  const depasse = caEncaisseAnnee > plafondR.valeur;
  return plafondR.statut === 'publie'
    ? { statut: 'publie', valeur: depasse, source: plafondR.source, verifieLe: plafondR.verifieLe }
    : { statut: 'hypothese', valeur: depasse, source: plafondR.source, verifieLe: plafondR.verifieLe, depuis: plafondR.depuis };
}

/**
 * Contrôle d'intégrité de la table, exécuté par les tests.
 * Renvoie la liste des anomalies ; vide si la table est saine.
 */
export function verifierIntegritePlafonds(): readonly string[] {
  const anomalies: string[] = [];

  PERIODES_PLAFONDS.forEach((per, i) => {
    if (!per.source) anomalies.push(`Période ${per.du} : source manquante.`);
    if (per.au !== null && per.au < per.du) {
      anomalies.push(`Période ${per.du} : fin (${per.au}) antérieure au début.`);
    }
    const estDerniere = i === PERIODES_PLAFONDS.length - 1;
    if (!estDerniere && per.au === null) {
      anomalies.push(`Période ${per.du} : seule la dernière période peut rester ouverte.`);
    }
    if (estDerniere && per.au !== null) {
      anomalies.push(`Période ${per.du} : la dernière période doit rester ouverte.`);
    }
    const suivante = PERIODES_PLAFONDS[i + 1];
    if (suivante !== undefined && per.au !== null && !(per.au < suivante.du)) {
      anomalies.push(`Périodes ${per.du} et ${suivante.du} : chevauchement ou désordre.`);
    }
  });

  return anomalies;
}
