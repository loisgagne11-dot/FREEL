/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { capturerRetourDuLien, oublierRetourDuLien, retourDuLien } from './retourDuLien';

afterEach(() => { oublierRetourDuLien(); window.history.replaceState(null, '', '/'); });

/**
 * LE CODE SORT DE L'ADRESSE AVANT TOUT.
 *
 * Il ouvre une session. Resté dans l'adresse, il serait rejoué par « retour »,
 * lisible dans l'historique, et occuperait la requête d'une page dont le
 * routeur, lui, lit le fragment : l'écran Compte ne serait jamais ouvert.
 */
describe('le retour d’un lien de courriel', () => {
  it('retire le code de l’adresse, sans entrée d’historique, et ouvre Réglages › Compte', () => {
    window.history.replaceState(null, '', '/app/?code=0b6f2c1e-4d1a-4a6b-9a5e-1f2e3d4c5b6a');
    const longueur = window.history.length;

    capturerRetourDuLien();

    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/app/');
    expect(window.location.hash).toBe('#/reglages/compte');
    expect(window.location.href).not.toContain('0b6f2c1e');
    expect(window.history.length).toBe(longueur);
    expect(retourDuLien()?.get('code')).toBe('0b6f2c1e-4d1a-4a6b-9a5e-1f2e3d4c5b6a');
  });

  // Un lien expiré revient avec l'erreur dans la requête ET dans le fragment :
  // laissé là, le fragment n'est plus une route.
  it('retire aussi une erreur, de la requête comme du fragment', () => {
    window.history.replaceState(null, '', '/?error=access_denied&error_code=otp_expired#error=access_denied&error_code=otp_expired');
    capturerRetourDuLien();
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/reglages/compte');
    expect(retourDuLien()?.get('error_code')).toBe('otp_expired');
  });

  it('ne touche à rien quand l’adresse n’apporte aucun retour', () => {
    window.history.replaceState(null, '', '/#/tresorerie');
    capturerRetourDuLien();
    expect(window.location.hash).toBe('#/tresorerie');
    expect(retourDuLien()).toBeNull();
  });
});
