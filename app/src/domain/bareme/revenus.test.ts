import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import { casesDeclarationRevenus, limiteDeclarationRevenus, zoneDeDeclaration } from './revenus';

/**
 * LA DATE DE LA DÉCLARATION DE REVENUS : PUBLIÉE PAR ZONE, ANNÉE PAR ANNÉE.
 */
describe('limite de la déclaration de revenus', () => {
  it('rend les trois dates publiées de 2026, par département', () => {
    const date = (cp: string) => {
      const r = limiteDeclarationRevenus(2026, cp).limite;
      return r.statut === 'refuse' ? r.motif : r.valeur;
    };
    expect(date('13001')).toBe('2026-05-21');
    expect(date('33000')).toBe('2026-05-28');
    expect(date('75010')).toBe('2026-06-04');
    expect(date('97400')).toBe('2026-06-04');
  });

  /*
   * C'est le domicile au 1ᵉʳ janvier qui fait foi ; l'application ne connaît
   * que l'adresse de l'entreprise. Même publiée, la date est une hypothèse,
   * et la source le dit.
   */
  it('dit que l’adresse de l’entreprise remplace celle du domicile', () => {
    const r = limiteDeclarationRevenus(2026, '33000').limite;
    expect(r.statut).toBe('hypothese');
    expect(r.statut === 'hypothese' ? r.source : '').toMatch(/domicile au 1ᵉʳ janvier qui fait foi/);
  });

  /*
   * Pour une année non publiée, aucun jour n'est avancé — ni à l'écran ni
   * dans le calendrier : un jour inventé serait indiscernable d'un vrai.
   */
  it('n’invente aucun jour pour une année non publiée, mais garde le mois', () => {
    const r = limiteDeclarationRevenus(2027, '33000');
    expect(r.limite.statut).toBe('refuse');
    expect(r.limite.statut === 'refuse' ? r.limite.motif : '').toMatch(/fin mai ou début juin/i);
    expect(r.mois).toBe('2027-05');
  });

  it('ne choisit pas de zone sans code postal', () => {
    expect(zoneDeDeclaration('')).toBeNull();
    expect(limiteDeclarationRevenus(2026, '').limite.statut).toBe('refuse');
  });
});

/**
 * LES CASES DE LA 2042-C-PRO.
 *
 * 5TE avec le versement libératoire, 5HQ sans — BNC professionnels. Le
 * montant est HORS TAXES, encaissé dans l'année, et RIEN n'en est déduit :
 * l'abattement de 34 % est fait par l'administration.
 */
describe('cases de la déclaration de revenus', () => {
  const recettes = [
    { encaisseeLe: dateISO('2025-03-10'), montant: euros(4000) },
    { encaisseeLe: dateISO('2025-09-10'), montant: euros(6000) },
    // Un avoir réduit les recettes de l'année où il est encaissé.
    { encaisseeLe: dateISO('2025-10-02'), montant: euros(-500) },
    { encaisseeLe: dateISO('2026-01-05'), montant: euros(9999) }
  ];

  it('porte tout en 5HQ sans versement libératoire, sans rien déduire', () => {
    expect(casesDeclarationRevenus(recettes, 2025, () => false)).toEqual({ '5TE': 0, '5HQ': 9500 });
  });

  it('porte tout en 5TE avec le versement libératoire', () => {
    expect(casesDeclarationRevenus(recettes, 2025, () => true)).toEqual({ '5TE': 9500, '5HQ': 0 });
  });

  // Une option prise en cours d'année partage les recettes à leur date.
  it('partage entre 5HQ et 5TE quand le versement libératoire commence dans l’année', () => {
    const depuisJuillet = (d: string) => d >= '2025-07-01';
    expect(casesDeclarationRevenus(recettes, 2025, depuisJuillet)).toEqual({ '5TE': 5500, '5HQ': 4000 });
  });
});
