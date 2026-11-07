import { describe, expect, it } from 'vitest';
import type { Mois } from '../types';
import { dateLimiteDeclaration, periodesADeclarer } from './declarations';

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

/**
 * UNE PÉRIODE CLOSE SE DÉCLARE, MÊME SANS RECETTE.
 *
 * Si la règle sautait, l'échéancier ne montrerait que les périodes portant un
 * encaissement, alors que le Pilote — et l'URSSAF — réclament aussi les
 * déclarations à zéro. Le bouton « Déclarer » du Pilote menait ainsi à un
 * écran où la période réclamée n'existait pas : l'alerte ne s'éteignait
 * jamais.
 */
describe('déclarations à zéro', () => {
  const encaissements = [{ encaisseeLe: '2026-05-12', montant: 4000 }];

  it('rend les périodes closes sans recette depuis le début d’activité', () => {
    const p = periodesADeclarer(encaissements, 'trimestriel', [], '2026-08-15', '2026-01' as Mois);
    const t1 = p.find((x) => x.id === '2026-T1');
    expect(t1?.encaisse).toBe(0);
    expect(t1?.close).toBe(true);
    expect(p.find((x) => x.id === '2026-T2')?.encaisse).toBe(4000);
  });

  // Une période en cours sans recette n'a encore rien à dire.
  it('ne rend pas la période en cours tant qu’elle est vide', () => {
    const p = periodesADeclarer(encaissements, 'trimestriel', [], '2026-08-15', '2026-01' as Mois);
    expect(p.some((x) => x.id === '2026-T3')).toBe(false);
  });

  it('ne remonte pas avant le début d’activité', () => {
    const p = periodesADeclarer(encaissements, 'mensuel', [], '2026-08-15', '2026-04' as Mois);
    expect(p.some((x) => x.id < '2026-04')).toBe(false);
    expect(p.map((x) => x.id)).toContain('2026-04');
  });
});

/**
 * LA DATE LIMITE : LE DERNIER JOUR DU MOIS SUIVANT.
 *
 * Par le calendrier, pas par « + 1 mois » : le 31 janvier + 1 mois n'existe
 * pas, et février change de longueur.
 */
describe('date limite de déclaration', () => {
  it.each([
    ['2026-03', '2026-04-30'], // T1
    ['2026-06', '2026-07-31'], // T2
    ['2026-09', '2026-10-31'], // T3
    ['2026-12', '2027-01-31'], // T4 : l'année change
    ['2027-01', '2027-02-28'], // mensuel, février
    ['2028-01', '2028-02-29'] // année bissextile
  ])('%s se déclare jusqu’au %s', (m, limite) => {
    expect(dateLimiteDeclaration(m as Mois)).toBe(limite);
  });

  it('porte la limite sur chaque période, au dernier mois couvert', () => {
    const [t2] = periodesADeclarer(
      [{ encaisseeLe: '2026-05-10', montant: 100 }], 'trimestriel', [], '2026-07-15'
    );
    expect(t2?.limite).toBe('2026-07-31');
  });
});

