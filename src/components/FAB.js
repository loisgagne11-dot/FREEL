/**
 * Floating Action Button (FAB)
 * Bouton flottant en bas à droite pour actions rapides
 */

import { el } from '../utils/dom.js';
import { router } from '../services/Router.js';

export class FAB {
  constructor() {
    this.fab = null;
    this.menu = null;
    this.isOpen = false;
  }

  /**
   * Créer le FAB
   */
  create() {
    // Menu d'actions
    this.menu = el('div', {
      className: 'fab-menu',
      style: { display: 'none' }
    }, [
      el('button', {
        className: 'fab-menu-item',
        onClick: () => this.addMission(),
        'aria-label': 'Nouvelle mission'
      }, [
        el('span', { className: 'fab-icon' }, '💼'),
        el('span', { className: 'fab-label' }, 'Nouvelle mission')
      ]),
      el('button', {
        className: 'fab-menu-item',
        onClick: () => this.addInvoice(),
        'aria-label': 'Nouvelle facture'
      }, [
        el('span', { className: 'fab-icon' }, '📄'),
        el('span', { className: 'fab-label' }, 'Nouvelle facture')
      ]),
      el('button', {
        className: 'fab-menu-item',
        onClick: () => this.addCharge(),
        'aria-label': 'Nouvelle charge'
      }, [
        el('span', { className: 'fab-icon' }, '💳'),
        el('span', { className: 'fab-label' }, 'Nouvelle charge')
      ])
    ]);

    // Bouton principal
    this.fab = el('button', {
      className: 'fab',
      onClick: () => this.toggle(),
      'aria-label': 'Menu d\'actions rapides',
      'aria-expanded': 'false'
    }, [
      el('span', { className: 'fab-icon-main' }, '+')
    ]);

    // Container
    const container = el('div', { className: 'fab-container' }, [
      this.menu,
      this.fab
    ]);

    return container;
  }

  /**
   * Basculer le menu
   */
  toggle() {
    this.isOpen = !this.isOpen;

    if (this.isOpen) {
      this.menu.style.display = 'flex';
      this.fab.classList.add('fab-open');
      this.fab.setAttribute('aria-expanded', 'true');
    } else {
      this.menu.style.display = 'none';
      this.fab.classList.remove('fab-open');
      this.fab.setAttribute('aria-expanded', 'false');
    }
  }

  /**
   * Fermer le menu
   */
  close() {
    if (this.isOpen) {
      this.toggle();
    }
  }

  /**
   * Ajouter une mission
   */
  addMission() {
    this.close();
    router.navigate('missions');
    // Déclencher l'événement pour ouvrir le modal
    setTimeout(() => {
      // Déclencher un événement personnalisé que MissionsView peut écouter
      window.dispatchEvent(new CustomEvent('fab-add-mission'));
    }, 200);
  }

  /**
   * Ajouter une facture
   */
  addInvoice() {
    this.close();
    router.navigate('invoices');
  }

  /**
   * Ajouter une charge
   */
  addCharge() {
    this.close();
    router.navigate('charges');
  }
}

export const fab = new FAB();
