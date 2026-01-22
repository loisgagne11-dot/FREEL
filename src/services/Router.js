/**
 * Router simple pour navigation SPA
 */

import { store } from './Store.js';
import { el, $ } from '../utils/dom.js';

class Router {
  constructor() {
    this.routes = new Map();
    this.currentView = null;
    this.defaultRoute = null;
    this.appElement = null;
  }

  /**
   * Enregistrer une route
   */
  register(name, viewFactory) {
    this.routes.set(name, viewFactory);
  }

  /**
   * Définir la route par défaut
   */
  setDefault(name) {
    this.defaultRoute = name;
  }

  /**
   * Démarrer le router
   */
  start() {
    this.appElement = $('#app');
    if (!this.appElement) {
      throw new Error('#app element not found');
    }

    // Créer la structure de base
    this.createLayout();

    // Navigation initiale
    const hash = window.location.hash.slice(1) || this.defaultRoute;
    this.navigate(hash);

    // Écouter les changements de hash
    window.addEventListener('hashchange', () => {
      const route = window.location.hash.slice(1);
      this.navigate(route);
    });
  }

  /**
   * Créer le layout de l'application
   */
  createLayout() {
    const header = el('header', {
      className: 'app-header',
      role: 'banner'
    }, [
      el('div', { className: 'app-logo' }, 'FREEL'),
      this.createNav(),
      this.createHeaderActions()
    ]);

    const main = el('main', {
      className: 'app-main',
      id: 'main-content',
      role: 'main',
      'aria-label': 'Contenu principal'
    });

    const bottomNav = this.createBottomNav();

    this.appElement.appendChild(header);
    this.appElement.appendChild(main);
    this.appElement.appendChild(bottomNav);
  }

  /**
   * Créer la navigation
   */
  createNav() {
    const nav = el('nav', {
      className: 'app-nav',
      role: 'navigation',
      'aria-label': 'Navigation principale'
    });

    const links = [
      { route: 'dashboard', label: 'Dashboard', icon: '📊' },
      { route: 'missions', label: 'Missions', icon: '💼' },
      { route: 'treasury', label: 'Trésorerie', icon: '💰' },
      { route: 'invoices', label: 'Factures', icon: '📄' },
      { route: 'charges', label: 'Charges', icon: '💳' }
    ];

    links.forEach(link => {
      const a = el('a', {
        href: `#${link.route}`,
        className: 'nav-link',
        dataset: { route: link.route },
        'aria-label': link.label
      }, [
        el('span', { 'aria-hidden': 'true' }, link.icon),
        el('span', {}, link.label)
      ]);

      nav.appendChild(a);
    });

    return nav;
  }

  /**
   * Créer les actions du header
   */
  createHeaderActions() {
    const actions = el('div', {
      role: 'toolbar',
      'aria-label': 'Actions principales',
      style: {
        display: 'flex',
        gap: 'var(--spacing-sm)',
        alignItems: 'center'
      }
    });

    // Bouton recherche
    const searchBtn = el('button', {
      className: 'btn-icon',
      'aria-label': 'Rechercher',
      onClick: () => {
        // TODO: Ouvrir la recherche
        console.log('Search');
      }
    }, '🔍');

    // Bouton paramètres
    const settingsBtn = el('button', {
      className: 'btn-icon',
      'aria-label': 'Paramètres',
      onClick: () => this.navigate('settings')
    }, '⚙️');

    actions.appendChild(searchBtn);
    actions.appendChild(settingsBtn);

    return actions;
  }

  /**
   * Créer la bottom nav (mobile)
   */
  createBottomNav() {
    const nav = el('nav', {
      className: 'bottom-nav',
      role: 'navigation',
      'aria-label': 'Navigation mobile'
    });

    const links = [
      { route: 'dashboard', label: 'Dashboard', icon: '📊' },
      { route: 'missions', label: 'Missions', icon: '💼' },
      { route: 'invoices', label: 'Factures', icon: '📄' },
      { route: 'treasury', label: 'Tréso', icon: '💰' },
      { route: 'charges', label: 'Charges', icon: '💳' }
    ];

    links.forEach(link => {
      const item = el('a', {
        href: `#${link.route}`,
        className: 'bottom-nav-item',
        dataset: { route: link.route },
        'aria-label': link.label
      }, [
        el('span', {
          style: { fontSize: 'var(--font-size-xl)' },
          'aria-hidden': 'true'
        }, link.icon),
        el('span', {}, link.label)
      ]);

      nav.appendChild(item);
    });

    return nav;
  }

  /**
   * Naviguer vers une route
   */
  navigate(route) {
    if (!route) {
      route = this.defaultRoute;
    }

    const viewFactory = this.routes.get(route);
    if (!viewFactory) {
      console.error(`Route "${route}" not found`);
      return;
    }

    // Détruire la vue précédente
    if (this.currentView && this.currentView.destroy) {
      this.currentView.destroy();
    }

    // Créer la nouvelle vue
    this.currentView = viewFactory();

    // Mettre à jour le store
    store.set('view', route);

    // Mettre à jour les liens actifs
    this.updateActiveLinks(route);

    // Render
    const mainContent = $('#main-content');
    if (mainContent) {
      mainContent.innerHTML = '';
      mainContent.appendChild(this.currentView.render());
    }

    // Scroll to top
    window.scrollTo(0, 0);
  }

  /**
   * Mettre à jour les liens actifs
   */
  updateActiveLinks(route) {
    // Desktop nav
    $$('.nav-link').forEach(link => {
      const isActive = link.dataset.route === route;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    // Mobile nav
    $$('.bottom-nav-item').forEach(link => {
      const isActive = link.dataset.route === route;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }
}

export const router = new Router();

// Helper pour $$
function $$(selector) {
  return Array.from(document.querySelectorAll(selector));
}
