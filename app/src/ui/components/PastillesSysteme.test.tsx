/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CLE_STOCKAGE_THEME, themesDisponibles } from '../theme';
import { CLE_SESSION } from '../../infra/session';
import { PastillesSysteme } from './PastillesSysteme';

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-confidentiel');
});

/**
 * Les quatre palettes existaient, testées, parcourues par le vérificateur
 * responsive — mais uniquement en écrivant dans `localStorage`. Aucun bouton
 * de l'application n'en changeait. Une fonction sans porte d'entrée n'existe
 * pas pour celui qui s'en sert.
 */
describe('sélecteur de palette', () => {
  it('propose les quatre palettes de la cible', () => {
    render(<PastillesSysteme />);
    const choix = screen.getByRole('combobox', { name: 'Palette' });
    expect(choix.querySelectorAll('option')).toHaveLength(themesDisponibles.length);
    themesDisponibles.forEach((t) => {
      expect(screen.getByRole('option', { name: t.libelle })).toBeTruthy();
    });
  });

  it('applique la palette choisie au document', async () => {
    render(<PastillesSysteme />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Palette' }), 'clair');
    expect(document.documentElement.getAttribute('data-theme')).toBe('clair');
  });

  // Sans persistance, le choix serait à refaire à chaque ouverture — et le
  // script inline de index.html, qui pose le thème avant le premier rendu,
  // n'aurait rien à lire.
  it('conserve le choix pour la prochaine visite', async () => {
    render(<PastillesSysteme />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Palette' }), 'calme');
    expect(localStorage.getItem(CLE_STOCKAGE_THEME)).toBe('calme');
  });

  it('part de la palette déjà persistée, pas du défaut', () => {
    localStorage.setItem(CLE_STOCKAGE_THEME, 'nuit');
    render(<PastillesSysteme />);
    expect((screen.getByRole('combobox', { name: 'Palette' }) as HTMLSelectElement).value)
      .toBe('nuit');
  });

  /**
   * Le libellé disparaît visuellement sous 1320 px, mais il donne son nom
   * accessible au champ : le retirer du DOM laisserait un sélecteur que rien
   * n'annonce à un lecteur d'écran.
   */
  it('garde un nom accessible même quand le libellé est masqué', () => {
    render(<PastillesSysteme />);
    expect(screen.getByRole('combobox', { name: 'Palette' })).toBeTruthy();
  });
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

  it('dit « local » quand aucun compte n’est relié', () => {
    render(<PastillesSysteme />);
    expect(screen.getByRole('link', { name: /Vos données restent sur cet appareil/ }))
      .toBeTruthy();
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
    expect(lien.getAttribute('href')).toBe('#/config/compte');
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
