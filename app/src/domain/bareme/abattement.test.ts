import { describe, expect, it } from 'vitest';
import { euros, mois, type TypeActivite } from '../types';
import {
  MINIMUM_ABATTEMENT, PERIODES_ABATTEMENT,
  periodeAbattementPour, revenuApresAbattement, tauxAbattement, verifierIntegriteAbattement
} from './abattement';

function taux(m: string, type: TypeActivite = 'BNC'): number | null {
  const r = tauxAbattement(mois(m), type);
  return r.statut === 'refuse' ? null : r.valeur;
}

describe('taux d\'abattement par type d\'activité', () => {
  it('applique 34 % au BNC', () => {
    expect(taux('2026-07', 'BNC')).toBe(0.34);
  });

  it('applique 71 % à la vente de marchandises', () => {
    expect(taux('2026-07', 'BIC_vente')).toBe(0.71);
  });

  it('applique 50 % aux prestations de services BIC', () => {
    expect(taux('2026-07', 'BIC_service')).toBe(0.50);
  });

  it('distingue les trois types, qui n\'ont pas le même abattement', () => {
    const t = ['BNC', 'BIC_vente', 'BIC_service'] as const;
    const valeurs = t.map((type) => taux('2026-07', type));
    expect(new Set(valeurs).size).toBe(3);
  });
});

describe('asymétrie du temps', () => {
  // Même règle que urssaf.ts : un abattement passé est un fait publié.
  it('refuse un mois antérieur au plus ancien barème plutôt que de l\'extrapoler', () => {
    const r = tauxAbattement(mois('2015-01'), 'BNC');
    expect(r.statut).toBe('refuse');
    if (r.statut === 'refuse') expect(r.motif).toMatch(/extrapol/);
  });

  it('ne laisse aucune valeur lisible sur un refus', () => {
    const r = tauxAbattement(mois('2015-01'), 'BNC');
    expect('valeur' in r).toBe(false);
  });

  it('couvre le futur par la période ouverte', () => {
    const r = tauxAbattement(mois('2031-03'), 'BNC');
    expect(r.statut).not.toBe('refuse');
  });
});

describe('revenu après abattement', () => {
  it('retire l\'abattement du chiffre d\'affaires', () => {
    const r = revenuApresAbattement(euros(30000), mois('2026-07'), 'BNC');
    // 30 000 − 34 % = 19 800
    expect(r.statut !== 'refuse' && r.valeur).toBe(19800);
  });

  // Le minimum d'abattement protège les très petits chiffres d'affaires :
  // sans lui, un CA de 500 € donnerait un revenu imposable de 330 € alors que
  // l'abattement forfaitaire ne peut pas descendre sous 305 €.
  it('applique le minimum d\'abattement sur un très petit chiffre d\'affaires', () => {
    const r = revenuApresAbattement(euros(500), mois('2026-07'), 'BNC');
    // 34 % de 500 = 170, inférieur au minimum de 305 → abattement = 305
    expect(r.statut !== 'refuse' && r.valeur).toBe(195);
  });

  it('ne rend jamais un revenu négatif, même sous le minimum d\'abattement', () => {
    const r = revenuApresAbattement(euros(100), mois('2026-07'), 'BNC');
    expect(r.statut !== 'refuse' && r.valeur).toBeGreaterThanOrEqual(0);
  });

  it('vaut zéro pour un chiffre d\'affaires nul', () => {
    const r = revenuApresAbattement(euros(0), mois('2026-07'), 'BNC');
    expect(r.statut !== 'refuse' && r.valeur).toBe(0);
  });

  it('propage le refus quand le barème ne couvre pas la période', () => {
    const r = revenuApresAbattement(euros(30000), mois('2015-01'), 'BNC');
    expect(r.statut).toBe('refuse');
  });

  it('expose le minimum d\'abattement comme une constante nommée', () => {
    expect(MINIMUM_ABATTEMENT).toBe(305);
  });
});

describe('intégrité et provenance de la table', () => {
  it('la table est saine : contiguë, sans chevauchement', () => {
    expect(verifierIntegriteAbattement()).toEqual([]);
  });

  it('chaque période porte sa source et sa date de vérification', () => {
    for (const p of PERIODES_ABATTEMENT) {
      expect(p.source).toBeTruthy();
      expect(p.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('seule la dernière période reste ouverte', () => {
    const ouvertes = PERIODES_ABATTEMENT.filter((p) => p.au === null);
    expect(ouvertes).toHaveLength(1);
    expect(ouvertes[0]).toBe(PERIODES_ABATTEMENT[PERIODES_ABATTEMENT.length - 1]);
  });

  it('periodeAbattementPour ne trouve rien hors de toute période', () => {
    expect(periodeAbattementPour(mois('2026-07'))).toBeDefined();
    expect(periodeAbattementPour(mois('2015-01'))).toBeUndefined();
  });
});
