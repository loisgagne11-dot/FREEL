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
