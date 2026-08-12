/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Argent } from './Argent';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-30T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

function recette(m: Partial<Recette> = {}): Recette {
  return {
    id: 'r1', clientNom: 'ClientA', libelle: 'Mission A', montant: euros(4000),
    emiseLe: dateISO('2026-06-30'), encaisseeLe: dateISO('2026-07-15'),
    modeReglement: 'virement', numero: '2026-001', ...m
  };
}

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...modifications } });
}

async function ouvrirLivre() {
  render(<Argent />);
  await userEvent.setup().click(screen.getByRole('tab', { name: 'Livre des recettes' }));
}

describe('conformité du registre', () => {
  it('ne signale aucun écart sur un registre complet', async () => {
    semer({ recettes: [recette()] });
    await ouvrirLivre();
    expect(screen.getByText('Écarts de conformité').nextSibling?.textContent).toBe('0');
    expect(screen.queryByText('À corriger')).toBeNull();
  });

  // L'ancienne application ne portait pas le mode de règlement, et rien ne le
  // disait.
  it('nomme la mention manquante, au lieu de dire « non conforme »', async () => {
    semer({ recettes: [recette({ modeReglement: null })] });
    await ouvrirLivre();
    expect(screen.getAllByText(/Mode de règlement absent/).length).toBeGreaterThan(0);
  });

  it('signale un trou dans la numérotation', async () => {
    semer({
      recettes: [
        recette({ id: 'a', numero: '2026-001' }),
        recette({ id: 'b', numero: '2026-003' })
      ]
    });
    await ouvrirLivre();
    expect(screen.getByText(/numéro\(s\) manquant\(s\)/)).toBeTruthy();
  });

  it('rattache l’écart à sa ligne, pas seulement au récapitulatif', async () => {
    semer({ recettes: [recette({ clientNom: '' })] });
    await ouvrirLivre();
    const liste = screen.getAllByRole('list').at(-1) as HTMLElement;
    expect(within(liste).getByText(/Identité du client absente/)).toBeTruthy();
  });
});

describe('ajout seul', () => {
  it('annule par une écriture inverse, sans rien effacer', async () => {
    semer({ recettes: [recette()] });
    await ouvrirLivre();

    await userEvent.setup().click(
      screen.getByRole('button', { name: /Annuler par écriture inverse/ })
    );

    expect(useFaits.getState().faits.recettes).toHaveLength(2);
    expect(screen.getByText('Écritures au livre').nextSibling?.textContent).toBe('2');
    expect(screen.getByText('Total encaissé').nextSibling?.textContent).toMatch(/^0\s€$/u);
  });

  // Proposer d'annuler une annulation empilerait des écritures sans fin.
  it('n’offre pas d’annuler une écriture d’annulation', async () => {
    semer({ recettes: [recette()] });
    await ouvrirLivre();
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: /Annuler par écriture inverse/ }));

    expect(screen.getAllByRole('button', { name: /Annuler par écriture inverse/ }))
      .toHaveLength(1);
  });
});

describe('factures non encaissées', () => {
  // L'y inscrire reviendrait à déclarer une recette qui n'a pas eu lieu, et à
  // payer des cotisations dessus.
  it('les tient hors du livre, mais visibles', async () => {
    semer({ recettes: [recette({ encaisseeLe: null, modeReglement: null })] });
    await ouvrirLivre();

    expect(screen.getByText('Écritures au livre').nextSibling?.textContent).toBe('0');
    expect(screen.getByText('Émises, pas encore encaissées')).toBeTruthy();
    expect(screen.getByText(/Émise le 30 juin 2026/)).toBeTruthy();
  });

  // Lui réclamer un mode de règlement serait un faux positif permanent.
  it('ne leur reproche aucune mention manquante', async () => {
    semer({ recettes: [recette({ encaisseeLe: null, modeReglement: null, clientNom: '' })] });
    await ouvrirLivre();
    expect(screen.getByText('Écarts de conformité').nextSibling?.textContent).toBe('0');
  });
});

describe('livre vide', () => {
  it('le dit au lieu d’afficher une liste vide', async () => {
    await ouvrirLivre();
    expect(screen.getByText('Aucun encaissement enregistré.')).toBeTruthy();
  });
});
