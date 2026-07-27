import { describe, expect, it } from 'vitest';
import { mois, ratio, type TypeActivite } from '../types';
import {
  ABATTEMENT_ACRE, PERIODES_URSSAF, libelleHypothese, periodePour,
  tauxCotisations, verifierIntegrite
} from './urssaf';

/** Raccourci de lecture : le taux, ou null si le barème refuse. */
function taux(m: string, type: TypeActivite = 'BNC', acre = false): number | null {
  const r = tauxCotisations(mois(m), type, acre);
  return r.statut === 'refuse' ? null : r.valeur;
}

describe('barème URSSAF — résolution par période', () => {
  // Le cœur du sujet : le taux BNC change EN COURS D'ANNÉE, au 1er juillet
  // 2024 et au 1er juillet 2026. Ces cas verrouillent les bascules, mois
  // par mois, de part et d'autre de chaque frontière.
  const attendus: readonly [string, number, string][] = [
    ['2024-01', 0.211, 'début du 1er semestre 2024'],
    ['2024-06', 0.211, 'dernier mois avant la bascule de juillet 2024'],
    ['2024-07', 0.231, 'bascule du 1er juillet 2024'],
    ['2024-12', 0.231, 'fin du 2e semestre 2024'],
    ['2025-01', 0.246, '2025, taux unique sur l\'année'],
    ['2025-12', 0.246, 'fin 2025'],
    ['2026-01', 0.256, 'début du 1er semestre 2026'],
    ['2026-06', 0.256, 'dernier mois avant la bascule de juillet 2026'],
    ['2026-07', 0.261, 'bascule du 1er juillet 2026'],
    ['2026-12', 0.261, 'fin 2026']
  ];

  it.each(attendus)('%s → %d (%s)', (m, attendu) => {
    expect(taux(m)).toBe(attendu);
  });

  it('distingue les deux semestres 2026, ce qu\'une table annuelle ne peut pas faire', () => {
    expect(taux('2026-06')).not.toBe(taux('2026-07'));
  });

  it('applique le taux par type d\'activité', () => {
    expect(taux('2026-07', 'BNC')).toBe(0.261);
    expect(taux('2026-07', 'BIC_vente')).toBe(0.123);
    expect(taux('2026-07', 'BIC_service')).toBe(0.212);
  });

  it('applique l\'abattement ACRE', () => {
    expect(taux('2026-07', 'BNC', true)).toBeCloseTo(0.261 * ABATTEMENT_ACRE, 10);
  });
});

describe('asymétrie du temps', () => {
  // On extrapole vers le futur, jamais vers le passé : le taux d'un mois
  // écoulé est un fait publié, pas une prévision.
  it('sert le dernier taux connu pour un mois futur non publié', () => {
    const r = tauxCotisations(mois('2031-03'), 'BNC', false);
    expect(r.statut).toBe('publie'); // la dernière période reste ouverte
    expect(r.statut !== 'refuse' && r.valeur).toBe(0.261);
  });

  it('refuse un mois antérieur au plus ancien barème, au lieu de l\'extrapoler', () => {
    const r = tauxCotisations(mois('2019-01'), 'BNC', false);
    expect(r.statut).toBe('refuse');
    expect(r.statut === 'refuse' && r.motif).toMatch(/extrapol/);
    expect(r.statut === 'refuse' && r.motif).toContain('2019-01');
  });

  it('ne laisse jamais lire une valeur sur un refus', () => {
    const r = tauxCotisations(mois('2019-01'), 'BNC', false);
    // Le type l'interdit à la compilation ; on vérifie qu'il n'y a rien
    // à lire à l'exécution non plus.
    expect('valeur' in r).toBe(false);
  });
});

describe('provenance et intégrité de la table', () => {
  it('la table est contiguë, sans trou ni chevauchement', () => {
    expect(verifierIntegrite()).toEqual([]);
  });

  it('chaque période porte sa source et sa date de vérification', () => {
    for (const per of PERIODES_URSSAF) {
      expect(per.source).toBeTruthy();
      expect(per.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('seule la dernière période reste ouverte', () => {
    const ouvertes = PERIODES_URSSAF.filter((per) => per.au === null);
    expect(ouvertes).toHaveLength(1);
    expect(ouvertes[0]).toBe(PERIODES_URSSAF[PERIODES_URSSAF.length - 1]);
  });

  it('périodePour trouve la période et rien pour un mois non couvert', () => {
    expect(periodePour(mois('2026-07'))?.du).toBe('2026-07');
    expect(periodePour(mois('2019-01'))).toBeUndefined();
  });
});

describe('l\'hypothèse doit être explicite', () => {
  it('ne produit aucun libellé sur un taux publié', () => {
    expect(libelleHypothese(tauxCotisations(mois('2026-07'), 'BNC', false))).toBeNull();
  });

  it('produit un libellé chiffré et daté sur une hypothèse', () => {
    // Construction directe : la table réelle n'a pas de trou vers le futur.
    const label = libelleHypothese({
      statut: 'hypothese', valeur: ratio(0.261),
      source: 'urssaf.fr', verifieLe: '2026-07-27' as never, depuis: mois('2026-07')
    });
    expect(label).toContain('26,1 %');
    expect(label).toContain('2026-07');
  });
});

describe('garde-fous de typage', () => {
  it('refuse un mois mal formé plutôt que de le tolérer', () => {
    expect(() => mois('2026-13')).toThrow(RangeError);
    expect(() => mois('2026-7')).toThrow(RangeError);
    expect(() => mois('juillet 2026')).toThrow(RangeError);
  });
});
