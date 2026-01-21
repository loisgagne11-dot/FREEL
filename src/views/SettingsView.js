/**
 * Vue Paramètres avec authentification et synchronisation
 */

import { el, $ } from '../utils/dom.js';
import { store } from '../services/Store.js';
import { toggleTheme } from '../services/Theme.js';
import { storageService } from '../services/Storage.js';
import { authService } from '../services/AuthService.js';
import { supabaseService } from '../services/SupabaseService.js';
import { syncService } from '../services/SyncService.js';
import { Modal, formModal } from '../components/Modal.js';
import { toast } from '../components/Toast.js';
import { fmtDate } from '../utils/formatters.js';

export class SettingsView {
  constructor() {
    this.container = null;
  }

  render() {
    const theme = store.get('theme');
    const auth = store.get('auth') || {};
    const isAuthenticated = auth.isAuthenticated || false;
    const user = auth.user;
    const syncStatus = syncService.getSyncStatus();

    this.container = el('div', { class: 'view-container' }, [
      el('h1', { style: { marginBottom: 'var(--spacing-xl)' } }, 'Paramètres'),

      // Authentification
      this.renderAuthSection(isAuthenticated, user),

      // Synchronisation (si authentifié)
      isAuthenticated && this.renderSyncSection(syncStatus),

      // Apparence
      this.renderAppearanceSection(theme),

      // Données
      this.renderDataSection(),

      // À propos
      this.renderAboutSection()
    ].filter(Boolean));

    return this.container;
  }

  renderAuthSection(isAuthenticated, user) {
    if (isAuthenticated) {
      return el('section', { class: 'card', style: { marginBottom: 'var(--spacing-lg)' } }, [
        el('h3', {}, 'Compte'),
        el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' } }, [
          el('div', {}, [
            el('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' } }, 'Email'),
            el('div', {}, user?.email || 'N/A')
          ]),
          el('div', { style: { display: 'flex', gap: 'var(--spacing-md)' } }, [
            el('button', {
              class: 'btn btn-secondary',
              onclick: () => this.showChangePasswordModal()
            }, 'Changer mot de passe'),
            el('button', {
              class: 'btn btn-danger',
              onclick: () => this.signOut()
            }, 'Se déconnecter')
          ])
        ])
      ]);
    } else {
      return el('section', { class: 'card', style: { marginBottom: 'var(--spacing-lg)' } }, [
        el('h3', {}, 'Synchronisation Cloud'),
        el('p', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-md)' } },
          'Connectez-vous pour synchroniser vos données sur tous vos appareils'
        ),
        el('div', { style: { display: 'flex', gap: 'var(--spacing-md)' } }, [
          el('button', {
            class: 'btn btn-primary',
            onclick: () => this.showSignInModal()
          }, 'Se connecter'),
          el('button', {
            class: 'btn btn-secondary',
            onclick: () => this.showSignUpModal()
          }, 'Créer un compte'),
          el('button', {
            class: 'btn btn-ghost',
            onclick: () => this.showConfigureSupabaseModal()
          }, '⚙️ Configuration')
        ])
      ]);
    }
  }

  renderSyncSection(syncStatus) {
    return el('section', { class: 'card', style: { marginBottom: 'var(--spacing-lg)' } }, [
      el('h3', {}, 'Synchronisation'),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' } }, [
        el('div', {}, [
          el('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' } }, 'Dernière synchronisation'),
          el('div', {}, syncStatus.lastSync ? fmtDate(syncStatus.lastSync) + ' ' + new Date(syncStatus.lastSync).toLocaleTimeString() : 'Jamais')
        ]),
        el('div', {}, [
          el('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' } }, 'État'),
          el('div', {},
            syncStatus.syncing ? '🔄 Synchronisation en cours...' :
            syncStatus.autoSyncEnabled ? '✓ Auto-sync activée' : '⏸️ Auto-sync désactivée'
          )
        ]),
        el('div', { style: { display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap' } }, [
          el('button', {
            class: 'btn btn-primary',
            onclick: () => this.syncNow(),
            disabled: syncStatus.syncing
          }, '🔄 Synchroniser maintenant'),
          el('button', {
            class: 'btn btn-secondary',
            onclick: () => this.toggleAutoSync()
          }, syncStatus.autoSyncEnabled ? 'Désactiver auto-sync' : 'Activer auto-sync'),
          el('button', {
            class: 'btn btn-secondary',
            onclick: () => this.toggleRealtimeSync()
          }, syncStatus.realtimeSyncEnabled ? 'Désactiver temps réel' : 'Activer temps réel')
        ])
      ])
    ]);
  }

  renderAppearanceSection(theme) {
    const privacyMode = store.get('privacyMode') || false;

    return el('section', { class: 'card', style: { marginBottom: 'var(--spacing-lg)' } }, [
      el('h3', {}, 'Apparence'),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' } }, [
        el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
          el('div', {}, [
            el('div', {}, 'Thème'),
            el('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' } },
              theme === 'dark' ? 'Sombre' : 'Clair')
          ]),
          el('button', {
            class: 'btn btn-ghost',
            onclick: () => {
              toggleTheme();
              toast.success(`Thème ${store.get('theme')} activé`);
              setTimeout(() => this.refresh(), 100);
            }
          }, '🌓 Changer')
        ]),
        el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
          el('div', {}, [
            el('div', {}, 'Mode confidentialité'),
            el('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' } },
              'Masquer les montants')
          ]),
          el('button', {
            class: 'btn btn-ghost',
            onclick: () => {
              store.set('privacyMode', !privacyMode);
              toast.success(`Mode confidentialité ${!privacyMode ? 'activé' : 'désactivé'}`);
              setTimeout(() => this.refresh(), 100);
            }
          }, privacyMode ? '✓ Activé' : 'Désactivé')
        ])
      ])
    ]);
  }

  renderDataSection() {
    return el('section', { class: 'card', style: { marginBottom: 'var(--spacing-lg)' } }, [
      el('h3', {}, 'Données locales'),
      el('p', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-md)' } },
        'Exportez ou importez vos données stockées localement'
      ),
      el('div', { style: { display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap' } }, [
        el('button', {
          class: 'btn btn-primary',
          onclick: () => this.exportData()
        }, '📥 Exporter (JSON)'),
        el('button', {
          class: 'btn btn-secondary',
          onclick: () => this.importData()
        }, '📤 Importer (JSON)'),
        el('button', {
          class: 'btn btn-danger',
          onclick: () => this.clearAllData()
        }, '🗑️ Effacer toutes les données')
      ])
    ]);
  }

  renderAboutSection() {
    return el('section', { class: 'card' }, [
      el('h3', {}, 'À propos'),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' } }, [
        el('div', {}, [
          el('div', { style: { fontWeight: 'var(--font-weight-semibold)' } }, 'FREEL V51'),
          el('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' } },
            'Gestion freelance micro-entrepreneur')
        ]),
        el('div', {}, [
          el('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' } }, 'Version'),
          el('div', {}, '1.0.0')
        ]),
        el('div', {}, [
          el('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' } }, 'Architecture'),
          el('div', {}, 'Modulaire, PWA, Cloud-enabled')
        ])
      ])
    ]);
  }

  // Actions - Auth

  async showSignInModal() {
    if (!supabaseService.isConfigured()) {
      toast.error('Veuillez d\'abord configurer Supabase');
      await this.showConfigureSupabaseModal();
      return;
    }

    const data = await formModal('Se connecter', [
      {
        name: 'email',
        label: 'Email',
        type: 'email',
        required: true
      },
      {
        name: 'password',
        label: 'Mot de passe',
        type: 'password',
        required: true
      }
    ]);

    const result = await authService.signIn(data.email, data.password);

    if (result.success) {
      toast.success('Connexion réussie');
      setTimeout(() => this.refresh(), 500);
    } else {
      toast.error(result.error || 'Erreur de connexion');
    }
  }

  async showSignUpModal() {
    if (!supabaseService.isConfigured()) {
      toast.error('Veuillez d\'abord configurer Supabase');
      await this.showConfigureSupabaseModal();
      return;
    }

    const data = await formModal('Créer un compte', [
      {
        name: 'email',
        label: 'Email',
        type: 'email',
        required: true
      },
      {
        name: 'password',
        label: 'Mot de passe',
        type: 'password',
        required: true
      },
      {
        name: 'confirmPassword',
        label: 'Confirmer le mot de passe',
        type: 'password',
        required: true
      }
    ]);

    if (data.password !== data.confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }

    const result = await authService.signUp(data.email, data.password);

    if (result.success) {
      toast.success('Compte créé ! Vérifiez votre email pour confirmer');
    } else {
      toast.error(result.error || 'Erreur lors de la création du compte');
    }
  }

  async showChangePasswordModal() {
    const data = await formModal('Changer le mot de passe', [
      {
        name: 'newPassword',
        label: 'Nouveau mot de passe',
        type: 'password',
        required: true
      },
      {
        name: 'confirmPassword',
        label: 'Confirmer le mot de passe',
        type: 'password',
        required: true
      }
    ]);

    if (data.newPassword !== data.confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }

    const result = await authService.updatePassword(data.newPassword);

    if (result.success) {
      toast.success('Mot de passe mis à jour');
    } else {
      toast.error(result.error || 'Erreur lors de la mise à jour');
    }
  }

  async signOut() {
    const result = await authService.signOut();

    if (result.success) {
      toast.success('Déconnexion réussie');
      setTimeout(() => this.refresh(), 500);
    } else {
      toast.error(result.error || 'Erreur lors de la déconnexion');
    }
  }

  async showConfigureSupabaseModal() {
    const company = store.get('company') || {};

    const data = await formModal('Configuration Supabase', [
      {
        name: 'url',
        label: 'Supabase URL',
        type: 'text',
        placeholder: 'https://xxx.supabase.co',
        value: company.supabaseUrl || '',
        required: true
      },
      {
        name: 'anonKey',
        label: 'Supabase Anon Key',
        type: 'text',
        placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        value: company.supabaseAnonKey || '',
        required: true
      }
    ]);

    const success = supabaseService.configure(data.url, data.anonKey);

    if (success) {
      toast.success('Supabase configuré');
      // Initialiser auth service
      await authService.initialize();
      setTimeout(() => this.refresh(), 500);
    } else {
      toast.error('Erreur de configuration Supabase');
    }
  }

  // Actions - Sync

  async syncNow() {
    toast.info('Synchronisation en cours...');
    const result = await syncService.syncBidirectional();

    if (result.success) {
      toast.success('Synchronisation réussie');
      setTimeout(() => this.refresh(), 500);
    } else {
      toast.error(result.error || 'Erreur de synchronisation');
    }
  }

  toggleAutoSync() {
    const syncStatus = syncService.getSyncStatus();

    if (syncStatus.autoSyncEnabled) {
      syncService.disableAutoSync();
      toast.success('Auto-sync désactivée');
    } else {
      syncService.enableAutoSync();
      toast.success('Auto-sync activée');
    }

    setTimeout(() => this.refresh(), 100);
  }

  toggleRealtimeSync() {
    const syncStatus = syncService.getSyncStatus();

    if (syncStatus.realtimeSyncEnabled) {
      syncService.disableRealtimeSync();
      toast.success('Temps réel désactivé');
    } else {
      syncService.enableRealtimeSync();
      toast.success('Temps réel activé');
    }

    setTimeout(() => this.refresh(), 100);
  }

  // Actions - Data

  exportData() {
    const data = syncService.exportLocalData();
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
        const result = syncService.importData(data);

        if (result.success) {
          toast.success('Import réussi');
          window.location.reload();
        } else {
          toast.error('Erreur d\'import');
        }
      } catch (error) {
        toast.error('Erreur d\'import');
        console.error(error);
      }
    };
    input.click();
  }

  async clearAllData() {
    const modal = new Modal({
      title: 'Effacer toutes les données',
      size: 'sm',
      closeOnBackdrop: false
    });

    modal.setBody(el('p', {}, 'Êtes-vous sûr de vouloir effacer toutes les données ? Cette action est irréversible.'));
    modal.setFooter([
      {
        text: 'Annuler',
        class: 'btn-secondary',
        onClick: () => modal.close()
      },
      {
        text: 'Effacer',
        class: 'btn-danger',
        onClick: () => {
          localStorage.clear();
          toast.success('Données effacées');
          modal.close();
          setTimeout(() => window.location.reload(), 1000);
        }
      }
    ]);

    modal.open();
  }

  refresh() {
    const container = $('#main-content');
    if (container) {
      container.innerHTML = '';
      container.appendChild(this.render());
    }
  }

  destroy() {}
}
