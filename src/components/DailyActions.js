/**
 * Composant Actions du Jour
 * Affiche les tâches prioritaires à accomplir
 */

import { el } from '../utils/dom.js';
import { EUR, fmtDate, fmtMonthShort } from '../utils/formatters.js';
import { store } from '../services/Store.js';
import { taxCalculator } from '../services/TaxCalculator.js';

/**
 * Récupérer la liste des actions prioritaires
 */
export function getActionsList() {
  const missions = store.get('missions') || [];
  const company = store.get('company') || {};
  const treasury = store.get('treasury') || { soldeInitial: 0, mouvements: [] };
  const actions = [];
  const today = new Date();
  const currentYear = today.getFullYear();

  // Calculer le cash disponible
  const soldeActuel = treasury.soldeInitial +
    (treasury.mouvements || []).reduce((sum, m) => sum + m.montant, 0);

  // 1. FACTURES EN RETARD (Priorité 1 - Urgente)
  const lateInvoices = [];
  missions.forEach(mission => {
    (mission.lignes || []).forEach(ligne => {
      if (ligne.datePaiement === null && ligne.dateEmission) {
        const emissionDate = new Date(ligne.dateEmission);
        const daysLate = Math.floor((today - emissionDate) / (1000 * 60 * 60 * 24));

        if (daysLate > 30) {
          const tjm = parseFloat(mission.tjm) || 0;
          const jours = parseFloat(ligne.joursReels) || 0;
          const montant = tjm * jours;

          lateInvoices.push({
            mission,
            ligne,
            montant,
            daysLate,
            client: mission.client || 'Client inconnu'
          });
        }
      }
    });
  });

  // Ajouter les 2 factures les plus en retard
  lateInvoices
    .sort((a, b) => b.daysLate - a.daysLate)
    .slice(0, 2)
    .forEach(invoice => {
      actions.push({
        priority: 1,
        type: 'urgent',
        icon: '🚨',
        label: `Relancer ${invoice.client}`,
        sub: `${EUR(invoice.montant)} · En retard de ${invoice.daysLate} jours`,
        action: () => handleInvoiceAction(invoice),
        btnLabel: 'Voir',
        btnClass: 'btn-danger'
      });
    });

  // 2. CHARGES À PAYER (Priorité 2 - Important)
  // Calculer le CA et les provisions
  let caTotal = 0;
  missions.forEach(mission => {
    (mission.lignes || []).forEach(ligne => {
      const tjm = parseFloat(mission.tjm) || 0;
      const jours = parseFloat(ligne.joursReels) || 0;
      caTotal += tjm * jours;
    });
  });

  const provisions = taxCalculator.calculateProvisions(caTotal, currentYear, company.config || {});

  // Simuler quelques charges à payer (URSSAF, CFP)
  const chargesAPayer = [
    {
      id: 'urssaf-q1',
      cat: 'URSSAF',
      montant: provisions.urssaf / 4,
      mois: `${currentYear}-03`,
      type: 'urssaf'
    },
    {
      id: 'cfp-annual',
      cat: 'CFP',
      montant: provisions.cfp,
      mois: `${currentYear}-12`,
      type: 'cfp'
    }
  ];

  chargesAPayer.slice(0, 2).forEach(charge => {
    const [year, month] = charge.mois.split('-');
    actions.push({
      priority: 2,
      type: 'warning',
      icon: '💳',
      label: `Payer ${charge.cat}`,
      sub: `${EUR(charge.montant)} · ${fmtMonthShort(parseInt(year), parseInt(month))}`,
      action: () => handleChargeAction(charge),
      btnLabel: '✓ Payé',
      btnClass: 'btn-success'
    });
  });

  // 3. SUGGESTION SALAIRE (Priorité 3 - Recommandation)
  const salaireDisponible = Math.max(0, soldeActuel - provisions.total);

  if (salaireDisponible >= 500) {
    actions.push({
      priority: 3,
      type: 'success',
      icon: '💸',
      label: 'Verser un salaire',
      sub: `${EUR(Math.floor(salaireDisponible))} disponible`,
      action: () => handleSalaireAction(salaireDisponible),
      btnLabel: 'Verser',
      btnClass: 'btn-primary'
    });
  }

  // 4. OBJECTIF NON DÉFINI (Priorité 4)
  const goalCA = store.get('goalCA') || 0;
  if (!goalCA || goalCA <= 0) {
    actions.push({
      priority: 4,
      type: 'info',
      icon: '🎯',
      label: 'Définir un objectif CA',
      sub: 'Fixe ton cap pour l\'année',
      action: () => handleGoalAction(),
      btnLabel: 'Définir',
      btnClass: 'btn-secondary'
    });
  }

  // Trier par priorité et limiter à 4 actions
  actions.sort((a, b) => a.priority - b.priority);
  return actions.slice(0, 4);
}

/**
 * Créer le widget Actions du Jour
 */
export function createDailyActionsWidget() {
  const actions = getActionsList();

  if (actions.length === 0) {
    return null; // Ne rien afficher si pas d'actions
  }

  const widget = el('div', { className: 'daily-actions-widget' });

  // Header
  const header = el('div', { className: 'daily-actions-header' });
  const titleContainer = el('div', { className: 'daily-actions-title' });
  titleContainer.appendChild(el('span', { className: 'daily-actions-icon' }, '⚡'));
  titleContainer.appendChild(el('span', {}, 'Actions du Jour'));
  titleContainer.appendChild(el('span', { className: 'daily-actions-badge' }, actions.length.toString()));

  header.appendChild(titleContainer);
  widget.appendChild(header);

  // Liste des actions
  const list = el('div', { className: 'daily-actions-list' });

  actions.forEach(action => {
    const item = el('div', { className: `daily-action-item ${action.type}` });

    item.appendChild(el('div', { className: 'daily-action-icon' }, action.icon));

    const content = el('div', { className: 'daily-action-content' });
    content.appendChild(el('div', { className: 'daily-action-label' }, action.label));
    content.appendChild(el('div', { className: 'daily-action-sub' }, action.sub));
    item.appendChild(content);

    const btn = el('button', {
      className: `daily-action-btn ${action.btnClass}`,
      onClick: (e) => {
        e.stopPropagation();
        action.action();
      }
    }, action.btnLabel);
    item.appendChild(btn);

    list.appendChild(item);
  });

  widget.appendChild(list);

  return widget;
}

/**
 * Handlers pour les actions
 */
function handleInvoiceAction(invoice) {
  alert(`Facture de ${invoice.client}\nMontant: ${EUR(invoice.montant)}\nEn retard de ${invoice.daysLate} jours\n\nAction: Envoyer une relance par email`);
}

function handleChargeAction(charge) {
  if (confirm(`Marquer la charge ${charge.cat} (${EUR(charge.montant)}) comme payée ?`)) {
    // TODO: Implémenter la logique de paiement
    alert('Charge marquée comme payée!');
  }
}

function handleSalaireAction(montant) {
  const salaire = prompt(`Montant du salaire à verser (max ${EUR(montant)}) :`);
  if (salaire) {
    const montantSalaire = parseFloat(salaire);
    if (montantSalaire > 0 && montantSalaire <= montant) {
      alert(`Salaire de ${EUR(montantSalaire)} enregistré!`);
      // TODO: Implémenter la logique d'enregistrement
    }
  }
}

function handleGoalAction() {
  alert('Ouvrir le modal de définition d\'objectif CA');
  // TODO: Implémenter l'ouverture du modal objectif
}

export default {
  getActionsList,
  createDailyActionsWidget
};
