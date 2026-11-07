/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { dateISO } from '../../domain/types';
import { entrepriseVide, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { RailNav } from './RailNav';

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
});

const rail = () => screen.getByRole('navigation', { name: 'Navigation principale' });

/**
 * SIX ENTRÉES, ET UNE FACTURE ALLUME « ACTIVITÉ ».
 *
 * La liste des factures est un onglet d'Activité (décision n° 2, formule A) :
 * une facture ouverte qui n'allumerait rien laisserait l'utilisateur sans
 * savoir où il est.
 */
describe('le rail', () => {
  it('allume « Activité & congés » sur une facture', () => {
    render(<RailNav ecranActif="facture" />);
    expect(within(rail()).getByRole('link', { name: 'Activité & congés' }).getAttribute('aria-current'))
      .toBe('page');
  });

  it('additionne sur « Activité » les sujets des factures', () => {
    render(<RailNav ecranActif="pilote" compteurs={{ activite: 1, facture: 2 }} />);
    expect(within(rail()).getByRole('link', { name: 'Activité & congés' }).textContent).toContain('3');
  });
});

/**
 * LE PIED : LE LIVRE DES RECETTES, ET QUI L'ON EST.
 *
 * « Micro-BNC · ACRE » se relit d'un coup d'œil avant de se fier à un taux.
 * Le prénom vient de Réglages, jamais du code : le dépôt est public.
 */
describe('le pied du rail', () => {
  it('ouvre le livre des recettes en accès direct', async () => {
    render(<RailNav ecranActif="pilote" />);
    expect((await within(rail()).findByRole('link', { name: 'Livre des recettes' })).getAttribute('href'))
      .toBe('#/argent/livre');
  });

  it('nomme la personne et son régime, ACRE compris tant qu’il court', async () => {
    useFaits.setState({
      faits: {
        ...faitsVides(),
        entreprise: {
          ...entrepriseVide(), nom: 'Atelier Démo', prenom: 'Camille',
          acre: true, debutActivite: dateISO('2026-02-01')
        }
      }
    });
    render(<RailNav ecranActif="pilote" />);
    const carte = await within(rail()).findByRole('link', { name: /^Camille — / });
    expect(carte.getAttribute('aria-label')).toBe('Camille — Micro-BNC · ACRE');
    expect(carte.getAttribute('href')).toBe('#/config');
  });

  it('retombe sur « Ton profil » sans nom ni prénom', async () => {
    render(<RailNav ecranActif="pilote" />);
    expect(await within(rail()).findByRole('link', { name: 'Ton profil — Micro-BNC' })).toBeTruthy();
  });
});
