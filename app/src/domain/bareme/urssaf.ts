/**
 * Barème des cotisations sociales du régime micro-social, par PÉRIODE.
 *
 * Pourquoi par période et non par année : le taux applicable aux BNC a
 * augmenté au 1er juillet 2024, puis de nouveau au 1er juillet 2026. Une
 * table indexée par année civile ne peut pas exprimer cela — elle
 * appliquerait un taux unique à des mois qui relèvent de deux barèmes
 * différents. C'est exactement le bug de la version précédente, qui
 * calculait juillet 2026 à 25,6 % au lieu de 26,1 %.
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
 * ⚠️ Les valeurs ci-dessous restent à recouper une fois avec un avis
 * d'appel de cotisations réel. urssaf.fr renvoie 503 sur ses pages de
 * barème, elles proviennent donc d'une source secondaire.
 */

import {
  type DateISO, type Mois, type Ratio, type Resolution, type TypeActivite,
  dateISO, mois, ratio
} from '../types';

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
  p('2024-01', '2024-06', 0.211, 0.123, 0.212, 'urssaf.fr', '2026-07-27'),
  p('2024-07', '2024-12', 0.231, 0.123, 0.212, 'urssaf.fr', '2026-07-27'),
  p('2025-01', '2025-12', 0.246, 0.123, 0.212, 'urssaf.fr', '2026-07-27'),
  p('2026-01', '2026-06', 0.256, 0.123, 0.212, 'urssaf.fr', '2026-07-27'),
  p('2026-07', null, 0.261, 0.123, 0.212, 'urssaf.fr', '2026-07-27')
];

/**
 * Abattement ACRE : la moitié des cotisations normales.
 *
 * ⚠️ Un passage à 25 % au 1er juillet 2026 est possible mais NON confirmé.
 * À vérifier avant de recalculer un trimestre sous ACRE. Si le changement
 * est confirmé, il devra devenir lui aussi une donnée par période, et non
 * une constante.
 */
export const ABATTEMENT_ACRE = ratio(0.5);

/** La période couvrant ce mois, ou `undefined` si aucune ne le couvre. */
export function periodePour(m: Mois): PeriodeBareme | undefined {
  return PERIODES_URSSAF.find((per) => m >= per.du && (per.au === null || m <= per.au));
}

const premiere = (): PeriodeBareme | undefined => PERIODES_URSSAF[0];
const derniere = (): PeriodeBareme | undefined => PERIODES_URSSAF[PERIODES_URSSAF.length - 1];

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
  sousAcre: boolean
): Resolution<Ratio> {
  const appliquer = (brut: Ratio): Ratio =>
    (sousAcre ? brut * ABATTEMENT_ACRE : brut) as Ratio;

  const couvrante = periodePour(m);
  if (couvrante) {
    return {
      statut: 'publie',
      valeur: appliquer(couvrante.taux[type]),
      source: couvrante.source,
      verifieLe: couvrante.verifieLe
    };
  }

  const debut = premiere();
  if (debut !== undefined && m < debut.du) {
    return {
      statut: 'refuse',
      motif: `Aucun barème connu pour ${m} : période antérieure au plus ancien `
        + `barème saisi (${debut.du}). Un taux passé est un fait publié, il ne `
        + `peut pas être extrapolé.`
    };
  }

  const fin = derniere();
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
 * Contrôle d'intégrité de la table, exécuté par les tests.
 * Renvoie la liste des anomalies ; vide si la table est saine.
 */
export function verifierIntegrite(): readonly string[] {
  const anomalies: string[] = [];

  PERIODES_URSSAF.forEach((per, i) => {
    if (!per.source) anomalies.push(`Période ${per.du} : source manquante.`);
    if (per.au !== null && per.au < per.du) {
      anomalies.push(`Période ${per.du} : fin (${per.au}) antérieure au début.`);
    }
    const estDerniere = i === PERIODES_URSSAF.length - 1;
    if (!estDerniere && per.au === null) {
      anomalies.push(`Période ${per.du} : seule la dernière période peut rester ouverte.`);
    }
    if (estDerniere && per.au !== null) {
      anomalies.push(`Période ${per.du} : la dernière période doit rester ouverte.`);
    }
    const suivante = PERIODES_URSSAF[i + 1];
    if (suivante !== undefined && per.au !== null && !(per.au < suivante.du)) {
      anomalies.push(`Périodes ${per.du} et ${suivante.du} : chevauchement ou désordre.`);
    }
  });

  return anomalies;
}
