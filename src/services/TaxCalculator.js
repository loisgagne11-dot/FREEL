/**
 * Service de calculs fiscaux pour micro-entrepreneurs
 * URSSAF, IR, TVA, etc.
 */

import { LEGAL, IR_BRACKETS_2025, IR_BRACKETS_2026 } from '../config.js';

class TaxCalculator {
  /**
   * Arrondir au centime près (éviter problèmes IEEE 754)
   * @param {number} value
   * @returns {number}
   */
  round(value) {
    return Math.round(value * 100) / 100;
  }

  /**
   * Calculer les cotisations URSSAF
   * @param {number} ca - Chiffre d'affaires HT
   * @param {number} year - Année
   * @param {boolean} acre - Bénéficie de l'ACRE
   * @returns {number} Montant URSSAF + CFP
   */
  calculateURSSAF(ca, year, acre = false) {
    if (!ca || ca <= 0) return 0;

    let rate;
    if (acre) {
      rate = year === 2025 ? LEGAL.urssafAcre2025 : LEGAL.urssafAcre2026;
    } else {
      rate = year === 2025 ? LEGAL.urssafStd2025 : LEGAL.urssafStd2026;
    }

    const urssaf = ca * rate;
    const cfp = ca * LEGAL.cfp;

    return urssaf + cfp;
  }

  /**
   * Calculer l'impôt sur le revenu (IR)
   * @param {number} ca - Chiffre d'affaires HT
   * @param {object} config - Configuration IR
   * @returns {object} { ir, details }
   */
  calculateIR(ca, config = {}) {
    const {
      parts = 1,
      abattement = 0.34, // 34% pour BNC
      versementLib = false,
      year = new Date().getFullYear()
    } = config;

    if (!ca || ca <= 0) {
      return { ir: 0, revenuImposable: 0, details: [] };
    }

    // Revenu imposable après abattement (arrondi au centime)
    const revenuImposable = this.round(ca * (1 - abattement));
    const quotientFamilial = this.round(revenuImposable / parts);

    if (versementLib) {
      // Versement libératoire : 2.2% du CA
      const ir = ca * LEGAL.impLib;
      return {
        ir,
        revenuImposable,
        quotientFamilial,
        details: [{
          tranche: 'Versement libératoire',
          taux: LEGAL.impLib,
          montant: ir
        }]
      };
    }

    // Calcul par tranches (utiliser les tranches de l'année appropriée)
    const brackets = year >= 2026 ? IR_BRACKETS_2026 : IR_BRACKETS_2025;
    let ir = 0;
    const details = [];

    for (const bracket of brackets) {
      if (quotientFamilial <= bracket.min) break;

      const base = Math.min(quotientFamilial, bracket.max) - bracket.min;
      const montant = base * bracket.rate;

      if (montant > 0) {
        details.push({
          tranche: `${bracket.min}€ - ${bracket.max === Infinity ? '∞' : bracket.max + '€'}`,
          base,
          taux: bracket.rate,
          montant
        });
        ir += montant;
      }
    }

    // Multiplier par nombre de parts
    ir *= parts;

    return {
      ir,
      revenuImposable,
      quotientFamilial,
      details
    };
  }

  /**
   * Calculer la TVA
   * @param {number} caHT - CA Hors Taxe
   * @param {string} month - Mois au format YYYY-MM
   * @param {number} achatsHT - Achats professionnels HT (optionnel)
   * @returns {object} { tvaCollectee, tvaDeductible, tvaDue, caHT, caTTC, assujetti }
   */
  calculateTVA(caHT, month, achatsHT = 0) {
    // Vérifier si assujetti à la TVA
    if (month < LEGAL.tvaStartMonth) {
      return {
        tvaCollectee: 0,
        tvaDeductible: 0,
        tvaDue: 0,
        caHT,
        caTTC: caHT,
        assujetti: false
      };
    }

    // TVA collectée sur les ventes
    const tvaCollectee = this.round(caHT * LEGAL.tvaRate);
    const caTTC = caHT + tvaCollectee;

    // TVA déductible sur les achats professionnels
    const tvaDeductible = this.round(achatsHT * LEGAL.tvaRate);

    // TVA due = TVA collectée - TVA déductible
    const tvaDue = this.round(tvaCollectee - tvaDeductible);

    return {
      tvaCollectee,
      tvaDeductible,
      tvaDue: Math.max(0, tvaDue), // Ne peut pas être négatif (crédit de TVA géré séparément)
      caHT,
      caTTC,
      achatsHT,
      assujetti: true
    };
  }

  /**
   * Calculer le taux de charges total
   * @param {number} year - Année
   * @param {boolean} acre - ACRE
   * @param {boolean} versementLib - Versement libératoire
   * @param {number} abattement - Taux d'abattement IR
   * @returns {number} Taux de charges total
   */
  getTotalChargeRate(year, acre = false, versementLib = false, abattement = 0.34) {
    // URSSAF + CFP
    let urssafRate = acre
      ? (year === 2025 ? LEGAL.urssafAcre2025 : LEGAL.urssafAcre2026)
      : (year === 2025 ? LEGAL.urssafStd2025 : LEGAL.urssafStd2026);

    const cfpRate = LEGAL.cfp;

    // IR
    let irRate;
    if (versementLib) {
      irRate = LEGAL.impLib;
    } else {
      // Approximation : taux moyen de 11% sur revenu après abattement
      // (dépend du nombre de parts et tranches, simplifié ici)
      irRate = 0.11 * (1 - abattement);
    }

    return urssafRate + cfpRate + irRate;
  }

  /**
   * Calculer les provisions mensuelles
   * @param {number} ca - CA du mois
   * @param {number} year - Année
   * @param {object} config - Config fiscale
   * @returns {object} Provisions détaillées
   */
  calculateProvisions(ca, year, config = {}) {
    const {
      acre = false,
      versementLib = false,
      abattement = 0.34,
      parts = 1,
      month = null, // Mois pour la TVA (YYYY-MM)
      achatsHT = 0  // Achats professionnels pour TVA déductible
    } = config;

    if (!ca || ca <= 0) {
      return {
        urssaf: 0,
        ir: 0,
        tva: 0,
        total: 0
      };
    }

    const urssaf = this.calculateURSSAF(ca, year, acre);
    const { ir } = this.calculateIR(ca, { parts, abattement, versementLib, year });

    // Calculer la TVA si mois fourni
    let tvaDue = 0;
    if (month) {
      const tvaResult = this.calculateTVA(ca, month, achatsHT);
      tvaDue = tvaResult.tvaDue;
    }

    return {
      urssaf,
      ir,
      tva: tvaDue,
      total: urssaf + ir + tvaDue
    };
  }

  /**
   * Calculer le revenu net (après charges sociales et IR)
   * @param {number} ca - CA
   * @param {number} year - Année
   * @param {object} config - Config
   * @returns {object} Détails revenu net
   */
  calculateRevenuNet(ca, year, config = {}) {
    if (!ca || ca <= 0) {
      return {
        ca,
        urssaf: 0,
        ir: 0,
        totalCharges: 0,
        revenuNet: 0,
        tauxCharge: 0
      };
    }

    const provisions = this.calculateProvisions(ca, year, config);
    const totalCharges = provisions.total;
    const revenuNet = ca - totalCharges;
    const tauxCharge = totalCharges / ca;

    return {
      ca,
      urssaf: provisions.urssaf,
      ir: provisions.ir,
      totalCharges,
      revenuNet,
      tauxCharge
    };
  }

  /**
   * Vérifier si une mission est assujettie à la TVA
   * @param {string} startMonth - Date de début YYYY-MM
   * @param {string} endMonth - Date de fin YYYY-MM
   * @returns {boolean}
   */
  isTVAApplicable(startMonth, endMonth) {
    return endMonth >= LEGAL.tvaStartMonth;
  }

  /**
   * Calculer le plafond micro-entreprise
   * @param {string} activity - Type d'activité
   * @param {number} year - Année
   * @returns {number} Plafond CA annuel
   */
  getCAPlafond(activity = 'service', year = new Date().getFullYear()) {
    const plafonds = year >= 2026 ? {
      service: LEGAL.plafondService2026,
      vente: LEGAL.plafondVente2026,
      mixte: LEGAL.plafondVente2026
    } : {
      service: LEGAL.plafondService2025,
      vente: LEGAL.plafondVente2025,
      mixte: LEGAL.plafondVente2025
    };

    return plafonds[activity] || plafonds.service;
  }

  /**
   * Vérifier le dépassement de plafond
   * @param {number} ca - CA annuel
   * @param {string} activity - Type d'activité
   * @param {number} year - Année
   * @returns {object} État du plafond
   */
  checkPlafond(ca, activity = 'service', year = new Date().getFullYear()) {
    const plafond = this.getCAPlafond(activity, year);
    const usage = ca / plafond;
    const remaining = Math.max(0, plafond - ca);

    return {
      plafond,
      ca,
      usage,
      remaining,
      exceeded: ca > plafond,
      warning: usage > 0.8 // Alerte à 80%
    };
  }
}

export { TaxCalculator };
export const taxCalculator = new TaxCalculator();
