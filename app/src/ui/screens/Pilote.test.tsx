/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { type Faits, entrepriseVide, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Pilote, salutation } from './Pilote';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
});

function semer(modif: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...modif } });
}

/**
 * « BONJOUR CAMILLE — DEUX DÉCISIONS T'ATTENDENT. »
 *
 * Le Pilote saluait l'ENTREPRISE (« Bonjour Atelier de démonstration ») et
 * comptait ses décisions dans une seconde phrase. Le prénom vient de
 * Réglages, jamais du code : le dépôt est public.
 */
describe('la salutation', () => {
  it('nomme la personne et dit combien de décisions l’attendent, en lettres', () => {
    expect(salutation('Camille', 2)).toBe('Bonjour Camille — deux décisions t’attendent.');
    expect(salutation('Camille', 1)).toBe('Bonjour Camille — une décision t’attend.');
  });

  it('salue sans nommer tant que le prénom manque, plutôt que de saluer l’entreprise', () => {
    expect(salutation('  ', 0)).toBe('Bonjour — rien ne réclame ton attention.');
  });

  it('passe aux chiffres au-delà de dix', () => {
    expect(salutation('Camille', 12)).toBe('Bonjour Camille — 12 décisions t’attendent.');
  });

  it('lit le prénom saisi en Réglages', () => {
    semer({ entreprise: { ...entrepriseVide(), nom: 'Atelier', prenom: 'Camille' } });
    render(<Pilote />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Bonjour Camille — /);
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toMatch(/Atelier/);
  });
});
