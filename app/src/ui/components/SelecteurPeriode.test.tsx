/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type Mois, dateISO, euros, mois } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { SelecteurPeriode } from './SelecteurPeriode';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
});

/** Une facture par année, pour que le sélecteur ait plus d'un choix à offrir. */
const recette = (id: string, annee: number): Faits['recettes'][number] => ({
  id,
  clientNom: 'Client de démonstration',
  libelle: 'prestation',
  montant: euros(1_000),
  emiseLe: dateISO(`${annee}-03-10`),
  encaisseeLe: dateISO(`${annee}-04-10`),
  modeReglement: 'virement',
  numero: `F-${id}`,
  tvaCollectee: euros(0)
});

/**
 * Monte le sélecteur sur un écran donné.
 *
 * La route se lit dans le hash : c'est `useRoute` qui la résout, et le poser
 * avant le rendu est la seule façon d'obtenir l'écran voulu sans simuler la
 * navigation entière.
 */
function surLEcran(
  chemin: string, multiAnnee = true, choisi: Mois = mois('2026-06'), onMois: (m: Mois) => void = () => {}
): void {
  window.location.hash = chemin;
  useFaits.setState({
    faits: {
      ...faitsVides(),
      recettes: multiAnnee ? [recette('a', 2025), recette('b', 2026)] : []
    } as Faits
  });
  render(<SelecteurPeriode etat={[choisi, onMois]} />);
}

const visible = () => screen.queryByLabelText('Année') !== null;

/**
 * CE QUE CE LOT CORRIGE.
 *
 * Le sélecteur ne s'affichait que sur Argent : on le tournait ailleurs et rien
 * ne bougeait, parce qu'il n'y était même pas. Il commande désormais l'ancre de
 * période des quatre écrans qui en ont une.
 */
describe('le sélecteur d’année s’affiche là où il a quelque chose à ancrer', () => {
  it.each([
    ['#/pilote', 'le flux du mois suit le mois choisi'],
    ['#/activite', 'quelle année de mois on parcourt'],
    ['#/argent', 'le chiffre d’affaires, les seuils, les provisions'],
    ['#/achats', 'l’ancre de la barre de période'],
    ['#/outils', 'le barème du simulateur d’impôt']
  ])('s’affiche sur %s — %s', (chemin) => {
    surLEcran(chemin);
    expect(visible()).toBe(true);
  });

  /**
   * DEUX ÉCRANS NE L'ONT PAS, ET C'EST VOULU.
   *
   * Pilote est le poste de pilotage d'AUJOURD'HUI : « combien je peux me
   * verser » n'a pas d'année, et le rendre actif ferait lire un montant qu'on
   * ne peut pas se verser puisque l'année est passée. Config ne porte que des
   * réglages.
   *
   * Un sélecteur affiché mais sans effet serait pire que les deux : on le
   * tournerait, rien ne bougerait, et on cesserait de s'en servir sur les cinq
   * écrans où il marche.
   */
  it.each([
    ['#/config', 'des réglages, aucune période'],
    // La liste des factures est un onglet d'Activité ; rédiger ou rouvrir une
    // facture n'a pas de période.
    ['#/facture/nouvelle', 'la rédaction d’une facture']
  ])('reste absent de %s — %s', (chemin) => {
    surLEcran(chemin);
    expect(visible()).toBe(false);
  });

  /**
   * UN SEUL CHOIX N'EST PAS UN CHOIX.
   *
   * Un dossier neuf n'a que l'année courante à proposer. Le menu se masque
   * alors partout, y compris sur les cinq écrans ci-dessus — c'est la règle de
   * `SelecteurAnnee`, et elle prime.
   */
  it('se masque sur un dossier qui n’a qu’une année', () => {
    surLEcran('#/argent', false);
    expect(visible()).toBe(false);
  });
});

/**
 * LE MOIS DE TOUTE L'APPLICATION, EN TÊTE DE BARRE.
 *
 * Le handoff met « ‹ juin 2026 › » au-dessus de tous les écrans. L'année
 * reste à côté pour sauter d'un exercice à l'autre, mais elle ne tient plus
 * d'état à elle : elle déplace le mois.
 */
describe('le navigateur de mois', () => {
  it('avance et recule d’un mois, en traversant les années', () => {
    const onMois = vi.fn();
    surLEcran('#/pilote', true, mois('2026-01'), onMois);
    fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }));
    expect(onMois).toHaveBeenLastCalledWith('2025-12');
    fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }));
    expect(onMois).toHaveBeenLastCalledWith('2026-02');
  });

  it('garde le mois quand on change d’année, et n’en change que le millésime', () => {
    const onMois = vi.fn();
    surLEcran('#/argent', true, mois('2026-03'), onMois);
    fireEvent.change(screen.getByLabelText('Année'), { target: { value: '2025' } });
    expect(onMois).toHaveBeenLastCalledWith('2025-03');
  });

  it('n’offre « Aujourd’hui » que loin du mois courant', () => {
    surLEcran('#/pilote', true, mois('2026-06'));
    expect(screen.queryByRole('button', { name: 'Aujourd’hui' })).toBeNull();
    cleanup();

    const onMois = vi.fn();
    surLEcran('#/pilote', true, mois('2026-02'), onMois);
    fireEvent.click(screen.getByRole('button', { name: 'Aujourd’hui' }));
    expect(onMois).toHaveBeenLastCalledWith('2026-06');
  });
});
