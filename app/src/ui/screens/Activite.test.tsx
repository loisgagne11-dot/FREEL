/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Activite } from './Activite';

afterEach(() => { cleanup(); vi.useRealTimers(); });

/**
 * L'écran s'ouvre sur le mois courant, lu à l'horloge. On la fixe pour que les
 * assertions portent sur un mois connu — juillet 2026 : 23 jours de semaine,
 * dont le 14 férié, soit 22 jours ouvrables.
 */
function figerHorloge(): void {
  // `shouldAdvanceTime` laisse le temps s'écouler malgré l'horloge figée :
  // sans lui, les délais internes de `userEvent` n'arrivent jamais à terme et
  // chaque interaction expire.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-07-15T09:00:00Z'));
}

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...modifications } });
}

beforeEach(() => { figerHorloge(); semer(); });

const mission = (m: Partial<Faits['missions'][number]> = {}) => ({
  id: 'mis-1', clientId: null, clientNom: 'ClientA', description: 'Mission A',
  tjm: euros(400), debut: dateISO('2026-01-05'), fin: null,
  statut: 'active' as const, entites: [entite()], ...m
});

/**
 * Un client opérationnel. Depuis le schéma 4, c'est LUI qui porte le rythme et
 * les ajustements : une mission peut en avoir plusieurs, chacun avec le sien.
 */
const entite = (e: Partial<Faits['missions'][number]['entites'][number]> = {}) => ({
  id: 'mis-1-co1', nom: 'ClientA', couleur: '', adresse: '', contact: '',
  email: '', telephone: '', rythmes: [], ajustements: {}, ...e
});

/**
 * Des ajustements écrits par leur seule quotité.
 *
 * Depuis le schéma 14, un ajustement porte aussi un créneau et un lieu. Aucun
 * des tests d'ici ne les regarde : les écrire à chaque ligne laisserait croire
 * qu'ils pèsent sur ce qu'on mesure.
 */
const poses = (quotites: Record<string, number>) =>
  Object.fromEntries(Object.entries(quotites).map(([d, quotite]) => [d, { quotite }]));

/**
 * Le geste courant du plan de charge, depuis que le clic ouvre un éditeur.
 *
 * Il en faut UN, partagé : ces trois étapes — cliquer la moitié, choisir le
 * type, enregistrer — se répètent dans une douzaine de tests, et trois d'entre
 * eux écrits à la main finiraient par ne plus décrire le même geste.
 */
async function editer(
  utilisateur: ReturnType<typeof userEvent.setup>,
  nomDeLaMoitie: RegExp,
  { type, portee, qui }: {
    readonly type?: 'Travail' | 'Congé' | 'Libre';
    readonly portee?: 'Matin' | 'Après-midi' | 'Journée';
    readonly qui?: string;
  } = {}
): Promise<void> {
  // `getAllBy…[0]` : sur la semaine, quatorze moitiés portent « libre ». Les
  // tests qui visent une journée précise passent une expression qui la nomme ;
  // ceux à qui n'importe quelle moitié libre convient prennent la première.
  await utilisateur.click(screen.getAllByRole('button', { name: nomDeLaMoitie })[0]!);
  if (portee !== undefined) {
    await utilisateur.click(screen.getByRole('button', { name: portee }));
  }
  if (type !== undefined) await utilisateur.click(screen.getByRole('button', { name: type }));
  if (qui !== undefined) await utilisateur.click(screen.getByRole('button', { name: qui }));
  await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));
}

const recette = (m: Partial<Faits['recettes'][number]> = {}) => ({
  id: 'rec-1', clientNom: 'ClientA', libelle: 'Facture', montant: euros(4000),
  emiseLe: dateISO('2026-07-10'), encaisseeLe: null,
  modeReglement: null, numero: '2026-001', ...m
});

describe('plan de charge', () => {
  /**
   * L'ancienne application divisait par 20, une constante : un mois de mai à
   * 19 jours ouvrés donnait 95 % à qui avait travaillé tous les jours.
   *
   * Le nombre a quitté sa tuile d'en-tête pour la carte des congés — c'est là
   * qu'il se lit, à côté des fériés et des congés qui le composent. Ce que ce
   * test tient n'a pas changé : le dénominateur est celui du mois RÉEL.
   */
  it('affiche les jours ouvrables réels du mois', () => {
    render(<Activite />);
    // Juillet 2026 : 23 jours de semaine, moins le 14 juillet (mardi). Le
    // dénominateur se lit sous la jauge d'occupation, avec le férié qui
    // l'explique — la carte des congés qui les portait a été retirée.
    expect(screen.getByText(/\/ 22\s?j ouvrés/u)).toBeTruthy();
    expect(screen.getByText('Jours fériés du mois').nextSibling?.textContent).toBe('1');
  });

  /**
   * LE LIBELLÉ SUIT LA SOURCE, ET C'EST TOUT L'OBJET DE CE TEST.
   *
   * Sans rythme saisi, les journées se déduisent d'un montant divisé par un
   * tarif : ce sont des ÉQUIVALENT-JOURS, une estimation. Les annoncer comme
   * des jours travaillés ferait passer une déduction pour une mesure.
   *
   * Le chiffre a quitté sa tuile pour le repère de l'en-tête — un seul endroit
   * au lieu de trois cartes qu'il fallait dépasser pour atteindre la grille.
   */
  it('convertit les recettes du mois en équivalent-jours', () => {
    semer({ missions: [mission()], recettes: [recette()] });
    render(<Activite />);
    // 4 000 € à 400 € par jour → 10 jours, annoncés comme une estimation.
    const repere = screen.getByText(/équivalent-jours/);
    expect(repere.textContent).toMatch(/10\s?j/u);
  });

  /**
   * L'OCCUPATION A QUITTÉ LES TUILES POUR « LE MOIS EN CHIFFRES ».
   *
   * Elle s'affichait aux deux endroits, et les deux ne calculaient pas la même
   * chose. Le panneau la garde parce qu'il a la place d'écrire son
   * dénominateur — sans lui, « 45 % » ne se compare pas d'un mois à l'autre.
   * Le RAPPORT lui-même, lui, ne change pas : c'est ce que ce test tient.
   */
  it('rapporte les jours facturés aux jours ouvrables', () => {
    semer({ missions: [mission()], recettes: [recette()] });
    render(<Activite />);
    // 10 / 22 ≈ 45 %.
    expect(screen.getByText('Occupation').parentElement?.textContent).toMatch(/45\s?%/u);
    expect(screen.getByText(/10 \/ 22\s?j ouvrés/u)).toBeTruthy();
  });

  // Les compter à un tarif supposé fabriquerait de l'occupation.
  it('signale les recettes dont le tarif journalier est inconnu', () => {
    semer({ recettes: [recette()] });
    render(<Activite />);
    expect(screen.getByText(/pas de tarif journalier connu/)).toBeTruthy();
    expect(screen.getByText(/équivalent-jours/).textContent).toMatch(/0\s?j/u);
  });

  it('n’affiche aucune occupation quand aucun jour n’est ouvrable', () => {
    const toutJuillet = Array.from(
      { length: 31 },
      (_, i) => ({ date: dateISO(`2026-07-${String(i + 1).padStart(2, '0')}`), quotite: 1 })
    );
    semer({ conges: toutJuillet });
    render(<Activite />);
    const ligne = screen.getByText('Occupation').parentElement;
    expect(ligne?.textContent).toContain('—');
    expect(ligne?.textContent).not.toMatch(/0\s?%/u);
  });
});

/**
 * LE CONGÉ SE POSE SUR LE PLAN DE CHARGE, ET PLUS SUR UNE SECONDE GRILLE.
 *
 * Une carte « Congés du mois » portait son propre calendrier, sous celui du
 * plan de charge : deux trames de trente cases pour le même mois. Elle
 * existait parce que le clic sur le plan de charge ne savait que basculer du
 * travail. Depuis que ce clic ouvre un éditeur à trois réponses — travail,
 * congé, libre — elle ne répondait plus à aucune question que la première ne
 * traitait déjà.
 *
 * Ces tests-là ne mesurent donc plus la grille disparue, mais le geste qui l'a
 * remplacée : c'est le même effet sur les mêmes chiffres, par un autre chemin.
 */
describe('congé posé depuis le plan de charge', () => {
  const ouvrirSemaine = async () => {
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: 'Semaine' }));
    return utilisateur;
  };

  // La modale de l'ancienne version empêchait de voir en même temps les jours
  // posés et leur effet sur l'occupation — la seule question qui se pose. La
  // grille reste dans la page ; seul l'éditeur s'ouvre en panneau.
  it('laisse la grille dans la page', () => {
    render(<Activite />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Vue du planning' })).toBeTruthy();
  });

  it('pose un congé sur la journée entière, et le retire', async () => {
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();

    await editer(utilisateur, /13 juil\. 2026, matin/, { portee: 'Journée', type: 'Congé' });
    expect(useFaits.getState().faits.conges).toEqual([
      { date: '2026-07-13', quotite: 1 }
    ]);

    await editer(utilisateur, /13 juil\. 2026, matin/, { portee: 'Journée', type: 'Libre' });
    expect(useFaits.getState().faits.conges).toEqual([]);
  });

  /**
   * LA DEMI-JOURNÉE DE CONGÉ, QUE LA GRILLE DISPARUE NE SAVAIT PAS POSER.
   *
   * Son calendrier basculait la journée entière : une matinée de congé
   * s'arrondissait à un jour, et le solde grossissait de moitié sans que rien
   * ne le dise. C'est ce que l'éditeur rend enfin atteignable.
   */
  it('pose une demi-journée de congé', async () => {
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();

    await editer(utilisateur, /13 juil\. 2026, matin/, { type: 'Congé' });
    expect(useFaits.getState().faits.conges).toEqual([
      { date: '2026-07-13', quotite: 0.5 }
    ]);
  });

  it('fait baisser les jours ouvrables et monter l’occupation', async () => {
    semer({ missions: [mission()], recettes: [recette()] });
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();

    await editer(utilisateur, /13 juil\. 2026, matin/, { portee: 'Journée', type: 'Congé' });

    // 10 / 21 ≈ 48 %. Le congé sort du DÉNOMINATEUR : le même travail sur
    // moins de jours disponibles fait monter l'occupation, ce qui est le sens
    // de la mesure.
    expect(screen.getByText(/\/ 21\s?j ouvrés/u)).toBeTruthy();
    expect(screen.getByText('Occupation').parentElement?.textContent).toMatch(/48\s?%/u);
  });

  /**
   * Un férié et un week-end restent CLIQUABLES — les astreintes et les rendus
   * de nuit existent, et l'ancienne application les déclarait déjà. Ce qui ne
   * doit pas arriver, c'est qu'un congé posé là consomme un jour : il n'en
   * retire aucun du dénominateur, puisqu'il n'y était pas.
   */
  it('ne consomme rien quand le congé tombe un jour férié', async () => {
    semer({ missions: [mission()], recettes: [recette()] });
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();

    await editer(utilisateur, /14 juil\. 2026, matin/, { portee: 'Journée', type: 'Congé' });
    expect(screen.getByText(/\/ 22\s?j ouvrés/u)).toBeTruthy();
  });

  it('compte les congés de l’année entière, pas seulement du mois affiché', () => {
    semer({ conges: [
      { date: dateISO('2026-02-16'), quotite: 1 },
      { date: dateISO('2026-08-10'), quotite: 1 },
      { date: dateISO('2025-12-24'), quotite: 1 }
    ] });
    render(<Activite />);
    // Le cumul de l'ANNÉE a suivi la carte disparue jusque dans « Le mois en
    // chiffres » : c'est le seul endroit où il se lit, et le mois affiché n'y
    // répond pas.
    expect(screen.getByText('Congés posés dans l’année').nextSibling?.textContent).toBe('2');
  });
});

describe('navigation entre les mois', () => {
  /**
   * L'écran s'ouvre sur la SEMAINE, la maille où l'on corrige — donc les
   * flèches déplacent une semaine. On bascule sur le mois pour les tests qui
   * portent sur la navigation mensuelle : c'est le geste que fait
   * l'utilisateur, et le tester par ce chemin-là le vérifie vraiment.
   */
  const enVueMois = async () => {
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: /Mois/ }));
    return utilisateur;
  };

  // L'ancienne application recalculait tout sur « le mois courant » lu à
  // l'affichage : consulter un mois passé supposait de changer l'horloge.
  it('permet de reculer et d’avancer', async () => {
    render(<Activite />);
    const utilisateur = await enVueMois();

    await utilisateur.click(screen.getByRole('button', { name: 'Mois précédent' }));
    expect(screen.getByRole('status', { name: 'Période affichée' }).textContent).toBe('juin 2026');

    await utilisateur.click(screen.getByRole('button', { name: 'Mois suivant' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Mois suivant' }));
    expect(screen.getByRole('status', { name: 'Période affichée' }).textContent).toBe('août 2026');
  });

  it('franchit correctement le passage à l’année', async () => {
    render(<Activite />);
    const utilisateur = await enVueMois();
    for (let i = 0; i < 6; i++) {
      await utilisateur.click(screen.getByRole('button', { name: 'Mois suivant' }));
    }
    expect(screen.getByRole('status', { name: 'Période affichée' }).textContent).toBe('janvier 2027');
  });
});

describe('missions', () => {
  it('montre ce que chaque mission a facturé et encaissé', async () => {
    semer({
      missions: [mission()],
      recettes: [
        recette({ id: 'r1', montant: euros(4000), encaisseeLe: dateISO('2026-07-20') }),
        recette({ id: 'r2', montant: euros(2000), encaisseeLe: null })
      ]
    });
    render(<Activite />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('tab', { name: /^Missions/ }));
    await screen.findByRole('heading', { name: /^Missions/ });

    const liste = screen.getByRole('list');
    expect(within(liste).getByText('Mission A')).toBeTruthy();
    // Les montants sont marqués pour le mode confidentialité, donc portés par
    // leur propre élément : on interroge le texte de la ligne entière plutôt
    // qu'un nœud unique.
    expect(liste.textContent).toMatch(/Encaissé\s*4\s000/u);
    expect(liste.textContent).toMatch(/Reste\s*2\s000/u);
  });

  it('signale un TJM absent au lieu d’en supposer un', async () => {
    semer({ missions: [mission({ tjm: euros(0) })] });
    render(<Activite />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('tab', { name: /^Missions/ }));
    expect(screen.getByText('TJM non renseigné')).toBeTruthy();
  });
});

describe('délais de paiement', () => {
  it('affiche le délai médian et l’encours par client', async () => {
    semer({
      recettes: [
        recette({ id: 'r1', emiseLe: dateISO('2026-01-01'), encaisseeLe: dateISO('2026-02-01') }),
        recette({ id: 'r2', emiseLe: dateISO('2026-03-01'), encaisseeLe: dateISO('2026-04-01') }),
        recette({ id: 'r3', montant: euros(5000), emiseLe: dateISO('2026-04-01'), encaisseeLe: null })
      ]
    });
    render(<Activite />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('tab', { name: /^Clients/ }));
    // L'onglet est chargé à la demande : attendre son arrivée.
    await screen.findByRole('heading', { name: /Carnet/ });

    expect(screen.getByText('31 j en médiane')).toBeTruthy();
    expect(screen.getByText('5 000 €')).toBeTruthy();
    expect(screen.getByText(/au-delà de son délai habituel/)).toBeTruthy();
  });

  // Accuser un client sans référence serait pire que se taire.
  it('ne mesure rien quand aucune facture n’a été réglée', async () => {
    semer({ recettes: [recette({ encaisseeLe: null })] });
    render(<Activite />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('tab', { name: /^Clients/ }));
    await screen.findByRole('heading', { name: /Carnet/ });

    expect(screen.getByText('Délai non mesurable')).toBeTruthy();
    expect(screen.queryByText(/au-delà de son délai habituel/)).toBeNull();
  });
});

/**
 * La dépendance client.
 *
 * Perdre un client qui pèse 60 % du chiffre d'affaires ne se rattrape pas en
 * un trimestre. C'est une des rares choses qu'une application de comptabilité
 * peut voir venir — à condition de la mesurer et de la montrer.
 */
describe('le mois en chiffres', () => {
  it('mesure le poids de chaque client dans l’année', () => {
    semer({
      recettes: [
        recette({ id: 'r1', clientNom: 'Client A', montant: euros(7500), encaisseeLe: dateISO('2026-03-10') }),
        recette({ id: 'r2', clientNom: 'Client B', montant: euros(2500), encaisseeLe: dateISO('2026-04-10') })
      ]
    });
    render(<Activite />);

    expect(screen.getByText('Client A')).toBeTruthy();
    expect(screen.getByText('75 %')).toBeTruthy();
    expect(screen.getByText('25 %')).toBeTruthy();
  });

  /**
   * Sur l'année, pas sur le mois. Un client peut ne rien régler en août sans
   * que la dépendance ait bougé — mesurée sur un seul mois, la concentration
   * sauterait d'un client à l'autre au gré des règlements.
   */
  it('compte les encaissements de toute l’année, pas du seul mois affiché', () => {
    semer({
      recettes: [
        recette({ id: 'r1', clientNom: 'Client A', montant: euros(5000), encaisseeLe: dateISO('2026-01-15') })
      ]
    });
    render(<Activite />);
    expect(screen.getByText('Client A')).toBeTruthy();
    expect(screen.getByText('100 %')).toBeTruthy();
  });

  // Sans encaissement, la mesure n'existe pas : afficher « 0 % » pour un
  // client suggérerait qu'il en a un.
  it('dit que la dépendance ne se mesure pas encore', () => {
    semer({ recettes: [] });
    render(<Activite />);
    expect(screen.getByText(/ne se mesure pas encore/)).toBeTruthy();
  });
});

/**
 * La vue semaine.
 *
 * Le rythme remplit le mois d'un coup ; ce qu'on corrige, on le corrige à la
 * semaine, parce que c'est l'horizon dont on se souvient. Une grille de
 * trente-et-un jours oblige à retrouver le bon — et une correction qu'on
 * renonce à faire est un CRA faux.
 */
describe('vue semaine', () => {
  const avecRythme = () => mission({
    entites: [entite({
      rythmes: [{
        du: dateISO('2026-01-01'), au: dateISO('2026-12-31'),
        parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 0.5 },
        tjm: euros(400)
      }]
    })]
  });

  const ouvrirSemaine = async () => {
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: 'Semaine' }));
    return utilisateur;
  };

  it('remplit la semaine depuis le rythme, sans rien saisir', async () => {
    semer({ missions: [avecRythme()] });
    render(<Activite />);
    await ouvrirSemaine();
    // Semaine du 13 juillet 2026 : lundi, mercredi et jeudi pleins, vendredi
    // à mi-temps — le mardi 14 est férié et ne se travaille pas.
    expect(screen.getByText(/3,5/u)).toBeTruthy();
  });

  // En vue semaine, avancer d'un mois ferait sauter quatre semaines : la
  // flèche cesserait de vouloir dire « la suivante ».
  it('fait avancer les flèches d’une semaine, pas d’un mois', async () => {
    semer({ missions: [avecRythme()] });
    render(<Activite />);
    await ouvrirSemaine();
    expect(screen.getByRole('button', { name: 'Semaine suivante' })).toBeTruthy();
  });

  /**
   * LE CLIC VISE UNE MOITIÉ, ET LA MOITIÉ VISÉE EST CELLE QUI BOUGE.
   *
   * L'écran faisait tourner la JOURNÉE — entière, demie, rien, retour au
   * rythme — et « demie » remplissait toujours le matin : retirer une matinée
   * en gardant l'après-midi était impossible. Le schéma 14 donne la position,
   * et le geste la suit.
   */
  it('retire la moitié cliquée et laisse l’autre', async () => {
    semer({ missions: [avecRythme()] });
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();

    const ajustements = () =>
      useFaits.getState().faits.missions[0]?.entites[0]?.ajustements ?? {};

    await editer(utilisateur, /13 juil\. 2026, matin/, { type: 'Libre' });
    expect(ajustements()['2026-07-13']?.quotite).toBe(0.5);
    expect(ajustements()['2026-07-13']?.creneaux).toEqual(['apresMidi']);

    await editer(utilisateur, /13 juil\. 2026, après-midi/, { type: 'Libre' });
    expect(ajustements()['2026-07-13']?.quotite).toBe(0);
    expect(ajustements()['2026-07-13']?.creneaux).toEqual([]);
  });

  /**
   * Revenir exactement à ce que le rythme prévoit EFFACE l'ajustement, au lieu
   * d'en poser un qui dit la même chose. C'est ce que le troisième état du
   * cycle tenait vraiment : sans lui, une correction annulée à la main
   * laisserait derrière elle un ajustement invisible — jusqu'au jour où le
   * rythme change et où cette journée-là ne suit pas.
   */
  it('efface l’ajustement quand la journée retombe sur le rythme', async () => {
    semer({ missions: [avecRythme()] });
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();

    const ajustements = () =>
      useFaits.getState().faits.missions[0]?.entites[0]?.ajustements ?? {};

    await editer(utilisateur, /13 juil\. 2026, matin/, { type: 'Libre' });
    expect(ajustements()).toHaveProperty('2026-07-13');
    // Redonner la matinée au même client remet la journée sur le rythme :
    // l'ajustement doit DISPARAÎTRE, pas dire la même chose que le rythme.
    await editer(utilisateur, /13 juil\. 2026, matin/, { type: 'Travail' });
    expect(ajustements()).not.toHaveProperty('2026-07-13');
  });

  it('revient au calendrier mensuel', async () => {
    semer({ missions: [avecRythme()] });
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();
    await utilisateur.click(screen.getByRole('button', { name: 'Mois' }));
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeTruthy();
  });
});

/**
 * Le compte rendu d'activité — le livrable de fin de mois.
 *
 * Rien ne s'y saisit : il découle du rythme et des ajustements. Le saisir une
 * seconde fois serait l'occasion de le saisir autrement, et un CRA qui
 * contredit le planning ne prouve rien.
 */
describe('compte rendu d’activité', () => {
  const avecRythmeCra = () => mission({
    tjm: euros(400),
    entites: [entite({
      rythmes: [{
        du: dateISO('2026-01-01'), au: dateISO('2026-12-31'),
        parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 0.5 },
        tjm: euros(400)
      }]
    })]
  });

  it('se remplit tout seul depuis le rythme', () => {
    semer({ missions: [avecRythmeCra()] });
    render(<Activite />);
    // Juillet 2026 : lundis à jeudis pleins, vendredis à mi-temps, moins le
    // 14 juillet férié. Le décompte se lit sur la carte, sans rien saisir.
    const carte = screen.getByRole('region', { name: /Compte-rendu d’activité/ });
    expect(carte.textContent).toMatch(/jours? travaillés?/);
    expect(carte.textContent).toMatch(/19,5/u);
  });

  it('propose l’impression sans bibliothèque PDF', () => {
    semer({ missions: [avecRythmeCra()] });
    render(<Activite />);
    expect(screen.getByRole('button', { name: /Imprimer ou enregistrer en PDF/ })).toBeTruthy();
  });

  /**
   * Un CRA vide n'est pas un livrable, c'est un document qu'on envoie par
   * erreur. Sans jour travaillé, l'écran le dit et n'offre pas d'imprimer.
   */
  it('n’offre pas d’imprimer un mois sans activité', () => {
    semer({ missions: [mission()] }); // sans rythme
    render(<Activite />);
    expect(screen.queryByRole('button', { name: /Imprimer ou enregistrer/ })).toBeNull();
    expect(screen.getByText(/Aucun jour travaillé/)).toBeTruthy();
  });

  // Le CRA découle du planning : une journée effacée là-bas disparaît ici.
  it('suit les ajustements posés au planning', () => {
    const sansRien = mission({
      tjm: euros(400),
      entites: [entite({
        rythmes: [{
          du: dateISO('2026-07-01'), au: dateISO('2026-07-31'),
          parJour: { lun: 1 }, tjm: euros(400)
        }],
        ajustements: poses({
          '2026-07-06': 0, '2026-07-13': 0, '2026-07-20': 0, '2026-07-27': 0
        })
      })]
    });
    semer({ missions: [sansRien] });
    render(<Activite />);
    expect(screen.getByText(/Aucun jour travaillé/)).toBeTruthy();
  });
});

/**
 * UN CRÉNEAU VIDE NE DIT PAS À QUI LA JOURNÉE APPARTIENT.
 *
 * La première version en choisissait une en silence — la première mission
 * active. C'est ce que cette application refuse partout ailleurs : l'écran
 * propose, l'utilisateur tranche. Une journée rattachée au mauvais client
 * fausse DEUX comptes rendus d'un coup — celui qui la reçoit à tort, et celui
 * à qui elle manque — et rien ne le signale.
 */
describe('journée déclarée sur un créneau vide', () => {
  const ouvrirSemaine = async () => {
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: 'Semaine' }));
    return utilisateur;
  };

  const deuxMissions = () => [
    mission({ id: 'mis-1', description: 'Mission A', entites: [entite({ id: 'a1' })] }),
    mission({ id: 'mis-2', description: 'Mission B', entites: [entite({ id: 'b1' })] })
  ];

  /**
   * LE CLIENT SE CHOISIT, IL NE SE DEVINE PAS.
   *
   * Une version en prenait un en silence — la première mission active. Une
   * journée rattachée au mauvais client fausse DEUX comptes rendus d'un coup :
   * celui qui la reçoit à tort et celui à qui elle manque, et rien ne le dit.
   */
  it('propose les missions en cours, et n’en pose aucune d’office', async () => {
    semer({ missions: deuxMissions() });
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();

    await utilisateur.click(screen.getAllByRole('button', { name: /, libre$/ })[0]!);

    expect(screen.getByRole('button', { name: 'Mission A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mission B' })).toBeTruthy();
    // Rien n'a été posé tant qu'on n'a pas enregistré : ouvrir l'éditeur par
    // erreur ne doit coûter qu'une fermeture.
    expect(useFaits.getState().faits.missions.flatMap((m) => m.entites)
      .every((e) => Object.keys(e.ajustements).length === 0)).toBe(true);
  });

  it('pose la journée sur la mission choisie, et sur elle seule', async () => {
    semer({ missions: deuxMissions() });
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();

    await editer(utilisateur, /, libre$/, { type: 'Travail', qui: 'Mission B' });

    const missions = useFaits.getState().faits.missions;
    expect(Object.keys(missions[0]?.entites[0]?.ajustements ?? {})).toHaveLength(0);
    expect(Object.keys(missions[1]?.entites[0]?.ajustements ?? {})).toHaveLength(1);
  });

  /**
   * LE GESTE QUI CORRIGE UNE JOURNÉE ET DEMIE, ET C'EST LE POINT DUR DU LOT.
   *
   * Deux rythmes qui prévoient tous deux le lundi donnent 1,5 journée sur un
   * seul lundi : l'occupation passe au-dessus de 100 % et le CRA facturerait
   * du temps qui n'a pas existé. Le clic-bascule d'avant ne pouvait
   * qu'AJOUTER une moitié, jamais la retirer à quelqu'un d'autre.
   *
   * Attribuer la matinée à B la retire donc à A. C'est la seule façon de
   * défaire le doublon depuis l'écran.
   */
  it('retire la moitié à celui qui la tenait quand on l’attribue à un autre', async () => {
    const rythmeLundi = (id: string) => entite({
      id,
      rythmes: [{
        du: dateISO('2026-01-01'), au: dateISO('2026-12-31'),
        parJour: { lun: 1 }, tjm: euros(400)
      }]
    });
    semer({ missions: [
      mission({ id: 'mis-1', description: 'Mission A', entites: [rythmeLundi('a1')] }),
      mission({ id: 'mis-2', description: 'Mission B', entites: [rythmeLundi('b1')] })
    ] });
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();

    await editer(utilisateur, /13 juil\. 2026, matin/, { type: 'Travail', qui: 'Mission B' });

    const missions = useFaits.getState().faits.missions;
    // A rend la matinée et garde son après-midi ; B la prend et garde la
    // sienne. Le lundi vaut de nouveau une journée, pas deux.
    expect(missions[0]?.entites[0]?.ajustements['2026-07-13']?.creneaux)
      .toEqual(['apresMidi']);
    expect(missions[1]?.entites[0]?.ajustements['2026-07-13']).toBeUndefined();
  });

  /** Le lieu ne se pose pas d'office : « 78 % de télétravail » se calcule sur
      les demi-journées DOCUMENTÉES, et un lieu inventé la fausserait. */
  it('n’enregistre aucun lieu tant qu’on n’en choisit pas', async () => {
    semer({ missions: [mission()] });
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();

    await editer(utilisateur, /, libre$/, { type: 'Travail' });
    const pose = Object.values(
      useFaits.getState().faits.missions[0]?.entites[0]?.ajustements ?? {}
    )[0];
    expect(pose?.lieu).toBeUndefined();
  });

  it('enregistre le lieu quand on le choisit', async () => {
    semer({ missions: [mission()] });
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();

    await utilisateur.click(screen.getAllByRole('button', { name: /, libre$/ })[0]!);
    await utilisateur.click(screen.getByRole('button', { name: 'Travail' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Sur site' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const pose = Object.values(
      useFaits.getState().faits.missions[0]?.entites[0]?.ajustements ?? {}
    )[0];
    expect(pose?.lieu).toBe('sur_site');
  });
});

/**
 * DÉFAIRE UNE SEMAINE DE CORRECTIONS.
 *
 * `resetReelsToTheorique` de l'ancienne application. Son pendant
 * `fillAllDays` n'a PAS été repris et n'a pas à l'être : ici le planning se
 * remplit déjà tout seul depuis le rythme, c'est le modèle même. Remplir à la
 * main n'aurait de sens que sur un planning vide — et un planning vide se
 * remplit en déclarant un rythme, pas en cliquant trente et une fois.
 *
 * Retirer les corrections, en revanche, reste nécessaire : un rythme changé
 * après coup laisse derrière lui des ajustements devenus faux.
 */
describe('revenir au rythme sur une semaine', () => {
  const avecRythmeSemaine = () => mission({
    entites: [entite({
      rythmes: [{
        du: dateISO('2026-01-01'), au: dateISO('2026-12-31'),
        parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 },
        tjm: euros(400)
      }]
    })]
  });

  const ouvrirSemaine = async () => {
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: 'Semaine' }));
    return utilisateur;
  };

  // Un bouton toujours là qui ne fait rien apprend à ne plus le regarder.
  it('ne s’affiche que si la semaine porte une correction', async () => {
    semer({ missions: [avecRythmeSemaine()] });
    render(<Activite />);
    await ouvrirSemaine();

    expect(screen.queryByRole('button', { name: /Revenir au rythme/ })).toBeNull();
  });

  it('efface les corrections de la semaine, et d’elle seule', async () => {
    semer({
      missions: [mission({
        entites: [entite({
          rythmes: [{
            du: dateISO('2026-01-01'), au: dateISO('2026-12-31'),
            parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 }, tjm: euros(400)
          }],
          // Deux corrections dans la semaine du 13/07, une hors de cette semaine.
          ajustements: poses({ '2026-07-13': 0, '2026-07-14': 0.5, '2026-06-01': 0 })
        })]
      })]
    });
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();

    await utilisateur.click(screen.getByRole('button', { name: /Revenir au rythme/ }));

    const ajustements = useFaits.getState().faits.missions[0]?.entites[0]?.ajustements ?? {};
    expect(ajustements).toEqual({ '2026-06-01': { quotite: 0 } });
  });

  /**
   * « Revenir au rythme » n'est pas « mettre à zéro » : la journée redevient
   * ce que le rythme prévoit. Les confondre rendrait le geste destructeur.
   */
  it('rend les journées au rythme, pas à zéro', async () => {
    semer({
      missions: [mission({
        entites: [entite({
          rythmes: [{
            du: dateISO('2026-01-01'), au: dateISO('2026-12-31'),
            parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 }, tjm: euros(400)
          }],
          ajustements: poses({ '2026-07-13': 0 })
        })]
      })]
    });
    render(<Activite />);
    const utilisateur = await ouvrirSemaine();
    await utilisateur.click(screen.getByRole('button', { name: /Revenir au rythme/ }));

    // Le lundi 13 juillet redevient travaillé sur ses DEUX moitiés, comme le
    // rythme le dit. Le remettre à zéro laisserait les deux à « libre ».
    expect(screen.getByRole('button', { name: /13 juil\. 2026, matin, ClientA/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /13 juil\. 2026, après-midi, ClientA/ }))
      .toBeTruthy();
  });
});

/**
 * POSER UNE PLAGE DE CONGÉS — L'ACTION QUI EXISTAIT SANS PORTE D'ENTRÉE.
 *
 * `poserPlageDeConges` vivait dans le magasin depuis le début, testée, et aucun
 * écran ne l'appelait : le calendrier ne posait qu'un jour à la fois. Trois
 * semaines de vacances coûtaient vingt et un clics, et la demi-journée — que le
 * schéma porte depuis la v2 et que le solde compte correctement — était
 * inatteignable.
 *
 * Même famille de défaut que les quatre actions non câblées du 13/08 : une
 * action du magasin est une promesse d'interface.
 */
describe('poser une plage de congés', () => {
  async function saisirPlage(du: string, au: string) {
    const utilisateur = userEvent.setup();
    await utilisateur.type(screen.getByLabelText('Du'), du);
    await utilisateur.type(screen.getByLabelText('Au'), au);
    return utilisateur;
  }

  it('pose une semaine entière d’un seul geste', async () => {
    render(<Activite />);
    // Lundi 6 au vendredi 10 juillet 2026.
    const utilisateur = await saisirPlage('2026-07-06', '2026-07-10');
    await utilisateur.click(screen.getByRole('button', { name: 'Poser ces congés' }));

    expect(useFaits.getState().faits.conges).toHaveLength(5);
  });

  /**
   * LE POINT QUI COMPTE. Un congé posé un dimanche gonflerait le solde et le
   * dénominateur d'occupation sans correspondre à rien.
   */
  it('n’enregistre ni les week-ends ni les fériés', async () => {
    render(<Activite />);
    // Du lundi 13 au vendredi 17 juillet : le 14 est férié, les 18-19 hors plage.
    const utilisateur = await saisirPlage('2026-07-13', '2026-07-17');
    await utilisateur.click(screen.getByRole('button', { name: 'Poser ces congés' }));

    const dates = useFaits.getState().faits.conges.map((c) => c.date);
    expect(dates).not.toContain('2026-07-14');
    expect(dates).toHaveLength(4);
  });

  /**
   * Le compte est annoncé AVANT le geste : découvrir après coup qu'on a posé
   * six jours de plus que voulu oblige à défaire à la main ce qu'on croyait
   * avoir fait d'un coup.
   */
  it('annonce le nombre de jours retenus avant de les poser', async () => {
    render(<Activite />);
    await saisirPlage('2026-07-06', '2026-07-19');
    // Deux semaines calendaires : dix jours de semaine, moins le 14 juillet
    // qui tombe un mardi. Neuf, pas dix — c'est exactement la soustraction
    // qu'on ne fait pas de tête en posant ses vacances.
    expect(screen.getByText(/9 jours ouvrés/)).toBeTruthy();
  });

  // La demi-journée existe au schéma et dans le solde ; elle n'avait aucune
  // commande.
  it('sait poser des demi-journées', async () => {
    render(<Activite />);
    const utilisateur = await saisirPlage('2026-07-06', '2026-07-07');
    await utilisateur.click(screen.getByLabelText('Demi-journées'));
    await utilisateur.click(screen.getByRole('button', { name: 'Poser ces congés' }));

    expect(useFaits.getState().faits.conges.every((c) => c.quotite === 0.5)).toBe(true);
  });

  // Corriger une erreur de saisie doit coûter le même geste que la faire.
  it('retire une plage aussi facilement qu’elle la pose', async () => {
    semer({ conges: [
      { date: dateISO('2026-07-06'), quotite: 1 },
      { date: dateISO('2026-07-07'), quotite: 1 }
    ] });
    render(<Activite />);
    const utilisateur = await saisirPlage('2026-07-06', '2026-07-07');
    await utilisateur.click(screen.getByRole('button', { name: 'Les retirer' }));

    expect(useFaits.getState().faits.conges).toHaveLength(0);
  });

  // Un bouton actif sur une plage vide invite à un geste sans effet.
  it('n’offre rien à poser sur un week-end seul', async () => {
    render(<Activite />);
    await saisirPlage('2026-07-11', '2026-07-12');
    expect(screen.getByText(/Aucun jour ouvré/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Poser ces congés' }))
      .toHaveProperty('disabled', true);
  });
});

/**
 * LA PRÉVISION DE REVENU — LE PREMIER MAILLON DE LA CHAÎNE.
 *
 * Une mission doit se décliner en prévision de revenu, planning, facture du
 * mois et CRA. Le planning et le CRA existaient ; la prévision non : le tarif
 * journalier et le rythme étaient là, et rien n'en tirait ce qu'ils annoncent.
 */
describe('prévision de revenu du mois', () => {
  const avecRythme = () => mission({
    tjm: euros(400),
    entites: [entite({
      rythmes: [{
        du: dateISO('2026-01-01'), au: dateISO('2026-12-31'), tjm: euros(400),
        parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 }
      }]
    })]
  });

  it('chiffre ce que le mois devrait rapporter', () => {
    semer({ missions: [avecRythme()] });
    render(<Activite />);
    // Juillet 2026 : 22 jours ouvrables à 400 € = 8 800 €. Le montant paraît
    // deux fois — prévu et retenu — puisqu'aucun ajustement n'a été posé.
    expect(screen.getAllByText(/8\s*800/u).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /devrait rapporter/ })).toBeTruthy();
  });

  /**
   * LE POINT QUI COMPTE. Prévu et retenu côte à côte : sans les deux, la
   * question « est-ce que je tiens ce que j'avais prévu ? » disparaît.
   *
   * On lit la ligne de mission, pas la synthèse : celle-ci ne s'affiche que
   * carte repliée, et les cartes s'ouvrent dépliées.
   */
  it('montre le retenu en face du prévu, mission par mission', () => {
    semer({ missions: [avecRythme()] });
    render(<Activite />);
    // 22 jours retenus sur 22 prévus : aucun ajustement n'a été posé.
    expect(screen.getByText('22 / 22 j')).toBeTruthy();
  });

  /**
   * Repliée, la carte dit encore l'essentiel — c'est la règle du pli. Les deux
   * totaux y sont, et l'écart n'apparaît que s'il y en a un.
   */
  it('résume les deux totaux une fois repliée', async () => {
    semer({ missions: [avecRythme()] });
    render(<Activite />);
    await userEvent.setup().click(
      screen.getByRole('button', { name: /devrait rapporter/ })
    );

    const resume = screen.getByText(/prévus/);
    expect(resume.textContent).toMatch(/retenus/);
  });

  // Sans rythme, aucune journée n'est prévue : la carte n'a rien à dire et ne
  // s'affiche pas plutôt que d'annoncer zéro.
  it('ne s’affiche pas sans rythme saisi', () => {
    semer({ missions: [mission()] });
    render(<Activite />);
    expect(screen.queryByText(/devrait rapporter/)).toBeNull();
  });
});

/**
 * « QUELLE MISSION ME RAPPORTE QUOI ET ME PREND COMBIEN DE CHARGE DE TEMPS »
 *
 * Personne ne l'avait jamais mise en face d'elle-même : l'ancienne
 * application avait le rapport et la charge dans deux écrans jamais croisés,
 * la maquette les jours par client sans le chiffre d'affaires en face.
 */
describe('rapport et charge par mission', () => {
  const rythme = (du: string, au: string, tjm: number) => ({
    du: dateISO(du), au: dateISO(au),
    parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 },
    tjm: euros(tjm)
  });

  const missionA = mission({
    id: 'a', description: 'Studio Lumen', clientNom: 'Studio Lumen',
    tjm: euros(800), debut: dateISO('2026-01-01'), fin: dateISO('2026-01-31'),
    entites: [entite({
      id: 'a-co', nom: 'Studio Lumen',
      rythmes: [rythme('2026-01-01', '2026-01-31', 800)]
    })]
  });

  const missionB = mission({
    id: 'b', description: 'Atelier Novak', clientNom: 'Atelier Novak',
    tjm: euros(400), debut: dateISO('2026-02-01'), fin: dateISO('2026-06-30'),
    entites: [entite({
      id: 'b-co', nom: 'Atelier Novak',
      rythmes: [rythme('2026-02-01', '2026-06-30', 400)]
    })]
  });

  /**
   * LE POINT QUI COMPTE. On compare des RATIOS et non des proportions : une
   * mission qui pèse peu dans le chiffre d'affaires en consommant beaucoup de
   * temps est un problème que sa part ne montre pas. Le tri met la réponse en
   * première ligne.
   */
  it('trie les missions du meilleur euro-jour au moins bon', () => {
    semer({ missions: [missionB, missionA] });
    render(<Activite />);

    const lignes = screen.getAllByRole('row').filter(
      (l) => l.textContent?.includes('Studio Lumen') || l.textContent?.includes('Atelier Novak')
    );
    expect(lignes[0]?.textContent).toContain('Studio Lumen');
    expect(lignes[1]?.textContent).toContain('Atelier Novak');
  });

  /** Les deux moitiés de la question, côte à côte : le rapport et la charge. */
  it('met la part du temps en face de l’euro-jour', () => {
    semer({ missions: [missionA, missionB] });
    render(<Activite />);

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: '€ / jour' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: 'Part du temps' })).toBeTruthy();
    expect(within(table).getByText('800 €')).toBeTruthy();
  });

  /** Sans mission planifiée, la carte ne s'invente pas un tableau vide. */
  it('ne montre rien sans mission planifiée', () => {
    semer({ missions: [] });
    render(<Activite />);
    expect(screen.queryByRole('table')).toBeNull();
  });

  /**
   * Les montants du tableau portent `data-montant` : un euro-jour dit le tarif
   * réel, et il restait lisible sur un écran partagé.
   */
  it('rend les montants masquables', () => {
    semer({ missions: [missionA] });
    render(<Activite />);

    const table = screen.getByRole('table');
    expect(within(table).getByText('800 €').closest('[data-montant]')).toBeTruthy();
  });
});

/**
 * LES DEUX ERREURS QU'ON FAIT SUR SON PROPRE TARIF.
 *
 * Tous les jours travaillés ne se facturent pas, et ce qui rentre n'est pas ce
 * qui reste. Les deux indicateurs existaient dans l'ancienne application et
 * avaient disparu — l'inventaire fonctionnel les donnait même pour « présents »
 * alors qu'ils n'étaient nulle part.
 */
describe('ce qu’une journée rapporte', () => {
  const missionTarifee = mission({
    id: 't', description: 'Mission tarifée', clientNom: 'ClientA',
    tjm: euros(500), debut: dateISO('2026-01-01'), fin: dateISO('2026-01-31'),
    entites: [entite({
      id: 't-co', nom: 'ClientA',
      rythmes: [{
        du: dateISO('2026-01-01'), au: dateISO('2026-01-31'),
        parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 },
        tjm: euros(500)
      }]
    })]
  });

  /**
   * LE POINT QUI COMPTE. Le tarif des contrats et le tarif facturé se divisent
   * par les MÊMES journées : leur écart mesure ce qui se perd en remises,
   * forfaits et jours non facturés, et non une différence de décompte.
   */
  it('met l’écart entre le tarif des contrats et le facturé', () => {
    semer({
      missions: [missionTarifee],
      // Janvier 2026 : 22 jours ouvrés, soit 11 000 € au tarif du contrat.
      recettes: [recette({ montant: euros(8800), emiseLe: dateISO('2026-01-31') })]
    });
    render(<Activite />);

    expect(screen.getByText(/Tarif des contrats/)).toBeTruthy();
    expect(screen.getByText('Tarif effectif, facturé')).toBeTruthy();
    expect(screen.getByText('Perdu par journée')).toBeTruthy();
  });

  /** Le net retire cotisations et impôt : c'est ce qu'on sous-estime le plus. */
  it('montre ce qu’il reste, charges déduites', () => {
    semer({
      missions: [missionTarifee],
      recettes: [recette({ montant: euros(11_000), emiseLe: dateISO('2026-01-31') })]
    });
    render(<Activite />);

    const reste = screen.getByText(/Ce qu’il te reste, charges déduites/);
    const montant = reste.parentElement?.querySelector('dd')?.textContent ?? '';
    expect(montant).toMatch(/€/);
    // Net strictement inférieur au brut : les charges ne sont pas nulles.
    expect(montant).not.toBe('500 €');
  });

  /** Sans journée travaillée, il n'y a pas de moyenne à montrer. */
  it('ne montre rien sans journée travaillée', () => {
    semer({ missions: [] });
    render(<Activite />);
    expect(screen.queryByText(/Tarif des contrats/)).toBeNull();
  });
});
