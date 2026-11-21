/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { dateISO, euros } from './domain/types';
import { CLE_STOCKAGE, type Faits, faitsVides } from './state/schema';
import { useFaits } from './state/store';
import { App } from './App';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(CLE_STOCKAGE, JSON.stringify(faitsVides()));
  window.location.hash = '#/tresorerie';
  useFaits.setState({ faits: faitsVides(), chargement: { phase: 'initial' }, saisiesEcartees: 0 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/**
 * L'ALERTE DE CONSERVATION SE LIT LÀ OÙ L'ON SAISIT.
 *
 * Si elle retournait sur le seul Pilote, un stockage saturé en cours de
 * session ne se verrait qu'en y revenant — après avoir saisi des factures qui
 * ne seront jamais enregistrées.
 */
describe('alerte de conservation', () => {
  it('s’affiche sur un autre écran que le Pilote', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    render(<App />);
    expect(await screen.findByText('Tes saisies ne sont pas conservées')).toBeTruthy();
  });

  it('signale une saisie écartée par un autre onglet', async () => {
    render(<App />);
    act(() => { useFaits.setState({ saisiesEcartees: 1 }); });
    expect((await screen.findByText(/autre fenêtre/)).textContent).toMatch(/refais-la/);
  });
});

/** Une facture par année, dont une impayée depuis longtemps : de quoi faire
    exister un menu d'années ET un sujet « à traiter ». */
function dossierSurDeuxAns(): Faits {
  const recette = (id: string, annee: number, encaissee: boolean): Faits['recettes'][number] => ({
    id, clientNom: 'Client de démonstration', libelle: 'Prestation', montant: euros(1_000),
    emiseLe: dateISO(`${annee}-03-10`), encaisseeLe: encaissee ? dateISO(`${annee}-04-10`) : null,
    modeReglement: encaissee ? 'virement' : null, numero: `F-${id}`, echeanceLe: dateISO(`${annee}-04-10`)
  });
  return { ...faitsVides(), recettes: [recette('a', 2025, false), recette('b', 2026, true)] };
}

/** Monte l'application sur une adresse, et attend que la barre du haut soit arrivée. */
async function ouvrir(adresse: string): Promise<HTMLElement> {
  window.location.hash = adresse;
  render(<App />);
  const barre = screen.getByRole('banner', { name: 'Barre du haut' });
  await within(barre).findByRole('button', { name: 'Rechercher' });
  return barre;
}

/** Change d'écran comme le rail le fait : par l'adresse. */
async function allerA(adresse: string): Promise<void> {
  act(() => { window.location.hash = adresse; });
  await waitFor(() => expect(window.location.hash).toBe(adresse));
}

describe('la navigation du lot 51', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
    const faits = dossierSurDeuxAns();
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(faits));
    useFaits.setState({ faits });
  });
  afterEach(() => { vi.useRealTimers(); });

  /**
   * DÉCISION 2 (16/11) : LA BARRE DU HAUT NE PORTE PLUS DE PÉRIODE.
   *
   * Elle portait le mois et l'année au-dessus de tous les écrans : sur
   * Config, ils ne commandaient rien ; sur Achats, ils doublaient la barre de
   * période de l'écran. « Exporter » et la pastille « à traiter » en sont
   * partis avec eux — les exports vivent là où sont leurs données, et ce qui
   * attend se lit aux compteurs du rail et dans les décisions du Pilote. Le
   * thème est parti dans Réglages › Affichage.
   */
  it.each([
    '#/pilote', '#/activite', '#/factures', '#/tresorerie', '#/obligations', '#/achats',
    '#/simulateurs', '#/reglages'
  ])(
    'la barre du haut de %s ne porte que la recherche, la synchronisation, le masquage et « Nouveau »',
    async (adresse) => {
      const barre = within(await ouvrir(adresse));
      expect(barre.queryByRole('button', { name: /Mois précédent|Mois suivant/ })).toBeNull();
      expect(barre.queryByRole('combobox')).toBeNull();
      expect(barre.queryByRole('button', { name: /Exporter/ })).toBeNull();
      expect(barre.queryByRole('button', { name: /à traiter/ })).toBeNull();

      expect(barre.getByRole('link', { name: /Non synchronisé/ })).toBeTruthy();
      expect(barre.getByRole('button', { name: /Masquer les montants/ })).toBeTruthy();
      expect(barre.getByRole('button', { name: /Nouveau/ })).toBeTruthy();
    }
  );

  /**
   * UNE SEULE COMMANDE DE PÉRIODE PAR ÉCRAN, DANS SON EN-TÊTE.
   *
   * Le Pilote : le mois, sur la carte du flux — le seul bloc qui le suit.
   * Trésorerie et Simulateurs : l'année. Achats : sa barre de période. Deux commandes
   * sur un même écran pouvaient se contredire ; aucune l'aurait laissé sans
   * moyen de changer de période.
   */
  it('le Pilote porte le mois dans l’en-tête de la carte du flux, et nulle part ailleurs', async () => {
    await ouvrir('#/pilote');
    const flux = await screen.findByRole('region', { name: /Le flux du mois/ });
    // La commande arrive à la demande, quelques millisecondes après la carte.
    expect(await within(flux).findByRole('button', { name: 'Mois précédent' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Mois précédent' })).toHaveLength(1);
    expect(screen.queryByRole('combobox', { name: 'Année' })).toBeNull();
  });

  it('#/simulateurs porte l’année dans son en-tête, et rien d’autre', async () => {
    await ouvrir('#/simulateurs');
    expect(await screen.findAllByRole('combobox', { name: 'Année' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Mois précédent' })).toBeNull();
  });

  /* Lot 49 : la bascule « 12 mois à venir | Année N » remplace le sélecteur
     d'année de la Trésorerie — une seule commande de période, comme la maquette. */
  it('#/tresorerie porte sa bascule de période, et elle seule', async () => {
    await ouvrir('#/tresorerie');
    const periode = await screen.findByRole('navigation', { name: 'Période' });
    expect(within(periode).getByRole('link', { name: '12 mois à venir' })).toBeTruthy();
    expect(within(periode).getByRole('link', { name: /^Année \d{4}$/u })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Année' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mois précédent' })).toBeNull();
  });

  it('Achats porte sa barre de période, et elle seule', async () => {
    await ouvrir('#/achats');
    expect(await screen.findAllByRole('button', { name: 'Période précédente' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Mois précédent' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Année' })).toBeNull();
  });

  /**
   * LE MOIS RESTE PARTAGÉ.
   *
   * Les commandes ont quitté la barre du haut, pas l'état : il vit toujours dans
   * `App`. Un mois tenu par chaque écran retomberait au mois courant à chaque
   * changement d'écran — exactement le défaut que l'audit des indicateurs avait
   * relevé sur Argent.
   */
  it('un mois choisi sur un écran est celui qu’on retrouve sur un autre', async () => {
    await ouvrir('#/pilote');
    fireEvent.click(await screen.findByRole('button', { name: 'Mois précédent' }));
    expect(await screen.findByRole('heading', { name: /Le flux du mois · mai 2026/ })).toBeTruthy();

    await allerA('#/achats');
    expect(await screen.findByText(/Dépenses · mai 2026/)).toBeTruthy();

    // Changer d'année garde le mois : mai 2026 → mai 2025, pas décembre.
    await allerA('#/simulateurs');
    fireEvent.change(await screen.findByRole('combobox', { name: 'Année' }), { target: { value: '2025' } });
    await allerA('#/pilote');
    expect(await screen.findByRole('heading', { name: /Le flux du mois · mai 2025/ })).toBeTruthy();
  });
});

/**
 * UNE ANCIENNE ADRESSE MÈNE À LA NOUVELLE, SANS LAISSER DE TRACE (lot 51).
 *
 * `replace` et non une affectation : l'ancienne adresse resterait sinon dans
 * l'historique, et « retour » y ramènerait — pour être aussitôt renvoyé ici,
 * si bien qu'on ne pourrait plus reculer du tout.
 */
describe('les anciennes adresses', () => {
  it('ouvre la Trésorerie sur `#/argent`, sans ajouter d’entrée à l’historique', async () => {
    window.location.hash = '#/argent';
    const avant = window.history.length;
    render(<App />);
    await waitFor(() => expect(window.location.hash).toBe('#/tresorerie'));
    expect(window.history.length).toBe(avant);
    expect(await screen.findByRole('heading', { level: 1, name: /Ton solde n’est pas tout à toi/ })).toBeTruthy();
  });

  /* La paire passe avant l'écran : Activité existe toujours, et la résoudre
     d'abord ouvrirait le planning au lieu de la liste des factures. */
  it('ouvre la liste des factures sur `#/activite/factures`, pas le planning', async () => {
    window.location.hash = '#/activite/factures';
    render(<App />);
    await waitFor(() => expect(window.location.hash).toBe('#/factures'));
    expect(await screen.findByRole('button', { name: 'Nouvelle facture' })).toBeTruthy();
  });
});
