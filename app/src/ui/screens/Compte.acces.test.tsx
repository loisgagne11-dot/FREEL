/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { VerdictAcces, VerdictTable } from '../../infra/supabase.acces';
import { sqlProtectionLegacy } from '../../infra/supabase.acces';
import { AlertesAcces, LignesAcces } from './Compte.acces';
import { sqlMemoireDuCompte } from '../../infra/supabase.memoire';

afterEach(() => { cleanup(); });

/*
 * La sonde n'est plus lancée par ce bloc : la santé du projet la mène avec le
 * reste de la vérification (`Compte.sante.test.tsx`, qui reprend « Vérifier
 * relance la sonde »). Ici, ce qu'un verdict donne à lire.
 */
const verdict = (
  faits: VerdictTable, legacy: VerdictTable, historique: VerdictTable = { statut: 'protegee' }
): VerdictAcces => ({ faits, legacy, historique, le: '2026-11-08T10:00:00.000Z' });

const PROTEGEE: VerdictTable = { statut: 'protegee' };

function monter(v: VerdictAcces) {
  render(<><LignesAcces verdict={v} /><AlertesAcces verdict={v} /></>);
}

describe('règles d’accès', () => {
  it('une table protégée se dit en toutes lettres, sans alerte', () => {
    monter(verdict(PROTEGEE, PROTEGEE));
    expect(screen.getAllByText('ne se lisent pas sans connexion')).toHaveLength(3);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('une table exposée dit combien de lignes, et une absente dit qu’il n’y a rien à protéger', () => {
    monter(verdict({ statut: 'absente' }, { statut: 'exposee', lignes: 4 }));
    expect(screen.getByText(/EXPOSÉES : 4 ligne\(s\) se lisent sans connexion/)).toBeTruthy();
    expect(screen.getByText('table absente — rien à protéger')).toBeTruthy();
  });

  it('une vérification impossible donne sa raison, jamais « protégée »', () => {
    // Afficher le vert ici ferait croire sûr un projet qu'on n'a pas pu interroger.
    monter(verdict({ statut: 'inconnu', motif: 'Le projet n’a pas répondu.' }, PROTEGEE));
    expect(screen.getByText('vérification impossible : Le projet n’a pas répondu.')).toBeTruthy();
    expect(screen.getAllByText('ne se lisent pas sans connexion')).toHaveLength(2);
  });

  it('l’exposition de l’ancienne table montre l’alerte et le SQL à appliquer', () => {
    monter(verdict(PROTEGEE, { statut: 'exposee', lignes: 2 }));
    const alerte = screen.getByRole('alert');
    expect(alerte.textContent).toContain(sqlProtectionLegacy());
    expect(alerte.textContent).toContain('L’ancienne application continue de fonctionner');
    expect(screen.getByRole('button', { name: 'Copier le SQL' })).toBeTruthy();
  });

  it('l’exposition des états précédents montre le SQL de la mémoire du compte', () => {
    monter(verdict(PROTEGEE, PROTEGEE, { statut: 'exposee', lignes: 20 }));
    const alerte = screen.getByRole('alert');
    expect(alerte.textContent).toMatch(/états précédents du compte sont lisibles/);
    expect(alerte.textContent).toContain(sqlMemoireDuCompte());
  });
});
