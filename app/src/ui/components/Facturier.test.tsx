/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Client, type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { FournisseurToasts } from './Toasts';
import { Facturier } from './Facturier';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-13T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

const CLIENT: Client = {
  id: 'c1', nom: 'Client France', adresse: '2 rue Exemple', siret: '',
  email: '', delaiPaiementJours: 30, pays: 'FR', tvaIntracom: ''
};

const recette = (p: Partial<Recette> & { readonly id: string }): Recette => ({
  clientNom: 'Client France',
  libelle: 'Prestation',
  montant: euros(1000),
  emiseLe: dateISO('2026-08-01'),
  encaisseeLe: null,
  modeReglement: null,
  numero: '2026-001',
  ...p
});

function semer(recettes: readonly Recette[], reste: Partial<Faits> = {}): void {
  useFaits.setState({
    faits: { ...faitsVides(), clients: [CLIENT], recettes, ...reste }
  });
}

const rendre = () => render(
  <FournisseurToasts><Facturier onNouvelle={() => { /* testé ailleurs */ }} /></FournisseurToasts>
);

/**
 * LE TROU QUE CET ÉCRAN BOUCHE.
 *
 * `encaisserRecette` existait dans le magasin depuis le début et AUCUN écran
 * ne l'appelait : une facture émise ne pouvait jamais passer en encaissée. Le
 * chiffre d'affaires encaissé restait donc figé, et les provisions calculées
 * dessus étaient fausses. Ce test est le garde-fou de ce câblage.
 */
describe('enregistrer un règlement', () => {
  it('porte la facture au livre avec sa date et son mode', async () => {
    semer([recette({ id: 'r1' })]);
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer le règlement' }));
    await utilisateur.clear(screen.getByLabelText('Date d’encaissement'));
    await utilisateur.type(screen.getByLabelText('Date d’encaissement'), '2026-08-12');
    await utilisateur.selectOptions(screen.getByLabelText('Mode de règlement'), 'virement');
    await utilisateur.click(screen.getByRole('button', { name: 'Porter au livre des recettes' }));

    const r = useFaits.getState().faits.recettes[0];
    expect(r?.encaisseeLe).toBe('2026-08-12');
    expect(r?.modeReglement).toBe('virement');
  });

  // Le mode de règlement est une mention obligatoire du livre : le panneau
  // existe précisément pour qu'on ne puisse pas encaisser sans le donner.
  it('exige la date ET le mode, donc un panneau et non une case à cocher', async () => {
    semer([recette({ id: 'r1' })]);
    rendre();
    await userEvent.setup().click(
      screen.getByRole('button', { name: 'Enregistrer le règlement' })
    );

    expect(screen.getByLabelText('Date d’encaissement')).toBeTruthy();
    expect(screen.getByLabelText('Mode de règlement')).toBeTruthy();
  });

  it('ne propose pas d’encaisser une facture déjà réglée', () => {
    semer([recette({ id: 'r1', encaisseeLe: dateISO('2026-08-05'), modeReglement: 'virement' })]);
    rendre();
    expect(screen.queryByRole('button', { name: 'Enregistrer le règlement' })).toBeNull();
  });
});

describe('états affichés', () => {
  it('montre le retard en jours, pas seulement une étiquette', () => {
    // Émise le 1er juin, échéance à 30 jours, on est le 13 août.
    semer([recette({ id: 'r1', emiseLe: dateISO('2026-06-01') })]);
    rendre();
    expect(screen.getByText(/43 jours de retard/)).toBeTruthy();
  });

  it('range un brouillon à part, sans échéance', () => {
    semer([recette({ id: 'r1', emiseLe: null, numero: '' })]);
    rendre();
    expect(screen.getByText('Brouillon')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Supprimer le brouillon' })).toBeTruthy();
  });

  /**
   * Une facture émise a circulé : retirer son numéro laisserait un trou que le
   * contrôle lit comme une facture escamotée. Elle s'annule par un avoir.
   */
  it('n’offre pas de supprimer une facture émise', () => {
    semer([recette({ id: 'r1' })]);
    rendre();
    expect(screen.queryByRole('button', { name: 'Supprimer le brouillon' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Annuler par un avoir' })).toBeTruthy();
  });
});

describe('filtres', () => {
  const jeu = [
    recette({ id: 'r1', numero: '2026-001' }),
    recette({ id: 'r2', numero: '2026-002', emiseLe: dateISO('2026-06-01') }),
    recette({
      id: 'r3', numero: '2026-003',
      encaisseeLe: dateISO('2026-08-05'), modeReglement: 'virement'
    }),
    recette({ id: 'r4', numero: '', emiseLe: null })
  ];

  it('compte chaque état sur la pastille du filtre', () => {
    semer(jeu);
    rendre();
    const groupe = screen.getByRole('group', { name: 'Filtrer par état' });
    expect(within(groupe).getByRole('button', { name: /^En retard/ }).textContent).toContain('1');
    expect(within(groupe).getByRole('button', { name: /^Encaissées/ }).textContent).toContain('1');
    expect(within(groupe).getByRole('button', { name: /^Brouillons/ }).textContent).toContain('1');
  });

  it('ne laisse que l’état demandé', async () => {
    semer(jeu);
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: /^Brouillons/ }));

    expect(screen.getByText('Brouillon')).toBeTruthy();
    expect(screen.queryByText('Encaissée')).toBeNull();
  });
});

/**
 * Le brouillon n'a pas de date d'émission : le filtrer sur la période le
 * ferait disparaître partout. Or il retient un numéro — c'est justement celui
 * qu'il ne faut pas oublier.
 */
it('garde les brouillons visibles quelle que soit la période', () => {
  semer([recette({ id: 'r1', emiseLe: null, numero: '' })]);
  rendre();
  expect(screen.getByText('Brouillon')).toBeTruthy();
});

it('totalise ce qui reste à rentrer, hors factures réglées', () => {
  semer([
    recette({ id: 'r1', montant: euros(1000) }),
    recette({
      id: 'r2', montant: euros(5000),
      encaisseeLe: dateISO('2026-08-05'), modeReglement: 'virement'
    })
  ]);
  rendre();
  const tuile = screen.getByText('Reste à rentrer').closest('div') as HTMLElement;
  expect(tuile.textContent).toContain('1');
  expect(tuile.textContent).not.toContain('6');
});
