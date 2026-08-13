/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import type { Echeance } from '../../domain/calculs/provisions';
import { faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { etatPilote } from '../../state/selecteurs';
import { FournisseurToasts } from './Toasts';
import { Echeances } from './Echeances';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-13T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

const echeance = (p: Partial<Echeance> & { readonly id: string }): Echeance => ({
  nature: 'urssaf', montant: euros(2400), echeanceLe: dateISO('2026-09-05'),
  payeeLe: null, montantPaye: null, ...p
});

function semer(echeances: readonly Echeance[]): void {
  useFaits.setState({ faits: { ...faitsVides(), echeances } });
}

const rendre = () => render(
  <FournisseurToasts><Echeances aujourdhui={new Date('2026-08-13T09:00:00Z')} /></FournisseurToasts>
);

/**
 * LE TROU QUE CET ÉCRAN BOUCHE.
 *
 * Le volet « échéances émises » des provisions se calculait sur une liste vide,
 * parce qu'aucun écran ne pouvait créer une échéance. L'erreur allait dans le
 * sens dangereux : moins de provisions, donc plus de disponible, donc plus de
 * versable. L'application invitait à se verser de l'argent déjà dû.
 */
describe('saisir une échéance', () => {
  it('la fait entrer dans les provisions', async () => {
    rendre();
    const utilisateur = userEvent.setup();

    const avant = etatPilote(useFaits.getState().faits).voletConstate;
    expect(avant).toBe(0);

    await utilisateur.click(screen.getByRole('button', { name: 'Saisir une échéance' }));
    await utilisateur.type(screen.getByLabelText('Montant appelé (€)'), '2400');
    await utilisateur.type(screen.getByLabelText('Date d’échéance'), '2026-09-05');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer l’échéance' }));

    expect(etatPilote(useFaits.getState().faits).voletConstate).toBe(2400);
  });

  /**
   * Sans date, la somme pèserait sur les provisions sans apparaître dans aucun
   * mois : invisible au flux, mais bien retranchée du disponible.
   */
  it('refuse une échéance sans date plutôt que de la dater d’office', async () => {
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Saisir une échéance' }));
    await utilisateur.type(screen.getByLabelText('Montant appelé (€)'), '2400');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer l’échéance' }));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(useFaits.getState().faits.echeances).toEqual([]);
  });

  it('refuse un montant nul', async () => {
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Saisir une échéance' }));
    await utilisateur.type(screen.getByLabelText('Montant appelé (€)'), '0');
    await utilisateur.type(screen.getByLabelText('Date d’échéance'), '2026-09-05');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer l’échéance' }));

    expect(useFaits.getState().faits.echeances).toEqual([]);
  });
});

/**
 * Une échéance payée sort des provisions : l'argent a quitté le compte, le
 * solde bancaire la reflète déjà. L'y laisser retrancherait deux fois la même
 * somme du disponible.
 */
describe('enregistrer un paiement', () => {
  /**
   * Le paiement se PROUVE par une date, comme un encaissement de recette.
   * Une case « payée » serait le statut sans écriture qu'on refuse ailleurs.
   */
  it('la sort des provisions sans la sortir de la frise', async () => {
    semer([echeance({ id: 'e1' })]);
    rendre();
    const utilisateur = userEvent.setup();

    expect(etatPilote(useFaits.getState().faits).voletConstate).toBe(2400);

    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    await utilisateur.clear(screen.getByLabelText('Date du débit'));
    await utilisateur.type(screen.getByLabelText('Date du débit'), '2026-09-08');
    await utilisateur.click(
      screen.getAllByRole('button', { name: 'Enregistrer le paiement' }).at(-1)!
    );

    expect(etatPilote(useFaits.getState().faits).voletConstate).toBe(0);
    expect(useFaits.getState().faits.echeances[0]?.payeeLe).toBe('2026-09-08');
    // Toujours affichée : c'est l'historique de ce qui a été appelé.
    expect(screen.getByText('Payée')).toBeTruthy();
  });

  /**
   * Un échéancier annonce un montant ; ce qui part peut différer —
   * régularisation, changement de taux, majoration. L'écart n'est pas une
   * erreur à corriger, c'est lui qui explique un solde qui ne tombe pas juste.
   */
  it('conserve l’écart entre le montant appelé et le montant débité', async () => {
    semer([echeance({ id: 'e1', montant: euros(2400) })]);
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    await utilisateur.clear(screen.getByLabelText('Date du débit'));
    await utilisateur.type(screen.getByLabelText('Date du débit'), '2026-09-08');
    const montant = screen.getByLabelText('Montant réellement débité (€)');
    await utilisateur.clear(montant);
    await utilisateur.type(montant, '2512.40');
    await utilisateur.click(
      screen.getAllByRole('button', { name: 'Enregistrer le paiement' }).at(-1)!
    );

    expect(useFaits.getState().faits.echeances[0]?.montantPaye).toBe(2512.4);
    expect(screen.getByText(/sur l’appel de/)).toBeTruthy();
  });

  // Le cas ordinaire : les deux coïncident, il n'y a pas d'écart à stocker.
  it('ne stocke aucun écart quand le débit correspond à l’appel', async () => {
    semer([echeance({ id: 'e1', montant: euros(2400) })]);
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    await utilisateur.clear(screen.getByLabelText('Date du débit'));
    await utilisateur.type(screen.getByLabelText('Date du débit'), '2026-09-08');
    await utilisateur.click(
      screen.getAllByRole('button', { name: 'Enregistrer le paiement' }).at(-1)!
    );

    expect(useFaits.getState().faits.echeances[0]?.montantPaye).toBeNull();
  });

  // Sans date, on ne peut ni rapprocher le paiement, ni savoir de quel mois
  // la sortie relève.
  it('refuse un paiement sans date', async () => {
    semer([echeance({ id: 'e1' })]);
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    await utilisateur.clear(screen.getByLabelText('Date du débit'));
    await utilisateur.click(
      screen.getAllByRole('button', { name: 'Enregistrer le paiement' }).at(-1)!
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(useFaits.getState().faits.echeances[0]?.payeeLe).toBeNull();
  });

  it('se dépaie, pour rattraper une erreur', async () => {
    semer([echeance({ id: 'e1', payeeLe: dateISO('2026-09-05'), montantPaye: null })]);
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Repasser à payer' }));
    expect(useFaits.getState().faits.echeances[0]?.payeeLe).toBeNull();
  });
});

describe('états', () => {
  // Le jour même de l'échéance, on a la journée pour payer.
  it('n’est pas en retard le jour de l’échéance', () => {
    semer([echeance({ id: 'e1', echeanceLe: dateISO('2026-08-13') })]);
    rendre();
    expect(screen.getByText('À payer')).toBeTruthy();
  });

  it('est en retard le lendemain', () => {
    semer([echeance({ id: 'e1', echeanceLe: dateISO('2026-08-12') })]);
    rendre();
    expect(screen.getByText('En retard')).toBeTruthy();
  });

  it('ne totalise que ce qui reste à payer', () => {
    semer([
      echeance({ id: 'e1', montant: euros(2400) }),
      echeance({ id: 'e2', montant: euros(900), payeeLe: dateISO('2026-09-05'), montantPaye: null })
    ]);
    rendre();
    const total = screen.getByText('Reste à payer').parentElement as HTMLElement;
    expect(total.textContent).toContain('2');
    expect(total.textContent).not.toContain('3 300');
  });

  // L'état vide doit dire la CONSÉQUENCE, pas seulement le vide : c'est là que
  // se joue la surestimation du disponible.
  it('dit ce que coûte l’absence d’échéance', () => {
    semer([]);
    rendre();
    expect(screen.getByText(/disponible est surestimé/)).toBeTruthy();
  });
});

describe('corriger', () => {
  it('ouvre le formulaire déjà rempli', async () => {
    semer([echeance({ id: 'e1', nature: 'cfe', montant: euros(510) })]);
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Corriger' }));

    expect(screen.getByLabelText<HTMLInputElement>('Montant appelé (€)').value).toBe('510');
    expect(screen.getByLabelText<HTMLSelectElement>('Nature').value).toBe('cfe');
  });

  it('supprime une échéance saisie par erreur', async () => {
    semer([echeance({ id: 'e1' })]);
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Corriger' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer cette échéance' }));

    expect(useFaits.getState().faits.echeances).toEqual([]);
  });
});

/**
 * UN ÉCHÉANCIER SE SAISIT EN UNE FOIS, MAIS RESTE N ÉCHÉANCES.
 *
 * L'ancienne application avait une « charge récurrente » stockée comme telle :
 * une règle d'un côté, des instances de l'autre, et rien pour dire laquelle
 * fait foi quand un appel réel diffère de la règle. Or il diffère — un
 * trimestre se régularise, un taux change, un mois se reporte.
 *
 * Ici la répétition ne produit rien de nouveau : elle crée N échéances
 * ordinaires et s'efface.
 */
describe('répéter une échéance', () => {
  async function saisir(
    utilisateur: ReturnType<typeof userEvent.setup>,
    { montant = '2400', date = '2026-09-05' } = {}
  ) {
    await utilisateur.click(screen.getByRole('button', { name: 'Saisir une échéance' }));
    await utilisateur.type(screen.getByLabelText('Montant appelé (€)'), montant);
    await utilisateur.type(screen.getByLabelText('Date d’échéance'), date);
  }

  it('crée toute la série d’un seul geste', async () => {
    rendre();
    const utilisateur = userEvent.setup();
    await saisir(utilisateur);
    await utilisateur.selectOptions(screen.getByLabelText('Répéter'), 'trimestrielle');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer les échéances' }));

    const dates = useFaits.getState().faits.echeances.map((e) => e.echeanceLe);
    expect(dates).toEqual(['2026-09-05', '2026-12-05', '2027-03-05', '2027-06-05']);
  });

  /**
   * Chacune doit rester corrigeable séparément : c'est toute la différence
   * avec une règle stockée, et c'est ce que le message de confirmation dit.
   */
  it('rend des échéances ordinaires, corrigeables une par une', async () => {
    rendre();
    const utilisateur = userEvent.setup();
    await saisir(utilisateur);
    await utilisateur.selectOptions(screen.getByLabelText('Répéter'), 'trimestrielle');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer les échéances' }));

    // Quatre lignes, chacune avec son propre bouton de correction.
    expect(screen.getAllByRole('button', { name: 'Corriger' })).toHaveLength(4);
    expect(new Set(useFaits.getState().faits.echeances.map((e) => e.id)).size).toBe(4);
  });

  it('respecte le nombre demandé', async () => {
    rendre();
    const utilisateur = userEvent.setup();
    await saisir(utilisateur);
    await utilisateur.selectOptions(screen.getByLabelText('Répéter'), 'mensuelle');
    const combien = screen.getByLabelText('Combien d’échéances');
    await utilisateur.clear(combien);
    await utilisateur.type(combien, '2');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer les échéances' }));

    expect(useFaits.getState().faits.echeances).toHaveLength(2);
  });

  // Sans répétition, le geste reste celui d'avant : une échéance, un bouton.
  it('n’en crée qu’une quand la répétition n’est pas demandée', async () => {
    rendre();
    const utilisateur = userEvent.setup();
    await saisir(utilisateur);
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer l’échéance' }));

    expect(useFaits.getState().faits.echeances).toHaveLength(1);
  });

  // Corriger une échéance d'une série ne doit pas en recréer une autre.
  it('ne propose pas la répétition en correction', async () => {
    semer([echeance({ id: 'e1' })]);
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Corriger' }));

    expect(screen.queryByLabelText('Répéter')).toBeNull();
  });
});
