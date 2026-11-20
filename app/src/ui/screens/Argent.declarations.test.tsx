/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { FournisseurToasts } from '../components/Toasts';
import { Obligations } from './Obligations';
import { Tresorerie } from './Tresorerie';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-13T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

const encaissee = (id: string, le: string): Recette => ({
  id, clientNom: 'Client', libelle: 'Prestation', montant: euros(3000),
  emiseLe: dateISO('2026-04-01'), encaisseeLe: dateISO(le),
  modeReglement: 'virement', numero: `2026-${id}`
});

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({
    faits: {
      ...faitsVides(),
      entreprise: { ...faitsVides().entreprise, urssafPeriodicite: 'trimestriel' },
      ...modifications
    }
  });
}

const rendre = async (): Promise<void> => {
  render(<FournisseurToasts><Obligations /></FournisseurToasts>);
  /*
   * L'ÉCHÉANCIER EST DIFFÉRÉ : ON L'ATTEND.
   *
   * N'attendre que l'écran laissait le module de l'échéancier arriver « en
   * général assez vite », ce qui est une autre façon de dire que le test
   * passait par chance : sous charge, les assertions tombaient sur un
   * `Chargement…`. L'échec ne ressemblait à rien de connu — « avril 2026
   * introuvable » — et il a coûté un aller-retour à travers trois lots avant
   * qu'on remonte à la vraie cause. On attend donc explicitement sa carte.
   */
  await screen.findByRole('heading', { name: /Échéancier/ });
};

/**
 * Le même rendu, mais qui attend la carte qu'on va interroger.
 *
 * Séparé de `rendre` parce qu'un des tests vérifie au contraire son ABSENCE :
 * l'attendre là serait attendre ce qu'on veut ne pas trouver.
 */
const rendreAvecUrssaf = async (): Promise<void> => {
  await rendre();
  await screen.findByText('Périodes URSSAF');
};

/**
 * LE TROU QUE CETTE CARTE BOUCHE.
 *
 * `marquerPeriodeDeclaree` existait dans le magasin, aucun écran ne l'appelait.
 * Une période déclarée restait donc éternellement dans le volet « à
 * provisionner » : les provisions montaient sans redescendre, et le versable
 * baissait d'autant. On mettait de côté deux fois la même dette.
 */
/** Ouvre le geste « Déclarée le … pour … € » et l'enregistre tel que prérempli. */
async function declarerTelQuel(utilisateur = userEvent.setup()): Promise<void> {
  await utilisateur.click(screen.getByRole('button', { name: 'Marquer déclarée' }));
  await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer la déclaration' }));
}

describe('périodes URSSAF', () => {
  it('marque les trois mois d’un trimestre d’un seul geste', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10')] });
    await rendreAvecUrssaf();

    await declarerTelQuel();

    // Les trois mois, et la date du jour sur chacun : on coche en sortant du
    // site de l'URSSAF (horloge du test : 13 août 2026).
    expect(useFaits.getState().faits.periodesDeclarees).toEqual([
      { nature: 'urssaf', periode: '2026-04', declareeLe: '2026-08-13' },
      { nature: 'urssaf', periode: '2026-05', declareeLe: '2026-08-13' },
      { nature: 'urssaf', periode: '2026-06', declareeLe: '2026-08-13' }
    ]);
  });

  /* La période se marque sous Obligations, la dette se lit sous la Trésorerie
     (lot 51) : les deux écrans montés ensemble, pour voir l'une suivre l'autre. */
  it('fait basculer la dette d’un volet à l’autre', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10')] });
    render(<FournisseurToasts><Tresorerie /></FournisseurToasts>);
    await screen.findByText(/n’est pas tout à toi/);
    await rendreAvecUrssaf();

    const avant = screen.getByText('Charges sur recettes encaissées non déclarées')
      .nextElementSibling?.textContent;
    await declarerTelQuel();
    const apres = screen.getByText('Charges sur recettes encaissées non déclarées')
      .nextElementSibling?.textContent;

    expect(avant).not.toBe(apres);
  });

  /* L'appel créé par la déclaration part avec elle — sinon il resterait dans
     le dû en plus de l'estimation qui revient. Il a été recopié du site de
     l'URSSAF : sa disparition se confirme, conséquence dite. */
  it('permet de revenir sur une déclaration marquée par erreur, avec son appel', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10')] });
    await rendreAvecUrssaf();
    const utilisateur = userEvent.setup();

    await declarerTelQuel(utilisateur);
    await utilisateur.click(screen.getByRole('button', { name: /Annuler la déclaration/ }));
    expect(screen.getByText(/quitte le dû/)).toBeTruthy();
    await utilisateur.click(screen.getByRole('button', { name: 'Annuler la déclaration' }));

    expect(useFaits.getState().faits.periodesDeclarees).toEqual([]);
    expect(useFaits.getState().faits.echeances).toEqual([]);
  });

  /**
   * L'URSSAF ouvre la déclaration après la clôture de la période. Cocher un
   * trimestre en cours sortirait du volet « à provisionner » des recettes
   * qu'on va encore encaisser dessus.
   */
  it('ne propose pas de déclarer une période en cours', async () => {
    // Août 2026 est dans le T3, qui court jusqu'en septembre.
    semer({ recettes: [encaissee('r1', '2026-08-05')] });
    await rendreAvecUrssaf();

    expect(screen.queryByRole('button', { name: 'Marquer déclarée' })).toBeNull();
    expect(screen.getByText(/Période en cours/)).toBeTruthy();
  });

  // Sans encaissement, il n'y a rien à déclarer : la carte n'a pas lieu d'être.
  it('ne montre rien tant qu’aucune recette n’est encaissée', async () => {
    semer();
    await rendre();
    expect(screen.queryByText('Périodes URSSAF')).toBeNull();
  });

  it('suit la périodicité déclarée dans Réglages', async () => {
    semer({
      entreprise: { ...faitsVides().entreprise, urssafPeriodicite: 'mensuel' },
      recettes: [encaissee('r1', '2026-04-10')]
    });
    await rendreAvecUrssaf();
    expect(screen.getByText('avril 2026')).toBeTruthy();
  });
});

/**
 * « DÉCLARÉE LE … POUR … € » : LA DÉCLARATION CRÉE SON APPEL.
 *
 * Déclarer sans appel faisait sortir la période du volet « à provisionner »
 * sans rien mettre au volet « constaté » : le dû baissait de toute la
 * déclaration, et « à te verser » montait d'autant, jusqu'à ce que quelqu'un
 * pense à saisir l'appel.
 */
describe('le geste « Déclarée le … pour … € »', () => {
  it('crée l’appel lié à la période, au montant prérempli, à payer à la limite', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10')] });
    await rendreAvecUrssaf();
    await declarerTelQuel();

    const [appel] = useFaits.getState().faits.echeances;
    expect(appel).toMatchObject({
      nature: 'urssaf', periode: '2026-T2', echeanceLe: '2026-07-31', payeeLe: null
    });
    expect(appel?.montant).toBeGreaterThan(0);
    // La suite du cycle se lit sur la ligne : l'appel est à payer, pas payé.
    expect(screen.getByText(/à payer depuis le|à payer avant le/)).toBeTruthy();
  });

  it('garde le montant corrigé, et la date saisie — jamais une date future', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10')] });
    await rendreAvecUrssaf();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Marquer déclarée' }));

    fireEvent.change(screen.getByLabelText('Déclarée le'), { target: { value: '2026-08-20' } });
    await u.click(screen.getByRole('button', { name: 'Enregistrer la déclaration' }));
    expect(screen.getByRole('alert').textContent).toMatch(/pas encore arrivée/);
    expect(useFaits.getState().faits.periodesDeclarees).toEqual([]);

    fireEvent.change(screen.getByLabelText('Déclarée le'), { target: { value: '2026-07-29' } });
    fireEvent.change(screen.getByLabelText('Pour (€)'), { target: { value: '812,40' } });
    await u.click(screen.getByRole('button', { name: 'Enregistrer la déclaration' }));

    expect(useFaits.getState().faits.periodesDeclarees.map((p) => p.declareeLe))
      .toEqual(['2026-07-29', '2026-07-29', '2026-07-29']);
    expect(useFaits.getState().faits.echeances[0]?.montant).toBe(812.4);
  });

  /* La déclaration à zéro est obligatoire ; elle n'appelle rien. */
  it('déclare à zéro sans créer d’appel', async () => {
    semer({
      entreprise: { ...faitsVides().entreprise, urssafPeriodicite: 'trimestriel', debutActivite: dateISO('2026-01-01') }
    });
    await rendreAvecUrssaf();
    const u = userEvent.setup();
    await u.click(screen.getAllByRole('button', { name: 'Marquer déclarée' })[0] as HTMLElement);
    expect((screen.getByLabelText('Pour (€)') as HTMLInputElement).value).toBe('0');
    await u.click(screen.getByRole('button', { name: 'Enregistrer la déclaration' }));

    expect(useFaits.getState().faits.periodesDeclarees).toHaveLength(3);
    expect(useFaits.getState().faits.echeances).toEqual([]);
  });

  /* Un appel déjà saisi pour la période — à la main, ou repris par la
     migration — la règle : la déclaration n'en crée pas un second, qui
     doublerait le dû. */
  it('ne crée pas de second appel quand la période en porte déjà un', async () => {
    const saisi = {
      id: 'ech-saisi', nature: 'urssaf' as const, montant: euros(900), echeanceLe: dateISO('2026-07-31'),
      payeeLe: dateISO('2026-07-31'), montantPaye: null, periode: '2026-T2'
    };
    semer({ recettes: [encaissee('r1', '2026-04-10')], echeances: [saisi] });
    await rendreAvecUrssaf();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Marquer déclarée' }));
    expect(screen.getByText(/déjà saisi pour T2 2026/)).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Enregistrer la déclaration' }));

    expect(useFaits.getState().faits.echeances).toEqual([saisi]);
    // Sur la ligne de la période : l'échéancier, plus haut, dit aussi « payée le ».
    const ligne = screen.getByText('T2 2026').closest('li') as HTMLElement;
    expect(within(ligne).getByText(/payée le/)).toBeTruthy();
  });
});
