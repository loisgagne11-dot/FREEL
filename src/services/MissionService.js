/**
 * Service de gestion des missions
 */

import { store } from './Store.js';
import { taxCalculator } from './TaxCalculator.js';
import { LEGAL } from '../config.js';

class MissionService {
  /**
   * Construire/recalculer une mission (lignes mensuelles)
   */
  buildMission(mission) {
    if (!mission.debut || !mission.fin) {
      mission.lignes = [];
      return mission;
    }

    const start = new Date(mission.debut);
    const end = new Date(mission.fin);

    // Validation: vérifier que les dates sont valides
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.error('Invalid dates in mission:', mission.debut, mission.fin);
      mission.lignes = [];
      return mission;
    }

    // Validation: vérifier que la date de fin est après le début
    if (end < start) {
      console.error('End date is before start date:', mission.debut, mission.fin);
      mission.lignes = [];
      return mission;
    }

    // Validation: limite de 120 mois (10 ans) pour éviter les boucles infinies
    const maxMonths = 120;
    const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (monthsDiff > maxMonths) {
      console.error('Mission duration exceeds maximum of 10 years:', monthsDiff, 'months');
      mission.lignes = [];
      return mission;
    }

    const lignes = [];

    let current = new Date(start);
    let iterationCount = 0;
    const maxIterations = maxMonths + 1;

    while (current <= end && iterationCount < maxIterations) {
      iterationCount++;
      const year = current.getFullYear();
      const month = current.getMonth() + 1;
      const ym = `${year}-${String(month).padStart(2, '0')}`;

      // Jours ouvrables du mois (approximation : 22j/mois)
      const joursOuvrables = this.getBusinessDays(year, month, start, end);

      lignes.push({
        ym,
        joursOuvrables,
        joursPrevus: joursOuvrables, // Par défaut = tous les jours
        conges: 0,
        joursReels: null // Calculé dynamiquement
      });

      // Mois suivant
      current.setMonth(current.getMonth() + 1);
    }

    mission.lignes = lignes;
    return mission;
  }

  /**
   * Calculer les jours ouvrables d'un mois (approximation)
   */
  getBusinessDays(year, month, startDate, endDate) {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    // Si la mission ne couvre pas tout le mois
    const start = startDate > firstDay ? startDate : firstDay;
    const end = endDate < lastDay ? endDate : lastDay;

    if (start > end) return 0;

    // Approximation : 5 jours/semaine
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const weeks = days / 7;
    return Math.round(weeks * 5);
  }

  /**
   * Calculer les jours réels d'une ligne
   */
  calculateRealDays(ligne) {
    if (ligne.joursReels !== null) {
      return ligne.joursReels; // Valeur manuelle
    }
    const prevus = ligne.joursPrevus || 0;
    const conges = ligne.conges || 0;
    return Math.max(0, prevus - conges);
  }

  /**
   * Calculer le CA total d'une mission
   */
  calculateMissionCA(mission) {
    if (!mission.lignes) return 0;

    return mission.lignes.reduce((sum, ligne) => {
      const jours = this.calculateRealDays(ligne);
      return sum + (jours * mission.tjm);
    }, 0);
  }

  /**
   * Calculer les statistiques d'une mission
   */
  calculateMissionStats(mission) {
    if (!mission.lignes) {
      return {
        totalJours: 0,
        totalCA: 0,
        totalCharges: 0,
        benefice: 0,
        marge: 0
      };
    }

    let totalJours = 0;
    let totalCA = 0;
    let totalCharges = 0;

    const company = store.get('company') || {};
    const year = new Date().getFullYear();

    mission.lignes.forEach(ligne => {
      const jours = this.calculateRealDays(ligne);
      const ca = jours * mission.tjm;

      totalJours += jours;
      totalCA += ca;

      // Calculer les charges sur ce CA
      const provisions = taxCalculator.calculateProvisions(ca, year, {
        acre: company.acre || false,
        versementLib: company.prelevementLiberatoire || false
      });

      totalCharges += provisions.total;
    });

    const benefice = totalCA - totalCharges;
    const marge = totalCA > 0 ? benefice / totalCA : 0;

    return {
      totalJours,
      totalCA,
      totalCharges,
      benefice,
      marge
    };
  }

  /**
   * Obtenir le statut d'une mission
   */
  getMissionStatus(mission) {
    const now = new Date().toISOString().slice(0, 10);

    if (mission.fin < now) return 'ended';
    if (mission.debut > now) return 'upcoming';
    return 'active';
  }

  /**
   * Obtenir le label du statut
   */
  getStatusLabel(status) {
    const labels = {
      active: 'En cours',
      upcoming: 'À venir',
      ended: 'Terminée'
    };
    return labels[status] || 'Inconnu';
  }

  /**
   * Créer une nouvelle mission
   */
  createMission(data = {}) {
    const mission = {
      id: 'M' + Date.now(),
      client: data.client || '',
      clientId: data.clientId || '',
      titre: data.titre || '',
      site: data.site || '',
      debut: data.debut || '',
      fin: data.fin || '',
      tjm: data.tjm || 0,
      delaiPaiement: data.delaiPaiement || 2,
      jourPaiement: data.jourPaiement || 15,
      adresseClient: data.adresseClient || '',
      numeroCommande: data.numeroCommande || '',
      descriptifFacture: data.descriptifFacture || '',
      lignes: [],
      factures: []
    };

    // Calculer les lignes
    this.buildMission(mission);

    return mission;
  }

  /**
   * Mettre à jour une mission
   */
  updateMission(missionId, updates) {
    const missions = store.get('missions') || [];
    const index = missions.findIndex(m => m.id === missionId);

    if (index === -1) {
      throw new Error('Mission not found');
    }

    const mission = { ...missions[index], ...updates };

    // Recalculer si les dates ont changé
    if (updates.debut || updates.fin) {
      this.buildMission(mission);
    }

    missions[index] = mission;
    store.set('missions', missions);

    return mission;
  }

  /**
   * Supprimer une mission
   */
  deleteMission(missionId) {
    const missions = store.get('missions') || [];
    const filtered = missions.filter(m => m.id !== missionId);
    store.set('missions', filtered);
    return true;
  }

  /**
   * Obtenir une mission par ID
   */
  getMission(missionId) {
    const missions = store.get('missions') || [];
    return missions.find(m => m.id === missionId);
  }

  /**
   * Obtenir toutes les missions
   */
  getAllMissions() {
    return store.get('missions') || [];
  }

  /**
   * Sauvegarder les jours d'une mission
   */
  saveDays(missionId, daysData) {
    const mission = this.getMission(missionId);
    if (!mission) return null;

    // daysData = { ligne0: { joursPrevus: 20, conges: 5 }, ... }
    mission.lignes.forEach((ligne, index) => {
      if (daysData[index]) {
        ligne.joursPrevus = daysData[index].joursPrevus || 0;
        ligne.conges = daysData[index].conges || 0;
      }
    });

    return this.updateMission(missionId, { lignes: mission.lignes });
  }
}

export const missionService = new MissionService();
