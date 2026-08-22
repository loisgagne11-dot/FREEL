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

/**
 * UN BOUTON DANS UN BOUTON EST DU HTML INVALIDE — ET LE NAVIGATEUR NE SE
 * CONTENTE PAS DE LE TOLÉRER.
 *
 * À l'analyse, il FERME le bouton extérieur et sort l'intérieur de son
 * conteneur. L'explication « i » échappait ainsi au découpage du titre, se
 * plaçait où sa largeur naturelle la menait, et poussait la page hors de
 * l'écran en portrait — trouvé par le vérificateur responsive sur un titre un
 * peu long, et invisible partout ailleurs.
 *
 * La règle était déjà écrite dans le composant — « les commandes vivent hors
 * du bouton » — mais rien ne l'imposait. Ces tests l'imposent.
 */
describe('l’explication vit hors du bouton de pliage', () => {
  it('rend l’aide à côté du titre, jamais dedans', () => {
    render(
      <CartePliable
        id="t" ecran="test"
        titre="Un titre"
        aide={<button type="button">Pourquoi</button>}
        resume="résumé"
      >
        <p>contenu</p>
      </CartePliable>
    );

    const bascule = screen.getByRole('button', { name: /Un titre/ });
    const aide = screen.getByRole('button', { name: 'Pourquoi' });
    expect(bascule.contains(aide)).toBe(false);
  });

  /** Aucun bouton imbriqué dans l'en-tête, quelle qu'en soit la profondeur. */
  it('ne produit aucun bouton imbriqué', () => {
    const { container } = render(
      <CartePliable
        id="t" ecran="test"
        titre="Un titre très long qui pourrait pousser la page hors de l’écran"
        aide={<button type="button">Pourquoi</button>}
        resume="résumé"
      >
        <p>contenu</p>
      </CartePliable>
    );

    expect(container.querySelectorAll('button button')).toHaveLength(0);
  });

  /** L'aide reste facultative : une carte peut n'avoir rien à expliquer. */
  it('n’exige pas d’aide', () => {
    render(
      <CartePliable id="t" ecran="test" titre="Un titre" resume="résumé">
        <p>contenu</p>
      </CartePliable>
    );
    expect(screen.getByRole('button', { name: /Un titre/ })).toBeTruthy();
  });
});

/**
 * LE CHEVRON EST AU BORD DROIT DE LA CARTE, PAS À GAUCHE DU TITRE.
 *
 * Écart systématique relevé sur les six cartes de l'écran Argent face à la
 * référence. Sans ce test, rien n'empêche de le remettre en tête du bouton à
 * la prochaine retouche — retour silencieux au défaut que ce lot corrige.
 */
describe('le chevron est posé au bord droit du bouton', () => {
  it('place le titre avant le chevron dans le bouton de pliage', () => {
    render(
      <CartePliable id="t" ecran="test" titre="Un titre" resume="résumé">
        <p>contenu</p>
      </CartePliable>
    );

    const bascule = screen.getByRole('button', { name: /Un titre/ });
    const enfants = [...bascule.children];
    const indexTitre = enfants.findIndex((e) => e.textContent === 'Un titre');
    const indexChevron = enfants.findIndex((e) => e.tagName.toLowerCase() === 'svg');
    expect(indexTitre).toBeGreaterThanOrEqual(0);
    expect(indexChevron).toBeGreaterThan(indexTitre);
  });
});
