/**
 * Service de calcul des statistiques pour les graphiques
 */

import { store } from './Store.js';
import { taxCalculator } from './TaxCalculator.js';

class StatsService {
  /**
   * Récupère l'évolution du CA mensuel pour une période
   */
  getCAEvolution(startMonth, endMonth) {
    const missions = store.get('missions') || [];
    const months = this.getMonthsRange(startMonth, endMonth);

    const data = months.map(ym => {
      let totalCA = 0;

      missions.forEach(mission => {
        const ligne = mission.lignes?.find(l => l.ym === ym);
        if (ligne) {
          const tjm = parseFloat(mission.tjm) || 0;
          const jours = parseFloat(ligne.joursReels) || 0;
          totalCA += tjm * jours;
        }
      });

      return totalCA;
    });

    return {
      labels: months.map(ym => this.formatMonthLabel(ym)),
      data
    };
  }

  /**
   * Récupère l'évolution CA vs Bénéfice
   */
  getCAVsBenefice(startMonth, endMonth) {
    const missions = store.get('missions') || [];
    const company = store.get('company') || {};
    const config = company.config || {};
    const months = this.getMonthsRange(startMonth, endMonth);

    const caData = [];
    const beneficeData = [];

    months.forEach(ym => {
      let totalCA = 0;

      missions.forEach(mission => {
        const ligne = mission.lignes?.find(l => l.ym === ym);
        if (ligne) {
          const tjm = parseFloat(mission.tjm) || 0;
          const jours = parseFloat(ligne.joursReels) || 0;
          totalCA += tjm * jours;
        }
      });

      // Calculer les charges pour ce CA
      const year = parseInt(ym.split('-')[0]);
      const charges = taxCalculator.calculateProvisions(totalCA, year, config);
      const benefice = totalCA - charges.total;

      caData.push(totalCA);
      beneficeData.push(benefice);
    });

    return {
      labels: months.map(ym => this.formatMonthLabel(ym)),
      caData,
      beneficeData
    };
  }

  /**
   * Récupère les charges mensuelles (URSSAF + IR)
   */
  getChargesMonthly(startMonth, endMonth) {
    const missions = store.get('missions') || [];
    const company = store.get('company') || {};
    const config = company.config || {};
    const months = this.getMonthsRange(startMonth, endMonth);

    const urssafData = [];
    const irData = [];

    months.forEach(ym => {
      let totalCA = 0;

      missions.forEach(mission => {
        const ligne = mission.lignes?.find(l => l.ym === ym);
        if (ligne) {
          const tjm = parseFloat(mission.tjm) || 0;
          const jours = parseFloat(ligne.joursReels) || 0;
          totalCA += tjm * jours;
        }
      });

      // Calculer les charges
      const year = parseInt(ym.split('-')[0]);
      const urssaf = taxCalculator.calculateURSSAF(totalCA, year, config.acre);
      const ir = config.versementLib
        ? taxCalculator.calculateImpotLib(totalCA)
        : 0;

      urssafData.push(urssaf);
      irData.push(ir);
    });

    return {
      labels: months.map(ym => this.formatMonthLabel(ym)),
      urssafData,
      irData
    };
  }

  /**
   * Récupère le taux de charge mensuel
   */
  getTauxCharge(startMonth, endMonth) {
    const missions = store.get('missions') || [];
    const company = store.get('company') || {};
    const config = company.config || {};
    const months = this.getMonthsRange(startMonth, endMonth);

    const data = months.map(ym => {
      let totalCA = 0;

      missions.forEach(mission => {
        const ligne = mission.lignes?.find(l => l.ym === ym);
        if (ligne) {
          const tjm = parseFloat(mission.tjm) || 0;
          const jours = parseFloat(ligne.joursReels) || 0;
          totalCA += tjm * jours;
        }
      });

      if (totalCA === 0) return 0;

      // Calculer les charges
      const year = parseInt(ym.split('-')[0]);
      const charges = taxCalculator.calculateProvisions(totalCA, year, config);
      const tauxCharge = (charges.total / totalCA) * 100;

      return tauxCharge;
    });

    return {
      labels: months.map(ym => this.formatMonthLabel(ym)),
      data
    };
  }

  /**
   * Répartition du CA par client
   */
  getClientsBreakdown(startMonth, endMonth) {
    const missions = store.get('missions') || [];
    const months = this.getMonthsRange(startMonth, endMonth);

    const clientCA = {};

    missions.forEach(mission => {
      const client = mission.client || 'Client inconnu';

      months.forEach(ym => {
        const ligne = mission.lignes?.find(l => l.ym === ym);
        if (ligne) {
          const tjm = parseFloat(mission.tjm) || 0;
          const jours = parseFloat(ligne.joursReels) || 0;
          const ca = tjm * jours;

          clientCA[client] = (clientCA[client] || 0) + ca;
        }
      });
    });

    // Trier par CA décroissant
    const sorted = Object.entries(clientCA)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8); // Top 8 clients

    return {
      labels: sorted.map(([client]) => client),
      data: sorted.map(([, ca]) => ca)
    };
  }

  /**
   * Répartition des jours travaillés par client
   */
  getJoursParClient(startMonth, endMonth) {
    const missions = store.get('missions') || [];
    const months = this.getMonthsRange(startMonth, endMonth);

    const clientJours = {};

    missions.forEach(mission => {
      const client = mission.client || 'Client inconnu';

      months.forEach(ym => {
        const ligne = mission.lignes?.find(l => l.ym === ym);
        if (ligne) {
          const jours = parseFloat(ligne.joursReels) || 0;
          clientJours[client] = (clientJours[client] || 0) + jours;
        }
      });
    });

    // Trier par jours décroissant
    const sorted = Object.entries(clientJours)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8); // Top 8 clients

    return {
      labels: sorted.map(([client]) => client),
      data: sorted.map(([, jours]) => jours)
    };
  }

  /**
   * Statistiques annuelles
   */
  getYearStats(year) {
    const missions = store.get('missions') || [];
    const company = store.get('company') || {};
    const config = company.config || {};

    let totalCA = 0;
    let totalJours = 0;

    missions.forEach(mission => {
      if (!mission.lignes) return;

      mission.lignes.forEach(ligne => {
        if (!ligne.ym.startsWith(year.toString())) return;

        const tjm = parseFloat(mission.tjm) || 0;
        const jours = parseFloat(ligne.joursReels) || 0;
        totalCA += tjm * jours;
        totalJours += jours;
      });
    });

    const charges = taxCalculator.calculateProvisions(totalCA, year, config);
    const benefice = totalCA - charges.total;
    const tjmMoyen = totalJours > 0 ? totalCA / totalJours : 0;
    const tauxCharge = totalCA > 0 ? (charges.total / totalCA) * 100 : 0;

    return {
      ca: totalCA,
      jours: totalJours,
      urssaf: charges.urssaf,
      ir: charges.ir,
      totalCharges: charges.total,
      benefice,
      tjmMoyen,
      tauxCharge
    };
  }

  // Helpers

  /**
   * Génère une liste de mois entre deux dates
   */
  getMonthsRange(startMonth, endMonth) {
    const months = [];
    const start = new Date(startMonth + '-01');
    const end = new Date(endMonth + '-01');

    let current = new Date(start);

    while (current <= end) {
      const year = current.getFullYear();
      const month = (current.getMonth() + 1).toString().padStart(2, '0');
      months.push(`${year}-${month}`);

      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }

  /**
   * Formate un mois YYYY-MM en label lisible
   */
  formatMonthLabel(ym) {
    const [year, month] = ym.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);

    return date.toLocaleDateString('fr-FR', {
      month: 'short',
      year: '2-digit'
    });
  }

  /**
   * Récupère les 12 derniers mois depuis aujourd'hui
   */
  getLast12Months() {
    const now = new Date();
    const endYear = now.getFullYear();
    const endMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const endYm = `${endYear}-${endMonth}`;

    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - 11);
    const startYear = startDate.getFullYear();
    const startMonth = (startDate.getMonth() + 1).toString().padStart(2, '0');
    const startYm = `${startYear}-${startMonth}`;

    return { startYm, endYm };
  }

  /**
   * Récupère l'année en cours
   */
  getCurrentYear() {
    return new Date().getFullYear();
  }
}

export const statsService = new StatsService();
