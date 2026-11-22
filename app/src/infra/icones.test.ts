import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Le logo (22/11, piste 1) tient par trois fils : l'onglet, l'écran d'accueil
 * iOS, le manifeste. Qu'un seul lâche et rien ne casse à l'écran — l'onglet
 * retombe sur l'icône générique, le raccourci téléphone sur une capture de
 * la page — donc rien ne le signalerait sans ce test.
 */
const racine = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', racine), 'utf8');
const dansPublic = (chemin: string) => new URL(`public/${chemin.replace(/^\.\//, '')}`, racine);

function lien(rel: string): string | undefined {
  return new RegExp(`<link rel="${rel}"[^>]*href="([^"]+)"`).exec(html)?.[1];
}

describe('icônes et manifeste déclarés par index.html', () => {
  it.each([
    ['icon', 'favicon.svg'],
    ['apple-touch-icon', 'icone-180.png'],
    ['manifest', 'manifest.webmanifest']
  ])('déclare %s vers un fichier présent dans public/', (rel, attendu) => {
    const href = lien(rel);
    expect(href, `<link rel="${rel}"> manque`).toBeDefined();
    expect(href).toContain(attendu);
    expect(existsSync(dansPublic(href!))).toBe(true);
  });

  /**
   * Un « / » de tête viserait la racine du domaine : sous GitHub Pages le site
   * vit dans un sous-chemin, et l'icône y serait introuvable — en local, où le
   * site est à la racine, tout aurait l'air de marcher.
   */
  it('n’emploie que des chemins relatifs', () => {
    for (const rel of ['icon', 'apple-touch-icon', 'manifest']) {
      expect(lien(rel)).not.toMatch(/^\//);
    }
  });

  it('pose la couleur de barre et le nom sur l’écran d’accueil iOS', () => {
    expect(html).toContain('<meta name="theme-color" content="#090c0a" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Freel" />');
  });
});

describe('manifeste', () => {
  const manifeste = JSON.parse(readFileSync(dansPublic('manifest.webmanifest'), 'utf8')) as {
    name: string;
    short_name: string;
    start_url: string;
    scope: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };

  it('nomme « Freel » et reste dans son sous-chemin', () => {
    expect(manifeste.name).toBe('Freel');
    expect(manifeste.short_name).toBe('Freel');
    expect(manifeste.start_url).toBe('./');
    expect(manifeste.scope).toBe('./');
  });

  /**
   * L'icône masquable est la variante PLEINE : Android la découpe à sa forme,
   * des coins transparents y laisseraient voir le fond du lanceur.
   */
  it('porte ses trois icônes, dont une masquable, toutes présentes', () => {
    expect(manifeste.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable'
    ]);
    expect(manifeste.icons[2]?.src).toBe('icone-masquable-512.png');
    for (const icone of manifeste.icons) {
      expect(icone.src).not.toMatch(/^\//);
      expect(existsSync(dansPublic(icone.src)), icone.src).toBe(true);
    }
  });
});
