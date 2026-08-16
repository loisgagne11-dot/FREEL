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
 * Ce n'est pas une lecture de texte faite au clavier : la fin d'exonération
 * a été CONSTATÉE sur un compte réel — début d'activité au 01/02/2025, ACRE
 * appliquée jusqu'à décembre 2025 incluse, taux plein depuis janvier 2026.
 * Le constat et la règle tombent d'accord.
 *
 * L'écart avec l'ancienne implémentation va dans le sens prudent : moins
 * d'exonération, donc plus de charges provisionnées. C'est le bon sens de
 * l'erreur résiduelle si la règle devait encore se raffiner (report en cas
 * de congé maternité, par exemple, que ce module ne connaît pas).
 */

import {
  type DateISO, type Mois, type Resolution,
  dateISO, mois
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
    source: 'Micro-social — exonération jusqu\'à la fin du 3ᵉ trimestre civil suivant celui '
      + 'de l\'affiliation ; confirmée par CONSTAT SUR UN COMPTE RÉEL (début d\'activité au '
      + '01/02/2025, exonération observée jusqu\'au 31/12/2025, taux plein depuis 01/2026). '
      + 'Constat plus faible qu\'un texte officiel, plus fort qu\'une supposition.',
    verifieLe: dateISO('2026-08-16')
  }
];

/** La règle applicable à un mois de début d'activité. */
export function periodeAcrePour(m: Mois): PeriodeAcre | undefined {
  return PERIODES_ACRE.find((per) => m >= per.du && (per.au === null || m <= per.au));
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
      motif: `Aucune règle d'ACRE connue pour un début d'activité en ${debut} : antérieur à la `
        + `plus ancienne règle saisie (${debutTable.du}). Une durée d'exonération passée est `
        + 'un fait, elle ne peut pas être extrapolée.'
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
