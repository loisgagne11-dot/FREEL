/**
 * Le recouvrement : « est-ce que ce que je facture rentre, et en combien de
 * temps ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le facturier disait « reste à rentrer », « dont en retard », « encaissé sur
 * la période ». Trois montants, et aucun ne répond à la question qu'on se pose
 * en les regardant : est-ce que c'est BEAUCOUP ? 6 010 € en attente sur un
 * trimestre à 8 000 € facturés est une alerte ; les mêmes 6 010 € sur un
 * trimestre à 60 000 € sont la respiration normale d'un délai de paiement.
 *
 * Le taux répond, et le délai dit à quelle échéance l'attendre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EN EUROS, ET NON EN NOMBRE DE FACTURES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application comptait les factures : `nb payées / nb émises`. Une
 * facture de 300 € réglée et une de 12 000 € impayée donnaient 50 %, ce qui
 * décrit une situation confortable là où 97,6 % du chiffre d'affaires manque.
 * Le taux porte donc sur les MONTANTS. C'est un écart assumé avec l'ancienne,
 * et c'est une correction : la question posée est « combien de mon argent est
 * rentré », pas « combien de mes documents ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA MÉDIANE À CÔTÉ DE LA MOYENNE, ET DANS CET ORDRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un client qui règle à 30 jours neuf fois et à 300 jours une fois donne une
 * moyenne de 57 jours : un délai auquel rien n'est jamais arrivé. La médiane
 * dit 30, et c'est ce qu'on attend la prochaine fois. Les deux sont rendues —
 * leur ÉCART est lui-même l'information, il signale qu'un dossier traîne — mais
 * c'est la médiane qui s'affiche en premier.
 */

import { type DateISO, type Euros, type Ratio, euros, ratio } from '../types';
import { joursEntre } from './activite';
import type { FactureSuivie, RecetteSuivie } from './facturier';

/** Ce qu'un délai mesuré retient de sa facture. */
export interface DelaiMesure {
  readonly numero: string;
  readonly clientNom: string;
  /** De la mise en recouvrement à l'encaissement, en jours. */
  readonly jours: number;
}

export interface Recouvrement {
  /** L'assiette : tout ce qui a été facturé et n'est pas annulé. */
  readonly facture: Euros;
  /** Ce qui est rentré dessus. */
  readonly encaisse: Euros;
  /**
   * La part rentrée, entre 0 et 1. `null` quand rien n'a été facturé — et
   * non zéro : « 0 % de recouvrement » sur un trimestre sans facture décrirait
   * un échec là où il n'y a eu aucune tentative.
   */
  readonly taux: Ratio | null;
  /** Ce qui reste dû : l'assiette moins ce qui est rentré. */
  readonly resteARentrer: Euros;
  /** Le délai habituel, en jours. Voir l'en-tête pour le choix de la médiane. */
  readonly delaiMedian: number | null;
  /** La moyenne, dont l'écart à la médiane signale qu'un dossier traîne. */
  readonly delaiMoyen: number | null;
  /** Sur combien de factures le délai est mesuré. */
  readonly nombreMesure: number;
  /**
   * Factures encaissées dont le délai n'est PAS mesurable.
   *
   * ───────────────────────────────────────────────────────────────────────
   * IL VAUT ZÉRO AUJOURD'HUI, ET C'EST EXACTEMENT POURQUOI IL EXISTE
   * ───────────────────────────────────────────────────────────────────────
   *
   * `statutDe` classe en BROUILLON toute recette sans date d'émission : une
   * facture ne peut donc être « encaissée » qu'en en portant une, et
   * `depuisQuand` retombe dessus à défaut d'envoi. Aucune facture encaissée
   * n'échappe à la mesure, et un test nommé tient cette propriété.
   *
   * Le compteur n'est pas pour autant du décor. Il empêche qu'un changement
   * futur de `statutDe` fasse disparaître des factures de la médiane SANS RIEN
   * DIRE — un délai calculé sur trois factures ressemblerait alors à un délai
   * calculé sur trente. Le jour où il cesse de valoir zéro, le test l'annonce
   * et l'écran doit le dire.
   */
  readonly nonMesurables: number;
  /** Les délais retenus, du plus long au plus court : le pire se relance. */
  readonly delais: readonly DelaiMesure[];
}

/**
 * Depuis quand une facture court, pour le calcul du délai.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ENVOI D'ABORD, L'ÉMISSION EN SECOURS — ET JAMAIS L'INVERSE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un client ne peut pas régler une facture qu'il n'a pas reçue. Compter depuis
 * l'ÉMISSION imputerait au client les quinze jours pendant lesquels le document
 * a dormi dans un dossier — c'est le cas ordinaire en fin de mois, où l'on
 * établit les factures d'un coup et où l'on envoie ensuite. Le délai mesuré
 * dirait alors « ce client paie à 55 jours » d'un client qui règle à 40.
 *
 * `envoyeeLe` est facultatif : il n'existe qu'à partir du schéma 8. Sur une
 * facture qui n'en porte pas, l'émission est le seul repère disponible, et
 * c'est un repère PESSIMISTE — il surestime le délai plutôt que de le
 * sous-estimer. S'abstenir totalement serait défendable mais coûterait tout
 * l'historique d'avant le schéma 8, c'est-à-dire précisément les factures dont
 * on a le plus de recul.
 */
function depuisQuand(r: RecetteSuivie): DateISO | null {
  return r.envoyeeLe ?? r.emiseLe;
}

/**
 * Le recouvrement d'une liste de factures suivies.
 *
 * L'assiette EXCLUT les brouillons, les annulations et les factures annulées :
 * un brouillon n'a jamais été réclamé à personne, et un avoir n'est pas une
 * créance qu'on aurait échoué à recouvrer. Les compter ferait baisser le taux
 * à chaque correction d'erreur, ce qui punirait exactement le bon geste.
 */
export function recouvrementDe(factures: readonly FactureSuivie[]): Recouvrement {
  const retenues = factures.filter(
    (f) => f.statut !== 'brouillon' && f.statut !== 'annulee' && f.statut !== 'annulation'
  );

  const facture = euros(retenues.reduce((t, f) => t + f.recette.montant, 0));
  const encaissees = retenues.filter((f) => f.statut === 'encaissee');
  const encaisse = euros(encaissees.reduce((t, f) => t + f.recette.montant, 0));

  const delais: DelaiMesure[] = [];
  let nonMesurables = 0;
  for (const f of encaissees) {
    const debut = depuisQuand(f.recette);
    const fin = f.recette.encaisseeLe;
    if (debut === null || fin === null) { nonMesurables += 1; continue; }
    delais.push({
      numero: f.recette.numero,
      clientNom: f.recette.clientNom,
      // Borné à zéro : une facture encaissée AVANT sa date d'envoi est une
      // saisie incohérente, pas un délai négatif. Un nombre négatif dans la
      // médiane la tirerait sous zéro et l'écran annoncerait des règlements
      // d'avance — plus troublant que la saisie qui l'a produit.
      jours: Math.max(0, joursEntre(debut, fin))
    });
  }

  const valeurs = delais.map((d) => d.jours);

  return {
    facture,
    encaisse,
    // Zéro facturé : on s'abstient. Voir `taux`.
    taux: facture === 0 ? null : ratio(encaisse / facture),
    resteARentrer: euros(facture - encaisse),
    delaiMedian: mediane(valeurs),
    delaiMoyen: valeurs.length === 0
      ? null
      : Math.round(valeurs.reduce((s, v) => s + v, 0) / valeurs.length),
    nombreMesure: valeurs.length,
    nonMesurables,
    // Le plus long en tête : c'est le dossier qu'on vient chercher.
    delais: [...delais].sort((a, b) => b.jours - a.jours)
  };
}

/** La médiane, arrondie au jour : un demi-jour de délai ne veut rien dire. */
function mediane(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 1
    ? triees[milieu] as number
    : Math.round(((triees[milieu - 1] as number) + (triees[milieu] as number)) / 2);
}
