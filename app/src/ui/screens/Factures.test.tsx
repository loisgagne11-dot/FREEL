/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Factures } from './Factures';

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  window.location.hash = '#/factures';
});

/**
 * FACTURES A SON ENTRÉE (lot 51, décision 1) : LE FACTURIER ET LES CLIENTS.
 *
 * Les factures étaient un onglet d'Activité, qu'on atteignait en traversant
 * le planning. Leur écran porte la liste et le carnet des clients — leur
 * fiche porte le délai et l'adresse qu'une facture imprime.
 */
describe('l’écran Factures', () => {
  it('ouvre le facturier par défaut, avec l’onglet Clients à côté', async () => {
    render(<Factures />);
    expect(screen.getByRole('tab', { name: /^Factures/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /^Clients/ })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Nouvelle facture' })).toBeTruthy();
  });

  it('ouvre les clients quand l’adresse les désigne', async () => {
    window.location.hash = '#/factures/clients';
    render(<Factures />);
    expect(screen.getByRole('tab', { name: /^Clients/ }).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('heading', { name: /Carnet/ })).toBeTruthy();
  });

  it('écrit l’onglet choisi dans l’adresse', async () => {
    render(<Factures />);
    await userEvent.click(screen.getByRole('tab', { name: /^Clients/ }));
    expect(window.location.hash).toBe('#/factures/clients');
    await userEvent.click(screen.getByRole('tab', { name: /^Factures/ }));
    expect(window.location.hash).toBe('#/factures');
  });

  it('mène « Nouvelle facture » à la rédaction', async () => {
    render(<Factures />);
    await userEvent.click(await screen.findByRole('button', { name: 'Nouvelle facture' }));
    expect(window.location.hash).toBe('#/facture/nouvelle');
  });
});
