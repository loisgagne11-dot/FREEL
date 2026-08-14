/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { dateISO } from '../../domain/types';
import type { PlanningSemaine } from '../../state/selecteurs.activite';
import { VueSemaine } from './VueSemaine';

afterEach(cleanup);

const jour = (
  date: string,
  o: Partial<{ ferie: boolean; weekEnd: boolean; conge: number }> = {}
) => ({
  date: dateISO(date),
  ferie: false, weekEnd: false, conge: 0,
  prevu: 0, retenu: 0, parMission: [],
  ...o
});

/** Une semaine ordinaire : lundi 6 au dimanche 12 juillet 2026. */
function semaine(modifications: Partial<Record<string, ReturnType<typeof jour>>> = {}) {
  const base = [
    jour('2026-07-06'), jour('2026-07-07'), jour('2026-07-08'),
    jour('2026-07-09'), jour('2026-07-10'),
    jour('2026-07-11', { weekEnd: true }), jour('2026-07-12', { weekEnd: true })
  ];
  const jours = base.map((j) => modifications[j.date] ?? j);
  const planning: PlanningSemaine = {
    lundi: dateISO('2026-07-06'), jours, totalPrevu: 0, totalRetenu: 0
  };
  return planning;
}

const rendre = (planning: PlanningSemaine) => render(
  <VueSemaine
    planning={planning}
    aujourdhui={dateISO('2026-07-08')}
    onBasculer={() => { /* testé ailleurs */ }}
    onRevenirAuRythme={() => { /* testé ailleurs */ }}
  />
);

/**
 * LE CHIFFRE QUE LE DOMAINE CALCULE, ET QUE RIEN NE GARDAIT À L'ÉCRAN.
 *
 * `decompterJours` est éprouvé côté domaine, y compris son accord avec le plan
 * de charge du mois. Mais son seul chemin vers l'utilisateur ne l'était pas :
 * supprimer le paragraphe de résumé laissait les 1 150 tests au vert.
 *
 * Un calcul juste qu'aucun écran ne montre ne vaut pas mieux qu'un calcul
 * absent — c'est la leçon que ce projet a déjà payée quatre fois avec les
 * actions du magasin injoignables.
 */
describe('compte des jours ouvrés de la semaine', () => {
  it('affiche les jours ouvrés de la semaine visible', () => {
    rendre(semaine());
    expect(screen.getByText(/5 jours ouvrés/)).toBeTruthy();
  });

  /**
   * Cinq n'est pas toujours la réponse : une semaine avec un férié en compte
   * quatre, et un taux d'occupation lu sans le savoir est faux d'un cinquième.
   */
  it('retire les jours fériés du compte', () => {
    rendre(semaine({ '2026-07-08': jour('2026-07-08', { ferie: true }) }));
    expect(screen.getByText(/4 jours ouvrés/)).toBeTruthy();
  });

  /**
   * LE POINT QUI COMPTE. Les congés restent des jours OUVRÉS — c'est le mois
   * qui les retire, pour son dénominateur d'occupation. Les deux nombres sont
   * justes, et l'écran les dit ensemble plutôt que d'en choisir un.
   */
  it('compte les congés parmi les ouvrés, et les nomme à part', () => {
    rendre(semaine({
      '2026-07-06': jour('2026-07-06', { conge: 1 }),
      '2026-07-07': jour('2026-07-07', { conge: 1 })
    }));
    const resume = screen.getByText(/jours ouvrés/);
    expect(resume.textContent).toMatch(/5 jours ouvrés/);
    expect(resume.textContent).toMatch(/dont 2 de congé/);
  });

  // Sans congé, la précision n'a rien à dire et n'encombre pas la ligne.
  it('ne mentionne les congés que s’il y en a', () => {
    rendre(semaine());
    expect(screen.getByText(/jours ouvrés/).textContent).not.toMatch(/congé/);
  });

  // Une demi-journée occupe le jour : il compte comme jour en congé.
  it('tient une demi-journée pour un jour en congé', () => {
    rendre(semaine({ '2026-07-06': jour('2026-07-06', { conge: 0.5 }) }));
    expect(screen.getByText(/jours ouvrés/).textContent).toMatch(/dont 1 de congé/);
  });
});
