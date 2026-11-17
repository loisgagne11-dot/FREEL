/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Outils } from './Outils';

afterEach(cleanup);
beforeEach(() => {
  useFaits.setState({ faits: faitsVides() });
  window.location.hash = '#/simulateurs';
});

/*
 * SIMULATEURS : L'IMPÔT, LE RÉGIME, LA CFE — ET RIEN D'AUTRE (lot 51).
 *
 * Le compte rendu d'activité était le second onglet de cet écran ; il est
 * parti dans Activité, avec le planning dont il découle (ses tests y sont).
 * Un onglet unique se lirait comme un choix qui n'en est pas un : l'écran n'a
 * plus d'onglets du tout.
 */
describe('l’écran Simulateurs', () => {
  it('porte son nom, et les simulateurs sans onglets', () => {
    render(<Outils annee={2026} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Simulateurs' })).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('heading', { name: /Impôt sur le revenu/ })).toBeTruthy();
  });

  it('ne porte plus le compte rendu d’activité', () => {
    render(<Outils annee={2026} />);
    expect(screen.queryByRole('heading', { name: /compte-rendu/i })).toBeNull();
  });
});
