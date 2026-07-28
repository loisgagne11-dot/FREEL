import { describe, expect, it } from 'vitest';
import { euros, mois, type TypeActivite } from '../types';
import {
  PERIODES_PLAFONDS,
  depasseLePlafond, periodePlafondPour, plafondMicro, verifierIntegritePlafonds
} from './plafonds';

function plafond(m: string, type: TypeActivite = 'BNC'): number | null {
  const r = plafondMicro(mois(m), type);
  return r.statut === 'refuse' ? null : r.valeur;
}

describe('plafonds de chiffre d\'affaires du régime micro', () => {
  it('applique les plafonds de 2025', () => {
    expect(plafond('2025-06', 'BNC')).toBe(77700);
    expect(plafond('2025-06', 'BIC_service')).toBe(77700);
    expect(plafond('2025-06', 'BIC_vente')).toBe(188700);
  });

  it('applique les plafonds relevés de 2026', () => {
    expect(plafond('2026-07', 'BNC')).toBe(83600);
    expect(plafond('2026-07', 'BIC_service')).toBe(83600);
    expect(plafond('2026-07', 'BIC_vente')).toBe(203100);
  });

  it('la vente de marchandises a un plafond bien supérieur aux services', () => {
    const vente = plafond('2026-07', 'BIC_vente');
    const service = plafond('2026-07', 'BNC');
    expect(vente).not.toBeNull();
    expect(service).not.toBeNull();
    expect(vente as number).toBeGreaterThan(service as number);
  });

  it('le plafond change entre 2025 et 2026, la résolution suit la période', () => {
    expect(plafond('2025-12', 'BNC')).toBe(77700);
    expect(plafond('2026-01', 'BNC')).toBe(83600);
  });
});

describe('dépassement du plafond', () => {
  it('ne signale rien sous le plafond', () => {
    const r = depasseLePlafond(euros(50000), mois('2026-07'), 'BNC');
    expect(r.statut !== 'refuse' && r.valeur).toBe(false);
  });

  // La borne exacte : être au plafond ne le dépasse pas.
  it('ne signale rien pile au plafond', () => {
    const r = depasseLePlafond(euros(83600), mois('2026-07'), 'BNC');
    expect(r.statut !== 'refuse' && r.valeur).toBe(false);
  });

  it('signale un euro au-dessus du plafond', () => {
    const r = depasseLePlafond(euros(83601), mois('2026-07'), 'BNC');
    expect(r.statut !== 'refuse' && r.valeur).toBe(true);
  });

  it('juge selon le plafond de la période, non selon le plafond courant', () => {
    // 80 000 € dépasse le plafond de 2025 mais pas celui de 2026 : résoudre à
    // l'année en cours pour juger une année passée donnerait un faux négatif.
    const en2025 = depasseLePlafond(euros(80000), mois('2025-06'), 'BNC');
    const en2026 = depasseLePlafond(euros(80000), mois('2026-07'), 'BNC');
    expect(en2025.statut !== 'refuse' && en2025.valeur).toBe(true);
    expect(en2026.statut !== 'refuse' && en2026.valeur).toBe(false);
  });
});

describe('asymétrie du temps', () => {
  it('refuse une période antérieure au plus ancien barème', () => {
    const r = plafondMicro(mois('2015-01'), 'BNC');
    expect(r.statut).toBe('refuse');
    if (r.statut === 'refuse') expect(r.motif).toMatch(/extrapol/);
  });

  it('propage le refus au jugement de dépassement', () => {
    expect(depasseLePlafond(euros(90000), mois('2015-01'), 'BNC').statut).toBe('refuse');
  });

  it('couvre le futur par la période ouverte', () => {
    expect(plafondMicro(mois('2031-03'), 'BNC').statut).not.toBe('refuse');
  });
});

describe('intégrité et provenance de la table', () => {
  it('la table est saine : contiguë, sans chevauchement', () => {
    expect(verifierIntegritePlafonds()).toEqual([]);
  });

  it('chaque période porte sa source et sa date de vérification', () => {
    for (const p of PERIODES_PLAFONDS) {
      expect(p.source).toBeTruthy();
      expect(p.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  // Les plafonds 2026 viennent de l'ancienne application, étiquetés « loi de
  // finances 2026 » sans confirmation à la source. La réserve doit rester
  // lisible plutôt que de se perdre.
  it('conserve la réserve de confiance sur les plafonds les plus récents', () => {
    const derniere = PERIODES_PLAFONDS[PERIODES_PLAFONDS.length - 1];
    expect(derniere?.source).toMatch(/confiance|NON confirmé|vérifier/i);
  });

  it('seule la dernière période reste ouverte', () => {
    const ouvertes = PERIODES_PLAFONDS.filter((p) => p.au === null);
    expect(ouvertes).toHaveLength(1);
  });

  it('periodePlafondPour ne trouve rien hors de toute période', () => {
    expect(periodePlafondPour(mois('2026-07'))).toBeDefined();
    expect(periodePlafondPour(mois('2015-01'))).toBeUndefined();
  });
});
