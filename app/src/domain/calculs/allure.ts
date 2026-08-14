import type { DateISO, Euros, Mois } from '../types';
import { euros } from '../types';

/**
 * Où l'on en est À CETTE DATE, et non seulement en pourcentage.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE MÊME CHIFFRE VEUT DIRE DEUX CHOSES OPPOSÉES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « 69 % du plafond » est une excellente nouvelle au 15 mars et un problème au
 * 15 novembre. Une jauge qui ne montre que la part consommée ne distingue pas
 * les deux cas : c'est un compteur, pas un avertisseur.
 *
 * Le seuil majoré de TVA est le cas où cela coûte le plus cher. Le franchir
 * rend la TVA exigible RÉTROACTIVEMENT au 1er du mois — y compris sur les
 * factures déjà émises sans TVA, qu'il faut alors refaire ou dont il faut
 * absorber la taxe. Prévenir au moment du franchissement, c'est prévenir trop
 * tard.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX CHOSES DE NATURE DIFFÉRENTE, ET ON NE LES MÉLANGE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 1. La PART DE L'ANNÉE ÉCOULÉE est un fait de calendrier. Rien n'est
 *    extrapolé : au 15 novembre, 87 % de l'année est passée, et c'est vrai
 *    quoi qu'on fasse. Elle se pose sur la jauge comme un repère.
 *
 * 2. La DATE DE FRANCHISSEMENT est une extrapolation. Elle prolonge le rythme
 *    constaté, ce qui est légitime pour annoncer l'avenir, mais elle doit
 *    montrer son hypothèse et refuser de se prononcer quand l'assiette est
 *    trop mince : une projection linéaire sur six semaines d'activité n'est
 *    pas une prévision, c'est du bruit habillé en chiffre.
 */

/** Le rang du jour dans l'année, 1 pour le 1er janvier. */
function jourDeLAnnee(date: DateISO): number {
  const d = Date.parse(`${date}T00:00:00Z`);
  const debut = Date.parse(`${date.slice(0, 4)}-01-01T00:00:00Z`);
  return Math.round((d - debut) / 86_400_000) + 1;
}

/** Nombre de jours de l'année civile, bissextiles comprises. */
function joursDeLAnnee(annee: number): number {
  const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
  return bissextile ? 366 : 365;
}

/**
 * La part de l'année écoulée à cette date, entre 0 et 1.
 *
 * Comptée en JOURS et non en mois : au 15 juillet, « sept mois » surestime de
 * deux semaines et « six mois » sous-estime d'autant. Le repère se pose sur
 * une barre, il doit tomber au bon endroit.
 */
export function partDeLAnneeEcoulee(aujourdhui: DateISO): number {
  const annee = Number(aujourdhui.slice(0, 4));
  return jourDeLAnnee(aujourdhui) / joursDeLAnnee(annee);
}

/**
 * Ce qu'on peut dire du franchissement d'un seuil.
 *
 * Quatre issues, et aucune ne se replie sur une autre : « je ne peux pas le
 * dire » n'est pas « pas avant la fin de l'année », qui n'est pas « en
 * septembre ». Les confondre ferait passer une abstention pour une bonne
 * nouvelle.
 */
export type Franchissement =
  /** Le seuil est déjà dépassé : il n'y a plus rien à prévoir. */
  | { readonly statut: 'depasse' }
  /** Au rythme constaté, le seuil ne sera pas atteint avant le 31 décembre. */
  | { readonly statut: 'hors_annee' }
  /** Au rythme constaté, le seuil tombe dans ce mois de l'année en cours. */
  | { readonly statut: 'prevu'; readonly mois: Mois }
  /** Assiette trop mince pour projeter quoi que ce soit. */
  | { readonly statut: 'indeterminable'; readonly motif: string };

/**
 * Le jour minimal de l'année à partir duquel on accepte de projeter.
 *
 * Quatre-vingt-dix jours, soit un trimestre. Sous ce seuil, un seul règlement
 * important suffit à tripler le rythme apparent : la projection dirait
 * « dépassement en mai » un jour et « pas cette année » le lendemain, et une
 * prévision qui saute n'est pas consultée deux fois.
 */
export const JOURS_MINIMUM_POUR_PROJETER = 90;

/**
 * À quel mois le seuil tombe, si le rythme se maintient.
 *
 * Le rythme est celui du chiffre d'affaires encaissé depuis le 1er janvier,
 * ramené au jour. Les seuils se mesurant sur l'année civile et se remettant à
 * zéro au 1er janvier, une projection qui déborderait sur l'année suivante
 * n'aurait aucun sens : elle est rendue comme « hors année », pas comme une
 * date.
 */
export function franchissementPrevu(
  encaisse: Euros,
  seuil: Euros,
  aujourdhui: DateISO
): Franchissement {
  if (encaisse >= seuil) return { statut: 'depasse' };

  const joursEcoules = jourDeLAnnee(aujourdhui);
  if (joursEcoules < JOURS_MINIMUM_POUR_PROJETER) {
    return {
      statut: 'indeterminable',
      motif: 'moins d’un trimestre d’activité sur l’année : le rythme n’est pas encore mesurable'
    };
  }
  if (encaisse <= 0) {
    return {
      statut: 'indeterminable',
      motif: 'aucune recette encaissée cette année : il n’y a pas de rythme à prolonger'
    };
  }

  const parJour = encaisse / joursEcoules;
  const joursRestants = Math.ceil((seuil - encaisse) / parJour);
  const annee = Number(aujourdhui.slice(0, 4));

  if (joursEcoules + joursRestants > joursDeLAnnee(annee)) {
    return { statut: 'hors_annee' };
  }

  const d = new Date(`${aujourdhui}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + joursRestants);
  return { statut: 'prevu', mois: d.toISOString().slice(0, 7) as Mois };
}

/**
 * Ce que le rythme constaté donnerait sur l'année entière.
 *
 * Sert à dire « à ce rythme, l'année finit à tant », qui est la question qu'on
 * se pose devant un plafond. Rendu séparément du franchissement : on peut
 * vouloir l'un sans l'autre, et deux écrans qui referaient la division
 * finiraient par ne pas tomber d'accord.
 */
export function projectionAnnuelle(
  encaisse: Euros,
  aujourdhui: DateISO
): Euros | null {
  const joursEcoules = jourDeLAnnee(aujourdhui);
  if (joursEcoules < JOURS_MINIMUM_POUR_PROJETER || encaisse <= 0) return null;

  const annee = Number(aujourdhui.slice(0, 4));
  return euros(Math.round((encaisse / joursEcoules) * joursDeLAnnee(annee)));
}
