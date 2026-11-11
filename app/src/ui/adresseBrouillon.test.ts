import { describe, expect, it } from 'vitest';
import { mois } from '../domain/types';
import { brouillonDeLaSousRoute, sousRouteDuBrouillon } from './adresseBrouillon';
import { resoudreRoute } from './navigation';

describe('l’adresse d’un brouillon', () => {
  it('fait l’aller-retour, accents et apostrophes compris', () => {
    const d = { mois: mois('2026-08'), clientNom: 'Brasserie Vent d’Ouest' };
    expect(brouillonDeLaSousRoute(sousRouteDuBrouillon(d))).toEqual(d);
  });

  /** Le routeur découpe l'adresse aux « / » : un nom de client qui en porte un ne doit pas la casser. */
  it('survit au routeur, même avec un « / » dans le nom du client', () => {
    const d = { mois: mois('2026-08'), clientNom: 'Studio A/B' };
    const route = resoudreRoute(`#/facture/${sousRouteDuBrouillon(d)}`);
    expect(brouillonDeLaSousRoute(route.sousRoute)).toEqual(d);
  });

  it('ne désigne rien hors de sa forme', () => {
    expect(brouillonDeLaSousRoute('nouvelle')).toBeNull();
    expect(brouillonDeLaSousRoute('2026-001')).toBeNull();
    expect(brouillonDeLaSousRoute('brouillon:août:Client')).toBeNull();
    expect(brouillonDeLaSousRoute('brouillon:2026-08:%E0%A4')).toBeNull();
  });
});
