import { describe, expect, it } from 'vitest';
import { dateISO } from '../types';
import { anneeDOptionVl, plafondRfrVersementLiberatoire } from './plafondVl';

const montant = (annee: number, parts: number | null = 1): number | null => {
  const r = plafondRfrVersementLiberatoire(annee, parts);
  return r.statut === 'refuse' ? null : r.valeur;
};

/*
 * CGI art. 151-0 : le revenu fiscal de référence de Y−2, pour une part, ne
 * dépasse pas la limite haute de la deuxième tranche du barème des revenus de
 * Y−2. Lu sur le barème d'un an trop tôt ou trop tard, le plafond de 2026
 * vaudrait 29 579 € au lieu de 29 315 € : 264 € de marge qui n'existent pas,
 * et une option prise à tort qui se paie d'un rappel.
 */
describe('plafond de revenu fiscal de référence du versement libératoire', () => {
  it('vaut 29 315 € par part pour opter en 2026 (barème des revenus 2024)', () => {
    expect(montant(2026)).toBe(29315);
  });

  it('vaut 29 579 € par part pour opter en 2027 (barème des revenus 2025)', () => {
    expect(montant(2027)).toBe(29579);
  });

  // Majoré de 50 % par demi-part, 25 % par quart : la limite fois les parts.
  it('se multiplie par le nombre de parts : 2,5 parts, 2,5 fois la limite', () => {
    expect(montant(2026, 2.5)).toBe(73287.5);
    expect(montant(2027, 1.25)).toBe(36973.75);
  });

  // Parts inconnues : le plafond d'une part, que l'écran dit tel.
  it('rend le plafond d’une part quand les parts ne sont pas connues', () => {
    expect(montant(2027, null)).toBe(29579);
  });

  /* Le barème des revenus 2026 n'est pas dans l'application : reconduire
     celui de 2025, comme le fait une provision, ferait dire un droit d'opter
     sur un nombre qui n'a pas été publié. */
  it('refuse une année dont le barème manque, avec son motif et sans montant', () => {
    for (const annee of [2028, 2025]) {
      const r = plafondRfrVersementLiberatoire(annee, 1);
      expect(r.statut).toBe('refuse');
      expect(r.statut === 'refuse' && r.motif).toContain(`revenus ${annee - 2}`);
      expect('valeur' in r).toBe(false);
    }
  });

  it('dit sa source : l’article et le barème lu', () => {
    const r = plafondRfrVersementLiberatoire(2026, 1);
    expect(r.statut !== 'refuse' && r.source).toMatch(/151-0.*revenus 2024/);
  });
});

/*
 * L'option vaut au 1er janvier suivant, sauf à la création : jusqu'au dernier
 * jour du troisième mois qui suit, elle vaut dès le début. Annoncer à qui crée
 * en février le plafond de l'an prochain lui ferait vérifier le mauvais revenu.
 */
describe('année pour laquelle l’option vaudrait', () => {
  it('est l’année suivante pour une activité installée', () => {
    expect(anneeDOptionVl(dateISO('2026-08-13'), dateISO('2025-03-01'))).toBe(2027);
    expect(anneeDOptionVl(dateISO('2026-08-13'), null)).toBe(2027);
  });

  it('est l’année du début jusqu’au dernier jour du troisième mois qui suit', () => {
    expect(anneeDOptionVl(dateISO('2026-05-31'), dateISO('2026-02-10'))).toBe(2026);
    expect(anneeDOptionVl(dateISO('2026-06-01'), dateISO('2026-02-10'))).toBe(2027);
  });

  it('passe d’une année à l’autre pour un début en novembre', () => {
    expect(anneeDOptionVl(dateISO('2027-02-28'), dateISO('2026-11-15'))).toBe(2026);
    expect(anneeDOptionVl(dateISO('2027-03-01'), dateISO('2026-11-15'))).toBe(2028);
  });
});
