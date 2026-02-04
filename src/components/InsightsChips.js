/**
 * Composant Chips d'Insights
 * Affiche des insights positifs/négatifs sur la santé de l'entreprise
 */

import { el } from '../utils/dom.js';
import { PCT, EUR } from '../utils/formatters.js';
import { store } from '../services/Store.js';
import { taxCalculator } from '../services/TaxCalculator.js';

/**
 * Générer les insights
 */
export function getInsights() {
  const missions = store.get('missions') || [];
  const company = store.get('company') || {};
  const treasury = store.get('treasury') || { soldeInitial: 0, mouvements: [] };
  const insights = [];
  const today = new Date();
  const currentYear = today.getFullYear();

  // Calculer les métriques
  let caTotal = 0;
  let lateCount = 0;

  missions.forEach(mission => {
    (mission.lignes || []).forEach(ligne => {
      const tjm = parseFloat(mission.tjm) || 0;
      const jours = parseFloat(ligne.joursReels) || 0;
      caTotal += tjm * jours;

      if (ligne.datePaiement === null && ligne.dateEmission) {
        const emissionDate = new Date(ligne.dateEmission);
        const daysLate = Math.floor((today - emissionDate) / (1000 * 60 * 60 * 24));
        if (daysLate > 30) lateCount++;
      }
    });
  });

  const provisions = taxCalculator.calculateProvisions(caTotal, currentYear, company.config || {});
  const soldeActuel = treasury.soldeInitial +
    (treasury.mouvements || []).reduce((sum, m) => sum + m.montant, 0);

  const chargesMonthly = provisions.total / 12;
  const runway = chargesMonthly > 0 ? Math.floor(soldeActuel / chargesMonthly) : 12;

  const joursFactures = missions.reduce((sum, m) => {
    return sum + (m.lignes || []).reduce((s, l) => s + (parseFloat(l.joursReels) || 0), 0);
  }, 0);
  const tauxFacturation = Math.min(1, joursFactures / 218);

  // 1. Taux de facturation
  if (tauxFacturation >= 0.85) {
    insights.push({ type: 'positive', text: 'Excellent taux de facturation' });
  } else if (tauxFacturation < 0.6) {
    insights.push({ type: 'negative', text: 'Taux facturation faible' });
  }

  // 2. Autonomie financière
  if (runway >= 6) {
    insights.push({ type: 'positive', text: '+6 mois d\'autonomie' });
  } else if (runway < 3) {
    insights.push({ type: 'negative', text: 'Autonomie < 3 mois' });
  }

  // 3. Retards
  if (lateCount === 0) {
    insights.push({ type: 'positive', text: 'Aucun retard' });
  } else if (lateCount > 0) {
    insights.push({ type: 'negative', text: `${lateCount} retard${lateCount > 1 ? 's' : ''}` });
  }

  // 4. Cash positif
  if (soldeActuel > 10000) {
    insights.push({ type: 'positive', text: 'Cash confortable' });
  } else if (soldeActuel < 0) {
    insights.push({ type: 'negative', text: 'Cash négatif !' });
  }

  // 5. Tendance CA (comparer avec le mois dernier si possible)
  // Pour simplifier, on ne l'ajoute que si on a des données comparables

  return insights.slice(0, 5); // Max 5 insights
}

/**
 * Créer le composant Chips d'Insights
 */
export function createInsightsChips() {
  const insights = getInsights();

  if (insights.length === 0) {
    return null;
  }

  const container = el('div', { className: 'insights-chips-container' });

  insights.forEach(insight => {
    const chip = el('span', {
      className: `insight-chip ${insight.type}`
    }, insight.text);

    container.appendChild(chip);
  });

  return container;
}

export default {
  getInsights,
  createInsightsChips
};
