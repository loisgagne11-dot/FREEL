/**
 * Tests unitaires pour formatters
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EUR, PCT, fmtDate, validateSIRET, fmtSIRET } from '../src/utils/formatters.js';
import { store } from '../src/services/Store.js';

describe('Formatters', () => {
  beforeEach(() => {
    // Désactiver privacy mode pour les tests
    store.set('privacyMode', false);
  });

  describe('EUR', () => {
    it('formate un montant positif', () => {
      // French locale uses narrow no-break space (U+202F)
      expect(EUR(1234.56)).toBe('1\u202f234,56\u00a0€');
    });

    it('formate un montant négatif', () => {
      expect(EUR(-1234.56)).toBe('-1\u202f234,56\u00a0€');
    });

    it('formate zéro', () => {
      expect(EUR(0)).toBe('0,00\u00a0€');
    });

    it('masque en privacy mode', () => {
      store.set('privacyMode', true);
      expect(EUR(1234.56)).toBe('•••••€');
    });

    it('force l\'affichage même en privacy mode', () => {
      store.set('privacyMode', true);
      expect(EUR(1234.56, { forceShow: true })).toBe('1\u202f234,56\u00a0€');
    });

    it('gère null/undefined', () => {
      expect(EUR(null)).toBe('—');
      expect(EUR(undefined)).toBe('—');
      expect(EUR(NaN)).toBe('—');
    });
  });

  describe('PCT', () => {
    it('formate un pourcentage', () => {
      // French locale uses narrow no-break space before %
      expect(PCT(0.2465)).toBe('24,7\u00a0%');
    });

    it('formate zéro', () => {
      expect(PCT(0)).toBe('0,0\u00a0%');
    });

    it('formate 100%', () => {
      expect(PCT(1)).toBe('100,0\u00a0%');
    });

    it('gère null/undefined', () => {
      expect(PCT(null)).toBe('—');
      expect(PCT(undefined)).toBe('—');
    });
  });

  describe('fmtDate', () => {
    it('formate une date', () => {
      const date = new Date('2025-01-15');
      expect(fmtDate(date)).toMatch(/15\/01\/2025/);
    });

    it('formate une chaîne ISO', () => {
      expect(fmtDate('2025-01-15')).toMatch(/15\/01\/2025/);
    });

    it('gère null/undefined', () => {
      expect(fmtDate(null)).toBe('—');
      expect(fmtDate(undefined)).toBe('—');
    });
  });

  describe('validateSIRET', () => {
    it('valide un SIRET correct', () => {
      expect(validateSIRET('73282932000074')).toBe(true);
      expect(validateSIRET('732 829 320 00074')).toBe(true); // Avec espaces
    });

    it('rejette un SIRET incorrect', () => {
      expect(validateSIRET('12345678901234')).toBe(false); // Mauvais checksum
      expect(validateSIRET('123')).toBe(false); // Trop court
      expect(validateSIRET('abcdefghijklmn')).toBe(false); // Non numérique
      expect(validateSIRET('')).toBe(false); // Vide
      expect(validateSIRET(null)).toBe(false); // Null
    });
  });

  describe('fmtSIRET', () => {
    it('formate un SIRET', () => {
      expect(fmtSIRET('73282932000074')).toBe('732 829 320 00074');
    });

    it('gère les SIRET déjà formatés', () => {
      expect(fmtSIRET('732 829 320 00074')).toBe('732 829 320 00074');
    });

    it('gère les valeurs invalides', () => {
      expect(fmtSIRET('')).toBe('');
      expect(fmtSIRET(null)).toBe('');
    });
  });
});
