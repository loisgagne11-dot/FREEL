/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { CLE_STOCKAGE, faitsVides } from './state/schema';
import { useFaits } from './state/store';
import { App } from './App';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(CLE_STOCKAGE, JSON.stringify(faitsVides()));
  window.location.hash = '#/argent';
  useFaits.setState({ faits: faitsVides(), chargement: { phase: 'initial' }, saisiesEcartees: 0 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/**
 * L'ALERTE DE CONSERVATION SE LIT LÀ OÙ L'ON SAISIT.
 *
 * Si elle retournait sur le seul Pilote, un stockage saturé en cours de
 * session ne se verrait qu'en y revenant — après avoir saisi des factures qui
 * ne seront jamais enregistrées.
 */
describe('alerte de conservation', () => {
  it('s’affiche sur un autre écran que le Pilote', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    render(<App />);
    expect(await screen.findByText('Tes saisies ne sont pas conservées')).toBeTruthy();
  });

  it('signale une saisie écartée par un autre onglet', async () => {
    render(<App />);
    act(() => { useFaits.setState({ saisiesEcartees: 1 }); });
    expect((await screen.findByText(/autre fenêtre/)).textContent).toMatch(/refais-la/);
  });
});
