/**
 * Tests unitaires pour InvoiceService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InvoiceService } from '../src/services/InvoiceService.js';
import { store } from '../src/services/Store.js';

describe('InvoiceService', () => {
  let service;

  beforeEach(() => {
    // Reset store before each test
    store.reset();
    service = new InvoiceService();
  });

  describe('getNextInvoiceNumber', () => {
    it('should return formatted invoice number for first invoice', () => {
      const number = service.getNextInvoiceNumber(2025);
      expect(number).toBe('2025-0001');
    });

    it('should increment based on reserved numbers', () => {
      service.reserveInvoiceNumber(2025); // Reserves 2025-0001
      const next = service.getNextInvoiceNumber(2025);
      expect(next).toBe('2025-0002');
    });

    it('should reset numbering for new year', () => {
      service.reserveInvoiceNumber(2025);
      const next2026 = service.getNextInvoiceNumber(2026);
      expect(next2026).toBe('2026-0001');
    });
  });

  describe('reserveInvoiceNumber', () => {
    it('should reserve and return formatted invoice number', () => {
      const num1 = service.reserveInvoiceNumber(2025);
      const num2 = service.reserveInvoiceNumber(2025);
      expect(num1).toBe('2025-0001');
      expect(num2).toBe('2025-0002');
    });

    it('should persist counter in store', () => {
      service.reserveInvoiceNumber(2025);
      const company = store.get('company');
      expect(company.invoiceCounter[2025]).toBe(1);
    });
  });

  describe('registerInvoice', () => {
    it('should add invoice to registry with generated ID', () => {
      const invoice = {
        numero: '2025-0001',
        date: '2025-01-15',
        client: 'Test Client',
        montantHT: 5000,
        montantTTC: 6000
      };

      const entry = service.registerInvoice(invoice);

      expect(entry.id).toMatch(/^INV\d+$/);
      expect(entry.numero).toBe('2025-0001');
      expect(entry.client).toBe('Test Client');
      expect(entry.montantHT).toBe(5000);
    });

    it('should maintain registry order', () => {
      const invoice1 = {
        numero: '2025-0001',
        date: '2025-01-15',
        client: 'Client A',
        montantHT: 5000,
        montantTTC: 6000
      };

      const invoice2 = {
        numero: '2025-0002',
        date: '2025-01-20',
        client: 'Client B',
        montantHT: 3000,
        montantTTC: 3600
      };

      service.registerInvoice(invoice1);
      service.registerInvoice(invoice2);

      const registry = service.getRegistry();
      expect(registry).toHaveLength(2);
      expect(registry[0].numero).toBe('2025-0001');
      expect(registry[1].numero).toBe('2025-0002');
    });

    it('should add default nature if not provided', () => {
      const invoice = {
        numero: '2025-0001',
        date: '2025-01-15',
        client: 'Test',
        montantHT: 5000,
        montantTTC: 6000
      };

      const entry = service.registerInvoice(invoice);
      expect(entry.nature).toBe('Prestation de service');
    });
  });

  describe('getRegistry', () => {
    it('should return empty array when no invoices', () => {
      const registry = service.getRegistry();
      expect(registry).toEqual([]);
    });

    it('should return all registered invoices', () => {
      const invoice = {
        numero: '2025-0001',
        date: '2025-01-15',
        client: 'Test',
        montantHT: 5000,
        montantTTC: 6000
      };

      service.registerInvoice(invoice);
      const registry = service.getRegistry();

      expect(registry).toHaveLength(1);
      expect(registry[0].numero).toBe('2025-0001');
    });
  });

  describe('generateRegistryCSV', () => {
    it('should generate CSV with headers', () => {
      const csv = service.generateRegistryCSV();
      expect(csv).toContain('N° Facture');
      expect(csv).toContain('Date');
      expect(csv).toContain('Client');
      expect(csv).toContain('Montant HT');
    });

    it('should generate CSV rows for invoices', () => {
      const invoice = {
        numero: '2025-0001',
        date: '2025-01-15',
        client: 'Test Client',
        montantHT: 5000,
        tva: 1000,
        montantTTC: 6000
      };

      service.registerInvoice(invoice);
      const csv = service.generateRegistryCSV();

      expect(csv).toContain('2025-0001');
      expect(csv).toContain('Test Client');
      expect(csv).toContain('5000.00');
      expect(csv).toContain('6000.00');
    });

    it('should use comma as separator', () => {
      const csv = service.generateRegistryCSV();
      const firstLine = csv.split('\n')[0];
      expect(firstLine).toContain(',');
    });
  });

  describe('calculatePaymentDeadline', () => {
    it('should calculate deadline with 30 days default', () => {
      const invoiceDate = '2025-01-15';
      const deadline = service.calculatePaymentDeadline(invoiceDate);

      const expected = new Date('2025-01-15');
      expected.setDate(expected.getDate() + 30);

      expect(new Date(deadline).toDateString()).toBe(expected.toDateString());
    });

    it('should calculate deadline with custom delay', () => {
      const invoiceDate = '2025-01-15';
      const deadline = service.calculatePaymentDeadline(invoiceDate, 45);

      const expected = new Date('2025-01-15');
      expected.setDate(expected.getDate() + 45);

      expect(new Date(deadline).toDateString()).toBe(expected.toDateString());
    });
  });

  describe('isTVAApplicable', () => {
    it('should return false before October 2025', () => {
      expect(service.isTVAApplicable('2025-09')).toBe(false);
      expect(service.isTVAApplicable('2025-08')).toBe(false);
      expect(service.isTVAApplicable('2024-12')).toBe(false);
    });

    it('should return true from October 2025 onwards', () => {
      expect(service.isTVAApplicable('2025-10')).toBe(true);
      expect(service.isTVAApplicable('2025-11')).toBe(true);
      expect(service.isTVAApplicable('2026-01')).toBe(true);
    });
  });

  describe('generateInvoiceData', () => {
    it('should generate invoice data from mission', () => {
      const mission = {
        id: 'm1',
        client: 'Test Client',
        tjm: 500,
        lignes: [
          { ym: '2025-01', joursPrevus: 10, joursReels: null }
        ]
      };

      const invoiceData = service.generateInvoiceData(mission, '2025-01');

      expect(invoiceData).toBeDefined();
      expect(invoiceData.client).toBe('Test Client');
      expect(invoiceData.jours).toBe(10);
      expect(invoiceData.tjm).toBe(500);
      expect(invoiceData.totalHT).toBe(5000);
      expect(invoiceData.numero).toMatch(/^\d{4}-\d{4}$/);
    });

    it('should apply TVA when applicable', () => {
      const mission = {
        id: 'm1',
        client: 'Test Client',
        tjm: 500,
        lignes: [
          { ym: '2025-10', joursPrevus: 10, joursReels: null }
        ]
      };

      const invoiceData = service.generateInvoiceData(mission, '2025-10');

      expect(invoiceData.tvaRate).toBe(20);
      expect(invoiceData.tvaAmount).toBe(1000); // 5000 * 0.20
      expect(invoiceData.totalTTC).toBe(6000);
    });

    it('should not apply TVA before October 2025', () => {
      const mission = {
        id: 'm1',
        client: 'Test Client',
        tjm: 500,
        lignes: [
          { ym: '2025-09', joursPrevus: 10, joursReels: null }
        ]
      };

      const invoiceData = service.generateInvoiceData(mission, '2025-09');

      expect(invoiceData.tvaRate).toBe(0);
      expect(invoiceData.tvaAmount).toBe(0);
      expect(invoiceData.totalTTC).toBe(5000);
    });

    it('should throw error for invalid month', () => {
      const mission = {
        id: 'm1',
        client: 'Test Client',
        tjm: 500,
        lignes: [
          { ym: '2025-01', joursPrevus: 10, joursReels: null }
        ]
      };

      expect(() => {
        service.generateInvoiceData(mission, '2025-02');
      }).toThrow('Aucune donnée pour ce mois');
    });

    it('should include period and title', () => {
      const mission = {
        id: 'm1',
        client: 'Test Client',
        tjm: 500,
        lignes: [
          { ym: '2025-01', joursPrevus: 10, joursReels: null }
        ]
      };

      const invoiceData = service.generateInvoiceData(mission, '2025-01');

      expect(invoiceData.periode).toContain('janvier');
      expect(invoiceData.titre).toContain('Test Client');
      expect(invoiceData.titre).toContain('janvier');
    });
  });

  describe('generateInvoiceHTML', () => {
    it('should generate HTML with invoice number', () => {
      const invoiceData = {
        numero: '2025-0001',
        date: '2025-01-15',
        echeance: '2025-02-14',
        client: 'Test Client',
        adresseClient: '',
        emetteur: 'My Company',
        adresseEmetteur: '456 My St',
        titre: 'Test Client - janvier 2025',
        descriptif: 'Prestation de service',
        periode: 'du 01 au 31 janvier 2025',
        jours: 10,
        tjm: 500,
        totalHT: 5000,
        tvaRate: 0,
        tvaAmount: 0,
        totalTTC: 5000,
        delayDays: 30,
        iban: 'FR76XXXX',
        siret: '',
        tvaIntra: '',
        numeroCommande: '',
        rcs: '',
        rcPro: '',
        apeCode: '6201Z'
      };

      const html = service.generateInvoiceHTML(invoiceData);

      expect(html).toContain('2025-0001');
      expect(html).toContain('Test Client');
      expect(html).toContain('My Company');
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should include legal mentions', () => {
      const invoiceData = {
        numero: '2025-0001',
        date: '2025-01-15',
        echeance: '2025-02-14',
        client: 'Test',
        adresseClient: '',
        emetteur: 'Test',
        adresseEmetteur: '',
        titre: 'Test - janvier 2025',
        descriptif: 'Prestation',
        periode: 'du 01 au 31 janvier 2025',
        jours: 10,
        tjm: 500,
        totalHT: 5000,
        tvaRate: 0,
        tvaAmount: 0,
        totalTTC: 5000,
        delayDays: 30,
        iban: '',
        siret: '',
        tvaIntra: '',
        numeroCommande: '',
        rcs: '',
        rcPro: '',
        apeCode: '6201Z'
      };

      const html = service.generateInvoiceHTML(invoiceData);

      expect(html).toContain('L.441-10'); // Payment penalties
      expect(html).toContain('289'); // CGI article
    });

    it('should display TVA when applicable', () => {
      const invoiceData = {
        numero: '2025-0001',
        date: '2025-10-15',
        echeance: '2025-11-14',
        client: 'Test',
        adresseClient: '',
        emetteur: 'Test',
        adresseEmetteur: '',
        titre: 'Test - octobre 2025',
        descriptif: 'Prestation',
        periode: 'du 01 au 31 octobre 2025',
        jours: 10,
        tjm: 500,
        totalHT: 5000,
        tvaRate: 20,
        tvaAmount: 1000,
        totalTTC: 6000,
        delayDays: 30,
        iban: '',
        siret: '',
        tvaIntra: '',
        numeroCommande: '',
        rcs: '',
        rcPro: '',
        apeCode: '6201Z'
      };

      const html = service.generateInvoiceHTML(invoiceData);

      expect(html).toContain('TVA 20%');
      expect(html).toMatch(/1[\s\u00a0]000/); // French formatting
    });

    it('should display TVA exemption notice when rate is 0', () => {
      const invoiceData = {
        numero: '2025-0001',
        date: '2025-09-15',
        echeance: '2025-10-15',
        client: 'Test',
        adresseClient: '',
        emetteur: 'Test',
        adresseEmetteur: '',
        titre: 'Test - septembre 2025',
        descriptif: 'Prestation',
        periode: 'du 01 au 30 septembre 2025',
        jours: 10,
        tjm: 500,
        totalHT: 5000,
        tvaRate: 0,
        tvaAmount: 0,
        totalTTC: 5000,
        delayDays: 30,
        iban: '',
        siret: '',
        tvaIntra: '',
        numeroCommande: '',
        rcs: '',
        rcPro: '',
        apeCode: '6201Z'
      };

      const html = service.generateInvoiceHTML(invoiceData);

      expect(html).toContain('293 B du CGI'); // TVA exemption
    });
  });
});
