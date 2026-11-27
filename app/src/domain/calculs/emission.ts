import type { DateISO, Mois } from '../types';

/**
 * Qui émet les factures : FREEL, ou un autre logiciel que FREEL suit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX MANIÈRES DE TENIR SES FACTURES, ET UNE SEULE ENTREPRISE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * FREEL savait rédiger, numéroter et produire la facture. Celui qui émet déjà
 * dans un logiciel de facturation — Tiime, par exemple, qui porte aussi la
 * facturation électronique — n'avait que deux mauvais choix : émettre deux
 * fois, sous deux numérotations qui finissent par se croiser, ou ne rien
 * saisir, et perdre le livre des recettes, les relances et le suivi des
 * encaissements.
 *
 * Le choix est un FAIT de l'entreprise (`Entreprise.emissionFactures`), et la
 * provenance un fait de chaque facture (`Recette.emisePar`) : changer d'outil
 * en cours d'année ne transforme pas une facture de Tiime en document que
 * FREEL saurait rééditer. Ce module ne connaît ni le magasin ni l'écran.
 */

/** Où les factures naissent. */
export type ModeEmission = 'freel' | 'externe';

/**
 * La facture a-t-elle été produite par FREEL ? Le seul lecteur de `emisePar`.
 *
 * Absent vaut FREEL : c'est ce qu'était toute facture d'avant le schéma 29.
 * Lire l'absence ailleurs, à la main, finirait par la lire autrement — et un
 * « Revoir la facture » sur une facture de Tiime reconstruirait, sous le
 * numéro de Tiime, un document que le client n'a jamais reçu.
 */
export function emiseParFreel(r: { readonly emisePar?: ModeEmission }): boolean {
  return r.emisePar !== 'externe';
}

/**
 * Le mois qu'une facture couvre — le seul lecteur de `moisFacture`.
 *
 * Le mois DIT d'abord : la facture d'août émise le 2 septembre couvre août.
 * Faute de lui (toute facture d'avant le schéma 29, et celles que FREEL émet
 * depuis le brouillon du mois), le mois d'émission — la règle que suivait
 * déjà « facture déjà émise » : en changer pour les seules factures
 * anciennes ferait dire deux choses différentes au brouillon et à la liste
 * des mois en attente. `null` pour un brouillon : rien n'est facturé.
 */
export function moisFactureDe(
  r: { readonly moisFacture?: Mois | null; readonly emiseLe: DateISO | null }
): Mois | null {
  if (r.emiseLe === null) return null;
  return r.moisFacture ?? (r.emiseLe.slice(0, 7) as Mois);
}

/** Un numéro tel qu'il se compare : sans blancs autour, sans casse. */
const cleDuNumero = (n: string): string => n.trim().toLocaleLowerCase('fr-FR');

/**
 * Ce numéro est-il déjà porté par une facture du livre ?
 *
 * Sans la casse ni les blancs : « F-2026-08 » et « f-2026-08 » désignent la
 * même pièce pour qui contrôle, et en accepter deux ferait renvoyer deux
 * écritures à un seul document. Les écritures d'annulation sont écartées :
 * elles recopient le numéro de la facture qu'elles annulent, c'est leur rôle.
 */
export function numeroDejaPris(
  numero: string,
  recettes: readonly { readonly numero: string; readonly annuleEcriture?: string | null }[]
): boolean {
  const cle = cleDuNumero(numero);
  return cle !== '' && recettes.some((r) => typeof r.annuleEcriture !== 'string' && cleDuNumero(r.numero) === cle);
}

/**
 * Combien de mois en arrière chercher ceux qui restent à enregistrer.
 *
 * Un an : c'est l'horizon d'un oubli qui se rattrape d'un geste — la facture
 * de juillet retrouvée dans Tiime en octobre. Au-delà, ce n'est plus un mois
 * en attente, c'est la reprise d'un historique, et trois ans de missions
 * listés mois par mois noieraient les quatre derniers, les seuls qu'on cherche.
 */
export const MOIS_EN_ATTENTE_MAX = 12;
