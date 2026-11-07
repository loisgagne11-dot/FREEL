import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import type { EcritureRecette } from './livreRecettes';
import { livreRecettesCsv } from './livreRecettesCsv';

function ecriture(modif: Partial<EcritureRecette> = {}): EcritureRecette {
  return {
    id: 'r1', clientNom: 'Agence Démo', libelle: 'Prestation de conseil', montant: euros(1200.5),
    emiseLe: dateISO('2026-03-01'), encaisseeLe: dateISO('2026-03-15'), modeReglement: 'virement',
    numero: 'F-2026-001', tvaCollectee: euros(0), ...modif
  };
}

const lignes = (csv: string): string[] => csv.replace(/^﻿/, '').split('\r\n').filter((l) => l !== '');

/**
 * UN TABLEUR FRANÇAIS, PAS UN PROGRAMME.
 *
 * Excel en locale française coupe sur `;` et lit « 1200,50 » comme un
 * nombre ; sans BOM, « Chèque » devient « ChÃ¨que ».
 */
describe('livre des recettes en CSV — le format', () => {
  it('commence par un BOM et coupe sur le point-virgule', () => {
    const csv = livreRecettesCsv([ecriture()]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lignes(csv)[1]).toBe('15/03/2026;F-2026-001;Agence Démo;Prestation de conseil;1200,50;0,00;Virement');
  });

  it('protège un champ qui contient le séparateur ou un guillemet', () => {
    const csv = livreRecettesCsv([ecriture({ libelle: 'Atelier « A ; B », dit "C"' })]);
    expect(lignes(csv)[1]).toContain('"Atelier « A ; B », dit ""C"""');
  });

  it('range les écritures par date d’encaissement et écarte ce qui n’est pas encaissé', () => {
    const csv = livreRecettesCsv([
      ecriture({ id: 'b', numero: 'F-2', encaisseeLe: dateISO('2026-04-01') }),
      ecriture({ id: 'x', numero: 'F-X', encaisseeLe: null }),
      ecriture({ id: 'a', numero: 'F-1', encaisseeLe: dateISO('2026-02-01') })
    ]);
    expect(lignes(csv).slice(1).map((l) => l.split(';')[1])).toEqual(['F-1', 'F-2']);
  });
});

/**
 * L'ANNÉE EST CELLE DE L'ENCAISSEMENT.
 *
 * C'est l'encaissement qui fait entrer une recette dans le livre : une
 * facture de décembre réglée en janvier appartient au livre de janvier.
 */
describe('livre des recettes en CSV — l’année', () => {
  it('filtre sur l’année d’encaissement, pas d’émission', () => {
    const csv = livreRecettesCsv([
      ecriture({ id: 'dec', numero: 'F-DEC', emiseLe: dateISO('2025-12-20'), encaisseeLe: dateISO('2026-01-10') }),
      ecriture({ id: 'av', numero: 'F-AV', emiseLe: dateISO('2025-11-02'), encaisseeLe: dateISO('2025-11-30') })
    ], 2026);
    expect(lignes(csv).slice(1).map((l) => l.split(';')[1])).toEqual(['F-DEC']);
  });
});

/**
 * LE FICHIER PART CHEZ LE COMPTABLE.
 *
 * Un client nommé « =HYPERLINK(…) » ferait exécuter une formule à
 * l'ouverture, chez quelqu'un d'autre. Un montant négatif, lui, doit rester
 * un nombre : une annulation qu'on ne peut plus additionner fausse le total.
 */
describe('livre des recettes en CSV — ce qui pourrait s’exécuter', () => {
  it('neutralise un champ texte qui commence comme une formule', () => {
    const csv = livreRecettesCsv([ecriture({ clientNom: '=HYPERLINK("x")' })]);
    expect(lignes(csv)[1]?.split(';')[2]).toBe('"\'=HYPERLINK(""x"")"');
  });

  it('laisse une annulation en nombre négatif', () => {
    const csv = livreRecettesCsv([ecriture({ montant: euros(-1200.5), tvaCollectee: euros(-240.1) })]);
    const champs = lignes(csv)[1]?.split(';') ?? [];
    expect(champs[4]).toBe('-1200,50');
    expect(champs[5]).toBe('-240,10');
  });
});

/**
 * UNE TVA INCONNUE N'EST PAS UNE TVA NULLE.
 *
 * « 0,00 » dirait au comptable qu'aucune TVA n'a été collectée, ce que
 * personne ne sait pour une facture d'avant le schéma 9.
 */
describe('livre des recettes en CSV — la TVA inconnue', () => {
  it('laisse la cellule vide quand la TVA n’est pas connue', () => {
    const { tvaCollectee: _inconnue, ...sansTva } = ecriture();
    const csv = livreRecettesCsv([sansTva]);
    expect(lignes(csv)[1]?.split(';')[5]).toBe('');
  });
});
