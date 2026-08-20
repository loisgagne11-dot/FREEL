/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { dateISO, euros } from '../../domain/types';
import type { Echeance } from '../../domain/calculs/provisions';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { eur } from '../format';
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

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...modifications } });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-07-15T09:00:00Z'));
  semer();
});

const ech = (id: string, nature: Echeance['nature'], montant: number): Echeance => ({
  id, nature, montant: euros(montant), echeanceLe: dateISO('2026-08-31'),
  payeeLe: null, montantPaye: null
});

/**
 * « SUR CETTE SOMME TOTALE, COMBIEN J'AI DE PROVISION ET SUR QUELLE
 * CATÉGORIE » — la question posée telle quelle.
 *
 * L'ancienne application la montrait, la maquette aussi : le total seul ne
 * permet ni de rapprocher une provision de l'avis reçu, ni de savoir ce qui se
 * libère après une déclaration.
 */
describe('ventilation des provisions à l’écran', () => {
  it('affiche chaque nature avec son montant', async () => {
    semer({ echeances: [ech('a', 'urssaf', 4100), ech('b', 'tva', 1800), ech('c', 'cfe', 300)] });
    render(<Argent />);
    await attendreTresorerie();

    const enveloppes = screen.getByText(/Enveloppes de provision/).closest('section');
    expect(enveloppes).toBeTruthy();
    const dans = within(enveloppes as HTMLElement);

    expect(dans.getByText('URSSAF — cotisations sociales')).toBeTruthy();
    expect(dans.getByText('4 100 €')).toBeTruthy();
    expect(dans.getByText('TVA à reverser')).toBeTruthy();
    expect(dans.getByText('1 800 €')).toBeTruthy();
    expect(dans.getByText('CFE — cotisation foncière')).toBeTruthy();
  });

  /**
   * UNE ENVELOPPE VIDE NE PREND PAS DE PLACE — MAIS LE CALCUL LA GARDE.
   *
   * Ce test protégeait l'inverse : avec la barre segmentée, une nature à zéro
   * restait affichée, parce qu'une catégorie qui disparaît donne à croire
   * qu'elle n'existe pas. La règle a changé AVEC la forme, et pour une raison.
   *
   * La barre montrait des proportions : y garder les zéros coûtait une ligne de
   * légende. Les vignettes montrent une couverture et une échéance : quatre
   * vignettes vides sur un compte neuf n'apprennent rien et poussent hors de
   * l'écran celles qui portent une date.
   *
   * Ce que l'ancien test tenait vraiment — « ne pas décaler les vignettes d'un
   * mois à l'autre » — est tenu ailleurs, et mieux : `enveloppesDeProvision`
   * rend TOUJOURS les cinq natures dans leur ordre canonique, et son test le
   * vérifie. Le filtrage est à l'écran parce que c'est une question de place,
   * pas de vérité.
   */
  it('n’affiche pas d’enveloppe pour une nature qui ne doit rien', async () => {
    semer({ echeances: [ech('a', 'urssaf', 4100)] });
    render(<Argent />);
    await attendreTresorerie();

    const enveloppes = screen.getByText(/Enveloppes de provision/).closest('section');
    const dans = within(enveloppes as HTMLElement);
    expect(dans.getByText('URSSAF — cotisations sociales')).toBeTruthy();
    expect(dans.queryByText('CFP — formation professionnelle')).toBeNull();
  });

  /**
   * L'ENVELOPPE DIT SI ELLE PASSERA, ET QUAND.
   *
   * C'est la seule question qu'on se pose devant elle. La barre segmentée
   * répondait à « quel pourcentage de mes provisions est de l'URSSAF », que
   * personne ne se demande.
   */
  it('met la couverture en face du dû, avec la date qui vient', async () => {
    semer({ soldeInitial: euros(1_000), echeances: [ech('a', 'urssaf', 4100)] });
    render(<Argent />);
    await attendreTresorerie();

    const enveloppes = screen.getByText(/Enveloppes de provision/).closest('section');
    const dans = within(enveloppes as HTMLElement);
    // 1 000 € sur le compte, 4 100 € dus : l'enveloppe n'est pas couverte.
    const vignette = dans.getByText('URSSAF — cotisations sociales').parentElement?.parentElement;
    expect(vignette?.textContent).toContain(eur(1_000));
    expect(vignette?.textContent).toContain(`sur ${eur(4_100)}`);
    expect(vignette?.textContent).toContain('éch.');
  });

  /**
   * Chaque montant de la ventilation porte `data-montant` : sans lui, le mode
   * confidentiel laisserait lire l'URSSAF et la TVA en clair sur un écran
   * partagé — et une provision dit à elle seule le chiffre d'affaires.
   */
  it('rend chaque montant masquable', async () => {
    semer({ echeances: [ech('a', 'urssaf', 4100), ech('b', 'tva', 1800)] });
    render(<Argent />);
    await attendreTresorerie();

    const enveloppes = screen.getByText(/Enveloppes de provision/).closest('section');
    for (const texte of ['4 100 €', '1 800 €']) {
      const noeud = within(enveloppes as HTMLElement).getByText(texte);
      expect(noeud.closest('[data-montant]')).toBeTruthy();
    }
  });
});

/**
 * LA PROVISION D'IMPÔT NE S'AFFICHE JAMAIS NUE.
 *
 * Elle repose sur des faits que l'utilisateur seul connaît — ses parts, les
 * autres revenus de son foyer — et sur un barème qui n'est pas toujours
 * publié. Présentée sans ses réserves, elle se lit comme « voilà ce que je
 * dois », et on se verse le reste.
 */
describe('provision d’impôt sur le revenu à l’écran', () => {
  const recette = (montant: number) => ({
    id: 'r1', clientNom: 'C', libelle: 'Mission', montant: euros(montant),
    emiseLe: dateISO('2026-06-30'), encaisseeLe: dateISO('2026-07-10'),
    modeReglement: 'virement' as const, numero: '2026-001'
  });

  it('dit pourquoi elle n’est pas provisionnée quand les parts manquent', async () => {
    semer({ recettes: [recette(60000)] });
    render(<Argent />);
    await attendreTresorerie();
    // `getAllBy` : le titre en gras et la ligne qui le contient répondent tous
    // deux au motif. C'est un détail de rendu, pas deux endroits.
    expect(screen.getAllByText(/non provisionné/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/parts fiscales/).length).toBeGreaterThan(0);
  });

  it('affiche le reste à mettre de côté et nomme ce qu’il ignore', async () => {
    semer({ recettes: [recette(60000)], partsFiscales: 1 });
    render(<Argent />);
    await attendreTresorerie();
    expect(screen.getAllByText(/restant à\s+mettre de côté/).length).toBeGreaterThan(0);
    // Autres revenus et PER non renseignés : deux réserves qui vont dans des
    // sens opposés, et qui doivent être dites toutes les deux.
    expect(screen.getByText(/Autres revenus du foyer non renseignés/)).toBeTruthy();
    expect(screen.getByText(/Versement PER non renseigné/)).toBeTruthy();
  });

  // Sous versement libératoire, l'impôt est déjà payé avec les cotisations :
  // une seconde ligne le compterait deux fois, et l'expliquer laisserait croire
  // qu'il manque une provision.
  it('ne dit rien sous le versement libératoire', async () => {
    semer({
      recettes: [recette(60000)],
      entreprise: { ...faitsVides().entreprise, versementLiberatoire: true }
    });
    render(<Argent />);
    await attendreTresorerie();
    expect(screen.queryAllByText(/non provisionné/)).toHaveLength(0);
    expect(screen.queryAllByText(/restant à\s+mettre de côté/)).toHaveLength(0);
  });
});
