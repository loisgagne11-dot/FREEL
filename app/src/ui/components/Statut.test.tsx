/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Statut, statutRecette } from './Statut';

afterEach(cleanup);

describe('étiquette de statut', () => {
  /**
   * La couleur accélère la lecture d'une liste, elle ne peut pas la porter
   * seule : un daltonien, une impression en noir et blanc, un écran en plein
   * soleil, et l'information disparaît. Le libellé est toujours écrit.
   */
  it('écrit toujours le statut, sans compter sur la couleur', () => {
    render(<Statut libelle="En retard" ton="retard" />);
    expect(screen.getByText('En retard')).toBeTruthy();
  });

  // Direction visuelle, règle 4 : un signe ET un mot. Sans signe, une liste
  // imprimée en noir et blanc ne distinguait plus « Encaissée » de « En retard »
  // que par la lecture du mot.
  it('porte un signe propre à chaque ton, caché au lecteur d’écran', () => {
    const signes = (['ok', 'attente', 'retard', 'neutre'] as const).map((ton) => {
      const { container } = render(<Statut libelle="État" ton={ton} />);
      const signe = container.querySelector('[aria-hidden="true"]');
      cleanup();
      return signe?.textContent ?? '';
    });
    expect(signes.every((s) => s !== '')).toBe(true);
    expect(new Set(signes).size).toBe(4);
  });

  it('laisse un état préciser son signe', () => {
    const { container } = render(<Statut libelle="Envoyée" ton="attente" signe="→" />);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('→');
    expect(screen.getByText('Envoyée')).toBeTruthy();
  });
});

describe('statut d’une recette', () => {
  it('encaissée l’emporte sur tout le reste', () => {
    expect(statutRecette({ encaissee: true, echeanceDepassee: true }).libelle)
      .toBe('Encaissée');
  });

  /**
   * « En retard » et « en attente » ne se recouvrent pas par hasard : une
   * facture en retard EST en attente, c'est l'échéance dépassée qui la
   * distingue — et c'est la seule distinction qui appelle une relance.
   */
  it('distingue l’attente du retard', () => {
    expect(statutRecette({ encaissee: false, echeanceDepassee: false }).ton).toBe('attente');
    expect(statutRecette({ encaissee: false, echeanceDepassee: true }).ton).toBe('retard');
  });
});
