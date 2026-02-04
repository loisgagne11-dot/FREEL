/**
 * Composant Score Santé Entreprise (0-100)
 * Évalue la santé financière de l'entreprise sur 4 critères
 */

import { el } from '../utils/dom.js';
import { EUR, PCT } from '../utils/formatters.js';
import { store } from '../services/Store.js';
import { taxCalculator } from '../services/TaxCalculator.js';

/**
 * Calculer le score de santé et ses détails
 */
export function calculateHealthScore() {
  const missions = store.get('missions') || [];
  const company = store.get('company') || {};
  const treasury = store.get('treasury') || { soldeInitial: 0, mouvements: [] };
  const currentYear = new Date().getFullYear();

  // Calculer le CA total HT
  let caTotal = 0;
  let lateInvoicesCount = 0;
  let unpaidInvoicesTotal = 0;
  const today = new Date();

  missions.forEach(mission => {
    (mission.lignes || []).forEach(ligne => {
      const tjm = parseFloat(mission.tjm) || 0;
      const jours = parseFloat(ligne.joursReels) || 0;
      caTotal += tjm * jours;

      // Vérifier les factures en retard
      if (ligne.datePaiement === null && ligne.dateEmission) {
        const emissionDate = new Date(ligne.dateEmission);
        const daysLate = Math.floor((today - emissionDate) / (1000 * 60 * 60 * 24));
        if (daysLate > 30) {
          lateInvoicesCount++;
          unpaidInvoicesTotal += tjm * jours;
        }
      }
    });
  });

  // Calculer les provisions
  const provisions = taxCalculator.calculateProvisions(caTotal, currentYear, company.config || {});

  // Trésorerie
  const soldeActuel = treasury.soldeInitial +
    (treasury.mouvements || []).reduce((sum, m) => sum + m.montant, 0);

  // Autonomie (en mois)
  const chargesMonthly = provisions.total / 12;
  const runway = chargesMonthly > 0 ? Math.floor(soldeActuel / chargesMonthly) : 12;

  // Taux de facturation (estimé sur base annuelle)
  const joursFactures = missions.reduce((sum, m) => {
    return sum + (m.lignes || []).reduce((s, l) => s + (parseFloat(l.joursReels) || 0), 0);
  }, 0);
  const tauxFacturation = Math.min(1, joursFactures / 218); // 218 jours ouvrés/an

  let score = 100;
  const details = [];

  // Critère 1: Trésorerie (25 points)
  let tresoScore = 25;
  if (soldeActuel < 0) {
    tresoScore = 0;
    details.push({ icon: '🔴', label: 'Cash négatif', impact: -25 });
  } else if (runway < 2) {
    tresoScore = 5;
    details.push({ icon: '🟠', label: 'Autonomie < 2 mois', impact: -20 });
  } else if (runway < 4) {
    tresoScore = 15;
    details.push({ icon: '🟡', label: 'Autonomie < 4 mois', impact: -10 });
  } else {
    details.push({ icon: '🟢', label: 'Trésorerie saine', impact: 0 });
  }
  score = score - 25 + tresoScore;

  // Critère 2: Retards (25 points)
  let retardScore = 25;
  if (lateInvoicesCount > 3) {
    retardScore = 0;
    details.push({ icon: '🔴', label: `${lateInvoicesCount} factures en retard`, impact: -25 });
  } else if (lateInvoicesCount > 0) {
    retardScore = 25 - (lateInvoicesCount * 8);
    details.push({ icon: '🟠', label: `${lateInvoicesCount} facture(s) en retard`, impact: -(lateInvoicesCount * 8) });
  } else {
    details.push({ icon: '🟢', label: 'Aucun retard', impact: 0 });
  }
  score = score - 25 + retardScore;

  // Critère 3: Seuils légaux (25 points)
  let seuilScore = 25;
  const SEUIL_MICRO_BNC = 77700;
  const pctMicro = caTotal / SEUIL_MICRO_BNC;

  if (pctMicro >= 1) {
    seuilScore = 0;
    details.push({ icon: '🔴', label: 'Seuil micro dépassé!', impact: -25 });
  } else if (pctMicro >= 0.9) {
    seuilScore = 5;
    details.push({ icon: '🟠', label: 'Proche seuil micro', impact: -20 });
  } else {
    details.push({ icon: '🟢', label: 'Seuils OK', impact: 0 });
  }
  score = score - 25 + seuilScore;

  // Critère 4: Activité (25 points)
  let actScore = 25;
  if (tauxFacturation < 0.5) {
    actScore = 5;
    details.push({ icon: '🟠', label: 'Taux facturation faible', impact: -20 });
  } else if (tauxFacturation < 0.7) {
    actScore = 15;
    details.push({ icon: '🟡', label: 'Taux facturation moyen', impact: -10 });
  } else {
    details.push({ icon: '🟢', label: 'Bonne activité', impact: 0 });
  }
  score = score - 25 + actScore;

  // Déterminer le niveau et le label
  const finalScore = Math.max(0, Math.round(score));
  let level, label;

  if (finalScore >= 80) {
    level = 'excellent';
    label = 'Excellente';
  } else if (finalScore >= 60) {
    level = 'good';
    label = 'Bonne';
  } else if (finalScore >= 40) {
    level = 'warning';
    label = 'À surveiller';
  } else {
    level = 'danger';
    label = 'Critique';
  }

  return {
    score: finalScore,
    level,
    label,
    details,
    metrics: {
      cash: soldeActuel,
      runway,
      lateCount: lateInvoicesCount,
      tauxFacturation
    }
  };
}

/**
 * Créer le widget Score Santé
 */
export function createHealthScoreWidget(onClick) {
  const health = calculateHealthScore();

  const widget = el('div', {
    className: 'health-score-widget',
    onClick: onClick || (() => showHealthScoreDetail(health))
  });

  // Header avec titre
  const header = el('div', { className: 'health-score-header' });
  header.appendChild(el('h3', { className: 'widget-title' }, [
    el('span', {}, '💚'),
    el('span', {}, 'Santé Entreprise')
  ]));

  // Score principal avec cercle coloré
  const scoreSection = el('div', { className: 'health-score-main' });

  const scoreCircle = el('div', {
    className: `health-score-circle ${health.level}`
  }, health.score.toString());

  const scoreInfo = el('div', { className: 'health-score-info' });
  scoreInfo.appendChild(el('div', { className: 'health-score-label' }, health.label));
  scoreInfo.appendChild(el('div', { className: 'health-score-sub' }, 'Cliquer pour détails'));

  scoreSection.appendChild(scoreCircle);
  scoreSection.appendChild(scoreInfo);

  // Métriques rapides
  const metricsGrid = el('div', { className: 'health-metrics-grid' });

  const metrics = [
    { icon: '💰', value: EUR(health.metrics.cash), label: 'Cash' },
    { icon: '📊', value: PCT(health.metrics.tauxFacturation), label: 'Activité' },
    { icon: '⏱️', value: `${health.metrics.runway} mois`, label: 'Autonomie' },
    { icon: '⚠️', value: health.metrics.lateCount.toString(), label: 'Retards' }
  ];

  metrics.forEach(metric => {
    const metricEl = el('div', { className: 'health-metric' });
    metricEl.appendChild(el('div', { className: 'health-metric-icon' }, metric.icon));
    metricEl.appendChild(el('div', { className: 'health-metric-value' }, metric.value));
    metricEl.appendChild(el('div', { className: 'health-metric-label' }, metric.label));
    metricsGrid.appendChild(metricEl);
  });

  widget.appendChild(header);
  widget.appendChild(scoreSection);
  widget.appendChild(metricsGrid);

  return widget;
}

/**
 * Afficher le détail du score santé dans une modal
 */
function showHealthScoreDetail(health) {
  // TODO: Implémenter une modal avec le détail complet
  // Pour l'instant, utiliser un simple alert
  const message = `Score: ${health.score}/100 - ${health.label}\n\n` +
    health.details.map(d => `${d.icon} ${d.label} (${d.impact >= 0 ? '+' : ''}${d.impact} pts)`).join('\n');

  alert(message);
}

export default {
  calculateHealthScore,
  createHealthScoreWidget
};
