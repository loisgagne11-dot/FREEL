import { describe, expect, it } from 'vitest';
import { dateISO } from '../types';
import { REPETITIONS_MAX, datesRepetees } from './echeancier';

describe('répétition d’une échéance', () => {
  it('rend la première date même sans répétition', () => {
    expect(datesRepetees(dateISO('2026-09-05'), 'mensuelle', 1)).toEqual(['2026-09-05']);
  });

  it('espace d’un mois une cadence mensuelle', () => {
    expect(datesRepetees(dateISO('2026-09-05'), 'mensuelle', 3))
      .toEqual(['2026-09-05', '2026-10-05', '2026-11-05']);
  });

  it('espace de trois mois une cadence trimestrielle', () => {
    expect(datesRepetees(dateISO('2026-02-15'), 'trimestrielle', 4))
      .toEqual(['2026-02-15', '2026-05-15', '2026-08-15', '2026-11-15']);
  });

  it('franchit l’année', () => {
    expect(datesRepetees(dateISO('2026-11-20'), 'trimestrielle', 2))
      .toEqual(['2026-11-20', '2027-02-20']);
  });

  /**
   * LE PIÈGE. Ajouter un mois au 31 janvier donne le 31 février, que `Date`
   * interprète comme le 3 mars : l'échéance sauterait un mois, en silence.
   */
  it('ramène au dernier jour du mois quand le quantième n’existe pas', () => {
    expect(datesRepetees(dateISO('2026-01-31'), 'mensuelle', 3))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('tient compte des années bissextiles', () => {
    // 2028 est bissextile.
    expect(datesRepetees(dateISO('2028-01-30'), 'mensuelle', 2))
      .toEqual(['2028-01-30', '2028-02-29']);
  });

  /**
   * Le quantième d'origine est conservé pour les mois qui l'acceptent. Le
   * raboter une fois pour toutes ferait finir au 28 une série partie du 31.
   */
  it('ne rabote pas la série entière au mois le plus court', () => {
    const dates = datesRepetees(dateISO('2026-01-31'), 'mensuelle', 4);
    expect(dates[3]).toBe('2026-04-30');
  });

  it('borne le nombre d’occurrences', () => {
    expect(datesRepetees(dateISO('2026-01-05'), 'mensuelle', 99))
      .toHaveLength(REPETITIONS_MAX);
  });

  it('rend au moins une date, même pour un nombre absurde', () => {
    expect(datesRepetees(dateISO('2026-01-05'), 'mensuelle', 0)).toHaveLength(1);
    expect(datesRepetees(dateISO('2026-01-05'), 'mensuelle', -3)).toHaveLength(1);
  });

  it('n’invente rien à partir d’une date illisible', () => {
    expect(datesRepetees('pas une date' as never, 'mensuelle', 3)).toHaveLength(1);
  });
});
