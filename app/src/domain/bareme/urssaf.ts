/**
 * Barème des cotisations sociales du régime micro-social, par PÉRIODE.
 *
 * Pourquoi par période et non par année : le taux applicable aux BNC a
 * augmenté au 1er juillet 2024. Une table indexée par année civile ne peut
 * pas exprimer cela — elle appliquerait un taux unique à des mois qui
 * relèvent de deux barèmes différents.
 *
 * RÈGLES D'ÉDITION — à respecter sous peine de fausser un historique :
 *
 *  1. Pour un nouveau taux, AJOUTER une période. Ne jamais modifier une
 *     période passée : recalculer un trimestre antérieur doit redonner le
 *     montant réellement déclaré à l'époque.
 *  2. Chaque période porte sa source et la date à laquelle un humain l'a
 *     vérifiée. Une valeur sans provenance n'a rien à faire ici.
 *  3. Les périodes sont contiguës, sans trou ni chevauchement. Seule la
 *     dernière reste ouverte (`au: null` = toujours en vigueur).
 *
 * Le 26,1 % programmé au 01/01/2026 par la réforme de 2024 a été plafonné à
 * 25,6 % par le décret n° 2025-943 du 08/09/2025 : 25,6 % s'applique dès le
 * 01/01/2026 en BNC, et il n'y a AUCUNE hausse au 1er juillet 2026.
 */

import {
  type DateISO, type Mois, type Ratio, type Resolution, type TypeActivite,
  dateISO, estUtilisable, mois, ratio
} from '../types';
import { exonerationAcre } from './acre';

export interface PeriodeBareme {
  readonly du: Mois;
  /** `null` signifie « toujours en vigueur ». */
  readonly au: Mois | null;
  readonly taux: Readonly<Record<TypeActivite, Ratio>>;
  readonly source: string;
  readonly verifieLe: DateISO;
}

const p = (
  du: string, au: string | null,
  bnc: number, bicVente: number, bicService: number,
  source: string, verifieLe: string
): PeriodeBareme => ({
  du: mois(du),
  au: au === null ? null : mois(au),
  taux: { BNC: ratio(bnc), BIC_vente: ratio(bicVente), BIC_service: ratio(bicService) },
  source,
  verifieLe: dateISO(verifieLe)
});

export const PERIODES_URSSAF: readonly PeriodeBareme[] = [
  p('2024-01', '2024-06', 0.211, 0.123, 0.212, 'urssaf.fr', '2026-08-12'),
  p('2024-07', '2024-12', 0.231, 0.123, 0.212, 'urssaf.fr', '2026-08-12'),
  p('2025-01', '2025-12', 0.246, 0.123, 0.212, 'urssaf.fr', '2026-08-12'),
  // 26,1 % était programmé au 01/01/2026 ; le décret a plafonné à 25,6 %,
  // applicable dès cette date. Pas de marche au 1er juillet 2026.
  p('2026-01', null, 0.256, 0.123, 0.212,
    'décret n° 2025-943 du 08/09/2025, https://www.legifrance.gouv.fr/loda/id/JORFTEXT000052211971 ; art. D613-4 CSS',
    '2026-11-07')
];

/**
 * La caisse de retraite d'un libéral : la Sécurité sociale des indépendants
 * (`ssi`), ou la Cipav pour certaines professions réglementées. Un FAIT, lu
 * sur l'attestation d'affiliation : rien ne la déduit de l'activité, et aucune
 * liste de professions n'est codée ici — elle change, et une liste périmée
 * affilierait d'office à la mauvaise caisse.
 */
export type CaisseRetraite = 'ssi' | 'cipav';

/**
 * Le barème de la Cipav : seule sa colonne BNC diffère. Les colonnes BIC
 * reprennent celles de la SSI au même mois — la Cipav n'affilie que des
 * libéraux, `baremeDeLaCaisse` ne la sert donc jamais à une activité BIC, et
 * ces colonnes ne servent qu'à garder la table du même type que l'autre.
 * Elles ne sont pas réécrites : une seconde copie des taux BIC finirait par
 * diverger de la première.
 *
 * Mêmes règles d'édition que `PERIODES_URSSAF`. La marche du 1er juillet 2024
 * est la même que celle de la SSI, d'un point plus haut : 21,2 % puis 23,2 %
 * (décret n° 2024-484), toujours 23,2 % en 2026 (25,4 % avec le versement
 * libératoire, d'après la même fiche).
 */
const cipav = (du: string, au: string | null, bnc: number, source: string): PeriodeBareme => {
  const ssi = p(du, au, bnc, 0, 0, source, '2026-11-20');
  return { ...ssi, taux: { ...(periodePour(ssi.du)?.taux ?? ssi.taux), BNC: ratio(bnc) } };
};

export const PERIODES_CIPAV: readonly PeriodeBareme[] = [
  cipav('2024-01', '2024-06', 0.212,
    'décret n° 2024-484 du 30/05/2024 ; service-public.fr A17464 du 27/06/2024'),
  cipav('2024-07', null, 0.232,
    'décret n° 2024-484 du 30/05/2024 ; service-public.fr A17464 et F36232 (vérifiée le 01/01/2026)')
];

/**
 * Le barème livré pour une caisse et une activité. La caisse n'a de sens qu'en
 * BNC : un affilié Cipav qui passe en BIC relève de la SSI, et lui servir le
 * taux libéral ferait cotiser une vente de marchandises à 23,2 % au lieu de
 * 12,3 %.
 */
export function baremeDeLaCaisse(caisse: CaisseRetraite, type: TypeActivite): readonly PeriodeBareme[] {
  return caisse === 'cipav' && type === 'BNC' ? PERIODES_CIPAV : PERIODES_URSSAF;
}

/**
 * Fusionne le barème livré avec le code et les périodes saisies par
 * l'utilisateur.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI L'UTILISATEUR PEUT AJOUTER UNE PÉRIODE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les taux officiels changent, et l'application ne peut pas être redéployée à
 * chaque publication. Sans porte d'entrée, un taux périmé resterait appliqué
 * indéfiniment — ou, avec le garde-fou de fraîcheur, l'application se
 * bloquerait sans que personne puisse la débloquer.
 *
 * L'ajout ne remplace pas la vérification : la période saisie porte la source
 * indiquée par l'utilisateur — « avis d'appel du 12/01/2027 », par exemple —
 * et la date à laquelle il l'a saisie. C'est la même exigence que pour les
 * périodes livrées avec le code, appliquée à la même table.
 *
 * Une période saisie qui recouvre exactement une période livrée l'emporte :
 * c'est le seul moyen de corriger une valeur livrée fausse sans attendre un
 * déploiement. Toute autre superposition est refusée par `validerAjout`
 * (`urssaf.ajout.ts`).
 */
export function fusionnerPeriodes(
  base: readonly PeriodeBareme[],
  ajouts: readonly PeriodeBareme[]
): readonly PeriodeBareme[] {
  const parDebut = new Map(base.map((per) => [per.du, per]));
  for (const ajout of ajouts) parDebut.set(ajout.du, ajout);

  const triees = [...parDebut.values()].sort((a, b) => a.du.localeCompare(b.du));

  // Une période nouvellement ajoutée ferme celle qui restait ouverte : deux
  // périodes ouvertes en même temps rendraient la résolution ambiguë, et la
  // plus ancienne l'emporterait par simple ordre de parcours.
  return triees.map((per, i) => {
    const suivante = triees[i + 1];
    if (suivante === undefined) return per;
    if (per.au !== null && per.au < suivante.du) return per;
    return { ...per, au: moisPrecedent(suivante.du) };
  });
}

function moisPrecedent(m: Mois): Mois {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) - 1;
  const annee = Math.floor(total / 12);
  const mm = String((total % 12) + 1).padStart(2, '0');
  return `${annee}-${mm}` as Mois;
}

/** La période couvrant ce mois, ou `undefined` si aucune ne le couvre. */
export function periodePour(
  m: Mois,
  periodes: readonly PeriodeBareme[] = PERIODES_URSSAF
): PeriodeBareme | undefined {
  return periodes.find((per) => m >= per.du && (per.au === null || m <= per.au));
}

const premiere = (t: readonly PeriodeBareme[]): PeriodeBareme | undefined => t[0];
const derniere = (t: readonly PeriodeBareme[]): PeriodeBareme | undefined => t[t.length - 1];

/**
 * Taux de cotisations applicable à un mois.
 *
 * L'asymétrie du temps est délibérée, et c'est le cœur de cette fonction :
 *
 *  - vers le FUTUR, reprendre le dernier taux connu est une prévision
 *    légitime : un taux reste en vigueur jusqu'à publication du suivant ;
 *  - vers le PASSÉ, il n'y a rien à prévoir. Le taux d'un mois écoulé est
 *    un fait publié. Appliquer le taux d'aujourd'hui à 2019 ne serait pas
 *    une approximation mais un chiffre faux, susceptible d'être repris
 *    dans un recalcul de déclaration. On refuse.
 */
export function tauxCotisations(
  m: Mois,
  type: TypeActivite,
  sousAcre: boolean,
  periodes: readonly PeriodeBareme[] = PERIODES_URSSAF,
  debutActivite: DateISO | null = null
): Resolution<Ratio> {
  // L'exonération dépend de la date de début d'activité : sans elle on
  // s'abstient plutôt que de supposer 50 % ou 25 %.
  const exo = sousAcre ? exonerationAcre(debutActivite) : null;
  if (exo !== null && exo.statut === 'refuse') return exo;
  const appliquer = (brut: Ratio): Ratio =>
    (exo !== null && estUtilisable(exo) ? brut * (1 - exo.valeur) : brut) as Ratio;

  const couvrante = periodePour(m, periodes);
  if (couvrante) {
    return {
      statut: 'publie',
      valeur: appliquer(couvrante.taux[type]),
      source: couvrante.source,
      verifieLe: couvrante.verifieLe
    };
  }

  const debut = premiere(periodes);
  if (debut !== undefined && m < debut.du) {
    return {
      statut: 'refuse',
      motif: `Aucun barème connu pour ${m} : période antérieure au plus ancien `
        + `barème saisi (${debut.du}). Un taux passé est un fait publié, il ne `
        + `peut pas être extrapolé.`
    };
  }

  const fin = derniere(periodes);
  if (fin === undefined) {
    return { statut: 'refuse', motif: 'Aucun barème saisi.' };
  }

  return {
    statut: 'hypothese',
    valeur: appliquer(fin.taux[type]),
    source: fin.source,
    verifieLe: fin.verifieLe,
    depuis: fin.du
  };
}

/** Libellé d'une hypothèse, à afficher pour qu'elle ne soit jamais tacite. */
export function libelleHypothese(r: Resolution<Ratio>): string | null {
  if (r.statut !== 'hypothese') return null;
  const pct = (r.valeur * 100).toFixed(1).replace('.', ',');
  return `Projection au taux de ${pct} % en vigueur depuis ${r.depuis} — `
    + `barème non publié pour cette période`;
}

/**
 * Contrôle d'intégrité d'une table — celle de la SSI par défaut, celle de la
 * Cipav aussi : une table trouée rend un refus pour des mois qui ont un taux.
 * Exécuté par les tests. Renvoie la liste des anomalies ; vide si la table est
 * saine.
 */
export function verifierIntegrite(table: readonly PeriodeBareme[] = PERIODES_URSSAF): readonly string[] {
  const anomalies: string[] = [];

  table.forEach((per, i) => {
    if (!per.source) anomalies.push(`Période ${per.du} : source manquante.`);
    if (per.au !== null && per.au < per.du) {
      anomalies.push(`Période ${per.du} : fin (${per.au}) antérieure au début.`);
    }
    const estDerniere = i === table.length - 1;
    if (!estDerniere && per.au === null) {
      anomalies.push(`Période ${per.du} : seule la dernière période peut rester ouverte.`);
    }
    if (estDerniere && per.au !== null) {
      anomalies.push(`Période ${per.du} : la dernière période doit rester ouverte.`);
    }
    const suivante = table[i + 1];
    if (suivante !== undefined && per.au !== null && !(per.au < suivante.du)) {
      anomalies.push(`Périodes ${per.du} et ${suivante.du} : chevauchement ou désordre.`);
    }
  });

  return anomalies;
}
