import { describe, expect, it } from 'vitest';
import { joursEntre } from './dates';
import { type DateISO, dateISO } from './types';

const d = dateISO;

describe('joursEntre : une seule définition du nombre de jours', () => {
  // Le sens est le contrat : chaque appelant en déduit « en retard » ou « à
  // venir ». S'il s'inversait, tous les retards deviendraient des échéances.
  it('est positif quand la seconde date est postérieure, négatif sinon', () => {
    expect(joursEntre(d('2026-06-30'), d('2026-07-15'))).toBe(15);
    expect(joursEntre(d('2026-07-15'), d('2026-06-30'))).toBe(-15);
    expect(joursEntre(d('2026-07-15'), d('2026-07-15'))).toBe(0);
  });

  // Le jour du passage à l'heure d'été fait 23 h en local : une division
  // tronquée rendrait 0 pour un retard d'un jour. Les dates de bascule 2026 à
  // Paris sont le 29 mars et le 25 octobre.
  it('compte un jour plein au passage à l\'heure d\'été et d\'hiver', () => {
    expect(joursEntre(d('2026-03-28'), d('2026-03-29'))).toBe(1);
    expect(joursEntre(d('2026-03-29'), d('2026-03-30'))).toBe(1);
    expect(joursEntre(d('2026-10-24'), d('2026-10-25'))).toBe(1);
    expect(joursEntre(d('2026-10-25'), d('2026-10-26'))).toBe(1);
    expect(joursEntre(d('2026-03-01'), d('2026-11-01'))).toBe(245);
  });

  it('franchit une fin de mois et une fin d\'année', () => {
    expect(joursEntre(d('2026-01-31'), d('2026-03-01'))).toBe(29);
    expect(joursEntre(d('2026-12-31'), d('2027-01-01'))).toBe(1);
  });

  // 2028 est bissextile, 2100 ne l'est pas : un calcul à 365 ou à 366 en dur
  // se tromperait d'un jour sur l'un des deux.
  it('compte le 29 février des années bissextiles, et seulement celles-là', () => {
    expect(joursEntre(d('2028-02-28'), d('2028-03-01'))).toBe(2);
    expect(joursEntre(d('2027-02-28'), d('2027-03-01'))).toBe(1);
    expect(joursEntre(d('2100-02-28'), d('2100-03-01'))).toBe(1);
    expect(joursEntre(d('2028-01-01'), d('2029-01-01'))).toBe(366);
  });

  // Rendre 0 ferait passer une échéance illisible pour « pas de retard ».
  it('rend NaN sur une date illisible, jamais zéro', () => {
    expect(joursEntre('pas-une-date' as DateISO, d('2026-03-01'))).toBeNaN();
  });
});
