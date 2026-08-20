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
  email: '', delaiPaiement: 'net_30', pays: 'FR', tvaIntracom: ''
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

/**
 * UNE LISTE QU'ON NE PEUT PAS LIRE N'EST PAS UNE LISTE.
 *
 * Trois ans d'activité font plus de quatre cents factures. Les rendre toutes
 * produit sept mille nœuds et près de neuf cents millisecondes avant
 * l'affichage — mesuré par `verifier:vitesse`, pas supposé.
 *
 * Le point de vigilance est ailleurs : les TOTAUX doivent rester calculés sur
 * l'ensemble. Un « reste à rentrer » qui ne compterait que les lignes
 * affichées serait faux, et faux dans le sens rassurant — le pire.
 */
describe('grand nombre de factures', () => {
  const beaucoup = Array.from({ length: 120 }, (_, i) => recette({
    id: `r${i}`,
    numero: `2026-${String(i).padStart(3, '0')}`,
    montant: euros(100)
  }));

  it('n’affiche pas les quatre cents lignes d’un coup', () => {
    semer(beaucoup);
    rendre();
    expect(screen.getAllByRole('listitem').length).toBeLessThan(beaucoup.length);
  });

  /** LE POINT QUI COMPTE : tronquer la liste ne tronque pas les totaux. */
  it('totalise sur TOUTES les factures, pas sur celles affichées', () => {
    semer(beaucoup);
    rendre();
    const tuile = screen.getByText('Reste à rentrer').closest('div') as HTMLElement;
    // 120 × 100 € = 12 000 €, quel que soit le nombre de lignes rendues.
    expect(tuile.textContent).toMatch(/12\s*000/u);
  });

  it('compte l’ensemble sur les pastilles de filtre', () => {
    semer(beaucoup);
    rendre();
    const groupe = screen.getByRole('group', { name: 'Filtrer par état' });
    expect(within(groupe).getByRole('button', { name: /^Tout/ }).textContent).toContain('120');
  });

  // Rien n'est perdu : le reste est à un clic.
  it('permet de dérouler la suite', async () => {
    semer(beaucoup);
    rendre();
    const avant = screen.getAllByRole('listitem').length;

    await userEvent.setup().click(screen.getByRole('button', { name: /Voir .* de plus/ }));

    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(avant);
  });

  // Garder 200 lignes révélées en passant à « brouillons » n'aurait aucun sens.
  it('repart du début quand on change de filtre', async () => {
    semer(beaucoup);
    rendre();
    const utilisateur = userEvent.setup();

    // La barre de période porte elle aussi un « Tout » : on vise le groupe
    // de filtres, pas l'écran entier.
    const filtres = screen.getByRole('group', { name: 'Filtrer par état' });
    await utilisateur.click(screen.getByRole('button', { name: /Voir .* de plus/ }));
    await utilisateur.click(within(filtres).getByRole('button', { name: /^Encaissées/ }));
    await utilisateur.click(within(filtres).getByRole('button', { name: /^Tout/ }));

    expect(screen.getAllByRole('listitem').length).toBeLessThanOrEqual(50);
  });
});

/**
 * RELANCER — LE BESOIN QUI N'AVAIT AUCUN REMPLAÇANT.
 *
 * L'application désignait déjà « précisément celle qu'il faut relancer » — c'est
 * écrit tel quel dans les sélecteurs — et ne proposait rien au bout. La fonction
 * de l'ancienne version avait été écartée au motif qu'un envoi de courriel
 * suppose un service d'expédition : le motif répondait à la FORME et pas au
 * besoin. Relancer ne demande pas d'envoyer, mais de savoir quoi écrire, ce
 * qu'on peut réclamer, et quand on l'a déjà fait.
 */
describe('relancer une facture en retard', () => {
  const enRetard = () => recette({ id: 'r1', emiseLe: dateISO('2026-06-01') });

  async function ouvrirRelance() {
    semer([enRetard()]);
    rendre();
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: 'Relancer' }));
    return utilisateur;
  }

  // Le bouton n'a de sens que sur une facture échue : le proposer avant, c'est
  // inviter à menacer un client qui n'a rien à se reprocher.
  it('ne propose de relancer qu’une facture en retard', () => {
    semer([recette({ id: 'r1' })]);
    rendre();
    expect(screen.queryByRole('button', { name: 'Relancer' })).toBeNull();
  });

  it('rédige un message qui nomme la facture', async () => {
    await ouvrirRelance();
    const message = screen.getByRole('textbox', { name: '' }) as HTMLTextAreaElement
      ?? document.querySelector('textarea');
    expect((message as HTMLTextAreaElement).value).toContain('2026-001');
  });

  /**
   * L'indemnité forfaitaire de 40 € est due de plein droit, par facture, quels
   * que soient la durée du retard et le montant. Presque personne ne la
   * réclame — l'afficher est la moitié du travail.
   */
  it('chiffre l’indemnité forfaitaire, due de plein droit', async () => {
    await ouvrirRelance();
    expect(screen.getByText('Indemnité forfaitaire')).toBeTruthy();
    expect(screen.getByText(/40/)).toBeTruthy();
  });

  /**
   * LE POINT QUI COMPTE. Sans taux, on ne chiffre pas : afficher zéro ferait
   * croire qu'il n'y a rien à réclamer, et réclamer un montant calculé sur un
   * taux supposé fragiliserait le document qu'on cherche à rendre solide.
   */
  it('dit que le taux manque, plutôt que d’annoncer zéro', async () => {
    await ouvrirRelance();
    expect(screen.getByText('taux non renseigné')).toBeTruthy();
  });

  it('chiffre les pénalités dès que le taux est donné', async () => {
    const utilisateur = await ouvrirRelance();
    await utilisateur.type(
      screen.getByLabelText(/Taux de pénalité/), '12'
    );
    expect(screen.queryByText('taux non renseigné')).toBeNull();
  });

  /**
   * Consigner est un geste SÉPARÉ de la copie : on copie souvent pour relire,
   * on ne relance qu'une fois. Les confondre ferait passer au ton suivant sans
   * qu'un message soit parti.
   */
  it('consigne la relance sur un geste explicite', async () => {
    const utilisateur = await ouvrirRelance();
    await utilisateur.click(screen.getByRole('button', { name: 'J’ai envoyé cette relance' }));

    expect(useFaits.getState().faits.recettes[0]?.relancesLe).toHaveLength(1);
  });

  // Le ton suit le nombre de relances : rappel, puis ferme, puis mise en
  // demeure. Sans la trace, on réécrit indéfiniment le même rappel courtois.
  it('durcit le ton quand une relance a déjà été faite', async () => {
    semer([{ ...enRetard(), relancesLe: [dateISO('2026-07-15')] }]);
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Relancer' }));

    expect(screen.getByText(/^Relance —/)).toBeTruthy();
  });

  it('met en demeure à partir de la troisième', async () => {
    semer([{
      ...enRetard(),
      relancesLe: [dateISO('2026-07-01'), dateISO('2026-07-20')]
    }]);
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Relancer' }));

    expect(screen.getByText(/^Mise en demeure/)).toBeTruthy();
  });
});

/**
 * LA FACTURE DU MOIS QU'ON N'A PAS DEMANDÉE.
 *
 * « Créée en brouillon et mise à jour en fonction de mes modifications
 * d'Activité. » Un brouillon enregistré serait juste à l'instant de sa
 * création et faux dès la première journée corrigée. Celui-ci est dérivé du
 * planning : il suit par construction, parce qu'il n'a pas d'existence
 * séparée à faire diverger.
 */
describe('la facture du mois, avant qu’elle existe', () => {
  const rythme = {
    du: dateISO('2026-01-01'), au: dateISO('2026-12-31'),
    parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 },
    tjm: euros(500)
  };

  const missionPlanifiee = {
    id: 'm1', clientId: null, clientNom: 'Client France', description: 'Mission A',
    tjm: euros(500), debut: dateISO('2026-01-01'), fin: dateISO('2026-12-31'),
    statut: 'active' as const,
    entites: [{
      id: 'm1-co', nom: 'Client France', couleur: '', adresse: '', contact: '',
      email: '', telephone: '', rythmes: [rythme], ajustements: {}
    }]
  };

  it('propose la facture du mois sans qu’on la demande', () => {
    semer([], { missions: [missionPlanifiee] });
    rendre();

    expect(screen.getByRole('heading', { name: /La facture de août 2026/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Émettre cette facture' })).toBeTruthy();
  });

  /**
   * LE POINT QUI COMPTE. Le brouillon vient du MÊME planning que le compte
   * rendu : une journée retirée à l'Activité retire son montant de la facture,
   * sans qu'aucune resynchronisation ait lieu.
   */
  it('suit les ajustements du planning', () => {
    semer([], { missions: [missionPlanifiee] });
    rendre();
    const avant = screen.getByLabelText('Mois facturé').closest('section');
    const montantAvant = within(avant as HTMLElement).getAllByText(/€/)[0]?.textContent;

    cleanup();
    semer([], {
      missions: [{
        ...missionPlanifiee,
        entites: [{
          ...(missionPlanifiee.entites[0] as (typeof missionPlanifiee)['entites'][number]),
          ajustements: { '2026-08-03': 0, '2026-08-04': 0 }
        }]
      }]
    });
    rendre();
    const apres = screen.getByLabelText('Mois facturé').closest('section');
    const montantApres = within(apres as HTMLElement).getAllByText(/€/)[0]?.textContent;

    expect(montantApres).not.toBe(montantAvant);
  });

  /** Émettre est le geste qui engage : la facture prend un numéro et entre au registre. */
  it('matérialise la facture à l’émission', async () => {
    semer([], { missions: [missionPlanifiee] });
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Émettre cette facture' }));

    const recettes = useFaits.getState().faits.recettes;
    expect(recettes).toHaveLength(1);
    expect(recettes[0]?.numero).not.toBe('');
    expect(recettes[0]?.emiseLe).not.toBeNull();
    expect(recettes[0]?.clientNom).toBe('Client France');
  });

  /**
   * Le brouillon d'un client déjà facturé reste affiché, marqué. Le faire
   * disparaître empêcherait de voir qu'on a facturé douze jours là où le
   * planning en compte quatorze.
   */
  it('marque le mois déjà facturé sans effacer le brouillon', () => {
    semer(
      [recette({ id: 'r1', emiseLe: dateISO('2026-08-05'), numero: '2026-014' })],
      { missions: [missionPlanifiee] }
    );
    rendre();

    expect(screen.getByText(/Facture 2026-014 déjà émise/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Émettre cette facture' })).toBeNull();
  });

  /** Sans planning, il n'y a rien à facturer : la carte ne s'invente pas. */
  it('ne montre rien sans mission planifiée', () => {
    semer([]);
    rendre();
    expect(screen.queryByRole('heading', { name: /La facture de/ })).toBeNull();
  });
});

/**
 * ÉMISE N'EST PAS ENVOYÉE.
 *
 * Le document peut exister, porter son numéro et sa date, et dormir dans un
 * dossier — c'est le cas courant en fin de mois, où l'on établit les factures
 * d'un coup avant de les envoyer. Les confondre coûte deux choses : on relance
 * un client qui n'a jamais rien reçu, et on ne sait pas répondre à « je ne
 * l'ai jamais reçue », qui est la réponse la plus courante à une relance.
 */
describe('cycle de vie : envoyée, avec sa date', () => {
  it('distingue une facture émise d’une facture partie', () => {
    semer([recette({ id: 'r1' })]);
    rendre();

    expect(screen.getByText('À envoyer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Marquer envoyée' })).toBeTruthy();
  });

  it('consigne la date d’envoi et change l’état', async () => {
    semer([recette({ id: 'r1' })]);
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Marquer envoyée' }));

    expect(useFaits.getState().faits.recettes[0]?.envoyeeLe).toBe('2026-08-13');
    expect(screen.getByText('Envoyée')).toBeTruthy();
    expect(screen.getByText(/envoyée le/)).toBeTruthy();
  });

  /** Le geste ne se propose qu'une fois : elle est partie, elle reste partie. */
  it('ne propose plus l’envoi d’une facture déjà partie', () => {
    semer([recette({ id: 'r1', envoyeeLe: dateISO('2026-08-05') })]);
    rendre();
    expect(screen.queryByRole('button', { name: 'Marquer envoyée' })).toBeNull();
  });

  /**
   * LE POINT QUI COMPTE. Une facture échue est en retard qu'on l'ait envoyée
   * ou non — mais si elle n'est pas partie, c'est le premier problème à
   * régler, et le bouton doit rester là.
   */
  it('propose encore l’envoi sur une facture en retard jamais partie', () => {
    semer([recette({ id: 'r1', emiseLe: dateISO('2026-05-01') })]);
    rendre();

    expect(screen.getAllByText('En retard').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Marquer envoyée' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Relancer' })).toBeTruthy();
  });

  /** Un brouillon n'a pas de document à envoyer : il n'a ni numéro ni date. */
  it('refuse d’envoyer un brouillon', () => {
    semer([recette({ id: 'r1', emiseLe: null, numero: '2026-009' })]);
    rendre();
    expect(screen.queryByRole('button', { name: 'Marquer envoyée' })).toBeNull();
  });

  /**
   * Une facture non encore envoyée est due autant qu'une envoyée : le client
   * n'a simplement pas été mis au courant. L'exclure du reste à rentrer ferait
   * disparaître les factures de fin de mois, c'est-à-dire les plus récentes.
   */
  it('compte l’envoyée comme la non-envoyée dans le reste à rentrer', () => {
    semer([
      recette({ id: 'r1', montant: euros(1000) }),
      recette({ id: 'r2', montant: euros(2000), numero: '2026-002', envoyeeLe: dateISO('2026-08-05') })
    ]);
    rendre();
    expect(screen.getByText('3 000 €')).toBeTruthy();
  });
});
