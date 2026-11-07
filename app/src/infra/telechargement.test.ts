// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DELAI_RETRAIT_CADRE_MS, DELAI_REVOCATION_MS, imprimer, telecharger
} from './telechargement';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('téléchargement', () => {
  // Safari et Firefox lisent le blob après le retour de click() : révoquer
  // l'URL tout de suite (ou à 200 ms) donne un fichier vide sur un gros export.
  it('ne révoque pas l’URL du fichier avant que le navigateur ait pu le lire', () => {
    URL.createObjectURL = vi.fn(() => 'blob:factice');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    telecharger('a.json', '{}', 'application/json');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5_000);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DELAI_REVOCATION_MS);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:factice');
    expect(document.querySelector('a')).toBeNull();
  });
});

describe('impression', () => {
  function simulerImpression(): HTMLIFrameElement {
    const print = vi.fn();
    const original = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((nom: string) => {
      const el = original(nom);
      if (nom === 'iframe') {
        // jsdom n'implémente pas print() : on l'injecte à la création.
        Object.defineProperty(el, 'contentWindow', {
          get: () => {
            const w = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')
              ?.get?.call(el) as Window | null;
            if (w !== null) w.print = print;
            return w;
          }
        });
      }
      return el;
    });
    expect(imprimer('<p>doc</p>')).toBe(true);
    return document.querySelector('iframe') as HTMLIFrameElement;
  }

  // Un cadre non sandboxé exécuterait un script injecté via un nom de client ;
  // sans allow-modals, Chrome ignore print() sans erreur.
  it('isole le cadre d’impression : pas de scripts, mais impression et écriture permises', () => {
    const cadre = simulerImpression();
    const droits = (cadre.getAttribute('sandbox') ?? '').split(/\s+/);
    expect(droits).toContain('allow-modals');
    expect(droits).toContain('allow-same-origin');
    expect(droits).not.toContain('allow-scripts');
  });

  // Sans retrait, chaque impression laissait un cadre dans la page.
  it('retire le cadre une fois l’impression terminée', () => {
    const cadre = simulerImpression();
    expect(document.body.contains(cadre)).toBe(true);
    cadre.contentWindow?.dispatchEvent(new Event('afterprint'));
    expect(document.body.contains(cadre)).toBe(false);
  });

  // Retirer le cadre trop tôt annule l'impression pendant que la boîte est ouverte.
  it('ne retire pas le cadre pendant que la boîte d’impression peut être ouverte', () => {
    const cadre = simulerImpression();
    vi.advanceTimersByTime(DELAI_RETRAIT_CADRE_MS - 1_000);
    expect(document.body.contains(cadre)).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(document.body.contains(cadre)).toBe(false);
  });
});
