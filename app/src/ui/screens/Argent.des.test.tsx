/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Client, type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Argent } from './Argent';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // L'écran s'ouvre sur le mois précédent : celui dont la déclaration est due.
  vi.setSystemTime(new Date('2026-08-05T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
});

const client = (m: Partial<Client> = {}): Client => ({
  id: 'c1', nom: 'ClientDE', adresse: '', siret: '', email: '',
  delaiPaiement: 'net_30', pays: 'DE', tvaIntracom: 'DE123456789', ...m
});

const recette = (m: Partial<Recette> = {}): Recette => ({
  id: 'r1', clientNom: 'ClientDE', libelle: 'Prestation', montant: euros(4000),
  emiseLe: dateISO('2026-07-15'), encaisseeLe: null, modeReglement: null,
  numero: '2026-001', ...m
});

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...modifications } });
}

/**
 * L'onglet DES est chargé à la demande : on attend que son module soit arrivé
 * avant d'interroger le contenu. Sans cette attente, la première assertion
 * tomberait sur le « Chargement… » du Suspense.
 */
async function ouvrirDes() {
  render(<Argent />);
  await userEvent.setup().click(screen.getByRole('tab', { name: 'DES' }));
  await screen.findByRole('heading', { name: /Prestations à déclarer/ });
}

describe('prestations à déclarer', () => {
  it('liste la prestation vendue dans l’Union, avec le numéro de TVA du preneur', async () => {
    semer({ clients: [client()], recettes: [recette()] });
    await ouvrirDes();

    expect(screen.getByText('DE123456789')).toBeTruthy();
    // L'espace des milliers est une insécable étroite, posée par l'API
    // d'internationalisation : la comparer à une espace ordinaire ferait
    // échouer un affichage pourtant correct.
    expect(screen.getByText('Total à déclarer').nextSibling?.textContent).toMatch(/4\s000/u);
    expect(screen.getByText('À déposer avant le').nextSibling?.textContent)
      .toMatch(/10 août 2026/);
  });

  // La DES est due par le vendeur : un achat à un prestataire étranger relève
  // de l'autoliquidation, pas de la DES.
  it('ne déclare rien pour un client français', async () => {
    semer({
      clients: [client({ nom: 'ClientFR', pays: 'FR', tvaIntracom: '' })],
      recettes: [recette({ clientNom: 'ClientFR' })]
    });
    await ouvrirDes();
    expect(screen.getByText(/Aucune prestation intracommunautaire/)).toBeTruthy();
  });

  it('ne déclare rien pour un client hors Union', async () => {
    semer({
      clients: [client({ nom: 'ClientCH', pays: 'CH', tvaIntracom: '' })],
      recettes: [recette({ clientNom: 'ClientCH' })]
    });
    await ouvrirDes();
    expect(screen.getByText(/Aucune prestation intracommunautaire/)).toBeTruthy();
  });

  // Une déclaration inexacte est sanctionnée comme une déclaration absente.
  it('bloque une ligne dont le numéro de TVA manque, et dit pourquoi', async () => {
    semer({
      clients: [client({ tvaIntracom: '' })],
      recettes: [recette()]
    });
    await ouvrirDes();
    expect(screen.getByText(/numéro de TVA intracommunautaire n’est pas renseigné/)).toBeTruthy();
    expect(screen.getByText('Total à déclarer').nextSibling?.textContent).toMatch(/^0/);
  });

  // Le livre des recettes s'écrit à l'encaissement ; la DES suit l'émission.
  it('retient le mois d’émission, et le dit', async () => {
    semer({
      clients: [client()],
      recettes: [recette({ emiseLe: dateISO('2026-07-15'), encaisseeLe: dateISO('2026-09-01') })]
    });
    await ouvrirDes();
    expect(screen.getByText(/les deux registres ne coïncident donc pas/)).toBeTruthy();
  });

  it('permet de consulter un autre mois', async () => {
    semer({
      clients: [client()],
      recettes: [recette({ emiseLe: dateISO('2026-06-10') })]
    });
    render(<Argent />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('tab', { name: 'DES' }));

    expect(screen.getByText(/Aucune prestation intracommunautaire/)).toBeTruthy();
    await utilisateur.click(screen.getByRole('button', { name: 'Mois précédent' }));
    expect(screen.getByText('DE123456789')).toBeTruthy();
  });
});

describe('retards', () => {
  // L'amende est forfaitaire : le montant en jeu ne dépend pas du chiffre
  // d'affaires mais du nombre de mois oubliés.
  it('chiffre l’amende encourue', async () => {
    semer({
      clients: [client()],
      recettes: [
        recette({ id: 'a', emiseLe: dateISO('2026-05-10') }),
        recette({ id: 'b', emiseLe: dateISO('2026-06-10') })
      ]
    });
    await ouvrirDes();
    const bandeau = screen.getByText(/déclaration.* en retard/);
    expect(bandeau.textContent).toMatch(/1\s500/u);
  });

  it('n’annonce aucun retard quand tout est dans les temps', async () => {
    semer({ clients: [client()], recettes: [recette()] });
    await ouvrirDes();
    // Émise en juillet, limite au 10 août, on est le 5 : rien n'est en retard.
    expect(screen.queryByText(/en retard/)).toBeNull();
  });
});

describe('numéro de TVA de l’entreprise', () => {
  // Il en faut un pour déposer, y compris en franchise en base.
  it('signale son absence quand une déclaration est due', async () => {
    semer({ clients: [client()], recettes: [recette()] });
    await ouvrirDes();
    expect(screen.getByText(/pas de numéro de TVA intracommunautaire/)).toBeTruthy();
  });

  it('ne le réclame pas quand aucune déclaration n’est due', async () => {
    await ouvrirDes();
    expect(screen.queryByText(/pas de numéro de TVA intracommunautaire/)).toBeNull();
  });
});
