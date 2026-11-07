/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { euros, dateISO } from '../../domain/types';
import type { FluxDuMois } from '../../state/selecteurs';
import { FluxCard } from './FluxCard';

afterEach(cleanup);

const RIEN = { onVersable: () => {}, dejaVerse: null, besoinMensuel: euros(0) };

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
    render(<FluxCard flux={FLUX} periode="août 2026" {...RIEN} />);
    expect(screen.getByText('Entrées')).toBeTruthy();
    expect(screen.getByText('Sorties')).toBeTruthy();
    expect(screen.getByText('Rémunération')).toBeTruthy();
  });

  it('chiffre ce qui reste en attente de règlement', () => {
    render(<FluxCard flux={FLUX} periode="août 2026" {...RIEN} />);
    const note = (screen.getByText('Entrées').parentElement as HTMLElement).querySelector('p');
    expect(note?.textContent).toMatch(/1\s*500.*en attente/u);
  });

  /**
   * Le point dur. Tant qu'aucune échéance n'est saisie, la liste est vide —
   * mais la dette existe : elle naît de l'encaissement. Un total tiré de la
   * liste afficherait « 0 € de sorties » à quelqu'un qui doit des milliers
   * d'euros de cotisations, ce qui est le pire chiffre possible sur cet écran.
   */
  it('chiffre les sorties même sans aucune échéance listée', () => {
    render(<FluxCard flux={FLUX} periode="août 2026" {...RIEN} />);
    expect(screen.getAllByText(/à provisionner/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Charges sur encaissements').length).toBeGreaterThan(0);
  });

  // Un bouton actif alors que le versable est nul invite à un geste qui ne
  // peut pas aboutir.
  it('ne propose pas de verser quand rien n’est versable', () => {
    const rien: FluxDuMois = {
      ...FLUX,
      remuneration: { versable: euros(0), provisions: euros(980) }
    };
    render(<FluxCard flux={rien} periode="août 2026" {...RIEN} />);
    expect(screen.queryAllByRole('link', { name: /Verser/ })).toHaveLength(0);
    expect(screen.getByText(/Rien n’est versable/)).toBeTruthy();
  });

  it('propose de verser quand il y a de quoi', () => {
    render(<FluxCard flux={FLUX} periode="août 2026" {...RIEN} />);
    expect(screen.getAllByRole('link', { name: 'Verser sur mon compte' }).length).toBeGreaterThan(0);
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
    render(<FluxCard flux={FLUX} periode="août 2026" {...RIEN} />);
    const bouton = screen.getByRole('button', { name: 'Voir le détail' });
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[hidden]')?.textContent).toMatch(/Client de démo/);
  });

  it('ouvre les listes de toutes les colonnes d’un seul geste', async () => {
    render(<FluxCard flux={FLUX} periode="août 2026" {...RIEN} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voir le détail' }));

    expect(screen.getByText(/Encaissements \(2\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Masquer le détail' })).toBeTruthy();
  });

  // Les montants du détail sont la raison d'être du détail : ils survivent au
  // portrait, à la différence de la maquette.
  it('garde les montants dans les lignes de détail', async () => {
    render(<FluxCard flux={FLUX} periode="août 2026" {...RIEN} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voir le détail' }));
    const bouton = () => screen.getByRole('button', { name: 'Masquer le détail' });

    const details = document.getElementById(bouton().getAttribute('aria-controls') as string) as HTMLElement;
    const ligne = within(details).getByText(/Client de démo/).closest('li') as HTMLElement;
    expect(ligne.textContent).toMatch(/4\s*000/u);
  });

  /**
   * Un dépliant vide s'ouvre sur du néant, et apprend que les dépliants ne
   * contiennent rien.
   */
  it('ne s’offre pas quand il n’y a rien à déplier', () => {
    const vide: FluxDuMois = {
      ...FLUX,
      entrees: { ...FLUX.entrees, lignes: [] },
      sorties: { ...FLUX.sorties, aProvisionner: euros(0), lignes: [] }
    };
    render(<FluxCard flux={vide} periode="août 2026" {...RIEN} />);
    expect(screen.queryByRole('button', { name: /détail/ })).toBeNull();
  });
});

/**
 * CHAQUE LIGNE A SON STATUT, ET LE STATUT MÈNE OÙ IL SE MET À JOUR.
 *
 * Un total seul ne dit pas QUI n'a pas payé. Le handoff met sous chaque
 * colonne ses lignes, avec une pastille — et « clique un statut pour le
 * mettre à jour ».
 */
describe('les lignes et leurs pastilles', () => {
  const avecRetard: FluxDuMois = {
    ...FLUX,
    entrees: {
      ...FLUX.entrees,
      lignes: [...FLUX.entrees.lignes, {
        id: 'r3', libelle: 'Client en retard', montant: euros(1200),
        date: dateISO('2026-05-02'), regle: false, enRetard: true
      }]
    }
  };

  it('distingue encaissé, en attente et en retard', () => {
    render(<FluxCard flux={avecRetard} periode="août 2026" {...RIEN} />);
    const colonne = screen.getByText('Entrées').parentElement as HTMLElement;
    const pastille = (nom: string) =>
      within(colonne).getByText(nom).closest('a')?.textContent ?? '';
    expect(pastille('Client de démo')).toMatch(/encaissé/);
    expect(pastille('Autre client')).toMatch(/en attente/);
    expect(pastille('Client en retard')).toMatch(/en retard/);
  });

  it('mène une facture au facturier, une sortie à l’échéancier', () => {
    render(<FluxCard flux={avecRetard} periode="août 2026" {...RIEN} />);
    const entrees = screen.getByText('Entrées').parentElement as HTMLElement;
    const sorties = screen.getByText('Sorties').parentElement as HTMLElement;
    expect(within(entrees).getByText('Autre client').closest('a')?.getAttribute('href')).toBe('#/facture');
    expect(within(sorties).getByText('Charges sur encaissements').closest('a')?.getAttribute('href')).toBe('#/argent');
  });
});

/**
 * LE VERSABLE VIT DANS LA COLONNE RÉMUNÉRATION, ET S'OUVRE SUR SA COMPOSITION.
 *
 * Il avait sa propre carte au-dessus du flux, que la colonne répétait.
 */
describe('la rémunération', () => {
  it('ouvre la composition du versable', async () => {
    const ouvrir = vi.fn();
    render(<FluxCard flux={FLUX} periode="août 2026" {...RIEN} onVersable={ouvrir} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /d’où vient ce chiffre/ }));
    expect(ouvrir).toHaveBeenCalledOnce();
  });

  // « Je peux me verser 2 500 » se lirait « en plus » sans ce qui est déjà
  // parti ce mois-ci.
  it('dit ce qui est déjà versé, et ce qui manque au besoin', () => {
    render(<FluxCard flux={FLUX} periode="août 2026" {...RIEN} dejaVerse={euros(800)} besoinMensuel={euros(2300)} />);
    expect(screen.getByText(/Déjà versé/).textContent).toMatch(/il manque 1\s*500/u);
  });
});

