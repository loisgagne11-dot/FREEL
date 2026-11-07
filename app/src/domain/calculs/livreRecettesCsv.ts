/**
 * Livre des recettes en CSV, pour un tableur français et pour un comptable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FORMAT-LÀ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Excel et LibreOffice en locale française coupent sur `;` (la virgule est
 * leur séparateur décimal) et lisent « 1200,50 » comme un nombre. Un CSV à
 * virgules s'ouvre en une seule colonne ; un BOM absent transforme « Chèque »
 * en « ChÃ¨que ». Le fichier est donc écrit pour CET usage, pas pour un
 * échange entre programmes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN NOM DE CLIENT SAISI LIBREMENT EST UNE ENTRÉE NON FIABLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un tableur évalue comme formule toute cellule qui commence par `=`, `+`,
 * `-` ou `@`. Un client nommé « =HYPERLINK(…) » ferait exécuter une formule à
 * l'ouverture du fichier — chez le comptable, à qui on l'envoie. Les champs
 * TEXTE sont donc préfixés d'une apostrophe.
 *
 * Les MONTANTS négatifs (les annulations) en sont exclus : ils ne passent pas
 * par ce garde-fou, car un montant qu'on préfixerait d'une apostrophe cesserait
 * d'être un nombre et ne s'additionnerait plus. C'est un nombre que nous avons
 * formaté nous-mêmes, jamais du texte saisi.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE TVA INCONNUE RESTE UNE CELLULE VIDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Écrire « 0,00 » pour une facture d'avant le schéma 9 dirait au comptable
 * qu'aucune TVA n'a été collectée, ce que personne ne sait. La cellule vide
 * dit « inconnue » ; seul un `0` explicite dit « franchise ».
 */

import type { DateISO } from '../types';
import {
  type EcritureRecette, type ModeReglement, ecrituresDuLivre
} from './livreRecettes';

const SEPARATEUR = ';';
const FIN_DE_LIGNE = '\r\n';
const BOM = '﻿';

const ENTETES = [
  'Date d’encaissement', 'Numéro', 'Client', 'Nature de la prestation',
  'Montant HT', 'TVA collectée', 'Mode de règlement'
] as const;

const MODES: Readonly<Record<ModeReglement, string>> = {
  virement: 'Virement',
  cheque: 'Chèque',
  especes: 'Espèces',
  carte: 'Carte bancaire',
  autre: 'Autre'
};

/** `\t` et `\r` en tête sont aussi interprétés par certains tableurs. */
const DEBUT_DE_FORMULE = /^[=+\-@\t\r]/;

/** Un champ texte : neutralisé contre les formules, puis protégé si besoin. */
function champ(texte: string): string {
  const sur = DEBUT_DE_FORMULE.test(texte) ? `'${texte}` : texte;
  return /[;"\r\n]/.test(sur) ? `"${sur.replace(/"/g, '""')}"` : sur;
}

/** Un montant : un nombre, virgule décimale, jamais passé au garde-fou texte. */
function nombre(valeur: number): string {
  const arrondi = Math.round(valeur * 100) / 100;
  // Évite « -0,00 » produit par l'arrondi d'un montant négligeable.
  return (arrondi === 0 ? 0 : arrondi).toFixed(2).replace('.', ',');
}

function date(d: DateISO): string {
  const [a, m, j] = d.split('-');
  return `${j}/${m}/${a}`;
}

/**
 * Le livre des recettes au format CSV.
 *
 * `annee` filtre sur l'année d'ENCAISSEMENT : c'est la date qui fait entrer
 * une recette dans le livre, donc dans la déclaration de la période. Filtrer
 * sur l'émission aurait placé une facture de décembre réglée en janvier dans
 * le livre de la mauvaise année.
 */
export function livreRecettesCsv(
  recettes: readonly EcritureRecette[],
  annee?: number
): string {
  const retenues = annee === undefined
    ? recettes
    : recettes.filter((r) => r.encaisseeLe?.startsWith(`${annee}-`) === true);

  const lignes = ecrituresDuLivre(retenues).map((e) => [
    e.encaisseeLe === null ? '' : date(e.encaisseeLe),
    champ(e.numero),
    champ(e.clientNom),
    champ(e.libelle),
    nombre(e.montant),
    e.tvaCollectee === undefined || e.tvaCollectee === null ? '' : nombre(e.tvaCollectee),
    e.modeReglement === null ? '' : champ(MODES[e.modeReglement])
  ].join(SEPARATEUR));

  return BOM + [ENTETES.map(champ).join(SEPARATEUR), ...lignes].join(FIN_DE_LIGNE)
    + FIN_DE_LIGNE;
}
