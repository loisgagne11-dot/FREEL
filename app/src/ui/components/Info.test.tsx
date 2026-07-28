/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Info } from './Info';

afterEach(cleanup);

const TEXTE = 'Le mode de règlement est une mention obligatoire du livre des recettes.';

describe('sémantique', () => {
  it('le bouton porte un nom accessible par défaut', () => {
    render(<Info>{TEXTE}</Info>);
    expect(screen.getByRole('button', { name: 'Explication' })).toBeTruthy();
  });

  // Entendre « Explication » trois fois de suite n'aide personne : le libellé
  // doit pouvoir préciser de quoi il s'agit.
  it('le nom accessible est personnalisable', () => {
    render(<Info libelle="Explication du mode de règlement">{TEXTE}</Info>);
    expect(screen.getByRole('button', { name: 'Explication du mode de règlement' })).toBeTruthy();
  });

  // Dans le prototype, le texte n'était qu'un bloc masqué en CSS : rien ne le
  // rattachait au « i » pour un lecteur d'écran.
  it('le texte est rattaché au bouton par aria-describedby', () => {
    render(<Info>{TEXTE}</Info>);
    const bouton = screen.getByRole('button', { name: 'Explication' });
    const id = bouton.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)?.textContent).toBe(TEXTE);
  });

  // Le repli est visuel. Retirer l'élément du DOM casserait le lien
  // aria-describedby, donc le texte reste présent et lisible à la demande.
  it('le texte reste dans l\'arbre d\'accessibilité même replié', () => {
    render(<Info>{TEXTE}</Info>);
    expect(screen.getByRole('note').textContent).toBe(TEXTE);
  });
});

describe('dépliage', () => {
  it('est replié au départ', () => {
    render(<Info>{TEXTE}</Info>);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });

  // Le clic est le chemin garanti : le survol n'existe ni au clavier ni au
  // toucher.
  it('le clic déplie et fige', async () => {
    const u = userEvent.setup();
    render(<Info>{TEXTE}</Info>);
    const bouton = screen.getByRole('button');
    await u.click(bouton);
    expect(bouton.getAttribute('aria-expanded')).toBe('true');
  });

  it('un second clic replie', async () => {
    const u = userEvent.setup();
    render(<Info>{TEXTE}</Info>);
    const bouton = screen.getByRole('button');
    await u.click(bouton);
    await u.click(bouton);
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
  });

  it('fonctionne au clavier, avec Entrée comme avec Espace', async () => {
    const u = userEvent.setup();
    render(<Info>{TEXTE}</Info>);
    const bouton = screen.getByRole('button');

    await u.tab();
    expect(document.activeElement).toBe(bouton);

    await u.keyboard('{Enter}');
    expect(bouton.getAttribute('aria-expanded')).toBe('true');

    await u.keyboard(' ');
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('plusieurs « i » sur la même page', () => {
  // Des identifiants partagés feraient pointer tous les boutons vers le même
  // texte : chacun doit décrire le sien.
  it('chacun a son propre identifiant de texte', () => {
    render(
      <>
        <Info libelle="Premier">Premier texte</Info>
        <Info libelle="Second">Second texte</Info>
      </>
    );
    const a = screen.getByRole('button', { name: 'Premier' }).getAttribute('aria-describedby');
    const b = screen.getByRole('button', { name: 'Second' }).getAttribute('aria-describedby');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
    expect(document.getElementById(a as string)?.textContent).toBe('Premier texte');
    expect(document.getElementById(b as string)?.textContent).toBe('Second texte');
  });

  it('déplier l\'un ne déplie pas l\'autre', async () => {
    const u = userEvent.setup();
    render(
      <>
        <Info libelle="Premier">Premier texte</Info>
        <Info libelle="Second">Second texte</Info>
      </>
    );
    await u.click(screen.getByRole('button', { name: 'Premier' }));
    expect(screen.getByRole('button', { name: 'Premier' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Second' }).getAttribute('aria-expanded')).toBe('false');
  });
});
