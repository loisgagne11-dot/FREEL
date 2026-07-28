import { describe, expect, it } from 'vitest';
import { ECRANS, ID_ECRAN_PAR_DEFAUT, resoudreEcran } from './navigation';

describe('navigation — définition des écrans', () => {
  it('définit exactement les 6 écrans du produit', () => {
    expect(ECRANS).toHaveLength(6);
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
    expect(libelles).toEqual(['Pilote', 'Activité & congés', 'Argent', 'Achats', 'Outils', 'Config']);
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
