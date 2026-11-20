/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Client, type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Obligations } from './Obligations';

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
  render(<Obligations />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Déclaration européenne de services (DES)' }));
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
    // Le dixième jour ouvrable d'août 2026, et non le 10 : CGI ann. III art. 96 N.
    expect(screen.getByText('À déposer au plus tard le').nextSibling?.textContent)
      .toMatch(/12 août 2026/);
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
    render(<Obligations />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: 'Déclaration européenne de services (DES)' }));

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
    // Émise en juillet, limite au 12 août, on est le 5 : rien n'est en retard.
    // Dans le panneau : la légende de la frise, derrière, dit « ▲ en retard »
    // — un signe à reconnaître, pas un retard annoncé.
    expect(within(screen.getByRole('dialog')).queryByText(/en retard/)).toBeNull();
  });
});

/**
 * « DÉPOSÉE LE … » (schéma 25).
 *
 * Sans ce geste, rien ne disait qu'une DES avait été déposée : le bandeau
 * annonçait 1 500 € d'amende à qui avait déposé mai et juin à l'heure. Le
 * geste éteint le retard et l'amende ; la date se corrige, jamais vers
 * demain ; il se défait.
 */
describe('dépôt de la déclaration', () => {
  const deuxMois = () => semer({
    clients: [client()],
    recettes: [
      recette({ id: 'a', emiseLe: dateISO('2026-05-10') }),
      recette({ id: 'b', emiseLe: dateISO('2026-06-10') })
    ]
  });

  it('marquer juin déposée retire juin du retard, et 750 € de l’amende', async () => {
    deuxMois();
    await ouvrirDes();
    const u = userEvent.setup();
    expect(screen.getByText(/déclaration.* en retard/).textContent)
      .toMatch(/^2 déclarations en retard, soit 1\s500\s€/u);

    await u.click(screen.getByRole('button', { name: 'Mois précédent' })); // juin
    // Dans le panneau : derrière lui, le dossier de la DES offre le même geste.
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Marquer déposée' }));

    expect(useFaits.getState().faits.periodesDeclarees)
      .toEqual([{ nature: 'des', periode: '2026-06', declareeLe: '2026-08-05' }]);
    // Le début du bandeau seulement : son aide cite « 750 € par déclaration »,
    // et une recherche sur tout le texte trouverait toujours 750.
    expect(screen.getByText(/déclaration.* en retard/).textContent)
      .toMatch(/^1 déclaration en retard, soit 750\s€/u);
    expect(screen.getByText('Déposée')).toBeTruthy();
  });

  it('corrige la date du dépôt, refuse une date future, et se défait', async () => {
    deuxMois();
    useFaits.setState({
      faits: {
        ...useFaits.getState().faits,
        periodesDeclarees: [{ nature: 'des', periode: '2026-06', declareeLe: null }]
      }
    });
    await ouvrirDes();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Mois précédent' }));
    const champ = screen.getByLabelText(/Date de dépôt de la DES de juin 2026/);
    // Vide : déposée, à une date non enregistrée — et elle ne compte pas en retard.
    expect((champ as HTMLInputElement).value).toBe('');

    fireEvent.change(champ, { target: { value: '2026-07-09' } });
    expect(useFaits.getState().faits.periodesDeclarees[0]?.declareeLe).toBe('2026-07-09');
    fireEvent.change(champ, { target: { value: '2026-09-01' } });
    expect(useFaits.getState().faits.periodesDeclarees[0]?.declareeLe).toBe('2026-07-09');

    await u.click(screen.getByRole('button', { name: 'Annuler le dépôt' }));
    expect(useFaits.getState().faits.periodesDeclarees).toEqual([]);
  });

  /* La douane n'ouvre le dépôt qu'au premier jour du mois suivant : marquer
     août déposé le 5 août éteindrait un retard qui n'a pas commencé. */
  it('ne propose pas de marquer déposé le mois en cours', async () => {
    semer({ clients: [client()], recettes: [recette({ emiseLe: dateISO('2026-08-03') })] });
    await ouvrirDes();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mois suivant' })); // août
    expect(screen.queryByRole('button', { name: 'Marquer déposée' })).toBeNull();
    expect(screen.getByText(/Mois en cours/)).toBeTruthy();
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
