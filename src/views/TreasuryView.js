/**
 * Vue Trésorerie - Cash flow, mouvements, provisions
 */

import { el } from '../utils/dom.js';
import { store } from '../services/Store.js';
import { treasuryService } from '../services/TreasuryService.js';
import { EUR, PCT, fmtDate, fmtMonth } from '../utils/formatters.js';
import { toast } from '../components/Toast.js';

export class TreasuryView {
  constructor() {
    this.container = null;
    this.searchQuery = '';
    this.typeFilter = 'all';
  }

  /**
   * Créer une card KPI
   */
  createKPICard(label, value, subtitle = null, color = null, icon = '') {
    return el('div', {
      className: 'kpi',
      style: color ? { borderLeft: `4px solid ${color}` } : {}
    }, [
      el('div', { className: 'kpi-label' }, `${icon} ${label}`),
      el('div', {
        className: 'kpi-value',
        style: color ? { color } : {}
      }, value),
      subtitle ? el('div', {
        style: {
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
          marginTop: 'var(--spacing-xs)'
        }
      }, subtitle) : null
    ].filter(Boolean));
  }

  /**
   * Créer la section KPIs
   */
  createKPIsSection(stats) {
    return el('section', {
      className: 'dashboard-section',
      style: { marginBottom: 'var(--spacing-xl)' }
    }, [
      el('div', { className: 'dashboard-grid' }, [
        this.createKPICard(
          'Solde actuel',
          EUR(stats.soldeActuel),
          null,
          stats.soldeActuel >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
          '💰'
        ),
        this.createKPICard(
          'Revenus mois',
          EUR(stats.revenus),
          null,
          'var(--color-success)',
          '📈'
        ),
        this.createKPICard(
          'Dépenses mois',
          EUR(stats.depenses),
          null,
          'var(--color-danger)',
          '📉'
        ),
        this.createKPICard(
          'Provisions',
          EUR(stats.provisions),
          `URSSAF: ${EUR(stats.provisionURSSAF)}, IR: ${EUR(stats.provisionIR)}`,
          'var(--color-warning)',
          '📦'
        ),
        this.createKPICard(
          'Cash disponible',
          EUR(stats.cashDisponible),
          `Autonomie: ${stats.runway} mois`,
          stats.cashDisponible >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
          '💵'
        ),
        stats.totalInterets > 0 ? this.createKPICard(
          'Intérêts perçus',
          EUR(stats.totalInterets),
          null,
          'var(--color-success)',
          '📈'
        ) : null
      ].filter(Boolean))
    ]);
  }

  /**
   * Créer la barre de filtres
   */
  createFiltersBar() {
    return el('div', {
      style: {
        display: 'flex',
        gap: 'var(--spacing-md)',
        marginBottom: 'var(--spacing-lg)',
        flexWrap: 'wrap'
      }
    }, [
      // Recherche
      el('div', { style: { flex: '1', minWidth: '200px' } }, [
        el('input', {
          type: 'text',
          className: 'input',
          placeholder: 'Rechercher un mouvement...',
          value: this.searchQuery,
          onInput: (e) => {
            this.searchQuery = e.target.value;
            this.refresh();
          }
        })
      ]),

      // Filtre par type
      el('select', {
        className: 'select',
        style: { minWidth: '150px' },
        value: this.typeFilter,
        onChange: (e) => {
          this.typeFilter = e.target.value;
          this.refresh();
        }
      }, [
        el('option', { value: 'all' }, 'Tous les types'),
        el('option', { value: 'salaire' }, '💸 Salaires'),
        el('option', { value: 'charge' }, '📋 Charges'),
        el('option', { value: 'encaissement' }, '💵 Encaissements'),
        el('option', { value: 'autre' }, '📝 Autres')
      ]),

      // Bouton export
      el('button', {
        className: 'btn btn-ghost',
        onClick: () => this.exportCSV()
      }, '📥 Exporter CSV')
    ]);
  }

  /**
   * Créer une ligne de mouvement
   */
  createMovementRow(movement) {
    const isCredit = movement.montant > 0;
    const typeIcons = {
      salaire: '💸',
      charge: '📋',
      encaissement: '💵',
      autre: '📝'
    };

    return el('tr', {
      style: {
        borderBottom: '1px solid var(--color-border)'
      }
    }, [
      el('td', {
        style: {
          padding: 'var(--spacing-sm)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)'
        }
      }, fmtDate(movement.date)),
      el('td', {
        style: {
          padding: 'var(--spacing-sm)'
        }
      }, [
        el('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-xs)'
          }
        }, [
          el('span', {}, typeIcons[movement.type] || '📝'),
          el('span', {
            style: {
              fontWeight: 'var(--font-weight-medium)'
            }
          }, movement.label || 'Sans libellé')
        ]),
        movement.detail ? el('div', {
          style: {
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            marginTop: '2px'
          }
        }, movement.detail) : null
      ].filter(Boolean)),
      el('td', {
        style: {
          padding: 'var(--spacing-sm)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)'
        }
      }, movement.category || '—'),
      el('td', {
        style: {
          padding: 'var(--spacing-sm)',
          textAlign: 'right',
          fontWeight: 'var(--font-weight-semibold)',
          color: isCredit ? 'var(--color-success)' : 'var(--color-danger)'
        }
      }, `${isCredit ? '+' : ''}${EUR(movement.montant)}`)
    ]);
  }

  /**
   * Créer la section historique
   */
  createHistorySection() {
    const movements = treasuryService.getMovements({
      type: this.typeFilter,
      query: this.searchQuery
    });

    // Limiter à 50 mouvements
    const displayMovements = movements.slice(0, 50);

    return el('section', { className: 'dashboard-section' }, [
      el('h2', { className: 'dashboard-section-title' }, '📜 Historique des Mouvements'),

      this.createFiltersBar(),

      // Résultats
      this.searchQuery || this.typeFilter !== 'all' ? el('div', {
        style: {
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)',
          marginBottom: 'var(--spacing-md)'
        }
      }, `${movements.length} résultat${movements.length > 1 ? 's' : ''}`) : null,

      // Table
      displayMovements.length > 0 ? el('div', {
        className: 'card',
        style: {
          padding: 0,
          overflow: 'auto'
        }
      }, [
        el('table', { className: 'table' }, [
          el('thead', {}, [
            el('tr', {}, [
              el('th', {}, 'Date'),
              el('th', {}, 'Libellé'),
              el('th', {}, 'Catégorie'),
              el('th', { style: { textAlign: 'right' } }, 'Montant')
            ])
          ]),
          el('tbody', {}, displayMovements.map(m => this.createMovementRow(m)))
        ])
      ]) : el('div', { className: 'empty-state' }, [
        el('div', { className: 'empty-state-icon' }, '📭'),
        el('h3', { className: 'empty-state-title' }, 'Aucun mouvement'),
        el('p', { className: 'empty-state-text' },
          this.searchQuery || this.typeFilter !== 'all'
            ? 'Aucun résultat pour ces filtres'
            : 'Les mouvements de trésorerie apparaîtront ici'
        )
      ]),

      displayMovements.length === 50 && movements.length > 50 ? el('div', {
        style: {
          textAlign: 'center',
          marginTop: 'var(--spacing-md)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)'
        }
      }, `Affichage des 50 premiers résultats sur ${movements.length}`) : null
    ].filter(Boolean));
  }

  /**
   * Exporter en CSV
   */
  exportCSV() {
    const csv = treasuryService.exportToCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tresorerie-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export CSV téléchargé');
  }

  /**
   * Render
   */
  render() {
    const stats = treasuryService.calculateStats();

    this.container = el('div', { className: 'container' }, [
      // Header
      el('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--spacing-xl)'
        }
      }, [
        el('h1', {}, '💰 Trésorerie'),
        el('div', {
          style: {
            display: 'flex',
            gap: 'var(--spacing-sm)'
          }
        }, [
          el('button', {
            className: 'btn btn-ghost',
            onClick: () => {
              window.location.hash = 'settings';
            }
          }, '⚙️ Config rendement')
        ])
      ]),

      this.createKPIsSection(stats),
      this.createHistorySection()
    ]);

    return this.container;
  }

  /**
   * Rafraîchir la vue
   */
  refresh() {
    const container = document.querySelector('#main-content');
    if (container) {
      container.innerHTML = '';
      container.appendChild(this.render());
    }
  }

  /**
   * Détruire la vue
   */
  destroy() {
    // Cleanup si nécessaire
  }
}
