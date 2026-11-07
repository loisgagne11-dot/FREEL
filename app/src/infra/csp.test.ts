import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('politique de sécurité du contenu de index.html', () => {
  const politique = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? '';

  // Une empreinte périmée bloque le script du thème : l'application s'afficherait
  // sans thème, et le mode confidentiel ne serait pas posé avant le premier rendu.
  it('porte l’empreinte exacte de chaque script en ligne', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '');
    expect(scripts.length).toBeGreaterThan(0);
    for (const contenu of scripts) {
      const empreinte = createHash('sha256').update(contenu).digest('base64');
      expect(politique).toContain(`'sha256-${empreinte}'`);
    }
  });

  it('interdit les objets, fige la base et exclut unsafe-inline des scripts', () => {
    expect(politique).toContain("object-src 'none'");
    expect(politique).toContain("base-uri 'self'");
    const scriptSrc = /script-src ([^;]+)/.exec(politique)?.[1] ?? '';
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('ne laisse sortir les requêtes que vers le même domaine et Supabase en https', () => {
    const connect = /connect-src ([^;]+)/.exec(politique)?.[1] ?? '';
    expect(connect.split(' ').sort()).toEqual(["'self'", 'https://*.supabase.co']);
  });
});
