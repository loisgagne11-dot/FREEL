/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VerdictAcces, VerdictTable } from '../../infra/supabase.acces';
import type { VerificationProjet } from '../../infra/supabase.verification';
import { SanteDuProjet, quandFr } from './Compte.sante';

afterEach(() => { cleanup(); });

const CONFIG = { url: 'https://projet-demo.supabase.co', cleAnon: 'eyJ.factice.anon' };
const P: VerdictTable = { statut: 'protegee' };

const verification = (
  acces: Partial<VerdictAcces> = {}, inscriptionsFermees: boolean | null = true
): VerificationProjet => ({
  reglages: { statut: 'ok', valeur: { inscriptionsFermees, confirmationAutomatique: false } },
  acces: { faits: P, historique: P, legacy: { statut: 'absente' }, le: '2026-11-22T08:40:00.000Z', ...acces },
  cleDeService: false,
  le: '2026-11-22T08:40:00.000Z'
});

function monter(verifier: () => Promise<VerificationProjet>) {
  const espion = vi.fn(verifier);
  render(<SanteDuProjet config={CONFIG} verifier={espion} pied={<button type="button">Changer de projet</button>} />);
  return espion;
}

const lignes = () => screen.getByRole('list', { name: 'Santé du projet' }).querySelectorAll('li');

describe('santé du projet', () => {
  it('trois maillons vérifiés et la ligne de l’offre gratuite, à l’ouverture', async () => {
    const verifier = monter(async () => verification());
    expect(await screen.findByText('Base préparée')).toBeTruthy();
    expect(screen.getByText('Un inconnu ne lit rien')).toBeTruthy();
    expect(screen.getByText('Inscriptions fermées')).toBeTruthy();
    expect(screen.getByText(/met en pause un projet sans activité pendant une semaine/)).toBeTruthy();
    expect(lignes()).toHaveLength(4);
    expect(verifier).toHaveBeenCalledTimes(1);
  });

  // Relié, le projet et la clé sont l'attendu ; ils ne se montrent que lorsqu'ils cassent.
  it('un projet en pause se dit en tête, avec le geste qui le rouvre', async () => {
    monter(async () => ({ ...verification(), reglages: { statut: 'erreur', motif: 'x', code: 503 }, acces: null }));
    expect(await screen.findByText('Le projet ne répond pas')).toBeTruthy();
    expect(screen.getByText(/rouvre-le depuis supabase\.com/)).toBeTruthy();
  });

  it('des inscriptions rouvertes se voient, avec la case à décocher', async () => {
    monter(async () => verification({}, false));
    expect(await screen.findByText('Inscriptions encore ouvertes')).toBeTruthy();
    expect(screen.getByText(/Allow new users to sign up/)).toBeTruthy();
  });

  it('une table exposée : ✗, l’alerte et le SQL, le détail table par table ouvert', async () => {
    monter(async () => verification({ faits: { statut: 'exposee', lignes: 2 } }));
    expect(await screen.findByText('Un inconnu peut lire tes données')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/lisibles par n’importe qui/);
    expect((screen.getByText('Le détail, table par table').closest('details') as HTMLDetailsElement).open).toBe(true);
  });

  /** Le verdict ne se garde pas : une règle posée entre-temps doit se voir au clic. */
  it('« Vérifier à nouveau » relance la vérification et affiche le nouveau verdict', async () => {
    const verifier = vi.fn()
      .mockResolvedValueOnce(verification({ faits: { statut: 'exposee', lignes: 2 } }))
      .mockResolvedValueOnce(verification());
    render(<SanteDuProjet config={CONFIG} verifier={verifier} pied={null} />);
    await screen.findByRole('alert');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Vérifier à nouveau' }));
    expect(verifier).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Un inconnu ne lit rien')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('dit l’heure à la française, et la date quand ce n’est pas aujourd’hui', () => {
    const midi = new Date(2026, 10, 22, 12, 0);
    expect(quandFr(new Date(2026, 10, 22, 9, 40).toISOString(), midi)).toBe('à 9 h 40');
    expect(quandFr(new Date(2026, 10, 21, 18, 5).toISOString(), midi)).toBe('le 21/11 à 18 h 05');
  });
});
