/**
 * Service de gestion des charges sociales et fiscales
 * URSSAF (trimestres) + IR (acomptes)
 */

import { store } from './Store.js';
import { taxCalculator } from './TaxCalculator.js';
import { LEGAL } from '../config.js';

class ChargesService {
  constructor() {
    this.initCharges();
  }

  initCharges() {
    const company = store.get('company') || {};

    if (!company.charges) {
      company.charges = {
        urssaf: [],      // Charges URSSAF trimestrielles
        ir: [],          // Charges IR (acomptes)
        history: []      // Historique des paiements
      };
      store.set('company', company);
    }
  }

  /**
   * Calcule les provisions URSSAF et IR pour une période donnée
   */
  calculateProvisions(startDate, endDate) {
    const missions = store.get('missions') || [];
    const company = store.get('company') || {};
    const config = company.config || {};

    let totalCA = 0;

    // Calculer le CA sur la période
    missions.forEach(mission => {
      if (!mission.lignes) return;

      mission.lignes.forEach(ligne => {
        const ligneDate = new Date(ligne.ym + '-01');
        if (ligneDate >= startDate && ligneDate <= endDate) {
          const tjm = parseFloat(mission.tjm) || 0;
          const jours = parseFloat(ligne.joursReels) || 0;
          totalCA += tjm * jours;
        }
      });
    });

    // Calculer URSSAF
    const year = startDate.getFullYear();
    const acre = config.acre || false;
    const urssaf = taxCalculator.calculateURSSAF(totalCA, year, acre);

    // Calculer IR (versement libératoire)
    const ir = config.versementLib
      ? totalCA * LEGAL.impLib
      : 0; // Si pas de versement lib, l'IR est calculé annuellement

    return {
      ca: totalCA,
      urssaf,
      ir,
      total: urssaf + ir
    };
  }

  /**
   * Génère les charges URSSAF pour une année
   */
  generateURSSAFCharges(year) {
    const company = store.get('company') || {};
    const charges = company.charges || { urssaf: [], ir: [], history: [] };

    // Trimestres (échéances standard)
    const quarters = [
      { quarter: 1, months: ['01', '02', '03'], deadline: `${year}-04-30` },
      { quarter: 2, months: ['04', '05', '06'], deadline: `${year}-07-31` },
      { quarter: 3, months: ['07', '08', '09'], deadline: `${year}-10-31` },
      { quarter: 4, months: ['10', '11', '12'], deadline: `${year + 1}-01-31` }
    ];

    quarters.forEach(q => {
      // Vérifier si la charge existe déjà
      const existing = charges.urssaf.find(c =>
        c.year === year && c.quarter === q.quarter
      );

      if (existing) return;

      // Calculer les provisions pour ce trimestre
      const startDate = new Date(`${year}-${q.months[0]}-01`);
      const endMonth = q.months[q.months.length - 1];
      const endDate = new Date(`${year}-${endMonth}-01`);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0); // Dernier jour du mois

      const provisions = this.calculateProvisions(startDate, endDate);

      const charge = {
        id: `urssaf-${year}-q${q.quarter}`,
        type: 'urssaf',
        year,
        quarter: q.quarter,
        period: `Q${q.quarter} ${year}`,
        months: q.months,
        deadline: q.deadline,
        amount: provisions.urssaf,
        ca: provisions.ca,
        paid: false,
        paidAt: null,
        paidAmount: null
      };

      charges.urssaf.push(charge);
    });

    company.charges = charges;
    store.set('company', company);
  }

  /**
   * Génère les charges IR (versement libératoire) pour une année
   */
  generateIRCharges(year) {
    const company = store.get('company') || {};
    const config = company.config || {};
    const charges = company.charges || { urssaf: [], ir: [], history: [] };

    // Vérifier si versement libératoire activé
    if (!config.versementLib) {
      return; // IR calculé annuellement, pas d'acomptes
    }

    // Générer pour chaque mois
    for (let month = 1; month <= 12; month++) {
      const monthStr = month.toString().padStart(2, '0');
      const ym = `${year}-${monthStr}`;

      // Vérifier si la charge existe déjà
      const existing = charges.ir.find(c => c.ym === ym);
      if (existing) continue;

      // Calculer les provisions pour ce mois
      const startDate = new Date(`${year}-${monthStr}-01`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);

      const provisions = this.calculateProvisions(startDate, endDate);

      const charge = {
        id: `ir-${ym}`,
        type: 'ir',
        year,
        month,
        ym,
        period: new Date(ym).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
        deadline: `${year}-${monthStr}-${month === 12 ? 31 : new Date(year, month, 0).getDate()}`,
        amount: provisions.ir,
        ca: provisions.ca,
        paid: false,
        paidAt: null,
        paidAmount: null
      };

      charges.ir.push(charge);
    }

    company.charges = charges;
    store.set('company', company);
  }

  /**
   * Marque une charge comme payée
   */
  markAsPaid(chargeId, paidAmount, paidDate = new Date().toISOString()) {
    const company = store.get('company') || {};
    const charges = company.charges || { urssaf: [], ir: [], history: [] };

    let charge = null;

    // Chercher dans URSSAF
    charge = charges.urssaf.find(c => c.id === chargeId);
    if (!charge) {
      // Chercher dans IR
      charge = charges.ir.find(c => c.id === chargeId);
    }

    if (!charge) {
      throw new Error('Charge introuvable');
    }

    // Marquer comme payée
    charge.paid = true;
    charge.paidAt = paidDate;
    charge.paidAmount = paidAmount;

    // Ajouter à l'historique
    charges.history.push({
      id: `payment-${Date.now()}`,
      chargeId: charge.id,
      type: charge.type,
      period: charge.period,
      amount: paidAmount,
      expectedAmount: charge.amount,
      date: paidDate,
      year: charge.year
    });

    company.charges = charges;
    store.set('company', company);

    return charge;
  }

  /**
   * Marque une charge comme non payée
   */
  markAsUnpaid(chargeId) {
    const company = store.get('company') || {};
    const charges = company.charges || { urssaf: [], ir: [], history: [] };

    let charge = null;

    // Chercher dans URSSAF
    charge = charges.urssaf.find(c => c.id === chargeId);
    if (!charge) {
      // Chercher dans IR
      charge = charges.ir.find(c => c.id === chargeId);
    }

    if (!charge) {
      throw new Error('Charge introuvable');
    }

    // Marquer comme non payée
    charge.paid = false;
    charge.paidAt = null;
    charge.paidAmount = null;

    // Retirer de l'historique
    charges.history = charges.history.filter(h => h.chargeId !== chargeId);

    company.charges = charges;
    store.set('company', company);

    return charge;
  }

  /**
   * Récupère toutes les charges (URSSAF + IR) pour une année
   */
  getChargesForYear(year) {
    const company = store.get('company') || {};
    const charges = company.charges || { urssaf: [], ir: [], history: [] };

    const urssaf = charges.urssaf.filter(c => c.year === year);
    const ir = charges.ir.filter(c => c.year === year);

    return {
      urssaf,
      ir,
      all: [...urssaf, ...ir].sort((a, b) =>
        new Date(a.deadline) - new Date(b.deadline)
      )
    };
  }

  /**
   * Récupère les charges en retard
   */
  getOverdueCharges() {
    const company = store.get('company') || {};
    const charges = company.charges || { urssaf: [], ir: [], history: [] };
    const now = new Date();

    const overdue = [...charges.urssaf, ...charges.ir].filter(charge => {
      if (charge.paid) return false;
      return new Date(charge.deadline) < now;
    });

    return overdue.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  }

  /**
   * Récupère les charges à venir (prochains 3 mois)
   */
  getUpcomingCharges(months = 3) {
    const company = store.get('company') || {};
    const charges = company.charges || { urssaf: [], ir: [], history: [] };
    const now = new Date();
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + months);

    const upcoming = [...charges.urssaf, ...charges.ir].filter(charge => {
      if (charge.paid) return false;
      const deadline = new Date(charge.deadline);
      return deadline >= now && deadline <= futureDate;
    });

    return upcoming.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  }

  /**
   * Calcule les statistiques des charges
   */
  getChargesStats(year) {
    const { urssaf, ir, all } = this.getChargesForYear(year);

    const stats = {
      urssaf: {
        total: urssaf.reduce((sum, c) => sum + (c.amount || 0), 0),
        paid: urssaf.filter(c => c.paid).reduce((sum, c) => sum + (c.paidAmount || c.amount || 0), 0),
        unpaid: urssaf.filter(c => !c.paid).reduce((sum, c) => sum + (c.amount || 0), 0),
        count: urssaf.length,
        countPaid: urssaf.filter(c => c.paid).length
      },
      ir: {
        total: ir.reduce((sum, c) => sum + (c.amount || 0), 0),
        paid: ir.filter(c => c.paid).reduce((sum, c) => sum + (c.paidAmount || c.amount || 0), 0),
        unpaid: ir.filter(c => !c.paid).reduce((sum, c) => sum + (c.amount || 0), 0),
        count: ir.length,
        countPaid: ir.filter(c => c.paid).length
      },
      total: {
        total: all.reduce((sum, c) => sum + (c.amount || 0), 0),
        paid: all.filter(c => c.paid).reduce((sum, c) => sum + (c.paidAmount || c.amount || 0), 0),
        unpaid: all.filter(c => !c.paid).reduce((sum, c) => sum + (c.amount || 0), 0),
        count: all.length,
        countPaid: all.filter(c => c.paid).length
      }
    };

    return stats;
  }

  /**
   * Recalcule toutes les charges non payées
   */
  recalculateUnpaidCharges() {
    const company = store.get('company') || {};
    const charges = company.charges || { urssaf: [], ir: [], history: [] };

    // Recalculer URSSAF
    charges.urssaf.forEach(charge => {
      if (charge.paid) return;

      const startDate = new Date(`${charge.year}-${charge.months[0]}-01`);
      const endMonth = charge.months[charge.months.length - 1];
      const endDate = new Date(`${charge.year}-${endMonth}-01`);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);

      const provisions = this.calculateProvisions(startDate, endDate);
      charge.amount = provisions.urssaf;
      charge.ca = provisions.ca;
    });

    // Recalculer IR
    charges.ir.forEach(charge => {
      if (charge.paid) return;

      const monthStr = charge.month.toString().padStart(2, '0');
      const startDate = new Date(`${charge.year}-${monthStr}-01`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);

      const provisions = this.calculateProvisions(startDate, endDate);
      charge.amount = provisions.ir;
      charge.ca = provisions.ca;
    });

    company.charges = charges;
    store.set('company', company);
  }

  /**
   * Récupère l'historique des paiements
   */
  getPaymentHistory() {
    const company = store.get('company') || {};
    const charges = company.charges || { urssaf: [], ir: [], history: [] };

    return charges.history.sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );
  }

  /**
   * Exporte les charges en CSV
   */
  exportChargesCSV(year) {
    const { all } = this.getChargesForYear(year);

    const headers = ['Type', 'Période', 'Échéance', 'CA période', 'Montant prévu', 'Montant payé', 'Statut', 'Date paiement'];
    const rows = all.map(charge => [
      charge.type.toUpperCase(),
      charge.period,
      charge.deadline,
      charge.ca?.toFixed(2) || '0.00',
      charge.amount?.toFixed(2) || '0.00',
      charge.paidAmount?.toFixed(2) || '-',
      charge.paid ? 'Payé' : 'Non payé',
      charge.paidAt ? new Date(charge.paidAt).toLocaleDateString('fr-FR') : '-'
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    return csv;
  }
}

// Export class for testing
export { ChargesService };

// Export singleton for app use
export const chargesService = new ChargesService();
