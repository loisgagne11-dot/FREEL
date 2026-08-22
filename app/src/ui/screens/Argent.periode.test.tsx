/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { dateISO, euros } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Argent } from './Argent';

/**
 * LE POINT D'ENTRÉE DE LA BASCULE D'ANNÉE, CÔTÉ ÉCRAN.
 *
 * `selecteurs.test.ts` prouve la règle sur `etatArgent`, à l'écart de React.
 * Ce fichier vérifie le seul fil qui manque : que l'écran câble bien la prop
 * `anneeChoisie` jusque-là, et que rien d'autre ne bouge sur l'écran quand
 * elle change — en particulier le pilier Trésorerie, qui n'a pas d'année.
 */

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-07-15T09:00:00Z'));
});

function recette(id: string, montant: number, le: string) {
  return {
    id, clientNom: 'Client d’essai', libelle: 'Prestation', montant: euros(montant),
    emiseLe: dateISO(le), encaisseeLe: dateISO(le),
    modeReglement: 'virement' as const, numero: id
  };
}

function semer(m: Partial<Faits> = {}): void {
  useFaits.setState({
    faits: {
      ...faitsVides(),
      soldeInitial: euros(10_000),
      soldeInitialAu: dateISO('2000-01-01'),
      ...m
    } as Faits
  });
}

describe('bascule d’année, câblée depuis l’écran Argent', () => {
  it('affiche le CA réalisé de l’année passée en prop, pas celle de l’horloge', () => {
    semer({
      recettes: [
        recette('a', 12_000, '2025-04-01'),
        recette('b', 40_000, '2026-04-01')
      ]
    });

    render(<Argent anneeChoisie={2025} />);
    expect(screen.getByText('CA réalisé 2025')).toBeTruthy();
    expect(screen.queryByText('CA réalisé 2026')).toBeNull();
  });

  /**
   * LE POINT DUR DU LOT, VU DEPUIS L'ÉCRAN.
   *
   * Le pilier Trésorerie affiche le disponible du compte : un état
   * instantané, pas une période. S'il changeait avec l'année choisie,
   * l'utilisateur verrait son compte en banque « changer de valeur » en
   * naviguant dans un historique — ce qui n'a pas de sens pour de l'argent
   * qui est, ou n'est pas, sur le compte aujourd'hui.
   */
  it('n’affiche pas un disponible différent selon l’année choisie', () => {
    semer({
      recettes: [
        recette('a', 12_000, '2025-04-01'),
        recette('b', 40_000, '2026-04-01')
      ]
    });

    const { unmount } = render(<Argent anneeChoisie={2025} />);
    const disponible2025 = screen.getByText(/disponible/).parentElement?.textContent;
    unmount();

    render(<Argent anneeChoisie={2026} />);
    const disponible2026 = screen.getByText(/disponible/).parentElement?.textContent;

    expect(disponible2025).toBe(disponible2026);
  });

  /** Sans prop, l'écran retombe sur l'année de l'horloge — le comportement de
   *  tous les tests d'avant ce lot, qui montent `<Argent />` sans argument. */
  it('retombe sur l’année de l’horloge sans sélecteur', () => {
    semer({ recettes: [recette('a', 5000, '2026-05-01')] });
    render(<Argent />);
    expect(screen.getByText('CA réalisé 2026')).toBeTruthy();
  });
});
