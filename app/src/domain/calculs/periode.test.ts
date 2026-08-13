import { describe, expect, it } from 'vitest';
import { dateISO } from '../types';
import { dansLaPeriode, moisDeLaPeriode, periodeCourante } from './periode';

const LE = (s: string) => new Date(`${s}T12:00:00Z`);

describe('période courante', () => {
  it('borne le mois du premier au dernier jour', () => {
    const p = periodeCourante('mois', LE('2026-08-13'));
    expect(p).toMatchObject({ du: '2026-08-01', au: '2026-08-31', libelle: 'Août 2026' });
  });

  // Février 2028 compte 29 jours : une borne à 28 amputerait la période d'un
  // jour, et les dépenses de ce jour-là disparaîtraient de l'écran.
  it('tient compte des années bissextiles', () => {
    expect(periodeCourante('mois', LE('2028-02-10')).au).toBe('2028-02-29');
  });

  it('borne le trimestre sur ses trois mois', () => {
    const p = periodeCourante('trimestre', LE('2026-08-13'));
    expect(p).toMatchObject({ du: '2026-07-01', au: '2026-09-30', libelle: 'T3 2026' });
  });

  it('borne l’année civile', () => {
    const p = periodeCourante('annee', LE('2026-08-13'));
    expect(p).toMatchObject({ du: '2026-01-01', au: '2026-12-31', libelle: '2026' });
  });
});

describe('navigation entre périodes', () => {
  it('recule d’un mois en changeant d’année', () => {
    expect(periodeCourante('mois', LE('2026-01-15'), -1).libelle).toBe('Décembre 2025');
  });

  /**
   * Le point dur : reculer de trois trimestres depuis T1 2026 doit tomber sur
   * T2 2025. Une arithmétique qui traiterait l'année et le trimestre
   * séparément produirait un trimestre négatif, ou reboucherait sur la même
   * année.
   */
  it('recule de plusieurs trimestres à travers les années', () => {
    expect(periodeCourante('trimestre', LE('2026-02-10'), -3).libelle).toBe('T2 2025');
    expect(periodeCourante('trimestre', LE('2026-02-10'), -4).libelle).toBe('T1 2025');
    expect(periodeCourante('trimestre', LE('2026-11-10'), 1).libelle).toBe('T1 2027');
  });

  it('avance d’une année', () => {
    expect(periodeCourante('annee', LE('2026-08-13'), 1).libelle).toBe('2027');
  });

  // Naviguer dans un ensemble qui contient déjà tout ne mène nulle part.
  it('ignore le décalage sur « tout »', () => {
    expect(periodeCourante('tout', LE('2026-08-13'), -5)).toMatchObject({
      du: null, au: null, libelle: 'Tout'
    });
  });
});

describe('appartenance à une période', () => {
  const aout = periodeCourante('mois', LE('2026-08-13'));

  it('inclut les bornes', () => {
    expect(dansLaPeriode(dateISO('2026-08-01'), aout)).toBe(true);
    expect(dansLaPeriode(dateISO('2026-08-31'), aout)).toBe(true);
  });

  it('exclut ce qui est en dehors', () => {
    expect(dansLaPeriode(dateISO('2026-07-31'), aout)).toBe(false);
    expect(dansLaPeriode(dateISO('2026-09-01'), aout)).toBe(false);
  });

  /**
   * Une dépense sans date de paiement est un problème à traiter. La faire
   * disparaître de tous les écrans filtrés serait le meilleur moyen de ne
   * jamais la corriger — « Tout » reste l'endroit où on la retrouve.
   */
  it('écarte une date absente des périodes bornées, mais pas de « tout »', () => {
    expect(dansLaPeriode(null, aout)).toBe(false);
    expect(dansLaPeriode(null, periodeCourante('tout', LE('2026-08-13')))).toBe(true);
  });
});

describe('mois d’une période', () => {
  it('rend le mois quand la période en couvre exactement un', () => {
    expect(moisDeLaPeriode(periodeCourante('mois', LE('2026-08-13')))).toBe('2026-08');
  });

  it('ne rend rien pour un trimestre ou une année', () => {
    expect(moisDeLaPeriode(periodeCourante('trimestre', LE('2026-08-13')))).toBeNull();
    expect(moisDeLaPeriode(periodeCourante('annee', LE('2026-08-13')))).toBeNull();
  });
});
