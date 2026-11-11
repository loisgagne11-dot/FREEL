import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import type { Echeance } from '../domain/calculs/provisions';
import { faitsVides } from './schema';
import { echeancesAPayer, etatPilote, fluxDuMois } from './selecteurs';

/*
 * Les échéances à payer : une seule liste, lue par la colonne Sorties du flux
 * et par le panneau qui pointe un paiement. Le 10 juin 2026. Valeurs fictives.
 */
const AUJOURDHUI = dateISO('2026-06-10');

const ech = (id: string, le: string, montant = 500, payeeLe: string | null = null): Echeance => ({
  id, nature: 'urssaf', montant: euros(montant), echeanceLe: dateISO(le),
  payeeLe: payeeLe === null ? null : dateISO(payeeLe), montantPaye: null
});

describe('les échéances à payer', () => {
  it('met les retards en tête, garde le mois, et met le reste à part', () => {
    const { maintenant, plusTard } = echeancesAPayer([
      ech('juillet', '2026-07-05'),
      ech('juin', '2026-06-30'),
      ech('mai', '2026-05-05'),
      ech('payee', '2026-06-05', 500, '2026-06-05'),
      ech('aujourdhui', '2026-06-10')
    ], AUJOURDHUI);

    expect(maintenant.map((e) => e.id)).toEqual(['mai', 'aujourdhui', 'juin']);
    // Le jour même, une échéance n'est pas encore en retard.
    expect(maintenant.map((e) => e.enRetard)).toEqual([true, false, false]);
    expect(plusTard.map((e) => e.id)).toEqual(['juillet']);
  });
});

/**
 * Un appel de mai resté impayé disparaissait de la colonne Sorties le 1ᵉʳ juin,
 * alors que le total — tiré des provisions — le comptait toujours.
 */
describe('la colonne Sorties du flux', () => {
  it('garde l’échéance du mois dernier restée impayée, en retard', () => {
    const echeances = [ech('mai', '2026-05-05', 800), ech('juin-payee', '2026-06-05', 300, '2026-06-04')];
    const f = { ...faitsVides(), echeances };
    const flux = fluxDuMois(f, mois('2026-06'), etatPilote(f), echeances, AUJOURDHUI);

    expect(flux.sorties.lignes.map((l) => [l.id, l.regle, l.enRetard ?? false]))
      .toEqual([['juin-payee', true, false], ['mai', false, true]]);
  });
});
