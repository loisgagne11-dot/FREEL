/**
 * Composant Widget Objectif CA
 * Affiche la progression vers l'objectif annuel avec jauge
 */

import { el } from '../utils/dom.js';
import { EUR } from '../utils/formatters.js';
import { store } from '../services/Store.js';

/**
 * Créer le widget Objectif CA
 */
export function createGoalWidget() {
  const missions = store.get('missions') || [];
  const goalCA = store.get('goalCA') || 0;
  const today = new Date();
  const year = today.getFullYear();
  const monthsPassed = today.getMonth() + 1; // 1-12
  const monthsTotal = 12;

  // Calculer le CA actuel
  let currentCA = 0;
  missions.forEach(mission => {
    (mission.lignes || []).forEach(ligne => {
      const tjm = parseFloat(mission.tjm) || 0;
      const jours = parseFloat(ligne.joursReels) || 0;
      currentCA += tjm * jours;
    });
  });

  const widget = el('div', { className: 'goal-widget' });

  // Header
  const header = el('div', { className: 'goal-header' });
  header.appendChild(el('div', { className: 'goal-title' }, `🎯 Objectif ${year}`));
  header.appendChild(el('div', {
    className: 'goal-edit',
    onClick: () => handleEditGoal(goalCA)
  }, '⚙️ Modifier'));

  widget.appendChild(header);

  // Si pas d'objectif défini
  if (!goalCA || goalCA <= 0) {
    const emptyState = el('div', { className: 'goal-empty' });
    emptyState.appendChild(el('p', {
      className: 'goal-empty-text'
    }, 'Aucun objectif défini'));

    emptyState.appendChild(el('button', {
      className: 'btn btn-secondary btn-sm',
      onClick: () => handleEditGoal(0)
    }, '+ Définir un objectif'));

    widget.appendChild(emptyState);
    return widget;
  }

  // Calcul de la progression
  const pct = Math.min(1, currentCA / goalCA);
  const expectedPct = monthsPassed / monthsTotal;
  const isOnTrack = pct >= expectedPct * 0.9;
  const isBehind = pct < expectedPct * 0.7;

  // Barre de progression
  const progressBar = el('div', { className: 'goal-progress-bar' });
  const progressFill = el('div', {
    className: `goal-progress-fill ${isBehind ? 'behind' : isOnTrack ? 'ontrack' : 'warning'}`,
    style: { width: `${Math.round(pct * 100)}%` }
  });
  progressBar.appendChild(progressFill);
  widget.appendChild(progressBar);

  // Stats
  const stats = el('div', { className: 'goal-stats' });
  stats.appendChild(el('span', {
    className: 'goal-current'
  }, `${EUR(currentCA)} (${Math.round(pct * 100)}%)`));

  stats.appendChild(el('span', {
    className: 'goal-target'
  }, `Objectif: ${EUR(goalCA)}`));

  widget.appendChild(stats);

  // Rythme nécessaire
  const remaining = goalCA - currentCA;
  const monthsLeft = 12 - monthsPassed;
  const neededPerMonth = monthsLeft > 0 ? Math.round(remaining / monthsLeft) : remaining;

  const pace = el('div', { className: 'goal-pace' });

  if (remaining <= 0) {
    pace.innerHTML = '🎉 <strong style="color: var(--color-success)">Objectif atteint !</strong>';
  } else if (isOnTrack) {
    pace.innerHTML = `✅ En bonne voie · Besoin: <strong>${EUR(neededPerMonth)}/mois</strong>`;
  } else {
    pace.innerHTML = `⚠️ En retard · Besoin: <strong style="color: var(--color-warning)">${EUR(neededPerMonth)}/mois</strong>`;
  }

  widget.appendChild(pace);

  return widget;
}

/**
 * Handler pour modifier l'objectif
 */
function handleEditGoal(currentGoal) {
  const newGoal = prompt(
    `Définir l'objectif CA annuel (€):\n\nPresets:\n50k, 60k, 70k, 80k, 100k`,
    currentGoal || ''
  );

  if (newGoal !== null) {
    const amount = parseInt(newGoal.replace(/\s/g, ''));

    if (!isNaN(amount) && amount >= 0) {
      store.set('goalCA', amount);

      // Sauvegarder dans localStorage
      localStorage.setItem('freel_goal_ca', amount.toString());

      // Rafraîchir la page
      window.location.reload();
    } else {
      alert('Montant invalide');
    }
  }
}

export default {
  createGoalWidget
};
