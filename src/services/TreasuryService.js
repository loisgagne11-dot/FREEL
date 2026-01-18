/**
 * Service de gestion de la trésorerie
 */

import { store } from './Store.js';
import { taxCalculator } from './TaxCalculator.js';

class TreasuryService {
  /**
   * Calculer le solde actuel de trésorerie
   */
  getCurrentBalance() {
    const treasury = store.get('treasury') || { soldeInitial: 0, mouvements: [] };

    const total = (treasury.mouvements || []).reduce((sum, m) => {
      return sum + (m.montant || 0);
    }, 0);

    return (treasury.soldeInitial || 0) + total;
  }

  /**
   * Ajouter un mouvement de trésorerie
   */
  addMovement(movement) {
    const treasury = store.get('treasury') || { soldeInitial: 0, mouvements: [] };

    const newMovement = {
      id: 'MOV' + Date.now(),
      date: movement.date || new Date().toISOString().slice(0, 10),
      type: movement.type, // 'salaire', 'charge', 'encaissement', 'autre'
      label: movement.label,
      montant: movement.montant, // Positif = crédit, Négatif = débit
      category: movement.category || '',
      mois: movement.mois || '',
      ...movement
    };

    treasury.mouvements = treasury.mouvements || [];
    treasury.mouvements.push(newMovement);

    store.set('treasury', treasury);
    return newMovement;
  }

  /**
   * Supprimer un mouvement
   */
  deleteMovement(movementId) {
    const treasury = store.get('treasury') || { soldeInitial: 0, mouvements: [] };

    treasury.mouvements = (treasury.mouvements || []).filter(m => m.id !== movementId);

    store.set('treasury', treasury);
    return true;
  }

  /**
   * Calculer les intérêts du compte pro pour un mois
   */
  calculateInterest(year, month, averageBalance, rate) {
    if (!rate || rate <= 0 || !averageBalance || averageBalance <= 0) {
      return 0;
    }

    // Taux annuel brut → Taux mensuel
    const monthlyRate = rate / 100 / 12;
    const interest = averageBalance * monthlyRate;

    return Math.round(interest * 100) / 100; // Arrondi à 2 décimales
  }

  /**
   * Calculer le solde moyen d'un mois
   */
  calculateMonthlyAverageBalance(year, month) {
    // TODO: Implémenter le calcul du solde moyen basé sur les mouvements quotidiens
    // Pour l'instant, approximation simple
    return this.getCurrentBalance();
  }

  /**
   * Générer les intérêts historiques
   */
  generateInterestHistory() {
    const treasury = store.get('treasury') || {};

    if (!treasury.rendementActif || !treasury.rendementTaux) {
      return [];
    }

    const history = treasury.rendementHistorique || [];
    const rate = treasury.rendementTaux;

    // Générer les intérêts pour les mois passés si manquants
    // TODO: Implémenter la logique de génération automatique

    return history;
  }

  /**
   * Marquer une charge comme payée
   */
  markChargePaid(chargeId) {
    const treasury = store.get('treasury') || { paidCharges: {} };

    treasury.paidCharges = treasury.paidCharges || {};
    treasury.paidCharges[chargeId] = true;

    store.set('treasury', treasury);
    return true;
  }

  /**
   * Vérifier si une charge est payée
   */
  isChargePaid(chargeId) {
    const treasury = store.get('treasury') || { paidCharges: {} };
    return treasury.paidCharges && treasury.paidCharges[chargeId] === true;
  }

  /**
   * Marquer plusieurs charges comme payées
   */
  markChargesPaid(chargeIds) {
    chargeIds.forEach(id => this.markChargePaid(id));
    return true;
  }

  /**
   * Calculer les statistiques de trésorerie
   */
  calculateStats() {
    const treasury = store.get('treasury') || { soldeInitial: 0, mouvements: [] };
    const missions = store.get('missions') || [];
    const company = store.get('company') || {};

    // Solde actuel
    const soldeActuel = this.getCurrentBalance();

    // Revenus et dépenses du mois
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthMovements = (treasury.mouvements || []).filter(m =>
      m.date && m.date.startsWith(currentMonth)
    );

    const revenus = monthMovements
      .filter(m => m.montant > 0)
      .reduce((sum, m) => sum + m.montant, 0);

    const depenses = monthMovements
      .filter(m => m.montant < 0)
      .reduce((sum, m) => sum + Math.abs(m.montant), 0);

    // Intérêts totaux
    const totalInterets = (treasury.rendementHistorique || [])
      .reduce((sum, h) => sum + (h.montant || 0), 0);

    // Provisions à payer (estimées)
    const year = new Date().getFullYear();
    const caTotal = missions.reduce((sum, mission) => {
      return sum + (mission.lignes || []).reduce((s, ligne) => {
        const jours = this.calculateRealDays(ligne);
        return s + (jours * mission.tjm);
      }, 0);
    }, 0);

    const provisions = taxCalculator.calculateProvisions(caTotal, year, {
      acre: company.acre || false,
      versementLib: company.prelevementLiberatoire || false
    });

    // Cash disponible = solde - provisions
    const cashDisponible = soldeActuel - provisions.total;

    // Runway (autonomie en mois)
    const depenseMoyenne = depenses || 1000; // Estimation minimale
    const runway = cashDisponible > 0 ? Math.floor(cashDisponible / depenseMoyenne) : 0;

    return {
      soldeActuel,
      revenus,
      depenses,
      totalInterets,
      provisions: provisions.total,
      provisionURSSAF: provisions.urssaf,
      provisionIR: provisions.ir,
      cashDisponible,
      runway
    };
  }

  /**
   * Calculer les jours réels (helper)
   */
  calculateRealDays(ligne) {
    if (ligne.joursReels !== null && ligne.joursReels !== undefined) {
      return ligne.joursReels;
    }
    const prevus = ligne.joursPrevus || 0;
    const conges = ligne.conges || 0;
    return Math.max(0, prevus - conges);
  }

  /**
   * Obtenir l'historique des mouvements
   */
  getMovements(filters = {}) {
    const treasury = store.get('treasury') || { mouvements: [] };
    let movements = [...(treasury.mouvements || [])];

    // Filtre par type
    if (filters.type && filters.type !== 'all') {
      movements = movements.filter(m => m.type === filters.type);
    }

    // Filtre par recherche
    if (filters.query) {
      const q = filters.query.toLowerCase();
      movements = movements.filter(m =>
        (m.label && m.label.toLowerCase().includes(q)) ||
        (m.category && m.category.toLowerCase().includes(q)) ||
        (m.detail && m.detail.toLowerCase().includes(q))
      );
    }

    // Tri par date décroissante
    movements.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      return dateB.localeCompare(dateA);
    });

    return movements;
  }

  /**
   * Exporter l'historique en CSV
   */
  exportToCSV() {
    const movements = this.getMovements();

    const headers = ['Date', 'Type', 'Libellé', 'Montant', 'Catégorie'];
    const rows = movements.map(m => [
      m.date,
      m.type,
      m.label,
      m.montant,
      m.category || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return csv;
  }
}

export const treasuryService = new TreasuryService();
