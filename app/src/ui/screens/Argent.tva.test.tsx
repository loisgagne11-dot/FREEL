/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Argent } from './Argent';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // 15 octobre 2026 : le trimestre à déclarer est le T3.
  vi.setSystemTime(new Date('2026-10-15T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
});

function semer(m: Partial<Faits> = {}): void {
  useFaits.setState({
    faits: {
      ...faitsVides(),
      entreprise: { ...faitsVides().entreprise, tvaDepuis: dateISO('2025-01-01') },
      ...m
    } as Faits
  });
}

const recette = (
  id: string, encaisseeLe: string | null, montant: number, tva: number | null
) => ({
  id, clientNom: 'Client', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO('2026-06-01'),
  encaisseeLe: encaisseeLe === null ? null : dateISO(encaisseeLe),
  modeReglement: 'virement' as const, numero: id,
  tvaCollectee: tva === null ? null : euros(tva)
});

/**
 * Le dossier s'ouvre depuis son jalon, comme l'énoncé le demande — et son
 * module arrive à la demande. On attend donc son arrivée avant d'interroger
 * le contenu.
 */
async function ouvrirDossier(): Promise<HTMLElement> {
  render(<Argent />);
  await userEvent.setup().click(
    screen.getByRole('button', { name: 'Préparer ma déclaration de TVA' })
  );
  const trimestre = await screen.findByLabelText('Trimestre déclaré');
  return trimestre.closest('div[class]')?.parentElement as HTMLElement;
}

/**
 * « JE DOIS DÉCLARER MA TVA POUR UN TRIMESTRE. AU CLIC, J'AI TOUTES LES
 * INFORMATIONS POUR REMPLIR MA DÉCLARATION. »
 *
 * L'exigence est d'usage, pas d'affichage : le critère est qu'on puisse
 * remplir le formulaire officiel sans quitter l'écran ni chercher ailleurs.
 */
describe('dossier de déclaration de TVA', () => {
  it('s’ouvre sur le trimestre écoulé, celui qu’on a à déclarer', async () => {
    semer();
    const d = within(await ouvrirDossier());
    expect(d.getByLabelText('Trimestre déclaré').textContent).toBe('T3 2026');
  });

  /**
   * LE PIÈGE QUI FAIT DÉCLARER FAUX. La TVA sur les prestations de services
   * est exigible à l'ENCAISSEMENT, pas à la facturation. Une facture émise en
   * juin et réglée en août relève du trimestre d'août.
   */
  it('retient la date d’encaissement, pas celle d’émission', async () => {
    semer({
      recettes: [
        recette('dedans', '2026-08-10', 5000, 1000),
        recette('avant', '2026-06-20', 9000, 1800)
      ]
    });
    const d = within(await ouvrirDossier());

    expect(d.getByText('Encaissements du trimestre (1)')).toBeTruthy();
    expect(d.getByText('TVA collectée').parentElement?.textContent).toMatch(/1\s*000/u);
    // La facture de juin est encaissée hors période : ni sa TVA ni sa base
    // n'entrent dans ce trimestre.
    expect(d.queryByText('1 800 €')).toBeNull();
    expect(d.getByText('Base hors taxes encaissée').parentElement?.textContent)
      .toMatch(/5\s*000/u);
  });

  /** Le détail des pièces, sans quoi il faut rouvrir le facturier. */
  it('liste les factures précises concernées', async () => {
    semer({ recettes: [recette('2026-014', '2026-08-10', 5000, 1000)] });
    expect(within(await ouvrirDossier()).getByText(/2026-014/)).toBeTruthy();
  });

  /**
   * CE QU'ON NE SAIT PAS NE VAUT PAS ZÉRO. Sous-évaluer une TVA collectée est
   * le sens dangereux de l'erreur : c'est celui qui produit un rappel.
   */
  it('signale les encaissements dont la TVA n’a pas été conservée', async () => {
    semer({
      recettes: [
        recette('connu', '2026-08-10', 5000, 1000),
        recette('inconnu', '2026-09-01', 3000, null)
      ]
    });
    const d = within(await ouvrirDossier());

    expect(d.getByText(/sous-évalué/)).toBeTruthy();
    expect(d.getByText('TVA inconnue')).toBeTruthy();
    // La base hors taxes, elle, reste complète : seule la taxe manque.
    expect(d.getByText('Base hors taxes encaissée').parentElement?.textContent)
      .toMatch(/8\s*000/u);
  });

  /**
   * Un crédit n'est pas une somme à payer : afficher « −450 € à reverser »
   * ferait chercher une erreur là où il y a un droit.
   */
  it('annonce un crédit plutôt qu’un montant négatif à payer', async () => {
    semer({
      recettes: [recette('r', '2026-08-10', 500, 100)],
      depenses: [{
        id: 'd1', libelle: 'Matériel', fournisseur: 'Fournisseur',
        provenance: 'france' as const, montantTtc: euros(3300),
        tauxTva: 0.2 as never, payeeLe: dateISO('2026-08-05'),
        justificatifId: 'j1', rapprochement: 'aucun' as never
      }] as Faits['depenses']
    });
    const d = within(await ouvrirDossier());

    expect(d.getByText('Crédit de TVA à reporter')).toBeTruthy();
    expect(d.queryByText('TVA à reverser')).toBeNull();
  });

  it('permet de reculer d’un trimestre', async () => {
    semer();
    const d = within(await ouvrirDossier());

    await userEvent.setup().click(d.getByRole('button', { name: 'Trimestre précédent' }));
    expect(d.getByLabelText('Trimestre déclaré').textContent).toBe('T2 2026');
  });

  /** Le passage d'année ne doit pas produire un « T0 » ni un « T5 ». */
  it('franchit correctement le passage à l’année', async () => {
    semer();
    const d = within(await ouvrirDossier());
    const utilisateur = userEvent.setup();

    for (let i = 0; i < 3; i++) {
      await utilisateur.click(d.getByRole('button', { name: 'Trimestre précédent' }));
    }
    expect(d.getByLabelText('Trimestre déclaré').textContent).toBe('T4 2025');
  });
});
