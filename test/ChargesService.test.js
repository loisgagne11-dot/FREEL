/**
 * Tests unitaires pour ChargesService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChargesService } from '../src/services/ChargesService.js';
import { store } from '../src/services/Store.js';

describe('ChargesService', () => {
  let service;

  beforeEach(() => {
    store.reset();
    service = new ChargesService();
  });

  describe('initCharges', () => {
    it('should initialize charges structure in store', () => {
      service.initCharges();
      const company = store.get('company');

      expect(company.charges).toBeDefined();
      expect(company.charges.urssaf).toEqual([]);
      expect(company.charges.ir).toEqual([]);
      expect(company.charges.history).toEqual([]);
    });

    it('should not overwrite existing charges', () => {
      const existingCharges = {
        urssaf: [{ id: 'test' }],
        ir: [],
        history: []
      };
      store.set('company', { charges: existingCharges });

      service.initCharges();
      const company = store.get('company');

      expect(company.charges.urssaf).toHaveLength(1);
      expect(company.charges.urssaf[0].id).toBe('test');
    });
  });

  describe('calculateProvisions', () => {
    it('should calculate provisions for a period with no missions', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-03-31');

      const provisions = service.calculateProvisions(startDate, endDate);

      expect(provisions.ca).toBe(0);
      expect(provisions.urssaf).toBe(0);
      expect(provisions.ir).toBe(0);
      expect(provisions.total).toBe(0);
    });

    it('should calculate provisions for a period with missions', () => {
      // Add a mission with revenue
      const missions = [{
        id: 'm1',
        client: 'Test',
        tjm: 500,
        lignes: [
          { ym: '2025-01', joursPrevus: 10, joursReels: 10 },
          { ym: '2025-02', joursPrevus: 10, joursReels: 10 }
        ]
      }];
      store.set('missions', missions);

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-02-28');

      const provisions = service.calculateProvisions(startDate, endDate);

      expect(provisions.ca).toBe(10000); // 500 * 10 * 2 months
      expect(provisions.urssaf).toBeGreaterThan(0);
      expect(provisions.total).toBeGreaterThan(0);
    });

    it('should respect date range boundaries', () => {
      const missions = [{
        id: 'm1',
        client: 'Test',
        tjm: 500,
        lignes: [
          { ym: '2024-12', joursPrevus: 10, joursReels: 10 },
          { ym: '2025-01', joursPrevus: 10, joursReels: 10 },
          { ym: '2025-02', joursPrevus: 10, joursReels: 10 }
        ]
      }];
      store.set('missions', missions);

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      const provisions = service.calculateProvisions(startDate, endDate);

      expect(provisions.ca).toBe(5000); // Only January
    });

    it('should use ACRE configuration when enabled', () => {
      store.set('company', {
        config: { acre: true },
        charges: { urssaf: [], ir: [], history: [] }
      });

      const missions = [{
        id: 'm1',
        client: 'Test',
        tjm: 500,
        lignes: [{ ym: '2025-01', joursPrevus: 10, joursReels: 10 }]

      }];
      store.set('missions', missions);

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      const provisions = service.calculateProvisions(startDate, endDate);

      // ACRE reduces URSSAF rate
      expect(provisions.urssaf).toBeLessThan(5000 * 0.213); // Lower than standard rate
    });
  });

  describe('generateURSSAFCharges', () => {
    it('should generate 4 quarterly charges for a year', () => {
      service.generateURSSAFCharges(2025);

      const company = store.get('company');
      const urssaf = company.charges.urssaf;

      expect(urssaf).toHaveLength(4);
      expect(urssaf[0].quarter).toBe(1);
      expect(urssaf[1].quarter).toBe(2);
      expect(urssaf[2].quarter).toBe(3);
      expect(urssaf[3].quarter).toBe(4);
    });

    it('should set correct deadlines for each quarter', () => {
      service.generateURSSAFCharges(2025);

      const company = store.get('company');
      const urssaf = company.charges.urssaf;

      expect(urssaf[0].deadline).toBe('2025-04-30'); // Q1
      expect(urssaf[1].deadline).toBe('2025-07-31'); // Q2
      expect(urssaf[2].deadline).toBe('2025-10-31'); // Q3
      expect(urssaf[3].deadline).toBe('2026-01-31'); // Q4
    });

    it('should not duplicate existing charges', () => {
      service.generateURSSAFCharges(2025);
      service.generateURSSAFCharges(2025); // Call twice

      const company = store.get('company');
      expect(company.charges.urssaf).toHaveLength(4); // Still only 4
    });

    it('should set correct months for each quarter', () => {
      service.generateURSSAFCharges(2025);

      const company = store.get('company');
      const urssaf = company.charges.urssaf;

      expect(urssaf[0].months).toEqual(['01', '02', '03']);
      expect(urssaf[1].months).toEqual(['04', '05', '06']);
      expect(urssaf[2].months).toEqual(['07', '08', '09']);
      expect(urssaf[3].months).toEqual(['10', '11', '12']);
    });

    it('should create charges with correct structure', () => {
      service.generateURSSAFCharges(2025);

      const company = store.get('company');
      const charge = company.charges.urssaf[0];

      expect(charge.id).toBe('urssaf-2025-q1');
      expect(charge.type).toBe('urssaf');
      expect(charge.year).toBe(2025);
      expect(charge.quarter).toBe(1);
      expect(charge.period).toBe('Q1 2025');
      expect(charge.paid).toBe(false);
      expect(charge.paidAt).toBeNull();
      expect(charge.paidAmount).toBeNull();
    });
  });

  describe('generateIRCharges', () => {
    it('should not generate IR charges when versementLib is disabled', () => {
      store.set('company', {
        config: { versementLib: false },
        charges: { urssaf: [], ir: [], history: [] }
      });

      service.generateIRCharges(2025);

      const company = store.get('company');
      expect(company.charges.ir).toHaveLength(0);
    });

    it('should generate 12 monthly charges when versementLib is enabled', () => {
      store.set('company', {
        config: { versementLib: true },
        charges: { urssaf: [], ir: [], history: [] }
      });

      service.generateIRCharges(2025);

      const company = store.get('company');
      expect(company.charges.ir).toHaveLength(12);
    });

    it('should not duplicate existing IR charges', () => {
      store.set('company', {
        config: { versementLib: true },
        charges: { urssaf: [], ir: [], history: [] }
      });

      service.generateIRCharges(2025);
      service.generateIRCharges(2025); // Call twice

      const company = store.get('company');
      expect(company.charges.ir).toHaveLength(12); // Still only 12
    });

    it('should create IR charges with correct structure', () => {
      store.set('company', {
        config: { versementLib: true },
        charges: { urssaf: [], ir: [], history: [] }
      });

      service.generateIRCharges(2025);

      const company = store.get('company');
      const charge = company.charges.ir[0];

      expect(charge.id).toBe('ir-2025-01');
      expect(charge.type).toBe('ir');
      expect(charge.year).toBe(2025);
      expect(charge.month).toBe(1);
      expect(charge.ym).toBe('2025-01');
      expect(charge.paid).toBe(false);
    });
  });

  describe('markAsPaid', () => {
    it('should mark URSSAF charge as paid', () => {
      service.generateURSSAFCharges(2025);

      const charge = service.markAsPaid('urssaf-2025-q1', 2000, '2025-04-15');

      expect(charge.paid).toBe(true);
      expect(charge.paidAt).toBe('2025-04-15');
      expect(charge.paidAmount).toBe(2000);
    });

    it('should mark IR charge as paid', () => {
      store.set('company', {
        config: { versementLib: true },
        charges: { urssaf: [], ir: [], history: [] }
      });

      service.generateIRCharges(2025);

      const charge = service.markAsPaid('ir-2025-01', 100, '2025-01-31');

      expect(charge.paid).toBe(true);
      expect(charge.paidAt).toBe('2025-01-31');
      expect(charge.paidAmount).toBe(100);
    });

    it('should add payment to history', () => {
      service.generateURSSAFCharges(2025);
      service.markAsPaid('urssaf-2025-q1', 2000, '2025-04-15');

      const history = service.getPaymentHistory();

      expect(history).toHaveLength(1);
      expect(history[0].chargeId).toBe('urssaf-2025-q1');
      expect(history[0].type).toBe('urssaf');
      expect(history[0].amount).toBe(2000);
      expect(history[0].date).toBe('2025-04-15');
    });

    it('should throw error for non-existent charge', () => {
      expect(() => {
        service.markAsPaid('invalid-id', 1000);
      }).toThrow('Charge introuvable');
    });

    it('should use current date when no paidDate provided', () => {
      service.generateURSSAFCharges(2025);

      const charge = service.markAsPaid('urssaf-2025-q1', 2000);

      expect(charge.paidAt).toBeDefined();
      expect(new Date(charge.paidAt)).toBeInstanceOf(Date);
    });
  });

  describe('markAsUnpaid', () => {
    it('should mark charge as unpaid', () => {
      service.generateURSSAFCharges(2025);
      service.markAsPaid('urssaf-2025-q1', 2000);

      const charge = service.markAsUnpaid('urssaf-2025-q1');

      expect(charge.paid).toBe(false);
      expect(charge.paidAt).toBeNull();
      expect(charge.paidAmount).toBeNull();
    });

    it('should remove payment from history', () => {
      service.generateURSSAFCharges(2025);
      service.markAsPaid('urssaf-2025-q1', 2000);
      service.markAsUnpaid('urssaf-2025-q1');

      const history = service.getPaymentHistory();
      expect(history).toHaveLength(0);
    });

    it('should throw error for non-existent charge', () => {
      expect(() => {
        service.markAsUnpaid('invalid-id');
      }).toThrow('Charge introuvable');
    });
  });

  describe('getChargesForYear', () => {
    it('should return empty arrays when no charges', () => {
      const charges = service.getChargesForYear(2025);

      expect(charges.urssaf).toEqual([]);
      expect(charges.ir).toEqual([]);
      expect(charges.all).toEqual([]);
    });

    it('should return charges for specified year', () => {
      service.generateURSSAFCharges(2025);
      service.generateURSSAFCharges(2026);

      const charges = service.getChargesForYear(2025);

      expect(charges.urssaf).toHaveLength(4);
      expect(charges.urssaf.every(c => c.year === 2025)).toBe(true);
    });

    it('should sort all charges by deadline', () => {
      store.set('company', {
        config: { versementLib: true },
        charges: { urssaf: [], ir: [], history: [] }
      });

      service.generateURSSAFCharges(2025);
      service.generateIRCharges(2025);

      const charges = service.getChargesForYear(2025);

      // Verify sorting
      for (let i = 1; i < charges.all.length; i++) {
        const prevDate = new Date(charges.all[i - 1].deadline);
        const currDate = new Date(charges.all[i].deadline);
        expect(prevDate.getTime()).toBeLessThanOrEqual(currDate.getTime());
      }
    });
  });

  describe('getOverdueCharges', () => {
    it('should return empty array when no overdue charges', () => {
      service.generateURSSAFCharges(2030); // Future year

      const overdue = service.getOverdueCharges();
      expect(overdue).toEqual([]);
    });

    it('should return overdue unpaid charges', () => {
      service.generateURSSAFCharges(2020); // Past year

      const overdue = service.getOverdueCharges();
      expect(overdue.length).toBeGreaterThan(0);
      expect(overdue.every(c => !c.paid)).toBe(true);
    });

    it('should not return paid charges even if past deadline', () => {
      service.generateURSSAFCharges(2020);
      service.markAsPaid('urssaf-2020-q1', 1000);

      const overdue = service.getOverdueCharges();
      expect(overdue.every(c => c.id !== 'urssaf-2020-q1')).toBe(true);
    });

    it('should sort by deadline (oldest first)', () => {
      service.generateURSSAFCharges(2020);

      const overdue = service.getOverdueCharges();

      for (let i = 1; i < overdue.length; i++) {
        const prevDate = new Date(overdue[i - 1].deadline);
        const currDate = new Date(overdue[i].deadline);
        expect(prevDate.getTime()).toBeLessThanOrEqual(currDate.getTime());
      }
    });
  });

  describe('getUpcomingCharges', () => {
    it('should return charges due within specified months', () => {
      const currentYear = new Date().getFullYear();
      service.generateURSSAFCharges(currentYear);
      service.generateURSSAFCharges(currentYear + 1);

      const upcoming = service.getUpcomingCharges(3);

      // All charges should be within 3 months
      const now = new Date();
      const threeMonthsLater = new Date();
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

      upcoming.forEach(charge => {
        const deadline = new Date(charge.deadline);
        expect(deadline.getTime()).toBeGreaterThanOrEqual(now.getTime());
        expect(deadline.getTime()).toBeLessThanOrEqual(threeMonthsLater.getTime());
      });
    });

    it('should not return paid charges', () => {
      const currentYear = new Date().getFullYear();
      service.generateURSSAFCharges(currentYear + 1); // Future charges

      const company = store.get('company');
      if (company.charges.urssaf[0]) {
        service.markAsPaid(company.charges.urssaf[0].id, 1000);
      }

      const upcoming = service.getUpcomingCharges(12);
      expect(upcoming.every(c => !c.paid)).toBe(true);
    });

    it('should sort by deadline', () => {
      const currentYear = new Date().getFullYear();
      service.generateURSSAFCharges(currentYear + 1);

      const upcoming = service.getUpcomingCharges(12);

      for (let i = 1; i < upcoming.length; i++) {
        const prevDate = new Date(upcoming[i - 1].deadline);
        const currDate = new Date(upcoming[i].deadline);
        expect(prevDate.getTime()).toBeLessThanOrEqual(currDate.getTime());
      }
    });
  });

  describe('getChargesStats', () => {
    it('should return zero stats when no charges', () => {
      const stats = service.getChargesStats(2025);

      expect(stats.urssaf.total).toBe(0);
      expect(stats.urssaf.count).toBe(0);
      expect(stats.ir.total).toBe(0);
      expect(stats.total.total).toBe(0);
    });

    it('should calculate URSSAF statistics correctly', () => {
      service.generateURSSAFCharges(2025);

      // Mark some as paid
      service.markAsPaid('urssaf-2025-q1', 1000);
      service.markAsPaid('urssaf-2025-q2', 1500);

      const stats = service.getChargesStats(2025);

      expect(stats.urssaf.count).toBe(4);
      expect(stats.urssaf.countPaid).toBe(2);
      expect(stats.urssaf.paid).toBe(2500);
    });

    it('should calculate combined statistics', () => {
      store.set('company', {
        config: { versementLib: true },
        charges: { urssaf: [], ir: [], history: [] }
      });

      service.generateURSSAFCharges(2025);
      service.generateIRCharges(2025);

      const stats = service.getChargesStats(2025);

      expect(stats.total.count).toBe(16); // 4 URSSAF + 12 IR
    });
  });

  describe('recalculateUnpaidCharges', () => {
    it('should recalculate unpaid charges when missions change', () => {
      service.generateURSSAFCharges(2025);

      const company = store.get('company');
      const originalAmount = company.charges.urssaf[0].amount;

      // Add missions
      const missions = [{
        id: 'm1',
        client: 'Test',
        tjm: 500,
        lignes: [{ ym: '2025-01', joursPrevus: 10, joursReels: 10 }]
      }];
      store.set('missions', missions);

      service.recalculateUnpaidCharges();

      const updated = store.get('company');
      expect(updated.charges.urssaf[0].amount).not.toBe(originalAmount);
      expect(updated.charges.urssaf[0].ca).toBe(5000);
    });

    it('should not recalculate paid charges', () => {
      service.generateURSSAFCharges(2025);
      service.markAsPaid('urssaf-2025-q1', 1000);

      const company = store.get('company');
      const paidCharge = company.charges.urssaf.find(c => c.id === 'urssaf-2025-q1');
      const originalAmount = paidCharge.amount;

      service.recalculateUnpaidCharges();

      const updated = store.get('company');
      const stillPaid = updated.charges.urssaf.find(c => c.id === 'urssaf-2025-q1');
      expect(stillPaid.amount).toBe(originalAmount);
    });
  });

  describe('getPaymentHistory', () => {
    it('should return empty array when no payments', () => {
      const history = service.getPaymentHistory();
      expect(history).toEqual([]);
    });

    it('should return payment history sorted by date (newest first)', () => {
      service.generateURSSAFCharges(2025);

      service.markAsPaid('urssaf-2025-q1', 1000, '2025-04-15');
      service.markAsPaid('urssaf-2025-q2', 1500, '2025-07-20');
      service.markAsPaid('urssaf-2025-q3', 1200, '2025-10-25');

      const history = service.getPaymentHistory();

      expect(history).toHaveLength(3);
      expect(new Date(history[0].date).getTime()).toBeGreaterThanOrEqual(
        new Date(history[1].date).getTime()
      );
    });

    it('should include payment details', () => {
      service.generateURSSAFCharges(2025);
      service.markAsPaid('urssaf-2025-q1', 1000, '2025-04-15');

      const history = service.getPaymentHistory();

      expect(history[0]).toHaveProperty('id');
      expect(history[0]).toHaveProperty('chargeId');
      expect(history[0]).toHaveProperty('type');
      expect(history[0]).toHaveProperty('amount');
      expect(history[0]).toHaveProperty('date');
    });
  });

  describe('exportChargesCSV', () => {
    it('should generate CSV with headers', () => {
      const csv = service.exportChargesCSV(2025);

      expect(csv).toContain('Type');
      expect(csv).toContain('Période');
      expect(csv).toContain('Échéance');
      expect(csv).toContain('Montant prévu');
    });

    it('should include all charges for the year', () => {
      service.generateURSSAFCharges(2025);

      const csv = service.exportChargesCSV(2025);
      const lines = csv.split('\n');

      expect(lines.length).toBe(5); // Header + 4 quarters
    });

    it('should format paid status correctly', () => {
      service.generateURSSAFCharges(2025);
      service.markAsPaid('urssaf-2025-q1', 1000, '2025-04-15');

      const csv = service.exportChargesCSV(2025);

      expect(csv).toContain('Payé');
      expect(csv).toContain('Non payé');
    });

    it('should use comma as separator', () => {
      service.generateURSSAFCharges(2025);

      const csv = service.exportChargesCSV(2025);
      const firstLine = csv.split('\n')[0];

      expect(firstLine).toContain(',');
    });
  });
});
