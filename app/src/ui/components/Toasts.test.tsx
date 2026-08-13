/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FournisseurToasts, useToast } from './Toasts';

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });

function Bouton({ message = 'Enregistré.' }: { message?: string }) {
  const signaler = useToast();
  return <button type="button" onClick={() => signaler(message)}>Agir</button>;
}

const rendre = (children = <Bouton />) =>
  render(<FournisseurToasts>{children}</FournisseurToasts>);

describe('confirmations éphémères', () => {
  it('affiche le message demandé', async () => {
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Agir' }));
    expect(screen.getByText('Enregistré.')).toBeTruthy();
  });

  /**
   * `role="status"` et non `alert` : la confirmation est lue sans voler le
   * focus. `alert` interromprait la saisie en cours, ce qui est
   * disproportionné pour un « enregistré ».
   */
  it('est annoncée sans interrompre la saisie', () => {
    rendre();
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
  });

  it('disparaît au bout de cinq secondes', async () => {
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Agir' }));
    expect(screen.getByText('Enregistré.')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByText('Enregistré.')).toBeNull();
  });

  /**
   * Deux confirmations dans la même milliseconde partageraient la même clé
   * React si l'identifiant venait de l'horloge : la seconde remplacerait la
   * première au lieu de s'empiler.
   */
  it('empile deux confirmations rapprochées', async () => {
    rendre(<><Bouton message="Premier." /><Bouton message="Second." /></>);
    const utilisateur = userEvent.setup();
    const boutons = screen.getAllByRole('button', { name: 'Agir' });

    await utilisateur.click(boutons[0] as HTMLElement);
    await utilisateur.click(boutons[1] as HTMLElement);

    expect(screen.getByText('Premier.')).toBeTruthy();
    expect(screen.getByText('Second.')).toBeTruthy();
  });

  // Hors conteneur, signaler ne doit pas faire tomber l'application : un
  // écran monté seul dans un test reste utilisable.
  it('ne lève pas quand aucun conteneur n’est monté', async () => {
    render(<Bouton />);
    await expect(
      userEvent.setup().click(screen.getByRole('button', { name: 'Agir' }))
    ).resolves.not.toThrow();
  });
});
