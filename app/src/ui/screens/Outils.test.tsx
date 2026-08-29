/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Outils } from './Outils';

afterEach(cleanup);
beforeEach(() => {
  useFaits.setState({ faits: faitsVides() });
  window.location.hash = '#/outils';
});

/*
 * L'ACTION RAPIDE DOIT OUVRIR, PAS DÉPOSER.
 *
 * « Une action rapide qui dépose sur un écran sans rien ouvrir ne fait pas
 * gagner le second geste, elle le déplace » — c'est la règle que la rangée
 * d'actions rapides du Pilote s'est donnée, et « Télécharger le CRA » la tient
 * par cette sous-route.
 */
describe('la sous-route du générateur', () => {
  it('ouvre l’onglet ET l’atelier depuis #/outils/cra', async () => {
    window.location.hash = '#/outils/cra';
    render(<Outils annee={2026} />);

    expect(screen.getByRole('tab', { name: /CRA/ }).getAttribute('aria-selected'))
      .toBe('true');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });

  /*
   * Le défaut que ce test tient : l'état initial ne suffit pas. Depuis l'écran
   * Outils lui-même, suivre le lien change le hash sans remonter le composant
   * — sans effet, le lien aurait l'air mort une fois sur deux.
   */
  it('ouvre aussi quand on suit le lien depuis l’écran Outils', async () => {
    render(<Outils annee={2026} />);
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      window.location.hash = '#/outils/cra';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });

  it('n’ouvre rien sur #/outils tout court', () => {
    render(<Outils annee={2026} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('tab', { name: /Impôt/ }).getAttribute('aria-selected'))
      .toBe('true');
  });

  it('se referme sans quitter l’onglet', async () => {
    window.location.hash = '#/outils/cra';
    render(<Outils annee={2026} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: /Fermer/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('tab', { name: /CRA/ }).getAttribute('aria-selected'))
      .toBe('true');
  });
});
