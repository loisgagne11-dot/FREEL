/**
 * Composant Modal réutilisable
 * Remplace les 96 fonctions show*()
 */

import { el, $ } from '../utils/dom.js';

export class Modal {
  constructor(options = {}) {
    this.options = {
      title: '',
      size: 'md', // sm, md, lg
      closeOnBackdrop: true,
      closeOnEscape: true,
      footer: true,
      ...options
    };

    this.isOpen = false;
    this.overlay = null;
    this.modal = null;
    this.onClose = null;
  }

  /**
   * Créer la structure HTML
   */
  build() {
    const { title, size, footer } = this.options;

    // Overlay
    this.overlay = el('div', {
      className: 'modal-overlay',
      onClick: (e) => {
        if (e.target === this.overlay && this.options.closeOnBackdrop) {
          this.close();
        }
      }
    });

    // Modal
    this.modal = el('div', {
      className: `modal modal-${size}`
    });

    // Header
    const header = el('div', { className: 'modal-header' }, [
      el('h2', { className: 'modal-title' }, title),
      el('button', {
        className: 'modal-close',
        onClick: () => this.close()
      }, '✕')
    ]);

    // Body
    this.body = el('div', { className: 'modal-body' });

    // Footer
    if (footer) {
      this.footer = el('div', { className: 'modal-footer' });
      this.modal.appendChild(header);
      this.modal.appendChild(this.body);
      this.modal.appendChild(this.footer);
    } else {
      this.modal.appendChild(header);
      this.modal.appendChild(this.body);
    }

    this.overlay.appendChild(this.modal);

    return this;
  }

  /**
   * Définir le contenu du body
   */
  setBody(content) {
    this.body.innerHTML = '';

    if (typeof content === 'string') {
      this.body.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      this.body.appendChild(content);
    } else if (Array.isArray(content)) {
      content.forEach(item => {
        if (item instanceof HTMLElement) {
          this.body.appendChild(item);
        }
      });
    }

    return this;
  }

  /**
   * Définir le contenu du footer
   */
  setFooter(buttons) {
    if (!this.footer) return this;

    this.footer.innerHTML = '';

    buttons.forEach(btn => {
      const button = el('button', {
        className: `btn ${btn.className || 'btn-ghost'}`,
        onClick: btn.onClick
      }, btn.label);

      this.footer.appendChild(button);
    });

    return this;
  }

  /**
   * Ouvrir la modal
   */
  open() {
    if (this.isOpen) return this;

    if (!this.overlay) {
      this.build();
    }

    document.body.appendChild(this.overlay);
    this.isOpen = true;

    // Bloquer le scroll du body
    document.body.style.overflow = 'hidden';

    // Escape key
    if (this.options.closeOnEscape) {
      this.handleEscape = (e) => {
        if (e.key === 'Escape') {
          this.close();
        }
      };
      document.addEventListener('keydown', this.handleEscape);
    }

    return this;
  }

  /**
   * Fermer la modal
   */
  close() {
    if (!this.isOpen) return this;

    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }

    this.isOpen = false;

    // Restaurer le scroll
    document.body.style.overflow = '';

    // Retirer l'event listener
    if (this.handleEscape) {
      document.removeEventListener('keydown', this.handleEscape);
    }

    // Callback
    if (this.onClose) {
      this.onClose();
    }

    return this;
  }

  /**
   * Détruire la modal
   */
  destroy() {
    this.close();
    this.overlay = null;
    this.modal = null;
    this.body = null;
    this.footer = null;
  }
}

/**
 * Helper pour créer une modal simple
 */
export function showModal(title, content, options = {}) {
  const modal = new Modal({ title, ...options });

  modal.setBody(content);

  if (options.buttons) {
    modal.setFooter(options.buttons);
  }

  modal.open();

  return modal;
}

/**
 * Modal de confirmation
 */
export function confirmModal(message, options = {}) {
  return new Promise((resolve) => {
    const modal = new Modal({
      title: options.title || 'Confirmation',
      size: 'sm',
      ...options
    });

    modal.setBody(el('p', {}, message));

    modal.setFooter([
      {
        label: options.cancelLabel || 'Annuler',
        className: 'btn-ghost',
        onClick: () => {
          modal.close();
          resolve(false);
        }
      },
      {
        label: options.confirmLabel || 'Confirmer',
        className: options.danger ? 'btn-danger' : 'btn-primary',
        onClick: () => {
          modal.close();
          resolve(true);
        }
      }
    ]);

    modal.onClose = () => resolve(false);
    modal.open();
  });
}

/**
 * Modal d'alerte
 */
export function alertModal(message, options = {}) {
  return new Promise((resolve) => {
    const modal = new Modal({
      title: options.title || 'Information',
      size: 'sm',
      ...options
    });

    modal.setBody(el('p', {}, message));

    modal.setFooter([
      {
        label: options.okLabel || 'OK',
        className: 'btn-primary',
        onClick: () => {
          modal.close();
          resolve(true);
        }
      }
    ]);

    modal.onClose = () => resolve(true);
    modal.open();
  });
}

/**
 * Modal de formulaire
 */
export function formModal(title, fields, options = {}) {
  return new Promise((resolve, reject) => {
    const modal = new Modal({ title, ...options });

    // Créer le formulaire
    const form = el('form', {
      onSubmit: (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Convertir les types number
        fields.forEach(field => {
          if (field.type === 'number' && data[field.name]) {
            data[field.name] = parseFloat(data[field.name]);
          }
        });

        // Validation si un schéma est fourni
        if (options.schema) {
          try {
            const validated = options.schema.parse(data);
            modal.close();
            resolve(validated);
          } catch (error) {
            // Afficher les erreurs de validation
            const errorDiv = form.querySelector('.form-errors');
            if (errorDiv) {
              errorDiv.innerHTML = '';
              if (error.errors) {
                error.errors.forEach(err => {
                  const errEl = el('div', { className: 'error-message', style: { color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' } },
                    `${err.path.join('.')}: ${err.message}`
                  );
                  errorDiv.appendChild(errEl);
                });
              } else {
                errorDiv.textContent = 'Erreur de validation';
              }
            }
          }
        } else {
          modal.close();
          resolve(data);
        }
      }
    });

    // Ajouter un conteneur pour les erreurs
    const errorContainer = el('div', { className: 'form-errors' });
    form.appendChild(errorContainer);

    // Ajouter les champs
    fields.forEach(field => {
      const group = el('div', { className: 'input-group' });

      if (field.label) {
        group.appendChild(
          el('label', { className: 'input-label' }, field.label)
        );
      }

      let input;
      if (field.type === 'textarea') {
        input = el('textarea', {
          name: field.name,
          className: 'textarea',
          placeholder: field.placeholder || '',
          required: field.required || false,
          value: field.value || ''
        });
      } else if (field.type === 'select') {
        input = el('select', {
          name: field.name,
          className: 'select',
          required: field.required || false
        });

        field.options?.forEach(opt => {
          const option = el('option', {
            value: opt.value,
            selected: opt.value === field.value
          }, opt.label);
          input.appendChild(option);
        });
      } else {
        input = el('input', {
          type: field.type || 'text',
          name: field.name,
          className: 'input',
          placeholder: field.placeholder || '',
          required: field.required || false,
          value: field.value || '',
          step: field.type === 'number' ? 'any' : undefined
        });
      }

      group.appendChild(input);
      form.appendChild(group);
    });

    modal.setBody(form);

    modal.setFooter([
      {
        label: 'Annuler',
        className: 'btn-ghost',
        onClick: () => {
          modal.close();
          reject(new Error('Cancelled'));
        }
      },
      {
        label: options.submitLabel || 'Valider',
        className: 'btn-primary',
        onClick: () => {
          form.dispatchEvent(new Event('submit'));
        }
      }
    ]);

    modal.onClose = () => reject(new Error('Closed'));
    modal.open();
  });
}
