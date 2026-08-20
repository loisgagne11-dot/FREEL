/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { dateISO, euros } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { ProjectionPanneau } from './Argent.projection';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-15T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
});

function semer(m: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...m } as Faits });
}

const recette = (id: string, montant: number, emiseLe: string) => ({
  id, clientNom: 'Client', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO(emiseLe), encaisseeLe: null,
  modeReglement: null, numero: id
});

/**
 * ON PROJETTE LE DISPONIBLE, PAS LE SOLDE.
 *
 * Projeter le solde obligerait à deviner quand chaque dette sortira du compte,
 * et la moitié d'entre elles n'a pas encore de date. Une courbe de solde monte
 * joliment jusqu'au trimestre où elle s'effondre — c'est exactement la courbe
 * qui fait se verser de l'argent qu'on doit.
 */
describe('projection du disponible', () => {
  it('annonce le versement mensuel en toutes lettres, avant les barres', () => {
    semer({ soldeInitial: euros(24_000) });
    render(<ProjectionPanneau />);

    expect(screen.getByText(/Tu peux te verser/)).toBeTruthy();
  });

  /** Deux scénarios, parce que la question en a deux. */
  it('montre les deux scénarios, avec et sans versement', () => {
    semer({ soldeInitial: euros(24_000) });
    render(<ProjectionPanneau />);

    // Deux fois chacun : la légende du graphe, et l'en-tête du tableau
    // accessible qui double la donnée.
    expect(screen.getAllByText('Sans versement').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/En me versant/).length).toBeGreaterThan(0);
  });

  /**
   * LE POINT QUI COMPTE. Une projection n'est vraie que de ses hypothèses.
   * Celles qui manquent sont NOMMÉES : une projection silencieusement
   * incomplète est plus dangereuse qu'une absence de projection.
   */
  it('dit que les dépenses courantes ne sont pas estimées, faute d’historique', () => {
    semer({ soldeInitial: euros(24_000) });
    render(<ProjectionPanneau />);

    expect(screen.getByText(/Dépenses courantes non estimées/)).toBeTruthy();
    expect(screen.getByText(/trop haute d’autant/)).toBeTruthy();
  });

  it('nomme les sources des encaissements attendus', () => {
    semer({ soldeInitial: euros(24_000) });
    render(<ProjectionPanneau />);

    expect(screen.getByText(/Aucune tendance devinée/)).toBeTruthy();
  });

  /**
   * Une facture émise et non réglée est un FAIT : le document est parti, la
   * somme est due. Elle doit remonter la projection.
   */
  it('compte les factures émises non réglées', () => {
    semer({ soldeInitial: euros(0) });
    render(<ProjectionPanneau />);
    const sans = screen.getByText(/Dans un an/).textContent ?? '';

    cleanup();
    semer({ soldeInitial: euros(0), recettes: [recette('r', 12_000, '2026-09-01')] });
    render(<ProjectionPanneau />);
    const avec = screen.getByText(/Dans un an/).textContent ?? '';

    expect(avec).not.toBe(sans);
  });

  /**
   * LE POINT QUI COMPTE SUR LE VERSEMENT. La contrainte porte sur CHAQUE mois,
   * pas sur la moyenne : un premier mois creux limite tout, même si l'année
   * finit bien. C'est voulu — se verser ce que la moyenne autorise conduit à
   * ne plus pouvoir payer l'URSSAF au premier trimestre.
   */
  it('n’ajoute d’un encaissement que sa part nette de charges', () => {
    semer({ soldeInitial: euros(0), recettes: [recette('r', 10_000, '2026-09-01')] });
    render(<ProjectionPanneau />);

    // 10 000 € encaissés n'ajoutent pas 10 000 € de disponible : un quart part
    // en cotisations et impôt.
    expect(screen.getByText(/Dans un an/).textContent).not.toMatch(/10\s*000/u);
  });

  /**
   * Nommer le mois qui contraint évite la question « pourquoi si peu ? », qui
   * est la première qu'on se pose devant un versement décevant.
   */
  it('nomme le mois qui limite, quand il y en a un', () => {
    semer({ soldeInitial: euros(24_000) });
    render(<ProjectionPanneau />);

    expect(screen.getByText(/qui limite/)).toBeTruthy();
  });

  /** Zéro veut dire « rien, pour l'instant » — et c'est une réponse. */
  it('le dit quand rien n’est versable', () => {
    semer({ soldeInitial: euros(0), reserve: euros(5000) });
    render(<ProjectionPanneau />);

    expect(screen.getByText(/Rien pour l’instant/)).toBeTruthy();
  });

  /** Les versements passés viennent du relevé, jamais d'une saisie. */
  it('confronte ce qui a été versé au soutenable', () => {
    semer({ soldeInitial: euros(24_000) });
    render(<ProjectionPanneau />);

    const carte = screen.getByText(/Ce que tu t’es versé/).closest('section');
    const dans = within(carte as HTMLElement);
    expect(dans.getAllByText('Versé').length).toBeGreaterThan(0);
    expect(dans.getAllByText('Soutenable').length).toBeGreaterThan(0);
  });

  /** Chaque montant reste masquable : une projection dit tout du chiffre d'affaires. */
  it('rend les montants masquables', () => {
    semer({ soldeInitial: euros(24_000) });
    render(<ProjectionPanneau />);

    const phrase = screen.getByText(/Tu peux te verser/);
    expect(phrase.querySelector('[data-montant]')).toBeTruthy();
  });
});
