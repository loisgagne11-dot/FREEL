/**
 * Service de calculs fiscaux pour micro-entrepreneurs
 * URSSAF, IR, TVA, etc.
 */

import { LEGAL, IR_BRACKETS } from '../config.js';

class TaxCalculator {
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
      versementLib = false
    } = config;

    if (!ca || ca <= 0) {
      return { ir: 0, revenuImposable: 0, details: [] };
    }

    // Revenu imposable après abattement
    const revenuImposable = ca * (1 - abattement);
    const quotientFamilial = revenuImposable / parts;

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

    // Calcul par tranches
    let ir = 0;
    const details = [];

    for (const bracket of IR_BRACKETS) {
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
   * @returns {object} { tvaCollectee, tvaDue, caHT, caTTC }
   */
  calculateTVA(caHT, month) {
    // Vérifier si assujetti à la TVA
    if (month < LEGAL.tvaStartMonth) {
      return {
        tvaCollectee: 0,
        tvaDue: 0,
        caHT,
        caTTC: caHT,
        assujetti: false
      };
    }

    const tvaCollectee = caHT * LEGAL.tvaRate;
    const caTTC = caHT + tvaCollectee;

    // TODO: Calculer TVA déductible sur charges
    const tvaDeductible = 0;
    const tvaDue = tvaCollectee - tvaDeductible;

    return {
      tvaCollectee,
      tvaDeductible,
      tvaDue,
      caHT,
      caTTC,
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
      parts = 1
    } = config;

    if (!ca || ca <= 0) {
      return {
        urssaf: 0,
        ir: 0,
        total: 0
      };
    }

    const urssaf = this.calculateURSSAF(ca, year, acre);
    const { ir } = this.calculateIR(ca, { parts, abattement, versementLib });

    return {
      urssaf,
      ir,
      total: urssaf + ir
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
   * @returns {number} Plafond CA annuel
   */
  getCAPlafond(activity = 'service') {
    const plafonds = {
      service: 77700, // Prestations de services (BNC)
      vente: 188700,  // Vente de marchandises (BIC)
      mixte: 188700   // Activité mixte
    };

    return plafonds[activity] || plafonds.service;
  }

  /**
   * Vérifier le dépassement de plafond
   * @param {number} ca - CA annuel
   * @param {string} activity - Type d'activité
   * @returns {object} État du plafond
   */
  checkPlafond(ca, activity = 'service') {
    const plafond = this.getCAPlafond(activity);
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
