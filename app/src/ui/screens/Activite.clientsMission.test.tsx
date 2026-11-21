/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import type { Rythme } from '../../domain/calculs/planning';
import {
  type Client, type ClientOperationnel, type Faits, type Mission, type Recette, faitsVides
} from '../../state/schema';
import { useFaits } from '../../state/store';
import { Activite } from './Activite';

/**
 * UNE MISSION À PLUSIEURS CLIENTS (lot 31) — les gestes de l'écran.
 *
 * Maquette validée : `docs/design/direction/mission-clients.html`. Le calcul
 * est tenu par `clientsOperationnels.test.ts` ; ici, ce que l'utilisateur voit,
 * clique, et ce que « Enregistrer » écrit.
 *
 * L'horloge est au mercredi 10 juin 2026. La mission court du lundi 2 mars au
 * mardi 30 juin ; Atelier Fictif y travaille lundi, mardi, mercredi, Studio
 * Fictif le jeudi. Fériés dans la période : lundi de Pâques (6 avril),
 * Ascension (jeudi 14 mai), lundi de Pentecôte (25 mai).
 */

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

const client = (nom: string): Client => ({
  id: `c-${nom}`, nom, adresse: '', siret: '', email: '',
  delaiPaiement: 'net_30', pays: '', tvaIntracom: ''
});

const plage = (du: string, au: string, parJour: Rythme['parJour']): Rythme => ({
  du: dateISO(du), au: dateISO(au), parJour, tjm: null
});

const atelier = (o: Partial<ClientOperationnel> = {}): ClientOperationnel => ({
  id: 'co-atelier', nom: 'Atelier Fictif', couleur: '', adresse: '', contact: '', email: '', telephone: '',
  rythmes: [plage('2026-03-02', '2026-06-30', { lun: 1, mar: 1, mer: 1 })],
  ajustements: {
    '2026-03-04': { quotite: 0.5 },
    '2026-06-17': { quotite: 0 },
    '2026-06-24': { quotite: 1 }
  },
  ...o
});

const studio = (o: Partial<ClientOperationnel> = {}): ClientOperationnel => ({
  id: 'co-studio', nom: 'Studio Fictif', couleur: '', adresse: '', contact: '', email: '', telephone: '',
  rythmes: [plage('2026-03-02', '2026-06-30', { jeu: 1 })],
  ajustements: {},
  ...o
});

const mission = (entites: readonly ClientOperationnel[], o: Partial<Mission> = {}): Mission => ({
  id: 'm1', clientId: null, clientNom: 'Agence Fictive', description: 'Refonte catalogue',
  tjm: euros(500), debut: dateISO('2026-03-02'), fin: dateISO('2026-06-30'),
  statut: 'active', entites, ...o
});

const factureDeMai: Recette = {
  id: 'r-mai', clientNom: 'Agence Fictive', libelle: 'Refonte catalogue — mai 2026',
  montant: euros(6000), emiseLe: dateISO('2026-05-28'), encaisseeLe: null,
  modeReglement: null, numero: '2026-012'
};

function semer(modifications: Partial<Faits>): void {
  useFaits.setState({
    faits: {
      ...faitsVides(),
      clients: [client('Agence Fictive'), client('Atelier Fictif'), client('Studio Fictif')],
      ...modifications
    }
  });
}

/** Ouvre l'onglet Missions et la mission ; attend le formulaire, chargé à la demande. */
async function ouvrirLaMission() {
  render(<Activite />);
  const utilisateur = userEvent.setup();
  await utilisateur.click(screen.getByRole('tab', { name: /^Missions/ }));
  await screen.findByRole('heading', { name: /^Toutes les missions/ });
  await utilisateur.click(within(screen.getByRole('table')).getByRole('button', { name: /Refonte catalogue/ }));
  await screen.findByRole('button', { name: /^Retirer — Atelier Fictif/ });
  return utilisateur;
}

const enregistrer = (u: ReturnType<typeof userEvent.setup>) =>
  u.click(screen.getByRole('button', { name: 'Enregistrer' }));

const missionEnregistree = (): Mission => useFaits.getState().faits.missions[0] as Mission;

/** Le texte lu, espaces insécables rendues ordinaires : la typographie n'est pas la règle. */
const texte = (el: HTMLElement): string => (el.textContent ?? '').replace(/\u00a0/g, ' ');

/**
 * ARRÊTER CE CLIENT LE…
 *
 * Arrêter borne les plages et retire les corrections d'après : le planning, le
 * CRA et le brouillon cessent de compter ses jours. Si l'écran ne disait pas
 * combien avant, on arrêterait un client sans savoir qu'on efface deux
 * journées corrigées ; s'il écrivait au magasin sans attendre « Enregistrer »,
 * l'enregistrement de la saisie d'avant défaisait l'arrêt.
 */
describe('arrêter un client de la mission', () => {
  /**
   * Après le 10 juin : 15, 16, 17, 22, 23, 24, 29, 30 — huit jours, le 17
   * corrigé à zéro, donc sept. Corrections d'après : le 17 et le 24.
   */
  it('propose aujourd’hui, et chiffre ce que l’arrêt retire avant de l’écrire', async () => {
    semer({ missions: [mission([atelier(), studio()])] });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: /^Arrêter ce client le… — Atelier Fictif/ }));

    const champ = screen.getByLabelText('Arrêter ce client le') as HTMLInputElement;
    expect(champ.value).toBe('2026-06-10');
    // Le bouton cliqué a disparu : le focus va au champ, pas en haut du panneau.
    expect(document.activeElement).toBe(champ);

    const consequence = screen.getByRole('group', { name: /^À partir du 11 juin/ });
    expect(texte(consequence)).toContain(
      'Atelier Fictif ne compte plus aucun jour : 2 journées corrigées seront retirées, '
      + 'et 7 jours prévus jusqu’au 30 juin ne compteront plus — au planning, au compte rendu et au brouillon du mois.'
    );
    expect(within(consequence).getByRole('button', { name: 'Arrêter le 10 juin' })).toBeTruthy();
    // Aucune facture de juin n'est partie : rien à corriger, rien à dire.
    expect(consequence.textContent).not.toMatch(/avoir/);
  });

  /**
   * Arrêté au 13 mai, le client perd ses jours de mai : la facture de mai déjà
   * partie les porte encore, et seul un avoir la corrige. Taire son numéro, ce
   * serait laisser croire le geste suffisant.
   *
   * Du 14 mai au 30 juin, lundis, mardis, mercredis : 19, moins le lundi de
   * Pentecôte et le 17 juin corrigé à zéro — dix-huit.
   */
  it('nomme la facture déjà émise sur un mois touché, qui ne change pas', async () => {
    semer({ missions: [mission([atelier(), studio()])], recettes: [factureDeMai] });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: /^Arrêter ce client le… — Atelier Fictif/ }));
    const champ = screen.getByLabelText('Arrêter ce client le');
    await u.clear(champ);
    await u.type(champ, '2026-05-13');

    // La date se tape sans que la confirmation qui reparaît ne vole le focus.
    expect(document.activeElement).toBe(champ);
    const consequence = screen.getByRole('group', { name: /^À partir du 14 mai/ });
    expect(texte(consequence)).toContain('et 18 jours prévus jusqu’au 30 juin ne compteront plus');
    expect(texte(consequence)).toContain(
      'Une facture déjà émise couvre mai (2026-012) : elle ne change pas. '
      + 'Si elle compte des jours après le 13, un avoir la corrige.'
    );
  });

  /**
   * La facture de mai est partie au payeur de la mission, sous la facture
   * commune. Choisir « Une par client » avant d'arrêter ne la fait pas
   * disparaître : elle porte toujours les jours que l'arrêt retire.
   */
  it('nomme encore la facture commune après le passage à « Une par client »', async () => {
    semer({ missions: [mission([atelier(), studio()])], recettes: [factureDeMai] });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: 'Une par client' }));
    await u.selectOptions(screen.getByLabelText('Atelier Fictif — facturée à'), 'Atelier Fictif');
    await u.click(screen.getByRole('button', { name: /^Arrêter ce client le… — Atelier Fictif/ }));
    const champ = screen.getByLabelText('Arrêter ce client le');
    await u.clear(champ);
    await u.type(champ, '2026-05-13');

    expect(texte(screen.getByRole('group', { name: /^À partir du 14 mai/ })))
      .toContain('Une facture déjà émise couvre mai (2026-012)');
  });

  it('dit tel quel le refus d’un arrêt avant le premier jour', async () => {
    semer({ missions: [mission([atelier(), studio()])] });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: /^Arrêter ce client le… — Atelier Fictif/ }));
    const champ = screen.getByLabelText('Arrêter ce client le');
    await u.clear(champ);
    await u.type(champ, '2026-02-27');

    expect(screen.getByRole('alert').textContent).toBe(
      'Ce client n’a encore rien travaillé à cette date : l’arrêter avant son '
      + 'premier jour reviendrait à le retirer de la mission. C’est « Retirer » qu’il faut.'
    );
    expect(screen.queryByRole('button', { name: /^Arrêter le/ })).toBeNull();
  });

  /**
   * L'arrêt vit dans la saisie jusqu'à « Enregistrer ». Écrit au magasin dès la
   * confirmation, il aurait été écrasé par l'enregistrement de la saisie d'avant.
   */
  it('écrit l’arrêt dans la saisie, et « Enregistrer » le persiste', async () => {
    semer({ missions: [mission([atelier(), studio()])] });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: /^Arrêter ce client le… — Atelier Fictif/ }));
    const champ = screen.getByLabelText('Arrêter ce client le');
    await u.clear(champ);
    await u.type(champ, '2026-05-13');
    await u.click(screen.getByRole('button', { name: 'Arrêter le 13 mai' }));

    expect(missionEnregistree().entites[0]?.rythmes[0]?.au).toBe('2026-06-30');
    expect(screen.getByText(/arrêté le 13 mai/)).toBeTruthy();
    // Le bouton parti avec l'arrêt, le focus va au geste qui reste.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Retirer — Atelier Fictif/ }));

    await enregistrer(u);
    const arrete = missionEnregistree().entites[0];
    expect(arrete?.rythmes.map((r) => [r.du, r.au])).toEqual([['2026-03-02', '2026-05-13']]);
    expect(Object.keys(arrete?.ajustements ?? {})).toEqual(['2026-03-04']);
    // L'autre client continue, intact.
    expect(missionEnregistree().entites[1]?.rythmes[0]?.au).toBe('2026-06-30');
  });

  it('« Garder » ne change rien et rend le focus au bouton', async () => {
    semer({ missions: [mission([atelier(), studio()])] });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: /^Arrêter ce client le… — Atelier Fictif/ }));
    await u.click(screen.getByRole('button', { name: 'Garder' }));

    expect(screen.queryByLabelText('Arrêter ce client le')).toBeNull();
    expect(document.activeElement)
      .toBe(screen.getByRole('button', { name: /^Arrêter ce client le… — Atelier Fictif/ }));
    await enregistrer(u);
    expect(missionEnregistree().entites[0]?.rythmes[0]?.au).toBe('2026-06-30');
  });

  /** Un client seul, c'est la mission qui se termine : rien à arrêter. */
  it('ne se propose pas sur une mission à un seul client', async () => {
    semer({ missions: [mission([atelier()])] });
    render(<Activite />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: /^Missions/ }));
    await screen.findByRole('heading', { name: /^Toutes les missions/ });
    await u.click(within(screen.getByRole('table')).getByRole('button', { name: /Refonte catalogue/ }));
    await screen.findByLabelText('Description');

    expect(screen.queryByRole('button', { name: /^Arrêter ce client le/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Facturation de la mission' })).toBeNull();
  });
});

/**
 * UN CLIENT ARRÊTÉ SE LIT ARRÊTÉ.
 *
 * Rien n'est stocké : « arrêté le 13 mai » se lit sur ses plages, parce qu'un
 * autre client travaille après lui. Si la ligne ne le disait pas, la mission
 * montrerait deux clients en cours, et le planning, qui ne propose plus le
 * premier après sa date, paraîtrait en panne.
 */
describe('lire l’état des clients', () => {
  const missionArretee = () => mission([
    atelier({ rythmes: [plage('2026-03-02', '2026-05-13', { lun: 1, mar: 1, mer: 1 })], ajustements: {} }),
    studio({ rythmes: [plage('2026-05-14', '2026-06-30', { lun: 1, mar: 1, mer: 1 })] })
  ]);

  it('dit « arrêté le … » sous le client arrêté, « depuis le … » sous celui qui a suivi', async () => {
    semer({ missions: [missionArretee()] });
    await ouvrirLaMission();

    const arrete = screen.getByText(/^arrêté le 13 mai · lun\., mar\., mer\.$/).closest('p') as HTMLElement;
    expect(within(arrete).getByText('Arrêté')).toBeTruthy();
    // Pastille neutre, signe ○ : l'état se lit sans la couleur.
    expect(within(arrete).getByText('○')).toBeTruthy();
    const suivant = screen.getByText(/^depuis le 14 mai/).closest('p') as HTMLElement;
    expect(within(suivant).getByText('En cours')).toBeTruthy();
    // Déjà arrêté : seul « Retirer » reste sous lui.
    expect(screen.queryByRole('button', { name: /^Arrêter ce client le… — Atelier Fictif/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Arrêter ce client le… — Studio Fictif/ })).toBeTruthy();
  });

  it('dit dans la liste des missions qui a suivi qui', async () => {
    semer({ missions: [missionArretee()] });
    render(<Activite />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: /^Missions/ }));
    await screen.findByRole('heading', { name: /^Toutes les missions/ });

    expect(screen.getByText('Pour Atelier Fictif jusqu’au 13 mai, puis Studio Fictif')).toBeTruthy();
  });

  it('ne dit rien de tel quand personne n’est arrêté', async () => {
    semer({ missions: [mission([atelier(), studio()])] });
    render(<Activite />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: /^Missions/ }));
    await screen.findByRole('heading', { name: /^Toutes les missions/ });
    expect(screen.queryByText(/^Pour .* jusqu’au/)).toBeNull();
  });

  /**
   * « Changer de rythme » découpait la plage sur la mission entière : un client
   * arrêté le 13 mai se retrouvait au travail jusqu'au 30 juin, d'un clic.
   */
  it('découpe la plage d’un client arrêté sans le remettre au travail', async () => {
    semer({ missions: [missionArretee()] });
    const u = await ouvrirLaMission();
    const decouper = screen.getAllByRole('button', { name: 'Changer de rythme en cours de mission' });
    await u.click(decouper[0] as HTMLElement);
    await enregistrer(u);

    expect(missionEnregistree().entites[0]?.rythmes.map((r) => [r.du, r.au])).toEqual([
      ['2026-03-02', '2026-03-31'], ['2026-04-01', '2026-04-30'], ['2026-05-01', '2026-05-13']
    ]);
  });
});

/**
 * RETIRER EFFACE LE PASSÉ.
 *
 * Retirer un client qui a travaillé emporte ses journées faites — celles qu'un
 * CRA a portées, qu'une facture a comptées. C'est presque toujours un arrêt
 * qu'on voulait : la confirmation le dit en chiffres et propose l'arrêt d'abord.
 *
 * Passé d'Atelier Fictif au 10 juin : mars 14 jours (le 4 à une demie, 13,5),
 * avril 12 (lundi de Pâques férié), mai 11 (Pentecôte), juin 6 — 42,5 jours.
 * Trois corrections posées.
 */
describe('retirer un client', () => {
  it('demande confirmation en chiffrant le passé, avec trois choix', async () => {
    semer({ missions: [mission([atelier(), studio()])] });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: /^Retirer — Atelier Fictif/ }));

    const groupe = screen.getByRole('group', { name: /^Retirer Atelier Fictif efface aussi son passé/ });
    expect(texte(groupe)).toContain(
      'Retirer Atelier Fictif efface aussi son passé : ses 42,5 jours, dont 3 corrigés, '
      + 'quittent le planning, les comptes rendus et les factures à venir.'
    );
    expect(within(groupe).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'L’arrêter le 10 juin à la place', 'Retirer quand même', 'Garder'
    ]);
    expect(missionEnregistree().entites).toHaveLength(2);
  });

  /**
   * Déjà arrêté, il n'a plus rien à arrêter : un « L'arrêter à la place » ne
   * ferait rien, et laisserait croire le passé protégé.
   */
  it('ne propose pas d’arrêt à la place pour un client déjà arrêté', async () => {
    semer({
      missions: [mission([
        atelier({ rythmes: [plage('2026-03-02', '2026-05-13', { lun: 1, mar: 1, mer: 1 })], ajustements: {} }),
        studio()
      ])]
    });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: /^Retirer — Atelier Fictif/ }));

    const groupe = screen.getByRole('group', { name: /^Retirer Atelier Fictif efface aussi son passé/ });
    expect(within(groupe).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Retirer quand même', 'Garder']);
  });

  it('« Retirer quand même » retire, à l’enregistrement', async () => {
    semer({ missions: [mission([atelier(), studio()])] });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: /^Retirer — Atelier Fictif/ }));
    await u.click(screen.getByRole('button', { name: 'Retirer quand même' }));

    expect(screen.queryByRole('button', { name: /^Retirer — Atelier Fictif/ })).toBeNull();
    expect(missionEnregistree().entites).toHaveLength(2);
    await enregistrer(u);
    expect(missionEnregistree().entites.map((e) => e.nom)).toEqual(['Studio Fictif']);
  });

  it('« L’arrêter à la place » arrête au jour même, et garde le passé', async () => {
    semer({ missions: [mission([atelier(), studio()])] });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: /^Retirer — Atelier Fictif/ }));
    await u.click(screen.getByRole('button', { name: 'L’arrêter le 10 juin à la place' }));
    await enregistrer(u);

    const garde = missionEnregistree().entites[0];
    expect(garde?.nom).toBe('Atelier Fictif');
    expect(garde?.rythmes[0]?.au).toBe('2026-06-10');
  });

  it('« Garder » laisse le client et rend le focus à « Retirer »', async () => {
    semer({ missions: [mission([atelier(), studio()])] });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: /^Retirer — Atelier Fictif/ }));
    await u.click(screen.getByRole('button', { name: 'Garder' }));

    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Retirer — Atelier Fictif/ }));
  });

  /**
   * Ajouté pendant la saisie, il n'a pas de passé enregistré : rien à
   * confirmer — même quand sa semaine type compte déjà aujourd'hui, un
   * mercredi, au passé.
   */
  it('retire sans rien demander un client ajouté pendant la saisie', async () => {
    semer({ missions: [mission([atelier(), studio()])] });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: 'Ajouter un client opérationnel' }));
    const semaines = screen.getAllByRole('group', { name: 'Jours travaillés dans la semaine' });
    await u.click(within(semaines[2] as HTMLElement).getByRole('button', { name: /^Mer/ }));
    await u.click(screen.getByRole('button', { name: /^Retirer — Client 3/ }));

    expect(screen.queryByRole('group', { name: /efface aussi son passé/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Retirer — Client 3/ })).toBeNull();
  });
});

/**
 * UN CLIENT AJOUTÉ PREND LA SUITE, IL NE REMONTE PAS AU DÉBUT.
 *
 * Parti du début de la mission, le remplaçant recouvrait les semaines du client
 * qu'il remplace : le planning comptait deux fois mars, et le brouillon du mois
 * le facturait deux fois.
 */
describe('ajouter un client à une mission qui a travaillé', () => {
  it('le fait commencer aujourd’hui quand personne n’est arrêté', async () => {
    semer({ missions: [mission([atelier(), studio()])] });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: 'Ajouter un client opérationnel' }));
    expect(screen.getByText(/^depuis le 10 juin/)).toBeTruthy();
    await enregistrer(u);

    expect(missionEnregistree().entites[2]?.rythmes[0]?.du).toBe('2026-06-10');
  });

  it('le fait commencer au lendemain de l’arrêt le plus récent', async () => {
    semer({
      missions: [mission([
        atelier({ rythmes: [plage('2026-03-02', '2026-05-13', { lun: 1 })], ajustements: {} }),
        studio()
      ])]
    });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: 'Ajouter un client opérationnel' }));
    await enregistrer(u);

    expect(missionEnregistree().entites[2]?.rythmes[0]?.du).toBe('2026-05-14');
  });

  /**
   * « Arrêter » ne s'offre qu'à partir de deux clients : on ajoute le
   * remplaçant, PUIS on arrête l'autre. Resté à aujourd'hui, le remplaçant
   * laissait un trou entre l'arrêt passé et ce jour.
   */
  it('le fait suivre un arrêt posé après lui, tant que son début est intact', async () => {
    semer({ missions: [mission([atelier()])] });
    render(<Activite />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: /^Missions/ }));
    await screen.findByRole('heading', { name: /^Toutes les missions/ });
    await u.click(within(screen.getByRole('table')).getByRole('button', { name: /Refonte catalogue/ }));
    await u.click(await screen.findByRole('button', { name: 'Ajouter un client opérationnel' }));
    await u.click(screen.getByRole('button', { name: /^Arrêter ce client le… — Atelier Fictif/ }));
    const champ = screen.getByLabelText('Arrêter ce client le');
    await u.clear(champ);
    await u.type(champ, '2026-05-13');
    await u.click(screen.getByRole('button', { name: 'Arrêter le 13 mai' }));

    expect(screen.getByText(/^depuis le 14 mai/)).toBeTruthy();
    await enregistrer(u);
    expect(missionEnregistree().entites[1]?.rythmes[0]?.du).toBe('2026-05-14');
  });

  /** Une mission neuve n'a rien à remplacer : ses clients partent ensemble. */
  it('laisse partir du début de la mission les clients d’une mission neuve', async () => {
    render(<Activite />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: /^Missions/ }));
    await u.click(await screen.findByRole('button', { name: 'Ajouter une mission' }));
    await u.type(await screen.findByLabelText('Client'), 'Agence Fictive');
    await u.type(screen.getByLabelText('Début'), '2026-03-02');
    await u.type(screen.getByLabelText('Fin'), '2026-06-30');
    await u.click(screen.getByRole('button', { name: 'Ajouter un client opérationnel' }));
    await u.click(screen.getByRole('button', { name: 'Ajouter la mission' }));

    expect(useFaits.getState().faits.missions[0]?.entites[1]?.rythmes).toEqual([]);
  });
});

/**
 * UNE FACTURE COMMUNE, OU UNE PAR CLIENT (décision 14).
 *
 * Commune par défaut : c'est ce que l'application faisait, et l'agence en
 * attend une. « Par client » découpe le mois selon les plages ; chaque plage
 * porte son payeur, choisi au carnet — un nom libre, à une lettre près,
 * ferait un brouillon sans adresse.
 */
describe('choisir la facturation', () => {
  it('propose « Une facture commune » par défaut, sans payeur par client', async () => {
    semer({ missions: [mission([atelier(), studio()])] });
    await ouvrirLaMission();
    const choix = screen.getByRole('group', { name: 'Facturation de la mission' });

    expect(within(choix).getByRole('button', { name: 'Une facture commune' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(choix).getByRole('button', { name: 'Une par client' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByLabelText('Studio Fictif — facturée à')).toBeNull();
  });

  it('écrit « par client » et le payeur choisi au carnet sur toutes les plages du client', async () => {
    semer({
      missions: [mission([
        atelier(),
        studio({ rythmes: [plage('2026-03-02', '2026-04-30', { jeu: 1 }), plage('2026-05-01', '2026-06-30', { jeu: 1 })] })
      ])]
    });
    const u = await ouvrirLaMission();
    await u.click(screen.getByRole('button', { name: 'Une par client' }));

    const liste = screen.getByLabelText('Studio Fictif — facturée à') as HTMLSelectElement;
    // Une liste fermée : le payeur de la mission, puis le carnet — rien d'autre.
    expect([...liste.options].map((o) => o.textContent))
      .toEqual(['Agence Fictive', 'Atelier Fictif', 'Studio Fictif']);
    expect(liste.value).toBe('');
    await u.selectOptions(liste, 'Studio Fictif');
    await enregistrer(u);

    const m = missionEnregistree();
    expect(m.facturation).toBe('par_client');
    expect(m.entites[1]?.rythmes.map((r) => r.facturerA)).toEqual(['Studio Fictif', 'Studio Fictif']);
    expect(m.entites[0]?.rythmes[0]?.facturerA ?? null).toBeNull();
  });

  /** Le payeur de la mission s'écrit `null` : le renommer au carnet suffit à le suivre. */
  it('écrit `null` pour le payeur de la mission', async () => {
    semer({
      missions: [mission([
        atelier(),
        studio({ rythmes: [{ ...plage('2026-03-02', '2026-06-30', { jeu: 1 }), facturerA: 'Studio Fictif' }] })
      ], { facturation: 'par_client' })]
    });
    const u = await ouvrirLaMission();
    const liste = screen.getByLabelText('Studio Fictif — facturée à') as HTMLSelectElement;
    expect(liste.value).toBe('Studio Fictif');
    await u.selectOptions(liste, 'Agence Fictive');
    await enregistrer(u);

    expect(missionEnregistree().entites[1]?.rythmes[0]?.facturerA).toBeNull();
  });

  /** Ouvrir puis enregistrer ne doit pas marquer la mission d'un choix que personne n'a fait. */
  it('n’écrit aucun mode tant qu’on n’en a pas choisi', async () => {
    semer({ missions: [mission([atelier(), studio()])] });
    const u = await ouvrirLaMission();
    await enregistrer(u);
    expect(missionEnregistree().facturation).toBeUndefined();
  });
});
