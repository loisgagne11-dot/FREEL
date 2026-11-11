/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { dateISO, euros } from '../../domain/types';
import type { Echeance } from '../../domain/calculs/provisions';
import { faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { FournisseurToasts } from './Toasts';
import { Sorties } from './Sorties';

/*
 * Le panneau « Sorties » du Pilote : pointer une échéance payée. Le 10 juin
 * 2026, un appel de mai est resté impayé, deux tombent en juin, et un
 * échéancier court jusqu'en septembre. Valeurs fictives.
 */

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
});

afterEach(() => { cleanup(); vi.useRealTimers(); });

const ech = (p: Partial<Echeance> & { readonly id: string }): Echeance => ({
  nature: 'urssaf', montant: euros(500), echeanceLe: dateISO('2026-06-30'),
  payeeLe: null, montantPaye: null, ...p
});

const ECHEANCES: readonly Echeance[] = [
  ech({ id: 'tva-juin', nature: 'tva', montant: euros(420), echeanceLe: dateISO('2026-06-24') }),
  ech({ id: 'urssaf-mai', montant: euros(980), echeanceLe: dateISO('2026-05-05') }),
  ech({ id: 'cfp-juin', nature: 'cfp', montant: euros(30), echeanceLe: dateISO('2026-06-30') }),
  ech({ id: 'urssaf-juillet', montant: euros(1000), echeanceLe: dateISO('2026-07-05') }),
  ech({ id: 'urssaf-aout', montant: euros(1000), echeanceLe: dateISO('2026-08-05') }),
  ech({ id: 'payee', montant: euros(700), echeanceLe: dateISO('2026-06-05'), payeeLe: dateISO('2026-06-05') })
];

function afficher(cible: string | null = null) {
  useFaits.setState({ faits: { ...faitsVides(), echeances: [...ECHEANCES] } });
  const onFermer = vi.fn();
  render(<FournisseurToasts><Sorties cible={cible} onFermer={onFermer} /></FournisseurToasts>);
  return { onFermer, liste: screen.getByRole('list', { name: 'Échéances à payer' }) };
}

const enMagasin = (id: string) => useFaits.getState().faits.echeances.find((e) => e.id === id);

function ligneDe(liste: HTMLElement, texte: RegExp): HTMLElement {
  const ligne = within(liste).getAllByRole('listitem').find((li) => texte.test(li.textContent ?? ''));
  if (ligne === undefined) throw new Error(`Aucune ligne pour ${String(texte)}`);
  return ligne;
}

describe('ce qui reste à payer', () => {
  it('liste les échéances jusqu’à la fin du mois, le retard en tête, et compte le reste', () => {
    const { liste } = afficher();
    const lignes = within(liste).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toMatch(/Cotisations URSSAF.*en retard/);
    expect(lignes[1]).toMatch(/TVA/);
    expect(lignes[2]).toMatch(/Contribution à la formation/);

    expect(screen.getByText('3 échéances à payer')).toBeTruthy();
    // 980 + 420 + 30
    expect(screen.getByText(/1\s430/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /2 autres plus tard.*voir l’échéancier/ }).getAttribute('href'))
      .toBe('#/argent');
  });
});

describe('marquer payée', () => {
  it('n’écrit rien avant la confirmation, puis porte la date du débit', () => {
    const { liste } = afficher();
    const ligne = ligneDe(liste, /TVA/);
    fireEvent.click(within(ligne).getByRole('button', { name: /Marquer payée/ }));
    expect(enMagasin('tva-juin')?.payeeLe).toBeNull();

    fireEvent.change(within(ligne).getByLabelText('Date du débit'), { target: { value: '2026-06-08' } });
    fireEvent.click(within(ligne).getByRole('button', { name: 'Confirmer le paiement' }));

    expect(enMagasin('tva-juin')).toMatchObject({ payeeLe: '2026-06-08', montantPaye: null });
    expect(within(liste).queryByText(/^TVA$/)).toBeNull();
    expect(screen.getByText('2 échéances à payer')).toBeTruthy();
  });

  /** Une régularisation, une majoration : l'écart explique un solde qui ne tombe pas juste. */
  it('garde l’écart quand le débit diffère de l’appel', () => {
    const { liste } = afficher();
    const ligne = ligneDe(liste, /Cotisations URSSAF/);
    fireEvent.click(within(ligne).getByRole('button', { name: /Marquer payée/ }));
    fireEvent.change(within(ligne).getByLabelText('Montant réellement débité (€)'), { target: { value: '1012,50' } });
    fireEvent.click(within(ligne).getByRole('button', { name: 'Confirmer le paiement' }));

    expect(enMagasin('urssaf-mai')).toMatchObject({ payeeLe: '2026-06-10', montantPaye: 1012.5 });
  });

  /** Un débit à venir n'est pas un débit : la provision partirait avant l'argent. */
  it('refuse une date de débit qui n’est pas encore arrivée', () => {
    const { liste } = afficher();
    const ligne = ligneDe(liste, /TVA/);
    fireEvent.click(within(ligne).getByRole('button', { name: /Marquer payée/ }));
    fireEvent.change(within(ligne).getByLabelText('Date du débit'), { target: { value: '2026-06-24' } });
    fireEvent.click(within(ligne).getByRole('button', { name: 'Confirmer le paiement' }));

    expect(within(ligne).getByRole('alert').textContent).toMatch(/pas encore arrivée/);
    expect(enMagasin('tva-juin')?.payeeLe).toBeNull();
  });

  it('« Annuler » referme la ligne sans rien écrire', () => {
    const { liste } = afficher();
    const ligne = ligneDe(liste, /TVA/);
    fireEvent.click(within(ligne).getByRole('button', { name: /Marquer payée/ }));
    fireEvent.click(within(ligne).getByRole('button', { name: 'Annuler' }));
    expect(within(ligne).queryByLabelText('Date du débit')).toBeNull();
    expect(enMagasin('tva-juin')?.payeeLe).toBeNull();
  });
});

describe('ouvert depuis une pastille du flux', () => {
  it('ouvre directement la saisie de l’échéance cliquée, et elle seule', () => {
    const { liste } = afficher('urssaf-mai');
    expect(within(ligneDe(liste, /Cotisations URSSAF/)).getByLabelText<HTMLInputElement>('Montant réellement débité (€)').value)
      .toBe('980');
    expect(within(ligneDe(liste, /TVA/)).queryByLabelText('Date du débit')).toBeNull();
  });

  it('« Terminé » ferme', () => {
    const { onFermer } = afficher();
    fireEvent.click(screen.getByRole('button', { name: 'Terminé' }));
    expect(onFermer).toHaveBeenCalledTimes(1);
  });
});
