import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from './theme';
import {
  CLE_STOCKAGE_THEME, THEME_PAR_DEFAUT, appliquerTheme, lireTheme, themesDisponibles
} from './theme';

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
  it("retombe sur 'calme' quand rien n'est stocké", () => {
    expect(lireTheme()).toBe('calme');
  });

  it("retombe sur 'calme' pour une valeur inconnue en stockage", () => {
    stockage.setItem(CLE_STOCKAGE_THEME, 'psychedelique');
    expect(lireTheme()).toBe('calme');
  });

  /**
   * Le défaut ne sert qu'à qui n'a rien choisi. Un utilisateur installé en
   * « sombre » qui se retrouverait en « calme » le lendemain de la décision 5
   * croirait que l'application a perdu ses réglages — et se demanderait quoi
   * d'autre elle a perdu.
   */
  it('garde le thème déjà mémorisé, même quand le défaut a changé', () => {
    stockage.setItem(CLE_STOCKAGE_THEME, 'sombre');
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
    expect(lireTheme()).toBe('calme');
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
      expect(theme.description.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * DÉCISION 7 (16/11) : « Nuit », plus « Calme sombre ».
   *
   * Deux mots dont l'un nomme un autre thème se lisaient comme une variante de
   * Calme, pas comme un thème à part. L'identifiant, lui, ne bouge pas : il
   * est mémorisé, et le renommer ferait retomber sur le défaut tous ceux qui
   * l'avaient choisi.
   */
  it('nomme « Nuit » le calme en sombre, sans changer ce qui est mémorisé', () => {
    expect(themesDisponibles.find((t) => t.id === 'nuit')?.libelle).toBe('Nuit');
    expect(themesDisponibles.map((t) => t.libelle)).not.toContain('Calme sombre');
  });

  /** L'ordre des Réglages est celui de la maquette : le défaut en tête. */
  it('ouvre la liste sur le thème par défaut', () => {
    expect(themesDisponibles.map((t) => t.libelle)).toEqual(['Calme', 'Nuit', 'Sombre', 'Clair']);
  });
});

/**
 * DÉCISION 5 (16/11) : CALME EST LE THÈME D'UN NOUVEL UTILISATEUR.
 *
 * Le défaut est écrit à trois endroits qui ne peuvent pas partager une
 * constante : ce module, le script en ligne de `index.html` (avant React) et le
 * repli de `tokens.css` (avant tout attribut). S'ils divergent, l'écran s'ouvre
 * dans un thème et bascule dans un autre au montage — ou, pire, s'ouvre en
 * sombre chez un nouvel utilisateur alors que tout le reste dit « calme ».
 */
describe('le thème par défaut est calme, partout où il se décide', () => {
  it('dans ce module', () => {
    expect(THEME_PAR_DEFAUT).toBe('calme');
  });

  it('dans le script en ligne de index.html, sur ses deux chemins', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const lu = /getItem\('freel-v111-theme'\)\s*\|\|\s*'(\w+)'/.exec(html)?.[1];
    const surPanne = /catch \(e\) \{\s*document\.documentElement\.setAttribute\('data-theme', '(\w+)'\)/
      .exec(html)?.[1];
    expect(lu).toBe(THEME_PAR_DEFAUT);
    expect(surPanne).toBe(THEME_PAR_DEFAUT);
  });

  it('dans le repli de tokens.css, et nulle part ailleurs', () => {
    const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const selecteurs = [...css.matchAll(/([^{}]+)\{/g)].map((m) => (m[1] ?? '').trim());
    const avecRepli = selecteurs.filter((s) => s.includes(':root') && s.includes('data-theme'));
    expect(avecRepli).toHaveLength(1);
    expect(avecRepli[0]).toContain(`[data-theme="${THEME_PAR_DEFAUT}"]`);
  });
});
