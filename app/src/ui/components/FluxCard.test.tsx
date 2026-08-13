/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
    expect(screen.getByText(/à provisionner sur les/)).toBeTruthy();
    expect(screen.queryByText(/Voir les échéances/)).toBeNull();
  });

  // Un repli vide se déplie sur du néant, et apprend que les replis ne
  // contiennent rien.
  it('ne replie que ce qui a du contenu', () => {
    render(<FluxCard flux={FLUX} periode="Août 2026" versementPossible />);
    expect(screen.getByText(/Voir les encaissements \(2\)/)).toBeTruthy();
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
