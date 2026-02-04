/**
 * Composant Section "En Résumé"
 * Affiche un résumé textuel de la situation avec export PDF
 */

import { el } from '../utils/dom.js';
import { EUR, PCT } from '../utils/formatters.js';
import { store } from '../services/Store.js';
import { taxCalculator } from '../services/TaxCalculator.js';
import { calculateHealthScore } from './HealthScore.js';

/**
 * Générer le résumé textuel
 */
export function generateSummary() {
  const missions = store.get('missions') || [];
  const company = store.get('company') || {};
  const treasury = store.get('treasury') || { soldeInitial: 0, mouvements: [] };
  const currentYear = new Date().getFullYear();

  // Calculer le CA
  let caTotal = 0;
  missions.forEach(mission => {
    (mission.lignes || []).forEach(ligne => {
      const tjm = parseFloat(mission.tjm) || 0;
      const jours = parseFloat(ligne.joursReels) || 0;
      caTotal += tjm * jours;
    });
  });

  // Provisions
  const provisions = taxCalculator.calculateProvisions(caTotal, currentYear, company.config || {});

  // Trésorerie
  const soldeActuel = treasury.soldeInitial +
    (treasury.mouvements || []).reduce((sum, m) => sum + m.montant, 0);

  // Autonomie
  const chargesMonthly = provisions.total / 12;
  const runway = chargesMonthly > 0 ? Math.floor(soldeActuel / chargesMonthly) : 12;

  // Score santé
  const health = calculateHealthScore();

  // Charges à payer
  const chargesAPayer = provisions.total;

  // Salaire disponible
  const salaireDisponible = Math.max(0, soldeActuel - provisions.total);

  return {
    health,
    caEncaisse: caTotal,
    cashDisponible: soldeActuel,
    runway,
    chargesAPayer,
    salaireDisponible,
    caNet: caTotal - provisions.total
  };
}

/**
 * Créer la section "En Résumé"
 */
export function createSummarySection() {
  const summary = generateSummary();

  const section = el('div', { className: 'summary-section' });

  // Header avec titre et icône
  const header = el('div', { className: 'summary-header' });
  header.appendChild(el('h3', { className: 'summary-title' }, [
    el('span', {}, '📋'),
    el('span', {}, 'En résumé')
  ]));

  // Bouton export PDF
  const exportBtn = el('button', {
    className: 'btn btn-primary btn-sm',
    onClick: handleExportPDF
  }, [
    el('span', {}, '📄'),
    el('span', {}, ' Exporter rapport PDF')
  ]);

  header.appendChild(exportBtn);
  section.appendChild(header);

  // Contenu principal
  const content = el('div', { className: 'summary-content' });

  // Icône de situation
  const situationIcon = summary.health.score >= 80 ? '🎉' :
                         summary.health.score >= 60 ? '😊' :
                         summary.health.score >= 40 ? '😐' : '😟';

  // Texte du résumé
  const mainText = el('p', { className: 'summary-main-text' }, [
    el('strong', {}, `${situationIcon} ${summary.health.label} situation ! `),
    `Ton activité se porte ${summary.health.score >= 70 ? 'très bien' : 'correctement'}.`
  ]);

  content.appendChild(mainText);

  // Métriques clés
  const metrics = el('div', { className: 'summary-metrics' });

  metrics.appendChild(el('div', { className: 'summary-metric' }, [
    el('span', { className: 'summary-metric-label' }, 'CA encaissé : '),
    el('strong', {}, `${EUR(summary.caEncaisse)} ${summary.caEncaisse > 0 ? `(-${PCT((summary.chargesAPayer / summary.caEncaisse))})` : ''}`)
  ]));

  metrics.appendChild(el('div', { className: 'summary-metric' }, [
    el('span', { className: 'summary-metric-label' }, 'Cash disponible : '),
    el('strong', { style: { color: summary.cashDisponible < 0 ? 'var(--color-danger)' : 'var(--color-success)' } },
      `${EUR(summary.cashDisponible)} (${summary.runway} mois d'autonomie)`)
  ]));

  metrics.appendChild(el('div', { className: 'summary-metric' }, [
    el('span', { className: 'summary-metric-label' }, 'Charges à payer : '),
    el('strong', {}, EUR(summary.chargesAPayer))
  ]));

  if (summary.salaireDisponible >= 500) {
    const suggestion = el('div', { className: 'summary-suggestion' }, [
      el('span', {}, '💡 '),
      el('span', {}, `Tu peux te verser ${EUR(Math.floor(summary.salaireDisponible / 100) * 100)} de salaire.`)
    ]);
    metrics.appendChild(suggestion);
  }

  content.appendChild(metrics);
  section.appendChild(content);

  return section;
}

/**
 * Handler pour exporter en PDF
 */
function handleExportPDF() {
  alert('Export PDF en cours de développement...\n\nFonctionnalité disponible prochainement.');

  // TODO: Implémenter l'export PDF avec jsPDF
  // const { jsPDF } = window.jspdf;
  // const doc = new jsPDF();
  // ...
}

export default {
  generateSummary,
  createSummarySection
};
