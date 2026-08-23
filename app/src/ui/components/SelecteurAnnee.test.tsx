/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelecteurAnnee } from './SelecteurAnnee';

afterEach(cleanup);

describe('sélecteur d’année de la barre du haut', () => {
  it('propose toutes les années reçues, dans l’ordre', () => {
    render(<SelecteurAnnee annees={[2023, 2024, 2025]} valeur={2024} onChange={() => {}} />);
    const choix = screen.getByRole('combobox', { name: 'Année' });
    expect([...choix.querySelectorAll('option')].map((o) => o.textContent)).toEqual(
      ['2023', '2024', '2025']
    );
    expect((choix as HTMLSelectElement).value).toBe('2024');
  });

  /**
   * Le changement doit rendre un NOMBRE, pas la chaîne brute du `<select>` :
   * un appelant qui comparerait `annee === 2025` à la chaîne `'2025'`
   * échouerait silencieusement, et c'est exactement ce qui alimente
   * `etatArgent`.
   */
  it('rend un nombre à chaque choix, pas le texte de l’option', async () => {
    const onChange = vi.fn();
    render(<SelecteurAnnee annees={[2025, 2026]} valeur={2026} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Année' }), '2025');
    expect(onChange).toHaveBeenCalledWith(2025);
  });

  /**
   * Un dossier neuf n'a que l'année courante à proposer : un menu à une seule
   * entrée n'offre rien à choisir, et l'afficher quand même occuperait la
   * barre du haut pour un contrôle qui ne fait jamais rien.
   */
  it('ne s’affiche pas quand une seule année est proposable', () => {
    render(<SelecteurAnnee annees={[2026]} valeur={2026} onChange={() => {}} />);
    expect(screen.queryByRole('combobox', { name: 'Année' })).toBeNull();
  });
});
