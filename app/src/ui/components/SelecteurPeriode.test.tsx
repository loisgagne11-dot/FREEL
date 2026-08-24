/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { dateISO, euros } from '../../domain/types';
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
function surLEcran(chemin: string, multiAnnee = true): void {
  window.location.hash = chemin;
  useFaits.setState({
    faits: {
      ...faitsVides(),
      recettes: multiAnnee ? [recette('a', 2025), recette('b', 2026)] : []
    } as Faits
  });
  render(<SelecteurPeriode etat={[2026, () => {}]} />);
}

const visible = () => screen.queryByLabelText('Année') !== null;

/**
 * CE QUE CE LOT CORRIGE.
 *
 * Le sélecteur ne s'affichait que sur Argent : on le tournait ailleurs et rien
 * ne bougeait, parce qu'il n'y était même pas. Il commande désormais l'ancre de
 * période des cinq écrans qui en ont une.
 */
describe('le sélecteur d’année s’affiche là où il a quelque chose à ancrer', () => {
  it.each([
    ['#/activite', 'quelle année de mois on parcourt'],
    ['#/argent', 'le chiffre d’affaires, les seuils, les provisions'],
    ['#/facture', 'l’ancre de la barre de période'],
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
    ['#/pilote', 'le poste de pilotage d’aujourd’hui'],
    ['#/config', 'des réglages, aucune période']
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
