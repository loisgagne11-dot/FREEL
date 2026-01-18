/**
 * Composant Toast pour les notifications
 */

import { el } from '../utils/dom.js';

class ToastManager {
  constructor() {
    this.toasts = [];
    this.container = null;
  }

  /**
   * Créer le conteneur de toasts
   */
  getContainer() {
    if (!this.container) {
      this.container = el('div', {
        className: 'toast-container',
        style: {
          position: 'fixed',
          top: 'var(--spacing-xl)',
          right: 'var(--spacing-xl)',
          zIndex: 'var(--z-toast)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-md)',
          maxWidth: '400px'
        }
      });
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  /**
   * Afficher un toast
   */
  show(message, options = {}) {
    const {
      type = 'info', // success, danger, warning, info
      duration = 3000,
      icon = this.getIcon(type)
    } = options;

    const toast = el('div', {
      className: `toast toast-${type}`,
      style: {
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }
    }, [
      el('div', {
        style: {
          fontSize: 'var(--font-size-xl)',
          flexShrink: '0'
        }
      }, icon),
      el('div', {
        style: {
          flex: '1',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-xs)'
        }
      }, [
        options.title && el('div', {
          style: {
            fontWeight: 'var(--font-weight-semibold)'
          }
        }, options.title),
        el('div', {}, message)
      ]),
      el('button', {
        className: 'btn-icon',
        style: {
          flexShrink: '0',
          width: '24px',
          height: '24px',
          padding: '0',
          background: 'transparent'
        },
        onClick: () => this.remove(toast)
      }, '✕')
    ]);

    this.getContainer().appendChild(toast);
    this.toasts.push(toast);

    // Auto-remove
    if (duration > 0) {
      setTimeout(() => this.remove(toast), duration);
    }

    return toast;
  }

  /**
   * Retirer un toast
   */
  remove(toast) {
    toast.style.animation = 'fadeOut 0.2s ease-out';

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.toasts = this.toasts.filter(t => t !== toast);

      // Supprimer le conteneur si vide
      if (this.toasts.length === 0 && this.container) {
        this.container.parentNode.removeChild(this.container);
        this.container = null;
      }
    }, 200);
  }

  /**
   * Obtenir l'icône selon le type
   */
  getIcon(type) {
    const icons = {
      success: '✓',
      danger: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || icons.info;
  }

  /**
   * Raccourcis
   */
  success(message, options = {}) {
    return this.show(message, { ...options, type: 'success' });
  }

  error(message, options = {}) {
    return this.show(message, { ...options, type: 'danger' });
  }

  warning(message, options = {}) {
    return this.show(message, { ...options, type: 'warning' });
  }

  info(message, options = {}) {
    return this.show(message, { ...options, type: 'info' });
  }

  /**
   * Fermer tous les toasts
   */
  closeAll() {
    [...this.toasts].forEach(toast => this.remove(toast));
  }
}

// Singleton
export const toast = new ToastManager();

// Ajouter animation fadeOut dans le CSS global
if (!document.querySelector('#toast-styles')) {
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    @keyframes fadeOut {
      from {
        opacity: 1;
        transform: translateX(0);
      }
      to {
        opacity: 0;
        transform: translateX(100px);
      }
    }
  `;
  document.head.appendChild(style);
}
