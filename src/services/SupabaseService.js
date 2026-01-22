/**
 * Service Supabase pour l'authentification et la base de données
 */

import { createClient } from '@supabase/supabase-js';
import { store } from './Store.js';

// Configuration Supabase (à configurer via les settings)
const getSupabaseConfig = () => {
  const company = store.get('company') || {};
  return {
    url: company.supabaseUrl || null,
    anonKey: company.supabaseAnonKey || null
  };
};

class SupabaseService {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  /**
   * Initialise le client Supabase
   */
  initialize() {
    const config = getSupabaseConfig();

    if (!config.url || !config.anonKey) {
      console.warn('Supabase not configured');
      return false;
    }

    try {
      this.client = createClient(config.url, config.anonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      });

      this.initialized = true;
      console.log('Supabase initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize Supabase:', error);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Vérifie si Supabase est initialisé
   */
  isInitialized() {
    return this.initialized && this.client !== null;
  }

  /**
   * Récupère le client Supabase
   */
  getClient() {
    if (!this.isInitialized()) {
      this.initialize();
    }
    return this.client;
  }

  /**
   * Configure Supabase avec les credentials
   */
  configure(url, anonKey) {
    const company = store.get('company') || {};
    company.supabaseUrl = url;
    company.supabaseAnonKey = anonKey;
    store.set('company', company);

    // Réinitialiser le client
    this.client = null;
    this.initialized = false;

    return this.initialize();
  }

  /**
   * Vérifie si Supabase est configuré
   */
  isConfigured() {
    const config = getSupabaseConfig();
    return !!(config.url && config.anonKey);
  }

  // --- Auth Methods ---

  /**
   * Inscription avec email/password
   */
  async signUp(email, password, metadata = {}) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    });

    if (error) throw error;
    return data;
  }

  /**
   * Connexion avec email/password
   */
  async signIn(email, password) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  }

  /**
   * Déconnexion
   */
  async signOut() {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');

    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  /**
   * Récupère l'utilisateur actuel
   */
  async getUser() {
    const client = this.getClient();
    if (!client) return null;

    const { data: { user }, error } = await client.auth.getUser();
    if (error) throw error;
    return user;
  }

  /**
   * Récupère la session actuelle
   */
  async getSession() {
    const client = this.getClient();
    if (!client) return null;

    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    return session;
  }

  /**
   * Écoute les changements d'auth
   */
  onAuthStateChange(callback) {
    const client = this.getClient();
    if (!client) return () => {};

    const { data: { subscription } } = client.auth.onAuthStateChange(callback);
    return () => subscription.unsubscribe();
  }

  /**
   * Réinitialisation du mot de passe
   */
  async resetPassword(email) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');

    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });

    if (error) throw error;
  }

  /**
   * Mise à jour du mot de passe
   */
  async updatePassword(newPassword) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');

    const { error } = await client.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;
  }

  // --- Database Methods ---

  /**
   * Sauvegarde les données utilisateur
   */
  async saveUserData(data) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');

    const user = await this.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await client
      .from('user_data')
      .upsert({
        user_id: user.id,
        data,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  }

  /**
   * Récupère les données utilisateur
   */
  async getUserData() {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');

    const user = await this.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await client
      .from('user_data')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      throw error;
    }

    return data?.data || null;
  }

  /**
   * Supprime les données utilisateur
   */
  async deleteUserData() {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');

    const user = await this.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await client
      .from('user_data')
      .delete()
      .eq('user_id', user.id);

    if (error) throw error;
  }

  /**
   * Écoute les changements en temps réel
   */
  subscribeToUserData(callback) {
    const client = this.getClient();
    if (!client) return () => {};

    const channel = client
      .channel('user_data_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_data'
      }, callback)
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }
}

export const supabaseService = new SupabaseService();
