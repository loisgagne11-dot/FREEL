/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type Faits, entrepriseVide, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Pilote, salutation } from './Pilote';
import { mois } from '../../domain/types';
import { ATraiter } from './Pilote.decisions';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
});

function semer(modif: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...modif } });
}

/**
 * « BONJOUR CAMILLE — DEUX DÉCISIONS T'ATTENDENT. »
 *
 * Le Pilote saluait l'ENTREPRISE (« Bonjour Atelier de démonstration ») et
 * comptait ses décisions dans une seconde phrase. Le prénom vient de
 * Réglages, jamais du code : le dépôt est public.
 */
describe('la salutation', () => {
  it('nomme la personne et dit combien de décisions l’attendent, en lettres', () => {
    expect(salutation('Camille', 2)).toBe('Bonjour Camille — deux décisions t’attendent.');
    expect(salutation('Camille', 1)).toBe('Bonjour Camille — une décision t’attend.');
  });

  it('salue sans nommer tant que le prénom manque, plutôt que de saluer l’entreprise', () => {
    expect(salutation('  ', 0)).toBe('Bonjour — rien ne réclame ton attention.');
  });

  it('passe aux chiffres au-delà de dix', () => {
    expect(salutation('Camille', 12)).toBe('Bonjour Camille — 12 décisions t’attendent.');
  });

  it('lit le prénom saisi en Réglages', async () => {
    semer({ entreprise: { ...entrepriseVide(), nom: 'Atelier', prenom: 'Camille' } });
    render(<Pilote />);
    // Le calcul des sujets arrive après le premier rendu : la phrase complète
    // n'existe qu'ensuite.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent)
      .toMatch(/^Bonjour Camille — /));
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toMatch(/Atelier/);
  });

  /**
   * INCONNU N'EST PAS ZÉRO.
   *
   * Le calcul des sujets voyage à part. Tant qu'il n'est pas là, dire « rien ne
   * réclame ton attention » ferait croire à un dossier en retard que tout va
   * bien — le sens dangereux de l'erreur. Si cette règle sautait, la
   * salutation et la carte des décisions annonceraient le calme pendant le
   * chargement.
   */
  it('ne dit pas que rien ne réclame d’attention tant que les sujets sont inconnus', () => {
    expect(salutation('Camille', null)).toBe('Bonjour Camille.');
    expect(salutation('Camille', null)).not.toMatch(/rien ne réclame/);

    render(<ATraiter sujets={null} />);
    expect(screen.queryByText(/Rien ne réclame ton attention/)).toBeNull();
    expect(screen.getByRole('heading', { name: /Décisions du jour/ })).toBeTruthy();
  });

  it('dit que rien ne réclame d’attention quand la liste est connue et vide', () => {
    render(<ATraiter sujets={[]} />);
    expect(screen.getByText(/Rien ne réclame ton attention/)).toBeTruthy();
  });
});

/**
 * SANS DOUBLONS.
 *
 * Le versable avait sa carte ET sa colonne ; quatre tuiles répétaient
 * l'en-tête de l'écran Argent ; « Ce que je dois » répétait la colonne
 * Sorties. Le handoff : le flux, la santé, les décisions.
 */
describe('la composition du Pilote', () => {
  it('ne répète plus le versable, les tuiles d’Argent ni « Ce que je dois »', () => {
    semer();
    render(<Pilote />);
    expect(screen.queryByRole('heading', { name: 'Je peux me verser' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ce que je dois' })).toBeNull();
    expect(screen.queryByText('Seuil de sécurité')).toBeNull();
    expect(screen.queryByText('À garder de côté')).toBeNull();
  });

  it('montre le flux, la santé, puis les décisions du jour', async () => {
    semer();
    render(<Pilote />);
    const titres = async () => (await screen.findAllByRole('heading', { level: 2 }))
      .map((h) => h.textContent ?? '');
    await screen.findByRole('heading', { name: /Décisions du jour/ });
    const ordre = (await titres()).map((t) =>
      (t.startsWith('Le flux du mois') ? 'flux' : t.startsWith('Santé') ? 'santé'
        : t.startsWith('Décisions du jour') ? 'décisions' : 'autre'))
      .filter((t) => t !== 'autre');
    expect(ordre).toEqual(['flux', 'santé', 'décisions']);
  });
});

/**
 * LE FLUX SUIT LE MOIS DE LA BARRE ; LA SANTÉ ET LES DÉCISIONS, NON.
 *
 * Un mois passé se lit en constat, sans versable : le versable du jour
 * affiché sous « mai 2026 » serait un montant qu'on ne pouvait pas se verser.
 */
describe('un autre mois', () => {
  it('montre le flux de ce mois-là, sans versable, et ramène au mois courant', async () => {
    semer();
    const onMois = vi.fn();
    render(<Pilote mois={mois('2026-05')} onMois={onMois} />);

    expect(await screen.findByRole('heading', { name: /Le flux du mois · mai 2026/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Verser sur mon compte' })).toBeNull();
    // La santé reste celle d'aujourd'hui.
    expect(screen.getByRole('heading', { name: /Santé/ })).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Revenir à juin 2026' })[0]!);
    expect(onMois).toHaveBeenCalledWith('2026-06');
  });
});

/**
 * LE GESTE DU QUOTIDIEN, DEPUIS LE PILOTE.
 *
 * Un virement arrive : la pastille de la facture dans « Le flux du mois »
 * ouvre son pointage, et le flux suit dès la confirmation — sans passer par
 * le facturier.
 */
describe('pointer un encaissement', () => {
  const impayee = {
    id: 'impayee', clientNom: 'Client démo', libelle: 'Prestation', montant: 1500,
    emiseLe: '2026-04-02', encaisseeLe: null, modeReglement: null,
    numero: '2026-001', echeanceLe: '2026-05-02'
  } as unknown as Faits['recettes'][number];

  it('ouvre le panneau depuis la pastille en retard, et le flux suit le pointage', async () => {
    semer({ recettes: [impayee] });
    render(<Pilote />);
    const entrees = screen.getByText('Entrées').parentElement as HTMLElement;
    expect(entrees.querySelector('p')?.textContent).toMatch(/1\s*500.*en attente/u);

    fireEvent.click(screen.getByRole('button', { name: /Client démo.*en retard.*pointer l’encaissement/ }));
    const panneau = await screen.findByRole('dialog', { name: /Encaissements/ });

    fireEvent.click(within(panneau).getByRole('button', { name: 'Confirmer le règlement' }));

    expect(useFaits.getState().faits.recettes[0]?.encaisseeLe).toBe('2026-06-10');
    expect(entrees.querySelector('p')?.textContent).toMatch(/rien en attente/);
  });

  /** L'action rapide et « + Nouveau » ouvrent le panneau de n'importe où. */
  it('s’ouvre par son adresse, qui redevient celle du Pilote', async () => {
    semer({ recettes: [impayee] });
    window.location.hash = '#/pilote/encaissements';
    render(<Pilote />);
    expect(await screen.findByRole('dialog', { name: /Encaissements/ })).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#/pilote'));
  });
});
