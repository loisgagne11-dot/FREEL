import { describe, expect, it } from 'vitest';
import { type DateISO, dateISO } from '../types';
import { type PieceAFournir, ajouterMoisSansDeborder, etatDePiece } from './pieces';

const piece = (m: Partial<PieceAFournir>): PieceAFournir => ({
  id: 'p', sorte: 'vigilance', libelle: 'Attestation', obtenueLe: dateISO('2026-05-04'),
  valableJusquau: null, provisoire: false, ...m
});
const etat = (p: PieceAFournir, jour: string, premiere: DateISO | null = null) =>
  etatDePiece(p, dateISO(jour), premiere);

/**
 * SIX MOIS, EN RESTANT DANS LE MOIS.
 *
 * Le 31 août plus six mois tombe le 28 février — le 29 une année
 * bissextile —, pas le 3 mars où un calcul naïf déborde : l'attestation se
 * dirait à jour trois jours de trop, ceux où le client la refuse.
 */
describe('six mois après le 31 août', () => {
  it('tombe le 28 février, ou le 29 une année bissextile', () => {
    expect(ajouterMoisSansDeborder(dateISO('2026-08-31'), 6)).toBe('2027-02-28');
    expect(ajouterMoisSansDeborder(dateISO('2027-08-31'), 6)).toBe('2028-02-29');
    expect(ajouterMoisSansDeborder(dateISO('2026-05-04'), 6)).toBe('2026-11-04');
  });
});

/**
 * L'ATTESTATION DE VIGILANCE : « DATANT DE MOINS DE SIX MOIS » (D8222-5).
 *
 * Aucune durée de validité n'est écrite : c'est l'obtention qui date. Rappel
 * quinze jours avant, le temps de la télécharger avant qu'on la réclame.
 */
describe('attestation de vigilance', () => {
  it('est à jour, puis à renouveler quinze jours avant six mois, puis expirée', () => {
    const p = piece({ obtenueLe: dateISO('2026-08-31') });
    expect(etat(p, '2027-02-12').etat).toBe('a_jour');
    expect(etat(p, '2027-02-13').etat).toBe('a_renouveler');
    expect(etat(p, '2027-02-28').etat).toBe('a_renouveler');
    expect(etat(p, '2027-03-01').etat).toBe('expiree');
    expect(etat(p, '2027-02-13').finValidite).toBe('2027-02-28');
  });

  /*
   * Celle d'un débutant est PROVISOIRE : elle vaut jusqu'à la première
   * échéance déclarative ou de paiement (CSS L243-15), pas six mois.
   */
  it('provisoire, vaut jusqu’à la première échéance URSSAF', () => {
    const p = piece({ obtenueLe: dateISO('2025-04-10'), provisoire: true });
    expect(etat(p, '2025-05-01', dateISO('2025-07-31')).finValidite).toBe('2025-07-31');
    expect(etat(p, '2025-08-01', dateISO('2025-07-31')).etat).toBe('expiree');
  });

  it('n’est pas en main sans date d’obtention', () => {
    expect(etat(piece({ obtenueLe: null }), '2026-06-01').etat).toBe('a_obtenir');
  });
});

describe('autres pièces', () => {
  it('lit la fin de garantie de la RC pro sur l’attestation de l’assureur', () => {
    const rc = piece({ sorte: 'rc_pro', valableJusquau: dateISO('2026-12-31') });
    expect(etat(rc, '2026-12-01').etat).toBe('a_jour');
    expect(etat(rc, '2026-12-20').etat).toBe('a_renouveler');
    expect(etat(rc, '2027-01-01').etat).toBe('expiree');
    expect(etat({ ...rc, valableJusquau: null }, '2026-12-01').etat).toBe('sans_validite');
  });

  /*
   * L'avis SIRENE n'a AUCUNE durée officielle : une photographie du
   * répertoire la veille du téléchargement. Le dire « à jour » affirmerait ce
   * que personne n'a dit — « de moins de trois mois » est un usage, pas une
   * règle.
   */
  it('ne dit jamais l’avis SIRENE à jour, même daté d’hier', () => {
    const sirene = piece({ sorte: 'sirene', obtenueLe: dateISO('2026-11-16'), valableJusquau: dateISO('2027-01-01') });
    expect(etat(sirene, '2026-11-17').etat).toBe('sans_validite');
  });
});
