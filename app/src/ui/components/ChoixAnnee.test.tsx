/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { dateISO, euros } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { ChoixAnnee } from './ChoixAnnee';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
});

/** Une facture par année, pour que le sélecteur ait plus d'un choix à offrir. */
const recette = (id: string, annee: number): Faits['recettes'][number] => ({
  id,
  clientNom: 'Client de démonstration',
  libelle: 'prestation',
  montant: euros(1_000),
  emiseLe: dateISO(`${annee}-03-10`),
  encaisseeLe: dateISO(`${annee}-04-10`),
  modeReglement: 'virement',
  numero: `F-${id}`,
  tvaCollectee: euros(0)
});

function semer(annees: readonly number[]): void {
  useFaits.setState({
    faits: { ...faitsVides(), recettes: annees.map((a) => recette(String(a), a)) } as Faits
  });
}

/**
 * L'ANNÉE D'UN ÉCRAN SE BORNE AUX FAITS DU DOSSIER.
 *
 * Elle vivait dans la barre du haut avec le mois ; elle vit depuis le lot 51
 * dans l'en-tête des écrans qui raisonnent à l'année. Ce qu'elle doit tenir ne
 * change pas : proposer les années qui ont quelque chose à montrer, et ne
 * jamais rester sur une année qui n'en a plus.
 */
describe('l’année d’un écran', () => {
  it('propose les années du dossier, jusqu’à l’année courante', () => {
    semer([2024, 2026]);
    render(<ChoixAnnee annee={2026} onAnnee={() => {}} />);
    const choix = screen.getByRole('combobox', { name: 'Année' });
    expect([...choix.querySelectorAll('option')].map((o) => o.textContent))
      .toEqual(['2024', '2025', '2026']);
  });

  /** Un menu à une seule entrée n'est pas un choix : il se masque. */
  it('se masque sur un dossier qui n’a qu’une année', () => {
    semer([]);
    render(<ChoixAnnee annee={2026} onAnnee={() => {}} />);
    expect(screen.queryByRole('combobox', { name: 'Année' })).toBeNull();
  });

  it('rend l’année choisie, en nombre', () => {
    semer([2025, 2026]);
    const onAnnee = vi.fn();
    render(<ChoixAnnee annee={2026} onAnnee={onAnnee} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Année' }), { target: { value: '2025' } });
    expect(onAnnee).toHaveBeenLastCalledWith(2025);
  });

  /**
   * Le mois est partagé entre les écrans, et ceux qui le portent au mois — le
   * Pilote, Activité — le mènent où l'on veut, y compris hors du dossier. En
   * arrivant sur un écran à l'année, un menu pointé sur une année absente de
   * ses options afficherait la première venue en laissant les chiffres sur une
   * autre : il retombe sur l'année courante.
   */
  it('retombe sur l’année courante quand l’année choisie sort du dossier', () => {
    semer([2025, 2026]);
    const onAnnee = vi.fn();
    render(<ChoixAnnee annee={2019} onAnnee={onAnnee} />);
    expect(onAnnee).toHaveBeenCalledWith(2026);
  });
});
