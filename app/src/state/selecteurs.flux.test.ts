import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import type { Echeance } from '../domain/calculs/provisions';
import { type Faits, type Recette, faitsVides } from './schema';
import { fluxDUnAutreMois } from './selecteurs.flux';

const AUJOURDHUI = dateISO('2026-06-10');

function recette(m: Partial<Recette> = {}): Recette {
  return {
    id: 'r', clientNom: 'Client démo', libelle: 'Prestation', montant: euros(1000),
    emiseLe: dateISO('2026-04-02'), encaisseeLe: dateISO('2026-05-12'),
    modeReglement: 'virement', numero: '2026-001', echeanceLe: dateISO('2026-05-02'), ...m
  };
}

const echeance = (id: string, le: string, montant: number, payeeLe: string | null): Echeance => ({
  id, nature: 'urssaf', montant: euros(montant), echeanceLe: dateISO(le),
  payeeLe: payeeLe === null ? null : dateISO(payeeLe), montantPaye: null
});

function faits(modif: Partial<Faits> = {}): Faits {
  return { ...faitsVides(), ...modif };
}

/**
 * UN MOIS PASSÉ SE LIT EN CONSTAT.
 *
 * Ce qui est rentré, ce qui est sorti, ce qu'on s'est versé — jamais le
 * versable du jour, qu'on ne pouvait pas se verser en mai.
 */
describe('le flux d’un mois passé', () => {
  it('compte l’encaissé du mois, et ce qui y était attendu et ne l’est toujours pas', () => {
    const f = fluxDUnAutreMois(faits({
      recettes: [
        recette({ id: 'payee' }),
        recette({ id: 'impayee', encaisseeLe: null, echeanceLe: dateISO('2026-05-20'), montant: euros(400) }),
        recette({ id: 'juin', encaisseeLe: dateISO('2026-06-02'), montant: euros(9000) })
      ]
    }), mois('2026-05'), AUJOURDHUI);

    expect(f.temps).toBe('passe');
    expect(f.entrees.encaisse).toBe(1000);
    expect(f.entrees.attendu).toBe(400);
    expect(f.entrees.lignes.find((l) => l.id === 'impayee')?.enRetard).toBe(true);
    expect(f.entrees.lignes.map((l) => l.id)).not.toContain('juin');
  });

  it('additionne les échéances du mois, payées et impayées, et marque les impayées en retard', () => {
    const f = fluxDUnAutreMois(faits({
      echeances: [
        echeance('payee', '2026-05-05', 300, '2026-05-04'),
        echeance('oubliee', '2026-05-31', 200, null),
        echeance('juin', '2026-06-30', 999, null)
      ]
    }), mois('2026-05'), AUJOURDHUI);

    expect(f.sorties.total).toBe(500);
    expect(f.sorties.regle).toBe(300);
    expect(f.sorties.lignes.find((l) => l.id === 'oubliee')?.enRetard).toBe(true);
  });

  /**
   * « 0 € versé » dirait qu'on ne s'est rien versé, ce que personne ne sait
   * sans relevé.
   */
  it('lit le versé sur le relevé, et s’abstient sans relevé', () => {
    expect(fluxDUnAutreMois(faits(), mois('2026-05'), AUJOURDHUI).verse).toBeNull();

    const avecReleve = faits({
      mouvementsBancaires: [{
        id: 'mv', date: dateISO('2026-05-06'), libelle: 'Virement à soi', montant: euros(-1800),
        rapprocheAvec: null, sansContrepartie: 'remuneration', ignoree: false
      }]
    });
    expect(fluxDUnAutreMois(avecReleve, mois('2026-05'), AUJOURDHUI).verse).toBe(1800);
  });
});

/**
 * UN MOIS À VENIR SE LIT EN ÉCHÉANCES.
 *
 * Rien n'y est encore encaissé : ce qui compte, c'est ce qui est attendu, et
 * ce qui sera dû.
 */
describe('le flux d’un mois à venir', () => {
  it('attend les factures dont l’échéance tombe dans le mois, sans les dire en retard', () => {
    const f = fluxDUnAutreMois(faits({
      recettes: [recette({
        id: 'attendue', emiseLe: dateISO('2026-06-01'), encaisseeLe: null,
        echeanceLe: dateISO('2026-07-01'), montant: euros(2500)
      })],
      echeances: [echeance('urssaf', '2026-07-31', 600, null)]
    }), mois('2026-07'), AUJOURDHUI);

    expect(f.temps).toBe('futur');
    expect(f.entrees.encaisse).toBe(0);
    expect(f.entrees.attendu).toBe(2500);
    expect(f.entrees.lignes[0]?.enRetard).toBe(false);
    expect(f.sorties.total).toBe(600);
    expect(f.sorties.lignes[0]?.enRetard).toBe(false);
    expect(f.verse).toBeNull();
  });
});
