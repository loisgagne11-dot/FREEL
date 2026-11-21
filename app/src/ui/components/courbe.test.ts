import { describe, expect, it } from 'vitest';
import { cheminMonotone } from './courbe';

/** Les points de contrôle d'un chemin `M…C…`, par segment. */
function segments(d: string): { y0: number; c1: number; c2: number; y1: number }[] {
  const nombres = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const resultat = [];
  let y0 = nombres[1] as number;
  for (let i = 2; i + 5 < nombres.length + 1; i += 6) {
    const c1 = nombres[i + 1] as number;
    const c2 = nombres[i + 3] as number;
    const y1 = nombres[i + 5] as number;
    resultat.push({ y0, c1, c2, y1 });
    y0 = y1;
  }
  return resultat;
}

/**
 * La courbe ne dépasse jamais ses points : une occupation de 0 % puis 90 %
 * dessinée avec un creux sous zéro inventerait un mois qui n'a pas existé
 * (`DIRECTION-VISUELLE.md`, « Graphiques »).
 */
describe('la courbe lissée', () => {
  it('ne sort jamais, entre deux points, de l’intervalle qu’ils forment', () => {
    const series = [
      [30, 30, 6, 6, 30, 18],
      [6, 30, 6, 30, 6, 30],
      [25, 24, 18, 30, 29, 16, 13, 12, 11, 7, 6, 6]
    ];
    for (const ys of series) {
      const d = cheminMonotone(ys.map((y, i) => ({ x: 4 + i * 10, y })));
      for (const s of segments(d)) {
        const bas = Math.min(s.y0, s.y1) - 0.05;
        const haut = Math.max(s.y0, s.y1) + 0.05;
        expect(s.c1).toBeGreaterThanOrEqual(bas);
        expect(s.c1).toBeLessThanOrEqual(haut);
        expect(s.c2).toBeGreaterThanOrEqual(bas);
        expect(s.c2).toBeLessThanOrEqual(haut);
      }
    }
  });

  it('passe par chaque point', () => {
    const d = cheminMonotone([{ x: 0, y: 10 }, { x: 10, y: 20 }, { x: 20, y: 5 }]);
    expect(d.startsWith('M0,10')).toBe(true);
    expect(d).toContain(' 10,20C');
    expect(d.endsWith(' 20,5')).toBe(true);
  });

  it('rend un point seul, et rien sans point', () => {
    expect(cheminMonotone([{ x: 4, y: 6 }])).toBe('M4,6');
    expect(cheminMonotone([])).toBe('');
  });
});
