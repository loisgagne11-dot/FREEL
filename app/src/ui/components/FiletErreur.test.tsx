/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CLE_STOCKAGE, type Depense, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Achats } from '../screens/Achats';
import { FiletErreur } from './FiletErreur';

let casse = true;
function Fragile() {
  if (casse) throw new Error('lecture de payeeLe sur null');
  return <p>Écran rétabli</p>;
}

let blobs: Blob[] = [];

beforeEach(() => {
  casse = true;
  blobs = [];
  localStorage.clear();
  // React journalise l'erreur rattrapée : c'est le comportement attendu ici,
  // pas un bruit à lire dans la sortie des tests.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:essai'; });
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * UN ÉCRAN QUI TOMBE NE DOIT PAS EMPORTER LES DONNÉES AVEC LUI.
 *
 * Si le filet sautait, React démonterait tout l'arbre : page blanche, aucun
 * message, et l'unique issue trouvable seul serait de vider le stockage du
 * navigateur — donc de tout perdre.
 */
describe('filet d’erreur', () => {
  it('remplace l’écran tombé par un message, sans rien lever', () => {
    render(<FiletErreur portee="ecran"><Fragile /></FiletErreur>);
    expect(screen.getByRole('alert').textContent).toMatch(/Cet écran n’a pas pu s’afficher/);
    expect(screen.getByRole('alert').textContent).toMatch(/n’ont pas été modifiées/);
  });

  it('fait télécharger les données enregistrées telles quelles', async () => {
    const brut = '{"version":17,"depenses":[null]}';
    localStorage.setItem(CLE_STOCKAGE, brut);
    render(<FiletErreur portee="ecran"><Fragile /></FiletErreur>);

    await userEvent.click(screen.getByRole('button', { name: /Télécharger mes données brutes/ }));
    expect(blobs).toHaveLength(1);
    expect(await blobs[0]?.text()).toBe(brut);
  });

  // Sans rien d'enregistré, proposer un téléchargement serait offrir un
  // fichier vide en guise de sauvegarde.
  it('ne propose pas de téléchargement quand rien n’est enregistré', () => {
    render(<FiletErreur portee="ecran"><Fragile /></FiletErreur>);
    expect(screen.queryByRole('button', { name: /Télécharger/ })).toBeNull();
  });

  it('réessaie l’écran sans recharger la page', async () => {
    render(<FiletErreur portee="ecran"><Fragile /></FiletErreur>);
    casse = false;
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(screen.getByText('Écran rétabli')).toBeTruthy();
  });

  /*
   * Le cas réel qui a motivé le filet : un bloc portant une dépense nulle,
   * entré avant que la validation descende dans les listes. On le pose
   * directement dans le magasin, comme l'aurait fait une restauration d'alors.
   */
  it('rattrape l’écran Achats sur une dépense illisible', () => {
    useFaits.setState({
      faits: { ...faitsVides(), depenses: [null as unknown as Depense] },
      chargement: { phase: 'pret' }
    } as never);
    render(<FiletErreur portee="ecran"><Achats annee={2026} /></FiletErreur>);
    expect(screen.getByRole('alert').textContent).toMatch(/Cet écran n’a pas pu s’afficher/);
  });
});
