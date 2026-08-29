/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { euros, mois } from '../../domain/types';
import { type Client, type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Facture } from './Facture';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  // L'écran lit son adresse : sans remise à zéro, un test ouvert sur la saisie
  // laisserait le suivant démarrer sur la saisie lui aussi.
  window.location.hash = '';
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-07-15T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

const ENTREPRISE = {
  ...faitsVides().entreprise,
  nom: 'Mon Entreprise', siret: '00000000000000',
  adresse: '1 rue Exemple', codePostal: '75001', ville: 'Paris'
};

const client = (m: Partial<Client> = {}): Client => ({
  id: 'c1', nom: 'Client France', adresse: '2 rue Exemple', siret: '',
  email: '', delaiPaiement: 'net_30', pays: 'FR', tvaIntracom: '', ...m
});

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({
    faits: { ...faitsVides(), entreprise: ENTREPRISE, ...modifications }
  });
}

/**
 * Monte l'écran directement sur la saisie.
 *
 * L'écran ouvre sur le facturier — la liste des factures — et la rédaction est
 * derrière `#/facture/nouvelle`. On pose l'adresse plutôt que de cliquer : le
 * clic passe par un `hashchange`, que jsdom délivre de façon asynchrone, et ces
 * tests-ci sont synchrones. Le clic lui-même est vérifié à part, plus bas.
 */
/**
 * La saisie arrive par un module DIFFÉRÉ, et il faut l'attendre.
 *
 * La rédaction d'une facture a été sortie du paquet de l'écran Facturer : on
 * ouvre le facturier pour consulter, et le formulaire pesait à lui seul de
 * quoi faire dépasser le budget de l'écran différé le plus lourd.
 *
 * Conséquence pour les tests : `render` rend d'abord le repli de `Suspense`,
 * et une assertion posée dans la foulée ne voit aucun champ. On attend donc
 * qu'un élément du formulaire apparaisse — c'est ce que fait l'utilisateur,
 * et c'est ce que le test doit refléter.
 */
async function rendreSaisie(): Promise<void> {
  window.location.hash = '#/facture/nouvelle';
  render(<Facture />);
  await screen.findByLabelText('Client');
}

/** Remplit une facture minimale et complète. */
async function remplir(utilisateur: ReturnType<typeof userEvent.setup>) {
  await utilisateur.type(screen.getByLabelText('Client'), 'Client France');
  await utilisateur.type(screen.getByLabelText('Désignation'), 'Développement');
  const pu = screen.getByLabelText('Prix unitaire HT');
  await utilisateur.clear(pu);
  await utilisateur.type(pu, '400');
  const qte = screen.getByLabelText('Quantité');
  await utilisateur.clear(qte);
  await utilisateur.type(qte, '10');
}

describe('mentions obligatoires', () => {
  /**
   * Une facture vierge manque forcément de tout. Le lui reprocher avant la
   * première frappe apprend à l'utilisateur que l'avertissement est un décor
   * — et il ne le lira plus le jour où il porte sur une vraie omission.
   */
  it('ne reproche rien sur une facture encore vierge', async () => {
    semer();
    await rendreSaisie();
    expect(screen.queryByText(/mentions? obligatoires? manque/)).toBeNull();
    // Le contrôle n'a pas disparu pour autant.
    expect(screen.getByRole('button', { name: /Compléter les mentions/ }))
      .toHaveProperty('disabled', true);
  });

  // Découvrir qu'il manque l'adresse du client après avoir tout rempli fait
  // perdre la saisie : le constat vient pendant, pas à l'émission.
  it('constate les manques dès que la saisie commence', async () => {
    semer();
    await rendreSaisie();
    await userEvent.setup().type(screen.getByLabelText('Client'), 'Client France');
    expect(screen.getByText(/mentions? obligatoires? manque/)).toBeTruthy();
  });

  // Une facture irrégulière ne se corrige pas : elle s'annule par un avoir et
  // se réémet sous un nouveau numéro.
  it('bloque l’émission tant qu’une mention manque', async () => {
    semer();
    await rendreSaisie();
    const bouton = screen.getByRole('button', { name: /Compléter les mentions/ });
    expect(bouton).toHaveProperty('disabled', true);
  });

  it('débloque l’émission dès que tout est là', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    await remplir(userEvent.setup());
    expect(screen.getByRole('button', { name: 'Émettre la facture' }))
      .toHaveProperty('disabled', false);
  });

  it('chiffre l’amende encourue', async () => {
    semer();
    await rendreSaisie();
    await userEvent.setup().type(screen.getByLabelText('Client'), 'Client France');
    expect(screen.getByText(/d’amende/)).toBeTruthy();
  });

  it('signale un client absent du carnet', async () => {
    semer();
    await rendreSaisie();
    await userEvent.setup().type(screen.getByLabelText('Client'), 'Inconnu');
    expect(screen.getByText(/pas au carnet/)).toBeTruthy();
  });
});

describe('régime de TVA', () => {
  // L'omettre en facturant sans TVA laisse croire à un oubli de taxe.
  it('annonce la franchise en base', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    expect(screen.getByText(/franchise en base/)).toBeTruthy();
  });

  it('annonce l’autoliquidation et la DES pour un client assujetti de l’Union', async () => {
    semer({ clients: [client({ nom: 'Kunde', pays: 'DE', tvaIntracom: 'DE123' })] });
    await rendreSaisie();
    await userEvent.setup().type(screen.getByLabelText('Client'), 'Kunde');

    // La note de régime est celle du FORMULAIRE : le document, à côté, porte
    // aussi la mention légale, et une recherche non ancrée trouve les deux
    // depuis que l'aperçu est vivant.
    expect(screen.getAllByText(/autoliquidation/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/DES/)).toBeTruthy();
  });

  // Choisir un taux n'aurait aucun effet et laisserait croire le contraire.
  it('ne propose pas de taux de TVA quand la facture n’en porte pas', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    expect(screen.queryByLabelText('TVA')).toBeNull();
  });

  it('propose les taux pour un assujetti français', async () => {
    semer({
      entreprise: { ...ENTREPRISE, tvaDepuis: mois('2026-01') },
      clients: [client()]
    });
    await rendreSaisie();
    expect(screen.getByLabelText('TVA')).toBeTruthy();
  });
});

describe('totaux', () => {
  it('calcule le total depuis quantité et prix unitaire', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    await remplir(userEvent.setup());
    // Le total se lit sur le DOCUMENT, qui est ce qui part chez le client, et
    // dans son bloc de totaux : « Total HT » est AUSSI l'en-tête de la
    // dernière colonne du tableau des prestations.
    const papier = screen.getByRole('article', { name: /Facture/ });
    const totaux = papier.querySelector('.doc-totaux') as HTMLElement;
    expect(within(totaux).getByText('Total HT').nextSibling?.textContent)
      .toMatch(/4\s000/u);
  });

  it('affiche l’échéance déduite du délai du client', async () => {
    semer({ clients: [client({ delaiPaiement: 'net_45' })] });
    await rendreSaisie();
    await remplir(userEvent.setup());
    expect(screen.getByText('Échéance').nextSibling?.textContent).toMatch(/29 août 2026/);
  });
});

describe('lignes', () => {
  it('permet d’ajouter et de retirer une ligne', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    expect(screen.getAllByLabelText('Désignation')).toHaveLength(2);

    await utilisateur.click(screen.getByRole('button', { name: 'Retirer la ligne 2' }));
    expect(screen.getAllByLabelText('Désignation')).toHaveLength(1);
  });

  // Retirer la dernière ligne laisserait une facture sans prestation.
  it('ne permet pas de retirer la seule ligne', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    expect(screen.queryByRole('button', { name: /Retirer la ligne/ })).toBeNull();
  });
});

describe('émission', () => {
  it('porte la facture au livre des recettes, non encaissée', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    const utilisateur = userEvent.setup();
    await remplir(utilisateur);
    await utilisateur.click(screen.getByRole('button', { name: 'Émettre la facture' }));

    const recette = useFaits.getState().faits.recettes[0];
    expect(recette).toMatchObject({
      clientNom: 'Client France', montant: 4000, numero: '2026-001', emiseLe: '2026-07-15'
    });
    // Porter une recette comme encaissée à l'émission ferait déclarer un
    // revenu qui n'est pas rentré.
    expect(recette?.encaisseeLe).toBeNull();
  });

  it('numérote à la suite des factures existantes', async () => {
    semer({
      clients: [client()],
      recettes: [{
        id: 'r0', clientNom: 'X', libelle: '', montant: euros(100),
        emiseLe: null, encaisseeLe: null, modeReglement: null, numero: '2026-007'
      }]
    });
    await rendreSaisie();
    // Le numéro apparaît deux fois depuis que l'aperçu est vivant : en tête
    // du formulaire, et sur le document. C'est voulu — on veut le voir sur le
    // papier avant d'émettre.
    expect(screen.getAllByText('2026-008').length).toBeGreaterThanOrEqual(1);
    expect(within(screen.getByRole('article', { name: /Facture/ }))
      .getByText('2026-008')).toBeTruthy();
  });

  it('affiche le document imprimable après émission', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    const utilisateur = userEvent.setup();
    await remplir(utilisateur);
    await utilisateur.click(screen.getByRole('button', { name: 'Émettre la facture' }));

    const document_ = screen.getByRole('article', { name: /Facture 2026-001/ });
    expect(within(document_).getByText('Mon Entreprise')).toBeTruthy();
    expect(within(document_).getByText('Développement')).toBeTruthy();
    // Dues de plein droit, mais réclamables seulement si la facture les annonce.
    expect(within(document_).getByText(/indemnité forfaitaire de 40 €/)).toBeTruthy();
    expect(within(document_).getByText(/293 B/)).toBeTruthy();
  });

  it('rappelle que l’émission ne vaut pas encaissement', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    const utilisateur = userEvent.setup();
    await remplir(utilisateur);
    await utilisateur.click(screen.getByRole('button', { name: 'Émettre la facture' }));

    expect(screen.getByRole('status').textContent).toMatch(/non encaissée/);
  });
});

/**
 * LA RÉDACTION A UNE ADRESSE.
 *
 * Elle était un état local : le Pilote ne pouvait pas y mener, et le bouton
 * « retour » du navigateur sortait de l'écran au lieu de revenir au facturier.
 * L'action rapide « Nouvelle facture » repose entièrement sur cette adresse.
 */
describe('l’adresse de la rédaction', () => {
  it('ouvre la saisie quand l’URL la désigne', () => {
    semer({ clients: [client()] });
    window.location.hash = '#/facture/nouvelle';
    render(<Facture />);
    expect(screen.getByLabelText('Client')).toBeTruthy();
  });

  it('ouvre le facturier sans sous-route', () => {
    semer({ clients: [client()] });
    window.location.hash = '#/facture';
    render(<Facture />);
    expect(screen.getByRole('heading', { name: 'Facturer' })).toBeTruthy();
  });

  // Le bouton du facturier écrit l'adresse : c'est ce qui rend l'état partageable
  // et le retour navigateur cohérent.
  it('porte l’adresse dans l’URL quand on clique « Nouvelle facture »', async () => {
    semer({ clients: [client()] });
    window.location.hash = '#/facture';
    render(<Facture />);

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle facture' }));

    expect(window.location.hash).toBe('#/facture/nouvelle');
    expect(await screen.findByLabelText('Client')).toBeTruthy();
  });
});

/**
 * OÙ PAYER — CE QUI MANQUAIT SUR CHAQUE FACTURE ÉMISE.
 *
 * `entreprise.iban` existait au schéma, était repris de l'ancienne application
 * à la migration, et n'atteignait AUCUN écran : ni Config, où il n'était pas
 * saisissable, ni le document imprimé, qui ne le portait pas.
 *
 * Le client recevait donc une facture parfaitement régulière sur laquelle rien
 * n'indiquait où envoyer l'argent. Ce n'est pas une mention obligatoire ; c'est
 * ce qui fait la différence entre une facture et une facture payable.
 */
describe('coordonnées de règlement', () => {
  /**
   * Un IBAN manifestement factice, et un BIC de démonstration.
   *
   * Ces tests vérifient l'AFFICHAGE et l'enregistrement, pas la validité de la
   * clé — celle-ci est éprouvée dans `calculs/identifiants.test.ts`. Aucune
   * donnée bancaire réelle n'a donc à figurer ici, et `verifier:fuites` s'en
   * assure : un fichier de test est exactement l'endroit où une vraie valeur se
   * glisse sans être vue.
   */
  const AVEC_IBAN = {
    ...ENTREPRISE,
    iban: 'FR0000000000000000000000000',
    bic: 'XXXXFRPPXXX'
  };

  async function emettre(): Promise<void> {
    await rendreSaisie();
    const utilisateur = userEvent.setup();
    await remplir(utilisateur);
    await utilisateur.click(screen.getByRole('button', { name: 'Émettre la facture' }));
  }

  it('porte l’IBAN sur le document', async () => {
    semer({ entreprise: AVEC_IBAN, clients: [client()] });
    await emettre();
    const document_ = screen.getByRole('article', { name: /Facture 2026-001/ });
    expect(within(document_).getByText(/Règlement/)).toBeTruthy();
    // Groupé par quatre, comme sur un relevé : c'est ainsi qu'il se recopie.
    expect(within(document_).getByText('FR00 0000 0000 0000 0000 0000 000')).toBeTruthy();
  });

  it('porte le BIC quand il est renseigné', async () => {
    semer({ entreprise: AVEC_IBAN, clients: [client()] });
    await emettre();
    expect(screen.getByText(/XXXXFRPPXXX/)).toBeTruthy();
  });

  /**
   * Sans IBAN, pas de bloc vide : une rubrique « Règlement » sans coordonnées
   * fait croire à une omission d'impression plutôt qu'à un champ non rempli.
   */
  it('n’imprime pas un bloc de règlement vide', async () => {
    semer({ entreprise: { ...ENTREPRISE, iban: '', bic: '' }, clients: [client()] });
    await emettre();
    expect(screen.queryByText(/Règlement/)).toBeNull();
  });
});

/*
 * L'APERÇU VIVANT — CE QUE CE LOT AJOUTE.
 *
 * Le document ne s'affichait qu'APRÈS l'émission, geste irréversible : une
 * facture irrégulière ne se corrige pas, elle s'annule par un avoir et se
 * réémet sous un nouveau numéro. On remplissait donc à l'aveugle, et on
 * découvrait ensuite ce qu'on venait de produire.
 */
describe('l’aperçu pendant la saisie', () => {
  it('montre le document avant même la première frappe', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    expect(screen.getByRole('article', { name: /Facture/ })).toBeTruthy();
  });

  it('suit la saisie ligne par ligne', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    await remplir(userEvent.setup());

    const papier = screen.getByRole('article', { name: /Facture/ });
    // La désignation tapée à gauche apparaît sur le papier à droite, sans
    // qu'on ait émis quoi que ce soit.
    expect(papier.textContent).toMatch(/Développement/);
    expect(papier.textContent).toMatch(/Client France/);
  });

  /*
   * LE BROUILLON NE SE CONFOND PAS AVEC UNE FACTURE ÉMISE.
   *
   * Son numéro n'est pas encore attribué : deux brouillons du même jour
   * portent le même. Parti tel quel chez un client, l'un des deux devient un
   * doublon au livre de quelqu'un. Le bandeau part AVEC le fichier.
   */
  it('marque le document « brouillon » tant que la facture n’est pas émise', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    const papier = screen.getByRole('article', { name: /Facture/ });
    expect(papier.textContent).toMatch(/Brouillon/);
    expect(papier.textContent).toMatch(/n’est pas encore attribué/);
  });

  it('retire le bandeau une fois la facture émise', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    await remplir(userEvent.setup());
    await userEvent.setup().click(screen.getByRole('button', { name: /Émettre/ }));

    const papier = screen.getByRole('article', { name: /Facture/ });
    expect(papier.textContent).not.toMatch(/Brouillon/);
  });

  it('propose d’imprimer et de télécharger sans avoir émis', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    expect(screen.getByRole('button', { name: /Télécharger le brouillon/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Imprimer le brouillon/ })).toBeTruthy();
  });

  /* Les deux montants que l'utilisateur a réclamés : « pour les factures j'ai
     besoin de voir les deux montants ». */
  it('porte le HT, la TVA et le net à payer', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    const totaux = screen.getByRole('article', { name: /Facture/ })
      .querySelector('.doc-totaux') as HTMLElement;
    expect(within(totaux).getByText('Total HT')).toBeTruthy();
    expect(within(totaux).getByText(/^TVA/)).toBeTruthy();
    expect(within(totaux).getByText('Net à payer')).toBeTruthy();
  });
});

describe('le fichier téléchargé', () => {
  it('est autonome et emporte sa feuille de style', async () => {
    semer({ clients: [client()] });
    await rendreSaisie();
    await remplir(userEvent.setup());

    let ecrit = '';
    const creerUrl = vi.fn((blob: Blob) => {
      void blob.text().then((t) => { ecrit = t; });
      return 'blob:x';
    });
    vi.stubGlobal('URL', { ...URL, createObjectURL: creerUrl, revokeObjectURL: vi.fn() });

    await userEvent.setup().click(
      screen.getByRole('button', { name: /Télécharger le brouillon/ })
    );
    await new Promise((r) => { setTimeout(r, 0); });

    expect(creerUrl).toHaveBeenCalled();
    // Autonome : il s'ouvrira chez le client, sans notre application autour.
    expect(ecrit).toMatch(/<!doctype html>/);
    expect(ecrit).toMatch(/\.doc-table/);
    // Et le bandeau de brouillon PART avec le fichier : c'est tout son intérêt.
    expect(ecrit).toMatch(/Brouillon/);
    vi.unstubAllGlobals();
  });
});
