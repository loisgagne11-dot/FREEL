/**
 * Composant CA par Client
 * Affiche le CA, jours travaillés et TJM par client
 */

import { el } from '../utils/dom.js';
import { EUR } from '../utils/formatters.js';
import { store } from '../services/Store.js';

/**
 * Calculer les stats par client
 */
export function getClientsStats() {
  const missions = store.get('missions') || [];
  const stats = {};

  missions.forEach(mission => {
    const clientName = mission.client || 'Sans client';

    if (!stats[clientName]) {
      stats[clientName] = {
        ca: 0,
        jours: 0,
        factures: 0
      };
    }

    (mission.lignes || []).forEach(ligne => {
      // Seulement les factures payées
      if (ligne.datePaiement) {
        const tjm = parseFloat(mission.tjm) || 0;
        const jours = parseFloat(ligne.joursReels) || 0;

        stats[clientName].ca += tjm * jours;
        stats[clientName].jours += jours;
        stats[clientName].factures++;
      }
    });
  });

  // Convertir en array et calculer le TJM
  const arr = Object.keys(stats).map(name => ({
    name,
    ca: stats[name].ca,
    jours: stats[name].jours,
    factures: stats[name].factures,
    tjm: stats[name].jours > 0 ? Math.round(stats[name].ca / stats[name].jours) : 0
  }));

  // Trier par CA décroissant
  arr.sort((a, b) => b.ca - a.ca);

  return arr;
}

/**
 * Créer le widget CA par Client
 */
export function createClientsBreakdownWidget() {
  const clients = getClientsStats();

  if (clients.length === 0) {
    return null;
  }

  const maxCA = clients[0].ca || 1;
  const widget = el('div', { className: 'clients-breakdown-widget' });

  // Header
  const header = el('div', { className: 'clients-breakdown-header' });
  header.appendChild(el('div', { className: 'clients-breakdown-title' }, '👥 CA par Client'));
  widget.appendChild(header);

  // Liste des clients (top 5)
  const list = el('div', { className: 'clients-breakdown-list' });

  clients.slice(0, 5).forEach(client => {
    const row = el('div', { className: 'client-row' });

    // Info client
    const info = el('div', { className: 'client-info' });
    info.appendChild(el('div', { className: 'client-name' }, client.name));

    const sub = `${Math.round(client.jours)}j · TJM ${EUR(client.tjm)}`;
    info.appendChild(el('div', { className: 'client-sub' }, sub));

    row.appendChild(info);

    // Montant CA
    row.appendChild(el('div', { className: 'client-ca' }, EUR(client.ca)));

    list.appendChild(row);

    // Barre de progression
    const barContainer = el('div', { className: 'client-bar-container' });
    const barFill = el('div', {
      className: 'client-bar-fill',
      style: { width: `${Math.round((client.ca / maxCA) * 100)}%` }
    });
    barContainer.appendChild(barFill);

    list.appendChild(barContainer);
  });

  widget.appendChild(list);

  return widget;
}

export default {
  getClientsStats,
  createClientsBreakdownWidget
};
