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
 * TRÉSORERIE (lot 51, décision 1 ; redessinée au lot 49) : LE SOLDE, CE QU'ON
 * PEUT SE VERSER, LA BANQUE.
 *
 * Le chiffre d'affaires est parti dans Activité › Analyse, l'échéancier dans
 * Obligations ; le relevé bancaire est ici — il est la source du solde que
 * l'écran affiche.
 */
describe('l’écran Trésorerie', () => {
  it('ouvre sur la cascade du solde et ce qui est dû, plus le chiffre d’affaires ni l’échéancier', async () => {
    render(<Tresorerie />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ton solde n’est pas tout à toi.' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Du solde à ce que tu peux te verser' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ce qui est dû' })).toBeTruthy();
    expect(screen.queryByText(/CA facturé/)).toBeNull();
    expect(screen.queryByRole('heading', { name: /Échéancier/ })).toBeNull();
  });

  /*
   * La vue vit dans l'adresse, pas dans les faits : « retour » y ramène, et un
   * lien partagé ouvre la même vue. Si la bascule écrivait un fait, elle
   * voyagerait d'un appareil à l'autre.
   */
  it('bascule entre douze mois à venir et l’année, par l’adresse', async () => {
    render(<Tresorerie annee={2026} />);
    const periode = screen.getByRole('navigation', { name: 'Période' });
    expect(within(periode).getByRole('link', { name: '12 mois à venir' }).getAttribute('aria-current')).toBe('page');
    await userEvent.click(within(periode).getByRole('link', { name: 'Année 2026' }));
    expect(window.location.hash).toBe('#/tresorerie/annee');
    expect(await screen.findByRole('heading', { name: 'Ton disponible en 2026' })).toBeTruthy();
    expect(useFaits.getState().faits).toEqual(faitsVides());
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
    expect(within(screen.getByRole('region', { name: 'Banque' })).getByText(/2 opérations · 1 à rapprocher/))
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

/**
 * DÉCISION 24 : LA PART GARDÉE SE FOND DANS LA RÉSERVE, ET L'ÉCRAN LE DIT UNE FOIS.
 *
 * Si le bandeau ne s'affichait pas, « à te verser » monterait de 10 % sans un
 * mot chez qui gardait une marge ; s'il ne se taisait pas après « Compris », on
 * cesserait de lire les bandeaux de cet écran.
 */
describe('la part gardée retirée', () => {
  const avecPart = (partGardeeRetiree: number | null) => useFaits.setState({
    faits: { ...faitsVides(), entreprise: { ...faitsVides().entreprise, partGardeeRetiree } }
  });

  it('dit le pourcentage d’avant, et renvoie à la réserve', () => {
    avecPart(10);
    render(<Tresorerie />);
    const bandeau = screen.getByRole('status', { name: 'Part gardée retirée' });
    expect(bandeau.textContent).toMatch(/Tu gardais 10\s%\sde chaque versement/u);
    expect(bandeau.textContent).toMatch(/un seul «\s?à te verser\s?» désormais/u);
    expect(within(bandeau).getByRole('link', { name: 'Relever ma réserve' }).getAttribute('href'))
      .toBe('#/reglages/reserve');
  });

  it('se tait après « Compris », pour toujours', async () => {
    avecPart(10);
    render(<Tresorerie />);
    await userEvent.click(screen.getByRole('button', { name: 'Compris' }));
    expect(useFaits.getState().faits.entreprise.partGardeeRetiree).toBeNull();
    expect(screen.queryByRole('status', { name: 'Part gardée retirée' })).toBeNull();
  });

  it('ne dit rien à qui ne gardait rien', () => {
    avecPart(null);
    render(<Tresorerie />);
    expect(screen.queryByRole('status', { name: 'Part gardée retirée' })).toBeNull();
  });
});
