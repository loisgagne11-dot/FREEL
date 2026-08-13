/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLE_CONFIDENTIALITE, appliquerConfidentialite, lireConfidentialite
} from './confidentialite';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-confidentiel');
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-confidentiel');
});

describe('mode confidentialité', () => {
  it('n’est pas actif par défaut', () => {
    expect(lireConfidentialite()).toBe(false);
    expect(document.documentElement.hasAttribute('data-confidentiel')).toBe(false);
  });

  /**
   * L'attribut vit sur `<html>` et non sur le corps ou un conteneur : la
   * feuille de style globale doit pouvoir l'atteindre depuis la racine, et un
   * nom de classe de module CSS — haché à la compilation — ne le permettrait
   * pas.
   */
  it('pose l’attribut sur la racine du document', () => {
    appliquerConfidentialite(true);
    expect(document.documentElement.getAttribute('data-confidentiel')).toBe('oui');
  });

  it('retire l’attribut plutôt que de le mettre à « non »', () => {
    appliquerConfidentialite(true);
    appliquerConfidentialite(false);
    // Un attribut à « non » obligerait chaque règle CSS à tester sa valeur ;
    // son absence est plus simple et ne peut pas être mal orthographiée.
    expect(document.documentElement.hasAttribute('data-confidentiel')).toBe(false);
  });

  it('conserve le choix pour la prochaine visite', () => {
    appliquerConfidentialite(true);
    expect(localStorage.getItem(CLE_CONFIDENTIALITE)).toBe('oui');
    expect(lireConfidentialite()).toBe(true);
  });

  it('efface la trace quand on désactive', () => {
    appliquerConfidentialite(true);
    appliquerConfidentialite(false);
    expect(localStorage.getItem(CLE_CONFIDENTIALITE)).toBeNull();
    expect(lireConfidentialite()).toBe(false);
  });

  /**
   * La clé est lue par le script inline de `index.html`, AVANT que React
   * n'existe : sans cela les montants s'afficheraient en clair le temps d'un
   * rendu, ce qui suffit à trahir la promesse quand on partage son écran. La
   * renommer sans toucher au script casserait ce rattrapage en silence.
   */
  it('garde la clé attendue par le script de premier rendu', () => {
    expect(CLE_CONFIDENTIALITE).toBe('freel.confidentialite.v1');
  });
});
