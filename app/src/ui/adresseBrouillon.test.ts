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

  /**
   * Par client, deux brouillons peuvent partir au même payeur (lot 31) : sans
   * la clé, l'éditeur rouvrirait le premier des deux, et la facture de l'un
   * porterait le volume de l'autre.
   */
  it('porte la clé du brouillon quand le nom du payeur ne suffit pas', () => {
    const d = { mois: mois('2026-08'), clientNom: 'Agence fictive', cle: 'Agence fictive·mis-1·co-2' };
    expect(brouillonDeLaSousRoute(sousRouteDuBrouillon(d))).toEqual(d);
  });

  it('écrit les adresses d’avant quand la clé est le nom, et les relit', () => {
    const d = { mois: mois('2026-08'), clientNom: 'Agence fictive', cle: 'Agence fictive' };
    expect(sousRouteDuBrouillon(d)).toBe('brouillon:2026-08:Agence%20fictive');
    expect(brouillonDeLaSousRoute('brouillon:2026-08:Agence%20fictive'))
      .toEqual({ mois: '2026-08', clientNom: 'Agence fictive' });
  });

  it('ne désigne rien hors de sa forme', () => {
    expect(brouillonDeLaSousRoute('nouvelle')).toBeNull();
    expect(brouillonDeLaSousRoute('2026-001')).toBeNull();
    expect(brouillonDeLaSousRoute('brouillon:août:Client')).toBeNull();
    expect(brouillonDeLaSousRoute('brouillon:2026-08:%E0%A4')).toBeNull();
  });
});
