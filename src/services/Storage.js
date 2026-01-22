/**
 * Service de stockage avec gestion d'erreurs
 * Supporte localStorage et Supabase
 */

import { STORAGE_PREFIX } from '../config.js';
import { store } from './Store.js';
import { debounce } from '../utils/dom.js';

class StorageService {
  constructor() {
    this.prefix = STORAGE_PREFIX;
    this.available = this.checkAvailability();
  }

  /**
   * Vérifier la disponibilité de localStorage
   */
  checkAvailability() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      console.warn('localStorage not available:', e);
      return false;
    }
  }

  /**
   * Construire la clé avec préfixe
   */
  key(name) {
    return `${this.prefix}_${name}`;
  }

  /**
   * Sauvegarder une valeur
   */
  save(name, data) {
    if (!this.available) {
      throw new Error('Storage not available');
    }

    try {
      const serialized = JSON.stringify(data);
      localStorage.setItem(this.key(name), serialized);
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.error('Storage quota exceeded');
        this.handleQuotaExceeded();
      }
      throw error;
    }
  }

  /**
   * Charger une valeur
   */
  load(name, defaultValue = null) {
    if (!this.available) {
      return defaultValue;
    }

    try {
      const item = localStorage.getItem(this.key(name));
      if (item === null) {
        return defaultValue;
      }
      return JSON.parse(item);
    } catch (error) {
      console.error(`Error loading "${name}":`, error);
      return defaultValue;
    }
  }

  /**
   * Supprimer une valeur
   */
  remove(name) {
    if (!this.available) return;
    localStorage.removeItem(this.key(name));
  }

  /**
   * Effacer toutes les données de l'app
   */
  clear() {
    if (!this.available) return;

    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(this.prefix)) {
        localStorage.removeItem(key);
      }
    });
  }

  /**
   * Migrer depuis l'ancien format v39
   */
  migrateFromV39() {
    const oldPrefix = 'freel_v39';
    const migrations = {
      company: `${oldPrefix}_company`,
      missions: `${oldPrefix}_missions`,
      clients: `${oldPrefix}_clients`,
      treasury: `${oldPrefix}_treasury`,
      irConfig: `${oldPrefix}_ir_config`
    };

    const migrated = {};
    let hasMigrations = false;

    Object.entries(migrations).forEach(([newKey, oldKey]) => {
      const oldData = localStorage.getItem(oldKey);
      if (oldData) {
        try {
          migrated[newKey] = JSON.parse(oldData);
          hasMigrations = true;
        } catch (error) {
          console.error(`Error migrating ${oldKey}:`, error);
        }
      }
    });

    // Migrer les autres clés
    ['freel_goal_ca', 'freel_theme', 'freel_notif_read'].forEach(oldKey => {
      const value = localStorage.getItem(oldKey);
      if (value) {
        const newKey = oldKey.replace('freel_', '');
        try {
          migrated[newKey] = oldKey === 'freel_theme' ? value : JSON.parse(value);
          hasMigrations = true;
        } catch (error) {
          console.error(`Error migrating ${oldKey}:`, error);
        }
      }
    });

    if (hasMigrations) {
      console.log('Migrating data from v39...', migrated);
      // Sauvegarder au nouveau format
      Object.entries(migrated).forEach(([key, value]) => {
        this.save(key, value);
      });
      return true;
    }

    return false;
  }

  /**
   * Exporter toutes les données (backup)
   */
  export() {
    const data = {
      version: STORAGE_PREFIX,
      exportDate: new Date().toISOString(),
      company: this.load('company'),
      missions: this.load('missions', []),
      clients: this.load('clients', []),
      treasury: this.load('treasury'),
      irConfig: this.load('irConfig', {}),
      goalCA: this.load('goal_ca', 0),
      theme: this.load('theme', 'dark')
    };

    return data;
  }

  /**
   * Importer des données (restore)
   */
  import(data) {
    try {
      if (data.company) this.save('company', data.company);
      if (data.missions) this.save('missions', data.missions);
      if (data.clients) this.save('clients', data.clients);
      if (data.treasury) this.save('treasury', data.treasury);
      if (data.irConfig) this.save('irConfig', data.irConfig);
      if (data.goalCA !== undefined) this.save('goal_ca', data.goalCA);
      if (data.theme) this.save('theme', data.theme);

      return true;
    } catch (error) {
      console.error('Import error:', error);
      throw error;
    }
  }

  /**
   * Gérer le dépassement de quota
   */
  handleQuotaExceeded() {
    // TODO: Proposer à l'utilisateur :
    // 1. Supprimer les anciennes données
    // 2. Exporter vers Supabase
    // 3. Télécharger un backup
    alert('Espace de stockage local plein. Veuillez sauvegarder vos données.');
  }

  /**
   * Sauvegarder l'état complet du store
   */
  saveStore() {
    const state = store.state;
    this.save('company', state.company);
    this.save('missions', state.missions);
    this.save('clients', state.clients);
    this.save('treasury', state.treasury);
    this.save('irConfig', state.irConfig);
    this.save('goal_ca', state.goalCA);
    this.save('theme', state.theme);
    this.save('notif_read', state.notifRead);
  }

  /**
   * Charger l'état dans le store
   */
  loadStore() {
    // Essayer migration d'abord
    this.migrateFromV39();

    // Charger les données
    store.update({
      company: this.load('company'),
      missions: this.load('missions', []),
      clients: this.load('clients', []),
      treasury: this.load('treasury'),
      irConfig: this.load('irConfig', {}),
      goalCA: this.load('goal_ca', 0),
      theme: this.load('theme', 'dark'),
      notifRead: this.load('notif_read', [])
    });
  }
}

// Export class for testing
export { StorageService };

// Export singleton for app use
export const storage = new StorageService();
export const storageService = storage; // Alias for compatibility

// Auto-save sur certains changements (avec debounce pour éviter surcharge localStorage)
const autoSaveKeys = ['company', 'missions', 'clients', 'treasury', 'irConfig', 'goalCA', 'theme'];

// Créer une fonction debounced pour chaque clé
const debouncedSaves = {};
autoSaveKeys.forEach(key => {
  debouncedSaves[key] = debounce((value) => {
    try {
      storage.save(key, value);
    } catch (error) {
      console.error(`Auto-save failed for ${key}:`, error);
      // En cas d'erreur QuotaExceeded, proposer backup
      if (error.name === 'QuotaExceededError') {
        storage.handleQuotaExceeded();
      }
    }
  }, 500); // Debounce 500ms

  store.on(key, (value) => {
    debouncedSaves[key](value);
  });
});
