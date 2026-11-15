/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { stockageMemoireJustificatifs } from '../../infra/justificatifs';
import { FournisseurToasts } from '../components/Toasts';
import { Donnees } from './Config.donnees';

/** IndexedDB n'existe pas sous jsdom : une suppression qui réussit, et une liste vide. */
function indexedDBFactice() {
  return {
    deleteDatabase: () => {
      const requete: { onsuccess?: () => void } = {};
      setTimeout(() => requete.onsuccess?.(), 0);
      return requete;
    },
    databases: async () => []
  };
}

beforeEach(() => {
  localStorage.clear();
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
  vi.stubGlobal('indexedDB', indexedDBFactice());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Données › Effacer cet appareil', () => {
  it('propose l’archive, efface, puis dit ce qu’il a relu', async () => {
    localStorage.setItem('freel.faits.v1', '{}');
    localStorage.setItem('freel_v50_bundle', '{}');
    localStorage.setItem('autre-site.preferences', 'x');
    const u = userEvent.setup();
    render(<FournisseurToasts><Donnees stockage={stockageMemoireJustificatifs()} /></FournisseurToasts>);

    await u.click(screen.getByRole('button', { name: 'Effacer…' }));
    expect(screen.getByRole('button', { name: 'Créer l’archive d’abord' })).toBeTruthy();
    expect(screen.getByText(/aucune n’a été faite depuis ce navigateur/)).toBeTruthy();

    await u.click(screen.getByRole('button', { name: 'Effacer cet appareil' }));
    await screen.findByText(/Effacé, puis relu/);
    expect(localStorage.getItem('freel.faits.v1')).toBeNull();
    expect(localStorage.getItem('freel_v50_bundle')).toBeNull();
    expect(localStorage.getItem('autre-site.preferences')).toBe('x');
    expect(screen.getByRole('button', { name: 'Terminer' })).toBeTruthy();
  });

  it('« Garder » referme sans rien effacer, et rend le focus', async () => {
    localStorage.setItem('freel.faits.v1', '{}');
    const u = userEvent.setup();
    render(<FournisseurToasts><Donnees stockage={stockageMemoireJustificatifs()} /></FournisseurToasts>);
    const bouton = screen.getByRole('button', { name: 'Effacer…' });
    await u.click(bouton);
    await u.click(screen.getByRole('button', { name: 'Garder' }));
    expect(screen.queryByRole('button', { name: 'Effacer cet appareil' })).toBeNull();
    expect(document.activeElement).toBe(bouton);
    expect(localStorage.getItem('freel.faits.v1')).toBe('{}');
  });

  it('dit ce qui protège, sans promettre un chiffrement qui n’existe pas', () => {
    render(<FournisseurToasts><Donnees stockage={stockageMemoireJustificatifs()} /></FournisseurToasts>);
    expect(screen.getByText(/sans chiffrement/).textContent).toMatch(/verrouillage de l’appareil/);
  });
});
