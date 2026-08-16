import type { DateISO } from '../types';

/**
 * Quand une facture est due.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN NOMBRE DE JOURS NE SUFFIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le code calculait l'échéance en ajoutant `delaiPaiementJours` à la date
 * d'émission. Cela ne sait pas dire « fin de mois », qui est pourtant la
 * formule la plus répandue en France et celle que porte chacune des missions
 * en cours du propriétaire.
 *
 * L'écart n'est pas cosmétique. Une facture émise le 12 juin à « 30 jours fin
 * de mois » n'est pas due le 12 juillet mais le 31 juillet : dix-neuf jours,
 * sur chaque facture. Une prévision de trésorerie qui se trompe de dix-neuf
 * jours annonce l'argent avant qu'il n'arrive, et la capacité de versement du
 * mois avec.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX CONVENTIONS QU'ON CONFOND, ET QUI NE TOMBENT PAS LE MÊME JOUR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « 30 jours fin de mois » et « fin de mois + 30 jours » ne sont pas deux
 * façons de dire la même chose :
 *
 *   facture du 12 juin, « 30 jours fin de mois »
 *     → 12 juin + 30 jours = 12 juillet, puis fin de ce mois = **31 juillet**
 *
 *   facture du 12 juin, « fin de mois + 30 jours »
 *     → fin du mois d'émission = 30 juin, puis + 30 jours = **30 juillet**
 *
 * Un jour d'écart ici, treize là — et c'est l'écart qui décide si une relance
 * part ou non. Les deux formules sont donc NOMMÉES séparément plutôt que
 * devinées : personne n'a à se demander laquelle l'application a comprise.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉCHÉANCE EST UN FAIT, PAS UNE DÉRIVÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ce module calcule l'échéance À L'ÉMISSION. Elle se fige ensuite dans la
 * recette, parce qu'elle est imprimée sur le document envoyé au client.
 *
 * La recalculer à la lecture — ce que faisait le code — laissait un
 * changement de conditions réécrire le passé : « cette facture était-elle en
 * retard ? » changeait de réponse rétroactivement, et le compteur de retards
 * avec. La formule portée par la mission ou le client n'est donc que la valeur
 * PROPOSÉE au moment de créer la facture.
 */

/**
 * Les formules de délai, telles qu'elles s'écrivent sur un contrat.
 *
 * Une énumération et non un nombre libre : les conditions réelles sont un
 * petit ensemble de formules nommées, que les deux parties reconnaissent. Et
 * un nombre de jours ne peut pas exprimer « fin de mois ».
 */
export type FormuleDelai =
  | 'reception'
  | 'net_30' | 'net_45' | 'net_60'
  | 'fdm_30' | 'fdm_45' | 'fdm_60'
  | 'fin_de_mois_plus_30' | 'fin_de_mois_plus_45';

/**
 * La formule proposée par défaut à un nouveau client.
 *
 * « 30 jours fin de mois » : c'est ce que portent les missions en cours du
 * propriétaire, et le supplétif légal — trente jours — n'en est pas loin.
 */
export const FORMULE_PAR_DEFAUT: FormuleDelai = 'fdm_30';

/**
 * La règle se LIT dans l'identifiant, elle n'est pas tabulée à côté.
 *
 * `net_45` dit « quarante-cinq jours à compter de l'émission », `fdm_45`
 * « quarante-cinq jours puis fin du mois », `fin_de_mois_plus_45` « fin du mois
 * puis quarante-cinq jours ». L'identifiant EST la spécification.
 *
 * Une table de correspondance à neuf entrées disait la même chose deux fois, et
 * pouvait donc se contredire — un jour où l'on ajoute une formule au type sans
 * l'ajouter à la table. Elle pesait aussi trois cents octets dans le paquet
 * d'entrée, où ce module est tiré par la migration du schéma, pour une marge
 * qui n'y était plus.
 */
function regleDe(formule: FormuleDelai): {
  readonly jours: number;
  readonly base: 'emission' | 'fin_du_mois_apres' | 'fin_du_mois_avant';
} {
  if (formule === 'reception') return { jours: 0, base: 'emission' };
  const jours = Number(formule.slice(formule.lastIndexOf('_') + 1));
  if (formule.startsWith('net_')) return { jours, base: 'emission' };
  if (formule.startsWith('fdm_')) return { jours, base: 'fin_du_mois_apres' };
  return { jours, base: 'fin_du_mois_avant' };
}

/**
 * Décale une date ISO, en UTC pour ne pas dépendre du fuseau.
 *
 * Un seul déplacement pour les deux besoins : `jours` avance de tant de jours,
 * `finDuMois` remonte ensuite au dernier jour du mois atteint. Deux fonctions
 * séparées répétaient le même aller-retour par `Date`, et ce module est tiré
 * dans le paquet d'entrée par la migration du schéma — l'endroit du projet où
 * l'on compte les octets.
 */
function decaler(date: DateISO, jours: number, finDuMois: boolean): DateISO {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  /* Le 1er AVANT d'ajouter le mois : sur un 31, `setUTCMonth(+1)` déborde
     dans le mois suivant — le 31 janvier deviendrait le 2 mars, et « fin de
     mois » répondrait fin février au lieu de fin janvier. */
  if (finDuMois) { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); }
  return d.toISOString().slice(0, 10) as DateISO;
}

/**
 * L'échéance d'une facture émise ce jour-là, sous cette formule.
 *
 * Les débordements de mois courts se règlent tout seuls parce que le calcul
 * passe par un objet `Date` : le 31 janvier + 30 jours donne le 2 mars, et
 * « fin de mois » y répond le 31 mars. Une arithmétique sur les numéros de
 * mois aurait produit un 31 février.
 */
export function echeanceDe(emiseLe: DateISO, formule: FormuleDelai): DateISO {
  const { jours, base } = regleDe(formule);
  return base === 'fin_du_mois_avant'
    ? decaler(decaler(emiseLe, 0, true), jours, false)
    : decaler(emiseLe, jours, base === 'fin_du_mois_apres');
}

/**
 * Lit une formule venue d'un bloc de faits, sans rien inventer.
 *
 * Rend `null` sur une valeur inconnue plutôt que de retomber sur le défaut :
 * un compte écrit par une version plus récente pourrait porter une formule que
 * ce code ne connaît pas, et la remplacer silencieusement par « 30 jours fin
 * de mois » changerait des dates d'échéance sans que personne le voie.
 */
export function formuleOuNull(v: unknown): FormuleDelai | null {
  return typeof v === 'string' && MOTIF_FORMULE.test(v) ? v as FormuleDelai : null;
}

/**
 * Les seules formules que ce code connaît.
 *
 * Un motif plutôt qu'une liste, pour la même raison que `regleDe` : la liste
 * ordonnée dont la saisie a besoin vit avec les libellés, qui ne voyagent pas
 * dans le paquet d'entrée. Ce qui compte ici est de RECONNAÎTRE, pas d'énumérer.
 */
const MOTIF_FORMULE =
  /^(?:reception|net_(?:30|45|60)|fdm_(?:30|45|60)|fin_de_mois_plus_(?:30|45))$/;

/**
 * La formule qui correspond le mieux à un ancien délai en jours.
 *
 * Sert à la migration. On rend une formule « nets », et c'est délibéré : c'est
 * exactement ce que le code calculait — `emiseLe + N jours`. Traduire un
 * ancien `30` par « 30 jours fin de mois » aurait décalé de plusieurs semaines
 * l'échéance de factures déjà émises, sous couvert de les corriger.
 */
export function formuleDepuisJours(jours: number): FormuleDelai {
  if (jours <= 0) return 'reception';
  if (jours <= 30) return 'net_30';
  if (jours <= 45) return 'net_45';
  return 'net_60';
}
