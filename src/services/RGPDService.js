/**
 * Service RGPD - Conformité RGPD (Règlement Général sur la Protection des Données)
 * Gestion du consentement, politique de confidentialité, droits des utilisateurs
 */

import { store } from './Store.js';
import { Modal } from '../components/Modal.js';
import { el } from '../utils/dom.js';

class RGPDService {
  constructor() {
    this.consentVersion = '1.0';
    this.consentKey = 'rgpd_consent';
  }

  /**
   * Vérifie si le consentement RGPD a été donné
   */
  hasConsent() {
    const consent = this.getConsent();
    return consent && consent.version === this.consentVersion && consent.accepted;
  }

  /**
   * Récupère le consentement actuel
   */
  getConsent() {
    const consentData = localStorage.getItem(this.consentKey);
    return consentData ? JSON.parse(consentData) : null;
  }

  /**
   * Enregistre le consentement
   */
  saveConsent(accepted, preferences = {}) {
    const consent = {
      version: this.consentVersion,
      accepted,
      date: new Date().toISOString(),
      preferences: {
        analytics: preferences.analytics !== false,
        functional: preferences.functional !== false,
        ...preferences
      }
    };

    localStorage.setItem(this.consentKey, JSON.stringify(consent));
    return consent;
  }

  /**
   * Révoquer le consentement
   */
  revokeConsent() {
    localStorage.removeItem(this.consentKey);
  }

  /**
   * Affiche la bannière/modale de consentement RGPD
   */
  showConsentModal() {
    return new Promise((resolve) => {
      const modal = new Modal({
        title: '🔒 Protection de vos données personnelles',
        size: 'lg',
        closeOnBackdrop: false,
        closeOnEscape: false
      });

      const content = el('div', { style: { fontSize: 'var(--font-size-sm)', lineHeight: '1.6' } }, [
        el('p', { style: { marginBottom: 'var(--spacing-md)' } },
          'Conformément au RGPD (Règlement Général sur la Protection des Données), nous vous informons sur l\'utilisation de vos données personnelles.'
        ),

        el('h4', { style: { marginTop: 'var(--spacing-md)', marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-base)' } }, 'Données collectées'),
        el('ul', { style: { marginBottom: 'var(--spacing-md)', marginLeft: 'var(--spacing-lg)' } }, [
          el('li', {}, 'Données professionnelles : missions, factures, clients, trésorerie'),
          el('li', {}, 'Données de connexion : email, mot de passe chiffré (si compte Supabase)'),
          el('li', {}, 'Données techniques : préférences d\'affichage, thème')
        ]),

        el('h4', { style: { marginTop: 'var(--spacing-md)', marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-base)' } }, 'Finalités'),
        el('ul', { style: { marginBottom: 'var(--spacing-md)', marginLeft: 'var(--spacing-lg)' } }, [
          el('li', {}, 'Gestion de votre activité freelance'),
          el('li', {}, 'Synchronisation multi-appareils (optionnel)'),
          el('li', {}, 'Amélioration de l\'application')
        ]),

        el('h4', { style: { marginTop: 'var(--spacing-md)', marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-base)' } }, 'Stockage'),
        el('p', { style: { marginBottom: 'var(--spacing-md)' } },
          'Vos données sont stockées localement dans votre navigateur (localStorage). Si vous activez la synchronisation cloud, elles sont également stockées de manière chiffrée sur les serveurs Supabase (EU).'
        ),

        el('h4', { style: { marginTop: 'var(--spacing-md)', marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-base)' } }, 'Vos droits'),
        el('p', { style: { marginBottom: 'var(--spacing-md)' } },
          'Vous disposez d\'un droit d\'accès, de rectification, de suppression et de portabilité de vos données. Ces fonctions sont disponibles dans les Paramètres.'
        ),

        el('p', { style: { marginTop: 'var(--spacing-lg)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' } },
          'Pour plus d\'informations, consultez notre Politique de confidentialité dans les Paramètres.'
        )
      ]);

      modal.setBody(content);

      modal.setFooter([
        {
          label: 'Refuser',
          className: 'btn-secondary',
          onClick: () => {
            this.saveConsent(false);
            modal.close();
            resolve(false);
          }
        },
        {
          label: 'Accepter',
          className: 'btn-primary',
          onClick: () => {
            this.saveConsent(true);
            modal.close();
            resolve(true);
          }
        }
      ]);

      modal.open();
    });
  }

  /**
   * Exporte toutes les données utilisateur (portabilité RGPD)
   */
  exportUserData() {
    const data = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      format: 'FREEL-RGPD-Export',

      // Données métier
      company: store.get('company'),
      missions: store.get('missions'),
      treasury: store.get('treasury'),
      config: store.get('config'),

      // Préférences
      theme: store.get('theme'),
      privacyMode: store.get('privacyMode'),

      // Authentification (sans le mot de passe)
      auth: {
        user: store.get('auth')?.user || null,
        email: store.get('auth')?.user?.email || null
      },

      // Consentement
      consent: this.getConsent()
    };

    // Supprimer les données sensibles
    if (data.company) {
      delete data.company.supabaseUrl;
      delete data.company.supabaseAnonKey;
    }

    return data;
  }

  /**
   * Télécharge l'export des données
   */
  downloadUserDataExport() {
    const data = this.exportUserData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freel-donnees-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    return data;
  }

  /**
   * Supprime toutes les données utilisateur (droit à l'oubli)
   */
  async deleteAllUserData() {
    // Supprimer localStorage
    localStorage.clear();

    // Supprimer sessionStorage
    sessionStorage.clear();

    // Réinitialiser le store
    store.reset();

    // Si connecté à Supabase, déconnecter
    try {
      const { supabaseService } = await import('./SupabaseService.js');
      if (supabaseService.isInitialized()) {
        await supabaseService.signOut();
      }
    } catch (error) {
      console.error('Error signing out:', error);
    }

    return true;
  }

  /**
   * Affiche la politique de confidentialité
   */
  showPrivacyPolicy() {
    const modal = new Modal({
      title: 'Politique de confidentialité',
      size: 'lg'
    });

    const content = el('div', {
      style: {
        fontSize: 'var(--font-size-sm)',
        lineHeight: '1.8',
        maxHeight: '70vh',
        overflowY: 'auto',
        padding: 'var(--spacing-md)'
      }
    }, [
      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '1. Responsable du traitement'),
      el('p', { style: { marginBottom: 'var(--spacing-lg)' } },
        'FREEL est une application web de gestion pour freelances micro-entrepreneurs. Vous êtes responsable de vos propres données professionnelles.'
      ),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '2. Données collectées'),
      el('p', { style: { marginBottom: 'var(--spacing-sm)' } }, 'Nous collectons uniquement les données nécessaires au fonctionnement de l\'application :'),
      el('ul', { style: { marginBottom: 'var(--spacing-lg)', marginLeft: 'var(--spacing-lg)' } }, [
        el('li', {}, 'Données professionnelles : informations entreprise, missions, clients, factures, charges, trésorerie'),
        el('li', {}, 'Données de compte : email et mot de passe chiffré (uniquement si vous créez un compte Supabase)'),
        el('li', {}, 'Données techniques : préférences d\'affichage, thème, configuration')
      ]),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '3. Finalités du traitement'),
      el('ul', { style: { marginBottom: 'var(--spacing-lg)', marginLeft: 'var(--spacing-lg)' } }, [
        el('li', {}, 'Gestion de votre activité freelance'),
        el('li', {}, 'Calcul automatique des charges et impôts'),
        el('li', {}, 'Génération de factures conformes à la législation française'),
        el('li', {}, 'Synchronisation multi-appareils (optionnel)'),
        el('li', {}, 'Amélioration de l\'application')
      ]),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '4. Base légale'),
      el('p', { style: { marginBottom: 'var(--spacing-lg)' } },
        'Le traitement de vos données repose sur votre consentement (article 6.1.a du RGPD) et sur l\'exécution du service que vous utilisez.'
      ),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '5. Stockage et sécurité'),
      el('p', { style: { marginBottom: 'var(--spacing-sm)' } }, 'Vos données sont stockées :'),
      el('ul', { style: { marginBottom: 'var(--spacing-sm)', marginLeft: 'var(--spacing-lg)' } }, [
        el('li', {}, 'Localement dans votre navigateur (localStorage) - données non transmises à des tiers'),
        el('li', {}, 'Sur les serveurs Supabase (hébergement EU) si vous activez la synchronisation cloud')
      ]),
      el('p', { style: { marginBottom: 'var(--spacing-lg)' } },
        'Mesures de sécurité : chiffrement HTTPS, validation des entrées, protection contre XSS/CSRF, rate limiting, Row Level Security (RLS) sur Supabase.'
      ),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '6. Durée de conservation'),
      el('p', { style: { marginBottom: 'var(--spacing-lg)' } },
        'Vos données sont conservées tant que vous utilisez l\'application. Vous pouvez les supprimer à tout moment via les Paramètres.'
      ),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '7. Partage des données'),
      el('p', { style: { marginBottom: 'var(--spacing-lg)' } },
        'Vos données ne sont jamais vendues ni partagées avec des tiers. Elles restent strictement confidentielles.'
      ),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '8. Vos droits RGPD'),
      el('p', { style: { marginBottom: 'var(--spacing-sm)' } }, 'Conformément au RGPD, vous disposez des droits suivants :'),
      el('ul', { style: { marginBottom: 'var(--spacing-lg)', marginLeft: 'var(--spacing-lg)' } }, [
        el('li', {}, 'Droit d\'accès : consulter vos données dans l\'application'),
        el('li', {}, 'Droit de rectification : modifier vos données à tout moment'),
        el('li', {}, 'Droit de suppression (« droit à l\'oubli ») : supprimer toutes vos données via Paramètres > Effacer toutes les données'),
        el('li', {}, 'Droit à la portabilité : exporter vos données au format JSON via Paramètres > Exporter'),
        el('li', {}, 'Droit d\'opposition : arrêter d\'utiliser l\'application à tout moment'),
        el('li', {}, 'Droit de retrait du consentement : révoquer votre consentement dans les Paramètres')
      ]),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '9. Cookies'),
      el('p', { style: { marginBottom: 'var(--spacing-lg)' } },
        'Cette application n\'utilise pas de cookies. Les données sont stockées en localStorage (stockage local du navigateur).'
      ),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '10. Modifications'),
      el('p', { style: { marginBottom: 'var(--spacing-lg)' } },
        'Nous nous réservons le droit de modifier cette politique. Vous serez informé de tout changement majeur.'
      ),

      el('p', { style: { marginTop: 'var(--spacing-xl)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' } },
        `Dernière mise à jour : ${new Date().toLocaleDateString('fr-FR')} - Version ${this.consentVersion}`
      )
    ]);

    modal.setBody(content);
    modal.setFooter([
      {
        label: 'Fermer',
        className: 'btn-primary',
        onClick: () => modal.close()
      }
    ]);

    modal.open();
  }

  /**
   * Affiche les mentions légales
   */
  showLegalNotices() {
    const modal = new Modal({
      title: 'Mentions légales',
      size: 'lg'
    });

    const company = store.get('company') || {};

    const content = el('div', {
      style: {
        fontSize: 'var(--font-size-sm)',
        lineHeight: '1.8',
        maxHeight: '70vh',
        overflowY: 'auto',
        padding: 'var(--spacing-md)'
      }
    }, [
      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '1. Éditeur de l\'application'),
      el('p', { style: { marginBottom: 'var(--spacing-sm)' } }, 'FREEL - Application de gestion pour freelances'),
      el('p', { style: { marginBottom: 'var(--spacing-sm)' } }, company.nom ? `Utilisé par : ${company.nom}` : ''),
      el('p', { style: { marginBottom: 'var(--spacing-lg)' } }, company.siret ? `SIRET : ${company.siret}` : ''),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '2. Hébergement'),
      el('p', { style: { marginBottom: 'var(--spacing-sm)' } }, 'Application web hébergée localement dans votre navigateur.'),
      el('p', { style: { marginBottom: 'var(--spacing-lg)' } },
        'Synchronisation cloud (optionnelle) : Supabase (conformité RGPD, hébergement EU)'
      ),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '3. Propriété intellectuelle'),
      el('p', { style: { marginBottom: 'var(--spacing-lg)' } },
        'Le code source, la conception et tous les éléments de cette application sont protégés par le droit d\'auteur. Toute reproduction non autorisée est interdite.'
      ),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '4. Limitation de responsabilité'),
      el('p', { style: { marginBottom: 'var(--spacing-sm)' } },
        'FREEL est fourni "tel quel" sans garantie d\'aucune sorte. L\'utilisateur est seul responsable :'
      ),
      el('ul', { style: { marginBottom: 'var(--spacing-lg)', marginLeft: 'var(--spacing-lg)' } }, [
        el('li', {}, 'De la sauvegarde de ses données'),
        el('li', {}, 'De la vérification des calculs de charges et impôts'),
        el('li', {}, 'De la conformité de ses factures avec la législation en vigueur'),
        el('li', {}, 'De ses déclarations fiscales et comptables')
      ]),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '5. Données personnelles'),
      el('p', { style: { marginBottom: 'var(--spacing-lg)' } },
        'Voir notre Politique de confidentialité pour plus d\'informations sur la gestion de vos données personnelles.'
      ),

      el('h3', { style: { marginBottom: 'var(--spacing-md)' } }, '6. Droit applicable'),
      el('p', { style: { marginBottom: 'var(--spacing-lg)' } },
        'Les présentes mentions légales sont régies par le droit français. En cas de litige, les tribunaux français seront seuls compétents.'
      ),

      el('p', { style: { marginTop: 'var(--spacing-xl)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' } },
        `Dernière mise à jour : ${new Date().toLocaleDateString('fr-FR')}`
      )
    ]);

    modal.setBody(content);
    modal.setFooter([
      {
        label: 'Fermer',
        className: 'btn-primary',
        onClick: () => modal.close()
      }
    ]);

    modal.open();
  }
}

export const rgpdService = new RGPDService();
