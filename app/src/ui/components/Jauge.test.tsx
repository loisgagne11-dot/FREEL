/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Jauge } from './Jauge';

afterEach(cleanup);

describe('jauge de seuil', () => {
  /**
   * Une barre remplie se lit d'un coup d'œil, et c'est tout son intérêt. Mais
   * elle ne dit ni combien il reste, ni à partir de quand ça devient un
   * problème : les deux chiffres sont écrits à côté.
   */
  it('écrit ce qu’il reste, pas seulement une proportion', () => {
    render(<Jauge libelle="Plafond micro" atteint={50000} seuil={77700} unite="€" />);
    expect(screen.getByText(/Il reste/)).toBeTruthy();
    expect(screen.getByText(/27\s700\s€/u)).toBeTruthy();
  });

  it('donne un nom accessible à la barre', () => {
    render(<Jauge libelle="Plafond micro" atteint={50000} seuil={77700} unite="€" />);
    expect(screen.getByRole('img', { name: /Plafond micro/ })).toBeTruthy();
  });

  /**
   * Au-delà du seuil, la barre ne peut pas déborder de sa piste : le
   * dépassement se lirait alors comme un simple « plein ». Il est écrit.
   */
  it('dit le dépassement au lieu de le noyer dans une barre pleine', () => {
    render(<Jauge libelle="Franchise TVA" atteint={40000} seuil={37500} unite="€" />);
    expect(screen.getByText(/Seuil dépassé de/)).toBeTruthy();
    expect(screen.getByText(/2\s500\s€/u)).toBeTruthy();
  });

  // Un seuil à zéro ne peut pas être une division : la jauge doit rester
  // affichable plutôt que de produire NaN %.
  it('ne divise pas par un seuil nul', () => {
    render(<Jauge libelle="Seuil inconnu" atteint={1000} seuil={0} unite="€" />);
    expect(screen.getByText('0 %')).toBeTruthy();
  });
});
