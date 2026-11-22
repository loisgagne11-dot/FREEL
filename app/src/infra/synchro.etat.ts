/**
 * Où en est la synchronisation automatique de CET ONGLET — ce que la pastille
 * du haut et l'écran Compte affichent (lot 42).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE SEULE SOURCE, ET ELLE NE FAIT AUCUNE REQUÊTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le moteur (`synchro.moteur`) publie ici ce qu'il a constaté ; la pastille
 * le lit. Si elle recalculait l'état de son côté — comparer les faits, lire
 * le compte —, deux calculs concurrents finiraient par se contredire
 * (invariant n°4), et la pastille interrogerait le réseau sur chaque écran.
 *
 * Ce module ne contient que l'état et ses abonnés : la barre du haut
 * l'importe sans télécharger le moteur, qui arrive après le premier rendu.
 * Les types viennent du moteur et de la règle, sans leur code.
 */
import type { InstantaneDistant } from './supabase';
import type { NatureLocale } from '../state/synchro.regle';

export type EtatSynchroAppareil =
  /** Pas de compte, ou jamais synchronisé : la pastille garde ses trois états d'avant. */
  | { readonly phase: 'inactif' }
  /** Les deux côtés portent la même chose, constaté à `le`. */
  | { readonly phase: 'a-jour'; readonly le: string }
  /** Une modification d'ici part (ou partira dans quelques secondes). */
  | { readonly phase: 'envoi' }
  /** Le réseau manque ; `aEnvoyer` : des changements d'ici attendent son retour. */
  | { readonly phase: 'hors-ligne'; readonly aEnvoyer: boolean }
  /** Les deux côtés ont changé, ou cet appareil a été vidé : une personne tranche. */
  | {
    readonly phase: 'a-choisir';
    readonly pourquoi: 'les-deux-ont-change' | 'appareil-vide';
    /** La dernière modification vue ici depuis la synchronisation, si on l'a vue. */
    readonly modifieLe: string | null;
    readonly distant: InstantaneDistant;
    readonly local: NatureLocale;
  }
  /** Le compte a changé, mais un formulaire est ouvert : on attend qu'il se ferme. */
  | { readonly phase: 'attente-saisie' }
  /** La session a été refusée pour de bon : rien n'est perdu, il faut se reconnecter. */
  | { readonly phase: 'reconnecter' }
  /** Le compte a été écrit par une version plus récente de FREEL. */
  | { readonly phase: 'mettre-a-jour'; readonly schema: number }
  /** Le compte n'est plus celui que cet appareil a vu : on le dit, rien ne part. */
  | {
    readonly phase: 'anomalie';
    readonly pourquoi: 'compte-efface' | 'version-anterieure' | 'compte-illisible';
  }
  /** Cet appareil montre la démonstration : rien ne part, rien n'arrive. */
  | { readonly phase: 'demonstration' }
  /** Le serveur a répondu autre chose qu'attendu ; un nouvel essai est prévu. */
  | { readonly phase: 'erreur'; readonly motif: string; readonly aEnvoyer: boolean };

let courant: EtatSynchroAppareil = { phase: 'inactif' };
const abonnes = new Set<() => void>();

export function etatSynchro(): EtatSynchroAppareil {
  return courant;
}

export function publierEtatSynchro(etat: EtatSynchroAppareil): void {
  courant = etat;
  for (const rappel of abonnes) rappel();
}

export function abonnerEtatSynchro(rappel: () => void): () => void {
  abonnes.add(rappel);
  return () => { abonnes.delete(rappel); };
}
