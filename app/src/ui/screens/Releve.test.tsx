/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros, ratio } from '../../domain/types';
import { type Depense, type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Releve } from './Releve';

afterEach(cleanup);

beforeEach(() => {
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...modifications } });
}

const depense = (m: Partial<Depense> = {}): Depense => ({
  id: 'dep-1', libelle: 'Abonnement', fournisseur: 'Fournisseur',
  provenance: 'france', montantTtc: euros(120), tauxTva: ratio(0.20),
  payeeLe: dateISO('2026-07-15'), justificatifId: null,
  rapprochement: 'en_attente', ...m
});

const CSV = [
  'Date;Libellé;Montant',
  '15/07/2026;PRLV ABONNEMENT;-120,00',
  '20/07/2026;FRAIS DE TENUE DE COMPTE;-4,50'
].join('\n');

const fichier = (contenu = CSV, nom = 'releve.csv') =>
  new File([contenu], nom, { type: 'text/csv' });

async function importer(contenu = CSV) {
  const utilisateur = userEvent.setup();
  await utilisateur.upload(screen.getByLabelText(/Fichier CSV du relevé/i), fichier(contenu));
  await waitFor(() =>
    expect(useFaits.getState().faits.mouvementsBancaires.length).toBeGreaterThan(0));
  return utilisateur;
}

describe('import', () => {
  it('enregistre les opérations du fichier', async () => {
    render(<Releve />);
    await importer();
    expect(useFaits.getState().faits.mouvementsBancaires).toHaveLength(2);
    await screen.findByText(/2 opération\(s\) ajoutée\(s\)/);
  });

  // Il n'existe pas de format d'export bancaire : une colonne mal interprétée
  // produirait des montants plausibles, et rien ne la signalerait.
  it('dit ce qu’il a compris du fichier', async () => {
    render(<Releve />);
    await importer();
    expect(screen.getByText('Colonne montant').nextSibling?.textContent).toBe('Montant');
    expect(screen.getByText('Format de date').nextSibling?.textContent).toBe('JJ/MM/AAAA');
  });

  // On exporte « le mois dernier », puis « les trois derniers mois » : le
  // chevauchement est le cas ordinaire.
  it('ne double pas le solde à un réimport, et le dit', async () => {
    render(<Releve />);
    const utilisateur = await importer();

    await utilisateur.upload(screen.getByLabelText(/Fichier CSV du relevé/i), fichier());
    await screen.findByText(/déjà présente\(s\) et non dupliquée\(s\)/);
    expect(useFaits.getState().faits.mouvementsBancaires).toHaveLength(2);
  });

  it('refuse un fichier sans colonnes reconnaissables, en disant ce qu’il attend', async () => {
    render(<Releve />);
    const utilisateur = userEvent.setup();
    await utilisateur.upload(
      screen.getByLabelText(/Fichier CSV du relevé/i),
      fichier('Colonne A;Colonne B\n1;2')
    );
    // Le motif est cherché dans la zone de retour, et non dans la page :
    // l'explication repliée du « i » parle elle aussi de dates et de montants.
    const retour = await screen.findByRole('status');
    expect(retour.textContent).toMatch(/Aucune ligne de titres reconnue/);
    expect(useFaits.getState().faits.mouvementsBancaires).toHaveLength(0);
  });

  // Les écarter en silence ferait croire à un relevé complet.
  it('rend compte des lignes écartées', async () => {
    render(<Releve />);
    await importer([
      'Date;Libellé;Montant',
      '15/07/2026;PRLV ABONNEMENT;-120,00',
      'TOTAL;;−124,50'
    ].join('\n'));
    expect(screen.getByText(/1 ligne\(s\) écartée\(s\)/)).toBeTruthy();
  });

  it('efface les opérations sur demande, sans toucher aux dépenses', async () => {
    semer({ depenses: [depense()] });
    render(<Releve />);
    const utilisateur = await importer();

    await utilisateur.click(screen.getByRole('button', { name: /Effacer les opérations/ }));
    expect(useFaits.getState().faits.mouvementsBancaires).toHaveLength(0);
    expect(useFaits.getState().faits.depenses).toHaveLength(1);
  });
});

describe('rapprochement', () => {
  // L'ancienne application appariait seule : un appariement faux devenait
  // invisible.
  it('propose sans trancher, même quand un seul candidat correspond', async () => {
    semer({ depenses: [depense()] });
    render(<Releve />);
    await importer();

    expect(screen.getByText(/Une écriture correspond/)).toBeTruthy();
    // Rien n'est rapproché tant que personne n'a cliqué.
    expect(useFaits.getState().faits.mouvementsBancaires[0]?.rapprocheAvec).toBeNull();
  });

  it('rattache au clic, et permet de défaire', async () => {
    semer({ depenses: [depense()] });
    render(<Releve />);
    const utilisateur = await importer();

    await utilisateur.click(screen.getByRole('button', { name: /^Abonnement —/ }));
    const rapproche = useFaits.getState().faits.mouvementsBancaires
      .find((m) => m.rapprocheAvec !== null);
    expect(rapproche?.rapprocheAvec).toBe('dep-1');

    await utilisateur.click(screen.getByRole('button', { name: 'Défaire' }));
    expect(useFaits.getState().faits.mouvementsBancaires
      .every((m) => m.rapprocheAvec === null)).toBe(true);
  });

  // Sans cet état, frais bancaires et virements personnels resteraient
  // éternellement « à traiter » et l'écran ne serait plus regardé.
  it('permet de déclarer qu’aucune écriture ne correspond', async () => {
    render(<Releve />);
    const utilisateur = await importer();

    await utilisateur.click(screen.getAllByRole('button', { name: 'Sans contrepartie' })[0]!);
    expect(useFaits.getState().faits.mouvementsBancaires
      .some((m) => m.sansContrepartie !== null)).toBe(true);
    expect(screen.getAllByText('Sans contrepartie').length).toBeGreaterThan(0);
  });

  it('dit quand rien ne correspond, au lieu de laisser la ligne muette', async () => {
    render(<Releve />);
    await importer();
    expect(screen.getAllByText(/Aucune écriture de même montant/).length).toBe(2);
  });

  it('compte séparément ce qui est tranché et ce qui reste', async () => {
    semer({ depenses: [depense()] });
    render(<Releve />);
    const utilisateur = await importer();

    expect(screen.getByText('À trancher').nextSibling?.textContent).toBe('1');
    await utilisateur.click(screen.getByRole('button', { name: /^Abonnement —/ }));
    expect(screen.getByText('Rapprochées').nextSibling?.textContent).toBe('1');
    expect(screen.getByText('À trancher').nextSibling?.textContent).toBe('0');
  });
});

describe('sans relevé', () => {
  // Afficher un solde figé comme s'il était à jour serait pire que de dire
  // qu'il ne l'est pas.
  it('dit que le solde n’est pas suivi', () => {
    render(<Releve />);
    expect(screen.getByText(/le solde affiché\s+reste le solde initial/)).toBeTruthy();
  });
});

/**
 * NOMMER UN VIREMENT, PAS EN SAISIR UN.
 *
 * Se verser de l'argent n'est pas une opération comptable en micro : la
 * personne et l'entreprise sont la même. Le virement figure déjà au relevé et
 * le solde le reflète déjà — l'enregistrer comme un fait distinct le
 * compterait deux fois. Il n'y a donc rien à saisir, seulement à nommer.
 */
describe('rémunération versée', () => {
  it('se déclare sur un débit, et se lit sur la ligne', async () => {
    render(<Releve />);
    const utilisateur = await importer();

    await utilisateur.click(
      screen.getAllByRole('button', { name: 'Rémunération que je me suis versée' })[0]!
    );

    expect(useFaits.getState().faits.mouvementsBancaires
      .some((m) => m.sansContrepartie === 'remuneration')).toBe(true);
    expect(screen.getAllByText('Rémunération versée').length).toBeGreaterThan(0);
  });

  /**
   * Un crédit ne peut pas être un virement qu'on s'est versé. L'offrir
   * inviterait à mal classer une recette — et une recette mal classée sort du
   * chiffre d'affaires.
   */
  it('n’est pas proposée sur un crédit', async () => {
    render(<Releve />);
    await importer([
      'Date;Libellé;Montant',
      '15/07/2026;VIR RECU CLIENT;+4200,00'
    ].join('\n'));

    // « Sans contrepartie » reste offert — un crédit peut être un apport ou un
    // remboursement. « Rémunération », non : ce serait inviter à classer une
    // recette hors du chiffre d'affaires.
    expect(screen.getAllByRole('button', { name: 'Sans contrepartie' }).length).toBe(1);
    expect(
      screen.queryByRole('button', { name: 'Rémunération que je me suis versée' })
    ).toBeNull();
  });

  it('se reprend, comme tout classement', async () => {
    render(<Releve />);
    const utilisateur = await importer();

    await utilisateur.click(
      screen.getAllByRole('button', { name: 'Rémunération que je me suis versée' })[0]!
    );
    await utilisateur.click(screen.getAllByRole('button', { name: 'Reprendre' })[0]!);

    expect(useFaits.getState().faits.mouvementsBancaires
      .every((m) => m.sansContrepartie === null)).toBe(true);
  });
});
