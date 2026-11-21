import type { DateISO, Euros, Mois, Resolution } from '../types';

/**
 * Les seuils de l'année, franchis par ce qui est DÉJÀ émis et signé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX DATES DE FRANCHISSEMENT, PARCE QU'ELLES RÉPONDENT À DEUX QUESTIONS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le rythme de l'encaissé, prolongé jusqu'en décembre (`allure`), répond à
 * « si l'année continue comme elle a commencé ». Il ignore ce qu'on sait déjà
 * de la suite : la mission signée qui démarre en septembre, la grosse facture
 * émise hier et due dans quarante-cinq jours. Un indépendant qui démarre une
 * mission à 650 € par jour en octobre franchit la franchise de TVA en
 * novembre, quand le rythme de janvier à juin annonçait « non atteint d'ici le
 * 31 décembre ».
 *
 * Celui-ci ne prolonge rien : il additionne l'encaissé et l'attendu — les
 * factures émises à leur échéance, le planning signé au délai de paiement du
 * client (`encaissementsAttendusParMois`, la même source que la projection de
 * trésorerie). Aucun prospect, aucune tendance : un seuil n'est pas franchi
 * par un devis.
 */
export type FranchissementPipeline =
  | { readonly statut: 'depasse' }
  | { readonly statut: 'prevu'; readonly mois: Mois }
  | { readonly statut: 'non_atteint' };

/**
 * Le mois où l'encaissé de l'année, augmenté de l'attendu mois par mois,
 * atteint le seuil — la comparaison de `franchissementPrevu`, à l'euro près :
 * deux définitions du franchissement donneraient deux mois pour un même seuil,
 * côte à côte sur la même jauge.
 *
 * `attendus` ne porte que les mois de l'année regardée, dans l'ordre : ce
 * qui s'encaisse en janvier compte pour l'année suivante.
 */
export function franchissementParLePipeline(
  encaisse: Euros,
  seuil: Euros,
  attendus: readonly { readonly mois: Mois; readonly montant: Euros }[]
): FranchissementPipeline {
  if (encaisse >= seuil) return { statut: 'depasse' };
  let cumul: number = encaisse;
  for (const a of attendus) {
    cumul += a.montant;
    if (cumul >= seuil) return { statut: 'prevu', mois: a.mois };
  }
  return { statut: 'non_atteint' };
}

/**
 * Combien de jours on peut encore facturer avant le seuil, au tarif moyen des
 * missions signées de l'année.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AU TARIF DES CONTRATS, PAS À UN TARIF DEVINÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le nombre ne vaut que son tarif. Sans mission signée qui en porte un, il n'y
 * a pas de « jour » à compter : on s'abstient, avec le motif, plutôt que de
 * diviser par un tarif inventé — « encore 37 500 jours » à 1 € ne dirait rien,
 * « encore 75 jours » à 500 € devinés dirait faux. Arrondi à l'inférieur : 28,4
 * jours, c'est 28 jours facturables, le vingt-neuvième franchit.
 *
 * « Déjà compté » est l'encaissé de l'année — l'assiette même des seuils,
 * celle des jauges. Le pipeline a sa date à lui, juste à côté.
 */
export function joursFacturablesAvantSeuil(
  { seuil, dejaCompte, tjms, mois, aujourdhui }: {
    readonly seuil: Euros;
    readonly dejaCompte: Euros;
    /** Le tarif de chaque mission signée de l'année ; un tarif nul n'est pas un tarif. */
    readonly tjms: readonly Euros[];
    readonly mois: Mois;
    readonly aujourdhui: DateISO;
  }
): Resolution<number> {
  const tarifs = tjms.filter((t) => t > 0);
  if (tarifs.length === 0) {
    return { statut: 'refuse', motif: 'aucune mission signée de l’année ne porte de tarif journalier' };
  }
  const moyen = tarifs.reduce<number>((s, t) => s + t, 0) / tarifs.length;
  return {
    statut: 'hypothese',
    valeur: Math.max(0, Math.floor((seuil - dejaCompte) / moyen)),
    source: `au tarif moyen des missions signées de l’année, ${Math.round(moyen)} € par jour`,
    verifieLe: aujourdhui,
    depuis: mois
  };
}
