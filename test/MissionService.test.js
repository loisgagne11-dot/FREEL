/**
 * Tests unitaires pour MissionService.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MissionService } from '../src/services/MissionService.js';
import { Store } from '../src/services/Store.js';

describe('MissionService', () => {
  let service;
  let store;

  beforeEach(() => {
    service = new MissionService();
    store = new Store();
    // Inject store for testing
    service.store = store;
  });

  describe('buildMission', () => {
    it('should return empty lignes for mission without dates', () => {
      const mission = { id: '1', titre: 'Test' };
      const result = service.buildMission(mission);

      expect(result.lignes).toEqual([]);
    });

    it('should build lignes for single month mission', () => {
      const mission = {
        id: '1',
        debut: '2025-01-01',
        fin: '2025-01-31',
        tjm: 500
      };

      const result = service.buildMission(mission);

      expect(result.lignes).toHaveLength(1);
      expect(result.lignes[0].ym).toBe('2025-01');
    });

    it('should build lignes for multi-month mission', () => {
      const mission = {
        id: '1',
        debut: '2025-01-01',
        fin: '2025-03-31',
        tjm: 500
      };

      const result = service.buildMission(mission);

      expect(result.lignes).toHaveLength(3);
      expect(result.lignes[0].ym).toBe('2025-01');
      expect(result.lignes[1].ym).toBe('2025-02');
      expect(result.lignes[2].ym).toBe('2025-03');
    });

    it('should handle mission spanning a year', () => {
      const mission = {
        id: '1',
        debut: '2024-11-01',
        fin: '2025-02-28',
        tjm: 500
      };

      const result = service.buildMission(mission);

      expect(result.lignes).toHaveLength(4);
      expect(result.lignes[0].ym).toBe('2024-11');
      expect(result.lignes[1].ym).toBe('2024-12');
      expect(result.lignes[2].ym).toBe('2025-01');
      expect(result.lignes[3].ym).toBe('2025-02');
    });

    it('should return empty lignes for invalid dates', () => {
      const mission = {
        id: '1',
        debut: 'invalid-date',
        fin: '2025-12-31',
        tjm: 500
      };

      const result = service.buildMission(mission);

      expect(result.lignes).toEqual([]);
    });

    it('should return empty lignes when end date is before start date', () => {
      const mission = {
        id: '1',
        debut: '2025-12-31',
        fin: '2025-01-01',
        tjm: 500
      };

      const result = service.buildMission(mission);

      expect(result.lignes).toEqual([]);
    });

    it('should limit mission duration to 10 years (120 months)', () => {
      const mission = {
        id: '1',
        debut: '2025-01-01',
        fin: '2040-12-31', // 16 years
        tjm: 500
      };

      const result = service.buildMission(mission);

      // Should return empty lignes (exceeds 10 years)
      expect(result.lignes).toEqual([]);
    });

    it('should calculate joursOuvrables for each ligne', () => {
      const mission = {
        id: '1',
        debut: '2025-01-01',
        fin: '2025-01-31',
        tjm: 500
      };

      const result = service.buildMission(mission);

      expect(result.lignes[0].joursOuvrables).toBeGreaterThan(0);
      expect(result.lignes[0].joursPrevus).toBeGreaterThan(0);
      expect(result.lignes[0].conges).toBe(0);
      expect(result.lignes[0].joursReels).toBeNull();
    });
  });

  describe('calculateRealDays', () => {
    it('should return manual joursReels if set', () => {
      const ligne = {
        joursPrevus: 20,
        conges: 5,
        joursReels: 12
      };

      const result = service.calculateRealDays(ligne);
      expect(result).toBe(12);
    });

    it('should calculate joursReels from prevus - conges', () => {
      const ligne = {
        joursPrevus: 20,
        conges: 5,
        joursReels: null
      };

      const result = service.calculateRealDays(ligne);
      expect(result).toBe(15);
    });

    it('should return 0 if conges exceed joursPrevus', () => {
      const ligne = {
        joursPrevus: 10,
        conges: 15,
        joursReels: null
      };

      const result = service.calculateRealDays(ligne);
      expect(result).toBe(0); // max(0, 10 - 15) = 0
    });

    it('should handle missing values', () => {
      const ligne = {
        joursReels: null
      };

      const result = service.calculateRealDays(ligne);
      expect(result).toBe(0);
    });
  });

  describe('calculateMissionCA', () => {
    it('should return 0 for mission without lignes', () => {
      const mission = { id: '1', tjm: 500 };
      const result = service.calculateMissionCA(mission);

      expect(result).toBe(0);
    });

    it('should calculate total CA from lignes', () => {
      const mission = {
        id: '1',
        tjm: 500,
        lignes: [
          { joursPrevus: 20, conges: 0, joursReels: null },
          { joursPrevus: 22, conges: 2, joursReels: null },
          { joursPrevus: 18, conges: 0, joursReels: 15 } // Manual override
        ]
      };

      // Expected: (20 * 500) + ((22-2) * 500) + (15 * 500)
      // = 10000 + 10000 + 7500 = 27500
      const result = service.calculateMissionCA(mission);
      expect(result).toBe(27500);
    });
  });

  describe('getMissionStatus', () => {
    it('should return "ended" for past missions', () => {
      const mission = {
        debut: '2020-01-01',
        fin: '2020-12-31'
      };

      const result = service.getMissionStatus(mission);
      expect(result).toBe('ended');
    });

    it('should return "upcoming" for future missions', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const mission = {
        debut: futureDate.toISOString().slice(0, 10),
        fin: new Date(futureDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      };

      const result = service.getMissionStatus(mission);
      expect(result).toBe('upcoming');
    });

    it('should return "active" for current missions', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const mission = {
        debut: past.toISOString().slice(0, 10),
        fin: future.toISOString().slice(0, 10)
      };

      const result = service.getMissionStatus(mission);
      expect(result).toBe('active');
    });
  });

  describe('createMission', () => {
    it('should create mission with default values', () => {
      const mission = service.createMission();

      expect(mission.id).toMatch(/^M\d+$/);
      expect(mission.client).toBe('');
      expect(mission.tjm).toBe(0);
      expect(mission.lignes).toEqual([]);
      expect(mission.factures).toEqual([]);
    });

    it('should create mission with provided data', () => {
      const data = {
        client: 'Test Client',
        titre: 'Test Mission',
        debut: '2025-01-01',
        fin: '2025-03-31',
        tjm: 600
      };

      const mission = service.createMission(data);

      expect(mission.client).toBe('Test Client');
      expect(mission.titre).toBe('Test Mission');
      expect(mission.tjm).toBe(600);
      expect(mission.lignes).toHaveLength(3); // 3 months
    });
  });
});
