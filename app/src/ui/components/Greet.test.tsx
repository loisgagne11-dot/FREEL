/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Greet } from './Greet';

afterEach(cleanup);

/**
 * L'en-tête d'écran de la spec de design. Les écrans portaient un `<h1>` nu —
 * or le nom de l'écran figure déjà dans le rail et dans la barre du haut : le
 * répéter une troisième fois n'apprend rien.
 */
describe('en-tête d’écran', () => {
  /**
   * Un seul `h1` par page, en tête du contenu : c'est ce qu'un lecteur
   * d'écran annonce à l'arrivée, et le point de saut du lien d'évitement.
   */
  it('porte le titre en h1', () => {
    render(<Greet titre="Pilote" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pilote' })).toBeTruthy();
  });

  it('affiche la phrase qui situe', () => {
    render(<Greet titre="Pilote" sousTitre="3 décisions vous attendent en août." />);
    expect(screen.getByText('3 décisions vous attendent en août.')).toBeTruthy();
  });

  // Le sous-titre n'est pas un titre : lui donner ce rôle ferait annoncer
  // deux niveaux de plan là où il n'y en a qu'un.
  it('ne fait pas du sous-titre un second titre', () => {
    render(<Greet titre="Pilote" sousTitre="Rien ne demande votre attention." />);
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('affiche le repère chiffré', () => {
    render(<Greet titre="Pilote" repere="Solde compte · 1 200 €" />);
    expect(screen.getByText('Solde compte · 1 200 €')).toBeTruthy();
  });

  /**
   * Repère et commandes ne sont pas de même nature : l'un se lit, les autres
   * doivent être atteignables au clavier et annoncées comme des commandes.
   */
  it('accueille des commandes atteignables', () => {
    render(
      <Greet titre="Activité" actions={<button type="button">Mois suivant</button>} />
    );
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeTruthy();
  });

  it('n’affiche ni repère ni commandes quand il n’y en a pas', () => {
    const { container } = render(<Greet titre="Config" />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
