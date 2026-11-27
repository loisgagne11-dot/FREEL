/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Client, type Faits, type Mission, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { numeroSuivant } from '../../state/selecteurs.facture';
import { stockageMemoireJustificatifs } from '../../infra/justificatifs';
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

/** Du lundi au vendredi depuis janvier, à 500 € : le planning du propriétaire, en factice. */
const MISSION: Mission = {
  id: 'm1', clientId: null, clientNom: 'Client France', description: 'Mission A',
  tjm: euros(500), debut: dateISO('2026-01-01'), fin: dateISO('2026-12-31'), statut: 'active',
  entites: [{
    id: 'm1-co', nom: 'Client France', couleur: '', adresse: '', contact: '', email: '', telephone: '',
    rythmes: [{
      du: dateISO('2026-01-01'), au: dateISO('2026-12-31'),
      parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 }, tjm: euros(500)
    }],
    ajustements: {}
  }]
};

const facture = (p: Partial<Recette> & { readonly id: string }): Recette => ({
  clientNom: 'Client France', libelle: 'Prestation', montant: euros(1000),
  emiseLe: dateISO('2026-08-01'), encaisseeLe: null, modeReglement: null, numero: '2026-001', ...p
});

function semer(recettes: readonly Recette[] = [], emissionFactures: 'freel' | 'externe' = 'externe'): void {
  const f: Faits = {
    ...faitsVides(),
    entreprise: { ...faitsVides().entreprise, emissionFactures },
    clients: [CLIENT], missions: [MISSION], recettes
  };
  useFaits.setState({ faits: f });
}

function rendre(stockage = stockageMemoireJustificatifs(), onRevoir?: (n: string) => void) {
  render(
    <FournisseurToasts>
      <Facturier onNouvelle={() => { /* le mode FREEL, testé ailleurs */ }} stockage={stockage}
        {...(onRevoir === undefined ? {} : { onRevoir })} />
    </FournisseurToasts>
  );
  return stockage;
}

const recettes = (): readonly Recette[] => useFaits.getState().faits.recettes;

describe('les factures émises dans un autre logiciel', () => {
  /*
   * PAS DE « RÉDIGER », PAS D'ÉCART. Le propriétaire émet dans Tiime : un
   * bouton « Émettre » ferait naître une seconde numérotation au premier
   * clic, et l'écart facture / planning dirait faux chaque fois que Tiime
   * arrondit autrement.
   */
  it('dit les mois en attente et le mois à enregistrer, sans rien proposer de rédiger', async () => {
    semer();
    rendre();

    expect(await screen.findByRole('heading', { name: /Les mois en attente/ })).toBeTruthy();
    expect(screen.getByText(/^Janvier, février, mars, avril, mai, juin et juillet 2026/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /À enregistrer : août 2026/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer la facture émise' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer une facture' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Émettre cette facture' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Rédiger cette facture/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nouvelle facture' })).toBeNull();
  });

  /*
   * LE MONTANT EST CELUI DU PLANNING (22/11). Le recopier à la main, c'était
   * la ressaisie que le brouillon existe pour supprimer — et l'erreur de
   * frappe qu'on découvre au rapprochement bancaire.
   */
  it('le formulaire reprend le client, le mois et le montant du planning', async () => {
    semer();
    rendre();
    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer la facture de juillet 2026 pour Client France' }));

    const volet = await screen.findByRole('dialog', { name: 'Enregistrer une facture émise' });
    expect((await within(volet).findByLabelText('Client') as HTMLInputElement).value).toBe('Client France');
    expect((within(volet).getByLabelText('Mois facturé') as HTMLInputElement).value).toBe('2026-07');
    // Vingt-deux journées — le 14 juillet est férié — à 500 €.
    expect((within(volet).getByLabelText('Montant HT') as HTMLInputElement).value).toBe('11000');
    // En franchise, aucune TVA ne se propose : Tiime n'en a pas facturé.
    expect(within(volet).getByText(/Pas de TVA : tu es en franchise en base/)).toBeTruthy();
    // L'envoi se dit « le même jour » par défaut.
    expect((within(volet).getByLabelText('Le même jour') as HTMLInputElement).checked).toBe(true);
  });

  /*
   * UN MOIS FACTURÉ SORT DE LA LISTE, ET AUCUN NUMÉRO DE FREEL N'EST PRIS. Le
   * numéro est celui de Tiime ; si FREEL en consommait un, sa propre suite
   * aurait des trous le jour où l'on revient à lui.
   */
  it('enregistre la facture : elle entre au suivi, son mois sort de la liste, la suite de FREEL ne bouge pas', async () => {
    semer();
    rendre();
    const avant = numeroSuivant(useFaits.getState().faits);
    const utilisateur = userEvent.setup();
    await utilisateur.click(await screen.findByRole('button', { name: 'Enregistrer la facture de juillet 2026 pour Client France' }));
    const volet = await screen.findByRole('dialog', { name: 'Enregistrer une facture émise' });
    await utilisateur.type(await within(volet).findByLabelText('Numéro de la facture'), 'F-2026-0042');
    await utilisateur.click(within(volet).getByRole('button', { name: 'Enregistrer la facture' }));

    await waitFor(() => expect(recettes()).toHaveLength(1));
    expect(recettes()[0]).toMatchObject({
      numero: 'F-2026-0042', emisePar: 'externe', moisFacture: '2026-07', montant: 11000,
      tvaCollectee: 0, emiseLe: '2026-08-13', envoyeeLe: '2026-08-13', lignes: null
    });
    expect(numeroSuivant(useFaits.getState().faits)).toBe(avant);
    await screen.findByText(/aucun numéro de FREEL n’a été pris/);
    expect(screen.queryByRole('button', { name: 'Enregistrer la facture de juillet 2026 pour Client France' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Enregistrer la facture de juin 2026 pour Client France' })).toBeTruthy();
  });

  /* La pièce passe par le dépôt des justificatifs : empreinte, rattachement. */
  it('joint le PDF déposé, par le même stockage que les justificatifs', async () => {
    semer();
    const stockage = rendre();
    const utilisateur = userEvent.setup();
    await utilisateur.click(await screen.findByRole('button', { name: 'Enregistrer la facture émise' }));
    const volet = await screen.findByRole('dialog', { name: 'Enregistrer une facture émise' });
    await utilisateur.type(await within(volet).findByLabelText('Numéro de la facture'), 'F-2026-0043');
    await utilisateur.upload(within(volet).getByLabelText('La facture en PDF'),
      new File(['%PDF-1.4 facture factice'], 'facture-aout.pdf', { type: 'application/pdf' }));
    await utilisateur.click(within(volet).getByRole('button', { name: 'Enregistrer la facture' }));

    await waitFor(() => expect(stockage.contenu.size).toBe(1));
    const [piece] = [...stockage.contenu.values()];
    const r = recettes()[0];
    expect(piece?.fait).toEqual({ nature: 'recette', id: r?.id });
    await waitFor(() => expect(recettes()[0]?.justificatifId).toBe(piece?.id));
  });

  /* Ce qui vient d'un fichier est hostile : le contrôle du dépôt s'applique
     AVANT d'écrire la facture, pour qu'aucune ne reste sans la pièce choisie. */
  it('refuse d’emblée un fichier que le dépôt refuserait', async () => {
    semer();
    rendre();
    const utilisateur = userEvent.setup({ applyAccept: false });
    await utilisateur.click(await screen.findByRole('button', { name: 'Enregistrer la facture émise' }));
    const volet = await screen.findByRole('dialog', { name: 'Enregistrer une facture émise' });
    await utilisateur.upload(await within(volet).findByLabelText('La facture en PDF'),
      new File(['<script>alert(1)</script>'], 'facture.html', { type: 'text/html' }));
    expect(within(volet).getByRole('alert').textContent).toMatch(/Format non accepté/);
  });

  /*
   * « REVOIR » SEULEMENT POUR UNE FACTURE DE FREEL. Rouvrir une facture de
   * Tiime reconstruirait, sous son numéro, un document que le client n'a
   * jamais reçu.
   */
  it('n’offre « Revoir la facture » qu’à une facture produite par FREEL', () => {
    semer([
      facture({ id: 'r1', numero: '2026-001' }),
      facture({ id: 'r2', numero: 'F-2026-0042', emisePar: 'externe', moisFacture: null })
    ]);
    rendre(stockageMemoireJustificatifs(), () => undefined);

    const revoir = screen.getAllByRole('button', { name: 'Revoir la facture' });
    expect(revoir).toHaveLength(1);
    const ligneExterne = screen.getByText('émise dans ton logiciel').closest('li') as HTMLElement;
    expect(within(ligneExterne).queryByRole('button', { name: 'Revoir la facture' })).toBeNull();
    expect(within(ligneExterne).getByText('F-2026-0042')).toBeTruthy();
  });

  /*
   * UN MOIS FACTURÉ AVANT LE SCHÉMA 29 SORT AUSSI DE LA LISTE. La facture de
   * juillet émise le 3 août ne disait pas son mois : juillet restait « en
   * attente », et l'enregistrer depuis la liste était refusé — son numéro est
   * au livre. On la désigne, et juillet sort.
   */
  it('rattache à son mois une facture déjà au livre qui ne le disait pas', async () => {
    semer([facture({ id: 'r1', numero: '2026-007', emiseLe: dateISO('2026-08-03') })]);
    rendre();
    await userEvent.click(await screen.findByRole('button', { name: 'C’est la 2026-007, émise le 3 août 2026' }));

    expect(recettes()[0]?.moisFacture).toBe('2026-07');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Enregistrer la facture de juillet 2026 pour Client France' })).toBeNull());
  });

  /* Avec FREEL, rien ne change : le brouillon du mois propose d'émettre. */
  it('avec FREEL, le brouillon du mois reste, sans liste d’attente', () => {
    semer([], 'freel');
    rendre();
    expect(screen.getByRole('heading', { name: /La facture de août 2026/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Les mois en attente/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Nouvelle facture' })).toBeTruthy();
  });
});
