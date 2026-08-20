/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { dateISO, euros } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Argent } from './Argent';

/**
 * Le pilier Trésorerie est chargé à la demande depuis le lot B : on attend son
 * arrivée avant d'interroger le contenu, sinon la première assertion tombe sur
 * le « Chargement… » du Suspense.
 *
 * L'ancre est le titre de la carte de répartition, que le handoff garde tel
 * quel — les libellés des tuiles, eux, changent d'un lot à l'autre.
 */
async function attendreTresorerie(): Promise<void> {
  await screen.findByText(/n’est pas tout à toi/);
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

function semer(recettes: readonly { montant: number; le: string }[]): void {
  useFaits.setState({
    faits: {
      ...faitsVides(),
      recettes: recettes.map((r, i) => ({
        id: `r${i}`, clientNom: 'C', libelle: 'l', montant: euros(r.montant),
        emiseLe: dateISO(r.le), encaisseeLe: dateISO(r.le),
        modeReglement: 'virement' as const, numero: `${i}`
      }))
    } as Faits
  });
}

/**
 * « À LA DATE D'AUJOURD'HUI, OÙ J'EN SUIS » — la question posée telle quelle.
 *
 * « 69 % du plafond » est une excellente nouvelle au 15 mars et un problème au
 * 15 novembre. La jauge répondait à « combien ai-je consommé », jamais à
 * « est-ce que je vais dépasser ».
 */
describe('repère de date et projection sur les seuils', () => {
  it('annonce le mois de franchissement au rythme constaté', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-30T09:00:00Z'));
    semer([{ montant: 30_000, le: '2026-03-15' }]);
    render(<Argent />);
    await attendreTresorerie();

    expect(screen.getAllByText(/seuil atteint vers/).length).toBeGreaterThan(0);
  });

  /**
   * LE POINT QUI COMPTE. Sous un trimestre, un seul règlement important
   * suffit à tripler le rythme apparent : une date affichée sauterait d'un
   * mois à l'autre chaque semaine. L'écran dit pourquoi il se tait.
   */
  it('dit pourquoi il ne projette pas, au lieu d’afficher une date', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-02-10T09:00:00Z'));
    semer([{ montant: 30_000, le: '2026-01-15' }]);
    render(<Argent />);
    await attendreTresorerie();

    expect(screen.getAllByText(/Pas de projection/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/seuil atteint vers/)).toBeNull();
  });

  /**
   * Le repère est un fait de calendrier, et il entre dans le nom accessible :
   * un trait vertical ne se décrit pas de lui-même.
   */
  it('nomme le repère de date pour les lecteurs d’écran', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-15T09:00:00Z'));
    semer([{ montant: 30_000, le: '2026-03-15' }]);
    render(<Argent />);
    await attendreTresorerie();

    const jauge = screen.getAllByRole('img', { name: /Plafond micro-BNC/ })[0];
    expect(jauge?.getAttribute('aria-label')).toMatch(/87 % de l’année écoulée/);
  });

  /** Un seuil déjà franchi n'a plus de date à prévoir : la jauge le dit déjà. */
  it('ne projette rien sur un seuil déjà dépassé', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-15T09:00:00Z'));
    semer([{ montant: 90_000, le: '2026-03-15' }]);
    render(<Argent />);
    await attendreTresorerie();

    expect(screen.queryByText(/seuil atteint vers/)).toBeNull();
    expect(screen.getAllByText(/Seuil dépassé de/).length).toBeGreaterThan(0);
  });
});
