/**
 * Tests unitaires pour TaxCalculator
 */

import { describe, it, expect } from 'vitest';
import { taxCalculator } from '../src/services/TaxCalculator.js';
import { LEGAL } from '../src/config.js';

describe('TaxCalculator', () => {
  describe('calculateURSSAF', () => {
    it('calcule l\'URSSAF sans ACRE en 2025', () => {
      const ca = 50000;
      const urssaf = taxCalculator.calculateURSSAF(ca, 2025, false);

      // BNC 2025: 50000 * 0.211 (URSSAF) + 50000 * 0.002 (CFP) = 10650
      expect(urssaf).toBe(10650);
    });

    it('calcule l\'URSSAF avec ACRE en 2025', () => {
      const ca = 50000;
      const urssaf = taxCalculator.calculateURSSAF(ca, 2025, true);

      // BNC 2025 ACRE: 50000 * 0.1065 (URSSAF ACRE) + 50000 * 0.002 (CFP) = 5425
      expect(urssaf).toBe(5425);
    });

    it('retourne 0 pour un CA nul', () => {
      expect(taxCalculator.calculateURSSAF(0, 2025, false)).toBe(0);
    });

    it('retourne 0 pour un CA négatif', () => {
      expect(taxCalculator.calculateURSSAF(-1000, 2025, false)).toBe(0);
    });
  });

  describe('calculateIR', () => {
    it('calcule l\'IR avec versement libératoire', () => {
      const ca = 50000;
      const result = taxCalculator.calculateIR(ca, { versementLib: true });

      // 50000 * 0.022 = 1100
      expect(result.ir).toBe(1100);
      expect(result.details[0].tranche).toBe('Versement libératoire');
    });

    it('calcule l\'IR par tranches (1 part)', () => {
      const ca = 50000;
      const result = taxCalculator.calculateIR(ca, {
        parts: 1,
        abattement: 0.34,
        versementLib: false
      });

      // Revenu imposable : 50000 * 0.66 = 33000
      expect(result.revenuImposable).toBe(33000);
      expect(result.quotientFamilial).toBe(33000);

      // IR doit être > 0 car dépasse la première tranche
      expect(result.ir).toBeGreaterThan(0);
    });

    it('calcule l\'IR avec 2 parts', () => {
      const ca = 50000;
      const result = taxCalculator.calculateIR(ca, {
        parts: 2,
        abattement: 0.34,
        versementLib: false
      });

      // Quotient : 33000 / 2 = 16500
      expect(result.quotientFamilial).toBe(16500);

      // IR avec 2 parts doit être inférieur à 1 part
      const result1Part = taxCalculator.calculateIR(ca, {
        parts: 1,
        abattement: 0.34,
        versementLib: false
      });

      expect(result.ir).toBeLessThan(result1Part.ir);
    });

    it('retourne 0 pour un CA nul', () => {
      const result = taxCalculator.calculateIR(0, {});
      expect(result.ir).toBe(0);
      expect(result.revenuImposable).toBe(0);
    });
  });

  describe('calculateTVA', () => {
    it('retourne 0 avant octobre 2025', () => {
      const result = taxCalculator.calculateTVA(10000, '2025-09');

      expect(result.tvaCollectee).toBe(0);
      expect(result.tvaDue).toBe(0);
      expect(result.assujetti).toBe(false);
      expect(result.caTTC).toBe(10000); // Pas de TVA
    });

    it('calcule la TVA après octobre 2025', () => {
      const result = taxCalculator.calculateTVA(10000, '2025-10');

      // TVA 20% : 10000 * 0.20 = 2000
      expect(result.tvaCollectee).toBe(2000);
      expect(result.tvaDue).toBe(2000); // Pas de déductible pour le moment
      expect(result.assujetti).toBe(true);
      expect(result.caTTC).toBe(12000); // HT + TVA
    });
  });

  describe('calculateProvisions', () => {
    it('calcule les provisions complètes', () => {
      const ca = 50000;
      const provisions = taxCalculator.calculateProvisions(ca, 2025, {
        acre: false,
        versementLib: false,
        abattement: 0.34,
        parts: 1
      });

      expect(provisions).toHaveProperty('urssaf');
      expect(provisions).toHaveProperty('ir');
      expect(provisions).toHaveProperty('total');

      expect(provisions.urssaf).toBeGreaterThan(0);
      expect(provisions.ir).toBeGreaterThan(0);
      expect(provisions.total).toBe(provisions.urssaf + provisions.ir);
    });

    it('retourne 0 pour un CA nul', () => {
      const provisions = taxCalculator.calculateProvisions(0, 2025, {});

      expect(provisions.urssaf).toBe(0);
      expect(provisions.ir).toBe(0);
      expect(provisions.total).toBe(0);
    });
  });

  describe('calculateRevenuNet', () => {
    it('calcule le revenu net', () => {
      const ca = 50000;
      const result = taxCalculator.calculateRevenuNet(ca, 2025, {
        acre: false,
        versementLib: false
      });

      expect(result.ca).toBe(ca);
      expect(result.totalCharges).toBeGreaterThan(0);
      expect(result.revenuNet).toBe(ca - result.totalCharges);
      expect(result.tauxCharge).toBeGreaterThan(0);
      expect(result.tauxCharge).toBeLessThan(1);
    });
  });

  describe('checkPlafond', () => {
    it('vérifie le plafond service 2025 (77700€)', () => {
      const result = taxCalculator.checkPlafond(50000, 'service', 2025);

      expect(result.plafond).toBe(77700);
      expect(result.ca).toBe(50000);
      expect(result.usage).toBeCloseTo(0.644, 2);
      expect(result.remaining).toBe(27700);
      expect(result.exceeded).toBe(false);
      expect(result.warning).toBe(false);
    });

    it('vérifie le plafond service 2026 (79000€)', () => {
      const result = taxCalculator.checkPlafond(50000, 'service', 2026);

      expect(result.plafond).toBe(79000);
      expect(result.ca).toBe(50000);
      expect(result.usage).toBeCloseTo(0.633, 2);
      expect(result.remaining).toBe(29000);
      expect(result.exceeded).toBe(false);
      expect(result.warning).toBe(false);
    });

    it('alerte à 80% du plafond', () => {
      const ca = 77700 * 0.85; // 85%
      const result = taxCalculator.checkPlafond(ca, 'service', 2025);

      expect(result.warning).toBe(true);
      expect(result.exceeded).toBe(false);
    });

    it('détecte le dépassement', () => {
      const ca = 80000;
      const result = taxCalculator.checkPlafond(ca, 'service', 2025);

      expect(result.exceeded).toBe(true);
      expect(result.remaining).toBe(0);
    });
  });
});
