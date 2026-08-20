/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { FournisseurToasts } from '../components/Toasts';
import { Argent } from './Argent';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-13T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

const encaissee = (id: string, le: string): Recette => ({
  id, clientNom: 'Client', libelle: 'Prestation', montant: euros(3000),
  emiseLe: dateISO('2026-04-01'), encaisseeLe: dateISO(le),
  modeReglement: 'virement', numero: `2026-${id}`
});

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({
    faits: {
      ...faitsVides(),
      entreprise: { ...faitsVides().entreprise, urssafPeriodicite: 'trimestriel' },
      ...modifications
    }
  });
}

const rendre = async (): Promise<void> => {
  render(<FournisseurToasts><Argent /></FournisseurToasts>);
  // Le pilier Trésorerie est différé depuis le lot B : sans cette attente, la
  // première assertion tombe sur le « Chargement… » du Suspense. L'ancre est le
  // titre de la carte de répartition, que le handoff garde tel quel.
  await screen.findByText(/n’est pas tout à toi/);
};

/**
 * LE TROU QUE CETTE CARTE BOUCHE.
 *
 * `marquerPeriodeDeclaree` existait dans le magasin, aucun écran ne l'appelait.
 * Une période déclarée restait donc éternellement dans le volet « à
 * provisionner » : les provisions montaient sans redescendre, et le versable
 * baissait d'autant. On mettait de côté deux fois la même dette.
 */
describe('périodes URSSAF', () => {
  it('marque les trois mois d’un trimestre d’un seul geste', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10')] });
    await rendre();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Marquer déclarée' }));

    expect([...useFaits.getState().faits.periodesDeclarees].sort())
      .toEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('fait basculer la dette d’un volet à l’autre', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10')] });
    await rendre();

    const avant = screen.getByText('Charges sur recettes encaissées non déclarées')
      .nextElementSibling?.textContent;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Marquer déclarée' }));
    const apres = screen.getByText('Charges sur recettes encaissées non déclarées')
      .nextElementSibling?.textContent;

    expect(avant).not.toBe(apres);
  });

  it('permet de revenir sur une déclaration marquée par erreur', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10')] });
    await rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Marquer déclarée' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(useFaits.getState().faits.periodesDeclarees).toEqual([]);
  });

  /**
   * L'URSSAF ouvre la déclaration après la clôture de la période. Cocher un
   * trimestre en cours sortirait du volet « à provisionner » des recettes
   * qu'on va encore encaisser dessus.
   */
  it('ne propose pas de déclarer une période en cours', async () => {
    // Août 2026 est dans le T3, qui court jusqu'en septembre.
    semer({ recettes: [encaissee('r1', '2026-08-05')] });
    await rendre();

    expect(screen.queryByRole('button', { name: 'Marquer déclarée' })).toBeNull();
    expect(screen.getByText(/Période en cours/)).toBeTruthy();
  });

  // Sans encaissement, il n'y a rien à déclarer : la carte n'a pas lieu d'être.
  it('ne montre rien tant qu’aucune recette n’est encaissée', async () => {
    semer();
    await rendre();
    expect(screen.queryByText('Périodes URSSAF')).toBeNull();
  });

  it('suit la périodicité déclarée en Config', async () => {
    semer({
      entreprise: { ...faitsVides().entreprise, urssafPeriodicite: 'mensuel' },
      recettes: [encaissee('r1', '2026-04-10')]
    });
    await rendre();
    expect(screen.getByText('avril 2026')).toBeTruthy();
  });
});
