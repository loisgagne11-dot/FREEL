/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { dateISO, euros, mois } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Tresorerie } from './Tresorerie';
import { Activite } from './Activite';

/**
 * LE POINT D'ENTRÉE DE LA BASCULE D'ANNÉE, CÔTÉ ÉCRAN.
 *
 * `selecteurs.test.ts` prouve la règle sur `etatArgent`, à l'écart de React.
 * Ce fichier vérifie le seul fil qui manque : que les écrans câblent bien
 * l'année jusque-là — l'Analyse d'Activité, qui a hérité du chiffre
 * d'affaires de l'année (lot 51) —, et que la Trésorerie, qui n'a pas
 * d'année, ne bouge pas quand elle change.
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

/** Le libellé d'une tuile, et ce qu'elle affiche : la tuile entière. */
async function tuile(libelle: string): Promise<string | null | undefined> {
  return (await screen.findByText(libelle)).parentElement?.textContent;
}

describe('bascule d’année, vue depuis les écrans', () => {
  it('affiche le CA facturé de l’année choisie, pas celle de l’horloge', async () => {
    semer({
      recettes: [
        recette('a', 12_000, '2025-04-01'),
        recette('b', 40_000, '2026-04-01')
      ]
    });
    window.location.hash = '#/activite/analyse';
    render(<Activite mois={mois('2025-07')} onMois={() => {}} />);
    expect(await screen.findByText('CA facturé · 2025')).toBeTruthy();
    expect(screen.queryByText('CA facturé · 2026')).toBeNull();
  });

  /**
   * LE POINT DUR DU LOT, VU DEPUIS L'ÉCRAN.
   *
   * La Trésorerie affiche le disponible du compte : un état instantané, pas
   * une période. S'il changeait avec l'année choisie, l'utilisateur verrait
   * son compte en banque « changer de valeur » en naviguant dans un
   * historique — ce qui n'a pas de sens pour de l'argent qui est, ou n'est
   * pas, sur le compte aujourd'hui.
   */
  it('n’affiche pas un disponible différent selon l’année choisie', async () => {
    semer({
      recettes: [
        recette('a', 12_000, '2025-04-01'),
        recette('b', 40_000, '2026-04-01')
      ]
    });

    const { unmount } = render(<Tresorerie annee={2025} />);
    const disponible2025 = await tuile('Disponible');
    unmount();

    render(<Tresorerie annee={2026} />);
    const disponible2026 = await tuile('Disponible');

    expect(disponible2025).toBe(disponible2026);
  });

  /** Sans mois, l'écran retombe sur l'année de l'horloge — le cas de tous les
   *  tests qui montent un écran seul. */
  it('retombe sur l’année de l’horloge sans sélecteur', async () => {
    semer({ recettes: [recette('a', 5000, '2026-05-01')] });
    window.location.hash = '#/activite/analyse';
    render(<Activite />);
    expect(await screen.findByText('CA facturé · 2026')).toBeTruthy();
  });
});
