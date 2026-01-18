/**
 * Vue Dashboard - Exemple de vue refactorisée
 */

import { el } from '../utils/dom.js';
import { store } from '../services/Store.js';
import { EUR, PCT, fmtMonth } from '../utils/formatters.js';
import { taxCalculator } from '../services/TaxCalculator.js';

export class DashboardView {
  constructor() {
    this.container = null;
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
   * Créer la section urgences
   */
  createUrgencesSection() {
    return el('section', { className: 'dashboard-section' }, [
      el('h2', { className: 'dashboard-section-title' }, [
        el('span', {}, '🚨'),
        el('span', {}, 'Urgences')
      ]),
      el('div', { className: 'card' }, [
        el('p', { style: { color: 'var(--color-text-secondary)' } },
          'Aucune urgence pour le moment'
        )
      ])
    ]);
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
   * Render
   */
  render() {
    const kpis = this.calculateKPIs();

    this.container = el('div', { className: 'container' }, [
      el('h1', {
        style: { marginBottom: 'var(--spacing-xl)' }
      }, `Dashboard - ${fmtMonth(new Date().getFullYear(), new Date().getMonth() + 1)}`),

      this.createUrgencesSection(),
      this.createPerformanceSection(kpis),
      this.createTresorerieSection(kpis)
    ]);

    return this.container;
  }

  /**
   * Détruire la vue
   */
  destroy() {
    // Cleanup si nécessaire
  }
}
