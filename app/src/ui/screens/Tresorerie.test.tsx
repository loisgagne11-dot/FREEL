/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Tresorerie } from './Tresorerie';

afterEach(() => { cleanup(); vi.useRealTimers(); window.location.hash = ''; });
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  window.location.hash = '#/tresorerie';
});

/**
 * TRÉSORERIE (lot 51, décision 1) : LE SOLDE, CE QU'ON PEUT SE VERSER, LA BANQUE.
 *
 * L'écran Argent mêlait deux questions dans son pilier Performance : le
 * chiffre d'affaires est parti dans Activité › Analyse, « Tu peux te verser »
 * reste ici, sous le solde dont il découle. L'échéancier est parti dans
 * Obligations ; le relevé bancaire arrive d'Achats — il est la source du
 * solde que l'écran affiche.
 */
describe('l’écran Trésorerie', () => {
  it('porte le versement sous le solde, et plus le chiffre d’affaires ni l’échéancier', async () => {
    render(<Tresorerie />);
    expect(await screen.findByRole('heading', { name: 'Tu peux te verser' })).toBeTruthy();
    expect(screen.queryByText(/CA facturé/)).toBeNull();
    expect(screen.queryByRole('heading', { name: /Échéancier/ })).toBeNull();
  });

  it('dit qu’aucun relevé n’est importé, et offre de le faire', () => {
    render(<Tresorerie />);
    const banque = screen.getByRole('region', { name: 'Banque' });
    expect(within(banque).getByText(/Aucun relevé importé/)).toBeTruthy();
    expect(within(banque).getByRole('button', { name: 'Importer un relevé' })).toBeTruthy();
  });

  it('compte les opérations à rapprocher, sans montant', () => {
    useFaits.setState({
      faits: {
        ...faitsVides(),
        mouvementsBancaires: [
          {
            id: 'm1', date: dateISO('2026-06-02'), libelle: 'VIR CLIENT DEMO', montant: euros(1200),
            rapprocheAvec: null, sansContrepartie: null, ignoree: false
          },
          {
            id: 'm2', date: dateISO('2026-06-03'), libelle: 'FRAIS', montant: euros(-9),
            rapprocheAvec: null, sansContrepartie: 'autre', ignoree: false
          }
        ]
      }
    });
    render(<Tresorerie />);
    expect(within(screen.getByRole('region', { name: 'Banque' })).getByText(/2 opérations au relevé · 1 à rapprocher/))
      .toBeTruthy();
  });

  /* L'action rapide « Importer un relevé » et le pointage d'un versement y
     mènent : le relevé doit s'ouvrir, puis l'adresse redevenir celle de
     l'écran — fermer puis recharger ne doit pas le rouvrir. */
  it('ouvre le relevé sur `#/tresorerie/releve`, puis rend l’adresse de l’écran', async () => {
    window.location.hash = '#/tresorerie/releve';
    render(<Tresorerie />);
    expect(await screen.findByRole('dialog', { name: 'Relevé bancaire' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: /Importer un relevé/ })).toBeTruthy();
    await vi.waitFor(() => expect(window.location.hash).toBe('#/tresorerie'));
  });

  it('ouvre le relevé depuis la carte Banque', async () => {
    render(<Tresorerie />);
    await userEvent.click(screen.getByRole('button', { name: 'Importer un relevé' }));
    expect(await screen.findByRole('dialog', { name: 'Relevé bancaire' })).toBeTruthy();
  });
});
