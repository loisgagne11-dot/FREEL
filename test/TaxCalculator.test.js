/**
 * Tests unitaires pour TaxCalculator.js
 */

import { describe, it, expect } from 'vitest';
import { TaxCalculator } from '../src/services/TaxCalculator.js';

describe('TaxCalculator', () => {
  const calculator = new TaxCalculator();

  describe('calculateURSSAF', () => {
    it('should return 0 for CA of 0', () => {
      const result = calculator.calculateURSSAF(0, 2025);
      expect(result).toBe(0);
    });

    it('should return 0 for negative CA', () => {
      const result = calculator.calculateURSSAF(-1000, 2025);
      expect(result).toBe(0);
    });

    it('should calculate URSSAF for 2025 without ACRE', () => {
      const ca = 10000;
      const result = calculator.calculateURSSAF(ca, 2025, false);

      // Rate 2025: 21.1% + 0.2% CFP = 21.3%
      const expected = ca * 0.213;
      expect(result).toBeCloseTo(expected, 2);
    });

    it('should calculate URSSAF for 2025 with ACRE', () => {
      const ca = 10000;
      const result = calculator.calculateURSSAF(ca, 2025, true);

      // Rate ACRE 2025: 10.65% + 0.2% CFP = 10.85%
      const expected = ca * 0.1085;
      expect(result).toBeCloseTo(expected, 2);
    });

    it('should calculate URSSAF for 2026 without ACRE', () => {
      const ca = 10000;
      const result = calculator.calculateURSSAF(ca, 2026, false);

      // Rate 2026: 21.2% + 0.2% CFP = 21.4%
      const expected = ca * 0.214;
      expect(result).toBeCloseTo(expected, 2);
    });

    it('should calculate URSSAF for 2026 with ACRE', () => {
      const ca = 10000;
      const result = calculator.calculateURSSAF(ca, 2026, true);

      // Rate ACRE 2026: 10.6% + 0.2% CFP = 10.8%
      const expected = ca * 0.108;
      expect(result).toBeCloseTo(expected, 2);
    });
  });

  describe('calculateIR', () => {
    it('should return 0 for CA of 0', () => {
      const result = calculator.calculateIR(0);
      expect(result.ir).toBe(0);
      expect(result.revenuImposable).toBe(0);
    });

    it('should calculate IR with default abattement (34%)', () => {
      const ca = 50000;
      const result = calculator.calculateIR(ca);

      // Revenu imposable = 50000 * (1 - 0.34) = 33000
      expect(result.revenuImposable).toBe(33000);
    });

    it('should calculate IR with custom abattement', () => {
      const ca = 50000;
      const result = calculator.calculateIR(ca, { abattement: 0.5 });

      // Revenu imposable = 50000 * (1 - 0.5) = 25000
      expect(result.revenuImposable).toBe(25000);
    });

    it('should calculate IR with versement libératoire', () => {
      const ca = 50000;
      const result = calculator.calculateIR(ca, { versementLib: true });

      // Versement lib = 2.2% du CA
      const expected = ca * 0.022;
      expect(result.ir).toBe(expected);
      expect(result.details[0].tranche).toBe('Versement libératoire');
    });

    it('should calculate IR by brackets for single person', () => {
      const ca = 100000; // Revenu imposable: 66000€
      const result = calculator.calculateIR(ca, { parts: 1, abattement: 0.34 });

      expect(result.revenuImposable).toBe(66000);
      expect(result.quotientFamilial).toBe(66000);
      expect(result.ir).toBeGreaterThan(0);
      expect(result.details.length).toBeGreaterThan(0);
    });

    it('should calculate IR with multiple parts (couple)', () => {
      const ca = 100000;
      const result = calculator.calculateIR(ca, { parts: 2, abattement: 0.34 });

      // Quotient familial = 66000 / 2 = 33000
      expect(result.quotientFamilial).toBe(33000);

      // IR should be lower with 2 parts
      const result1Part = calculator.calculateIR(ca, { parts: 1, abattement: 0.34 });
      expect(result.ir).toBeLessThan(result1Part.ir);
    });

    it('should handle very low CA (below first bracket)', () => {
      const ca = 15000; // Revenu imposable: 9900€ (below 11294€)
      const result = calculator.calculateIR(ca, { parts: 1, abattement: 0.34 });

      expect(result.ir).toBe(0); // No tax in first bracket
      expect(result.details.length).toBe(0);
    });

    it('should calculate all tranches for high CA', () => {
      const ca = 500000; // Very high CA
      const result = calculator.calculateIR(ca, { parts: 1, abattement: 0.34 });

      // Should have multiple tranches
      expect(result.details.length).toBeGreaterThan(2);
      expect(result.ir).toBeGreaterThan(0);
    });
  });

  describe('calculateProvisions', () => {
    it('should return 0 for CA of 0', () => {
      const result = calculator.calculateProvisions(0, 2025);

      expect(result.urssaf).toBe(0);
      expect(result.ir).toBe(0);
      expect(result.tva).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should calculate all provisions without ACRE', () => {
      const ca = 50000;
      const result = calculator.calculateProvisions(ca, 2025, {
        acre: false,
        versementLib: false
      });

      expect(result.urssaf).toBeGreaterThan(0);
      expect(result.ir).toBeGreaterThan(0);
      expect(result.total).toBe(result.urssaf + result.ir);
    });

    it('should calculate provisions with ACRE', () => {
      const ca = 50000;
      const resultWithAcre = calculator.calculateProvisions(ca, 2025, { acre: true });
      const resultWithoutAcre = calculator.calculateProvisions(ca, 2025, { acre: false });

      // ACRE should reduce URSSAF
      expect(resultWithAcre.urssaf).toBeLessThan(resultWithoutAcre.urssaf);
      expect(resultWithAcre.total).toBeLessThan(resultWithoutAcre.total);
    });

    it('should calculate provisions with versement libératoire', () => {
      const ca = 50000;
      const result = calculator.calculateProvisions(ca, 2025, { versementLib: true });

      // IR should be 2.2% of CA
      const expectedIR = ca * 0.022;
      expect(result.ir).toBe(expectedIR);
    });
  });

  describe('edge cases', () => {
    it('should handle null or undefined CA', () => {
      expect(calculator.calculateURSSAF(null, 2025)).toBe(0);
      expect(calculator.calculateURSSAF(undefined, 2025)).toBe(0);

      const irResult = calculator.calculateIR(null);
      expect(irResult.ir).toBe(0);
    });

    it('should handle very large CA', () => {
      const ca = 1000000000; // 1 billion
      const result = calculator.calculateProvisions(ca, 2025);

      expect(result.total).toBeGreaterThan(0);
      expect(Number.isFinite(result.total)).toBe(true);
    });

    it('should handle decimal CA', () => {
      const ca = 12345.67;
      const result = calculator.calculateProvisions(ca, 2025);

      expect(result.total).toBeGreaterThan(0);
      expect(Number.isFinite(result.total)).toBe(true);
    });
  });
});
