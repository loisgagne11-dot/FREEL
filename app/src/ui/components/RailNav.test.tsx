/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO } from '../../domain/types';
import { entrepriseVide, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { RailNav } from './RailNav';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-confidentiel');
  window.localStorage.clear();
});
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
});

const rail = () => screen.getByRole('navigation', { name: 'Navigation principale' });
const nomsDesEntrees = () => within(rail()).getAllByRole('link')
  .filter((a) => a.getAttribute('data-role') === 'entree')
  .map((a) => a.getAttribute('aria-label'));

/**
 * HUIT ENTRÉES, DANS L'ORDRE DE LA MAQUETTE (décision 1 du 16/11).
 *
 * Six pour ce qu'on vient faire, puis Simulateurs et Réglages sous un filet :
 * mêlées, les huit se liraient comme huit questions de même rang.
 */
describe('le rail', () => {
  it('porte les six entrées, un filet, puis Simulateurs et Réglages', () => {
    render(<RailNav ecranActif="pilote" />);
    expect(nomsDesEntrees()).toEqual([
      'Pilote', 'Activité', 'Factures', 'Trésorerie', 'Obligations', 'Achats', 'Simulateurs', 'Réglages'
    ]);
    const filet = within(rail()).getByRole('separator');
    const achats = within(rail()).getByRole('link', { name: 'Achats' });
    const simulateurs = within(rail()).getByRole('link', { name: 'Simulateurs' });
    // Le filet est ENTRE les deux groupes, pas au bout du rail.
    expect(achats.compareDocumentPosition(filet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filet.compareDocumentPosition(simulateurs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('allume « Factures » sur une facture qu’on rédige ou rouvre', () => {
    render(<RailNav ecranActif="facture" />);
    expect(within(rail()).getByRole('link', { name: 'Factures' }).getAttribute('aria-current'))
      .toBe('page');
  });

  it('additionne sur « Factures » les sujets de la rédaction', () => {
    render(<RailNav ecranActif="pilote" compteurs={{ factures: 1, facture: 2 }} />);
    expect(within(rail()).getByRole('link', { name: 'Factures' }).textContent).toContain('3');
  });

  /* La pastille « à traiter » a quitté la barre du haut : ce qui attend se lit
     aux compteurs des entrées. */
  it('porte le compteur d’Obligations sur son entrée', () => {
    render(<RailNav ecranActif="pilote" compteurs={{ obligations: 2 }} />);
    expect(within(rail()).getByRole('link', { name: 'Obligations' }).textContent).toContain('2');
  });
});

/**
 * « PLUS » : CE QUE LA BARRE DU TÉLÉPHONE N'A PAS LA PLACE DE MONTRER.
 *
 * Quatre entrées et « Plus », toutes nommées (décision 3). Le volet porte le
 * reste, et l'interrupteur « Masquer les montants », qui quitte alors la barre
 * du haut. Sans compteur sur « Plus », deux déclarations en retard sous
 * Obligations ne se verraient d'aucun écran du téléphone sauf le Pilote.
 */
describe('« Plus », au téléphone', () => {
  it('porte la somme des compteurs qu’il cache', () => {
    render(<RailNav ecranActif="pilote" compteurs={{ obligations: 2, factures: 1 }} />);
    expect(within(rail()).getByRole('button', { name: 'Plus' }).textContent).toContain('2');
  });

  it('ouvre un volet avec Obligations, Achats, Simulateurs et Réglages', async () => {
    render(<RailNav ecranActif="pilote" compteurs={{ obligations: 2 }} />);
    await userEvent.click(within(rail()).getByRole('button', { name: 'Plus' }));
    const volet = await screen.findByRole('dialog', { name: 'Plus' });
    expect(within(volet).getAllByRole('link').map((a) => a.getAttribute('href')))
      .toEqual(['#/obligations', '#/achats', '#/simulateurs', '#/reglages']);
    expect(within(volet).getByRole('link', { name: /Obligations/ }).textContent).toContain('2');
  });

  it('masque les montants depuis le volet', async () => {
    render(<RailNav ecranActif="pilote" />);
    await userEvent.click(within(rail()).getByRole('button', { name: 'Plus' }));
    const volet = await screen.findByRole('dialog', { name: 'Plus' });
    await userEvent.click(within(volet).getByRole('switch', { name: 'Masquer les montants' }));
    expect(document.documentElement.hasAttribute('data-confidentiel')).toBe(true);
  });

  it('se referme quand on choisit une entrée', async () => {
    render(<RailNav ecranActif="pilote" />);
    await userEvent.click(within(rail()).getByRole('button', { name: 'Plus' }));
    const volet = await screen.findByRole('dialog', { name: 'Plus' });
    await userEvent.click(within(volet).getByRole('link', { name: /Achats/ }));
    expect(screen.queryByRole('dialog', { name: 'Plus' })).toBeNull();
  });
});

/**
 * LE PIED : QUI L'ON EST, ET OÙ LE CORRIGER.
 *
 * « Micro-BNC · ACRE » se relit d'un coup d'œil avant de se fier à un taux.
 * Le prénom vient de Réglages, jamais du code : le dépôt est public.
 */
describe('le pied du rail', () => {
  it('nomme la personne et son régime, ACRE compris tant qu’il court, et mène aux Réglages', async () => {
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
    expect(carte.getAttribute('href')).toBe('#/reglages');
  });

  it('retombe sur « Ton profil » sans nom ni prénom', async () => {
    render(<RailNav ecranActif="pilote" />);
    expect(await within(rail()).findByRole('link', { name: 'Ton profil — Micro-BNC' })).toBeTruthy();
  });

  /* Le livre des recettes vit dans Obligations, avec les autres registres. */
  it('ne porte plus le livre des recettes', async () => {
    render(<RailNav ecranActif="pilote" />);
    await within(rail()).findByRole('link', { name: 'Ton profil — Micro-BNC' });
    expect(within(rail()).queryByRole('link', { name: 'Livre des recettes' })).toBeNull();
  });
});
