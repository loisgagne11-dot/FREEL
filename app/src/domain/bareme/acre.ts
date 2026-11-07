/**
 * Durée de l'exonération ACRE, par PÉRIODE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE RÈGLE REMONTE DANS LE BARÈME
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle vivait dans `sousAcreLe` sous la forme d'un `dureeTrimestres = 4`
 * appliqué à compter du MOIS de début d'activité : douze mois pleins, sans
 * source ni date de vérification. C'est ce que l'invariant n°3 du projet
 * interdit pour une donnée qui engage — et celle-ci engage doublement, car
 * un mois d'ACRE de trop divise par deux les cotisations provisionnées de ce
 * mois-là. L'erreur allait donc dans le sens dangereux : moins de charges,
 * plus de disponible, plus de versable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE EST TRIMESTRIELLE, PAS ANNUELLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'exonération court jusqu'à la fin du 3ᵉ TRIMESTRE CIVIL SUIVANT celui de
 * l'affiliation. Un début au 01/02/2025 relève du T1 2025 : l'exonération
 * s'arrête à la fin du T4 2025, soit le 31/12/2025 — onze mois, et non douze.
 * Un début en décembre n'en donne que dix.
 *
 * Source : fiche service-public F11677, vérifiée le 07/11/2026. Elle tombe
 * d'accord avec un constat fait sur un compte réel : début d'activité au
 * 01/02/2025, ACRE appliquée jusqu'à décembre 2025 incluse.
 *
 * L'écart avec l'ancienne implémentation va dans le sens prudent : moins
 * d'exonération, donc plus de charges provisionnées. C'est le bon sens de
 * l'erreur résiduelle si la règle devait encore se raffiner (report en cas
 * de congé maternité, par exemple, que ce module ne connaît pas).
 */

import {
  type DateISO, type Mois, type Ratio, type Resolution,
  dateISO, mois, ratio
} from '../types';

export interface PeriodeAcre {
  /** Premier mois de début d'activité auquel cette règle s'applique. */
  readonly du: Mois;
  /** `null` signifie « toujours en vigueur ». */
  readonly au: Mois | null;
  /**
   * Nombre de trimestres civils COMPLETS suivant celui de l'affiliation
   * pendant lesquels l'exonération continue de courir.
   *
   * Exprimé en trimestres et non en mois : c'est la forme de la règle, et
   * une durée en mois ne peut pas la représenter — elle vaut onze mois pour
   * un début en février, dix pour un début en décembre.
   */
  readonly trimestresApresAffiliation: number;
  readonly source: string;
  readonly verifieLe: DateISO;
}

export const PERIODES_ACRE: readonly PeriodeAcre[] = [
  {
    du: mois('2024-01'),
    au: null,
    trimestresApresAffiliation: 3,
    // La justification longue est dans l'en-tête : elle est gratuite en
    // commentaire, et coûterait au premier rendu dans cette chaîne-ci.
    source: 'https://entreprendre.service-public.gouv.fr/vosdroits/F11677',
    verifieLe: dateISO('2026-11-07')
  }
];

/** La règle applicable à un mois de début d'activité. */
export function periodeAcrePour(m: Mois): PeriodeAcre | undefined {
  return PERIODES_ACRE.find((per) => m >= per.du && (per.au === null || m <= per.au));
}

/**
 * Part des cotisations normales que l'ACRE EXONÈRE, selon la DATE DE DÉBUT
 * d'activité — pas selon le mois cotisé : un début au 15/06/2026 reste à 50 %
 * pendant toute sa durée, même pour des cotisations dues après le 1er juillet.
 * Appliquer le taux du mois cotisé ferait payer 75 % à quelqu'un dont
 * l'exonération est acquise à 50 %.
 */
export interface PeriodeAbattementAcre {
  /** Premier jour de début d'activité visé. */
  readonly du: DateISO;
  /** `null` : toujours en vigueur. */
  readonly au: DateISO | null;
  readonly exoneration: Ratio;
  readonly source: string;
  readonly verifieLe: DateISO;
}

export const PERIODES_ABATTEMENT_ACRE: readonly PeriodeAbattementAcre[] = [
  {
    du: dateISO('2024-01-01'), au: dateISO('2026-06-30'), exoneration: ratio(0.5),
    source: 'https://entreprendre.service-public.gouv.fr/vosdroits/F11677',
    verifieLe: dateISO('2026-11-07')
  },
  {
    du: dateISO('2026-07-01'), au: null, exoneration: ratio(0.25),
    source: 'décret n° 2026-69 du 06/02/2026, https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053449085 ; '
      + 'https://entreprendre.service-public.gouv.fr/vosdroits/F11677',
    verifieLe: dateISO('2026-11-07')
  }
];

/** Exonération ACRE pour un début d'activité ; refus si la date est inconnue ou trop ancienne. */
export function exonerationAcre(debut: DateISO | null): Resolution<Ratio> {
  if (debut === null) {
    return { statut: 'refuse', motif: 'Date de début d\'activité inconnue : l\'exonération ACRE en dépend.' };
  }
  const per = PERIODES_ABATTEMENT_ACRE.find((x) => debut >= x.du && (x.au === null || debut <= x.au));
  if (per === undefined) {
    return { statut: 'refuse', motif: `Aucune exonération ACRE connue pour un début d'activité au ${debut}.` };
  }
  return { statut: 'publie', valeur: per.exoneration, source: per.source, verifieLe: per.verifieLe };
}

const premiere = (): PeriodeAcre | undefined => PERIODES_ACRE[0];
const derniere = (): PeriodeAcre | undefined => PERIODES_ACRE[PERIODES_ACRE.length - 1];

/** Le trimestre civil d'un mois, de 1 à 4. */
const trimestreDe = (m: Mois): number => Math.ceil(Number(m.slice(5, 7)) / 3);

/**
 * Le DERNIER MOIS couvert par l'ACRE, pour un début d'activité donné.
 *
 * Rendue observable exprès : l'écran Config l'affiche — « ACRE active
 * jusqu'au 31/12/2025 » — pour que l'utilisateur la recoupe avec son
 * attestation URSSAF au lieu de faire confiance à un calcul invisible. Une
 * date fausse d'un trimestre se voit ; un booléen faux ne se voit pas.
 *
 * Même asymétrie du temps que les autres tables du barème : un début
 * d'activité antérieur à la plus ancienne règle connue est refusé plutôt
 * qu'extrapolé.
 */
export function dernierMoisAcre(debut: Mois): Resolution<Mois> {
  // Fin du trimestre d'affiliation, plus les trimestres complets qui suivent.
  const finSelon = (regle: PeriodeAcre): Mois => {
    const trimestreFin = trimestreDe(debut) + regle.trimestresApresAffiliation;
    const annee = Number(debut.slice(0, 4)) + Math.floor((trimestreFin - 1) / 4);
    const moisFin = (((trimestreFin - 1) % 4) + 1) * 3;
    return `${annee}-${String(moisFin).padStart(2, '0')}` as Mois;
  };

  const couvrante = periodeAcrePour(debut);
  if (couvrante) {
    return {
      statut: 'publie', valeur: finSelon(couvrante),
      source: couvrante.source, verifieLe: couvrante.verifieLe
    };
  }

  const debutTable = premiere();
  if (debutTable !== undefined && debut < debutTable.du) {
    return {
      statut: 'refuse',
      motif: `Aucune règle d'ACRE connue pour un début d'activité en ${debut} : antérieur `
        + `à la plus ancienne règle saisie (${debutTable.du}).`
    };
  }

  const fin = derniere();
  if (fin === undefined) return { statut: 'refuse', motif: 'Aucune règle d\'ACRE saisie.' };

  return {
    statut: 'hypothese', valeur: finSelon(fin),
    source: fin.source, verifieLe: fin.verifieLe, depuis: fin.du
  };
}

/**
 * Ce mois est-il couvert par l'ACRE, pour un début d'activité donné ?
 *
 * Rend `false` — et non un refus — quand la règle se dérobe : l'appelant
 * provisionne alors au TAUX PLEIN, ce qui est le sens prudent. Rendre une
 * `Resolution` ici obligerait chaque calcul de cotisations à choisir un
 * repli, et l'un d'eux finirait par choisir « exonéré ».
 */
export function moisSousAcre(debut: Mois, m: Mois): boolean {
  if (m < debut) return false;
  const fin = dernierMoisAcre(debut);
  if (fin.statut === 'refuse') return false;
  return m <= fin.valeur;
}

/**
 * Contrôle d'intégrité de la table, exécuté par les tests.
 * Renvoie la liste des anomalies ; vide si la table est saine.
 */
export function verifierIntegriteAcre(): readonly string[] {
  const anomalies: string[] = [];

  PERIODES_ACRE.forEach((per, i) => {
    if (!per.source) anomalies.push(`Règle ACRE ${per.du} : source manquante.`);
    if (per.trimestresApresAffiliation < 0) {
      anomalies.push(`Règle ACRE ${per.du} : durée négative.`);
    }
    if (per.au !== null && per.au < per.du) {
      anomalies.push(`Règle ACRE ${per.du} : fin (${per.au}) antérieure au début.`);
    }
    const estDerniere = i === PERIODES_ACRE.length - 1;
    if (!estDerniere && per.au === null) {
      anomalies.push(`Règle ACRE ${per.du} : seule la dernière période peut rester ouverte.`);
    }
    if (estDerniere && per.au !== null) {
      anomalies.push(`Règle ACRE ${per.du} : la dernière période doit rester ouverte.`);
    }
    const suivante = PERIODES_ACRE[i + 1];
    if (suivante !== undefined && per.au !== null && !(per.au < suivante.du)) {
      anomalies.push(`Règles ACRE ${per.du} et ${suivante.du} : chevauchement ou désordre.`);
    }
  });

  return anomalies;
}
