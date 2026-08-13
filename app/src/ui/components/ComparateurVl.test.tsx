/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { ComparateurVl } from './ComparateurVl';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-13T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

const encaissee = (montant: number): Recette => ({
  id: 'r1', clientNom: 'Client', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO('2026-03-01'), encaisseeLe: dateISO('2026-03-15'),
  modeReglement: 'virement', numero: '2026-001'
});

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...modifications } });
}

/**
 * L'option s'exerce avant le 30 septembre pour s'appliquer à l'année suivante.
 * Passée cette date, le choix vaut douze mois — c'est la seule décision du
 * projet qui périme, et l'écran doit le dire sans qu'on ait à chercher.
 */
it('annonce la date limite sans qu’on ait à la chercher', () => {
  render(<ComparateurVl />);
  expect(screen.getByText(/avant le 30 septembre/)).toBeTruthy();
});

describe('point de départ', () => {
  it('préremplit avec le chiffre d’affaires réellement encaissé', () => {
    semer({ recettes: [encaissee(38000)] });
    render(<ComparateurVl />);
    expect(screen.getByLabelText<HTMLInputElement>(/Chiffre d’affaires annuel/).value)
      .toBe('38000');
  });

  // La décision porte sur l'année PROCHAINE : le chiffre réel est un point de
  // départ, pas une contrainte.
  it('laisse ajuster le montant', async () => {
    semer({ recettes: [encaissee(38000)] });
    render(<ComparateurVl />);
    const champ = screen.getByLabelText(/Chiffre d’affaires annuel/);
    await userEvent.setup().clear(champ);
    await userEvent.setup().type(champ, '50000');
    expect(screen.getByLabelText<HTMLInputElement>(/Chiffre d’affaires annuel/).value)
      .toBe('50000');
  });

  it('n’affiche aucun résultat tant que rien n’est saisi', () => {
    semer();
    render(<ComparateurVl />);
    expect(screen.getByText(/Saisissez un chiffre d’affaires/)).toBeTruthy();
  });
});

describe('comparaison', () => {
  /**
   * On croit volontiers que le versement libératoire est « pour les gros
   * revenus ». C'est l'inverse en bas de l'échelle : il se paie dès le premier
   * euro, quand le barème ne réclame encore rien.
   */
  it('désigne le barème sur un petit chiffre d’affaires', async () => {
    semer({ recettes: [encaissee(15000)] });
    render(<ComparateurVl />);
    expect(screen.getByText(/Le barème vous coûterait/)).toBeTruthy();
  });

  it('désigne le versement libératoire sur un chiffre d’affaires moyen', () => {
    semer({ recettes: [encaissee(40000)] });
    render(<ComparateurVl />);
    expect(screen.getByText(/Le versement libératoire vous coûterait/)).toBeTruthy();
  });

  /**
   * LE CHAMP QUI CHANGE TOUT. Comparer sans les autres revenus du foyer
   * reviendrait à calculer l'impôt comme si l'activité était le seul revenu du
   * ménage — et à conclure presque toujours en faveur du barème.
   */
  it('change de verdict quand le foyer a d’autres revenus', async () => {
    semer({ recettes: [encaissee(20000)] });
    render(<ComparateurVl />);
    expect(screen.getByText(/Le barème vous coûterait/)).toBeTruthy();

    const autres = screen.getByLabelText(/Autres revenus imposables/);
    const utilisateur = userEvent.setup();
    await utilisateur.clear(autres);
    await utilisateur.type(autres, '60000');

    expect(screen.getByText(/Le versement libératoire vous coûterait/)).toBeTruthy();
  });
});

/**
 * Cacher les limites ferait passer le résultat pour un verdict. L'éligibilité
 * en particulier n'est PAS vérifiée : le plafond de revenu fiscal de référence
 * est un nombre officiel que l'application ne porte pas, et l'invariant n°1
 * interdit de l'écrire au jugé.
 */
describe('ce que le calcul ne dit pas', () => {
  it('avertit que l’éligibilité n’est pas vérifiée', () => {
    semer({ recettes: [encaissee(40000)] });
    render(<ComparateurVl />);
    expect(screen.getByText(/L’éligibilité n’est pas vérifiée/)).toBeTruthy();
  });

  // Les deux écarts jouent en sens CONTRAIRE : le dire change la lecture d'un
  // résultat serré.
  it('donne le sens de chaque simplification', () => {
    semer({ recettes: [encaissee(40000)] });
    render(<ComparateurVl />);
    const limites = screen.getByText(/Ce que ce calcul ne dit pas/).parentElement as HTMLElement;
    expect(limites.textContent).toMatch(/surestimé/);
    expect(limites.textContent).toMatch(/sous-estimé/);
  });
});
