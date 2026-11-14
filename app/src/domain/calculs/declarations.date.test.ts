import { describe, expect, it } from 'vitest';
import { dateISO, mois } from '../types';
import { dateDeDeclaration } from './declarations';

/**
 * « Déclarée le … » ne s'affiche que si l'on sait. Un trimestre dont un seul
 * mois a été coché avant le schéma 21 n'a pas de date : en afficher une, ce
 * serait dater à la place de l'utilisateur un retard peut-être réel.
 */
describe('date de déclaration d’une période', () => {
  const le = (m: string, d: string | null) => ({ mois: mois(m), declareeLe: d === null ? null : dateISO(d) });

  it('la date commune des mois de la période', () => {
    expect(dateDeDeclaration([mois('2026-04'), mois('2026-05')],
      [le('2026-04', '2026-07-28'), le('2026-05', '2026-07-28')])).toBe('2026-07-28');
  });

  it('la plus tardive si les mois en portent plusieurs', () => {
    expect(dateDeDeclaration([mois('2026-04'), mois('2026-05')],
      [le('2026-04', '2026-08-02'), le('2026-05', '2026-07-28')])).toBe('2026-08-02');
  });

  it('inconnue dès qu’un seul mois l’est, ou manque', () => {
    expect(dateDeDeclaration([mois('2026-04'), mois('2026-05')],
      [le('2026-04', '2026-07-28'), le('2026-05', null)])).toBeNull();
    expect(dateDeDeclaration([mois('2026-04'), mois('2026-05')], [le('2026-04', '2026-07-28')])).toBeNull();
  });
});
