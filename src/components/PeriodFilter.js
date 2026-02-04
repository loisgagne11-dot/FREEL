/**
 * Composant de filtre de période avec sélecteur d'année et option personnalisée
 */

import { el } from '../utils/dom.js';
import { formModal } from './Modal.js';

export class PeriodFilter {
  constructor(options = {}) {
    this.currentYear = options.defaultYear || new Date().getFullYear();
    this.customPeriod = null; // { start: Date, end: Date }
    this.onChange = options.onChange || (() => {});
    this.yearsRange = options.yearsRange || 3; // +/- années autour de l'année actuelle
  }

  /**
   * Obtenir la période actuelle sélectionnée
   */
  getPeriod() {
    if (this.customPeriod) {
      return {
        type: 'custom',
        start: this.customPeriod.start,
        end: this.customPeriod.end
      };
    }

    return {
      type: 'year',
      year: this.currentYear,
      start: new Date(this.currentYear, 0, 1),
      end: new Date(this.currentYear, 11, 31, 23, 59, 59)
    };
  }

  /**
   * Définir une année spécifique
   */
  setYear(year) {
    this.currentYear = parseInt(year);
    this.customPeriod = null;
    this.onChange(this.getPeriod());
  }

  /**
   * Définir une période personnalisée
   */
  setCustomPeriod(start, end) {
    this.customPeriod = {
      start: new Date(start),
      end: new Date(end)
    };
    this.onChange(this.getPeriod());
  }

  /**
   * Réinitialiser à l'année actuelle
   */
  reset() {
    this.currentYear = new Date().getFullYear();
    this.customPeriod = null;
    this.onChange(this.getPeriod());
  }

  /**
   * Afficher le modal de période personnalisée
   */
  async showCustomPeriodModal() {
    const now = new Date();
    const defaultStart = this.customPeriod?.start || new Date(now.getFullYear(), 0, 1);
    const defaultEnd = this.customPeriod?.end || now;

    try {
      const data = await formModal('Période personnalisée', [
        {
          name: 'start',
          label: 'Date de début',
          type: 'date',
          required: true,
          value: defaultStart.toISOString().slice(0, 10)
        },
        {
          name: 'end',
          label: 'Date de fin',
          type: 'date',
          required: true,
          value: defaultEnd.toISOString().slice(0, 10)
        }
      ]);

      if (new Date(data.end) < new Date(data.start)) {
        throw new Error('La date de fin doit être après la date de début');
      }

      this.setCustomPeriod(data.start, data.end);

      // Mettre à jour le sélecteur visuel
      const select = this.container?.querySelector('select');
      if (select) {
        select.value = 'custom';
      }

    } catch (error) {
      if (error && error.message) {
        console.error('Error setting custom period:', error);
      }
      // Si l'utilisateur annule, on ne fait rien
    }
  }

  /**
   * Générer la liste des années disponibles
   */
  getAvailableYears() {
    const currentYear = new Date().getFullYear();
    const years = [];

    for (let y = currentYear - this.yearsRange; y <= currentYear + 1; y++) {
      years.push(y);
    }

    return years;
  }

  /**
   * Formater la période pour l'affichage
   */
  formatPeriod() {
    if (this.customPeriod) {
      const fmt = (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `${fmt(this.customPeriod.start)} - ${fmt(this.customPeriod.end)}`;
    }
    return this.currentYear.toString();
  }

  /**
   * Render du composant
   */
  render() {
    const years = this.getAvailableYears();
    const isCustom = this.customPeriod !== null;

    this.container = el('div', {
      className: 'period-filter',
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-md)',
        marginBottom: 'var(--spacing-lg)',
        padding: 'var(--spacing-md)',
        background: 'var(--color-bg-secondary)',
        borderRadius: 'var(--border-radius)',
        border: '1px solid var(--border-color)'
      }
    }, [
      el('label', {
        style: {
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-primary)',
          minWidth: '80px'
        }
      }, '📅 Période :'),

      el('select', {
        className: 'select',
        value: isCustom ? 'custom' : this.currentYear.toString(),
        style: { minWidth: '150px' },
        onChange: (e) => {
          const value = e.target.value;
          if (value === 'custom') {
            this.showCustomPeriodModal();
          } else {
            this.setYear(value);
          }
        }
      }, [
        ...years.map(y =>
          el('option', {
            value: y.toString(),
            selected: !isCustom && y === this.currentYear
          }, y.toString())
        ),
        el('option', {
          value: 'custom',
          selected: isCustom
        }, isCustom ? `Personnalisé (${this.formatPeriod()})` : 'Personnaliser...')
      ]),

      isCustom && el('button', {
        className: 'btn btn-sm btn-secondary',
        onClick: () => this.showCustomPeriodModal(),
        style: { whiteSpace: 'nowrap' }
      }, '✏️ Modifier'),

      (isCustom || this.currentYear !== new Date().getFullYear()) && el('button', {
        className: 'btn btn-sm btn-secondary',
        onClick: () => {
          this.reset();
          const select = this.container?.querySelector('select');
          if (select) {
            select.value = new Date().getFullYear().toString();
          }
        },
        style: { whiteSpace: 'nowrap' }
      }, '↺ Réinitialiser'),

      el('span', {
        style: {
          marginLeft: 'auto',
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--font-size-sm)'
        }
      }, isCustom ? `Du ${this.formatPeriod()}` : `Année ${this.currentYear}`)
    ]);

    return this.container;
  }
}

/**
 * Helper pour créer un filtre de période
 */
export function createPeriodFilter(options = {}) {
  const filter = new PeriodFilter(options);
  return filter;
}
