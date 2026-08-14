import { describe, expect, it } from 'vitest';
import { ECRANS, ID_ECRAN_PAR_DEFAUT, resoudreEcran, resoudreRoute } from './navigation';

describe('navigation — définition des écrans', () => {
  it('définit exactement les 7 écrans du produit', () => {
    expect(ECRANS).toHaveLength(7);
  });

  it('donne à chaque écran un identifiant unique', () => {
    const ids = ECRANS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('donne à chaque écran un libellé non vide', () => {
    for (const ecran of ECRANS) {
      expect(ecran.libelle.trim().length).toBeGreaterThan(0);
    }
  });

  it('donne à chaque écran un chemin de route unique', () => {
    const chemins = ECRANS.map((e) => e.chemin);
    expect(new Set(chemins).size).toBe(chemins.length);
  });

  it('donne à chaque écran une icône non vide', () => {
    for (const ecran of ECRANS) {
      expect(ecran.icone.trim().length).toBeGreaterThan(0);
    }
  });

  it("expose les libellés exacts attendus par la spec d'écrans", () => {
    const libelles = ECRANS.map((e) => e.libelle);
    expect(libelles).toEqual(['Pilote', 'Activité & congés', 'Argent', 'Facturer', 'Achats', 'Outils', 'Config']);
  });
});

describe('navigation — résolution du hash', () => {
  it('retombe sur Pilote quand le hash est vide', () => {
    expect(resoudreEcran('').id).toBe(ID_ECRAN_PAR_DEFAUT);
  });

  it('retombe sur Pilote quand le hash est inconnu', () => {
    expect(resoudreEcran('#/nimportequoi').id).toBe(ID_ECRAN_PAR_DEFAUT);
  });

  it('résout un hash connu vers le bon écran', () => {
    expect(resoudreEcran('#/argent').id).toBe('argent');
    expect(resoudreEcran('#/achats').id).toBe('achats');
  });

  it("ne fait jamais de correspondance par préfixe de texte — c'est le bug qu'on supprime", () => {
    // "#/pi" est un préfixe de "#/pilote" : une correspondance par préfixe le
    // résoudrait à tort vers Pilote. La comparaison doit être stricte.
    expect(resoudreEcran('#/pi').id).toBe(ID_ECRAN_PAR_DEFAUT);
  });
});

/**
 * LES SOUS-ROUTES EXISTENT POUR QUE LES ACTIONS RAPIDES SOIENT HONNÊTES.
 *
 * Une action « Nouvelle facture » qui dépose sur la liste des factures oblige à
 * chercher le bouton une deuxième fois. Elle doit ouvrir la rédaction.
 */
describe('navigation — sous-routes', () => {
  it('sépare l’écran de ce qui le suit', () => {
    const route = resoudreRoute('#/facture/nouvelle');
    expect(route.ecran.id).toBe('facture');
    expect(route.sousRoute).toBe('nouvelle');
  });

  it('rend une sous-route vide quand il n’y en a pas', () => {
    expect(resoudreRoute('#/facture').sousRoute).toBe('');
    expect(resoudreRoute('').sousRoute).toBe('');
  });

  // La barre oblique finale est une variante d'écriture, pas une sous-route.
  it('ne prend pas une barre oblique finale pour un segment', () => {
    expect(resoudreRoute('#/facture/').sousRoute).toBe('');
  });

  /**
   * Le découpage par segments ne doit pas rouvrir la porte au préfixe : un
   * écran inconnu reste inconnu, quelle que soit sa suite.
   */
  it('ignore la sous-route d’un écran inconnu', () => {
    const route = resoudreRoute('#/pi/nouvelle');
    expect(route.ecran.id).toBe(ID_ECRAN_PAR_DEFAUT);
    expect(route.sousRoute).toBe('');
  });
});
