/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Echeance } from '../../domain/calculs/provisions';
import { type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { CarteCfe } from './CarteCfe';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

const MAINTENANT = new Date('2026-10-05T09:00:00Z');

function semer(debutActivite: string, reste: Partial<Faits> = {}): void {
  const base = faitsVides();
  useFaits.setState({
    faits: {
      ...base,
      entreprise: { ...base.entreprise, debutActivite: dateISO(debutActivite) },
      ...reste
    }
  });
}

const recette = (montant: number, encaisseeLe: string): Recette => ({
  id: 'r1', clientNom: 'Client', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO(encaisseeLe), encaisseeLe: dateISO(encaisseeLe),
  modeReglement: 'virement', numero: '2024-001'
});

const echeanceCfe: Echeance = {
  id: 'cfe-2026', nature: 'cfe', montant: euros(410),
  echeanceLe: dateISO('2026-12-15'), payeeLe: null, montantPaye: null
};

const rendre = () => render(<CarteCfe maintenant={MAINTENANT} />);

/**
 * CE QUE CETTE CARTE REFUSE DE FAIRE.
 *
 * L'ancienne application affichait un montant de CFE tiré d'une grille en dur
 * que l'audit comptable a jugée non conforme — et un montant plat de 410 €
 * dans l'échéancier, sans rapport avec ce que ce même simulateur calculait.
 * Deux vérités pour la même dette.
 *
 * La base minimum est fixée par la commune, le taux voté par elle : aucune
 * règle nationale ne permet de calculer une CFE. La carte demande donc l'avis
 * plutôt que d'estimer.
 */
describe('carte CFE', () => {
  it('ne propose aucun montant tant que l’avis n’est pas recopié', () => {
    semer('2020-01-01', { recettes: [recette(40000, '2024-05-01')] });
    rendre();
    expect(screen.getByText(/Recopie les deux valeurs de ton avis/)).toBeTruthy();
    expect(screen.queryByText(/Cotisation\s*:/)).toBeNull();
  });

  it('calcule dès que la base et le taux sont donnés', async () => {
    semer('2020-01-01', { recettes: [recette(40000, '2024-05-01')] });
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.type(screen.getByLabelText('Base minimum de ton avis'), '600');
    await utilisateur.type(screen.getByLabelText('Taux communal (%)'), '26,5');

    // 600 × 26,5 % = 159 €.
    expect(screen.getByText(/159/)).toBeTruthy();
  });
});

describe('régime annoncé', () => {
  it('annonce l’exonération l’année de la création, et la 1447-C avec', () => {
    semer('2026-03-01');
    rendre();
    expect(screen.getByText(/exonéré de CFE pour 2026/)).toBeTruthy();
    expect(screen.getByText(/1447-C/)).toBeTruthy();
  });

  // Exonéré : demander une base et un taux n'aurait aucun sens.
  it('ne demande rien quand rien n’est dû', () => {
    semer('2026-03-01');
    rendre();
    expect(screen.queryByLabelText('Base minimum de ton avis')).toBeNull();
  });

  /**
   * Réduite n'est pas nulle. C'est la confusion que la phrase doit lever :
   * il y a bien une CFE la première année d'imposition.
   */
  it('dit que la base réduite de moitié reste une CFE due', () => {
    semer('2025-06-01');
    rendre();
    expect(screen.getByText(/réduite de moitié/)).toBeTruthy();
    expect(screen.getByLabelText('Base minimum de ton avis')).toBeTruthy();
  });

  it('applique la réduction de moitié au calcul', async () => {
    semer('2025-06-01');
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.type(screen.getByLabelText('Base minimum de ton avis'), '600');
    await utilisateur.type(screen.getByLabelText('Taux communal (%)'), '26,5');

    // 300 × 26,5 % = 80 €, et non 159.
    expect(screen.getByText(/80/)).toBeTruthy();
  });

  it('annonce la dispense sous le seuil, en disant que c’est un seuil', () => {
    semer('2020-01-01', { recettes: [recette(4000, '2024-05-01')] });
    rendre();
    expect(screen.getByText(/n’est pas due/)).toBeTruthy();
    expect(screen.getByText(/pas un abattement/)).toBeTruthy();
  });
});

/**
 * LE POINT QUI FAIT LA DIFFÉRENCE ENTRE UN SIMULATEUR ET UN OUTIL.
 *
 * Un montant calculé ne pèse sur le disponible que porté en échéance. Sans ce
 * pont, la carte donnerait un chiffre juste et le versable resterait faux.
 */
describe('le lien avec les provisions', () => {
  it('dit que rien n’est provisionné tant que l’échéance n’est pas saisie', () => {
    semer('2020-01-01', { recettes: [recette(40000, '2024-05-01')] });
    rendre();
    expect(screen.getByRole('link', { name: 'Saisir l’échéance' })).toBeTruthy();
  });

  it('constate que c’est fait quand l’échéance existe', () => {
    semer('2020-01-01', {
      recettes: [recette(40000, '2024-05-01')], echeances: [echeanceCfe]
    });
    rendre();
    expect(screen.getByText(/déjà comptée dans tes provisions/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Saisir l’échéance' })).toBeNull();
  });
});

// L'avis ne paraît qu'en novembre : sans le calendrier, on ne sait pas qu'il
// faut l'attendre, ni jusqu'à quand.
it('donne le calendrier, qui est la moitié de l’information', () => {
  semer('2020-01-01', { recettes: [recette(40000, '2024-05-01')] });
  rendre();
  // Un seul nœud porte les trois dates : l'avis, le paiement et l'acompte.
  const calendrier = screen.getByText(/Avis en novembre/);
  expect(calendrier.textContent).toMatch(/15.décembre/);
  expect(calendrier.textContent).toMatch(/15.juin/);
});

/**
 * LE MODE CONFIDENTIALITÉ, ET CE QU'IL COUVRE ICI.
 *
 * Le vérificateur de confidentialité a signalé cette carte dès son premier
 * passage : deux montants y restaient lisibles écran partagé. L'un est
 * statutaire, l'autre non — et c'est le second qui compte.
 *
 * « Vos recettes de 2024 ne dépassent pas 5 000 € » est une information sur
 * l'utilisateur. Flouter le seul nombre n'aurait rien couvert : « vos recettes
 * ne dépassent pas ▓▓▓ » dit encore qu'elles sont sous le seuil.
 */
describe('confidentialité', () => {
  it('masque la phrase entière quand elle révèle le niveau de recettes', () => {
    semer('2020-01-01', { recettes: [recette(4000, '2024-05-01')] });
    rendre();
    const phrase = screen.getByText(/n’est pas due/);
    expect(phrase.hasAttribute('data-montant')).toBe(true);
  });

  // Les autres régimes ne disent rien du niveau de recettes : les flouter
  // masquerait une règle, pas une information.
  it('ne masque pas un régime qui ne révèle aucun montant', () => {
    semer('2020-01-01', { recettes: [recette(40000, '2024-05-01')] });
    rendre();
    const phrase = screen.getByText(/droit commun/);
    expect(phrase.hasAttribute('data-montant')).toBe(false);
  });

  /**
   * Le seuil de l'acompte est public. Il porte quand même la marque : ouvrir
   * une exception pour « celui-là ne vous concerne pas » rendrait la promesse
   * négociable, et la prochaine exception serait plus dure à refuser.
   */
  it('marque même un seuil statutaire', () => {
    semer('2020-01-01', { recettes: [recette(40000, '2024-05-01')] });
    rendre();
    const calendrier = screen.getByText(/Avis en novembre/);
    expect(calendrier.querySelector('[data-montant]')).toBeTruthy();
  });
});
