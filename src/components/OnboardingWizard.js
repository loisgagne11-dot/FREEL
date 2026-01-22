/**
 * Wizard d'onboarding pour configurer la société
 */

import { el } from '../utils/dom.js';
import { store } from '../services/Store.js';
import { storage } from '../services/Storage.js';
import { LEGAL } from '../config.js';

export class OnboardingWizard {
  constructor() {
    this.currentStep = 0;
    this.data = {
      // Infos société
      name: '',
      siret: '',
      address: '',
      city: '',
      postalCode: '',
      email: '',
      phone: '',

      // Infos fiscales
      creationDate: '',
      activityType: 'service', // service (BNC) ou vente (BIC)
      regime: 'BNC',
      acre: false,
      versementLib: false,
      parts: 1,

      // Objectif
      goalCA: 0,

      // Optionnel
      iban: '',
      tvaIntra: '',
      apeCode: '',
      rcs: '',
      rcPro: ''
    };

    this.steps = [
      {
        title: 'Bienvenue sur Freel',
        description: 'Configurez votre micro-entreprise en quelques étapes',
        render: () => this.renderWelcome()
      },
      {
        title: 'Informations de votre société',
        description: 'Vos informations administratives',
        render: () => this.renderCompanyInfo()
      },
      {
        title: 'Configuration fiscale',
        description: 'Paramètres fiscaux et cotisations',
        render: () => this.renderFiscalConfig()
      },
      {
        title: 'Objectifs et facturation',
        description: 'Définissez vos objectifs',
        render: () => this.renderGoals()
      },
      {
        title: 'Informations bancaires (optionnel)',
        description: 'Pour la génération de factures',
        render: () => this.renderBankInfo()
      }
    ];
  }

  /**
   * Ouvrir le wizard
   */
  open() {
    this.currentStep = 0;
    this.container = el('div', { className: 'onboarding-overlay' });
    this.wizard = el('div', { className: 'onboarding-wizard' });

    this.container.appendChild(this.wizard);
    document.body.appendChild(this.container);

    this.render();
  }

  /**
   * Fermer le wizard
   */
  close() {
    if (this.container) {
      document.body.removeChild(this.container);
    }
  }

  /**
   * Sauvegarder et terminer
   */
  async finish() {
    try {
      // Créer l'objet company
      const company = {
        name: this.data.name,
        siret: this.data.siret,
        address: this.data.address,
        city: this.data.city,
        postalCode: this.data.postalCode,
        email: this.data.email,
        phone: this.data.phone,
        iban: this.data.iban,
        tvaIntra: this.data.tvaIntra,
        apeCode: this.data.apeCode,
        rcs: this.data.rcs,
        rcPro: this.data.rcPro,

        creationDate: this.data.creationDate,
        activityType: this.data.activityType,
        regime: this.data.regime,

        // Compteurs
        invoiceCounter: {},

        // Charges
        charges: {
          urssaf: [],
          ir: [],
          tva: [],
          other: []
        }
      };

      // Créer la config IR
      const irConfig = {
        acre: this.data.acre,
        versementLib: this.data.versementLib,
        parts: this.data.parts,
        abattement: this.data.regime === 'BNC' ? LEGAL.abattementBNC : LEGAL.abattementBIC
      };

      // Sauvegarder dans le store
      store.update({
        company,
        irConfig,
        goalCA: this.data.goalCA,
        missions: [],
        clients: [],
        onboardingCompleted: true
      });

      // Sauvegarder la complétion de l'onboarding
      storage.save('onboarding_completed', true);

      this.close();

      // Recharger l'app
      window.location.reload();
    } catch (error) {
      console.error('Error finishing onboarding:', error);
      alert('Erreur lors de la sauvegarde. Veuillez réessayer.');
    }
  }

  /**
   * Render du wizard
   */
  render() {
    const step = this.steps[this.currentStep];
    const progress = ((this.currentStep + 1) / this.steps.length) * 100;

    this.wizard.innerHTML = '';

    // Header
    const header = el('div', { className: 'wizard-header' }, [
      el('h1', {}, step.title),
      el('p', { className: 'wizard-description' }, step.description),
      el('div', { className: 'wizard-progress' }, [
        el('div', {
          className: 'wizard-progress-bar',
          style: { width: `${progress}%` }
        })
      ]),
      el('div', { className: 'wizard-step-indicator' },
        `Étape ${this.currentStep + 1} sur ${this.steps.length}`
      )
    ]);

    // Content
    const content = el('div', { className: 'wizard-content' });
    content.appendChild(step.render());

    // Footer
    const footer = el('div', { className: 'wizard-footer' }, [
      this.currentStep > 0 ? el('button', {
        className: 'btn btn-secondary',
        onClick: () => this.previousStep()
      }, '← Précédent') : null,

      this.currentStep < this.steps.length - 1 ? el('button', {
        className: 'btn btn-primary',
        onClick: () => this.nextStep()
      }, 'Suivant →') : el('button', {
        className: 'btn btn-primary',
        onClick: () => this.finish()
      }, '✓ Terminer')
    ].filter(Boolean));

    this.wizard.appendChild(header);
    this.wizard.appendChild(content);
    this.wizard.appendChild(footer);
  }

  /**
   * Étape suivante
   */
  nextStep() {
    // Valider l'étape actuelle
    if (!this.validateStep(this.currentStep)) {
      return;
    }

    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.render();
    }
  }

  /**
   * Étape précédente
   */
  previousStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.render();
    }
  }

  /**
   * Valider une étape
   */
  validateStep(step) {
    switch (step) {
      case 0:
        return true; // Welcome screen, toujours valide

      case 1: // Company info
        if (!this.data.name) {
          alert('Veuillez entrer le nom de votre société');
          return false;
        }
        if (!this.data.siret || this.data.siret.length !== 14) {
          alert('Le SIRET doit contenir 14 chiffres');
          return false;
        }
        return true;

      case 2: // Fiscal config
        if (!this.data.creationDate) {
          alert('Veuillez entrer la date de création de votre entreprise');
          return false;
        }
        return true;

      case 3: // Goals
        return true; // Optionnel

      case 4: // Bank info
        return true; // Optionnel

      default:
        return true;
    }
  }

  /**
   * Écran de bienvenue
   */
  renderWelcome() {
    return el('div', { className: 'wizard-welcome' }, [
      el('div', { className: 'welcome-icon' }, '🚀'),
      el('h2', {}, 'Configurez votre espace'),
      el('p', {}, 'Freel est un outil de gestion pour micro-entrepreneurs français. En quelques minutes, nous allons configurer votre espace avec vos informations fiscales et administratives.'),
      el('ul', { className: 'welcome-features' }, [
        el('li', {}, '✓ Suivi du chiffre d\'affaires et des missions'),
        el('li', {}, '✓ Calcul automatique des charges (URSSAF, IR, TVA)'),
        el('li', {}, '✓ Génération de factures conformes'),
        el('li', {}, '✓ Prévisions de trésorerie'),
        el('li', {}, '✓ 100% gratuit et données stockées localement')
      ]),
      el('div', { className: 'welcome-privacy' }, [
        el('span', {}, '🔒 '),
        el('strong', {}, 'Confidentialité: '),
        'Toutes vos données sont stockées localement sur votre appareil. Aucune donnée n\'est envoyée à un serveur.'
      ])
    ]);
  }

  /**
   * Infos société
   */
  renderCompanyInfo() {
    const form = el('form', { className: 'wizard-form' }, [
      // Nom
      el('div', { className: 'form-group' }, [
        el('label', { htmlFor: 'company-name' }, [
          'Nom de votre société ',
          el('span', { className: 'required' }, '*')
        ]),
        el('input', {
          type: 'text',
          id: 'company-name',
          className: 'form-control',
          placeholder: 'Ex: Jean Dupont Conseil',
          value: this.data.name,
          onInput: (e) => { this.data.name = e.target.value; }
        })
      ]),

      // SIRET
      el('div', { className: 'form-group' }, [
        el('label', { htmlFor: 'siret' }, [
          'SIRET (14 chiffres) ',
          el('span', { className: 'required' }, '*')
        ]),
        el('input', {
          type: 'text',
          id: 'siret',
          className: 'form-control',
          placeholder: '12345678901234',
          value: this.data.siret,
          maxLength: 14,
          onInput: (e) => {
            this.data.siret = e.target.value.replace(/\D/g, '');
            e.target.value = this.data.siret;
          }
        }),
        el('small', { className: 'form-help' },
          'Le SIRET se trouve sur votre certificat d\'inscription INSEE'
        )
      ]),

      // Adresse
      el('div', { className: 'form-group' }, [
        el('label', { htmlFor: 'address' }, 'Adresse'),
        el('input', {
          type: 'text',
          id: 'address',
          className: 'form-control',
          placeholder: '123 rue de la République',
          value: this.data.address,
          onInput: (e) => { this.data.address = e.target.value; }
        })
      ]),

      // Ville et Code postal
      el('div', { className: 'form-row' }, [
        el('div', { className: 'form-group' }, [
          el('label', { htmlFor: 'postal-code' }, 'Code postal'),
          el('input', {
            type: 'text',
            id: 'postal-code',
            className: 'form-control',
            placeholder: '75001',
            value: this.data.postalCode,
            maxLength: 5,
            onInput: (e) => { this.data.postalCode = e.target.value; }
          })
        ]),
        el('div', { className: 'form-group' }, [
          el('label', { htmlFor: 'city' }, 'Ville'),
          el('input', {
            type: 'text',
            id: 'city',
            className: 'form-control',
            placeholder: 'Paris',
            value: this.data.city,
            onInput: (e) => { this.data.city = e.target.value; }
          })
        ])
      ]),

      // Email et téléphone
      el('div', { className: 'form-row' }, [
        el('div', { className: 'form-group' }, [
          el('label', { htmlFor: 'email' }, 'Email'),
          el('input', {
            type: 'email',
            id: 'email',
            className: 'form-control',
            placeholder: 'contact@example.com',
            value: this.data.email,
            onInput: (e) => { this.data.email = e.target.value; }
          })
        ]),
        el('div', { className: 'form-group' }, [
          el('label', { htmlFor: 'phone' }, 'Téléphone'),
          el('input', {
            type: 'tel',
            id: 'phone',
            className: 'form-control',
            placeholder: '01 23 45 67 89',
            value: this.data.phone,
            onInput: (e) => { this.data.phone = e.target.value; }
          })
        ])
      ])
    ]);

    return form;
  }

  /**
   * Config fiscale
   */
  renderFiscalConfig() {
    return el('form', { className: 'wizard-form' }, [
      // Date de création
      el('div', { className: 'form-group' }, [
        el('label', { htmlFor: 'creation-date' }, [
          'Date de création de votre entreprise ',
          el('span', { className: 'required' }, '*')
        ]),
        el('input', {
          type: 'date',
          id: 'creation-date',
          className: 'form-control',
          value: this.data.creationDate,
          onInput: (e) => { this.data.creationDate = e.target.value; }
        }),
        el('small', { className: 'form-help' },
          'Cette date figure sur votre certificat d\'inscription INSEE'
        )
      ]),

      // Type d'activité
      el('div', { className: 'form-group' }, [
        el('label', {}, 'Type d\'activité'),
        el('div', { className: 'radio-group' }, [
          el('label', { className: 'radio-label' }, [
            el('input', {
              type: 'radio',
              name: 'activity-type',
              value: 'service',
              checked: this.data.activityType === 'service',
              onChange: (e) => {
                this.data.activityType = e.target.value;
                this.data.regime = 'BNC';
                this.render();
              }
            }),
            el('div', { className: 'radio-content' }, [
              el('strong', {}, 'Prestations de services (BNC)'),
              el('small', {}, 'Conseil, développement, formation, etc.')
            ])
          ]),
          el('label', { className: 'radio-label' }, [
            el('input', {
              type: 'radio',
              name: 'activity-type',
              value: 'vente',
              checked: this.data.activityType === 'vente',
              onChange: (e) => {
                this.data.activityType = e.target.value;
                this.data.regime = 'BIC';
                this.render();
              }
            }),
            el('div', { className: 'radio-content' }, [
              el('strong', {}, 'Vente de marchandises (BIC)'),
              el('small', {}, 'Commerce, e-commerce, artisanat')
            ])
          ])
        ])
      ]),

      // ACRE
      el('div', { className: 'form-group' }, [
        el('label', { className: 'checkbox-label' }, [
          el('input', {
            type: 'checkbox',
            checked: this.data.acre,
            onChange: (e) => { this.data.acre = e.target.checked; }
          }),
          el('div', {}, [
            el('strong', {}, 'Je bénéficie de l\'ACRE'),
            el('small', {}, `Réduction de 50% des cotisations URSSAF la première année (${this.data.regime === 'BNC' ? '10.65%' : '12.3%'} au lieu de ${this.data.regime === 'BNC' ? '21.1%' : '24.6%'})`)
          ])
        ])
      ]),

      // Versement libératoire
      el('div', { className: 'form-group' }, [
        el('label', { className: 'checkbox-label' }, [
          el('input', {
            type: 'checkbox',
            checked: this.data.versementLib,
            onChange: (e) => { this.data.versementLib = e.target.checked; }
          }),
          el('div', {}, [
            el('strong', {}, 'Versement libératoire de l\'impôt sur le revenu'),
            el('small', {}, 'Paiement simplifié de 2.2% du CA au lieu du barème progressif (si revenu fiscal < 27 794€)')
          ])
        ])
      ]),

      // Nombre de parts
      el('div', { className: 'form-group' }, [
        el('label', { htmlFor: 'parts' }, 'Nombre de parts fiscales'),
        el('select', {
          id: 'parts',
          className: 'form-control',
          value: this.data.parts,
          onChange: (e) => { this.data.parts = parseFloat(e.target.value); }
        }, [
          el('option', { value: 1 }, '1 part (célibataire)'),
          el('option', { value: 1.5 }, '1.5 parts (célibataire + 1 enfant)'),
          el('option', { value: 2 }, '2 parts (couple sans enfant)'),
          el('option', { value: 2.5 }, '2.5 parts (couple + 1 enfant)'),
          el('option', { value: 3 }, '3 parts (couple + 2 enfants)'),
          el('option', { value: 3.5 }, '3.5 parts (couple + 3 enfants)'),
          el('option', { value: 4 }, '4 parts (couple + 4 enfants)')
        ]),
        el('small', { className: 'form-help' },
          'Utilisé pour le calcul de l\'impôt sur le revenu (hors versement libératoire)'
        )
      ]),

      // Info plafond
      el('div', { className: 'info-box' }, [
        el('strong', {}, '📊 Plafond de CA 2025: '),
        this.data.activityType === 'service'
          ? `${LEGAL.plafondService2025.toLocaleString('fr-FR')}€ (prestations de services)`
          : `${LEGAL.plafondVente2025.toLocaleString('fr-FR')}€ (vente de marchandises)`
      ])
    ]);
  }

  /**
   * Objectifs
   */
  renderGoals() {
    return el('form', { className: 'wizard-form' }, [
      el('div', { className: 'form-group' }, [
        el('label', { htmlFor: 'goal-ca' }, 'Objectif de chiffre d\'affaires annuel (optionnel)'),
        el('input', {
          type: 'number',
          id: 'goal-ca',
          className: 'form-control',
          placeholder: '50000',
          value: this.data.goalCA || '',
          min: 0,
          step: 1000,
          onInput: (e) => { this.data.goalCA = parseFloat(e.target.value) || 0; }
        }),
        el('small', { className: 'form-help' },
          'Définissez votre objectif de CA pour suivre votre progression'
        )
      ]),

      el('div', { className: 'form-group' }, [
        el('label', { htmlFor: 'ape-code' }, 'Code APE (optionnel)'),
        el('input', {
          type: 'text',
          id: 'ape-code',
          className: 'form-control',
          placeholder: '6201Z',
          value: this.data.apeCode,
          onInput: (e) => { this.data.apeCode = e.target.value; }
        }),
        el('small', { className: 'form-help' },
          'Code d\'activité principale (figure sur votre certificat INSEE)'
        )
      ]),

      el('div', { className: 'info-box' }, [
        el('p', {}, '💡 Ces informations peuvent être modifiées ultérieurement dans les paramètres.')
      ])
    ]);
  }

  /**
   * Infos bancaires
   */
  renderBankInfo() {
    return el('form', { className: 'wizard-form' }, [
      el('div', { className: 'form-group' }, [
        el('label', { htmlFor: 'iban' }, 'IBAN (optionnel)'),
        el('input', {
          type: 'text',
          id: 'iban',
          className: 'form-control',
          placeholder: 'FR76 XXXX XXXX XXXX XXXX XXXX XXX',
          value: this.data.iban,
          onInput: (e) => { this.data.iban = e.target.value; }
        }),
        el('small', { className: 'form-help' },
          'Votre IBAN apparaîtra sur vos factures pour faciliter les paiements'
        )
      ]),

      el('div', { className: 'form-group' }, [
        el('label', { htmlFor: 'tva-intra' }, 'N° TVA intracommunautaire (optionnel)'),
        el('input', {
          type: 'text',
          id: 'tva-intra',
          className: 'form-control',
          placeholder: 'FR12345678901',
          value: this.data.tvaIntra,
          onInput: (e) => { this.data.tvaIntra = e.target.value; }
        }),
        el('small', { className: 'form-help' },
          'Nécessaire si vous êtes assujetti à la TVA (à partir d\'octobre 2025)'
        )
      ]),

      el('div', { className: 'form-group' }, [
        el('label', { htmlFor: 'rcs' }, 'RCS (optionnel)'),
        el('input', {
          type: 'text',
          id: 'rcs',
          className: 'form-control',
          placeholder: 'RCS Paris 123 456 789',
          value: this.data.rcs,
          onInput: (e) => { this.data.rcs = e.target.value; }
        })
      ]),

      el('div', { className: 'form-group' }, [
        el('label', { htmlFor: 'rc-pro' }, 'Assurance RC Pro (optionnel)'),
        el('input', {
          type: 'text',
          id: 'rc-pro',
          className: 'form-control',
          placeholder: 'Nom de l\'assureur et n° de police',
          value: this.data.rcPro,
          onInput: (e) => { this.data.rcPro = e.target.value; }
        }),
        el('small', { className: 'form-help' },
          'Obligatoire pour certaines activités réglementées'
        )
      ]),

      el('div', { className: 'success-box' }, [
        el('h3', {}, '🎉 Vous y êtes presque !'),
        el('p', {}, 'Cliquez sur "Terminer" pour commencer à utiliser Freel.')
      ])
    ]);
  }
}
