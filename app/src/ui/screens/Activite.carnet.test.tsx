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

/**
 * L'onglet Clients est chargé à la demande : on attend son arrivée avant
 * d'interroger le contenu, sinon la première assertion tombe sur le
 * « Chargement… » du Suspense.
 */
async function ouvrir(onglet: 'Clients' | 'Missions') {
  render(<Activite />);
  const utilisateur = userEvent.setup();
  await utilisateur.click(screen.getByRole('tab', { name: onglet }));
  // Les deux onglets sont chargés à la demande : attendre leur arrivée.
  await screen.findByRole('heading', {
    name: onglet === 'Clients' ? /Carnet/ : /^Missions/
  });
  return utilisateur;
}

describe('création d’un client', () => {
  it('enregistre un client depuis l’écran', async () => {
    const utilisateur = await ouvrir('Clients');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter un client' }));
    await utilisateur.type(await screen.findByLabelText('Nom'), 'Nouveau Client');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter le client' }));

    expect(useFaits.getState().faits.clients[0]?.nom).toBe('Nouveau Client');
  });

  // Le nom est la clé de rattachement : deux homonymes rendraient indécidable
  // l'appartenance de chaque recette.
  it('refuse un homonyme en disant pourquoi', async () => {
    semer({ clients: [client()] });
    const utilisateur = await ouvrir('Clients');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter un client' }));
    await utilisateur.type(await screen.findByLabelText('Nom'), 'Dupont');
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

    const champ = await screen.findByLabelText('Nom');
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

    const champ = await screen.findByLabelText('Nom');
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
    await utilisateur.type(await screen.findByLabelText('Client'), 'ClientA');
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
    await utilisateur.type(await screen.findByLabelText('Client'), 'Dupont');
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
    await utilisateur.type(await screen.findByLabelText('Client'), 'ClientA');
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

/**
 * UN RYTHME CHANGE EN COURS DE MISSION, ET CE N'EST PAS UNE AUTRE MISSION.
 *
 * Passer de cinq jours par semaine à trois chez le même client opérationnel
 * arrive tout le temps : la mission se prolonge à temps partiel. Le contrat, le
 * CRA et la facturation ne changent pas — forcer à créer une seconde mission
 * couperait en deux l'historique d'un même engagement.
 *
 * Le modèle portait `rythmes[]` depuis le schéma 4, et `rythmePour` savait déjà
 * arbitrer entre deux plages. Seul le formulaire ne savait pas en écrire une
 * seconde : il réécrivait toujours la dernière.
 *
 * Le découpage est MENSUEL, comme le handoff de design : une ligne par mois de
 * la mission. Il n'y a alors aucune jonction à deviner, puisque les bornes sont
 * celles du calendrier.
 */
describe('changement de rythme en cours de mission', () => {
  async function nouvelleMission(
    utilisateur: ReturnType<typeof userEvent.setup>,
    fin = '2026-03-31'
  ) {
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter une mission' }));
    await utilisateur.type(await screen.findByLabelText('Client'), 'ClientA');
    await utilisateur.type(screen.getByLabelText('Début'), '2026-01-01');
    await utilisateur.type(screen.getByLabelText('Fin'), fin);
  }

  const decouper = (utilisateur: ReturnType<typeof userEvent.setup>) =>
    utilisateur.click(
      screen.getByRole('button', { name: 'Changer de rythme en cours de mission' })
    );

  /** Le cas à une période ne montre pas le concept : ni dates ni TJM. */
  it('ne montre les dates de période qu’à partir de la seconde', async () => {
    const utilisateur = await ouvrir('Missions');
    await nouvelleMission(utilisateur);
    expect(screen.queryByLabelText(/Début de la période/)).toBeNull();

    await decouper(utilisateur);
    expect(screen.getAllByLabelText(/Début de la période/)).toHaveLength(3);
  });

  /**
   * Sans dates de mission, il n'y a pas de mois à découper. Proposer le
   * découpage quand même produirait des lignes sans bornes, c'est-à-dire le
   * défaut qu'il existe pour éviter.
   */
  it('ne propose pas le découpage tant que la mission n’est pas datée', async () => {
    const utilisateur = await ouvrir('Missions');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter une mission' }));
    await screen.findByLabelText('Client');
    expect(
      screen.queryByRole('button', { name: 'Changer de rythme en cours de mission' })
    ).toBeNull();
  });

  /**
   * Les bornes sont celles du calendrier, ramenées à celles de la mission aux
   * deux extrémités : un rythme qui déborderait remplirait le planning de
   * journées hors contrat.
   */
  it('découpe en un mois par ligne, sans déborder de la mission', async () => {
    const utilisateur = await ouvrir('Missions');
    await nouvelleMission(utilisateur, '2026-03-15');
    await decouper(utilisateur);
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la mission' }));

    const rythmes = useFaits.getState().faits.missions[0]?.entites[0]?.rythmes ?? [];
    expect(rythmes.map((r) => [r.du, r.au])).toEqual([
      ['2026-01-01', '2026-01-31'],
      ['2026-02-01', '2026-02-28'],
      ['2026-03-01', '2026-03-15']
    ]);
  });

  /**
   * Chaque mois hérite du rythme en cours : un changement part d'un rythme
   * connu qu'on amende. On ne touche ensuite que les lignes qui changent.
   */
  it('reporte la semaine type sur chaque mois, puis n’en modifie qu’un', async () => {
    const utilisateur = await ouvrir('Missions');
    await nouvelleMission(utilisateur, '2026-02-28');

    const premiere = screen.getByRole('group', { name: 'Jours travaillés dans la semaine' });
    for (const jour of [/^Lun/, /^Mar/, /^Mer/]) {
      await utilisateur.click(within(premiere).getByRole('button', { name: jour }));
    }
    await decouper(utilisateur);

    const groupes = screen.getAllByRole('group', { name: 'Jours travaillés dans la semaine' });
    expect(groupes).toHaveLength(2);
    // Février passe à mi-temps le mercredi. Le tour est 0 → 1 → ½ → rien :
    // partant du plein hérité, un seul clic donne la demi-journée.
    const fevrier = groupes[1] as HTMLElement;
    await utilisateur.click(within(fevrier).getByRole('button', { name: /^Mer/ }));

    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la mission' }));

    const rythmes = useFaits.getState().faits.missions[0]?.entites[0]?.rythmes ?? [];
    expect(rythmes[0]?.parJour).toEqual({ lun: 1, mar: 1, mer: 1 });
    expect(rythmes[1]?.parJour).toEqual({ lun: 1, mar: 1, mer: 0.5 });
  });

  /** Le TJM peut changer avec le rythme — l'ancienne application ne le savait pas. */
  it('accepte un TJM propre à un mois', async () => {
    const utilisateur = await ouvrir('Missions');
    await nouvelleMission(utilisateur, '2026-02-28');
    await decouper(utilisateur);

    const tjms = screen.getAllByLabelText(/TJM sur cette période/);
    await utilisateur.type(tjms[1] as HTMLElement, '520');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la mission' }));

    const rythmes = useFaits.getState().faits.missions[0]?.entites[0]?.rythmes ?? [];
    expect(rythmes[0]?.tjm).toBeNull();
    expect(rythmes[1]?.tjm).toBe(520);
  });

  /**
   * Un changement qui tombe le 15 reste exprimable : le découpage mensuel est
   * ce qu'on PROPOSE, pas ce qu'on impose.
   */
  it('laisse déplacer une borne en cours de mois', async () => {
    const utilisateur = await ouvrir('Missions');
    await nouvelleMission(utilisateur, '2026-02-28');
    await decouper(utilisateur);

    const debuts = screen.getAllByLabelText(/Début de la période/);
    await utilisateur.clear(debuts[1] as HTMLElement);
    await utilisateur.type(debuts[1] as HTMLElement, '2026-01-16');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la mission' }));

    const rythmes = useFaits.getState().faits.missions[0]?.entites[0]?.rythmes ?? [];
    expect(rythmes[1]?.du).toBe('2026-01-16');
  });

  it('retire un mois sans toucher aux autres', async () => {
    const utilisateur = await ouvrir('Missions');
    await nouvelleMission(utilisateur, '2026-02-28');
    const premiere = screen.getByRole('group', { name: 'Jours travaillés dans la semaine' });
    await utilisateur.click(within(premiere).getByRole('button', { name: /^Lun/ }));
    await decouper(utilisateur);

    const retirer = screen.getAllByRole('button', { name: 'Retirer' });
    await utilisateur.click(retirer[retirer.length - 1] as HTMLElement);
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la mission' }));

    const rythmes = useFaits.getState().faits.missions[0]?.entites[0]?.rythmes ?? [];
    expect(rythmes).toHaveLength(1);
    expect(rythmes[0]?.au).toBe('2026-01-31');
  });
});
