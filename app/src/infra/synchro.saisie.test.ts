/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { saisieEnCoursDans } from './synchro.moteur';

/*
 * « Pas sous les doigts » (lot 42) : une adoption venue du compte attend
 * qu'un formulaire ouvert se ferme. Le moteur le voit dans le document, sans
 * que chaque écran ait à le déclarer — ce test dit ce qu'il voit.
 */
afterEach(() => { document.body.innerHTML = ''; });

describe('une saisie en cours, vue du document', () => {
  // Les formulaires de l'application s'ouvrent dans un volet modal (`Sheet`).
  it('un volet modal ouvert est une saisie en cours', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"><p>Nouvelle dépense</p></div>';
    expect(saisieEnCoursDans(document)).toBe(true);
  });

  // Les réglages se saisissent dans des champs, sans volet.
  it('un champ qui a le focus est une saisie en cours', () => {
    document.body.innerHTML = '<label>Besoin mensuel <input id="c" type="text"></label><textarea id="t"></textarea>';
    (document.getElementById('c') as HTMLInputElement).focus();
    expect(saisieEnCoursDans(document)).toBe(true);
    (document.getElementById('t') as HTMLTextAreaElement).focus();
    expect(saisieEnCoursDans(document)).toBe(true);
  });

  /**
   * Un bouton ou une case n'est pas une saisie : les compter ferait attendre
   * une mise à jour indéfiniment, parce qu'un bouton garde le focus après un
   * clic — l'appareil ne se mettrait plus jamais à jour au retour sur l'onglet.
   */
  it('un bouton ou une case qui a le focus n’en est pas une', () => {
    document.body.innerHTML = '<button id="b">Voir</button><input id="k" type="checkbox">';
    (document.getElementById('b') as HTMLButtonElement).focus();
    expect(saisieEnCoursDans(document)).toBe(false);
    (document.getElementById('k') as HTMLInputElement).focus();
    expect(saisieEnCoursDans(document)).toBe(false);
  });

  it('rien d’ouvert, rien de saisi : on peut mettre à jour', () => {
    document.body.innerHTML = '<main><h1>Pilote</h1></main>';
    expect(saisieEnCoursDans(document)).toBe(false);
  });
});
