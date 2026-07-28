/**
 * @vitest-environment jsdom
 *
 * Ces tests portent sur l'accessibilité du panneau, et l'accessibilité ne se
 * vérifie pas en lisant le code : il faut un DOM, un focus réel et de vraies
 * frappes clavier. Le reste du projet se teste sans DOM, ce qui garantit que
 * domaine et état n'en dépendent pas.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Sheet } from './Sheet';

afterEach(cleanup);

function Hote({ contenu }: { contenu?: React.ReactNode } = {}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)}>Ouvrir</button>
      <button type="button">Derrière</button>
      <Sheet ouvert={ouvert} titre="Détail" onFermer={() => setOuvert(false)}>
        {contenu ?? (
          <>
            <button type="button">Premier</button>
            <button type="button">Second</button>
          </>
        )}
      </Sheet>
    </>
  );
}

describe('sémantique de dialogue', () => {
  it('n\'est pas rendu quand il est fermé', () => {
    render(<Hote />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // Le prototype ne portait ni role, ni aria-modal : un lecteur d'écran
  // continuait d'annoncer la page derrière le voile.
  it('expose un dialogue modal nommé par son titre', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    await u.click(screen.getByRole('button', { name: 'Ouvrir' }));

    const dialogue = screen.getByRole('dialog');
    expect(dialogue.getAttribute('aria-modal')).toBe('true');
    // Le nom accessible vient du titre, par aria-labelledby : on vérifie le
    // lien réel plutôt que de faire confiance à un attribut isolé.
    const idTitre = dialogue.getAttribute('aria-labelledby');
    expect(idTitre).toBeTruthy();
    expect(document.getElementById(idTitre as string)?.textContent).toBe('Détail');
  });

  it('le bouton de fermeture porte un nom accessible', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    await u.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(screen.getByRole('button', { name: 'Fermer le panneau' })).toBeTruthy();
  });
});

describe('focus', () => {
  // Le focus se pose sur le premier élément focusable, qui est le bouton de
  // fermeture puisqu'il vit dans l'en-tête. C'est le comportement voulu : quoi
  // que contienne le panneau, l'utilisateur au clavier a immédiatement sous la
  // main le moyen d'en sortir.
  it('entre dans le panneau à l\'ouverture', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    await u.click(screen.getByRole('button', { name: 'Ouvrir' }));

    const dialogue = screen.getByRole('dialog');
    expect(dialogue.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fermer le panneau' }));
  });

  it('entre dans le panneau même sans contenu interactif', async () => {
    const u = userEvent.setup();
    render(<Hote contenu={<p>Texte seul</p>} />);
    await u.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  // Le défaut le plus concret du prototype : la tabulation sortait du panneau
  // et parcourait la page derrière le voile, si bien qu'on activait des
  // contrôles invisibles.
  it('reste piégé dans le panneau en tabulation avant', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    await u.click(screen.getByRole('button', { name: 'Ouvrir' }));

    const premier = screen.getByRole('button', { name: 'Premier' });
    const second = screen.getByRole('button', { name: 'Second' });
    const fermer = screen.getByRole('button', { name: 'Fermer le panneau' });

    await u.tab();
    await u.tab();
    // Après le dernier élément du panneau, le focus revient au premier — il ne
    // passe jamais sur « Derrière ».
    await u.tab();
    expect([premier, second, fermer]).toContain(document.activeElement);
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Derrière' }));
  });

  it('reste piégé en tabulation arrière', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    await u.click(screen.getByRole('button', { name: 'Ouvrir' }));

    await u.tab({ shift: true });
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Derrière' }));
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  // Sans restitution, refermer renvoie le focus au début du document et
  // l'utilisateur au clavier perd sa place.
  it('rend le focus à ce qui l\'a ouvert', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    const ouvrir = screen.getByRole('button', { name: 'Ouvrir' });
    await u.click(ouvrir);
    await u.click(screen.getByRole('button', { name: 'Fermer le panneau' }));
    expect(document.activeElement).toBe(ouvrir);
  });
});

describe('fermeture', () => {
  it('se ferme avec la touche Échap', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    await u.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('se ferme au clic sur le voile', async () => {
    const u = userEvent.setup();
    const { container } = render(<Hote />);
    await u.click(screen.getByRole('button', { name: 'Ouvrir' }));

    const voile = container.querySelector('[aria-hidden="true"]');
    expect(voile).not.toBeNull();
    await u.click(voile as Element);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('appelle onFermer plutôt que de se fermer lui-même', async () => {
    const u = userEvent.setup();
    const onFermer = vi.fn();
    render(<Sheet ouvert titre="T" onFermer={onFermer}><button type="button">X</button></Sheet>);
    await u.keyboard('{Escape}');
    expect(onFermer).toHaveBeenCalledTimes(1);
  });
});

describe('défilement de la page', () => {
  // En portrait, sans ce verrou, le contenu derrière le voile bouge sous le
  // doigt quand on fait défiler le panneau.
  it('verrouille le défilement pendant l\'ouverture et le rétablit après', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    expect(document.body.style.overflow).not.toBe('hidden');

    await u.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(document.body.style.overflow).toBe('hidden');

    await u.keyboard('{Escape}');
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
