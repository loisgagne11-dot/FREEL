/**
 * Tests unitaires pour ValidationSchemas.js
 */

import { describe, it, expect } from 'vitest';
import {
  MissionSchema,
  InvoiceSchema,
  ChargeSchema,
  CompanySchema,
  AuthSignInSchema,
  AuthSignUpSchema,
  validate,
  sanitizeHTML,
  sanitizeURL
} from '../src/services/ValidationSchemas.js';

describe('ValidationSchemas', () => {
  describe('MissionSchema', () => {
    it('should validate correct mission data', () => {
      const mission = {
        client: 'Client ABC',
        titre: 'Mission Test',
        debut: '2025-01-01',
        fin: '2025-12-31',
        tjm: 500,
        delaiPaiement: 30,
        jourPaiement: 15
      };

      const result = MissionSchema.safeParse(mission);
      expect(result.success).toBe(true);
    });

    it('should reject mission with end date before start date', () => {
      const mission = {
        client: 'Client ABC',
        titre: 'Mission Test',
        debut: '2025-12-31',
        fin: '2025-01-01',
        tjm: 500
      };

      const result = MissionSchema.safeParse(mission);
      expect(result.success).toBe(false);
    });

    it('should reject mission duration exceeding 10 years', () => {
      const mission = {
        client: 'Client ABC',
        titre: 'Mission Test',
        debut: '2025-01-01',
        fin: '2040-01-01', // 15 years
        tjm: 500
      };

      const result = MissionSchema.safeParse(mission);
      expect(result.success).toBe(false);
    });

    it('should reject negative TJM', () => {
      const mission = {
        client: 'Client ABC',
        titre: 'Mission Test',
        debut: '2025-01-01',
        fin: '2025-12-31',
        tjm: -500
      };

      const result = MissionSchema.safeParse(mission);
      expect(result.success).toBe(false);
    });

    it('should reject TJM exceeding 10000', () => {
      const mission = {
        client: 'Client ABC',
        titre: 'Mission Test',
        debut: '2025-01-01',
        fin: '2025-12-31',
        tjm: 15000
      };

      const result = MissionSchema.safeParse(mission);
      expect(result.success).toBe(false);
    });

    it('should reject invalid date format', () => {
      const mission = {
        client: 'Client ABC',
        titre: 'Mission Test',
        debut: '01/01/2025', // Wrong format
        fin: '2025-12-31',
        tjm: 500
      };

      const result = MissionSchema.safeParse(mission);
      expect(result.success).toBe(false);
    });

    it('should reject XSS in client name', () => {
      const mission = {
        client: '<script>alert("xss")</script>',
        titre: 'Mission Test',
        debut: '2025-01-01',
        fin: '2025-12-31',
        tjm: 500
      };

      const result = MissionSchema.safeParse(mission);
      expect(result.success).toBe(false);
    });
  });

  describe('InvoiceSchema', () => {
    it('should validate correct invoice data', () => {
      const invoice = {
        numero: 'INV-2025-0001',
        date: '2025-01-15',
        missionId: 'M123',
        client: 'Client ABC',
        montantHT: 5000,
        montantTTC: 5000,
        statut: 'emise'
      };

      const result = InvoiceSchema.safeParse(invoice);
      expect(result.success).toBe(true);
    });

    it('should reject negative amounts', () => {
      const invoice = {
        numero: 'INV-2025-0001',
        date: '2025-01-15',
        missionId: 'M123',
        client: 'Client ABC',
        montantHT: -5000,
        montantTTC: -5000,
        statut: 'emise'
      };

      const result = InvoiceSchema.safeParse(invoice);
      expect(result.success).toBe(false);
    });

    it('should reject montantTTC less than montantHT', () => {
      const invoice = {
        numero: 'INV-2025-0001',
        date: '2025-01-15',
        missionId: 'M123',
        client: 'Client ABC',
        montantHT: 6000,
        montantTTC: 5000, // TTC should be >= HT
        statut: 'emise'
      };

      const result = InvoiceSchema.safeParse(invoice);
      expect(result.success).toBe(false);
    });

    it('should accept valid invoice statuses', () => {
      const statuses = ['emise', 'payee', 'annulee'];

      statuses.forEach(statut => {
        const invoice = {
          numero: 'INV-2025-0001',
          date: '2025-01-15',
          missionId: 'M123',
          client: 'Client ABC',
          montantHT: 5000,
          montantTTC: 5000,
          statut
        };

        const result = InvoiceSchema.safeParse(invoice);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('ChargeSchema', () => {
    it('should validate correct charge data', () => {
      const charge = {
        type: 'urssaf',
        libelle: 'Cotisation URSSAF Q1 2025',
        montant: 2000,
        dateEcheance: '2025-03-31',
        statut: 'apayer'
      };

      const result = ChargeSchema.safeParse(charge);
      expect(result.success).toBe(true);
    });

    it('should accept all valid charge types', () => {
      const types = ['urssaf', 'ir', 'tva', 'autre'];

      types.forEach(type => {
        const charge = {
          type,
          libelle: 'Test charge',
          montant: 1000,
          dateEcheance: '2025-12-31',
          statut: 'apayer'
        };

        const result = ChargeSchema.safeParse(charge);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('CompanySchema', () => {
    it('should validate correct company data', () => {
      const company = {
        nom: 'ACME Inc',
        siret: '12345678901234',
        email: 'contact@acme.com',
        acre: false,
        prelevementLiberatoire: false,
        parts: 1,
        abattement: 0.34
      };

      const result = CompanySchema.safeParse(company);
      expect(result.success).toBe(true);
    });

    it('should validate SIRET format (14 digits)', () => {
      const validSiret = {
        nom: 'ACME Inc',
        siret: '12345678901234' // 14 digits
      };

      const invalidSiret = {
        nom: 'ACME Inc',
        siret: '123456789' // Too short
      };

      expect(CompanySchema.safeParse(validSiret).success).toBe(true);
      expect(CompanySchema.safeParse(invalidSiret).success).toBe(false);
    });

    it('should validate TVA format (FR + 11 digits)', () => {
      const validTVA = {
        nom: 'ACME Inc',
        tva: 'FR12345678901'
      };

      const invalidTVA = {
        nom: 'ACME Inc',
        tva: 'FR123' // Too short
      };

      expect(CompanySchema.safeParse(validTVA).success).toBe(true);
      expect(CompanySchema.safeParse(invalidTVA).success).toBe(false);
    });

    it('should validate email format', () => {
      const validEmail = {
        nom: 'ACME Inc',
        email: 'contact@acme.com'
      };

      const invalidEmail = {
        nom: 'ACME Inc',
        email: 'not-an-email'
      };

      expect(CompanySchema.safeParse(validEmail).success).toBe(true);
      expect(CompanySchema.safeParse(invalidEmail).success).toBe(false);
    });
  });

  describe('AuthSignInSchema', () => {
    it('should validate correct sign in data', () => {
      const data = {
        email: 'user@example.com',
        password: 'password123'
      };

      const result = AuthSignInSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const data = {
        email: 'not-an-email',
        password: 'password123'
      };

      const result = AuthSignInSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('AuthSignUpSchema', () => {
    it('should validate correct sign up data', () => {
      const data = {
        email: 'user@example.com',
        password: 'Password123'
      };

      const result = AuthSignUpSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should require minimum 8 characters', () => {
      const data = {
        email: 'user@example.com',
        password: 'Pass1' // Too short
      };

      const result = AuthSignUpSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should require uppercase letter', () => {
      const data = {
        email: 'user@example.com',
        password: 'password123' // No uppercase
      };

      const result = AuthSignUpSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should require lowercase letter', () => {
      const data = {
        email: 'user@example.com',
        password: 'PASSWORD123' // No lowercase
      };

      const result = AuthSignUpSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should require number', () => {
      const data = {
        email: 'user@example.com',
        password: 'Password' // No number
      };

      const result = AuthSignUpSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('validate helper', () => {
    it('should return success for valid data', () => {
      const data = {
        email: 'user@example.com',
        password: 'Password123'
      };

      const result = validate(AuthSignUpSchema, data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('should return errors for invalid data', () => {
      const data = {
        email: 'not-an-email',
        password: 'short'
      };

      const result = validate(AuthSignUpSchema, data);

      expect(result.success).toBe(false);
      expect(result.errors).toBeTruthy();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('sanitizeHTML', () => {
    it('should escape HTML entities', () => {
      expect(sanitizeHTML('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('should escape & < > " \' /', () => {
      expect(sanitizeHTML('&')).toBe('&amp;');
      expect(sanitizeHTML('<')).toBe('&lt;');
      expect(sanitizeHTML('>')).toBe('&gt;');
      expect(sanitizeHTML('"')).toBe('&quot;');
      expect(sanitizeHTML("'")).toBe('&#x27;');
      expect(sanitizeHTML('/')).toBe('&#x2F;');
    });

    it('should handle empty string', () => {
      expect(sanitizeHTML('')).toBe('');
    });

    it('should handle null', () => {
      expect(sanitizeHTML(null)).toBe('');
    });
  });

  describe('sanitizeURL', () => {
    it('should allow valid http URL', () => {
      const url = 'http://example.com';
      expect(sanitizeURL(url)).toBe(url + '/');
    });

    it('should allow valid https URL', () => {
      const url = 'https://example.com';
      expect(sanitizeURL(url)).toBe(url + '/');
    });

    it('should reject javascript: URLs', () => {
      const url = 'javascript:alert("xss")';
      expect(sanitizeURL(url)).toBe('');
    });

    it('should reject data: URLs', () => {
      const url = 'data:text/html,<script>alert("xss")</script>';
      expect(sanitizeURL(url)).toBe('');
    });

    it('should handle empty string', () => {
      expect(sanitizeURL('')).toBe('');
    });

    it('should handle invalid URLs', () => {
      expect(sanitizeURL('not-a-url')).toBe('');
    });
  });
});
