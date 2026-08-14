/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { dateISO, euros } from '../../domain/types';
import type { Echeance } from '../../domain/calculs/provisions';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Argent } from './Argent';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...modifications } });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-07-15T09:00:00Z'));
  semer();
});

const ech = (id: string, nature: Echeance['nature'], montant: number): Echeance => ({
  id, nature, montant: euros(montant), echeanceLe: dateISO('2026-08-31'),
  payeeLe: null, montantPaye: null
});

/**
 * « SUR CETTE SOMME TOTALE, COMBIEN J'AI DE PROVISION ET SUR QUELLE
 * CATÉGORIE » — la question posée telle quelle.
 *
 * L'ancienne application la montrait, la maquette aussi : le total seul ne
 * permet ni de rapprocher une provision de l'avis reçu, ni de savoir ce qui se
 * libère après une déclaration.
 */
describe('ventilation des provisions à l’écran', () => {
  it('affiche chaque nature avec son montant', () => {
    semer({ echeances: [ech('a', 'urssaf', 4100), ech('b', 'tva', 1800), ech('c', 'cfe', 300)] });
    render(<Argent />);

    const enveloppes = screen.getByText(/Enveloppes de provision/).closest('section');
    expect(enveloppes).toBeTruthy();
    const dans = within(enveloppes as HTMLElement);

    expect(dans.getByText('URSSAF — cotisations sociales')).toBeTruthy();
    expect(dans.getByText('4 100 €')).toBeTruthy();
    expect(dans.getByText('TVA à reverser')).toBeTruthy();
    expect(dans.getByText('1 800 €')).toBeTruthy();
    expect(dans.getByText('CFE — cotisation foncière')).toBeTruthy();
  });

  /**
   * Une nature à zéro reste affichée. Une catégorie qui disparaît en tombant à
   * zéro donne à croire qu'elle n'existe pas, alors qu'elle vient d'être
   * soldée — c'est l'information inverse.
   */
  it('garde les natures sans montant, à zéro', () => {
    semer({ echeances: [ech('a', 'urssaf', 4100)] });
    render(<Argent />);

    const enveloppes = screen.getByText(/Enveloppes de provision/).closest('section');
    const dans = within(enveloppes as HTMLElement);
    expect(dans.getByText('CFP — formation professionnelle')).toBeTruthy();
    expect(dans.getAllByText('0 €').length).toBeGreaterThan(0);
  });

  /**
   * Chaque montant de la ventilation porte `data-montant` : sans lui, le mode
   * confidentiel laisserait lire l'URSSAF et la TVA en clair sur un écran
   * partagé — et une provision dit à elle seule le chiffre d'affaires.
   */
  it('rend chaque montant masquable', () => {
    semer({ echeances: [ech('a', 'urssaf', 4100), ech('b', 'tva', 1800)] });
    render(<Argent />);

    const enveloppes = screen.getByText(/Enveloppes de provision/).closest('section');
    for (const texte of ['4 100 €', '1 800 €']) {
      const noeud = within(enveloppes as HTMLElement).getByText(texte);
      expect(noeud.closest('[data-montant]')).toBeTruthy();
    }
  });
});
