/**
 * Point d'entrée principal de FREEL V52
 */

import './assets/styles/main.css';

import { store } from './services/Store.js';
import { storage } from './services/Storage.js';
import { router } from './services/Router.js';
import { initTheme } from './services/Theme.js';
import { authService } from './services/AuthService.js';
import { rgpdService } from './services/RGPDService.js';
import { toast } from './components/Toast.js';
import { OnboardingWizard } from './components/OnboardingWizard.js';
import { DashboardView } from './views/DashboardView.js';
import { MissionsView } from './views/MissionsView.js';
import { TreasuryView } from './views/TreasuryView.js';
import { InvoicesView } from './views/InvoicesView.js';
import { ChargesView } from './views/ChargesView.js';
import { SettingsView } from './views/SettingsView.js';

/**
 * Initialiser l'application
 */
async function init() {
  try {
    // Charger les données du storage
    storage.loadStore();

    // Initialiser le thème
    initTheme();

    // Initialiser l'authentification (si configuré)
    try {
      await authService.initialize();
    } catch (error) {
      console.log('Auth initialization skipped:', error.message);
    }

    // Initialiser le router
    router.register('dashboard', () => new DashboardView());
    router.register('missions', () => new MissionsView());
    router.register('treasury', () => new TreasuryView());
    router.register('invoices', () => new InvoicesView());
    router.register('charges', () => new ChargesView());
    router.register('settings', () => new SettingsView());

    // Route par défaut
    router.setDefault('dashboard');

    // Démarrer le router
    router.start();

    // Vérifier le consentement RGPD (doit être fait après le router)
    if (!rgpdService.hasConsent()) {
      await rgpdService.showConsentModal();
    }

    // Vérifier si l'onboarding a été complété
    const onboardingCompleted = storage.load('onboarding_completed', false);
    if (!onboardingCompleted) {
      showOnboarding();
      return; // Ne pas continuer le chargement si onboarding non terminé
    }

    // Auto-save périodique
    setInterval(() => {
      try {
        storage.saveStore();
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, 30000); // Toutes les 30 secondes

    // Log version
    console.log(`%cFREEL V52%c - Sprint 5: Onboarding + 2026 Values`,
      'font-size: 24px; font-weight: bold; color: #845ef7;',
      'font-size: 14px; color: #999;'
    );

  } catch (error) {
    console.error('Initialization error:', error);
    toast.error('Erreur lors du chargement de l\'application');
  }
}

/**
 * Afficher l'onboarding
 */
function showOnboarding() {
  const wizard = new OnboardingWizard();
  wizard.open();
}

/**
 * Gestion des erreurs globales
 */
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  toast.error('Une erreur est survenue');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  toast.error('Une erreur est survenue');
});

// Démarrer l'app quand le DOM est prêt
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export pour debug
window.FREEL = {
  store,
  storage,
  router,
  version: 52
};
