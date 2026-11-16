/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Obligations } from './Obligations';

afterEach(() => { cleanup(); vi.useRealTimers(); window.location.hash = ''; });
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  window.location.hash = '#/obligations';
});

const recette2025 = (): Recette => ({
  id: 'r', clientNom: 'Client de démonstration', libelle: 'Prestation', montant: euros(1000),
  emiseLe: dateISO('2025-03-10'), encaisseeLe: dateISO('2025-04-10'), modeReglement: 'virement',
  numero: 'F-1'
});

/**
 * OBLIGATIONS (lot 51, décision 1) : L'ÉCHÉANCIER ET LES REGISTRES.
 *
 * L'échéancier était le dernier bloc de la Trésorerie, sous la ligne de
 * flottaison ; le livre des recettes, un lien du pied du rail et des Réglages.
 * Ce qu'on déclare et les registres qui le justifient se cherchent au même
 * endroit.
 */
describe('l’écran Obligations', () => {
  it('porte l’échéancier de l’année, et l’année dans son en-tête', async () => {
    // Deux années au dossier : sur une seule, il n'y a pas de choix à offrir.
    useFaits.setState({ faits: { ...faitsVides(), recettes: [recette2025()] } });
    render(<Obligations annee={2026} onAnnee={() => {}} />);
    expect(await screen.findByRole('heading', { name: /Échéancier & obligations 2026/ })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Année' })).toBeTruthy();
  });

  it.each([
    ['Préparer ma déclaration de TVA', 'Déclaration de TVA'],
    ['Livre des recettes', 'Livre des recettes'],
    ['Déclaration européenne de services', 'Déclaration européenne de services']
  ])('ouvre « %s » en panneau', async (bouton, titre) => {
    render(<Obligations annee={2026} />);
    const registres = screen.getByRole('group', { name: 'Registres' });
    await userEvent.click(within(registres).getByRole('button', { name: bouton }));
    expect(await screen.findByRole('dialog', { name: titre })).toBeTruthy();
  });
});
