import type { Euros, Resolution } from '../types';
import { euros } from '../types';

/**
 * Ce qu'une journée rapporte réellement, et ce qu'il en reste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE TARIF AFFICHÉ N'EST PAS CE QU'ON GAGNE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un indépendant connaît son tarif journalier par cœur et se trompe deux fois
 * dessus.
 *
 * D'abord parce que **tous les jours travaillés ne se facturent pas** : une
 * remise consentie, un forfait qui déborde, une demi-journée de reprise
 * offerte, un déplacement non compté. Le rapport de l'année divisé par les
 * journées réellement passées donne un tarif plus bas que celui du contrat, et
 * l'écart est la mesure de ce qui s'est perdu en route.
 *
 * Ensuite parce que **ce qui rentre n'est pas ce qui reste** : en micro-BNC,
 * cotisations et impôt prélèvent un quart du chiffre d'affaires avant qu'on
 * ait rien décidé. C'est l'écart que tout indépendant sous-estime, et celui
 * qu'il faut avoir en tête pour dire oui ou non à une mission.
 *
 * Ce module ne calcule aucun taux : il applique celui qu'on lui donne, et rend
 * une `Resolution` pour le net, parce que le barème peut ne pas couvrir la
 * période demandée. Un « ce qui vous reste par jour » calculé sur un taux
 * supposé serait précisément le chiffre sur lequel on décide de dire oui.
 */

/** Le tarif affiché, le tarif réel, et ce qui les sépare. */
export interface TjmEffectif {
  /** Journées réellement passées sur les missions, ajustements compris. */
  readonly jours: number;
  /**
   * Le tarif que les contrats annoncent, pondéré par les journées.
   *
   * `null` sans aucune journée : c'est ce que la moyenne ne peut pas dire, et
   * zéro le dirait faux.
   */
  readonly affiche: Euros | null;
  /** Ce que le chiffre d'affaires facturé donne, ramené à la journée. */
  readonly effectif: Euros | null;
  /**
   * Effectif moins affiché. Négatif quand on facture moins que le tarif.
   *
   * Rendu séparément plutôt que soustrait à l'écran : c'est une différence que
   * deux écrans finiraient par calculer différemment.
   */
  readonly ecart: Euros | null;
}

/**
 * Le tarif journalier effectif, face à celui des contrats.
 *
 * `produit` est la valorisation du planning au tarif de chaque mission : c'est
 * le tarif affiché, exprimé en euros. `facture` est ce qui a réellement été
 * émis sur la période.
 *
 * Les deux se divisent par les MÊMES journées, celles du planning. Prendre
 * deux dénominateurs différents rendrait l'écart illisible : on ne saurait
 * plus s'il vient du tarif ou du décompte.
 */
export function tjmEffectif(
  { jours, produit, facture }: {
    readonly jours: number;
    readonly produit: Euros;
    readonly facture: Euros;
  }
): TjmEffectif {
  if (jours <= 0) {
    return { jours: 0, affiche: null, effectif: null, ecart: null };
  }

  const affiche = euros(Math.round(produit / jours));
  const effectif = euros(Math.round(facture / jours));

  return { jours, affiche, effectif, ecart: euros(effectif - affiche) };
}

/**
 * Ce qu'il reste d'une journée, cotisations et impôt déduits.
 *
 * Le taux est celui qu'on donne — cotisations sociales plus impôt et
 * contributions, en part du chiffre d'affaires encaissé. Ce module n'a aucune
 * opinion sur le régime : c'est `bareme/urssaf` et `bareme/impot` qui
 * tranchent, et eux seuls savent refuser une période qu'aucune table ne
 * couvre.
 *
 * La `Resolution` remonte ce refus intact plutôt que de retomber sur zéro. Un
 * taux à zéro annoncerait qu'une journée rapporte net ce qu'elle rapporte
 * brut, ce qui est faux de vingt-cinq pour cent — et c'est sur ce chiffre
 * qu'on décide d'accepter une mission.
 */
export function tjmNet(
  brut: Euros,
  tauxDeCharges: Resolution<number>
): Resolution<Euros> {
  if (tauxDeCharges.statut === 'refuse') return tauxDeCharges;

  const net = euros(Math.round(brut * (1 - tauxDeCharges.valeur)));

  // La qualification suit celle du taux : un net calculé sur une hypothèse
  // reste une hypothèse, et le promouvoir en « publié » ferait engager sur un
  // chiffre qui ne l'était pas.
  return tauxDeCharges.statut === 'hypothese'
    ? { statut: 'hypothese', valeur: net, source: tauxDeCharges.source,
        verifieLe: tauxDeCharges.verifieLe, depuis: tauxDeCharges.depuis }
    : { statut: 'publie', valeur: net,
        source: tauxDeCharges.source, verifieLe: tauxDeCharges.verifieLe };
}
