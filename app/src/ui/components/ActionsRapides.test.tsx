/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ACTIONS_RAPIDES, ActionsRapides } from './ActionsRapides';
import { resoudreRoute } from '../navigation';

afterEach(cleanup);

/**
 * LE SECOND GESTE QU'ON SUPPRIME.
 *
 * Émettre une facture depuis le Pilote demandait deux gestes : ouvrir
 * Facturer, puis y trouver « Nouvelle facture ». Idem pour une dépense. Sur
 * l'écran qui s'ouvre en premier, les deux actions les plus fréquentes de la
 * semaine étaient à deux niveaux de profondeur.
 */
describe('actions rapides', () => {
  it('met les gestes fréquents sur l’écran d’accueil', () => {
    render(<ActionsRapides />);
    expect(screen.getByRole('link', { name: /Nouvelle facture/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ajouter une dépense/ })).toBeTruthy();
  });

  /**
   * LE TEST QUI COMPTE.
   *
   * Une action rapide vers un écran inexistant retomberait silencieusement sur
   * le Pilote — l'utilisateur cliquerait « Nouvelle facture » et resterait sur
   * place, sans message. Chaque destination est donc résolue par le routeur
   * lui-même, pas comparée à une liste écrite deux fois.
   */
  it('ne mène jamais nulle part', () => {
    for (const action of ACTIONS_RAPIDES) {
      const route = resoudreRoute(action.href);
      // Aucune action ne pointe le Pilote : elles en partent toutes.
      expect(route.ecran.id).not.toBe('pilote');
    }
  });

  // Les sous-routes sont ce qui fait qu'une action ouvre la saisie au lieu de
  // déposer sur un écran où il faut encore chercher le bouton.
  it('ouvre la saisie plutôt que l’écran, là où c’est une saisie', () => {
    const facture = ACTIONS_RAPIDES.find((a) => a.libelle === 'Nouvelle facture');
    expect(resoudreRoute(facture?.href ?? '').sousRoute).toBe('nouvelle');

    const depense = ACTIONS_RAPIDES.find((a) => a.libelle === 'Ajouter une dépense');
    expect(resoudreRoute(depense?.href ?? '').sousRoute).toBe('depense');
  });

  // Des liens, pas des boutons : une action fréquente mérite une adresse
  // qu'on peut copier, mettre en favori, ouvrir dans un onglet.
  it('emploie des liens, pas des boutons', () => {
    render(<ActionsRapides />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(ACTIONS_RAPIDES.length);
  });

  it('se nomme, pour ne pas être une rangée de liens anonymes', () => {
    render(<ActionsRapides />);
    expect(screen.getByRole('navigation', { name: 'Actions rapides' })).toBeTruthy();
  });
});
