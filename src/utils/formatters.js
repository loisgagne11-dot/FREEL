/**
 * Utilitaires de formatage
 */

import { store } from '../services/Store.js';

/**
 * Formater un montant en euros
 */
export function EUR(amount, options = {}) {
  const {
    forceShow = false,
    decimals = 2,
    signed = false
  } = options;

  // Privacy mode
  if (store.get('privacyMode') && !forceShow) {
    return '•••••€';
  }

  if (amount === null || amount === undefined || isNaN(amount)) {
    return '—';
  }

  const formatted = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(Math.abs(amount));

  if (signed && amount !== 0) {
    return amount > 0 ? `+${formatted}` : `-${formatted}`;
  }

  return amount < 0 ? `-${formatted}` : formatted;
}

/**
 * Formater un pourcentage
 */
export function PCT(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }

  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

/**
 * Formater une date courte (01/12/2025)
 */
export function fmtDate(date) {
  if (!date) return '—';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(d);
}

/**
 * Formater une date longue (1 décembre 2025)
 */
export function fmtLong(date) {
  if (!date) return '—';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(d);
}

/**
 * Formater un mois (Janvier 2025)
 */
export function fmtMonth(year, month) {
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric'
  }).format(date);
}

/**
 * Formater un mois court (Jan. 2025)
 */
export function fmtMonthShort(year, month) {
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'short',
    year: 'numeric'
  }).format(date);
}

/**
 * Formater un mois YYYY-MM
 */
export function fmtMonthISO(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Parser un mois YYYY-MM
 */
export function parseMonthISO(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  return { year, month };
}

/**
 * Formater un nombre
 */
export function fmtNumber(value, decimals = 0) {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }

  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

/**
 * Formater une durée en jours
 */
export function fmtDays(days) {
  if (days === null || days === undefined) {
    return '—';
  }
  return `${days} jour${days > 1 ? 's' : ''}`;
}

/**
 * Formater un TJM (Taux Journalier Moyen)
 */
export function fmtTJM(tjm) {
  return `${EUR(tjm)}/j`;
}

/**
 * Calculer les initiales d'un nom
 */
export function initials(name) {
  if (!name) return '?';

  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Tronquer un texte
 */
export function truncate(text, maxLength = 50) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Formater un numéro de facture
 */
export function fmtInvoiceNumber(number, year) {
  return `${year}-${String(number).padStart(4, '0')}`;
}

/**
 * Classe CSS pour un montant (positif/négatif)
 */
export function amountClass(amount) {
  if (amount > 0) return 'positive';
  if (amount < 0) return 'negative';
  return 'neutral';
}

/**
 * Couleur pour un montant
 */
export function amountColor(amount) {
  if (amount > 0) return 'var(--color-success)';
  if (amount < 0) return 'var(--color-danger)';
  return 'var(--color-text-secondary)';
}

/**
 * Formater une adresse sur plusieurs lignes
 */
export function fmtAddress(address) {
  if (!address) return '';

  const parts = [
    address.street,
    address.complement,
    `${address.zipCode} ${address.city}`.trim(),
    address.country
  ].filter(Boolean);

  return parts.join('\n');
}

/**
 * Valider un SIRET
 */
export function validateSIRET(siret) {
  if (!siret) return false;

  // Supprimer les espaces
  const cleaned = siret.replace(/\s/g, '');

  // Vérifier la longueur
  if (cleaned.length !== 14) return false;

  // Vérifier que ce sont des chiffres
  if (!/^\d{14}$/.test(cleaned)) return false;

  // Algorithme de Luhn pour validation
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let digit = parseInt(cleaned[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  return sum % 10 === 0;
}

/**
 * Formater un SIRET (avec espaces)
 */
export function fmtSIRET(siret) {
  if (!siret) return '';
  const cleaned = siret.replace(/\s/g, '');
  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4');
}

/**
 * Valider un email
 */
export function validateEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Générer une couleur à partir d'une chaîne
 */
export function stringToColor(str) {
  if (!str) return '#999';

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = hash % 360;
  return `hsl(${hue}, 60%, 50%)`;
}
