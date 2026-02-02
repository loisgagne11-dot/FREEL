/**
 * Service de gestion du thème (dark/light mode)
 */

import { store } from './Store.js';
import { storage } from './Storage.js';

export function initTheme() {
  const savedTheme = storage.load('theme', 'dark');
  applyTheme(savedTheme);

  // Écouter les changements
  store.on('theme', (theme) => {
    applyTheme(theme);
    storage.save('theme', theme);
  });
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  store.set('theme', theme);
}

export function toggleTheme() {
  const current = store.get('theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

export function isDarkMode() {
  return store.get('theme') === 'dark';
}
