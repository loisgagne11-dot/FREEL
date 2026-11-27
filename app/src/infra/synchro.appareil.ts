/**
 * Ce que cet APPAREIL retient de sa dernière synchronisation (lot 42).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PAS UN FAIT DU DOSSIER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La version du compte vue la dernière fois, l'heure de ce moment, et
 * l'empreinte des faits d'alors. Rien de cela ne s'est produit dans l'activité
 * de l'utilisateur : c'est l'état d'un appareil par rapport à un compte. Dans
 * les faits, il voyagerait sur le compte vers les autres appareils — qui
 * liraient alors la base d'un AUTRE appareil, et prendraient pour « à jour »
 * ce qu'ils n'ont jamais reçu. Il vit donc dans le stockage local, sous sa
 * propre clé, versionnée ; « Effacer cet appareil » l'emporte avec le reste
 * (toutes les clés `freel…`).
 *
 * Il est lié au COMPTE (l'identifiant de l'utilisateur) : la base d'un autre
 * compte ne dit rien de celui-ci, et la prendre pour la sienne ferait
 * « recevoir » ou « envoyer » à tort après un changement de projet.
 *
 * Un module minuscule — l'empreinte pour seule dépendance : la barre du haut
 * le lit pour écrire « Synchronisé à 9 h 41 », et elle n'a rien d'autre à
 * télécharger pour cela.
 */
import type { StockageLocal } from './session';
import { empreinte } from '../state/synchro.empreinte';

/** Clé versionnée : une forme future se reconnaîtra, et celle-ci ne la lira pas de travers. */
export const CLE_SYNCHRO = 'freel.synchro.appareil.v1' as const;

export interface BaseSynchro {
  /** L'identifiant de l'utilisateur du compte : une base ne vaut que pour lui. */
  readonly compte: string;
  /** La version du compte vue à la dernière synchronisation réussie. */
  readonly version: number;
  /** L'heure de cette synchronisation, à l'horloge de cet appareil. Affichée, jamais arbitre. */
  readonly le: string;
  /** L'empreinte des faits d'alors : ce qu'il y a ici a-t-il changé depuis ? */
  readonly empreinte: string;
  /**
   * L'heure de la dernière modification faite ici depuis, si on l'a vue.
   *
   * Pour la phrase « Cet appareil a été modifié le … à … » quand il faut
   * choisir : sans elle, on ne saurait dire si le changement d'ici date d'une
   * minute ou d'une semaine. Ce n'est PAS elle qui dit « modifié » : c'est
   * l'empreinte (voir `state/synchro.empreinte`).
   */
  readonly modifieLe: string | null;
}

const estDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/**
 * La base de ce compte, ou `null` : jamais synchronisé, autre compte, ou
 * illisible. Une base abîmée ne se répare pas en devinant : elle ramène au
 * parcours de première liaison, où l'utilisateur voit les deux côtés.
 */
export function lireBase(stockage: StockageLocal, compte: string): BaseSynchro | null {
  try {
    const brut = stockage.getItem(CLE_SYNCHRO);
    if (brut === null) return null;
    const o = JSON.parse(brut) as Record<string, unknown>;
    const { version, le, empreinte, modifieLe } = o;
    if (o['compte'] !== compte || typeof version !== 'number' || !Number.isInteger(version) || version < 1
      || !estDate(le) || typeof empreinte !== 'string' || empreinte === ''
      || (modifieLe !== null && !estDate(modifieLe))) {
      return null;
    }
    return { compte, version, le, empreinte, modifieLe };
  } catch {
    return null;
  }
}

/**
 * Retient une synchronisation qui vient de RÉUSSIR : envoi accepté, compte
 * adopté, ou les deux côtés constatés identiques.
 *
 * `faits` sont ceux de cet appareil À CE MOMENT — ceux qu'on vient d'envoyer,
 * ou ceux que l'adoption a posés. C'est leur empreinte qui dira ensuite
 * « modifié depuis » ; prise sur autre chose, une adoption compterait comme
 * une modification, et repartirait aussitôt vers le compte.
 */
export function noterSynchronisation(
  stockage: StockageLocal, compte: string, version: number, faits: unknown, maintenant: Date = new Date()
): BaseSynchro {
  const base: BaseSynchro = {
    compte, version, le: maintenant.toISOString(), empreinte: empreinte(faits), modifieLe: null
  };
  ecrireBase(stockage, base);
  return base;
}

export function ecrireBase(stockage: StockageLocal, base: BaseSynchro | null): void {
  try {
    if (base === null) stockage.removeItem(CLE_SYNCHRO);
    else stockage.setItem(CLE_SYNCHRO, JSON.stringify(base));
  } catch {
    // Stockage plein : l'appareil se comportera comme jamais synchronisé, et
    // l'écran Compte redemandera le sens. Rien d'envoyé à l'aveugle.
  }
}
