/**
 * Vue de gestion des factures
 * Conformité légale française : numérotation séquentielle, registre
 */

import { el, $, $$ } from '../utils/dom.js';
import { store } from '../services/Store.js';
import { invoiceService } from '../services/InvoiceService.js';
import { missionService } from '../services/MissionService.js';
import { Modal, formModal } from '../components/Modal.js';
import { toast } from '../components/Toast.js';
import { EUR, fmtDate } from '../utils/formatters.js';
import { createPeriodFilter } from '../components/PeriodFilter.js';

export class InvoicesView {
  constructor() {
    this.currentFilter = 'all'; // all, draft, sent, paid, late
    this.searchQuery = '';
    this.periodFilter = createPeriodFilter({
      defaultYear: new Date().getFullYear(),
      yearsRange: 3,
      onChange: (period) => {
        this.currentPeriod = period;
        this.updateInvoiceList($('.invoice-list'));
      }
    });
    this.currentPeriod = this.periodFilter.getPeriod();
  }

  render() {
    const container = el('div', { className: 'view-container' });

    // Header
    const header = el('div', { className: 'view-header' }, [
      el('div', {}, [
        el('h1', {}, 'Factures'),
        el('p', { className: 'subtitle' }, 'Génération et suivi des factures')
      ]),
      el('div', { className: 'header-actions' }, [
        el('button', {
          className: 'btn btn-secondary',
          onClick: () => this.exportRegistry()
        }, '📥 Exporter registre'),
        el('button', {
          className: 'btn btn-primary',
          onClick: () => this.showGenerateInvoiceModal()
        }, '✚ Générer facture')
      ])
    ]);

    // Period filter
    const periodFilterEl = this.periodFilter.render();

    // Filters
    const filters = this.renderFilters();

    // Invoice list
    const invoiceList = el('div', { className: 'invoice-list' });
    this.updateInvoiceList(invoiceList);

    container.append(header, periodFilterEl, filters, invoiceList);
    return container;
  }

  renderFilters() {
    const filters = el('div', { className: 'filters' }, [
      // Search
      el('input', {
        type: 'text',
        className: 'input',
        placeholder: '🔍 Rechercher (client, mois, numéro)...',
        value: this.searchQuery,
        onInput: (e) => {
          this.searchQuery = e.target.value;
          this.updateInvoiceList($('.invoice-list'));
        }
      }),

      // Status filter
      el('div', { className: 'filter-tabs' }, [
        this.renderFilterTab('all', 'Toutes'),
        this.renderFilterTab('draft', 'Brouillons'),
        this.renderFilterTab('sent', 'Envoyées'),
        this.renderFilterTab('paid', 'Payées'),
        this.renderFilterTab('late', 'En retard')
      ])
    ]);

    return filters;
  }

  renderFilterTab(filter, label) {
    const count = this.getFilteredInvoices(filter).length;

    return el('button', {
      className: this.currentFilter === filter ? 'filter-tab active' : 'filter-tab',
      onClick: () => {
        this.currentFilter = filter;
        $$('.filter-tab').forEach(tab => tab.classList.remove('active'));
        event.target.classList.add('active');
        this.updateInvoiceList($('.invoice-list'));
      }
    }, `${label} (${count})`);
  }

  updateInvoiceList(container) {
    const invoices = this.getFilteredInvoices(this.currentFilter);

    // Apply search filter
    const filtered = invoices.filter(inv => {
      if (!this.searchQuery) return true;
      const q = this.searchQuery.toLowerCase();
      return inv.client.toLowerCase().includes(q) ||
             inv.numero.toLowerCase().includes(q) ||
             inv.mois.toLowerCase().includes(q);
    });

    container.innerHTML = '';

    if (filtered.length === 0) {
      container.appendChild(this.renderEmptyState());
      return;
    }

    // Group by status
    const grouped = this.groupByStatus(filtered);

    Object.keys(grouped).forEach(status => {
      if (grouped[status].length === 0) return;

      const section = el('div', { className: 'invoice-section' }, [
        el('h3', { className: 'section-title' }, this.getStatusLabel(status)),
        ...grouped[status].map(invoice => this.renderInvoiceCard(invoice))
      ]);

      container.appendChild(section);
    });
  }

  renderInvoiceCard(invoice) {
    const status = this.getInvoiceStatus(invoice);
    const statusClass = `status-${status}`;

    return el('div', { className: `invoice-card ${statusClass}` }, [
      // Header
      el('div', { className: 'invoice-card-header' }, [
        el('div', {}, [
          el('div', { className: 'invoice-number' }, invoice.numero),
          el('div', { className: 'invoice-client' }, invoice.client)
        ]),
        el('div', { className: `badge badge-${status}` }, this.getStatusLabel(status))
      ]),

      // Details
      el('div', { className: 'invoice-card-body' }, [
        el('div', { className: 'invoice-detail' }, [
          el('span', { className: 'label' }, 'Période:'),
          el('span', {}, invoice.mois)
        ]),
        el('div', { className: 'invoice-detail' }, [
          el('span', { className: 'label' }, 'Date facture:'),
          el('span', {}, fmtDate(invoice.date))
        ]),
        el('div', { className: 'invoice-detail' }, [
          el('span', { className: 'label' }, 'Échéance:'),
          el('span', {
            className: status === 'late' ? 'text-danger' : ''
          }, fmtDate(invoice.echeance))
        ]),
        el('div', { className: 'invoice-detail' }, [
          el('span', { className: 'label' }, 'Montant TTC:'),
          el('span', { className: 'invoice-amount' }, EUR(invoice.montantTTC))
        ])
      ]),

      // Actions
      el('div', { className: 'invoice-card-actions' }, [
        el('button', {
          className: 'btn btn-sm btn-secondary',
          onClick: () => this.previewInvoice(invoice)
        }, '👁️ Aperçu'),

        status === 'draft' && el('button', {
          className: 'btn btn-sm btn-primary',
          onClick: () => this.markAsSent(invoice)
        }, '📤 Marquer envoyée'),

        status === 'sent' && el('button', {
          className: 'btn btn-sm btn-success',
          onClick: () => this.markAsPaid(invoice)
        }, '✓ Marquer payée'),

        status === 'late' && el('button', {
          className: 'btn btn-sm btn-danger',
          onClick: () => this.sendReminder(invoice)
        }, '⚠️ Relancer'),

        el('button', {
          className: 'btn btn-sm btn-secondary',
          onClick: () => this.downloadInvoice(invoice)
        }, '📄 Télécharger'),

        el('button', {
          className: 'btn btn-sm btn-danger',
          onClick: () => this.deleteInvoice(invoice)
        }, '🗑️')
      ])
    ]);
  }

  renderEmptyState() {
    return el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-icon' }, '📄'),
      el('h3', {}, 'Aucune facture'),
      el('p', {},
        this.searchQuery
          ? 'Aucune facture ne correspond à votre recherche'
          : 'Générez votre première facture pour commencer'
      ),
      !this.searchQuery && el('button', {
        className: 'btn btn-primary',
        onClick: () => this.showGenerateInvoiceModal()
      }, '✚ Générer facture')
    ]);
  }

  async showGenerateInvoiceModal() {
    const missions = missionService.getAllMissions();

    if (missions.length === 0) {
      toast.error('Vous devez d\'abord créer une mission');
      return;
    }

    // Get mission choices
    const missionChoices = missions.map(m => ({
      value: m.id,
      label: `${m.client} - ${m.titre || 'Mission'}`
    }));

    const data = await formModal('Générer une facture', [
      {
        name: 'missionId',
        label: 'Mission',
        type: 'select',
        options: missionChoices,
        required: true
      },
      {
        name: 'mois',
        label: 'Mois',
        type: 'month',
        required: true,
        value: new Date().toISOString().slice(0, 7)
      },
      {
        name: 'invoiceDate',
        label: 'Date de facture',
        type: 'date',
        value: new Date().toISOString().slice(0, 10)
      },
      {
        name: 'delayDays',
        label: 'Délai de paiement (jours)',
        type: 'number',
        value: 30,
        min: 1
      },
      {
        name: 'numeroCommande',
        label: 'N° de commande (optionnel)',
        type: 'text'
      }
    ]);

    try {
      const mission = missionService.getMission(data.missionId);
      const monthYm = data.mois;

      // Check if ligne exists
      const ligne = mission.lignes?.find(l => l.ym === monthYm);
      if (!ligne) {
        toast.error('Aucune donnée pour ce mois dans la mission sélectionnée');
        return;
      }

      // Generate invoice data
      const invoiceData = invoiceService.generateInvoiceData(mission, monthYm, {
        invoiceDate: data.invoiceDate,
        delayDays: parseInt(data.delayDays),
        numeroCommande: data.numeroCommande
      });

      // Add invoice metadata
      invoiceData.status = 'draft';
      invoiceData.sentAt = null;
      invoiceData.paidAt = null;
      invoiceData.missionId = mission.id;
      invoiceData.mois = monthYm;

      // Register invoice
      const entry = invoiceService.registerInvoice(invoiceData);

      toast.success('Facture générée !');
      this.updateInvoiceList($('.invoice-list'));

      // Show preview
      this.previewInvoice(invoiceData);

    } catch (error) {
      console.error('Error generating invoice:', error);
      toast.error(error.message || 'Erreur lors de la génération de la facture');
    }
  }

  previewInvoice(invoice) {
    const html = invoiceService.generateInvoiceHTML(invoice);

    const modal = new Modal({
      title: `Aperçu - ${invoice.numero}`,
      size: 'xl',
      closeOnBackdrop: true
    });

    const iframe = el('iframe', {
      style: 'width: 100%; height: 80vh; border: 1px solid var(--border-color); border-radius: 8px;'
    });

    modal.setBody(iframe);
    modal.setFooter([
      { text: 'Télécharger HTML', className: 'btn-secondary', onClick: () => this.downloadInvoice(invoice) },
      { text: 'Imprimer / PDF', className: 'btn-primary', onClick: () => this.printInvoice(invoice) },
      { text: 'Fermer', className: 'btn-secondary', onClick: () => modal.close() }
    ]);

    modal.open();

    // Load HTML in iframe
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
  }

  downloadInvoice(invoice) {
    invoiceService.downloadInvoiceHTML(invoice);
    toast.success('Facture téléchargée');
  }

  printInvoice(invoice) {
    const html = invoiceService.generateInvoiceHTML(invoice);
    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }

  async markAsSent(invoice) {
    const confirmed = await this.confirmAction(
      'Marquer comme envoyée',
      `Confirmer l'envoi de la facture ${invoice.numero} ?`
    );

    if (!confirmed) return;

    invoice.status = 'sent';
    invoice.sentAt = new Date().toISOString();
    this.updateInvoiceInRegistry(invoice);

    toast.success('Facture marquée comme envoyée');
    this.updateInvoiceList($('.invoice-list'));
  }

  async markAsPaid(invoice) {
    const confirmed = await this.confirmAction(
      'Marquer comme payée',
      `Confirmer le paiement de la facture ${invoice.numero} ?`
    );

    if (!confirmed) return;

    invoice.status = 'paid';
    invoice.paidAt = new Date().toISOString();
    this.updateInvoiceInRegistry(invoice);

    toast.success('Facture marquée comme payée');
    this.updateInvoiceList($('.invoice-list'));
  }

  async sendReminder(invoice) {
    toast.info(`Fonctionnalité de relance à venir pour ${invoice.numero}`);
  }

  async deleteInvoice(invoice) {
    const confirmed = await this.confirmAction(
      'Supprimer la facture',
      `Êtes-vous sûr de vouloir supprimer la facture ${invoice.numero} ? Cette action est irréversible.`,
      'danger'
    );

    if (!confirmed) return;

    const company = store.get('company') || {};
    const registry = company.invoiceRegistry || [];
    const filtered = registry.filter(inv => inv.id !== invoice.id);

    company.invoiceRegistry = filtered;
    store.set('company', company);

    toast.success('Facture supprimée');
    this.updateInvoiceList($('.invoice-list'));
  }

  exportRegistry() {
    const csv = invoiceService.generateRegistryCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Livre-des-recettes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Registre exporté');
  }

  // Helpers

  getFilteredInvoices(filter) {
    let registry = invoiceService.getRegistry();

    // Filtrer par période
    if (this.currentPeriod) {
      registry = registry.filter(inv => {
        const invoiceDate = new Date(inv.date);
        return invoiceDate >= this.currentPeriod.start && invoiceDate <= this.currentPeriod.end;
      });
    }

    if (filter === 'all') return registry;

    return registry.filter(inv => {
      const status = this.getInvoiceStatus(inv);
      return status === filter;
    });
  }

  getInvoiceStatus(invoice) {
    if (invoice.status === 'paid' || invoice.paidAt) return 'paid';

    const now = new Date();
    const echeance = new Date(invoice.echeance);

    if (invoice.status === 'sent' || invoice.sentAt) {
      return now > echeance ? 'late' : 'sent';
    }

    return 'draft';
  }

  getStatusLabel(status) {
    const labels = {
      draft: 'Brouillons',
      sent: 'Envoyées',
      paid: 'Payées',
      late: 'En retard'
    };
    return labels[status] || status;
  }

  groupByStatus(invoices) {
    return {
      late: invoices.filter(inv => this.getInvoiceStatus(inv) === 'late'),
      sent: invoices.filter(inv => this.getInvoiceStatus(inv) === 'sent'),
      draft: invoices.filter(inv => this.getInvoiceStatus(inv) === 'draft'),
      paid: invoices.filter(inv => this.getInvoiceStatus(inv) === 'paid')
    };
  }

  updateInvoiceInRegistry(invoice) {
    const company = store.get('company') || {};
    const registry = company.invoiceRegistry || [];
    const index = registry.findIndex(inv => inv.id === invoice.id);

    if (index !== -1) {
      registry[index] = invoice;
      company.invoiceRegistry = registry;
      store.set('company', company);
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
