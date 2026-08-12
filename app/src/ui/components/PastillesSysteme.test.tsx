/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CLE_STOCKAGE_THEME, themesDisponibles } from '../theme';
import { PastillesSysteme } from './PastillesSysteme';

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

/**
 * Les quatre palettes existaient, testées, parcourues par le vérificateur
 * responsive — mais uniquement en écrivant dans `localStorage`. Aucun bouton
 * de l'application n'en changeait. Une fonction sans porte d'entrée n'existe
 * pas pour celui qui s'en sert.
 */
describe('sélecteur de palette', () => {
  it('propose les quatre palettes de la cible', () => {
    render(<PastillesSysteme />);
    const choix = screen.getByRole('combobox', { name: 'Palette' });
    expect(choix.querySelectorAll('option')).toHaveLength(themesDisponibles.length);
    themesDisponibles.forEach((t) => {
      expect(screen.getByRole('option', { name: t.libelle })).toBeTruthy();
    });
  });

  it('applique la palette choisie au document', async () => {
    render(<PastillesSysteme />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Palette' }), 'clair');
    expect(document.documentElement.getAttribute('data-theme')).toBe('clair');
  });

  // Sans persistance, le choix serait à refaire à chaque ouverture — et le
  // script inline de index.html, qui pose le thème avant le premier rendu,
  // n'aurait rien à lire.
  it('conserve le choix pour la prochaine visite', async () => {
    render(<PastillesSysteme />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Palette' }), 'calme');
    expect(localStorage.getItem(CLE_STOCKAGE_THEME)).toBe('calme');
  });

  it('part de la palette déjà persistée, pas du défaut', () => {
    localStorage.setItem(CLE_STOCKAGE_THEME, 'nuit');
    render(<PastillesSysteme />);
    expect((screen.getByRole('combobox', { name: 'Palette' }) as HTMLSelectElement).value)
      .toBe('nuit');
  });

  /**
   * Le libellé disparaît visuellement sous 1320 px, mais il donne son nom
   * accessible au champ : le retirer du DOM laisserait un sélecteur que rien
   * n'annonce à un lecteur d'écran.
   */
  it('garde un nom accessible même quand le libellé est masqué', () => {
    render(<PastillesSysteme />);
    expect(screen.getByRole('combobox', { name: 'Palette' })).toBeTruthy();
  });
});
