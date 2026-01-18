/**
 * Vue Paramètres
 */

import { el } from '../utils/dom.js';
import { store } from '../services/Store.js';
import { toggleTheme } from '../services/Theme.js';
import { storage } from '../services/Storage.js';
import { toast } from '../components/Toast.js';

export class SettingsView {
  render() {
    const theme = store.get('theme');

    return el('div', { className: 'container' }, [
      el('h1', {}, 'Paramètres'),

      el('section', { className: 'card', style: { marginBottom: 'var(--spacing-lg)' } }, [
        el('h3', {}, 'Apparence'),
        el('button', {
          className: 'btn btn-ghost',
          onClick: () => {
            toggleTheme();
            toast.success(`Thème ${store.get('theme')} activé`);
            this.refresh();
          }
        }, `Thème actuel: ${theme}`)
      ]),

      el('section', { className: 'card', style: { marginBottom: 'var(--spacing-lg)' } }, [
        el('h3', {}, 'Données'),
        el('div', { style: { display: 'flex', gap: 'var(--spacing-md)' } }, [
          el('button', {
            className: 'btn btn-primary',
            onClick: () => this.exportData()
          }, 'Exporter'),
          el('button', {
            className: 'btn btn-ghost',
            onClick: () => this.importData()
          }, 'Importer')
        ])
      ]),

      el('section', { className: 'card' }, [
        el('h3', {}, 'À propos'),
        el('p', {}, 'FREEL V51 - Refactorisé'),
        el('p', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' } },
          'Architecture modulaire, performances optimisées')
      ])
    ]);
  }

  exportData() {
    const data = storage.export();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freel-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export terminé');
  }

  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const text = await file.text();
      try {
        const data = JSON.parse(text);
        storage.import(data);
        toast.success('Import réussi');
        window.location.reload();
      } catch (error) {
        toast.error('Erreur d\'import');
        console.error(error);
      }
    };
    input.click();
  }

  refresh() {
    const container = document.querySelector('#main-content');
    if (container) {
      container.innerHTML = '';
      container.appendChild(this.render());
    }
  }

  destroy() {}
}
