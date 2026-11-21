/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Tresorerie } from './Tresorerie';

afterEach(() => { cleanup(); vi.useRealTimers(); window.location.hash = ''; });
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  window.location.hash = '#/tresorerie/annee';
});

const recette = (id: string, le: string, montant = 3_000) => ({
  id, clientNom: 'Client d’essai', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO(le), encaisseeLe: dateISO(le), modeReglement: 'virement' as const, numero: id
});

function poser(m: Partial<Faits> = {}): void {
  useFaits.setState({
    faits: {
      ...faitsVides(), soldeInitial: euros(10_000), soldeInitialAu: dateISO('2025-01-01'),
      recettes: [recette('r1', '2026-03-10')], ...m
    } as Faits
  });
}

const capacite = async () =>
  (await screen.findByRole('heading', { name: 'Ce que chaque mois te permettait de te verser' })).closest('section') as HTMLElement;

/**
 * LA VUE ANNÉE : ON Y RELIT LE PASSÉ (lot 49) — et la capacité de versement y
 * vit, le versé lu à l'intérieur de la barre de capacité.
 */
describe('la vue Année', () => {
  it('porte les douze mois de l’année, même vides', async () => {
    poser();
    render(<Tresorerie annee={2026} />);
    const carte = await capacite();
    expect(within(carte).getByText('janv.')).toBeTruthy();
    expect(within(carte).getByText('déc.')).toBeTruthy();
  });

  /* `capaciteDuMois` rend `verse: null` sur un mois à venir — jamais zéro, qui serait un constat. */
  it('ne prête aucun versé à un mois à venir', async () => {
    poser();
    render(<Tresorerie annee={2026} />);
    const carte = await capacite();
    expect(within(carte).getByText('sept.').textContent).not.toContain('versés');
  });

  /*
   * Six mois à « −0,1 k€ » ne sont pas un diagnostic : un mois à venir où rien
   * n'est attendu s'abstient, et sa colonne reste en place.
   */
  it('s’abstient sur un mois à venir où rien n’est attendu, plutôt que d’afficher un négatif', async () => {
    poser();
    render(<Tresorerie annee={2026} />);
    const carte = await capacite();
    expect(within(carte).getByText('sept.').textContent).toMatch(/Rien n’est encore attendu/);
    expect(within(carte).getByText('déc.')).toBeTruthy();
  });

  it('signale qu’aucun relevé n’est importé plutôt que de laisser lire zéro', async () => {
    poser();
    render(<Tresorerie annee={2026} />);
    const carte = await capacite();
    expect(within(carte).getByText(/le versé est/).textContent).toContain('inconnu');
  });

  /*
   * LE VERSÉ SE LIT DANS LA BARRE DE CAPACITÉ (leçon du handoff) : deux
   * barres côte à côte laissent faire la comparaison de tête.
   */
  it('dessine le versé à l’intérieur de la barre de capacité', async () => {
    poser({
      mouvementsBancaires: [{
        id: 'v1', date: dateISO('2026-03-20'), libelle: 'VIR PERSO DEMO', montant: euros(-1_000),
        rapprocheAvec: null, sansContrepartie: 'remuneration', ignoree: false
      }]
    });
    const { container } = render(<Tresorerie annee={2026} />);
    await capacite();
    const verses = container.querySelectorAll('[class*="barreVerse"]');
    expect(verses).toHaveLength(1);
    expect(verses[0]?.parentElement?.className).toMatch(/barreCapacite/);
  });

  it('relit l’année dite, et passe à l’année d’avant', async () => {
    poser({ recettes: [recette('r0', '2025-04-10'), recette('r1', '2026-03-10')] });
    const onAnnee = vi.fn();
    render(<Tresorerie annee={2026} onAnnee={onAnnee} />);
    expect(await screen.findByRole('heading', { name: 'Ton disponible en 2026' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '‹ 2025' }));
    expect(onAnnee).toHaveBeenCalledWith(2025);
  });

  it('dit d’une année passée qu’elle est constatée en entier', async () => {
    poser({ recettes: [recette('r0', '2025-04-10')] });
    render(<Tresorerie annee={2025} />);
    await screen.findByRole('heading', { name: 'Ton disponible en 2025' });
    expect(screen.getByRole('img', { name: /^Ton disponible de janvier 2025 à décembre 2025, constaté/ })).toBeTruthy();
  });
});
