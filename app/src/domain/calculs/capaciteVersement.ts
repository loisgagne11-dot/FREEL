import type { Euros, Mois, Resolution } from '../types';
import { euros } from '../types';

/**
 * Ce qu'un mois a dégagé, et ce qu'on s'en est versé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE CALCUL MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le dessin met le versé À L'INTÉRIEUR de la barre de capacité : la barre dit
 * ce que le mois autorisait, le plein dit ce qu'on a pris. Deux barres côte à
 * côte auraient laissé faire la comparaison de l'œil ; imbriquées, elles
 * répondent d'un coup à « me suis-je versé plus que ce mois-là ne rapportait ».
 *
 * Aucun sélecteur ne produisait cette grandeur. Le disponible et le versable
 * la donnent à l'INSTANT, jamais PAR MOIS — et le versable de septembre ne se
 * déduit pas du versable d'aujourd'hui, parce qu'il porte encore les charges
 * d'un trimestre déjà réglé depuis.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN MOIS À VENIR N'A PAS DE VERSÉ, ET C'EST TOUT CE QUE DIT LE HACHURÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La tentation serait de projeter un versé — la moyenne des mois passés, ou le
 * versement soutenable. Ce serait dessiner un plein sur une barre hachurée :
 * l'utilisateur lirait « je me suis versé », alors que rien n'est sorti du
 * compte. `verse` vaut donc `null` sur un mois projeté, et jamais zéro : zéro
 * serait un constat — « ce mois-là, je ne me suis rien versé » — qu'aucun fait
 * ne soutient encore.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE TAUX EST CELUI DU MOIS, ET IL PEUT SE DÉROBER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ACRE s'éteint en cours d'année : un taux unique appliqué aux douze mois se
 * tromperait du simple au double sur les mois restants, et toujours dans le
 * sens qui rassure (des charges sous-évaluées, donc une capacité gonflée). Le
 * taux entre donc mois par mois, sous forme de `Resolution` — et quand il
 * refuse, la capacité refuse avec lui plutôt que de compter zéro charge.
 */

/** Un mois déjà vécu, ou un mois encore à venir. */
export type NatureDuMois = 'constate' | 'projete';

export interface CapaciteDuMois {
  readonly mois: Mois;
  readonly nature: NatureDuMois;
  /** Encaissé du mois : constaté s'il est passé, attendu s'il est à venir. */
  readonly encaisse: Euros;
  /** Cotisations et impôt dus sur cet encaissé, au taux de CE mois. */
  readonly charges: Euros;
  readonly depenses: Euros;
  /**
   * Ce que le mois a dégagé : encaissé − charges − dépenses.
   *
   * Peut être NÉGATIF, et n'est pas borné à zéro. Un mois sans encaissement et
   * avec un abonnement à payer a coûté de l'argent ; le remonter à zéro
   * effacerait le seul signal utile de ce mois-là. C'est à l'écran de décider
   * comment dessiner une barre négative, pas à ce calcul de la faire
   * disparaître.
   */
  readonly capacite: Euros;
  /**
   * Ce qu'on s'est effectivement versé. `null` sur un mois à venir — jamais
   * zéro, qui serait un constat.
   */
  readonly verse: Euros | null;
}

/** Ce qu'il faut d'un mois pour en calculer la capacité. */
export interface EntreeCapacite {
  readonly mois: Mois;
  /** Encaissé constaté, ou encaissements attendus si le mois est à venir. */
  readonly encaisse: Euros;
  /** Dépenses du mois : payées si le mois est passé, hypothèse sinon. */
  readonly depenses: Euros;
  /** Le taux de charges DE CE MOIS, jamais une moyenne de l'année. */
  readonly tauxDeCharges: Resolution<number>;
  /** Ce qu'on s'est versé ce mois-là. Ignoré si le mois est à venir. */
  readonly verse: Euros;
}

/**
 * Le mois courant est CONSTATÉ, pas projeté.
 *
 * Il est incomplet — il lui reste des jours — mais tout ce qu'il porte est
 * arrivé : l'encaissé est encaissé, le versé est versé. Le ranger avec les mois
 * à venir effacerait le versement du mois en cours, qui est justement celui
 * qu'on regarde en se demandant s'il en reste.
 */
export function natureDuMois(m: Mois, moisCourant: Mois): NatureDuMois {
  return m > moisCourant ? 'projete' : 'constate';
}

/**
 * La capacité de versement d'un mois.
 *
 * S'abstient — `refuse` — quand le taux de charges du mois n'est pas résolu.
 * Compter zéro charge donnerait une capacité surestimée d'un quart, et c'est
 * exactement le chiffre sur lequel on décide de se virer de l'argent.
 */
export function capaciteDuMois(
  entree: EntreeCapacite,
  moisCourant: Mois
): Resolution<CapaciteDuMois> {
  const taux = entree.tauxDeCharges;
  if (taux.statut === 'refuse') return taux;

  const nature = natureDuMois(entree.mois, moisCourant);
  const charges = euros(entree.encaisse * taux.valeur);

  const valeur: CapaciteDuMois = {
    mois: entree.mois,
    nature,
    encaisse: entree.encaisse,
    charges,
    depenses: entree.depenses,
    capacite: euros(entree.encaisse - charges - entree.depenses),
    verse: nature === 'projete' ? null : entree.verse
  };

  // La capacité n'est pas plus sûre que le taux qui l'a produite : une
  // hypothèse de barème reste une hypothèse une fois multipliée.
  return taux.statut === 'publie'
    ? { statut: 'publie', valeur, source: taux.source, verifieLe: taux.verifieLe }
    : {
      statut: 'hypothese', valeur,
      source: taux.source, verifieLe: taux.verifieLe, depuis: taux.depuis
    };
}
