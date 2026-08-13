import { describe, expect, it } from 'vitest';
import type { Mois } from '../types';
import { periodesADeclarer } from './declarations';

const enc = (encaisseeLe: string, montant = 1000) => ({ encaisseeLe, montant });
const AUJOURDHUI = '2026-08-13';

describe('périodes à déclarer', () => {
  it('groupe les encaissements par mois quand la périodicité est mensuelle', () => {
    const p = periodesADeclarer(
      [enc('2026-06-05'), enc('2026-06-20'), enc('2026-07-02')],
      'mensuel', [], AUJOURDHUI
    );
    expect(p.map((x) => x.id)).toEqual(['2026-07', '2026-06']);
    expect(p.find((x) => x.id === '2026-06')?.encaisse).toBe(2000);
  });

  it('groupe par trimestre quand la périodicité est trimestrielle', () => {
    const p = periodesADeclarer(
      [enc('2026-04-05'), enc('2026-06-20'), enc('2026-07-02')],
      'trimestriel', [], AUJOURDHUI
    );
    expect(p.map((x) => x.id)).toEqual(['2026-T3', '2026-T2']);
    expect(p.find((x) => x.id === '2026-T2')?.encaisse).toBe(2000);
  });

  /**
   * Déclarer un trimestre le déclare EN ENTIER, mois creux compris. Ne marquer
   * que les mois qui portent une recette laisserait le mois vide « à
   * provisionner » pour toujours — sans montant, donc invisible, mais présent.
   */
  it('couvre les trois mois d’un trimestre, y compris ceux sans recette', () => {
    const p = periodesADeclarer([enc('2026-04-05')], 'trimestriel', [], AUJOURDHUI);
    expect(p[0]?.mois).toEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('ne se dit déclarée que si TOUS ses mois le sont', () => {
    const partiel = periodesADeclarer(
      [enc('2026-04-05')], 'trimestriel', ['2026-04'] as Mois[], AUJOURDHUI
    );
    expect(partiel[0]?.declaree).toBe(false);

    const complet = periodesADeclarer(
      [enc('2026-04-05')], 'trimestriel',
      ['2026-04', '2026-05', '2026-06'] as Mois[], AUJOURDHUI
    );
    expect(complet[0]?.declaree).toBe(true);
  });

  /**
   * On ne déclare pas une période en cours : l'URSSAF ouvre la déclaration
   * après sa clôture. La cocher d'avance sortirait du volet « à provisionner »
   * des recettes qu'on va encore encaisser dessus.
   */
  it('ne dit close qu’une période terminée', () => {
    const p = periodesADeclarer(
      [enc('2026-06-05'), enc('2026-08-05')], 'mensuel', [], AUJOURDHUI
    );
    expect(p.find((x) => x.id === '2026-06')?.close).toBe(true);
    expect(p.find((x) => x.id === '2026-08')?.close).toBe(false);
  });

  it('laisse le trimestre en cours ouvert jusqu’à son dernier mois', () => {
    const p = periodesADeclarer([enc('2026-07-05')], 'trimestriel', [], AUJOURDHUI);
    // T3 = juillet-septembre, on est en août : le trimestre court encore.
    expect(p[0]?.close).toBe(false);
  });

  // Une période sans encaissement n'a rien à déclarer ; l'afficher noierait
  // les vraies échéances dans une liste de cases sans objet.
  it('ne rend que les périodes qui portent un encaissement', () => {
    const p = periodesADeclarer([enc('2026-06-05')], 'mensuel', [], AUJOURDHUI);
    expect(p).toHaveLength(1);
  });

  it('écarte une date d’encaissement illisible plutôt que d’inventer un mois', () => {
    const p = periodesADeclarer([enc('')], 'mensuel', [], AUJOURDHUI);
    expect(p).toEqual([]);
  });

  it('nomme les périodes en français', () => {
    expect(periodesADeclarer([enc('2026-08-01')], 'mensuel', [], AUJOURDHUI)[0]?.libelle)
      .toBe('août 2026');
    expect(periodesADeclarer([enc('2026-08-01')], 'trimestriel', [], AUJOURDHUI)[0]?.libelle)
      .toBe('T3 2026');
  });
});
