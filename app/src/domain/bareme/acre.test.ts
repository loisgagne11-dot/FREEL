import { describe, expect, it } from 'vitest';
import { mois } from '../types';
import { PERIODES_ACRE, dernierMoisAcre, moisSousAcre, verifierIntegriteAcre } from './acre';

/** Raccourci de lecture : le dernier mois couvert, ou null si la règle refuse. */
function fin(debut: string): string | null {
  const r = dernierMoisAcre(mois(debut));
  return r.statut === 'refuse' ? null : r.valeur;
}

describe('durée de l\'ACRE — règle trimestrielle datée', () => {
  // Le cas du propriétaire, constaté sur son compte : début au 01/02/2025,
  // ACRE appliquée jusqu'à décembre 2025 incluse, taux plein depuis janvier
  // 2026. C'est ce cas qui a infirmé les douze mois pleins de l'ancienne
  // implémentation, laquelle aurait exonéré janvier 2026 — un mois de trop,
  // c'est-à-dire la moitié des cotisations d'un mois non provisionnée.
  it('un début en février 2025 est couvert jusqu\'à décembre 2025, pas jusqu\'à janvier 2026', () => {
    expect(fin('2025-02')).toBe('2025-12');
    expect(moisSousAcre(mois('2025-02'), mois('2025-12'))).toBe(true);
    expect(moisSousAcre(mois('2025-02'), mois('2026-01'))).toBe(false);
  });

  // Le mois qui suit la fin doit repasser au taux plein : c'est la bascule
  // qui coûte cher si elle glisse, et le seul test qui la tienne.
  it('bascule au taux plein le mois suivant la fin, quel que soit le trimestre de début', () => {
    for (const [debut, dernier, premierPlein] of [
      ['2025-02', '2025-12', '2026-01'],
      ['2025-12', '2026-09', '2026-10'],
      ['2025-04', '2026-03', '2026-04']
    ] as const) {
      expect(fin(debut)).toBe(dernier);
      expect(moisSousAcre(mois(debut), mois(dernier))).toBe(true);
      expect(moisSousAcre(mois(debut), mois(premierPlein))).toBe(false);
    }
  });

  // Décembre est le cas extrême : le trimestre d'affiliation est presque
  // écoulé, l'exonération ne dure que dix mois. Une durée exprimée en mois
  // ne peut pas rendre cela, et c'est pourquoi la règle compte en trimestres.
  it('un début en décembre ne donne que dix mois, un début en janvier douze', () => {
    expect(fin('2025-12')).toBe('2026-09');
    expect(fin('2025-01')).toBe('2025-12');
  });

  it('aucun mois antérieur au début d\'activité n\'est couvert', () => {
    expect(moisSousAcre(mois('2025-02'), mois('2025-01'))).toBe(false);
  });

  // L'asymétrie du temps, comme partout dans le barème : une durée passée est
  // un fait, pas une extrapolation. Refuser vaut « taux plein » chez
  // l'appelant, donc le sens prudent.
  it('refuse un début d\'activité antérieur à la plus ancienne règle saisie', () => {
    expect(dernierMoisAcre(mois('2020-05')).statut).toBe('refuse');
    expect(moisSousAcre(mois('2020-05'), mois('2020-06'))).toBe(false);
  });

  it('chaque règle porte sa source et sa date de vérification', () => {
    for (const regle of PERIODES_ACRE) {
      expect(regle.source.length).toBeGreaterThan(0);
      expect(regle.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('la table est saine : pas de trou, pas de chevauchement, une seule période ouverte', () => {
    expect(verifierIntegriteAcre()).toEqual([]);
  });
});
