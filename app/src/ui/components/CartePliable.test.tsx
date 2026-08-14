/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CartePliable } from './CartePliable';

afterEach(cleanup);
beforeEach(() => { localStorage.clear(); });

const rendre = (props: Partial<Parameters<typeof CartePliable>[0]> = {}) => render(
  <CartePliable
    id="achats"
    ecran="achats"
    titre="Registre des achats"
    resume="12 achats · 3 480 € TTC · 2 pièces manquantes"
    {...props}
  >
    <p>Le détail des achats.</p>
  </CartePliable>
);

/**
 * LE MÉCANISME QUE LE HANDOFF DEMANDAIT EXPLICITEMENT DE GARDER.
 *
 * `freel-fold.js` était l'un des rares utilitaires que la spec de design
 * qualifiait de « transversal, à conserver ». Il n'avait pas été repris.
 *
 * Sa règle tient en une phrase, et c'est elle qui le distingue d'un accordéon :
 * **repliée, la carte affiche son en-tête PLUS sa synthèse**. Replier ne fait
 * jamais perdre l'information, elle se condense.
 */
describe('carte pliable', () => {
  it('montre son contenu par défaut', () => {
    rendre();
    expect(screen.getByText('Le détail des achats.')).toBeTruthy();
  });

  it('se replie et se déplie du même geste', async () => {
    rendre();
    const utilisateur = userEvent.setup();
    const bascule = screen.getByRole('button', { name: /Registre des achats/ });

    await utilisateur.click(bascule);
    expect(bascule.getAttribute('aria-expanded')).toBe('false');

    await utilisateur.click(bascule);
    expect(bascule.getAttribute('aria-expanded')).toBe('true');
  });

  /**
   * LE TEST QUI COMPTE. Un accordéon ordinaire remplace le contenu par rien, et
   * l'utilisateur doit déplier pour savoir s'il a besoin de déplier. Ici la
   * carte repliée dit encore l'essentiel.
   */
  it('dit encore l’essentiel une fois repliée', async () => {
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: /Registre des achats/ }));

    expect(screen.getByText('12 achats · 3 480 € TTC · 2 pièces manquantes')).toBeTruthy();
  });

  // Dépliée, la synthèse répéterait en moins précis ce que le contenu dit déjà.
  it('n’affiche pas la synthèse quand la carte est ouverte', () => {
    rendre();
    expect(screen.queryByText(/12 achats/)).toBeNull();
  });
});

/**
 * L'ÉTAT DU PLI EST UNE PRÉFÉRENCE D'AFFICHAGE, PAS UN FAIT COMPTABLE.
 *
 * Il vit dans `localStorage`, par écran. Il ne va ni dans le magasin, ni dans
 * la sauvegarde, ni au compte distant : une préférence qui voyagerait avec les
 * données comptables serait une confusion de nature.
 */
describe('conservation du pli', () => {
  it('retrouve son état au remontage', async () => {
    const { unmount } = rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: /Registre des achats/ }));
    unmount();

    rendre();
    expect(screen.getByRole('button', { name: /Registre des achats/ })
      .getAttribute('aria-expanded')).toBe('false');
  });

  /**
   * L'identité d'une carte est son `id`, pas son titre : renommer un intitulé
   * ne doit pas rouvrir toutes les cartes de quelqu'un.
   */
  it('survit à un changement d’intitulé', async () => {
    const { unmount } = rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: /Registre des achats/ }));
    unmount();

    rendre({ titre: 'Vos achats' });
    expect(screen.getByRole('button', { name: /Vos achats/ })
      .getAttribute('aria-expanded')).toBe('false');
  });

  // Deux écrans peuvent avoir une carte de même nom sans partager son pli.
  it('sépare les écrans', async () => {
    const { unmount } = rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: /Registre des achats/ }));
    unmount();

    rendre({ ecran: 'argent' });
    expect(screen.getByRole('button', { name: /Registre des achats/ })
      .getAttribute('aria-expanded')).toBe('true');
  });

  /**
   * En navigation privée, `localStorage` lève à l'accès. Une carte qui
   * refuserait de s'afficher parce qu'on n'a pas pu lire une PRÉFÉRENCE
   * D'AFFICHAGE serait une panne pour un confort.
   */
  it('s’affiche même quand le stockage est inaccessible', () => {
    const vrai = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('stockage bloqué'); }
    });
    try {
      rendre();
      expect(screen.getByText('Le détail des achats.')).toBeTruthy();
    } finally {
      if (vrai) Object.defineProperty(window, 'localStorage', vrai);
    }
  });
});

/**
 * Les commandes de l'en-tête vivent HORS du bouton de pli — plutôt que
 * d'intercepter leur clic, ce qui est fragile et invisible au clavier. Une zone
 * cliquable qui en contient d'autres est un piège pour la souris comme pour les
 * lecteurs d'écran.
 */
describe('commandes de l’en-tête', () => {
  it('ne plie pas la carte quand on les actionne', async () => {
    let appuye = false;
    render(
      <CartePliable
        id="c" ecran="e" titre="Titre" resume="résumé"
        actions={<button type="button" onClick={() => { appuye = true; }}>Ajouter</button>}
      >
        <p>Contenu</p>
      </CartePliable>
    );

    await userEvent.setup().click(screen.getByRole('button', { name: 'Ajouter' }));

    expect(appuye).toBe(true);
    expect(screen.getByRole('button', { name: /Titre/ }).getAttribute('aria-expanded'))
      .toBe('true');
  });
});
