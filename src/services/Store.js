/**
 * State Management - Simple EventEmitter pattern
 * Remplace les variables globales par un store centralisé
 */

class Store {
  constructor() {
    this.state = {
      // Données métier
      company: null,
      missions: [],
      clients: [],
      treasury: null,
      irConfig: {},
      goalCA: 0,

      // État UI
      view: 'dashboard',
      theme: 'dark',
      privacyMode: false,
      period: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },

      // Modales & overlays
      searchOpen: false,
      helpOpen: false,
      notifOpen: false,
      alertsOpen: false,

      // Filtres & options
      factureFilter: 'all',
      chargesTab: 'apayer',
      showCumul: false,
      showCashDispo: false,
      projectionScenario: 'normal',
      provView: 'type',

      // Données calculées (cache)
      computed: {},

      // Notifications
      notifRead: [],

      // User (pour Supabase)
      user: null,
      session: null
    };

    this.listeners = new Map();
  }

  /**
   * Obtenir une valeur du state
   */
  get(key) {
    return this.state[key];
  }

  /**
   * Définir une valeur et notifier les listeners
   */
  set(key, value) {
    const oldValue = this.state[key];
    this.state[key] = value;
    this.emit(key, value, oldValue);
    this.emit('*', { key, value, oldValue });
  }

  /**
   * Mettre à jour plusieurs valeurs
   */
  update(updates) {
    Object.entries(updates).forEach(([key, value]) => {
      this.set(key, value);
    });
  }

  /**
   * Écouter les changements sur une clé
   */
  on(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);

    // Retourner fonction de désabonnement
    return () => {
      const callbacks = this.listeners.get(key);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  /**
   * Émettre un événement
   */
  emit(key, ...args) {
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(...args);
        } catch (error) {
          console.error(`Error in listener for "${key}":`, error);
        }
      });
    }
  }

  /**
   * Réinitialiser le state
   */
  reset() {
    const theme = this.state.theme; // Garder le thème

    // État par défaut
    const defaultState = {
      company: null,
      missions: [],
      clients: [],
      treasury: null,
      irConfig: {},
      goalCA: 0,
      view: 'dashboard',
      theme: 'dark',
      privacyMode: false,
      period: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
      searchOpen: false,
      helpOpen: false,
      notifOpen: false,
      alertsOpen: false,
      factureFilter: 'all',
      chargesTab: 'apayer',
      showCumul: false,
      showCashDispo: false,
      projectionScenario: 'normal',
      provView: 'type',
      computed: {},
      notifRead: [],
      user: null,
      session: null
    };

    this.state = {
      ...defaultState,
      theme
    };
    this.emit('*', { type: 'reset' });
  }
}

// Export class for testing
export { Store };

// Singleton
export const store = new Store();

// Helper pour computed properties avec cache
export function computed(key, computeFn, dependencies = []) {
  const compute = () => {
    try {
      const value = computeFn();
      store.set(`computed.${key}`, value);
      return value;
    } catch (error) {
      console.error(`Error computing "${key}":`, error);
      return null;
    }
  };

  // Recalculer quand les dépendances changent
  dependencies.forEach(dep => {
    store.on(dep, compute);
  });

  // Calculer immédiatement
  return compute();
}
