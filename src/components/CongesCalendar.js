/**
 * Composant Calendrier des Congés
 * Affiche une grille visuelle des congés sur 12 mois
 */

import { el } from '../utils/dom.js';
import { fmtMonthShort } from '../utils/formatters.js';
import { store } from '../services/Store.js';

/**
 * Obtenir les mois de la période (12 derniers mois)
 */
function getPeriodMonths() {
  const today = new Date();
  const months = [];

  for (let i = 11; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    months.push({ year, month });
  }

  return months;
}

/**
 * Obtenir les congés par mois
 */
function getCongesByMonth() {
  const missions = store.get('missions') || [];
  const congesByMonth = {};

  missions.forEach(mission => {
    (mission.lignes || []).forEach(ligne => {
      if (ligne.conges && ligne.conges > 0) {
        const [year, month] = ligne.ym.split('-');
        const key = `${year}-${month}`;
        congesByMonth[key] = (congesByMonth[key] || 0) + ligne.conges;
      }
    });
  });

  return congesByMonth;
}

/**
 * Créer le widget Calendrier des Congés
 */
export function createCongesCalendarWidget() {
  const months = getPeriodMonths();
  const congesByMonth = getCongesByMonth();
  const today = new Date();
  const currentYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const widget = el('div', { className: 'conges-calendar-widget' });

  // Header
  const header = el('div', { className: 'conges-calendar-header' });
  header.appendChild(el('div', { className: 'conges-calendar-title' }, '🏖️ Congés'));
  widget.appendChild(header);

  // Grille des mois
  const calendar = el('div', { className: 'conges-calendar-grid' });

  months.forEach(({ year, month }) => {
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    const conges = congesByMonth[ym] || 0;
    const isCurrent = ym === currentYm;

    const monthDiv = el('div', {
      className: `conges-month ${conges > 0 ? 'has-conges' : ''} ${isCurrent ? 'current' : ''}`,
      onClick: () => handleMonthClick(year, month, conges)
    });

    // Nom du mois (court: Jan, Fév, etc.)
    const monthName = fmtMonthShort(year, month).substring(0, 4);
    monthDiv.appendChild(el('div', { className: 'conges-month-name' }, monthName));

    // Nombre de jours
    const daysText = conges > 0 ? `${conges}j` : '-';
    monthDiv.appendChild(el('div', { className: 'conges-month-days' }, daysText));

    calendar.appendChild(monthDiv);
  });

  widget.appendChild(calendar);

  // Total
  const totalConges = Object.values(congesByMonth).reduce((sum, val) => sum + val, 0);
  const footer = el('div', { className: 'conges-calendar-footer' });
  footer.appendChild(el('div', {}, `Total: ${totalConges} jours de congés`));
  widget.appendChild(footer);

  return widget;
}

/**
 * Handler pour le clic sur un mois
 */
function handleMonthClick(year, month, conges) {
  const monthName = fmtMonthShort(year, month);
  if (conges > 0) {
    alert(`${monthName}\n${conges} jour${conges > 1 ? 's' : ''} de congés`);
  } else {
    alert(`${monthName}\nAucun congé`);
  }
}

export default {
  createCongesCalendarWidget
};
