/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { dateISO, euros } from '../../domain/types';
import { type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { FournisseurToasts } from './Toasts';
import { Encaissements } from './Encaissements';

/*
 * Le panneau « Encaissements » du Pilote : pointer une facture comme payée.
 * Le 10 juin 2026, trois factures attendent leur argent — une en retard — et
 * un brouillon n'est pas encore parti. Valeurs et noms fictifs.
 */

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
});

afterEach(() => { cleanup(); vi.useRealTimers(); });

function recette(m: Partial<Recette>): Recette {
  return {
    id: 'r', clientNom: 'Client démo', libelle: 'Prestation', montant: euros(1000),
    emiseLe: dateISO('2026-05-20'), encaisseeLe: null, modeReglement: null,
    numero: '2026-000', echeanceLe: dateISO('2026-06-19'), ...m
  };
}

const FACTURES: readonly Recette[] = [
  recette({ id: 'a-venir', clientNom: 'Atelier Fictif', numero: '2026-025', montant: euros(2400), echeanceLe: dateISO('2026-07-27') }),
  recette({ id: 'retard', clientNom: 'Studio Exemple', numero: '2026-024', montant: euros(1200), echeanceLe: dateISO('2026-05-29') }),
  recette({ id: 'bientot', clientNom: 'Studio Exemple', numero: '2026-026', montant: euros(2410), echeanceLe: dateISO('2026-07-04') }),
  recette({ id: 'brouillon', clientNom: 'Brasserie Démo', numero: '2026-027', montant: euros(2880), emiseLe: null, echeanceLe: null }),
  // Déjà payée, par chèque : c'est le mode que ce client utilise.
  recette({
    id: 'payee', clientNom: 'Studio Exemple', numero: '2026-020', montant: euros(900),
    emiseLe: dateISO('2026-03-01'), encaisseeLe: dateISO('2026-03-20'), modeReglement: 'cheque'
  })
];

function afficher(cible: string | null = null, faits: Faits = { ...faitsVides(), recettes: [...FACTURES] }) {
  useFaits.setState({ faits });
  const onFermer = vi.fn();
  render(<FournisseurToasts><Encaissements cible={cible} onFermer={onFermer} /></FournisseurToasts>);
  return { onFermer, liste: screen.getByRole('list', { name: 'Factures en attente de règlement' }) };
}

const recetteDuMagasin = (id: string) => useFaits.getState().faits.recettes.find((r) => r.id === id);

function ligneDe(liste: HTMLElement, numero: string): HTMLElement {
  const ligne = within(liste).getAllByRole('listitem').find((li) => li.textContent?.includes(numero));
  if (ligne === undefined) throw new Error(`Aucune ligne pour ${numero}`);
  return ligne;
}

describe('ce qui reste à encaisser', () => {
  it('compte les factures émises non réglées et leur total, sans le brouillon', () => {
    afficher();
    expect(screen.getByText('3 factures en attente')).toBeTruthy();
    // 1 200 + 2 400 + 2 410 : le brouillon n'est pas encore demandé au client.
    expect(screen.getByText(/6\s010/)).toBeTruthy();
  });

  /** Quand un virement arrive, on cherche d'abord la facture qu'on attend depuis le plus longtemps. */
  it('met la facture en retard en tête, puis les échéances les plus proches', () => {
    const { liste } = afficher();
    const numeros = within(liste).getAllByRole('listitem').map((li) => li.textContent?.match(/2026-\d{3}/)?.[0]);
    expect(numeros).toEqual(['2026-024', '2026-026', '2026-025', '2026-027']);
    expect(within(ligneDe(liste, '2026-024')).getByText('en retard')).toBeTruthy();
    expect(within(ligneDe(liste, '2026-026')).queryByText('en retard')).toBeNull();
  });

  it('montre le brouillon à émettre, sans rien à pointer', () => {
    const { liste } = afficher();
    const brouillon = ligneDe(liste, '2026-027');
    expect(within(brouillon).queryByRole('button')).toBeNull();
    expect(within(brouillon).getByRole('link').getAttribute('href')).toBe('#/activite/factures');
  });
});

describe('marquer payé', () => {
  /**
   * Un pointage en un clic porterait au livre la date du jour pour un virement
   * reçu la semaine dernière — à cheval, parfois, sur un trimestre déjà déclaré.
   */
  it('n’écrit rien avant la confirmation, puis porte la date et le mode choisis', () => {
    const { liste } = afficher();
    const ligne = ligneDe(liste, '2026-025');
    fireEvent.click(within(ligne).getByRole('button', { name: /Marquer payé/ }));

    expect(recetteDuMagasin('a-venir')?.encaisseeLe).toBeNull();

    fireEvent.change(within(ligne).getByLabelText('Date d’encaissement'), { target: { value: '2026-06-07' } });
    fireEvent.change(within(ligne).getByLabelText('Mode de règlement'), { target: { value: 'carte' } });
    expect(recetteDuMagasin('a-venir')?.encaisseeLe).toBeNull();

    fireEvent.click(within(ligne).getByRole('button', { name: 'Confirmer le règlement' }));

    expect(recetteDuMagasin('a-venir')).toMatchObject({ encaisseeLe: '2026-06-07', modeReglement: 'carte' });
    expect(within(liste).queryByText(/2026-025/)).toBeNull();
    expect(screen.getByText('2 factures en attente')).toBeTruthy();
    expect(screen.getByText('Règlement enregistré au livre des recettes.')).toBeTruthy();
  });

  it('« Annuler » referme la ligne sans rien écrire', () => {
    const { liste } = afficher();
    const ligne = ligneDe(liste, '2026-025');
    fireEvent.click(within(ligne).getByRole('button', { name: /Marquer payé/ }));
    fireEvent.click(within(ligne).getByRole('button', { name: 'Annuler' }));

    expect(within(ligne).queryByLabelText('Date d’encaissement')).toBeNull();
    expect(recetteDuMagasin('a-venir')?.encaisseeLe).toBeNull();
  });

  /** L'argent qui arrivera demain n'est pas encaissé. */
  it('refuse une date qui n’est pas encore arrivée, et le dit sur la ligne', () => {
    const { liste } = afficher();
    const ligne = ligneDe(liste, '2026-025');
    fireEvent.click(within(ligne).getByRole('button', { name: /Marquer payé/ }));
    fireEvent.change(within(ligne).getByLabelText('Date d’encaissement'), { target: { value: '2026-06-11' } });
    fireEvent.click(within(ligne).getByRole('button', { name: 'Confirmer le règlement' }));

    expect(within(ligne).getByRole('alert').textContent).toMatch(/pas encore arrivée/);
    expect(recetteDuMagasin('a-venir')?.encaisseeLe).toBeNull();
  });
});

describe('ouvert depuis une pastille du flux', () => {
  /** On a cliqué la pastille d'UNE facture : c'est elle qu'on pointe, sans la chercher. */
  it('ouvre directement la saisie de cette facture, au mode habituel du client', () => {
    const { liste } = afficher('retard');
    const ligne = ligneDe(liste, '2026-024');
    expect(within(ligne).getByLabelText<HTMLInputElement>('Date d’encaissement').value).toBe('2026-06-10');
    // Ce client a réglé sa dernière facture par chèque.
    expect(within(ligne).getByLabelText<HTMLSelectElement>('Mode de règlement').value).toBe('cheque');
    expect(within(ligneDe(liste, '2026-025')).queryByLabelText('Date d’encaissement')).toBeNull();
  });

  it('propose le virement à un client qui n’a encore rien réglé', () => {
    const { liste } = afficher('a-venir');
    expect(within(ligneDe(liste, '2026-025')).getByLabelText<HTMLSelectElement>('Mode de règlement').value)
      .toBe('virement');
  });
});

describe('le pied du panneau', () => {
  it('rappelle que seul l’encaissé compte, et « Terminé » ferme', () => {
    const { onFermer } = afficher();
    expect(screen.getByText(/Encaissé ≠ facturé/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Terminé' }));
    expect(onFermer).toHaveBeenCalledTimes(1);
  });

  it('dit qu’il n’y a rien à encaisser quand tout est réglé', () => {
    afficher(null, { ...faitsVides(), recettes: [FACTURES[4] as Recette] });
    expect(screen.getByText(/toutes tes factures émises sont réglées/)).toBeTruthy();
    expect(screen.getByText('Aucune facture en attente')).toBeTruthy();
  });
});
