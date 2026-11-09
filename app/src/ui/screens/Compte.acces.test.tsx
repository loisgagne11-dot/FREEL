/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VerdictAcces, VerdictTable } from '../../infra/supabase.acces';
import { sqlProtectionLegacy } from '../../infra/supabase.acces';
import { ReglesDAcces } from './Compte.acces';

afterEach(() => { cleanup(); });

const CONFIG = { url: 'https://exemple-demo.supabase.co', cleAnon: 'cle-anon-factice' };

const verdict = (faits: VerdictTable, legacy: VerdictTable): VerdictAcces =>
  ({ faits, legacy, le: '2026-11-08T10:00:00.000Z' });

const PROTEGEE: VerdictTable = { statut: 'protegee' };

function monter(v: VerdictAcces) {
  const sonder = vi.fn(async () => v);
  render(<ReglesDAcces config={CONFIG} sonder={sonder} />);
  return sonder;
}

describe('règles d’accès', () => {
  it('une table protégée se dit en toutes lettres, et la vérification part au montage', async () => {
    const sonder = monter(verdict(PROTEGEE, PROTEGEE));
    expect((await screen.findAllByText('ne se lisent pas sans connexion'))).toHaveLength(2);
    expect(sonder).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('une table exposée dit combien de lignes, et une absente dit qu’il n’y a rien à protéger', async () => {
    monter(verdict({ statut: 'absente' }, { statut: 'exposee', lignes: 4 }));
    expect(await screen.findByText(/EXPOSÉES : 4 ligne\(s\) se lisent sans connexion/)).toBeTruthy();
    expect(screen.getByText('table absente — rien à protéger')).toBeTruthy();
  });

  it('une vérification impossible donne sa raison, jamais « protégée »', async () => {
    // Afficher le vert ici ferait croire sûr un projet qu'on n'a pas pu interroger.
    monter(verdict({ statut: 'inconnu', motif: 'Le projet n’a pas répondu.' }, PROTEGEE));
    expect(await screen.findByText('vérification impossible : Le projet n’a pas répondu.')).toBeTruthy();
    expect(screen.getAllByText('ne se lisent pas sans connexion')).toHaveLength(1);
  });

  it('l’exposition de l’ancienne table montre l’alerte et le SQL à appliquer', async () => {
    monter(verdict(PROTEGEE, { statut: 'exposee', lignes: 2 }));
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain(sqlProtectionLegacy());
    expect(alerte.textContent).toContain('L’ancienne application continue de fonctionner');
    expect(screen.getByRole('button', { name: 'Copier le SQL' })).toBeTruthy();
  });

  it('« Vérifier » relance la sonde et affiche le nouveau verdict', async () => {
    const sonder = vi.fn()
      .mockResolvedValueOnce(verdict(PROTEGEE, { statut: 'exposee', lignes: 2 }))
      .mockResolvedValueOnce(verdict(PROTEGEE, PROTEGEE));
    render(<ReglesDAcces config={CONFIG} sonder={sonder} />);
    await screen.findByRole('alert');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Vérifier' }));
    expect(sonder).toHaveBeenCalledTimes(2);
    expect(await screen.findAllByText('ne se lisent pas sans connexion')).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
