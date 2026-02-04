/**
 * Vue Dashboard - Vue principale avec KPIs et graphiques
 */

import { el } from '../utils/dom.js';
import { store } from '../services/Store.js';
import { EUR, PCT, fmtMonth } from '../utils/formatters.js';
import { taxCalculator } from '../services/TaxCalculator.js';
import { statsService } from '../services/StatsService.js';
import { createChart, ChartPresets } from '../components/Chart.js';

// Nouveaux composants V50
import { createHealthScoreWidget } from '../components/HealthScore.js';
import { createDailyActionsWidget } from '../components/DailyActions.js';
import { createLegalTimelineWidget } from '../components/LegalTimeline.js';
import { createInsightsChips } from '../components/InsightsChips.js';
import { createGoalWidget } from '../components/GoalWidget.js';
import { createClientsBreakdownWidget } from '../components/ClientsBreakdown.js';
import { createCongesCalendarWidget } from '../components/CongesCalendar.js';
import { createSummarySection } from '../components/SummarySection.js';

export class DashboardView {
  constructor() {
    this.container = null;
    this.charts = [];
  }

  /**
   * Calculer les KPIs
   */
  calculateKPIs() {
    const missions = store.get('missions') || [];
    const treasury = store.get('treasury') || { soldeInitial: 0, mouvements: [] };
    const company = store.get('company') || {};

    // CA total
    const caTotal = missions.reduce((sum, mission) => {
      return sum + (mission.montant || 0);
    }, 0);

    // Calculs fiscaux
    const provisions = taxCalculator.calculateProvisions(
      caTotal,
      new Date().getFullYear(),
      {
        acre: company.acre || false,
        versementLib: company.versementLib || false
      }
    );

    // Trésorerie
    const soldeActuel = treasury.soldeInitial +
      (treasury.mouvements || []).reduce((sum, m) => sum + m.montant, 0);

    return {
      ca: caTotal,
      urssaf: provisions.urssaf,
      ir: provisions.ir,
      totalCharges: provisions.total,
      revenuNet: caTotal - provisions.total,
      tresorerie: soldeActuel,
      missionsActives: missions.filter(m => m.status === 'active').length,
      tauxCharge: caTotal > 0 ? provisions.total / caTotal : 0
    };
  }

  /**
   * Créer une carte KPI
   */
  createKPI(label, value, trend = null) {
    const trendElement = trend ? el('div', {
      className: `kpi-trend ${trend > 0 ? 'positive' : 'negative'}`
    }, [
      el('span', {}, trend > 0 ? '↗' : '↘'),
      el('span', {}, PCT(Math.abs(trend)))
    ]) : null;

    return el('div', { className: 'kpi' }, [
      el('div', { className: 'kpi-label' }, label),
      el('div', { className: 'kpi-value' }, value),
      trendElement
    ].filter(Boolean));
  }

  /**
   * Créer la section V50 widgets (Score Santé, Actions, Timeline, etc.)
   */
  createV50WidgetsSection() {
    const section = el('section', { className: 'dashboard-section' });

    // Insights chips (en haut)
    const insights = createInsightsChips();
    if (insights) {
      section.appendChild(insights);
    }

    // Grille 3 colonnes pour les widgets principaux
    const widgetsGrid = el('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 'var(--spacing-lg)',
        marginBottom: 'var(--spacing-xl)'
      }
    });

    // Score Santé
    const healthScore = createHealthScoreWidget();
    if (healthScore) {
      widgetsGrid.appendChild(healthScore);
    }

    // Actions du Jour
    const dailyActions = createDailyActionsWidget();
    if (dailyActions) {
      widgetsGrid.appendChild(dailyActions);
    }

    // Objectif CA 2026
    const goalWidget = createGoalWidget();
    if (goalWidget) {
      widgetsGrid.appendChild(goalWidget);
    }

    section.appendChild(widgetsGrid);

    // Timeline Jalons Légaux (pleine largeur)
    const legalTimeline = createLegalTimelineWidget();
    if (legalTimeline) {
      section.appendChild(legalTimeline);
    }

    return section;
  }

  /**
   * Créer la section widgets secondaires (Clients, Congés)
   */
  createSecondaryWidgetsSection() {
    const section = el('section', { className: 'dashboard-section' });

    const widgetsGrid = el('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 'var(--spacing-lg)',
        marginBottom: 'var(--spacing-xl)'
      }
    });

    // CA par Client
    const clientsBreakdown = createClientsBreakdownWidget();
    if (clientsBreakdown) {
      widgetsGrid.appendChild(clientsBreakdown);
    }

    // Calendrier Congés
    const congesCalendar = createCongesCalendarWidget();
    if (congesCalendar) {
      widgetsGrid.appendChild(congesCalendar);
    }

    section.appendChild(widgetsGrid);

    return section;
  }

  /**
   * Créer la section performance
   */
  createPerformanceSection(kpis) {
    return el('section', { className: 'dashboard-section' }, [
      el('h2', { className: 'dashboard-section-title' }, [
        el('span', {}, '📈'),
        el('span', {}, 'Performance')
      ]),
      el('div', { className: 'dashboard-grid' }, [
        this.createKPI('Chiffre d\'affaires', EUR(kpis.ca)),
        this.createKPI('Revenu net', EUR(kpis.revenuNet)),
        this.createKPI('URSSAF', EUR(kpis.urssaf)),
        this.createKPI('Impôt sur le revenu', EUR(kpis.ir)),
        this.createKPI('Taux de charge', PCT(kpis.tauxCharge)),
        this.createKPI('Missions actives', kpis.missionsActives.toString())
      ])
    ]);
  }

  /**
   * Créer la section trésorerie
   */
  createTresorerieSection(kpis) {
    return el('section', { className: 'dashboard-section' }, [
      el('h2', { className: 'dashboard-section-title' }, [
        el('span', {}, '💰'),
        el('span', {}, 'Trésorerie')
      ]),
      el('div', { className: 'card' }, [
        el('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }
        }, [
          el('div', {}, [
            el('div', {
              style: {
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--spacing-xs)'
              }
            }, 'Solde actuel'),
            el('div', {
              style: {
                fontSize: 'var(--font-size-2xl)',
                fontWeight: 'var(--font-weight-bold)'
              }
            }, EUR(kpis.tresorerie))
          ]),
          el('button', {
            className: 'btn btn-primary',
            onClick: () => {
              window.location.hash = 'treasury';
            }
          }, 'Voir détails')
        ])
      ])
    ]);
  }

  /**
   * Créer la section graphiques
   */
  createChartsSection() {
    const { startYm, endYm } = statsService.getLast12Months();

    return el('section', { className: 'dashboard-section' }, [
      el('h2', { className: 'dashboard-section-title' }, [
        el('span', {}, '📊'),
        el('span', {}, 'Évolution (12 derniers mois)')
      ]),
      el('div', { className: 'charts-grid' }, [
        // CA Evolution
        el('div', { className: 'chart-card' }, [
          el('h3', { className: 'chart-title' }, 'Chiffre d\'affaires'),
          el('div', { className: 'chart-container' }, [
            el('canvas', { id: 'chart-ca-evolution' })
          ])
        ]),

        // CA vs Bénéfice
        el('div', { className: 'chart-card' }, [
          el('h3', { className: 'chart-title' }, 'CA vs Bénéfice'),
          el('div', { className: 'chart-container' }, [
            el('canvas', { id: 'chart-ca-benefice' })
          ])
        ]),

        // Répartition clients
        el('div', { className: 'chart-card' }, [
          el('h3', { className: 'chart-title' }, 'Répartition par client'),
          el('div', { className: 'chart-container' }, [
            el('canvas', { id: 'chart-clients' })
          ])
        ]),

        // Taux de charge
        el('div', { className: 'chart-card' }, [
          el('h3', { className: 'chart-title' }, 'Taux de charge mensuel'),
          el('div', { className: 'chart-container' }, [
            el('canvas', { id: 'chart-taux-charge' })
          ])
        ])
      ])
    ]);
  }

  /**
   * Initialiser les graphiques
   */
  async initCharts() {
    const { startYm, endYm } = statsService.getLast12Months();

    // CA Evolution
    const caEvolution = statsService.getCAEvolution(startYm, endYm);
    const canvasCA = document.getElementById('chart-ca-evolution');
    if (canvasCA) {
      const chartCA = await createChart(
        canvasCA,
        ChartPresets.caEvolution(caEvolution.labels, caEvolution.data)
      );
      this.charts.push(chartCA);
    }

    // CA vs Bénéfice
    const caBenefice = statsService.getCAVsBenefice(startYm, endYm);
    const canvasCaBenefice = document.getElementById('chart-ca-benefice');
    if (canvasCaBenefice) {
      const chartCaBenefice = await createChart(
        canvasCaBenefice,
        ChartPresets.caVsBenefice(
          caBenefice.labels,
          caBenefice.caData,
          caBenefice.beneficeData
        )
      );
      this.charts.push(chartCaBenefice);
    }

    // Répartition clients
    const clients = statsService.getClientsBreakdown(startYm, endYm);
    const canvasClients = document.getElementById('chart-clients');
    if (canvasClients && clients.labels.length > 0) {
      const chartClients = await createChart(
        canvasClients,
        ChartPresets.clientsBreakdown(clients.labels, clients.data)
      );
      this.charts.push(chartClients);
    }

    // Taux de charge
    const tauxCharge = statsService.getTauxCharge(startYm, endYm);
    const canvasTaux = document.getElementById('chart-taux-charge');
    if (canvasTaux) {
      const chartTaux = await createChart(
        canvasTaux,
        ChartPresets.tauxCharge(tauxCharge.labels, tauxCharge.data)
      );
      this.charts.push(chartTaux);
    }
  }

  /**
   * Render
   */
  render() {
    const kpis = this.calculateKPIs();

    this.container = el('div', { className: 'container' }, [
      el('h1', {
        style: { marginBottom: 'var(--spacing-xl)' }
      }, `Dashboard - ${fmtMonth(new Date().getFullYear(), new Date().getMonth() + 1)}`),

      // Section En Résumé (avec export PDF)
      createSummarySection(),

      // Widgets V50 (Score Santé, Actions du Jour, Objectif, Timeline)
      this.createV50WidgetsSection(),

      // Widgets secondaires (CA par Client, Congés)
      this.createSecondaryWidgetsSection(),

      // Performance (KPIs classiques)
      this.createPerformanceSection(kpis),

      // Trésorerie
      this.createTresorerieSection(kpis),

      // Graphiques (Charts)
      this.createChartsSection()
    ]);

    // Initialiser les graphiques après le render
    setTimeout(() => {
      this.initCharts();
    }, 0);

    return this.container;
  }

  /**
   * Détruire la vue
   */
  destroy() {
    // Détruire tous les graphiques
    this.charts.forEach(chart => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
    this.charts = [];
  }
}
