/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { euros, dateISO } from '../../domain/types';
import type { FluxDuMois } from '../../state/selecteurs';
import { FluxCard } from './FluxCard';

afterEach(cleanup);

const FLUX: FluxDuMois = {
  entrees: {
    encaisse: euros(4000),
    enAttente: euros(1500),
    lignes: [
      {
        id: 'r1', libelle: 'Client de démo', montant: euros(4000),
        date: dateISO('2026-08-04'), regle: true
      },
      {
        id: 'r2', libelle: 'Autre client', montant: euros(1500),
        date: dateISO('2026-07-02'), regle: false
      }
    ]
  },
  sorties: {
    total: euros(980), constate: euros(200), aProvisionner: euros(780), lignes: []
  },
  remuneration: { versable: euros(2500), provisions: euros(980) }
};

describe('le flux du mois', () => {
  it('montre les trois chiffres côte à côte', () => {
    render(<FluxCard flux={FLUX} periode="Août 2026" versementPossible />);
    expect(screen.getByText('Entrées')).toBeTruthy();
    expect(screen.getByText('Sorties')).toBeTruthy();
    expect(screen.getByText('Rémunération')).toBeTruthy();
  });

  it('chiffre ce qui reste en attente de règlement', () => {
    render(<FluxCard flux={FLUX} periode="Août 2026" versementPossible />);
    expect(screen.getByText(/encore en attente/)).toBeTruthy();
  });

  /**
   * Le point dur. Tant qu'aucune échéance n'est saisie, la liste est vide —
   * mais la dette existe : elle naît de l'encaissement. Un total tiré de la
   * liste afficherait « 0 € de sorties » à quelqu'un qui doit des milliers
   * d'euros de cotisations, ce qui est le pire chiffre possible sur cet écran.
   */
  it('chiffre les sorties même sans aucune échéance listée', () => {
    render(<FluxCard flux={FLUX} periode="Août 2026" versementPossible />);
    expect(screen.getByText(/à provisionner/)).toBeTruthy();
    expect(screen.queryByText(/^Échéances/)).toBeNull();
  });

  // Un bouton actif alors que le versable est nul invite à un geste qui ne
  // peut pas aboutir.
  it('ne propose pas de verser quand rien n’est versable', () => {
    const rien: FluxDuMois = {
      ...FLUX,
      remuneration: { versable: euros(0), provisions: euros(980) }
    };
    render(<FluxCard flux={rien} periode="Août 2026" versementPossible={false} />);
    expect(screen.queryByRole('link', { name: /Verser/ })).toBeNull();
    expect(screen.getByText(/Rien n’est versable/)).toBeTruthy();
  });

  it('propose de verser quand il y a de quoi', () => {
    render(<FluxCard flux={FLUX} periode="Août 2026" versementPossible />);
    expect(screen.getByRole('link', { name: 'Verser sur mon compte' })).toBeTruthy();
  });
});

/**
 * LE DÉTAIL SORT DES COLONNES.
 *
 * Trois colonnes tiennent dans 390 px ; trois LISTES, non. Le détail est donc
 * groupé sous un seul dépliant, en pleine largeur — plutôt que de masquer les
 * montants du détail sur téléphone comme le fait la maquette, ce qui reviendrait
 * à proposer un « voir le détail » qui ne détaille rien.
 */
describe('le détail', () => {
  it('reste replié tant qu’on ne le demande pas', () => {
    render(<FluxCard flux={FLUX} periode="Août 2026" versementPossible />);
    const bouton = screen.getByRole('button', { name: 'Voir le détail' });
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/Client de démo/)?.closest('[hidden]')).toBeTruthy();
  });

  it('ouvre les listes de toutes les colonnes d’un seul geste', async () => {
    render(<FluxCard flux={FLUX} periode="Août 2026" versementPossible />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voir le détail' }));

    expect(screen.getByText(/Encaissements \(2\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Masquer le détail' })).toBeTruthy();
  });

  // Les montants du détail sont la raison d'être du détail : ils survivent au
  // portrait, à la différence de la maquette.
  it('garde les montants dans les lignes de détail', async () => {
    render(<FluxCard flux={FLUX} periode="Août 2026" versementPossible />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voir le détail' }));

    const ligne = screen.getByText(/Client de démo/).closest('li') as HTMLElement;
    expect(ligne.textContent).toMatch(/4\s*000/u);
  });

  /**
   * Un dépliant vide s'ouvre sur du néant, et apprend que les dépliants ne
   * contiennent rien.
   */
  it('ne s’offre pas quand il n’y a rien à déplier', () => {
    const vide: FluxDuMois = {
      ...FLUX,
      entrees: { ...FLUX.entrees, lignes: [] }
    };
    render(<FluxCard flux={vide} periode="Août 2026" versementPossible />);
    expect(screen.queryByRole('button', { name: /détail/ })).toBeNull();
  });
});
