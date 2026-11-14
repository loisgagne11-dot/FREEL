/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros, ratio } from '../../domain/types';
import { type Client, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { emettreBrouillon, enregistrerBrouillon } from '../../state/ecritures.recettes';
import { brouillonEnregistreDeLaSousRoute, sousRouteDuBrouillonEnregistre } from '../adresseBrouillon';
import { Facture } from './Facture';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const ENTREPRISE = {
  ...faitsVides().entreprise,
  nom: 'Mon Entreprise', siret: '00000000000000',
  adresse: '1 rue Exemple', codePostal: '75001', ville: 'Paris'
};
const CLIENT: Client = {
  id: 'c1', nom: 'Client France', adresse: '2 rue Exemple', siret: '',
  email: '', delaiPaiement: 'net_30', pays: 'FR', tvaIntracom: ''
};
const EMISE: Recette = {
  id: 'r-emise', clientNom: 'Client France', libelle: 'Juin', montant: euros(1000),
  emiseLe: dateISO('2026-06-30'), encaisseeLe: null, modeReglement: null, numero: '2026-001'
};

beforeEach(() => {
  window.location.hash = '';
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-07-15T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: { ...faitsVides(), entreprise: ENTREPRISE, clients: [CLIENT], recettes: [EMISE] } });
});

const recettes = (): readonly Recette[] => useFaits.getState().faits.recettes;
const LIGNE = { designation: 'Développement', quantite: 10, prixUnitaireHt: euros(400), tauxTva: ratio(0) };

/**
 * Un brouillon ne réserve PAS de numéro (lot 29) : réservé, il laissait un
 * trou s'il était abandonné, et rompait la chronologie s'il était émis après
 * une facture plus récente.
 */
describe('écritures du brouillon', () => {
  it('enregistre sans numéro ni date, et remplace au second enregistrement', () => {
    const r = enregistrerBrouillon(null, { clientNom: 'Client France', libelle: 'A', montant: euros(100), tvaCollectee: euros(0), lignes: [LIGNE] });
    if (!('id' in r)) throw new Error(r.motif);
    expect(recettes().find((x) => x.id === r.id)).toMatchObject({ numero: '', emiseLe: null, lignes: [LIGNE] });
    enregistrerBrouillon(r.id, { clientNom: 'Client France', libelle: 'B', montant: euros(200), tvaCollectee: euros(0), lignes: [] });
    expect(recettes().filter((x) => x.emiseLe === null)).toHaveLength(1);
    expect(recettes().find((x) => x.id === r.id)?.libelle).toBe('B');
  });

  it('ne réécrit jamais une facture émise en brouillon', () => {
    expect(enregistrerBrouillon('r-emise', { clientNom: 'X', libelle: 'X', montant: euros(1), tvaCollectee: null, lignes: [] }))
      .toEqual({ motif: expect.stringMatching(/déjà été émise/) });
    expect(recettes().find((x) => x.id === 'r-emise')?.libelle).toBe('Juin');
  });

  /** Ajouter puis supprimer perdrait la pièce jointe, et compterait la facture deux fois entre les deux. */
  it('émet le brouillon sous son identifiant, pièce jointe comprise, avec le numéro suivant', () => {
    const r = enregistrerBrouillon(null, { clientNom: 'Client France', libelle: 'A', montant: euros(100), tvaCollectee: euros(0), lignes: [LIGNE] });
    if (!('id' in r)) throw new Error(r.motif);
    useFaits.setState({ faits: { ...useFaits.getState().faits, recettes: recettes().map((x) => (x.id === r.id ? { ...x, justificatifId: 'piece-1' } : x)) } });
    expect(emettreBrouillon(r.id, { clientNom: 'Client France', libelle: 'A', montant: euros(100), emiseLe: dateISO('2026-07-15'), encaisseeLe: null, modeReglement: null })).toBeNull();
    expect(recettes()).toHaveLength(2);
    expect(recettes().find((x) => x.id === r.id)).toMatchObject({ numero: '2026-002', emiseLe: '2026-07-15', justificatifId: 'piece-1' });
    expect(emettreBrouillon(r.id, { clientNom: 'X', libelle: 'X', montant: euros(1), emiseLe: dateISO('2026-07-16'), encaisseeLe: null, modeReglement: null }))
      .toMatch(/déjà été émis/);
  });

  it('l’adresse d’un brouillon enregistré fait l’aller-retour, et ne se confond pas avec un numéro', () => {
    expect(brouillonEnregistreDeLaSousRoute(sousRouteDuBrouillonEnregistre('rec-a b'))).toBe('rec-a b');
    expect(brouillonEnregistreDeLaSousRoute('2026-001')).toBeNull();
    expect(brouillonEnregistreDeLaSousRoute('reprendre:')).toBeNull();
  });
});

describe('« Enregistrer en brouillon » dans la rédaction', () => {
  async function rediger(hash = '#/facture/nouvelle') {
    window.location.hash = hash;
    render(<Facture />);
    await screen.findByLabelText('Client');
    return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  }

  it('ne s’offre pas sur une page vierge, puis garde la saisie sans la numéroter', async () => {
    const u = await rediger();
    expect((screen.getByRole('button', { name: 'Enregistrer en brouillon' }) as HTMLButtonElement).disabled).toBe(true);
    await u.type(screen.getByLabelText('Client'), 'Client France');
    await u.type(screen.getByLabelText('Désignation'), 'Audit');
    await u.click(screen.getByRole('button', { name: 'Enregistrer en brouillon' }));

    expect(await screen.findByText(/Brouillon enregistré, sans numéro/)).toBeTruthy();
    const brouillons = recettes().filter((r) => r.emiseLe === null);
    expect(brouillons).toHaveLength(1);
    expect(brouillons[0]).toMatchObject({ numero: '', clientNom: 'Client France', lignes: [expect.objectContaining({ designation: 'Audit' })] });

    // Le second enregistrement remplace : un brouillon, pas deux.
    await u.type(screen.getByLabelText('Désignation'), ' de sécurité');
    await u.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(recettes().filter((r) => r.emiseLe === null)).toHaveLength(1);
    expect(recettes().find((r) => r.emiseLe === null)?.lignes?.[0]?.designation).toBe('Audit de sécurité');
  });

  it('se rouvre avec ses lignes, et s’émet sous son identifiant', async () => {
    const r = enregistrerBrouillon(null, {
      clientNom: 'Client France', libelle: 'Développement', montant: euros(4000), tvaCollectee: euros(0), lignes: [LIGNE]
    });
    if (!('id' in r)) throw new Error(r.motif);
    const u = await rediger(`#/facture/${sousRouteDuBrouillonEnregistre(r.id)}`);

    expect(screen.getByRole('heading', { name: 'Brouillon de facture' })).toBeTruthy();
    expect((screen.getByLabelText('Client') as HTMLInputElement).value).toBe('Client France');
    expect((screen.getByLabelText('Désignation') as HTMLInputElement).value).toBe('Développement');
    await u.click(screen.getByRole('button', { name: 'Émettre la facture' }));

    await screen.findByRole('heading', { name: /Facture 2026-002/ });
    expect(recettes()).toHaveLength(2);
    expect(recettes().find((x) => x.id === r.id)).toMatchObject({ numero: '2026-002', emiseLe: '2026-07-15', montant: 4000 });
  });

  /** Un brouillon numéroté avant le lot 29 a réservé son numéro : émis sous le suivant, il laisserait un trou. */
  it('un brouillon déjà numéroté s’émet sous SON numéro', async () => {
    useFaits.setState({ faits: { ...useFaits.getState().faits, recettes: [...recettes(), {
      id: 'r-ancien', clientNom: 'Client France', libelle: 'Cadrage', montant: euros(600),
      emiseLe: null, encaisseeLe: null, modeReglement: null, numero: '2026-002', lignes: [LIGNE]
    }, { ...EMISE, id: 'r-apres', numero: '2026-003' }] } });
    const u = await rediger(`#/facture/${sousRouteDuBrouillonEnregistre('r-ancien')}`);
    await u.click(screen.getByRole('button', { name: 'Émettre la facture' }));
    await screen.findByRole('heading', { name: /Facture 2026-002/ });
    expect(recettes().find((x) => x.id === 'r-ancien')?.numero).toBe('2026-002');
  });

  it('un brouillon qui n’existe plus le dit, et repart d’une page vierge', async () => {
    await rediger(`#/facture/${sousRouteDuBrouillonEnregistre('rec-disparu')}`);
    expect(screen.getByText(/Ce brouillon n’existe plus/)).toBeTruthy();
    expect((screen.getByLabelText('Client') as HTMLInputElement).value).toBe('');
  });
});

/**
 * La référence de commande (lot 46) : portée par la mission, reprise sur la
 * facture, figée à l'émission.
 */
describe('référence de commande', () => {
  it('se saisit, s’imprime et se fige sur la recette émise', async () => {
    window.location.hash = '#/facture/nouvelle';
    render(<Facture />);
    await screen.findByLabelText('Client');
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await u.type(screen.getByLabelText('Client'), 'Client France');
    await u.type(screen.getByLabelText('Référence de commande'), 'BC-DEMO-42');
    await u.type(screen.getByLabelText('Désignation'), 'Audit');
    const pu = screen.getByLabelText('Prix unitaire HT');
    await u.clear(pu);
    await u.type(pu, '500');
    expect(screen.getByRole('article').textContent).toMatch(/Référence de commande BC-DEMO-42/);
    await u.click(screen.getByRole('button', { name: 'Émettre la facture' }));
    await screen.findByRole('heading', { name: /Facture 2026-002/ });
    expect(recettes().find((r) => r.numero === '2026-002')?.referenceCommande).toBe('BC-DEMO-42');
  });
});
