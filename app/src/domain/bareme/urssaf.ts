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
 * déploiement. Toute autre superposition est refusée par `validerAjout`.
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

/** Refus motivé d'un ajout, ou `null` quand l'ajout est recevable. */
export function validerAjout(
  existantes: readonly PeriodeBareme[],
  nouvelle: { readonly du: Mois; readonly source: string }
): string | null {
  if (nouvelle.source.trim() === '') {
    return 'Une source est obligatoire : d\'où vient ce taux ? '
      + 'Un taux sans provenance ne peut pas être vérifié plus tard.';
  }

  const derniereConnue = existantes[existantes.length - 1];
  if (derniereConnue === undefined) return null;

  // Le point dur : recalculer un trimestre passé doit redonner le montant
  // réellement déclaré à l'époque. Réécrire une période close le rendrait
  // impossible, et ferait diverger l'application des déclarations envoyées.
  const couvre = existantes.find((per) => nouvelle.du > per.du && (per.au === null || nouvelle.du <= per.au));
  if (couvre !== undefined && couvre.au !== null) {
    return `La période ${nouvelle.du} tombe à l'intérieur d'une période close `
      + `(${couvre.du} à ${couvre.au}). Modifier un barème passé ferait diverger `
      + 'les recalculs des déclarations déjà envoyées. Seul un début de période '
      + 'existant peut être corrigé, à l\'identique.';
  }

  return null;
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
  periodes: readonly PeriodeBareme[] = PERIODES_URSSAF
): Resolution<Ratio> {
  const appliquer = (brut: Ratio): Ratio =>
    (sousAcre ? brut * ABATTEMENT_ACRE : brut) as Ratio;

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
