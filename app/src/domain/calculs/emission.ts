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
