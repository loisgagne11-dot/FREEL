import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois, type TypeActivite } from '../types';
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

  // La réserve sur 2026 a été levée le 07/11/2026 : la base légale est
  // l'arrêté du 27/01/2026, pas la loi de finances.
  it('cite l\'arrêté du 27/01/2026 pour les plafonds 2026, et plus aucune réserve', () => {
    const derniere = PERIODES_PLAFONDS[PERIODES_PLAFONDS.length - 1];
    expect(derniere?.source).toContain('A18813');
    expect(derniere?.source).not.toMatch(/NON confirmé|MOYENNE-BASSE/);
    expect(derniere?.verifieLe).toBe('2026-11-07');
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

describe('prorata du plafond l\'année de création', () => {
  const avecDebut = (m: string, type: TypeActivite, debut: string | null) => {
    const r = plafondMicro(mois(m), type, debut === null ? null : dateISO(debut));
    return r.statut === 'refuse' ? null : r.valeur;
  };

  // Exemple officiel (F23267) : 203 100 × 335 / 365 = 186 407 € pour un début
  // le 31 janvier. Le plafond plein laisserait croire à une marge qui n'existe pas.
  it('proratise sur l\'exemple officiel : 203 100 € × 335 / 365 = 186 407 €', () => {
    expect(avecDebut('2026-06', 'BIC_vente', '2026-01-31')).toBe(186407);
  });

  it('proratise aussi le plafond de services', () => {
    // 83 600 × 184 / 365 (début le 1er juillet) = 42 143,9 → 42 144.
    expect(avecDebut('2026-09', 'BNC', '2026-07-01')).toBe(42144);
  });

  it('laisse le plafond plein après l\'année de création et sans date connue', () => {
    expect(avecDebut('2027-03', 'BNC', '2026-07-01')).toBe(83600);
    expect(avecDebut('2026-03', 'BNC', null)).toBe(83600);
  });

  it('un début au 1er janvier est une année pleine', () => {
    expect(avecDebut('2026-03', 'BNC', '2026-01-01')).toBe(83600);
  });

  it('le dépassement se juge sur le plafond proratisé', () => {
    const r = depasseLePlafond(euros(50000), mois('2026-09'), 'BNC', dateISO('2026-07-01'));
    expect(r.statut === 'refuse' ? null : r.valeur).toBe(true);
  });
});
