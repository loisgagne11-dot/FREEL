/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationSurPlace } from './ConfirmationSurPlace';
import { Sheet } from './Sheet';

afterEach(cleanup);

function rendre(p: Partial<Parameters<typeof ConfirmationSurPlace>[0]> = {}) {
  const onConfirmer = vi.fn();
  render(
    <ConfirmationSurPlace
      libelle="Supprimer"
      classeDeclencheur={undefined}
      consequence="La ligne et son paiement partent."
      libelleConfirmer="Supprimer la ligne"
      onConfirmer={onConfirmer}
      {...p}
    />
  );
  return { onConfirmer, utilisateur: userEvent.setup() };
}

describe('la confirmation sur place', () => {
  it('n’écrit rien au premier clic, et dit la conséquence', async () => {
    const { onConfirmer, utilisateur } = rendre();
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer' }));

    expect(onConfirmer).not.toHaveBeenCalled();
    // Le groupe est NOMMÉ par la conséquence : le lecteur d'écran la lit en y
    // entrant, sans qu'il faille la chercher.
    expect(screen.getByRole('group', { name: 'La ligne et son paiement partent.' })).toBeTruthy();
  });

  it('écrit à la confirmation', async () => {
    const { onConfirmer, utilisateur } = rendre();
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer la ligne' }));
    expect(onConfirmer).toHaveBeenCalledOnce();
  });

  /**
   * Le bouton disparaît sous la confirmation : sans relais, le focus retombait
   * au début de la page. Il va sur le choix sans conséquence — une frappe
   * d'Entrée de trop ne détruit rien.
   */
  it('pose le focus sur « Garder », et une frappe d’Entrée ne détruit rien', async () => {
    const { onConfirmer, utilisateur } = rendre();
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Garder' }));

    await utilisateur.keyboard('{Enter}');
    expect(onConfirmer).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Supprimer' }));
  });

  // Au montage, le bouton ne vole pas le focus : seul un retour de
  // confirmation le lui rend.
  it('ne prend pas le focus au premier rendu', () => {
    rendre();
    expect(document.activeElement).toBe(document.body);
  });

  it('nomme la ligne dans le bouton, l’espace hors de la portée masquée', () => {
    rendre({ precision: '2026-014, Client' });
    expect(screen.getByRole('button', { name: 'Supprimer — 2026-014, Client' })).toBeTruthy();
  });

  /**
   * Confirmer pour s'entendre dire non : l'appelant qui sait que l'écriture
   * refusera le dit avant d'ouvrir.
   */
  it('n’ouvre pas quand l’appelant refuse', async () => {
    const { utilisateur } = rendre({ peutOuvrir: () => false });
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(screen.queryByRole('group')).toBeNull();
  });

  /**
   * Échap renonce à la confirmation, pas au panneau qui la contient — le
   * panneau écoute le document, et l'aurait refermé avec la saisie.
   */
  it('Échap renonce à la confirmation sans fermer le panneau', async () => {
    const fermer = vi.fn();
    render(
      <Sheet ouvert titre="Corriger" onFermer={fermer}>
        <ConfirmationSurPlace
          libelle="Supprimer"
          classeDeclencheur={undefined}
          consequence="La ligne part."
          libelleConfirmer="Supprimer la ligne"
          onConfirmer={() => { /* rien */ }}
        />
      </Sheet>
    );
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer' }));
    await utilisateur.keyboard('{Escape}');

    expect(screen.queryByRole('group', { name: 'La ligne part.' })).toBeNull();
    expect(fermer).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Supprimer' }));
  });

  // L'écriture a refusé et le composant reste : le bouton revient, avec le
  // focus, plutôt qu'une confirmation qu'on vient de valider.
  it('revient au bouton quand la confirmation n’a rien fait disparaître', async () => {
    const { onConfirmer, utilisateur } = rendre();
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer la ligne' }));
    expect(onConfirmer).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Supprimer' }));
  });
});
