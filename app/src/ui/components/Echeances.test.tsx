/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import type { Echeance } from '../../domain/calculs/provisions';
import { faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { etatPilote } from '../../state/selecteurs';
import { FournisseurToasts } from './Toasts';
import { Echeances } from './Echeances';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-13T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

const echeance = (p: Partial<Echeance> & { readonly id: string }): Echeance => ({
  nature: 'urssaf', montant: euros(2400), echeanceLe: dateISO('2026-09-05'),
  payee: false, ...p
});

function semer(echeances: readonly Echeance[]): void {
  useFaits.setState({ faits: { ...faitsVides(), echeances } });
}

const rendre = () => render(
  <FournisseurToasts><Echeances aujourdhui={new Date('2026-08-13T09:00:00Z')} /></FournisseurToasts>
);

/**
 * LE TROU QUE CET ÉCRAN BOUCHE.
 *
 * Le volet « échéances émises » des provisions se calculait sur une liste vide,
 * parce qu'aucun écran ne pouvait créer une échéance. L'erreur allait dans le
 * sens dangereux : moins de provisions, donc plus de disponible, donc plus de
 * versable. L'application invitait à se verser de l'argent déjà dû.
 */
describe('saisir une échéance', () => {
  it('la fait entrer dans les provisions', async () => {
    rendre();
    const utilisateur = userEvent.setup();

    const avant = etatPilote(useFaits.getState().faits).voletConstate;
    expect(avant).toBe(0);

    await utilisateur.click(screen.getByRole('button', { name: 'Saisir une échéance' }));
    await utilisateur.type(screen.getByLabelText('Montant appelé (€)'), '2400');
    await utilisateur.type(screen.getByLabelText('Date d’échéance'), '2026-09-05');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer l’échéance' }));

    expect(etatPilote(useFaits.getState().faits).voletConstate).toBe(2400);
  });

  /**
   * Sans date, la somme pèserait sur les provisions sans apparaître dans aucun
   * mois : invisible au flux, mais bien retranchée du disponible.
   */
  it('refuse une échéance sans date plutôt que de la dater d’office', async () => {
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Saisir une échéance' }));
    await utilisateur.type(screen.getByLabelText('Montant appelé (€)'), '2400');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer l’échéance' }));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(useFaits.getState().faits.echeances).toEqual([]);
  });

  it('refuse un montant nul', async () => {
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Saisir une échéance' }));
    await utilisateur.type(screen.getByLabelText('Montant appelé (€)'), '0');
    await utilisateur.type(screen.getByLabelText('Date d’échéance'), '2026-09-05');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer l’échéance' }));

    expect(useFaits.getState().faits.echeances).toEqual([]);
  });
});

/**
 * Une échéance payée sort des provisions : l'argent a quitté le compte, le
 * solde bancaire la reflète déjà. L'y laisser retrancherait deux fois la même
 * somme du disponible.
 */
describe('marquer payée', () => {
  it('la sort des provisions sans la sortir de la liste', async () => {
    semer([echeance({ id: 'e1' })]);
    rendre();

    expect(etatPilote(useFaits.getState().faits).voletConstate).toBe(2400);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Marquer payée' }));

    expect(etatPilote(useFaits.getState().faits).voletConstate).toBe(0);
    // Toujours affichée : c'est l'historique de ce qui a été appelé.
    expect(screen.getByText('Payée')).toBeTruthy();
  });

  it('se dépaie, pour rattraper une erreur', async () => {
    semer([echeance({ id: 'e1', payee: true })]);
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Repasser à payer' }));
    expect(useFaits.getState().faits.echeances[0]?.payee).toBe(false);
  });
});

describe('états', () => {
  // Le jour même de l'échéance, on a la journée pour payer.
  it('n’est pas en retard le jour de l’échéance', () => {
    semer([echeance({ id: 'e1', echeanceLe: dateISO('2026-08-13') })]);
    rendre();
    expect(screen.getByText('À payer')).toBeTruthy();
  });

  it('est en retard le lendemain', () => {
    semer([echeance({ id: 'e1', echeanceLe: dateISO('2026-08-12') })]);
    rendre();
    expect(screen.getByText('En retard')).toBeTruthy();
  });

  it('ne totalise que ce qui reste à payer', () => {
    semer([
      echeance({ id: 'e1', montant: euros(2400) }),
      echeance({ id: 'e2', montant: euros(900), payee: true })
    ]);
    rendre();
    const total = screen.getByText('Reste à payer').parentElement as HTMLElement;
    expect(total.textContent).toContain('2');
    expect(total.textContent).not.toContain('3 300');
  });

  // L'état vide doit dire la CONSÉQUENCE, pas seulement le vide : c'est là que
  // se joue la surestimation du disponible.
  it('dit ce que coûte l’absence d’échéance', () => {
    semer([]);
    rendre();
    expect(screen.getByText(/disponible est surestimé/)).toBeTruthy();
  });
});

describe('corriger', () => {
  it('ouvre le formulaire déjà rempli', async () => {
    semer([echeance({ id: 'e1', nature: 'cfe', montant: euros(510) })]);
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Corriger' }));

    expect(screen.getByLabelText<HTMLInputElement>('Montant appelé (€)').value).toBe('510');
    expect(screen.getByLabelText<HTMLSelectElement>('Nature').value).toBe('cfe');
  });

  it('supprime une échéance saisie par erreur', async () => {
    semer([echeance({ id: 'e1' })]);
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Corriger' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer cette échéance' }));

    expect(useFaits.getState().faits.echeances).toEqual([]);
  });
});
