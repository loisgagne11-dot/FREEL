/**
 * Vue de gestion des charges sociales et fiscales
 * URSSAF (trimestres) + IR (acomptes)
 */

import { el, $, $$ } from '../utils/dom.js';
import { store } from '../services/Store.js';
import { chargesService } from '../services/ChargesService.js';
import { Modal, formModal } from '../components/Modal.js';
import { toast } from '../components/Toast.js';
import { EUR, fmtDate, PCT } from '../utils/formatters.js';
import { createPeriodFilter } from '../components/PeriodFilter.js';

export class ChargesView {
  constructor() {
    this.currentYear = new Date().getFullYear();
    this.currentFilter = 'all'; // all, urssaf, ir, paid, unpaid, overdue
    this.periodFilter = createPeriodFilter({
      defaultYear: new Date().getFullYear(),
      yearsRange: 3,
      onChange: (period) => {
        this.currentPeriod = period;
        if (period.type === 'year') {
          this.currentYear = period.year;
        }
        this.updateView();
      }
    });
    this.currentPeriod = this.periodFilter.getPeriod();
  }

  render() {
    const container = el('div', { className: 'view-container' });

    // Header
    const header = el('div', { className: 'view-header' }, [
      el('div', {}, [
        el('h1', {}, 'Charges sociales et fiscales'),
        el('p', { className: 'subtitle' }, 'Gestion URSSAF et IR')
      ]),
      el('div', { className: 'header-actions' }, [
        el('button', {
          className: 'btn btn-secondary',
          onClick: () => this.recalculateCharges()
        }, '🔄 Recalculer'),
        el('button', {
          className: 'btn btn-secondary',
          onClick: () => this.exportCharges()
        }, '📥 Exporter CSV'),
        el('button', {
          className: 'btn btn-primary',
          onClick: () => this.generateCharges()
        }, '✚ Générer charges')
      ])
    ]);

    // Period filter
    const periodFilterEl = this.periodFilter.render();

    // Stats KPIs
    const stats = chargesService.getChargesStats(this.currentYear);
    const kpis = this.renderKPIs(stats);

    // Filters
    const filters = this.renderFilters();

    // Charges list
    const chargesList = el('div', { className: 'charges-list' });
    this.updateChargesList(chargesList);

    container.append(header, periodFilterEl, kpis, filters, chargesList);
    return container;
  }


  renderKPIs(stats) {
    return el('div', { className: 'kpi-grid' }, [
      el('div', { className: 'kpi' }, [
        el('div', { className: 'kpi-label' }, 'Total charges'),
        el('div', { className: 'kpi-value' }, EUR(stats.total.total)),
        el('div', { className: 'kpi-trend' }, `${stats.total.count} charges`)
      ]),

      el('div', { className: 'kpi kpi-success' }, [
        el('div', { className: 'kpi-label' }, 'Payées'),
        el('div', { className: 'kpi-value' }, EUR(stats.total.paid)),
        el('div', { className: 'kpi-trend positive' }, `${stats.total.countPaid} / ${stats.total.count}`)
      ]),

      el('div', { className: 'kpi kpi-warning' }, [
        el('div', { className: 'kpi-label' }, 'Non payées'),
        el('div', { className: 'kpi-value' }, EUR(stats.total.unpaid)),
        el('div', { className: 'kpi-trend' }, `${stats.total.count - stats.total.countPaid} charges`)
      ]),

      el('div', { className: 'kpi' }, [
        el('div', { className: 'kpi-label' }, 'URSSAF'),
        el('div', { className: 'kpi-value' }, EUR(stats.urssaf.total)),
        el('div', { className: 'kpi-trend' }, `${stats.urssaf.countPaid}/${stats.urssaf.count} payés`)
      ]),

      el('div', { className: 'kpi' }, [
        el('div', { className: 'kpi-label' }, 'IR'),
        el('div', { className: 'kpi-value' }, EUR(stats.ir.total)),
        el('div', { className: 'kpi-trend' }, `${stats.ir.countPaid}/${stats.ir.count} payés`)
      ])
    ]);
  }

  renderFilters() {
    const filters = el('div', { className: 'filters' }, [
      el('div', { className: 'filter-tabs' }, [
        this.renderFilterTab('all', 'Toutes'),
        this.renderFilterTab('urssaf', 'URSSAF'),
        this.renderFilterTab('ir', 'IR'),
        this.renderFilterTab('unpaid', 'Non payées'),
        this.renderFilterTab('paid', 'Payées'),
        this.renderFilterTab('overdue', 'En retard')
      ])
    ]);

    return filters;
  }

  renderFilterTab(filter, label) {
    const charges = this.getFilteredCharges(filter);

    return el('button', {
      className: this.currentFilter === filter ? 'filter-tab active' : 'filter-tab',
      onClick: () => {
        this.currentFilter = filter;
        $$('.filter-tab').forEach(tab => tab.classList.remove('active'));
        event.target.classList.add('active');
        this.updateChargesList($('.charges-list'));
      }
    }, `${label} (${charges.length})`);
  }

  updateChargesList(container) {
    const charges = this.getFilteredCharges(this.currentFilter);

    container.innerHTML = '';

    if (charges.length === 0) {
      container.appendChild(this.renderEmptyState());
      return;
    }

    // Grouper par type
    const urssaf = charges.filter(c => c.type === 'urssaf');
    const ir = charges.filter(c => c.type === 'ir');

    if (urssaf.length > 0) {
      const section = el('div', { className: 'charges-section' }, [
        el('h3', { className: 'section-title' }, `URSSAF (${urssaf.length})`),
        ...urssaf.map(charge => this.renderChargeCard(charge))
      ]);
      container.appendChild(section);
    }

    if (ir.length > 0) {
      const section = el('div', { className: 'charges-section' }, [
        el('h3', { className: 'section-title' }, `Impôt sur le revenu (${ir.length})`),
        ...ir.map(charge => this.renderChargeCard(charge))
      ]);
      container.appendChild(section);
    }
  }

  renderChargeCard(charge) {
    const isOverdue = !charge.paid && new Date(charge.deadline) < new Date();
    const statusClass = charge.paid ? 'status-paid' : (isOverdue ? 'status-overdue' : 'status-unpaid');

    return el('div', { className: `charge-card ${statusClass}` }, [
      // Header
      el('div', { className: 'charge-card-header' }, [
        el('div', {}, [
          el('div', { className: 'charge-period' }, charge.period),
          el('div', { className: 'charge-type' }, charge.type.toUpperCase())
        ]),
        el('div', {
          className: `badge badge-${charge.paid ? 'success' : (isOverdue ? 'danger' : 'warning')}`
        }, charge.paid ? '✓ Payée' : (isOverdue ? '⚠️ En retard' : 'Non payée'))
      ]),

      // Details
      el('div', { className: 'charge-card-body' }, [
        el('div', { className: 'charge-detail' }, [
          el('span', { className: 'label' }, 'CA période:'),
          el('span', {}, EUR(charge.ca || 0))
        ]),
        el('div', { className: 'charge-detail' }, [
          el('span', { className: 'label' }, 'Montant prévu:'),
          el('span', { className: 'charge-amount' }, EUR(charge.amount || 0))
        ]),
        charge.paid && el('div', { className: 'charge-detail' }, [
          el('span', { className: 'label' }, 'Montant payé:'),
          el('span', { className: 'text-success' }, EUR(charge.paidAmount || charge.amount || 0))
        ]),
        el('div', { className: 'charge-detail' }, [
          el('span', { className: 'label' }, 'Échéance:'),
          el('span', {
            className: isOverdue ? 'text-danger' : ''
          }, fmtDate(charge.deadline))
        ]),
        charge.paid && charge.paidAt && el('div', { className: 'charge-detail' }, [
          el('span', { className: 'label' }, 'Date paiement:'),
          el('span', {}, fmtDate(charge.paidAt))
        ])
      ]),

      // Actions
      el('div', { className: 'charge-card-actions' }, [
        !charge.paid && el('button', {
          className: 'btn btn-sm btn-success',
          onClick: () => this.markAsPaid(charge)
        }, '✓ Marquer payée'),

        charge.paid && el('button', {
          className: 'btn btn-sm btn-secondary',
          onClick: () => this.markAsUnpaid(charge)
        }, '↺ Marquer non payée')
      ])
    ]);
  }

  renderEmptyState() {
    return el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-icon' }, '📊'),
      el('h3', {}, 'Aucune charge'),
      el('p', {}, 'Générez les charges pour cette année'),
      el('button', {
        className: 'btn btn-primary',
        onClick: () => this.generateCharges()
      }, '✚ Générer charges')
    ]);
  }

  async generateCharges() {
    const confirmed = await this.confirmAction(
      'Générer les charges',
      `Générer les charges URSSAF et IR pour l'année ${this.currentYear} ?`
    );

    if (!confirmed) return;

    try {
      chargesService.generateURSSAFCharges(this.currentYear);

      const company = store.get('company') || {};
      if (company.config?.versementLib) {
        chargesService.generateIRCharges(this.currentYear);
      }

      toast.success('Charges générées !');
      this.updateView();

    } catch (error) {
      console.error('Error generating charges:', error);
      toast.error(error.message || 'Erreur lors de la génération des charges');
    }
  }

  async markAsPaid(charge) {
    const data = await formModal(`Marquer ${charge.period} comme payée`, [
      {
        name: 'amount',
        label: 'Montant payé',
        type: 'number',
        step: '0.01',
        required: true,
        value: charge.amount
      },
      {
        name: 'date',
        label: 'Date de paiement',
        type: 'date',
        required: true,
        value: new Date().toISOString().slice(0, 10)
      }
    ]);

    try {
      chargesService.markAsPaid(charge.id, parseFloat(data.amount), data.date);
      toast.success('Charge marquée comme payée');
      this.updateView();

    } catch (error) {
      console.error('Error marking charge as paid:', error);
      toast.error(error.message || 'Erreur lors du marquage de la charge');
    }
  }

  async markAsUnpaid(charge) {
    const confirmed = await this.confirmAction(
      'Marquer comme non payée',
      `Confirmer le marquage de ${charge.period} comme non payée ?`
    );

    if (!confirmed) return;

    try {
      chargesService.markAsUnpaid(charge.id);
      toast.success('Charge marquée comme non payée');
      this.updateView();

    } catch (error) {
      console.error('Error marking charge as unpaid:', error);
      toast.error(error.message || 'Erreur lors du marquage de la charge');
    }
  }

  async recalculateCharges() {
    const confirmed = await this.confirmAction(
      'Recalculer les charges',
      'Recalculer toutes les charges non payées en fonction du CA actuel ?'
    );

    if (!confirmed) return;

    try {
      chargesService.recalculateUnpaidCharges();
      toast.success('Charges recalculées !');
      this.updateView();

    } catch (error) {
      console.error('Error recalculating charges:', error);
      toast.error(error.message || 'Erreur lors du recalcul des charges');
    }
  }

  exportCharges() {
    const csv = chargesService.exportChargesCSV(this.currentYear);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Charges-${this.currentYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Charges exportées');
  }

  // Helpers

  getFilteredCharges(filter) {
    const { all, urssaf, ir } = chargesService.getChargesForYear(this.currentYear);

    switch (filter) {
      case 'urssaf':
        return urssaf;
      case 'ir':
        return ir;
      case 'paid':
        return all.filter(c => c.paid);
      case 'unpaid':
        return all.filter(c => !c.paid);
      case 'overdue':
        const now = new Date();
        return all.filter(c => !c.paid && new Date(c.deadline) < now);
      default:
        return all;
    }
  }

  updateView() {
    const kpis = $('.kpi-grid');
    const stats = chargesService.getChargesStats(this.currentYear);
    if (kpis) {
      kpis.replaceWith(this.renderKPIs(stats));
    }

    const filters = $('.filters');
    if (filters) {
      filters.replaceWith(this.renderFilters());
    }

    const chargesList = $('.charges-list');
    if (chargesList) {
      this.updateChargesList(chargesList);
    }
  }

  async confirmAction(title, message, type = 'info') {
    return new Promise((resolve) => {
      const modal = new Modal({
        title,
        size: 'sm',
        closeOnBackdrop: false
      });

      modal.setBody(el('p', {}, message));
      modal.setFooter([
        {
          text: 'Annuler',
          className: 'btn-secondary',
          onClick: () => {
            modal.close();
            resolve(false);
          }
        },
        {
          text: 'Confirmer',
          className: type === 'danger' ? 'btn-danger' : 'btn-primary',
          onClick: () => {
            modal.close();
            resolve(true);
          }
        }
      ]);

      modal.open();
    });
  }

  destroy() {}
}
