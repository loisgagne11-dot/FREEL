/**
 * Composant Chart.js réutilisable
 * Wrapper pour Chart.js avec thème intégré
 */

import { store } from '../services/Store.js';

// Lazy load Chart.js
let Chart = null;

async function loadChartJS() {
  if (Chart) return Chart;

  const module = await import('chart.js/auto');
  Chart = module.default || module.Chart;

  // Register defaults
  Chart.defaults.color = 'rgba(255, 255, 255, 0.8)';
  Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
  Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  return Chart;
}

/**
 * Classe Chart réutilisable
 */
export class ChartComponent {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.chartInstance = null;
    this.themeUnsubscribe = null;

    this.init();
  }

  async init() {
    await loadChartJS();

    // Apply theme-aware defaults
    this.applyTheme();

    // Create chart
    this.chartInstance = new Chart(this.canvas, this.getChartConfig());

    // Listen to theme changes
    this.themeUnsubscribe = store.on('theme', () => {
      this.applyTheme();
      this.update();
    });
  }

  applyTheme() {
    const theme = store.get('theme') || 'dark';
    const isDark = theme === 'dark';

    if (Chart) {
      Chart.defaults.color = isDark
        ? 'rgba(255, 255, 255, 0.8)'
        : 'rgba(0, 0, 0, 0.8)';
      Chart.defaults.borderColor = isDark
        ? 'rgba(255, 255, 255, 0.1)'
        : 'rgba(0, 0, 0, 0.1)';
    }
  }

  getChartConfig() {
    const baseConfig = {
      type: this.config.type || 'line',
      data: this.config.data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: this.config.showLegend !== false,
            position: this.config.legendPosition || 'top',
            labels: {
              padding: 16,
              usePointStyle: true,
              font: {
                size: 12,
                weight: '500'
              }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            padding: 12,
            borderColor: 'rgba(132, 94, 247, 0.5)',
            borderWidth: 1,
            titleFont: {
              size: 14,
              weight: '600'
            },
            bodyFont: {
              size: 13
            },
            callbacks: this.config.tooltipCallbacks || {}
          }
        },
        ...this.config.options
      }
    };

    return baseConfig;
  }

  update(data) {
    if (!this.chartInstance) return;

    if (data) {
      this.chartInstance.data = data;
    }

    this.chartInstance.update();
  }

  destroy() {
    if (this.themeUnsubscribe) {
      this.themeUnsubscribe();
    }

    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }
}

/**
 * Fonction helper pour créer rapidement des graphiques
 */
export async function createChart(canvas, config) {
  return new ChartComponent(canvas, config);
}

/**
 * Configurations prédéfinies pour les graphiques courants
 */
export const ChartPresets = {
  /**
   * Graphique linéaire pour évolution du CA
   */
  caEvolution(labels, data, options = {}) {
    return {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Chiffre d\'affaires',
          data,
          borderColor: '#845EF7',
          backgroundColor: 'rgba(132, 94, 247, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#845EF7',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return new Intl.NumberFormat('fr-FR', {
                  style: 'currency',
                  currency: 'EUR',
                  minimumFractionDigits: 0
                }).format(value);
              }
            }
          }
        }
      },
      tooltipCallbacks: {
        label: function(context) {
          return 'CA : ' + new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR'
          }).format(context.parsed.y);
        }
      },
      ...options
    };
  },

  /**
   * Graphique en barres pour charges mensuelles
   */
  chargesMonthly(labels, urssafData, irData, options = {}) {
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'URSSAF',
            data: urssafData,
            backgroundColor: 'rgba(132, 94, 247, 0.8)',
            borderColor: '#845EF7',
            borderWidth: 1
          },
          {
            label: 'IR',
            data: irData,
            backgroundColor: 'rgba(250, 82, 82, 0.8)',
            borderColor: '#FA5252',
            borderWidth: 1
          }
        ]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            stacked: options.stacked || false,
            ticks: {
              callback: function(value) {
                return new Intl.NumberFormat('fr-FR', {
                  style: 'currency',
                  currency: 'EUR',
                  minimumFractionDigits: 0
                }).format(value);
              }
            }
          },
          x: {
            stacked: options.stacked || false
          }
        }
      },
      tooltipCallbacks: {
        label: function(context) {
          return context.dataset.label + ' : ' + new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR'
          }).format(context.parsed.y);
        }
      },
      ...options
    };
  },

  /**
   * Graphique circulaire pour répartition clients
   */
  clientsBreakdown(labels, data, options = {}) {
    return {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: [
            '#845EF7',
            '#51CF66',
            '#FF6B6B',
            '#4DABF7',
            '#FFD43B',
            '#FF8787',
            '#69DB7C',
            '#74C0FC'
          ],
          borderWidth: 2,
          borderColor: 'rgba(0, 0, 0, 0.1)'
        }]
      },
      options: {
        plugins: {
          legend: {
            position: 'right'
          }
        },
        cutout: '60%'
      },
      tooltipCallbacks: {
        label: function(context) {
          const label = context.label || '';
          const value = context.parsed || 0;
          const total = context.dataset.data.reduce((a, b) => a + b, 0);
          const percentage = ((value / total) * 100).toFixed(1);
          return `${label} : ${new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR'
          }).format(value)} (${percentage}%)`;
        }
      },
      ...options
    };
  },

  /**
   * Graphique en barres pour taux de charge mensuel
   */
  tauxCharge(labels, data, options = {}) {
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Taux de charge',
          data,
          backgroundColor: data.map(val => {
            if (val < 25) return 'rgba(81, 207, 102, 0.8)'; // Vert
            if (val < 35) return 'rgba(255, 212, 59, 0.8)'; // Jaune
            return 'rgba(250, 82, 82, 0.8)'; // Rouge
          }),
          borderWidth: 1
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: function(value) {
                return value + '%';
              }
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      },
      tooltipCallbacks: {
        label: function(context) {
          return 'Taux de charge : ' + context.parsed.y.toFixed(1) + '%';
        }
      },
      ...options
    };
  },

  /**
   * Graphique multi-lignes pour CA vs Bénéfice
   */
  caVsBenefice(labels, caData, beneficeData, options = {}) {
    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Chiffre d\'affaires',
            data: caData,
            borderColor: '#845EF7',
            backgroundColor: 'rgba(132, 94, 247, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.4
          },
          {
            label: 'Bénéfice net',
            data: beneficeData,
            borderColor: '#51CF66',
            backgroundColor: 'rgba(81, 207, 102, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return new Intl.NumberFormat('fr-FR', {
                  style: 'currency',
                  currency: 'EUR',
                  minimumFractionDigits: 0
                }).format(value);
              }
            }
          }
        }
      },
      tooltipCallbacks: {
        label: function(context) {
          return context.dataset.label + ' : ' + new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR'
          }).format(context.parsed.y);
        }
      },
      ...options
    };
  }
};
