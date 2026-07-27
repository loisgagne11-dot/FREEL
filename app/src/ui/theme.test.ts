import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from './theme';
import { CLE_STOCKAGE_THEME, appliquerTheme, lireTheme, themesDisponibles } from './theme';

/**
 * theme.ts touche `document`/`localStorage` directement, comme le fera le
 * script inline de index.html. L'environnement de test du projet est
 * `node` (vite.config.ts), sans DOM réel : on fournit ici de faux globals
 * minimaux plutôt que d'ajouter jsdom comme dépendance, pour ne modifier
 * aucun fichier hors du périmètre de cette tâche.
 */

class ElementRacineFactice {
  private readonly attributs = new Map<string, string>();

  setAttribute(nom: string, valeur: string): void {
    this.attributs.set(nom, valeur);
  }

  getAttribute(nom: string): string | null {
    return this.attributs.get(nom) ?? null;
  }
}

class StockageFactice {
  private readonly valeurs = new Map<string, string>();
  private enPanne = false;

  tomberEnPanne(): void {
    this.enPanne = true;
  }

  getItem(cle: string): string | null {
    if (this.enPanne) throw new Error('stockage indisponible');
    return this.valeurs.get(cle) ?? null;
  }

  setItem(cle: string, valeur: string): void {
    if (this.enPanne) throw new Error('stockage indisponible');
    this.valeurs.set(cle, valeur);
  }
}

let racine: ElementRacineFactice;
let stockage: StockageFactice;

beforeEach(() => {
  racine = new ElementRacineFactice();
  stockage = new StockageFactice();
  vi.stubGlobal('document', { documentElement: racine });
  vi.stubGlobal('localStorage', stockage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lireTheme', () => {
  it("retombe sur 'sombre' quand rien n'est stocké", () => {
    expect(lireTheme()).toBe('sombre');
  });

  it("retombe sur 'sombre' pour une valeur inconnue en stockage", () => {
    stockage.setItem(CLE_STOCKAGE_THEME, 'psychedelique');
    expect(lireTheme()).toBe('sombre');
  });

  it('reconnaît chacun des 4 thèmes stockés', () => {
    const themes: readonly Theme[] = ['sombre', 'nuit', 'clair', 'calme'];
    for (const theme of themes) {
      stockage.setItem(CLE_STOCKAGE_THEME, theme);
      expect(lireTheme()).toBe(theme);
    }
  });

  it('ne lève jamais si le stockage lève une exception', () => {
    stockage.tomberEnPanne();
    expect(() => lireTheme()).not.toThrow();
    expect(lireTheme()).toBe('sombre');
  });
});

describe('appliquerTheme', () => {
  it('pose data-theme sur <html>', () => {
    appliquerTheme('clair');
    expect(racine.getAttribute('data-theme')).toBe('clair');
  });

  it('persiste le choix sous la clé exacte du design', () => {
    appliquerTheme('nuit');
    expect(stockage.getItem(CLE_STOCKAGE_THEME)).toBe('nuit');
  });

  it("n'échoue pas si la persistance est impossible, et pose quand même l'attribut", () => {
    stockage.tomberEnPanne();
    expect(() => appliquerTheme('calme')).not.toThrow();
    expect(racine.getAttribute('data-theme')).toBe('calme');
  });
});

describe('themesDisponibles', () => {
  it('propose exactement les 4 thèmes avec un libellé non vide', () => {
    expect(themesDisponibles).toHaveLength(4);
    for (const theme of themesDisponibles) {
      expect(theme.libelle.trim().length).toBeGreaterThan(0);
    }
  });
});
