/**
 * Service de synchronisation des données
 * Synchronise localStorage avec Supabase
 */

import { store } from './Store.js';
import { storageService } from './Storage.js';
import { supabaseService } from './SupabaseService.js';

class SyncService {
  constructor() {
    this.syncing = false;
    this.lastSync = null;
    this.autoSyncInterval = null;
    this.realtimeSubscription = null;
  }

  /**
   * Active la synchronisation automatique
   */
  enableAutoSync(intervalMs = 5 * 60 * 1000) { // 5 minutes par défaut
    if (this.autoSyncInterval) {
      this.disableAutoSync();
    }

    this.autoSyncInterval = setInterval(async () => {
      if (!this.syncing) {
        await this.syncToCloud();
      }
    }, intervalMs);

    console.log('Auto-sync enabled');
  }

  /**
   * Désactive la synchronisation automatique
   */
  disableAutoSync() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
      console.log('Auto-sync disabled');
    }
  }

  /**
   * Active la synchronisation temps réel
   */
  enableRealtimeSync() {
    if (this.realtimeSubscription) {
      return;
    }

    this.realtimeSubscription = supabaseService.subscribeToUserData(async (payload) => {
      console.log('Realtime update received:', payload);

      if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
        // Récupérer les données mises à jour
        const cloudData = payload.new?.data;
        if (cloudData) {
          await this.mergeCloudData(cloudData);
        }
      }
    });

    console.log('Realtime sync enabled');
  }

  /**
   * Désactive la synchronisation temps réel
   */
  disableRealtimeSync() {
    if (this.realtimeSubscription) {
      this.realtimeSubscription();
      this.realtimeSubscription = null;
      console.log('Realtime sync disabled');
    }
  }

  /**
   * Synchronise les données locales vers le cloud
   */
  async syncToCloud() {
    if (this.syncing) {
      console.log('Sync already in progress');
      return { success: false, error: 'Sync already in progress' };
    }

    if (!supabaseService.isInitialized()) {
      console.log('Supabase not initialized');
      return { success: false, error: 'Supabase not initialized' };
    }

    this.syncing = true;
    store.set('syncing', true);

    try {
      console.log('Syncing to cloud...');

      // Récupérer toutes les données locales
      const localData = this.getLocalData();

      // Sauvegarder dans Supabase
      await supabaseService.saveUserData(localData);

      this.lastSync = new Date().toISOString();
      store.set('lastSync', this.lastSync);

      console.log('Sync to cloud successful');
      return { success: true };
    } catch (error) {
      console.error('Sync to cloud failed:', error);
      return { success: false, error: error.message };
    } finally {
      this.syncing = false;
      store.set('syncing', false);
    }
  }

  /**
   * Synchronise les données du cloud vers le local
   */
  async syncFromCloud() {
    if (this.syncing) {
      console.log('Sync already in progress');
      return { success: false, error: 'Sync already in progress' };
    }

    if (!supabaseService.isInitialized()) {
      console.log('Supabase not initialized');
      return { success: false, error: 'Supabase not initialized' };
    }

    this.syncing = true;
    store.set('syncing', true);

    try {
      console.log('Syncing from cloud...');

      // Récupérer les données du cloud
      const cloudData = await supabaseService.getUserData();

      if (cloudData) {
        // Merger les données cloud avec les données locales
        await this.mergeCloudData(cloudData);
      } else {
        console.log('No cloud data found, syncing local data to cloud');
        // Aucune donnée cloud, envoyer les données locales
        await this.syncToCloud();
      }

      this.lastSync = new Date().toISOString();
      store.set('lastSync', this.lastSync);

      console.log('Sync from cloud successful');
      return { success: true };
    } catch (error) {
      console.error('Sync from cloud failed:', error);
      return { success: false, error: error.message };
    } finally {
      this.syncing = false;
      store.set('syncing', false);
    }
  }

  /**
   * Synchronisation bidirectionnelle (merge)
   */
  async syncBidirectional() {
    if (this.syncing) {
      console.log('Sync already in progress');
      return { success: false, error: 'Sync already in progress' };
    }

    this.syncing = true;
    store.set('syncing', true);

    try {
      console.log('Bidirectional sync...');

      const localData = this.getLocalData();
      const cloudData = await supabaseService.getUserData();

      if (!cloudData) {
        // Pas de données cloud, envoyer les données locales
        await supabaseService.saveUserData(localData);
      } else {
        // Merger les données
        const mergedData = this.mergeData(localData, cloudData);

        // Sauvegarder les données mergées localement
        this.setLocalData(mergedData);

        // Sauvegarder les données mergées dans le cloud
        await supabaseService.saveUserData(mergedData);
      }

      this.lastSync = new Date().toISOString();
      store.set('lastSync', this.lastSync);

      console.log('Bidirectional sync successful');
      return { success: true };
    } catch (error) {
      console.error('Bidirectional sync failed:', error);
      return { success: false, error: error.message };
    } finally {
      this.syncing = false;
      store.set('syncing', false);
    }
  }

  /**
   * Récupère toutes les données locales
   */
  getLocalData() {
    return {
      company: store.get('company') || {},
      missions: store.get('missions') || [],
      treasury: store.get('treasury') || {},
      config: store.get('config') || {},
      theme: store.get('theme') || 'dark',
      privacyMode: store.get('privacyMode') || false
    };
  }

  /**
   * Définit les données locales
   */
  setLocalData(data) {
    if (data.company) store.set('company', data.company);
    if (data.missions) store.set('missions', data.missions);
    if (data.treasury) store.set('treasury', data.treasury);
    if (data.config) store.set('config', data.config);
    if (data.theme) store.set('theme', data.theme);
    if (typeof data.privacyMode !== 'undefined') store.set('privacyMode', data.privacyMode);
  }

  /**
   * Merge les données cloud avec les données locales
   */
  async mergeCloudData(cloudData) {
    const localData = this.getLocalData();
    const mergedData = this.mergeData(localData, cloudData);
    this.setLocalData(mergedData);
  }

  /**
   * Merge deux ensembles de données
   * Stratégie: garder les données les plus récentes par entité
   */
  mergeData(localData, cloudData) {
    const merged = { ...cloudData };

    // Merger les missions (par ID)
    if (localData.missions && cloudData.missions) {
      const localMissionsMap = new Map(localData.missions.map(m => [m.id, m]));
      const cloudMissionsMap = new Map(cloudData.missions.map(m => [m.id, m]));

      const allMissionIds = new Set([...localMissionsMap.keys(), ...cloudMissionsMap.keys()]);
      merged.missions = [];

      allMissionIds.forEach(id => {
        const local = localMissionsMap.get(id);
        const cloud = cloudMissionsMap.get(id);

        if (!cloud) {
          merged.missions.push(local);
        } else if (!local) {
          merged.missions.push(cloud);
        } else {
          // Les deux existent, garder le plus récent
          const localDate = new Date(local.updatedAt || local.createdAt || 0);
          const cloudDate = new Date(cloud.updatedAt || cloud.createdAt || 0);
          merged.missions.push(localDate > cloudDate ? local : cloud);
        }
      });
    } else if (localData.missions) {
      merged.missions = localData.missions;
    }

    // Merger la company (garder le plus récent)
    if (localData.company && cloudData.company) {
      const localDate = new Date(localData.company.updatedAt || 0);
      const cloudDate = new Date(cloudData.company.updatedAt || 0);
      merged.company = localDate > cloudDate ? localData.company : cloudData.company;
    } else if (localData.company) {
      merged.company = localData.company;
    }

    // Treasury: merger les mouvements
    if (localData.treasury && cloudData.treasury) {
      const localMovements = localData.treasury.mouvements || [];
      const cloudMovements = cloudData.treasury.mouvements || [];

      const movementsMap = new Map();
      [...cloudMovements, ...localMovements].forEach(m => {
        if (!movementsMap.has(m.id) || new Date(m.date) > new Date(movementsMap.get(m.id).date)) {
          movementsMap.set(m.id, m);
        }
      });

      merged.treasury = {
        ...cloudData.treasury,
        mouvements: Array.from(movementsMap.values()).sort((a, b) =>
          new Date(b.date) - new Date(a.date)
        )
      };
    } else if (localData.treasury) {
      merged.treasury = localData.treasury;
    }

    // Config: merger les propriétés
    if (localData.config && cloudData.config) {
      merged.config = { ...cloudData.config, ...localData.config };
    } else if (localData.config) {
      merged.config = localData.config;
    }

    return merged;
  }

  /**
   * Exporte les données locales
   */
  exportLocalData() {
    return storageService.exportData();
  }

  /**
   * Importe des données
   */
  importData(jsonData) {
    return storageService.importData(jsonData);
  }

  /**
   * Récupère l'état de synchronisation
   */
  getSyncStatus() {
    return {
      syncing: this.syncing,
      lastSync: this.lastSync,
      autoSyncEnabled: !!this.autoSyncInterval,
      realtimeSyncEnabled: !!this.realtimeSubscription
    };
  }
}

export const syncService = new SyncService();
