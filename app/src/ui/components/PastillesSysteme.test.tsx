/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CLE_SESSION } from '../../infra/session';
import { PastillesSysteme } from './PastillesSysteme';

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-confidentiel');
});

/**
 * LE THÈME A QUITTÉ LA BARRE DU HAUT (lot 51, décision 4).
 *
 * On le choisit une fois : il vit dans Config › Affichage, où ses tests ont
 * suivi. Un menu « Palette » resté ici ferait deux portes pour un réglage, et
 * occuperait la place de ce qu'on touche tous les jours.
 */
it('ne porte plus le choix du thème', () => {
  render(<PastillesSysteme />);
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByText('Palette')).toBeNull();
});

/**
 * Le mode confidentialité.
 *
 * Il floute les montants pour qu'on puisse partager son écran. Un flou
 * partiel serait pire qu'aucun : l'utilisateur se croirait couvert sans
 * l'être. La complétude est constatée par `verifier-confidentialite`, qui
 * charge les sept écrans dans un navigateur ; ici on vérifie la bascule.
 */
describe('bascule de confidentialité', () => {
  it('dit l’action, et porte l’état dans aria-pressed', () => {
    render(<PastillesSysteme />);
    const bouton = screen.getByRole('button', { name: /Masquer les montants/ });
    expect(bouton.getAttribute('aria-pressed')).toBe('false');
  });

  it('marque le document quand on l’active', async () => {
    render(<PastillesSysteme />);
    await userEvent.click(screen.getByRole('button', { name: /Masquer les montants/ }));
    expect(document.documentElement.getAttribute('data-confidentiel')).toBe('oui');
    expect(screen.getByRole('button', { name: /Montants masqués/ }).getAttribute('aria-pressed'))
      .toBe('true');
  });

  it('revient en arrière au second clic', async () => {
    render(<PastillesSysteme />);
    await userEvent.click(screen.getByRole('button', { name: /Masquer les montants/ }));
    await userEvent.click(screen.getByRole('button', { name: /Montants masqués/ }));
    expect(document.documentElement.hasAttribute('data-confidentiel')).toBe(false);
  });

  it('part de l’état déjà persisté', () => {
    localStorage.setItem('freel.confidentialite.v1', 'oui');
    render(<PastillesSysteme />);
    expect(screen.getByRole('button', { name: /Montants masqués/ })).toBeTruthy();
  });
});

/**
 * LA PASTILLE CLOUD, ET LE CAS QU'ELLE EXISTE POUR SIGNALER.
 *
 * Trois états, pas deux. Entre « relié » et « local » se trouve la session
 * EXPIRÉE : on croit être synchronisé, on saisit une semaine de travail, et
 * rien ne remonte. C'est le seul des trois qui coûte quelque chose, et c'est
 * celui qu'un indicateur binaire escamote.
 */
describe('état du compte', () => {
  const session = (expireLe: number) => JSON.stringify({
    jeton: 'j', jetonRafraichissement: 'r', expireLe,
    utilisateurId: 'u1', email: 'contact@atelier-demo.fr'
  });

  it('dit « non synchronisé » quand aucun compte n’est relié', () => {
    render(<PastillesSysteme />);
    expect(screen.getByRole('link', { name: /Tes données restent sur cet appareil/ }))
      .toBeTruthy();
  });

  /**
   * ÉCRITE, PAS SEULEMENT UN POINT DE COULEUR (décision 2).
   *
   * Le libellé disparaissait sous 1 680 px — presque tous les écrans de
   * bureau — et laissait un point de huit pixels dont la couleur seule disait
   * l'état. Le texte est là ; `verifier-responsive` constate qu'il se VOIT au
   * bureau, ce que jsdom ne sait pas mesurer.
   */
  it('écrit l’état de la synchronisation', () => {
    render(<PastillesSysteme />);
    const lien = screen.getByRole('link', { name: /Tes données restent sur cet appareil/ });
    expect(lien.querySelector('[data-role="libelle-synchro"]')?.textContent).toBe('Non synchronisé');
  });

  it('dit que le compte est relié quand la session est valable', () => {
    localStorage.setItem(CLE_SESSION, session(Date.now() + 3_600_000));
    render(<PastillesSysteme />);
    expect(screen.getByRole('link', { name: /Compte relié/ })).toBeTruthy();
  });

  /** LE TEST QUI COMPTE : une session morte ne doit jamais se lire « relié ». */
  it('signale une session expirée plutôt que de la dire reliée', () => {
    localStorage.setItem(CLE_SESSION, session(Date.now() - 1000));
    render(<PastillesSysteme />);
    expect(screen.getByRole('link', { name: /Session expirée/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Compte relié/ })).toBeNull();
  });

  // Signaler sans offrir le chemin serait un reproche, pas un outil.
  it('mène à l’écran où l’on s’y reconnecte', () => {
    localStorage.setItem(CLE_SESSION, session(Date.now() - 1000));
    render(<PastillesSysteme />);
    const lien = screen.getByRole('link', { name: /Session expirée/ });
    expect(lien.getAttribute('href')).toBe('#/reglages/compte');
  });

  /**
   * Une session sur le point d'expirer est traitée comme expirée : partir sur
   * une requête avec un jeton qui meurt en chemin ne synchronise rien, et
   * l'aurait annoncé comme réussi.
   */
  it('compte la marge d’une minute du côté prudent', () => {
    localStorage.setItem(CLE_SESSION, session(Date.now() + 30_000));
    render(<PastillesSysteme />);
    expect(screen.getByRole('link', { name: /Session expirée/ })).toBeTruthy();
  });
});
