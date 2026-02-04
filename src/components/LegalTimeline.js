/**
 * Composant Timeline Jalons Légaux
 * Affiche les échéances fiscales importantes (URSSAF, CFE, IR, ACRE)
 */

import { el } from '../utils/dom.js';
import { fmtDate } from '../utils/formatters.js';
import { store } from '../services/Store.js';

/**
 * Calculer la date d'expiration de l'ACRE
 */
function getAcreExpiryDate(company) {
  if (!company.acre || !company.dateDebut) {
    return null;
  }

  const startDate = new Date(company.dateDebut);
  const expiryDate = new Date(startDate);
  expiryDate.setFullYear(startDate.getFullYear() + 3);

  return expiryDate;
}

/**
 * Calculer la prochaine échéance URSSAF
 */
function getNextUrssafDeadline() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-12

  // URSSAF : paiement trimestriel (fin de mois après chaque trimestre)
  const quarters = [
    { end: new Date(currentYear, 3, 30), label: 'T1' }, // 30 avril pour T1 (jan-mars)
    { end: new Date(currentYear, 6, 31), label: 'T2' }, // 31 juillet pour T2 (avr-juin)
    { end: new Date(currentYear, 9, 31), label: 'T3' }, // 31 octobre pour T3 (juil-sept)
    { end: new Date(currentYear, 0, 31), label: 'T4' }  // 31 janvier N+1 pour T4 (oct-déc)
  ];

  // Trouver la prochaine échéance
  for (const quarter of quarters) {
    if (quarter.end > today) {
      const daysLeft = Math.ceil((quarter.end - today) / (1000 * 60 * 60 * 24));
      return {
        date: quarter.end,
        daysLeft,
        label: `URSSAF ${quarter.label}`
      };
    }
  }

  // Si on est passé le T4, prendre T1 de l'année suivante
  const nextYearT1 = new Date(currentYear + 1, 3, 30);
  const daysLeft = Math.ceil((nextYearT1 - today) / (1000 * 60 * 60 * 24));
  return {
    date: nextYearT1,
    daysLeft,
    label: 'URSSAF T1'
  };
}

/**
 * Récupérer tous les jalons légaux
 */
export function getLegalMilestones() {
  const company = store.get('company') || {};
  const today = new Date();
  const currentYear = today.getFullYear();
  const milestones = [];

  // 1. FIN ACRE (si applicable)
  if (company.acre) {
    const acreExpiry = getAcreExpiryDate(company);
    if (acreExpiry) {
      const daysLeft = Math.ceil((acreExpiry - today) / (1000 * 60 * 60 * 24));

      // Afficher seulement si dans les 6 mois à venir ou 30 jours passés
      if (daysLeft >= -30 && daysLeft <= 180) {
        milestones.push({
          id: 'acre',
          label: 'Fin ACRE',
          icon: '🎓',
          date: acreExpiry,
          daysLeft,
          status: daysLeft <= 0 ? 'passed' : daysLeft <= 30 ? 'urgent' : daysLeft <= 90 ? 'current' : 'upcoming'
        });
      }
    }
  }

  // 2. CFE (Cotisation Foncière des Entreprises) - 15 décembre
  const cfeDate = new Date(currentYear, 11, 15); // 15 décembre
  const cfeDays = Math.ceil((cfeDate - today) / (1000 * 60 * 60 * 24));

  if (cfeDays >= -30 && cfeDays <= 180) {
    milestones.push({
      id: 'cfe',
      label: 'CFE',
      icon: '🏢',
      date: cfeDate,
      daysLeft: cfeDays,
      status: cfeDays <= 0 ? 'passed' : cfeDays <= 7 ? 'urgent' : cfeDays <= 30 ? 'current' : 'upcoming'
    });
  }

  // 3. URSSAF (prochaine échéance trimestrielle)
  const urssaf = getNextUrssafDeadline();
  if (urssaf) {
    milestones.push({
      id: 'urssaf',
      label: urssaf.label,
      icon: '🏥',
      date: urssaf.date,
      daysLeft: urssaf.daysLeft,
      status: urssaf.daysLeft <= 3 ? 'urgent' : urssaf.daysLeft <= 7 ? 'current' : 'upcoming'
    });
  }

  // 4. IMPÔT SUR LE REVENU - Déclaration (mai-juin)
  const config = company.config || {};
  if (!config.versementLib) {
    const irDate = new Date(currentYear, 4, 25); // 25 mai
    const irDays = Math.ceil((irDate - today) / (1000 * 60 * 60 * 24));

    if (irDays >= -30 && irDays <= 180) {
      milestones.push({
        id: 'ir',
        label: 'Décla IR',
        icon: '💰',
        date: irDate,
        daysLeft: irDays,
        status: irDays <= 0 ? 'passed' : irDays <= 7 ? 'urgent' : irDays <= 30 ? 'current' : 'upcoming'
      });
    }
  }

  // 5. CFP (Contribution à la Formation Professionnelle) - Avec URSSAF
  // Déjà inclus dans l'URSSAF

  // Trier par date (les plus proches d'abord)
  milestones.sort((a, b) => {
    // Les dates passées en dernier
    if (a.daysLeft < 0 && b.daysLeft >= 0) return 1;
    if (b.daysLeft < 0 && a.daysLeft >= 0) return -1;
    return a.daysLeft - b.daysLeft;
  });

  return milestones.slice(0, 5); // Maximum 5 jalons
}

/**
 * Créer le widget Timeline Jalons Légaux
 */
export function createLegalTimelineWidget() {
  const milestones = getLegalMilestones();

  if (milestones.length === 0) {
    return null;
  }

  const widget = el('div', { className: 'legal-timeline-widget' });

  // Header
  const header = el('div', { className: 'legal-timeline-header' });
  const titleContainer = el('div', { className: 'legal-timeline-title' });
  titleContainer.appendChild(el('span', { className: 'legal-timeline-icon' }, '📅'));
  titleContainer.appendChild(el('span', {}, 'Jalons Légaux'));

  header.appendChild(titleContainer);
  widget.appendChild(header);

  // Timeline track
  const track = el('div', { className: 'legal-timeline-track' });
  const line = el('div', { className: 'legal-timeline-line' });
  track.appendChild(line);

  // Milestones
  const items = el('div', { className: 'legal-timeline-items' });

  milestones.forEach(milestone => {
    const item = el('div', {
      className: 'legal-milestone',
      onClick: () => handleMilestoneClick(milestone)
    });

    // Dot avec icône
    const dot = el('div', {
      className: `legal-milestone-dot ${milestone.status}`
    }, milestone.icon);
    item.appendChild(dot);

    // Label
    item.appendChild(el('div', { className: 'legal-milestone-label' }, milestone.label));

    // Date
    if (milestone.date) {
      const dateStr = fmtDate(milestone.date);
      item.appendChild(el('div', { className: 'legal-milestone-date' }, dateStr));
    }

    // Countdown
    if (milestone.daysLeft !== null && milestone.daysLeft >= 0) {
      const countdownClass = milestone.daysLeft <= 7 ? 'urgent' :
                              milestone.daysLeft <= 30 ? 'warning' : 'ok';

      const countdownText = milestone.daysLeft === 0 ? 'Auj.' : `J-${milestone.daysLeft}`;

      item.appendChild(el('div', {
        className: `legal-milestone-countdown ${countdownClass}`
      }, countdownText));
    } else if (milestone.daysLeft < 0) {
      item.appendChild(el('div', {
        className: 'legal-milestone-countdown passed'
      }, 'Passé'));
    }

    items.appendChild(item);
  });

  track.appendChild(items);
  widget.appendChild(track);

  return widget;
}

/**
 * Handler pour le clic sur un jalon
 */
function handleMilestoneClick(milestone) {
  const dateStr = milestone.date ? fmtDate(milestone.date) : 'Date non définie';
  const daysInfo = milestone.daysLeft >= 0
    ? `Dans ${milestone.daysLeft} jour${milestone.daysLeft > 1 ? 's' : ''}`
    : `Passé depuis ${Math.abs(milestone.daysLeft)} jour${Math.abs(milestone.daysLeft) > 1 ? 's' : ''}`;

  alert(`${milestone.icon} ${milestone.label}\n\nDate: ${dateStr}\n${daysInfo}`);
}

export default {
  getLegalMilestones,
  createLegalTimelineWidget
};
