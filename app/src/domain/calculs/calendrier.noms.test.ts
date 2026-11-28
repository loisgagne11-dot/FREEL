import { describe, expect, it } from 'vitest';
import { dateISO } from '../types';
import { joursFeries } from './calendrier';
import { nommerFeries } from './calendrier.noms';

/** Les fériés nommés d'une année, en paires lisibles d'un coup d'œil. */
const paires = (annee: number, zone?: 'general' | 'alsace_moselle') =>
  [...nommerFeries(annee, zone)].map(([date, n]) => [date, n.nom]);

describe('le nom des jours fériés', () => {
  /*
   * Un férié sans nom se voyait à peine : une bordure en pointillé, et rien
   * qui dise pourquoi le rythme n'avait pas rempli le jeudi. Un nom faux serait
   * pire — « Ascension » posé sur le lundi de Pentecôte fait chercher l'erreur
   * dans le planning au lieu du calendrier.
   */
  it('nomme les onze fériés de 2026, chacun à sa date', () => {
    expect(paires(2026)).toEqual([
      ['2026-01-01', 'Jour de l’an'],
      ['2026-04-06', 'Lundi de Pâques'],
      ['2026-05-01', 'Fête du Travail'],
      ['2026-05-08', 'Victoire 1945'],
      ['2026-05-14', 'Ascension'],
      ['2026-05-25', 'Lundi de Pentecôte'],
      ['2026-07-14', 'Fête nationale'],
      ['2026-08-15', 'Assomption'],
      ['2026-11-01', 'Toussaint'],
      ['2026-11-11', 'Armistice'],
      ['2026-12-25', 'Noël']
    ]);
  });

  /*
   * 2027 a ses fêtes mobiles ailleurs : Pâques le 28 mars, donc le lundi 29,
   * l'Ascension le 6 mai et la Pentecôte le 17. Une table de dates recopiée de
   * 2026 nommerait juste les huit fixes et faux les trois autres.
   */
  it('suit Pâques d’une année à l’autre (2027)', () => {
    expect(paires(2027)).toEqual([
      ['2027-01-01', 'Jour de l’an'],
      ['2027-03-29', 'Lundi de Pâques'],
      ['2027-05-01', 'Fête du Travail'],
      ['2027-05-06', 'Ascension'],
      ['2027-05-08', 'Victoire 1945'],
      ['2027-05-17', 'Lundi de Pentecôte'],
      ['2027-07-14', 'Fête nationale'],
      ['2027-08-15', 'Assomption'],
      ['2027-11-01', 'Toussaint'],
      ['2027-11-11', 'Armistice'],
      ['2027-12-25', 'Noël']
    ]);
  });

  it('nomme les deux jours du droit local d’Alsace-Moselle', () => {
    const noms = nommerFeries(2026, 'alsace_moselle');
    expect(noms.get(dateISO('2026-04-03'))?.nom).toBe('Vendredi saint');
    expect(noms.get(dateISO('2026-12-26'))?.nom).toBe('Saint-Étienne');
  });

  /*
   * LE COUPLAGE AVEC `joursFeries`, SURVEILLÉ.
   *
   * Les dates viennent de `calendrier.ts`, les noms d'ici. Une règle ajoutée
   * là-bas sans nom ici, ou un écart à Pâques corrigé d'un seul côté, laisse
   * un jour « Férié » sans nom — et c'est le seul test qui le verrait, puisque
   * l'occupation, elle, resterait juste.
   */
  it('donne un nom à chaque férié de chaque année, dans les deux zones', () => {
    for (let annee = 2000; annee <= 2100; annee += 1) {
      for (const zone of ['general', 'alsace_moselle'] as const) {
        const noms = nommerFeries(annee, zone);
        expect([...noms.keys()]).toEqual([...new Set(joursFeries(annee, zone))]);
        for (const [date, n] of noms) {
          expect(n.nom, `${date} (${zone})`).not.toBe('Jour férié');
        }
      }
    }
  });

  /*
   * L'Ascension est tombée le 1ᵉʳ mai en 2008. Ne garder qu'un des deux noms
   * dirait qu'on a oublié l'autre fête, et l'ordre d'une table déciderait
   * laquelle.
   */
  it('porte les deux noms quand deux fêtes tombent le même jour', () => {
    expect(nommerFeries(2008).get(dateISO('2008-05-01'))?.nom).toBe('Fête du Travail et Ascension');
  });

  /*
   * La forme courte est celle d'une case de calendrier : au-delà de douze
   * signes, elle ne tient plus sur une ligne à 1 024 px, et la case
   * tronquerait — ce qu'elle ne fait jamais en silence.
   */
  it('abrège en douze signes au plus', () => {
    for (const [, n] of nommerFeries(2026, 'alsace_moselle')) {
      expect(n.court.length, n.nom).toBeLessThanOrEqual(12);
    }
  });
});
