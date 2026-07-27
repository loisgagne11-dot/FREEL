/**
 * Abattement forfaitaire du régime micro, par PÉRIODE et par type d'activité.
 *
 * Le taux forfaitaire (34 % BNC, 71 % BIC vente, 50 % BIC service) est réputé
 * couvrir TOUTES les charges professionnelles réelles : en micro, aucune
 * dépense n'est déductible en plus de cet abattement. C'est le principe même
 * du régime, pas un détail — un utilisateur qui cherche à faire valoir une
 * charge réelle en micro se trompe de régime, pas de calcul.
 *
 * Pourquoi une table par période malgré une seule ligne aujourd'hui : ces
 * taux sont stables depuis longtemps (dernière refonte structurelle : loi de
 * finances 2017) et n'ont pas de changement identifié à la date de
 * vérification ci-dessous — contrairement au taux URSSAF, qui bouge en cours
 * d'année. Mais rien ne garantit qu'ils ne bougeront jamais : le jour où un
 * changement survient, la règle est la même que pour `urssaf.ts` — AJOUTER
 * une période, ne jamais modifier celle-ci après coup.
 *
 * Confiance : haute pour BNC (34 %), corroborée par l'audit comptable
 * (`docs/audit/06-critique-comptable.md` §3). Moyenne-haute pour BIC_vente
 * (71 %) et BIC_service (50 %) : ce sont les valeurs de connaissance
 * générale du régime micro, mais l'audit ne les a pas spécifiquement
 * recoupées à la source — à vérifier sur impots.gouv.fr avant un usage qui
 * engage l'utilisateur.
 */

import {
  type DateISO, type Euros, type Mois, type Ratio, type Resolution, type TypeActivite,
  dateISO, estUtilisable, euros, mois, ratio
} from '../types';

export interface PeriodeAbattement {
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
): PeriodeAbattement => ({
  du: mois(du),
  au: au === null ? null : mois(au),
  taux: { BNC: ratio(bnc), BIC_vente: ratio(bicVente), BIC_service: ratio(bicService) },
  source,
  verifieLe: dateISO(verifieLe)
});

export const PERIODES_ABATTEMENT: readonly PeriodeAbattement[] = [
  p(
    '2024-01', null,
    0.34, 0.71, 0.50,
    'Connaissance générale du régime micro (BNC recoupé par l\'audit comptable §3 ; '
      + 'BIC_vente et BIC_service non recoupés spécifiquement — à vérifier impots.gouv.fr)',
    '2026-07-27'
  )
];

/**
 * Minimum d'abattement : 305 €, quel que soit le type d'activité. Quand
 * 34/50/71 % des recettes de la période sont inférieurs à ce montant,
 * l'abattement retenu est 305 € et non le pourcentage calculé.
 *
 * Confiance haute (corroborée par l'audit §3). Traité hors de la table par
 * période — et non comme une donnée par activité — car c'est une règle
 * simple et indépendante du type d'activité ; si elle venait à changer, elle
 * devrait migrer vers une table par période comme les taux ci-dessus.
 */
export const MINIMUM_ABATTEMENT: Euros = euros(305);

/** La période couvrant ce mois, ou `undefined` si aucune ne le couvre. */
export function periodeAbattementPour(m: Mois): PeriodeAbattement | undefined {
  return PERIODES_ABATTEMENT.find((per) => m >= per.du && (per.au === null || m <= per.au));
}

const premiere = (): PeriodeAbattement | undefined => PERIODES_ABATTEMENT[0];
const derniere = (): PeriodeAbattement | undefined => PERIODES_ABATTEMENT[PERIODES_ABATTEMENT.length - 1];

/**
 * Taux d'abattement applicable à un mois. Même asymétrie du temps que
 * `urssaf.ts` : un taux futur non publié est une hypothèse légitime
 * (reprendre le dernier connu), un taux passé antérieur à la table est un
 * fait qu'on ne peut pas reconstituer par extrapolation — on refuse.
 */
export function tauxAbattement(m: Mois, type: TypeActivite): Resolution<Ratio> {
  const couvrante = periodeAbattementPour(m);
  if (couvrante) {
    return {
      statut: 'publie',
      valeur: couvrante.taux[type],
      source: couvrante.source,
      verifieLe: couvrante.verifieLe
    };
  }

  const debut = premiere();
  if (debut !== undefined && m < debut.du) {
    return {
      statut: 'refuse',
      motif: `Aucun barème d'abattement connu pour ${m} : période antérieure au plus ancien `
        + `barème saisi (${debut.du}). Un taux passé est un fait publié, il ne peut pas être `
        + `extrapolé.`
    };
  }

  const fin = derniere();
  if (fin === undefined) {
    return { statut: 'refuse', motif: 'Aucun barème d\'abattement saisi.' };
  }

  return {
    statut: 'hypothese',
    valeur: fin.taux[type],
    source: fin.source,
    verifieLe: fin.verifieLe,
    depuis: fin.du
  };
}

/**
 * Revenu imposable après abattement forfaitaire, plancher au minimum de
 * 305 € sans jamais excéder les recettes elles-mêmes (recettes très
 * faibles : l'abattement ne peut pas produire un revenu négatif).
 */
export function revenuApresAbattement(
  recettesHT: Euros,
  m: Mois,
  type: TypeActivite
): Resolution<Euros> {
  const tauxR = tauxAbattement(m, type);
  if (!estUtilisable(tauxR)) return tauxR;

  const abattementCalcule = recettesHT * tauxR.valeur;
  const abattementRetenu = Math.min(recettesHT, Math.max(abattementCalcule, MINIMUM_ABATTEMENT));
  const revenu = euros(recettesHT - abattementRetenu);

  return tauxR.statut === 'publie'
    ? { statut: 'publie', valeur: revenu, source: tauxR.source, verifieLe: tauxR.verifieLe }
    : { statut: 'hypothese', valeur: revenu, source: tauxR.source, verifieLe: tauxR.verifieLe, depuis: tauxR.depuis };
}

/**
 * Contrôle d'intégrité de la table, exécuté par les tests.
 * Renvoie la liste des anomalies ; vide si la table est saine.
 */
export function verifierIntegriteAbattement(): readonly string[] {
  const anomalies: string[] = [];

  PERIODES_ABATTEMENT.forEach((per, i) => {
    if (!per.source) anomalies.push(`Période ${per.du} : source manquante.`);
    if (per.au !== null && per.au < per.du) {
      anomalies.push(`Période ${per.du} : fin (${per.au}) antérieure au début.`);
    }
    const estDerniere = i === PERIODES_ABATTEMENT.length - 1;
    if (!estDerniere && per.au === null) {
      anomalies.push(`Période ${per.du} : seule la dernière période peut rester ouverte.`);
    }
    if (estDerniere && per.au !== null) {
      anomalies.push(`Période ${per.du} : la dernière période doit rester ouverte.`);
    }
    const suivante = PERIODES_ABATTEMENT[i + 1];
    if (suivante !== undefined && per.au !== null && !(per.au < suivante.du)) {
      anomalies.push(`Périodes ${per.du} et ${suivante.du} : chevauchement ou désordre.`);
    }
  });

  return anomalies;
}
