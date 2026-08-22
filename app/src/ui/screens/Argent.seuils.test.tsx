/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { dateISO, euros, mois } from '../../domain/types';
import { plafondMicro } from '../../domain/bareme';
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

/**
 * « 32 400 € / 77 700 € » puis « proj. 74 200 € » ou « dépass. ~ sept. » — le
 * dessin écrit trois nombres sous chaque barre. La jauge, elle, ne dit qu'un
 * ÉCART (« il reste X € avant le seuil de Y € ») : retrouver le réalisé
 * demandait de le soustraire de tête, ce qu'une jauge existe pour éviter.
 */
describe('les trois chiffres sous chaque jauge de seuil', () => {
  /** Récupère le conteneur d'une jauge à partir de son nom accessible. */
  function jaugeParLibelle(nomAccessible: RegExp): HTMLElement {
    const piste = screen.getAllByRole('img', { name: nomAccessible })[0];
    return piste?.parentElement as HTMLElement;
  }

  /**
   * La ligne compacte est un `<span>` dont le texte contient un « / » : c'est
   * le seul endroit de la jauge où ce caractère apparaît, ce qui la distingue
   * des `<span>` de `Montant` qu'elle contient (eux ne portent qu'un montant
   * seul, jamais la paire).
   */
  function ligneChiffree(jauge: HTMLElement): HTMLElement {
    return within(jauge).getByText(
      (_, el) => el?.tagName === 'SPAN' && (el.textContent ?? '').includes('/')
    );
  }

  it('affiche le réalisé et le plafond, pas seulement l’écart', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-30T09:00:00Z'));
    semer([{ montant: 30_000, le: '2026-03-15' }]);
    render(<Argent />);
    await attendreTresorerie();

    // Le plafond vient du barème daté, jamais recopié en dur ici : la table
    // 2026 de `plafonds.ts` est étiquetée confiance MOYENNE-BASSE et peut
    // changer avant confirmation à la source — un chiffre codé en dur dans ce
    // test se serait tu le jour où elle change.
    const plafond = plafondMicro(mois('2026-06'), 'BNC');
    expect(plafond.statut).not.toBe('refuse');
    const chiffrePlafond = plafond.statut === 'refuse' ? '' : String(plafond.valeur);

    const ligne = ligneChiffree(jaugeParLibelle(/^Plafond micro-BNC/));
    expect(ligne.textContent).toContain('30');
    expect(ligne.textContent).toContain('000');
    expect(ligne.textContent).toContain(chiffrePlafond.slice(0, 2));
    expect(ligne.textContent).toContain(chiffrePlafond.slice(2));
  });

  /**
   * Sous un trimestre, aucune base : ni réalisé chiffré à part le montant
   * brut, ni projection — la règle d'abstention du projet s'applique aussi à
   * ce nouveau chiffre, pas seulement à la phrase qui l'accompagnait déjà.
   */
  it('ne chiffre aucune projection quand la base est trop mince', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-02-10T09:00:00Z'));
    semer([{ montant: 30_000, le: '2026-01-15' }]);
    render(<Argent />);
    await attendreTresorerie();

    const ligne = ligneChiffree(jaugeParLibelle(/^Plafond micro-BNC/));
    expect(ligne.textContent).not.toContain('proj.');
    expect(ligne.textContent).not.toContain('dépass.');
  });

  it('chiffre la projection annuelle quand le seuil ne tombe pas cette année', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-30T09:00:00Z'));
    semer([{ montant: 30_000, le: '2026-03-15' }]);
    render(<Argent />);
    await attendreTresorerie();

    // Le plafond micro n'est pas franchi cette année au rythme constaté :
    // c'est la jauge « hors année » de ce jeu de données.
    const ligne = ligneChiffree(jaugeParLibelle(/^Plafond micro-BNC/));
    expect(ligne.textContent).toContain('proj.');
    expect(ligne.textContent).not.toContain('dépass.');
  });

  it('chiffre le mois de dépassement au lieu de le laisser seulement en prose', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-30T09:00:00Z'));
    semer([{ montant: 30_000, le: '2026-03-15' }]);
    render(<Argent />);
    await attendreTresorerie();

    // La franchise de TVA (37 500 €), elle, tombe cette année au même rythme.
    const ligne = ligneChiffree(jaugeParLibelle(/^Franchise de TVA/));
    expect(ligne.textContent).toContain('dépass.');
    expect(ligne.textContent).not.toContain('proj.');
  });
});
