/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Composition } from './Composition';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
});

function poser(m: Partial<Faits>, cle: Parameters<typeof Composition>[0]['cle']): void {
  const faits = { ...faitsVides(), ...m } as Faits;
  useFaits.setState({ faits });
  render(<Composition cle={cle} onFermer={() => {}} />);
}

/** Le panneau entier, pour ne pas confondre ses montants avec ceux de l'écran. */
const panneau = () => within(screen.getByRole('dialog'));

/** Une facture encaissée : le seul fait qui fasse monter le solde. */
const recette = (montant: number, encaisseeLe: string): Faits['recettes'][number] => ({
  id: `r-${encaisseeLe}`,
  clientNom: 'Client de démonstration',
  libelle: 'prestation',
  montant: euros(montant),
  emiseLe: dateISO('2026-01-10'),
  encaisseeLe: dateISO(encaisseeLe),
  modeReglement: 'virement',
  numero: 'F-001',
  tvaCollectee: euros(0)
});

/**
 * UNE COMPOSITION QUI NE DIT PAS SA FORMULE NE SERT À RIEN.
 *
 * C'est elle qu'on vient chercher : la colonne de chiffres ne s'interprète pas
 * sans la règle qui la produit.
 */
describe('le panneau dit la formule avant les montants', () => {
  it('écrit la formule du solde en toutes lettres', () => {
    poser({ soldeInitial: euros(1_000), soldeInitialAu: dateISO('2025-12-31') }, 'solde');
    expect(panneau().getByText(/solde de départ \+ encaissements/i)).toBeTruthy();
  });

  it('écrit la formule du disponible', () => {
    poser({}, 'disponible');
    expect(panneau().getByText(/solde du compte − à garder de côté/i)).toBeTruthy();
  });

  it('écrit la formule du versable, borne comprise', () => {
    poser({}, 'versable');
    expect(panneau().getByText(/jamais négatif/i)).toBeTruthy();
  });
});

/**
 * LE TOTAL DU PANNEAU EST CELUI DE LA TUILE.
 *
 * Une composition qui afficherait un autre nombre que celui qu'elle explique
 * donnerait une raison de plus de ne pas croire l'écran — exactement ce que ce
 * lot cherche à réparer.
 */
describe('la colonne se lit et retombe juste', () => {
  it('détaille le solde terme à terme', () => {
    poser({
      soldeInitial: euros(1_000),
      soldeInitialAu: dateISO('2025-12-31'),
      recettes: [recette(4_000, '2026-01-15')]
    }, 'solde');

    const p = panneau();
    expect(p.getByText('Solde de départ')).toBeTruthy();
    expect(p.getByText('Encaissements')).toBeTruthy();
    expect(p.getByText('1 encaissement')).toBeTruthy();
    // 1 000 + 4 000, et le total du panneau porte le nom du chiffre expliqué.
    expect(p.getByText('5 000 €')).toBeTruthy();
  });

  /**
   * L'ÉCART NE S'AFFICHE PAS QUAND IL N'Y EN A PAS.
   *
   * Un bandeau rouge permanent, même vide de sens, apprend à ne plus le
   * regarder — et c'est justement celui-là qu'il faudra voir le jour où un
   * terme manquera.
   */
  it('ne crie pas à l’incohérence sur une colonne juste', () => {
    poser({ soldeInitial: euros(1_000), soldeInitialAu: dateISO('2025-12-31') }, 'solde');
    expect(panneau().queryByText(/ne tombe pas juste/i)).toBeNull();
  });
});

/**
 * CE QUE LE PANNEAU AVOUE.
 *
 * La réserve la plus importante est celle du solde sans date : c'est l'état de
 * tout compte repris de l'ancienne application, et c'est ce qui produisait
 * « je ne comprends pas les données ».
 */
describe('le panneau dit ce que le chiffre tait', () => {
  it('explique pourquoi un solde sans date ne suit pas les saisies', () => {
    poser({
      soldeInitial: euros(40),
      soldeInitialAu: null,
      recettes: [recette(4_000, '2026-01-15')]
    }, 'solde');

    expect(panneau().getByText(/Config › Solde du compte/)).toBeTruthy();
  });

  it('explique un versable ramené à zéro par le seuil de sécurité', () => {
    poser({ soldeInitial: euros(800), soldeInitialAu: dateISO('2025-12-31'), reserve: euros(2_000) }, 'versable');
    expect(panneau().getByText(/inférieur à ton seuil de sécurité/)).toBeTruthy();
  });
});

/** La feuille se referme, et rend la main à qui l'a ouverte. */
describe('le panneau se referme', () => {
  it('appelle onFermer au clic sur la croix', async () => {
    const utilisateur = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fermer = vi.fn();
    useFaits.setState({ faits: faitsVides() });
    render(<Composition cle="disponible" onFermer={fermer} />);

    await utilisateur.click(screen.getByLabelText('Fermer le panneau'));
    expect(fermer).toHaveBeenCalledTimes(1);
  });
});
