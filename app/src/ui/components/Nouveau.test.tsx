/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Nouveau } from './Nouveau';

afterEach(() => { cleanup(); });

/**
 * CHAQUE ENTRÉE OUVRE LA SAISIE, PAS L'ÉCRAN.
 *
 * « Nouvelle facture » qui déposerait sur la liste obligerait à chercher le
 * bouton une seconde fois — le reproche fait à l'ancienne version.
 */
describe('« + Nouveau »', () => {
  it('ouvre un menu dont chaque entrée vise la saisie', async () => {
    render(<Nouveau />);
    await userEvent.click(screen.getByRole('button', { name: /Nouveau/ }));
    const menu = screen.getByRole('menu', { name: 'Créer' });
    const cible = (nom: string) => within(menu).getByRole('menuitem', { name: nom }).getAttribute('href');
    expect(cible('Facture')).toBe('#/facture/nouvelle');
    expect(cible('Dépense')).toBe('#/achats/depense');
    expect(cible('Encaissement')).toBe('#/pilote/encaissements');
    expect(cible('Mission')).toBe('#/activite/nouvelle-mission');
    expect(cible('Congés')).toBe('#/activite/conges');
  });

  it('se referme sur Échap et rend le focus au bouton', async () => {
    render(<Nouveau />);
    const bouton = screen.getByRole('button', { name: /Nouveau/ });
    await userEvent.click(bouton);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(bouton);
  });
});
