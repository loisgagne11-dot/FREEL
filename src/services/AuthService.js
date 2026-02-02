/**
 * Service d'authentification
 * Gère l'état d'authentification et la synchronisation
 */

import { store } from './Store.js';
import { supabaseService } from './SupabaseService.js';
import { syncService } from './SyncService.js';
import { securityService } from './SecurityService.js';

class AuthService {
  constructor() {
    this.user = null;
    this.session = null;
    this.unsubscribe = null;
    this.initialized = false;
  }

  /**
   * Initialise le service d'authentification
   */
  async initialize() {
    if (this.initialized) return;

    // Vérifier si Supabase est configuré
    if (!supabaseService.isConfigured()) {
      console.log('Supabase not configured, skipping auth initialization');
      return;
    }

    // Initialiser Supabase
    if (!supabaseService.initialize()) {
      console.error('Failed to initialize Supabase');
      return;
    }

    try {
      // Récupérer la session actuelle
      this.session = await supabaseService.getSession();
      this.user = this.session?.user || null;

      // Écouter les changements d'auth
      this.unsubscribe = supabaseService.onAuthStateChange(async (event, session) => {
        console.log('Auth state changed:', event);
        this.session = session;
        this.user = session?.user || null;

        // Mettre à jour le store
        store.set('auth', {
          user: this.user,
          session: this.session,
          isAuthenticated: !!this.user
        });

        // Gérer les événements
        switch (event) {
          case 'SIGNED_IN':
            await this.handleSignIn();
            break;
          case 'SIGNED_OUT':
            await this.handleSignOut();
            break;
          case 'TOKEN_REFRESHED':
            console.log('Token refreshed');
            break;
          case 'USER_UPDATED':
            console.log('User updated');
            break;
        }
      });

      // Mettre à jour le store initial
      store.set('auth', {
        user: this.user,
        session: this.session,
        isAuthenticated: !!this.user
      });

      // Si authentifié, déclencher la synchro
      if (this.user) {
        await this.handleSignIn();
      }

      this.initialized = true;
      console.log('Auth service initialized');
    } catch (error) {
      console.error('Failed to initialize auth service:', error);
    }
  }

  /**
   * Gère la connexion
   */
  async handleSignIn() {
    console.log('User signed in:', this.user?.email);

    try {
      // Synchroniser les données depuis le cloud
      await syncService.syncFromCloud();
    } catch (error) {
      console.error('Failed to sync from cloud:', error);
    }
  }

  /**
   * Gère la déconnexion
   */
  async handleSignOut() {
    console.log('User signed out');
    this.user = null;
    this.session = null;

    // Réinitialiser le store auth
    store.set('auth', {
      user: null,
      session: null,
      isAuthenticated: false
    });
  }

  /**
   * Inscription
   */
  async signUp(email, password, metadata = {}) {
    // Rate limiting: 3 tentatives par email toutes les 15 minutes
    const rateLimitKey = `auth:signup:${email}`;
    const rateLimit = securityService.checkRateLimit(rateLimitKey, 3, 15 * 60 * 1000);

    if (!rateLimit.allowed) {
      securityService.logSecurityEvent('signup_rate_limit_exceeded', { email });
      return { success: false, error: rateLimit.message };
    }

    try {
      const data = await supabaseService.signUp(email, password, {
        ...metadata,
        app_version: '1.0.0'
      });

      // Succès - réinitialiser le rate limit
      securityService.resetRateLimit(rateLimitKey);
      securityService.logSecurityEvent('signup_success', { email });

      return { success: true, data };
    } catch (error) {
      console.error('Sign up error:', error);
      securityService.logSecurityEvent('signup_failure', { email, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Connexion
   */
  async signIn(email, password) {
    // Rate limiting: 5 tentatives par email toutes les 15 minutes
    const rateLimitKey = `auth:signin:${email}`;
    const rateLimit = securityService.checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);

    if (!rateLimit.allowed) {
      securityService.logSecurityEvent('signin_rate_limit_exceeded', { email });
      return { success: false, error: rateLimit.message };
    }

    try {
      const data = await supabaseService.signIn(email, password);

      // Succès - réinitialiser le rate limit
      securityService.resetRateLimit(rateLimitKey);
      securityService.logSecurityEvent('signin_success', { email });

      return { success: true, data };
    } catch (error) {
      console.error('Sign in error:', error);
      securityService.logSecurityEvent('signin_failure', { email, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Déconnexion
   */
  async signOut() {
    try {
      // Sauvegarder avant de se déconnecter
      if (this.isAuthenticated()) {
        await syncService.syncToCloud();
      }

      await supabaseService.signOut();
      return { success: true };
    } catch (error) {
      console.error('Sign out error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Réinitialisation du mot de passe
   */
  async resetPassword(email) {
    try {
      await supabaseService.resetPassword(email);
      return { success: true };
    } catch (error) {
      console.error('Reset password error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Mise à jour du mot de passe
   */
  async updatePassword(newPassword) {
    try {
      await supabaseService.updatePassword(newPassword);
      return { success: true };
    } catch (error) {
      console.error('Update password error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Vérifie si l'utilisateur est authentifié
   */
  isAuthenticated() {
    return !!this.user;
  }

  /**
   * Récupère l'utilisateur actuel
   */
  getUser() {
    return this.user;
  }

  /**
   * Récupère la session actuelle
   */
  getSession() {
    return this.session;
  }

  /**
   * Détruit le service
   */
  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.initialized = false;
  }
}

export const authService = new AuthService();
