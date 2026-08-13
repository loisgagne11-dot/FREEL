/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Repartition, type PartSolde } from './Repartition';

afterEach(cleanup);

const PARTS: readonly PartSolde[] = [
  { libelle: 'Provisions', montant: 8000, ton: 'provisions' },
  { libelle: 'Réserve', montant: 2000, ton: 'reserve' },
  { libelle: 'Versable', montant: 5000, ton: 'versable' }
];

describe('répartition du solde', () => {
  /**
   * Sous une certaine part, un segment fait quelques pixels sur un téléphone.
   * La légende porte donc chaque montant en toutes lettres : la barre ne fait
   * que les mettre en proportion.
   */
  it('écrit chaque montant, sans compter sur la barre', () => {
    render(<Repartition parts={PARTS} total={15000} deficit={0} />);
    expect(screen.getByText('Provisions')).toBeTruthy();
    expect(screen.getByText(/8\s?000/u)).toBeTruthy();
    expect(screen.getByText(/5\s?000/u)).toBeTruthy();
  });

  it('donne un nom accessible à la barre', () => {
    render(<Repartition parts={PARTS} total={15000} deficit={0} />);
    expect(screen.getByRole('img', { name: /Provisions 8000 euros/ })).toBeTruthy();
  });

  /**
   * Les provisions qui dépassent le solde ne sont pas une nuance
   * d'affichage : l'argent des cotisations a déjà été dépensé. Une barre
   * n'exprime que des parts d'un tout — elle ne peut pas montrer un manque.
   */
  it('dit le manque, que la barre ne peut pas représenter', () => {
    render(<Repartition parts={PARTS} total={15000} deficit={1200} />);
    expect(screen.getByText(/Il manque/)).toBeTruthy();
    expect(screen.getByText(/déjà été dépensée/)).toBeTruthy();
  });

  it('ne parle de manque que lorsqu’il y en a un', () => {
    render(<Repartition parts={PARTS} total={15000} deficit={0} />);
    expect(screen.queryByText(/Il manque/)).toBeNull();
  });

  // Un solde nul ne se répartit pas : la barre n'aurait aucune part à montrer,
  // et diviser par zéro produirait des largeurs NaN.
  it('n’affiche pas de barre sur un solde nul', () => {
    render(<Repartition parts={PARTS} total={0} deficit={0} />);
    expect(screen.queryByRole('img')).toBeNull();
    // Les montants, eux, restent lisibles.
    expect(screen.getByText('Provisions')).toBeTruthy();
  });
});
