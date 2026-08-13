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
  email: '', delaiPaiementJours: 30, pays: 'FR', tvaIntracom: '', ...m
});

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({
    faits: { ...faitsVides(), entreprise: ENTREPRISE, ...modifications }
  });
}

/**
 * Monte l'écran et ouvre la saisie.
 *
 * L'écran ouvre désormais sur le facturier — la liste des factures — et la
 * rédaction est derrière un bouton. `fireEvent` plutôt que `userEvent` : ce
 * helper sert aussi dans des tests synchrones.
 */
function rendreSaisie(): void {
  render(<Facture />);
  fireEvent.click(screen.getByRole('button', { name: 'Nouvelle facture' }));
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
  it('ne reproche rien sur une facture encore vierge', () => {
    semer();
    rendreSaisie();
    expect(screen.queryByText(/mentions? obligatoires? manque/)).toBeNull();
    // Le contrôle n'a pas disparu pour autant.
    expect(screen.getByRole('button', { name: /Compléter les mentions/ }))
      .toHaveProperty('disabled', true);
  });

  // Découvrir qu'il manque l'adresse du client après avoir tout rempli fait
  // perdre la saisie : le constat vient pendant, pas à l'émission.
  it('constate les manques dès que la saisie commence', async () => {
    semer();
    rendreSaisie();
    await userEvent.setup().type(screen.getByLabelText('Client'), 'Client France');
    expect(screen.getByText(/mentions? obligatoires? manque/)).toBeTruthy();
  });

  // Une facture irrégulière ne se corrige pas : elle s'annule par un avoir et
  // se réémet sous un nouveau numéro.
  it('bloque l’émission tant qu’une mention manque', () => {
    semer();
    rendreSaisie();
    const bouton = screen.getByRole('button', { name: /Compléter les mentions/ });
    expect(bouton).toHaveProperty('disabled', true);
  });

  it('débloque l’émission dès que tout est là', async () => {
    semer({ clients: [client()] });
    rendreSaisie();
    await remplir(userEvent.setup());
    expect(screen.getByRole('button', { name: 'Émettre la facture' }))
      .toHaveProperty('disabled', false);
  });

  it('chiffre l’amende encourue', async () => {
    semer();
    rendreSaisie();
    await userEvent.setup().type(screen.getByLabelText('Client'), 'Client France');
    expect(screen.getByText(/d’amende/)).toBeTruthy();
  });

  it('signale un client absent du carnet', async () => {
    semer();
    rendreSaisie();
    await userEvent.setup().type(screen.getByLabelText('Client'), 'Inconnu');
    expect(screen.getByText(/pas au carnet/)).toBeTruthy();
  });
});

describe('régime de TVA', () => {
  // L'omettre en facturant sans TVA laisse croire à un oubli de taxe.
  it('annonce la franchise en base', () => {
    semer({ clients: [client()] });
    rendreSaisie();
    expect(screen.getByText(/franchise en base/)).toBeTruthy();
  });

  it('annonce l’autoliquidation et la DES pour un client assujetti de l’Union', async () => {
    semer({ clients: [client({ nom: 'Kunde', pays: 'DE', tvaIntracom: 'DE123' })] });
    rendreSaisie();
    await userEvent.setup().type(screen.getByLabelText('Client'), 'Kunde');

    expect(screen.getByText(/autoliquidation/i)).toBeTruthy();
    expect(screen.getByText(/DES/)).toBeTruthy();
  });

  // Choisir un taux n'aurait aucun effet et laisserait croire le contraire.
  it('ne propose pas de taux de TVA quand la facture n’en porte pas', () => {
    semer({ clients: [client()] });
    rendreSaisie();
    expect(screen.queryByLabelText('TVA')).toBeNull();
  });

  it('propose les taux pour un assujetti français', () => {
    semer({
      entreprise: { ...ENTREPRISE, tvaDepuis: mois('2026-01') },
      clients: [client()]
    });
    rendreSaisie();
    expect(screen.getByLabelText('TVA')).toBeTruthy();
  });
});

describe('totaux', () => {
  it('calcule le total depuis quantité et prix unitaire', async () => {
    semer({ clients: [client()] });
    rendreSaisie();
    await remplir(userEvent.setup());
    expect(screen.getByText('Total HT').nextSibling?.textContent).toMatch(/4\s000/u);
  });

  it('affiche l’échéance déduite du délai du client', async () => {
    semer({ clients: [client({ delaiPaiementJours: 45 })] });
    rendreSaisie();
    await remplir(userEvent.setup());
    expect(screen.getByText('Échéance').nextSibling?.textContent).toMatch(/29 août 2026/);
  });
});

describe('lignes', () => {
  it('permet d’ajouter et de retirer une ligne', async () => {
    semer({ clients: [client()] });
    rendreSaisie();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    expect(screen.getAllByLabelText('Désignation')).toHaveLength(2);

    await utilisateur.click(screen.getByRole('button', { name: 'Retirer la ligne 2' }));
    expect(screen.getAllByLabelText('Désignation')).toHaveLength(1);
  });

  // Retirer la dernière ligne laisserait une facture sans prestation.
  it('ne permet pas de retirer la seule ligne', () => {
    semer({ clients: [client()] });
    rendreSaisie();
    expect(screen.queryByRole('button', { name: /Retirer la ligne/ })).toBeNull();
  });
});

describe('émission', () => {
  it('porte la facture au livre des recettes, non encaissée', async () => {
    semer({ clients: [client()] });
    rendreSaisie();
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
    rendreSaisie();
    expect(screen.getByText('2026-008')).toBeTruthy();
  });

  it('affiche le document imprimable après émission', async () => {
    semer({ clients: [client()] });
    rendreSaisie();
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
    rendreSaisie();
    const utilisateur = userEvent.setup();
    await remplir(utilisateur);
    await utilisateur.click(screen.getByRole('button', { name: 'Émettre la facture' }));

    expect(screen.getByRole('status').textContent).toMatch(/non encaissée/);
  });
});
