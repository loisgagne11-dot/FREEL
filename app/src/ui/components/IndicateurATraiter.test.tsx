/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { IndicateurATraiter } from './IndicateurATraiter';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-13T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

/**
 * Une facture largement au-delà de son échéance à 30 jours.
 *
 * Datée d'octobre 2025 pour rester en retard aux DEUX horloges employées ici —
 * janvier et août 2026. Une date de mai aurait été « à venir » en janvier, et
 * le test aurait mesuré autre chose que ce qu'il annonce.
 */
const enRetard = (id: string): Recette => ({
  id, clientNom: 'Client', libelle: 'Prestation', montant: euros(1000),
  emiseLe: dateISO('2025-10-01'), encaisseeLe: null, modeReglement: null,
  numero: `2025-${id}`
});

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...modifications } });
}

/**
 * LE SECOND NIVEAU D'ALERTE, QUI MANQUAIT.
 *
 * Le badge chiffré par onglet existait ; l'écran « À traiter » n'était qu'une
 * carte du Pilote. Depuis Achats, le badge disait « 5 » et rien ne disait
 * LESQUELS — il fallait revenir au Pilote. On finit par ne plus regarder un
 * chiffre qu'on ne peut pas ouvrir.
 */
describe('indicateur à traiter', () => {
  /**
   * Zéro n'est pas une information à afficher : une pastille « 0 à traiter »
   * occuperait un coin d'écran en permanence pour ne rien dire.
   *
   * L'horloge est reculée à janvier : au 13 août, l'échéance réglementaire de
   * facturation électronique du 1er septembre est dans son préavis, et il y a
   * donc toujours au moins un sujet — ce qui est le comportement voulu, mais
   * empêche de tester le cas vide.
   */
  it('n’apparaît pas quand il n’y a rien à traiter', () => {
    vi.setSystemTime(new Date('2026-01-15T09:00:00Z'));
    semer();
    render(<IndicateurATraiter ecranActif="pilote" />);
    expect(screen.queryByRole('button', { name: /à traiter/ })).toBeNull();
  });

  it('chiffre les sujets et ouvre leur détail', async () => {
    vi.setSystemTime(new Date('2026-01-15T09:00:00Z'));
    semer({ recettes: [enRetard('r1'), enRetard('r2')] });
    render(<IndicateurATraiter ecranActif="pilote" />);

    const pastille = screen.getByRole('button', { name: /à traiter/ });
    expect(pastille.textContent).toContain('2');

    await userEvent.setup().click(pastille);
    // `findBy` et non `getBy` : le panneau est chargé à la demande, comme les
    // écrans. Le test attend donc le fragment, au lieu de supposer qu'il est
    // déjà là — ce qu'il ne serait plus au premier clic d'une vraie session.
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  /**
   * Sur un écran donné, « 5 » doit vouloir dire « cinq choses ICI », pas
   * « cinq choses quelque part ». C'est ce qui rend la pastille lisible.
   */
  it('ne montre que les sujets de l’écran où l’on est', () => {
    semer({ recettes: [enRetard('r1')] });
    // Les factures en retard relèvent d'Activité : Achats ne doit rien montrer.
    render(<IndicateurATraiter ecranActif="achats" />);
    expect(screen.queryByRole('button', { name: /à traiter/ })).toBeNull();
  });

  it('montre tout sur le Pilote, qui est le poste de pilotage', () => {
    semer({ recettes: [enRetard('r1')] });
    render(<IndicateurATraiter ecranActif="pilote" />);
    expect(screen.getByRole('button', { name: /à traiter/ })).toBeTruthy();
  });

  it('montre les sujets de l’écran concerné quand on y est', () => {
    semer({ recettes: [enRetard('r1')] });
    render(<IndicateurATraiter ecranActif="activite" />);
    expect(screen.getByRole('button', { name: /à traiter/ })).toBeTruthy();
  });

  // Chaque sujet porte l'action qui le règle : une liste sans issue serait un
  // reproche, pas un outil.
  it('donne à chaque sujet le chemin qui le règle', async () => {
    semer({ recettes: [enRetard('r1')] });
    render(<IndicateurATraiter ecranActif="pilote" />);
    await userEvent.setup().click(screen.getByRole('button', { name: /à traiter/ }));
    await screen.findByRole('dialog');

    const lien = screen.getAllByRole('link')[0] as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toMatch(/^#\//);
  });
});
