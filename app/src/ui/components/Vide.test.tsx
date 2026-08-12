/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Vide } from './Vide';

afterEach(cleanup);

/**
 * Le vide est le premier écran que voit quelqu'un qui commence, et le seul
 * moment où il ne peut RIEN déduire de ce qu'il a sous les yeux. C'est donc là
 * qu'une indication vaut le plus cher, pas là qu'on peut s'en passer.
 */
describe('état vide', () => {
  it('dit ce qui manque', () => {
    render(<Vide message="Aucune mission enregistrée." />);
    expect(screen.getByText('Aucune mission enregistrée.')).toBeTruthy();
  });

  it('porte l’action qui lève le vide', () => {
    render(
      <Vide
        message="Aucune mission enregistrée."
        action={<button type="button">Ajouter une mission</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Ajouter une mission' })).toBeTruthy();
  });

  /**
   * Toutes les absences n'appellent pas une action : un mois sans prestation
   * intracommunautaire n'a rien à corriger. Fabriquer un bouton pour meubler
   * apprendrait que les boutons des états vides ne mènent nulle part.
   */
  it('n’invente pas d’action quand il n’y en a pas', () => {
    render(<Vide message="Aucune prestation intracommunautaire ce mois-là." />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
