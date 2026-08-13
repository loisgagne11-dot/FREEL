/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Client, type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Activite } from './Activite';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-07-15T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

const client = (m: Partial<Client> = {}): Client => ({
  id: 'c1', nom: 'Dupont', adresse: '', siret: '', email: '',
  delaiPaiementJours: 30, pays: '', tvaIntracom: '', ...m
});

const recette = (m: Partial<Recette> = {}): Recette => ({
  id: 'r1', clientNom: 'Dupont', libelle: 'Prestation', montant: euros(4000),
  emiseLe: dateISO('2026-07-10'), encaisseeLe: null, modeReglement: null,
  numero: '2026-001', ...m
});

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...modifications } });
}

async function ouvrir(onglet: 'Clients' | 'Missions') {
  render(<Activite />);
  const utilisateur = userEvent.setup();
  await utilisateur.click(screen.getByRole('tab', { name: onglet }));
  return utilisateur;
}

describe('création d’un client', () => {
  it('enregistre un client depuis l’écran', async () => {
    const utilisateur = await ouvrir('Clients');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter un client' }));
    await utilisateur.type(screen.getByLabelText('Nom'), 'Nouveau Client');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter le client' }));

    expect(useFaits.getState().faits.clients[0]?.nom).toBe('Nouveau Client');
  });

  // Le nom est la clé de rattachement : deux homonymes rendraient indécidable
  // l'appartenance de chaque recette.
  it('refuse un homonyme en disant pourquoi', async () => {
    semer({ clients: [client()] });
    const utilisateur = await ouvrir('Clients');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter un client' }));
    await utilisateur.type(screen.getByLabelText('Nom'), 'Dupont');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter le client' }));

    expect(screen.getByRole('alert').textContent).toMatch(/déjà/i);
    expect(useFaits.getState().faits.clients).toHaveLength(1);
  });

  // Sans pays ni numéro de TVA, une prestation vendue dans l'Union reste
  // invisible à la DES.
  it('ne demande le numéro de TVA que pour un client hors de France', async () => {
    const utilisateur = await ouvrir('Clients');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter un client' }));

    expect(screen.queryByLabelText(/N° de TVA intracommunautaire/)).toBeNull();
    await utilisateur.type(screen.getByLabelText(/Pays/), 'DE');
    expect(screen.getByLabelText(/N° de TVA intracommunautaire/)).toBeTruthy();
  });
});

describe('renommage d’un client', () => {
  // Le point le plus dangereux du modèle : le rattachement se fait par nom.
  it('propage le nouveau nom sur les missions et les recettes', async () => {
    semer({
      clients: [client()],
      missions: [{
        id: 'm1', clientId: 'c1', clientNom: 'Dupont', description: 'Mission',
        tjm: euros(400), debut: dateISO('2026-01-01'), fin: null, statut: 'active', entites: []
      }],
      recettes: [recette()]
    });
    const utilisateur = await ouvrir('Clients');
    await utilisateur.click(screen.getByRole('button', { name: /Dupont/ }));

    const champ = screen.getByLabelText('Nom');
    await utilisateur.clear(champ);
    await utilisateur.type(champ, 'Dupont SARL');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const faits = useFaits.getState().faits;
    expect(faits.clients[0]?.nom).toBe('Dupont SARL');
    expect(faits.missions[0]?.clientNom).toBe('Dupont SARL');
    expect(faits.recettes[0]?.clientNom).toBe('Dupont SARL');
  });

  it('avertit avant d’enregistrer que le renommage se propagera', async () => {
    semer({ clients: [client()] });
    const utilisateur = await ouvrir('Clients');
    await utilisateur.click(screen.getByRole('button', { name: /Dupont/ }));

    const champ = screen.getByLabelText('Nom');
    await utilisateur.clear(champ);
    await utilisateur.type(champ, 'Autre nom');
    expect(screen.getByText(/rattache les missions et les recettes/)).toBeTruthy();
  });
});

describe('suppression d’un client', () => {
  // Les recettes resteraient au livre mais sortiraient des délais de paiement
  // et de la DES sans que rien ne le signale.
  it('refuse tant que des recettes sont rattachées, en les dénombrant', async () => {
    semer({ clients: [client()], recettes: [recette()] });
    const utilisateur = await ouvrir('Clients');
    await utilisateur.click(screen.getByRole('button', { name: /Dupont/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer ce client' }));

    expect(screen.getByRole('alert').textContent).toMatch(/1 recette/);
    expect(useFaits.getState().faits.clients).toHaveLength(1);
  });

  it('supprime un client sans rattachement', async () => {
    semer({ clients: [client()] });
    const utilisateur = await ouvrir('Clients');
    await utilisateur.click(screen.getByRole('button', { name: /Dupont/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer ce client' }));

    expect(useFaits.getState().faits.clients).toHaveLength(0);
  });
});

describe('carnet affiché', () => {
  it('montre le pays en clair, pas son code', async () => {
    semer({ clients: [client({ pays: 'DE', tvaIntracom: 'DE123' })] });
    await ouvrir('Clients');
    expect(screen.getByText('Allemagne')).toBeTruthy();
  });

  // Sans le numéro, la ligne de DES ne peut pas être déposée.
  it('signale un numéro de TVA manquant sur un client étranger', async () => {
    semer({ clients: [client({ pays: 'DE', tvaIntracom: '' })] });
    await ouvrir('Clients');
    expect(screen.getByText('n° de TVA manquant')).toBeTruthy();
  });

  it('ne réclame aucun numéro pour un client français', async () => {
    semer({ clients: [client({ pays: 'FR' })] });
    await ouvrir('Clients');
    expect(screen.queryByText('n° de TVA manquant')).toBeNull();
  });
});

describe('missions', () => {
  it('enregistre une mission avec son tarif journalier', async () => {
    const utilisateur = await ouvrir('Missions');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter une mission' }));
    await utilisateur.type(screen.getByLabelText('Client'), 'ClientA');
    await utilisateur.type(screen.getByLabelText('Description'), 'Mission A');
    await utilisateur.clear(screen.getByLabelText(/Tarif journalier/));
    await utilisateur.type(screen.getByLabelText(/Tarif journalier/), '450');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la mission' }));

    expect(useFaits.getState().faits.missions[0]).toMatchObject({
      clientNom: 'ClientA', description: 'Mission A', tjm: 450
    });
  });

  // Perdre le nom couperait la mission de son chiffre d'affaires.
  it('rattache par identifiant quand le client est au carnet', async () => {
    semer({ clients: [client()] });
    const utilisateur = await ouvrir('Missions');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter une mission' }));
    await utilisateur.type(screen.getByLabelText('Client'), 'Dupont');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la mission' }));

    expect(useFaits.getState().faits.missions[0]).toMatchObject({
      clientId: 'c1', clientNom: 'Dupont'
    });
  });

  // Une facture émise ne se retire pas du registre.
  it('refuse de supprimer une mission dont une recette relève de la période', async () => {
    semer({
      missions: [{
        id: 'm1', clientId: null, clientNom: 'Dupont', description: 'Mission',
        tjm: euros(400), debut: dateISO('2026-01-01'), fin: dateISO('2026-12-31'),
        statut: 'active', entites: []
      }],
      recettes: [recette()]
    });
    const utilisateur = await ouvrir('Missions');
    const liste = screen.getByRole('list');
    await utilisateur.click(within(liste).getByRole('button', { name: /Mission/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer cette mission' }));

    expect(screen.getByRole('alert').textContent).toMatch(/registre|inexplicable/i);
    expect(useFaits.getState().faits.missions).toHaveLength(1);
  });

  it('permet de marquer une mission perdue', async () => {
    semer({
      missions: [{
        id: 'm1', clientId: null, clientNom: 'Dupont', description: 'Mission',
        tjm: euros(400), debut: null, fin: null, statut: 'active', entites: []
      }]
    });
    const utilisateur = await ouvrir('Missions');
    await utilisateur.click(within(screen.getByRole('list')).getByRole('button', { name: /Mission/ }));
    await utilisateur.selectOptions(screen.getByLabelText('Statut'), 'perdue');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(useFaits.getState().faits.missions[0]?.statut).toBe('perdue');
  });
});

/**
 * LE FAIT QUI REMPLIT LE PLANNING N'ÉTAIT SAISISSABLE NULLE PART.
 *
 * L'enchaînement du métier est : rythme → planning rempli d'office →
 * ajustements → CRA. Le domaine le savait, le planning savait le lire, et
 * aucun écran ne permettait de déclarer le rythme. Une mission créée dans
 * l'application avait donc un planning vide, définitivement — seules les
 * missions reprises de l'ancienne version en avaient un.
 */
describe('rythme de travail', () => {
  async function nouvelleMission(utilisateur: ReturnType<typeof userEvent.setup>) {
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter une mission' }));
    await utilisateur.type(screen.getByLabelText('Client'), 'ClientA');
    await utilisateur.type(screen.getByLabelText('Début'), '2026-01-01');
    await utilisateur.type(screen.getByLabelText('Fin'), '2026-12-31');
  }

  it('se déclare à la création, et se retrouve sur le client opérationnel', async () => {
    const utilisateur = await ouvrir('Missions');
    await nouvelleMission(utilisateur);

    const semaine = screen.getByRole('group', { name: 'Jours travaillés dans la semaine' });
    await utilisateur.click(within(semaine).getByRole('button', { name: /^Lun/ }));
    await utilisateur.click(within(semaine).getByRole('button', { name: /^Mar/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la mission' }));

    const entite = useFaits.getState().faits.missions[0]?.entites[0];
    expect(entite?.rythmes[0]?.parJour).toEqual({ lun: 1, mar: 1 });
  });

  // Un clic de plus donne la demi-journée, que l'ancienne application gère
  // depuis toujours et qu'une case à cocher ne saurait pas dire.
  it('fait le tour journée → demi-journée → rien', async () => {
    const utilisateur = await ouvrir('Missions');
    await nouvelleMission(utilisateur);
    const semaine = screen.getByRole('group', { name: 'Jours travaillés dans la semaine' });
    const vendredi = within(semaine).getByRole('button', { name: /^Ven/ });

    await utilisateur.click(vendredi);
    await utilisateur.click(vendredi);
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la mission' }));

    expect(useFaits.getState().faits.missions[0]?.entites[0]?.rythmes[0]?.parJour)
      .toEqual({ ven: 0.5 });
  });

  /**
   * Le rythme se saisit avant que les dates soient forcément connues. Plutôt
   * qu'inventer une plage, on pose une borne remplacée à l'enregistrement par
   * les dates réelles — une plage inventée produirait des journées à des dates
   * que personne n'a choisies.
   */
  it('pose le rythme sur la plage réelle de la mission', async () => {
    const utilisateur = await ouvrir('Missions');
    await nouvelleMission(utilisateur);
    const semaine = screen.getByRole('group', { name: 'Jours travaillés dans la semaine' });
    await utilisateur.click(within(semaine).getByRole('button', { name: /^Lun/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la mission' }));

    const rythme = useFaits.getState().faits.missions[0]?.entites[0]?.rythmes[0];
    expect(rythme?.du).toBe('2026-01-01');
    expect(rythme?.au).toBe('2026-12-31');
  });

  it('dit qu’il faut des dates pour que le rythme serve', async () => {
    const utilisateur = await ouvrir('Missions');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter une mission' }));
    expect(screen.getByText(/sans plage de dates/)).toBeTruthy();
  });

  /**
   * Le cas ordinaire ne montre pas le concept : un seul client opérationnel,
   * donc pas de nom ni de couleur à saisir. Le vocabulaire n'apparaît qu'au
   * moment où il veut dire quelque chose.
   */
  it('ne montre le vocabulaire qu’à partir du second client', async () => {
    const utilisateur = await ouvrir('Missions');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter une mission' }));
    expect(screen.queryByLabelText(/Nom du client opérationnel/)).toBeNull();

    await utilisateur.click(
      screen.getByRole('button', { name: 'Ajouter un client opérationnel' })
    );
    expect(screen.getAllByLabelText(/Nom du client opérationnel/)).toHaveLength(2);
  });

  it('enregistre deux clients opérationnels avec des rythmes distincts', async () => {
    const utilisateur = await ouvrir('Missions');
    await nouvelleMission(utilisateur);
    await utilisateur.click(
      screen.getByRole('button', { name: 'Ajouter un client opérationnel' })
    );

    const groupes = screen.getAllByRole('group', { name: 'Jours travaillés dans la semaine' });
    await utilisateur.click(within(groupes[0] as HTMLElement).getByRole('button', { name: /^Lun/ }));
    await utilisateur.click(within(groupes[1] as HTMLElement).getByRole('button', { name: /^Mer/ }));
    await utilisateur.type(
      screen.getAllByLabelText(/Nom du client opérationnel/)[1] as HTMLElement, 'Client final B'
    );
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la mission' }));

    const entites = useFaits.getState().faits.missions[0]?.entites ?? [];
    expect(entites).toHaveLength(2);
    expect(entites[0]?.rythmes[0]?.parJour).toEqual({ lun: 1 });
    expect(entites[1]?.rythmes[0]?.parJour).toEqual({ mer: 1 });
    expect(entites[1]?.nom).toBe('Client final B');
  });
});
