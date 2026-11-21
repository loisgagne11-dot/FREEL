import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../types';
import { type SortieDeCharge, sortiesParMois, totalDesSorties } from './sortiesDeCharges';

const sortie = (le: string, montant: number): SortieDeCharge =>
  ({ nature: 'urssaf', le: dateISO(le), montant: euros(montant), origine: 'du' });
const horizon = [mois('2026-06'), mois('2026-07'), mois('2026-08')];

describe('les sorties de charges, mois par mois', () => {
  it('pose chaque sortie dans le mois de sa date', () => {
    const parMois = sortiesParMois([sortie('2026-07-31', 1_970), sortie('2026-06-30', 29)], horizon);
    expect(parMois.map(totalDesSorties)).toEqual([29, 1_970, 0]);
  });

  /*
   * Une échéance de mai non payée est due maintenant : la perdre la ferait
   * disparaître du solde prévu, comme si elle avait été réglée.
   */
  it('porte une sortie en retard sur le premier mois, sans la perdre', () => {
    expect(sortiesParMois([sortie('2026-05-05', 400)], horizon).map(totalDesSorties)).toEqual([400, 0, 0]);
  });

  /* Au-delà de l'horizon, elle reste dans le dû de la fin. */
  it('laisse hors de l’horizon ce qui tombe après', () => {
    expect(sortiesParMois([sortie('2027-09-25', 900)], horizon).map(totalDesSorties)).toEqual([0, 0, 0]);
  });
});
