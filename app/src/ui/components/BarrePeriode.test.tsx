/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { periodeCourante } from '../../domain/calculs/periode';
import { BarrePeriode } from './BarrePeriode';

afterEach(() => { cleanup(); });

const ANCRE = new Date('2026-06-10T09:00:00Z');

/**
 * Les flèches de la barre de période — encore servies par le facturier.
 *
 * Elles n'étaient testées qu'à travers Achats, qui ne les affiche plus depuis
 * que sa période suit le mois de la barre du haut (lot 8).
 */
describe('la barre de période', () => {
  it('offre la navigation dès qu’une maille est bornée', () => {
    const onDecaler = vi.fn();
    render(<BarrePeriode periode={periodeCourante('mois', ANCRE, 0)} onGranularite={() => {}} onDecaler={onDecaler} />);
    fireEvent.click(screen.getByRole('button', { name: 'Période précédente' }));
    expect(onDecaler).toHaveBeenCalledWith(-1);
  });

  // Naviguer dans un ensemble qui contient déjà tout ne mène nulle part.
  it('n’offre pas de navigation sur « Tout »', () => {
    render(<BarrePeriode periode={periodeCourante('tout', ANCRE, 0)} onGranularite={() => {}} onDecaler={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Période précédente' })).toBeNull();
  });

  it('se tait quand un autre contrôle porte la navigation', () => {
    render(
      <BarrePeriode periode={periodeCourante('mois', ANCRE, 0)} onGranularite={() => {}} onDecaler={() => {}}
        navigation={false} />
    );
    expect(screen.queryByRole('button', { name: 'Période précédente' })).toBeNull();
  });
});
