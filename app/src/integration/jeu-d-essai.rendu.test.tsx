/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App';
import { CLE_STOCKAGE, faitsVides } from '../state/schema';
import { useFaits } from '../state/store';
import { chargerJeuBrut, le } from '../test/jeu-d-essai';

/**
 * Chaque écran affiche le jeu d'essai sans que le filet d'erreur ne s'ouvre.
 *
 * Les tests d'écran montent un écran avec les quelques faits qu'il lui faut. Le
 * jeu fait travailler les écrans sur un compte entier — une mission via agence,
 * un avoir, une TVA franchie, un foyer à deux parts — et c'est le « Cannot read
 * properties of undefined » d'un champ que seul ce compte-là remplit que le
 * filet attrape. Sans ce test, il ne s'attrape qu'en ouvrant l'écran à la main.
 */

const ECRANS = ['#/pilote', '#/activite', '#/argent', '#/achats', '#/outils', '#/config', '#/facture'] as const;
const NOMS_ECRANS = ECRANS.map((h) => h.slice(2));

// Deux dates : le jour de référence du jeu, et le lendemain du 31 décembre
// 2026, où l'année de l'horloge ne contient plus aucune recette.
const HORLOGES = [
  { nom: '15 décembre 2026', date: le(2026, 12, 15) },
  { nom: '2 janvier 2027', date: le(2027, 1, 2) }
] as const;

let erreurs: unknown[][] = [];

beforeEach(() => {
  erreurs = [];
  // React journalise toute erreur rattrapée par un filet : c'est ce journal, en
  // plus du message affiché, qui dit QUELLE exception a ouvert le filet.
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { erreurs.push(args); });
  localStorage.clear();
  localStorage.setItem(CLE_STOCKAGE, JSON.stringify(chargerJeuBrut()));
  useFaits.setState({ faits: faitsVides(), chargement: { phase: 'initial' }, saisiesEcartees: 0 });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('les écrans sur le jeu d’essai', () => {
  for (const horloge of HORLOGES) {
    describe(`au ${horloge.nom}`, () => {
      it.each(NOMS_ECRANS.map((nom, i) => [nom, ECRANS[i] as string] as const))(
        'écran %s : aucun filet d’erreur', async (_nom, hash) => {
          // Seule la date est simulée : les minuteries réelles servent aux
          // `waitFor` et au chargement différé des écrans.
          vi.useFakeTimers({ toFake: ['Date'] });
          vi.setSystemTime(horloge.date);
          window.location.hash = hash;

          render(<App />);
          await waitFor(() => {
            expect(useFaits.getState().chargement.phase).toBe('pret');
            expect(screen.queryByText('Chargement…')).toBeNull();
          }, { timeout: 5000 });

          // Le compte du jeu est bien celui qui s'affiche, pas un compte vide.
          expect(useFaits.getState().faits.recettes.length).toBeGreaterThan(20);
          // Un écran vide est conforme à tout : on s'assure qu'il a rendu quelque chose.
          expect((document.body.textContent ?? '').length).toBeGreaterThan(300);
          expect(screen.queryByRole('alert'), 'un filet d’erreur est ouvert').toBeNull();
          expect(screen.queryByText(/n’a pas pu s’afficher/)).toBeNull();
          const exceptions = erreurs.flat().filter((e) => e instanceof Error);
          expect(exceptions.map((e) => (e as Error).message)).toEqual([]);
        }, 15000
      );
    });
  }
});
