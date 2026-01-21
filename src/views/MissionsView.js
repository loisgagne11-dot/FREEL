/**
 * Vue Missions - Gestion complète des missions
 */

import { el } from '../utils/dom.js';
import { store } from '../services/Store.js';
import { missionService } from '../services/MissionService.js';
import { EUR, PCT, fmtLong, fmtMonthShort } from '../utils/formatters.js';
import { Modal, formModal } from '../components/Modal.js';
import { toast } from '../components/Toast.js';
import { MissionSchema, sanitizeHTML } from '../services/ValidationSchemas.js';

export class MissionsView {
  constructor() {
    this.container = null;
  }

  /**
   * Afficher le formulaire de mission
   */
  async showMissionForm(mission = null) {
    const isNew = !mission;

    if (isNew) {
      mission = missionService.createMission();
    }

    const clients = store.get('clients') || [];

    // Préparer les champs du formulaire
    const fields = [];

    // Client (dropdown si clients existent)
    if (clients.length > 0) {
      const clientOptions = [
        { value: '', label: '-- Sélectionner --' },
        ...clients.map(c => ({ value: c.id, label: c.nom })),
        { value: '_new_', label: '+ Nouveau client...' }
      ];

      fields.push({
        type: 'select',
        name: 'clientId',
        label: 'Client',
        options: clientOptions,
        value: mission.clientId || '',
        required: false
      });
    } else {
      fields.push({
        type: 'text',
        name: 'client',
        label: 'Client',
        value: mission.client,
        required: true
      });
    }

    fields.push(
      {
        type: 'text',
        name: 'titre',
        label: 'Titre / Projet',
        value: mission.titre
      },
      {
        type: 'text',
        name: 'site',
        label: 'Site / Lieu',
        value: mission.site
      },
      {
        type: 'date',
        name: 'debut',
        label: 'Date de début',
        value: mission.debut,
        required: true
      },
      {
        type: 'date',
        name: 'fin',
        label: 'Date de fin',
        value: mission.fin,
        required: true
      },
      {
        type: 'number',
        name: 'tjm',
        label: 'TJM (€)',
        value: mission.tjm,
        required: true
      },
      {
        type: 'select',
        name: 'delaiPaiement',
        label: 'Délai de paiement',
        options: [
          { value: '1', label: 'M+1' },
          { value: '2', label: 'M+2' },
          { value: '3', label: 'M+3' }
        ],
        value: String(mission.delaiPaiement)
      },
      {
        type: 'number',
        name: 'jourPaiement',
        label: 'Jour de paiement',
        value: mission.jourPaiement,
        required: true
      },
      {
        type: 'text',
        name: 'adresseClient',
        label: 'Adresse client (facture)',
        value: mission.adresseClient,
        placeholder: '14 Rue Paul Mesple, 31100 Toulouse'
      },
      {
        type: 'text',
        name: 'numeroCommande',
        label: 'N° Commande client',
        value: mission.numeroCommande,
        placeholder: '10004903'
      },
      {
        type: 'textarea',
        name: 'descriptifFacture',
        label: 'Descriptif facture',
        value: mission.descriptifFacture,
        placeholder: 'Prestation de service consultant'
      }
    );

    try {
      const data = await formModal(
        isNew ? '💼 Nouvelle Mission' : `✏️ ${sanitizeHTML(mission.client)}`,
        fields,
        {
          submitLabel: '✅ Enregistrer',
          size: 'lg',
          schema: MissionSchema
        }
      );

      // Traiter les données
      const missionData = {
        ...data,
        tjm: parseFloat(data.tjm) || 0,
        delaiPaiement: parseInt(data.delaiPaiement) || 2,
        jourPaiement: parseInt(data.jourPaiement) || 15
      };

      // Gérer le client
      if (data.clientId) {
        const client = clients.find(c => c.id === data.clientId);
        if (client) {
          missionData.client = client.nom;
        }
      }

      if (isNew) {
        // Créer nouvelle mission
        const newMission = missionService.createMission(missionData);
        const missions = store.get('missions') || [];
        missions.push(newMission);
        store.set('missions', missions);
        toast.success('Mission créée !');
      } else {
        // Mettre à jour
        missionService.updateMission(mission.id, missionData);
        toast.success('Mission mise à jour !');
      }

      // Re-render
      this.refresh();

    } catch (error) {
      // Modal annulée
      if (error.message !== 'Cancelled' && error.message !== 'Closed') {
        console.error('Error saving mission:', error);
        toast.error('Erreur lors de l\'enregistrement');
      }
    }
  }

  /**
   * Afficher l'éditeur de jours
   */
  showDaysEditor(mission) {
    if (!mission.lignes || mission.lignes.length === 0) {
      toast.warning('Configure d\'abord les dates de la mission');
      return;
    }

    const modal = new Modal({
      title: `📅 Jours - ${mission.client}`,
      size: 'lg'
    });

    // Table des jours
    const table = el('table', { className: 'table' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', {}, 'Mois'),
          el('th', {}, 'Ouvrés'),
          el('th', {}, 'Prévus'),
          el('th', {}, 'Congés'),
          el('th', {}, 'Réels'),
          el('th', {}, 'CA')
        ])
      ]),
      el('tbody', { id: 'daysTableBody' })
    ]);

    const renderTable = () => {
      const tbody = document.querySelector('#daysTableBody');
      if (!tbody) return;

      tbody.innerHTML = '';

      let totals = {
        ouvres: 0,
        prevus: 0,
        conges: 0,
        reels: 0,
        ca: 0
      };

      mission.lignes.forEach((ligne, index) => {
        const prevus = ligne.joursPrevus || 0;
        const conges = ligne.conges || 0;
        const reels = Math.max(0, prevus - conges);
        const ca = reels * mission.tjm;

        totals.ouvres += ligne.joursOuvrables;
        totals.prevus += prevus;
        totals.conges += conges;
        totals.reels += reels;
        totals.ca += ca;

        const tr = el('tr', {}, [
          el('td', {}, fmtMonthShort(ligne.ym)),
          el('td', {}, String(ligne.joursOuvrables)),
          el('td', {}, [
            el('input', {
              type: 'number',
              value: prevus,
              min: 0,
              max: ligne.joursOuvrables,
              className: 'input',
              style: { width: '60px' },
              onInput: (e) => {
                ligne.joursPrevus = parseInt(e.target.value) || 0;
                renderTable();
              }
            })
          ]),
          el('td', {}, [
            el('input', {
              type: 'number',
              value: conges,
              min: 0,
              className: 'input',
              style: { width: '60px' },
              onInput: (e) => {
                ligne.conges = parseInt(e.target.value) || 0;
                renderTable();
              }
            })
          ]),
          el('td', { style: { fontWeight: 'var(--font-weight-semibold)' } }, String(reels)),
          el('td', { style: { fontWeight: 'var(--font-weight-semibold)' } }, EUR(ca))
        ]);

        tbody.appendChild(tr);
      });

      // Total row
      const totalRow = el('tr', {
        style: {
          fontWeight: 'var(--font-weight-bold)',
          background: 'var(--color-surface)',
          borderTop: '2px solid var(--color-border)'
        }
      }, [
        el('td', {}, 'TOTAL'),
        el('td', {}, String(totals.ouvres)),
        el('td', {}, String(totals.prevus)),
        el('td', {}, String(totals.conges)),
        el('td', {}, String(totals.reels)),
        el('td', {}, EUR(totals.ca))
      ]);

      tbody.appendChild(totalRow);
    };

    // Actions rapides
    const actions = el('div', {
      style: {
        display: 'flex',
        gap: 'var(--spacing-sm)',
        marginTop: 'var(--spacing-md)'
      }
    }, [
      el('button', {
        className: 'btn btn-ghost btn-sm',
        onClick: () => {
          mission.lignes.forEach(l => {
            l.joursPrevus = l.joursOuvrables;
            l.conges = 0;
          });
          renderTable();
        }
      }, 'Tous les jours'),
      el('button', {
        className: 'btn btn-ghost btn-sm',
        onClick: () => {
          mission.lignes.forEach(l => {
            l.joursPrevus = 0;
            l.conges = 0;
          });
          renderTable();
        }
      }, 'Reset')
    ]);

    modal.setBody([table, actions]);

    modal.setFooter([
      {
        label: 'Annuler',
        className: 'btn-ghost',
        onClick: () => modal.close()
      },
      {
        label: '✅ Enregistrer',
        className: 'btn-success',
        onClick: () => {
          missionService.updateMission(mission.id, { lignes: mission.lignes });
          modal.close();
          toast.success('Jours enregistrés !');
          this.refresh();
        }
      }
    ]);

    modal.open();
    renderTable();
  }

  /**
   * Créer une carte mission
   */
  createMissionCard(mission) {
    const status = missionService.getMissionStatus(mission);
    const statusLabel = missionService.getStatusLabel(status);
    const stats = missionService.calculateMissionStats(mission);

    const card = el('div', {
      className: 'card',
      style: {
        cursor: 'pointer',
        transition: 'all var(--transition-base)'
      },
      onClick: () => this.showMissionForm(mission)
    }, [
      // Header
      el('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 'var(--spacing-md)'
        }
      }, [
        el('div', {}, [
          el('h3', {
            style: {
              fontSize: 'var(--font-size-lg)',
              fontWeight: 'var(--font-weight-semibold)',
              marginBottom: 'var(--spacing-xs)'
            }
          }, mission.client),
          el('div', {
            style: {
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)'
            }
          }, mission.titre || mission.site || 'Sans titre')
        ]),
        el('div', {
          className: `badge badge-${status === 'active' ? 'success' : status === 'upcoming' ? 'info' : 'ghost'}`
        }, statusLabel)
      ]),

      // Dates
      el('div', {
        style: {
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)',
          marginBottom: 'var(--spacing-md)'
        }
      }, `📅 ${fmtLong(mission.debut)} → ${fmtLong(mission.fin)}`),

      // Stats grid
      el('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 'var(--spacing-md)',
          marginBottom: 'var(--spacing-md)'
        }
      }, [
        this.createStat('Jours', `${stats.totalJours}j`),
        this.createStat('TJM', EUR(mission.tjm), 'var(--color-info)'),
        this.createStat('CA', EUR(stats.totalCA), 'var(--color-success)'),
        this.createStat('Bénéfice', EUR(stats.benefice), stats.benefice >= 0 ? 'var(--color-success)' : 'var(--color-danger)'),
        this.createStat('Marge', PCT(stats.marge), stats.marge >= 0.5 ? 'var(--color-success)' : 'var(--color-warning)')
      ]),

      // Actions
      el('div', {
        style: {
          display: 'flex',
          gap: 'var(--spacing-sm)',
          paddingTop: 'var(--spacing-md)',
          borderTop: '1px solid var(--color-border)'
        },
        onClick: (e) => e.stopPropagation()
      }, [
        el('button', {
          className: 'btn btn-ghost btn-sm',
          onClick: (e) => {
            e.stopPropagation();
            this.showDaysEditor(mission);
          }
        }, '📅 Jours'),
        el('button', {
          className: 'btn btn-danger btn-sm',
          style: { marginLeft: 'auto' },
          onClick: async (e) => {
            e.stopPropagation();
            const confirmed = confirm('Supprimer cette mission ?');
            if (confirmed) {
              missionService.deleteMission(mission.id);
              toast.success('Mission supprimée');
              this.refresh();
            }
          }
        }, '🗑️')
      ])
    ]);

    return card;
  }

  /**
   * Créer une stat
   */
  createStat(label, value, color = null) {
    return el('div', {}, [
      el('div', {
        style: {
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
          marginBottom: 'var(--spacing-xs)'
        }
      }, label),
      el('div', {
        style: {
          fontSize: 'var(--font-size-lg)',
          fontWeight: 'var(--font-weight-semibold)',
          color: color || 'var(--color-text)'
        }
      }, value)
    ]);
  }

  /**
   * Render
   */
  render() {
    const missions = store.get('missions') || [];

    this.container = el('div', { className: 'container' }, [
      // Header
      el('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--spacing-xl)'
        }
      }, [
        el('h1', {}, '💼 Missions'),
        el('button', {
          className: 'btn btn-primary',
          onClick: () => this.showMissionForm()
        }, '+ Nouvelle Mission')
      ])
    ]);

    if (missions.length === 0) {
      // Empty state
      this.container.appendChild(
        el('div', { className: 'empty-state' }, [
          el('div', { className: 'empty-state-icon' }, '💼'),
          el('h2', { className: 'empty-state-title' }, 'Aucune mission'),
          el('p', { className: 'empty-state-text' }, 'Ajoute ta première mission pour commencer'),
          el('button', {
            className: 'btn btn-success',
            onClick: () => this.showMissionForm()
          }, '+ Nouvelle Mission')
        ])
      );
    } else {
      // Liste des missions
      const grid = el('div', {
        style: {
          display: 'grid',
          gap: 'var(--spacing-lg)'
        }
      });

      missions.forEach(mission => {
        grid.appendChild(this.createMissionCard(mission));
      });

      this.container.appendChild(grid);
    }

    return this.container;
  }

  /**
   * Rafraîchir la vue
   */
  refresh() {
    const container = document.querySelector('#main-content');
    if (container) {
      container.innerHTML = '';
      container.appendChild(this.render());
    }
  }

  /**
   * Détruire la vue
   */
  destroy() {
    // Cleanup si nécessaire
  }
}
