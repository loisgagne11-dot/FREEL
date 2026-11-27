/**
 * Le nom des jours fériés, à côté de leurs dates.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LES NOMS NE SONT PAS DANS `calendrier.ts`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `joursFeries` vit dans le paquet d'entrée : la provision d'impôt lit le
 * planning à venir dès le Pilote. Les onze noms et leurs abréviations y
 * pèseraient près de 300 octets, quand l'entrée n'en a plus que 133 de marge
 * (79,87 / 80 Ko) — et seul le planning les affiche. Ils vivent donc ici, dans
 * le morceau des sélecteurs d'Activité.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE SEULE SOURCE DES DATES, QUAND MÊME
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ce module ne décide JAMAIS qu'un jour est férié : il nomme les dates que
 * `joursFeries` lui rend, et seulement elles. Il reconnaît pour cela la règle
 * qui les a produites — une date fixe (« 11-11 ») ou un écart au dimanche de
 * Pâques (39 jours : l'Ascension). Une seconde table de dates, ici, aurait fini
 * par ne plus dire la même chose que la première : un jour nommé « Lundi de
 * Pentecôte » que le calcul de l'occupation compterait ouvré.
 *
 * Le couplage se surveille dans l'autre sens : une règle ajoutée là-bas sans
 * nom ici, ou un écart corrigé d'un côté seulement, laisse une date sans nom —
 * et le test parcourt un siècle dans les deux zones pour l'exiger.
 */

import type { DateISO } from '../types';
import { joursFeries, paques, type ZoneFeries } from './calendrier';

/**
 * Le nom d'un férié, et sa forme courte.
 *
 * `court` est celle qu'une case de calendrier peut porter sur une ligne
 * (« Pentecôte ») ; `nom` est celle qu'on écrit en toutes lettres — légende,
 * nom accessible, éditeur. La case n'affiche jamais une troncature : quand même
 * `court` ne tient pas, elle passe le relais à la légende (voir `VueMois`).
 */
export interface NomDeFerie {
  readonly nom: string;
  readonly court: string;
}

/**
 * Les noms, par règle : « MM-JJ » pour une date fixe, « P » suivi de l'écart
 * en jours pour une fête mobile.
 *
 * Les formes longues sont celles que le propriétaire a données ; les courtes,
 * celles des calendriers imprimés (« 14 Juillet », « 8 Mai 1945 »), dix ou
 * douze signes au plus.
 */
const NOMS: Readonly<Record<string, NomDeFerie>> = {
  '01-01': { nom: 'Jour de l’an', court: 'Jour de l’an' },
  P1: { nom: 'Lundi de Pâques', court: 'L. de Pâques' },
  '05-01': { nom: 'Fête du Travail', court: '1er Mai' },
  '05-08': { nom: 'Victoire 1945', court: '8 Mai 1945' },
  P39: { nom: 'Ascension', court: 'Ascension' },
  P50: { nom: 'Lundi de Pentecôte', court: 'Pentecôte' },
  '07-14': { nom: 'Fête nationale', court: '14 Juillet' },
  '08-15': { nom: 'Assomption', court: 'Assomption' },
  '11-01': { nom: 'Toussaint', court: 'Toussaint' },
  '11-11': { nom: 'Armistice', court: 'Armistice' },
  '12-25': { nom: 'Noël', court: 'Noël' },
  // Droit local d'Alsace-Moselle : voir `ZoneFeries`.
  'P-2': { nom: 'Vendredi saint', court: 'Vend. saint' },
  '12-26': { nom: 'Saint-Étienne', court: 'St-Étienne' }
};

/**
 * Ce qu'on affiche d'un jour férié dont la règle n'a pas de nom ici.
 *
 * Le cas ne doit pas exister — le test l'interdit. S'il arrivait quand même, le
 * jour resterait dit férié, ce qu'il est : taire sa nature parce qu'on ignore
 * son nom effacerait la teinte et la raison pour laquelle le rythme ne l'a pas
 * rempli.
 */
const SANS_NOM: NomDeFerie = { nom: 'Jour férié', court: 'Férié' };

const UN_JOUR = 86_400_000;
const utc = (d: string): number =>
  Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

/**
 * Les fériés d'une année, nommés : les dates de `joursFeries`, dans son ordre.
 *
 * Deux règles peuvent tomber le même jour — l'Ascension est passée sur le
 * 1ᵉʳ mai en 2008, et y repassera. Le jour porte alors les deux noms : n'en
 * garder qu'un dirait qu'on a oublié l'autre fête, et l'ordre de la table
 * déciderait à notre place laquelle.
 */
export function nommerFeries(
  annee: number, zone: ZoneFeries = 'general'
): ReadonlyMap<DateISO, NomDeFerie> {
  const dimanche = utc(paques(annee));
  const noms = new Map<DateISO, NomDeFerie>();
  for (const date of joursFeries(annee, zone)) {
    const regles = [date.slice(5), `P${Math.round((utc(date) - dimanche) / UN_JOUR)}`]
      .map((r) => NOMS[r])
      .filter((n): n is NomDeFerie => n !== undefined);
    const [premier, second] = regles;
    noms.set(date, premier === undefined
      ? SANS_NOM
      : second === undefined
        ? premier
        : { nom: `${premier.nom} et ${second.nom}`, court: `${premier.court} · ${second.court}` });
  }
  return noms;
}
