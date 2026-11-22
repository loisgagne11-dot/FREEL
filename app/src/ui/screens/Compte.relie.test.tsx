/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VERSION_SCHEMA, faitsVides, type Faits } from '../../state/schema';
import { useFaits } from '../../state/store';
import { CLE_CONFIG, CLE_SESSION } from '../../infra/supabase';
import type { VerificationProjet } from '../../infra/supabase.verification';
import { Compte } from './Compte';

/*
 * L'écran relié (maquette `direction/compte.html`, état 5) : la réponse
 * d'abord — « Sauvegardé, à jour » —, la santé du projet, les gestes rares.
 * Les gestes eux-mêmes (envoyer, charger, conflit, effacer…) gardent leurs
 * tests dans `Compte.test.tsx`.
 */
const CONFIG = { url: 'https://projet-demo.supabase.co', cleAnon: 'eyJ.factice.anon' };

const SANTE: VerificationProjet = {
  reglages: { statut: 'ok', valeur: { inscriptionsFermees: true, confirmationAutomatique: false } },
  acces: {
    faits: { statut: 'protegee' }, historique: { statut: 'protegee' }, legacy: { statut: 'absente' },
    le: '2026-11-22T08:40:00.000Z'
  },
  cleDeService: false,
  le: '2026-11-22T08:40:00.000Z'
};

const AVEC_DONNEES: Faits = {
  ...faitsVides(),
  entreprise: { ...faitsVides().entreprise, nom: 'Atelier Exemple' },
  clients: [{ id: 'c1', nom: 'Client exemple' }] as never
};

function relie() {
  const contenu: Record<string, string> = {
    [CLE_CONFIG]: JSON.stringify(CONFIG),
    [CLE_SESSION]: JSON.stringify({
      jeton: 'j', jetonRafraichissement: 'r', expireLe: Date.now() + 3_600_000,
      utilisateurId: 'user-1', email: 'demo@exemple.test'
    })
  };
  return {
    contenu,
    getItem: (c: string) => contenu[c] ?? null,
    setItem: (c: string, v: string) => { contenu[c] = v; },
    removeItem: (c: string) => { delete contenu[c]; }
  };
}

function reponses(...corps: unknown[]) {
  const appel = vi.fn();
  for (const c of corps) appel.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(c) });
  appel.mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
  vi.stubGlobal('fetch', appel);
  return appel;
}

const ligne = (faits: unknown, version = 3) => [{ version, schema: VERSION_SCHEMA, faits, maj_le: '2026-11-22T08:41:00Z' }];

const ecritures = (appel: ReturnType<typeof vi.fn>) =>
  (appel.mock.calls as [string, RequestInit | undefined][])
    .map(([url, o]) => ({ url, methode: String(o?.method ?? 'GET').toUpperCase() }))
    .filter((a) => a.methode !== 'GET' && !a.url.includes('/auth/v1/'));

const monter = (local = relie()) => {
  render(<Compte stockage={local} verifier={async () => SANTE} />);
  return local;
};

beforeEach(() => {
  window.sessionStorage.clear();
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: AVEC_DONNEES });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('relié : la réponse d’abord', () => {
  it('« Sauvegardé ● à jour » quand le compte porte ce qu’il y a ici, avec l’heure du dernier envoi', async () => {
    reponses(ligne(JSON.parse(JSON.stringify(AVEC_DONNEES))));
    monter();
    const carte = (await screen.findByRole('heading', { name: /^Sauvegardé/ })).closest('section') as HTMLElement;
    expect(await within(carte).findByText('à jour')).toBeTruthy();
    // L'heure du dernier envoi, en gras comme sur la maquette : la réponse à « est-ce parti ? ».
    const heure = within(carte).getByText(/^(à|le \d\d\/\d\d à) \d{1,2} h \d\d$/, { selector: 'strong' });
    expect(heure.closest('p')?.textContent).toMatch(/^Dernier envoi (à|le) .*\. Le compte porte exactement/);
    expect(within(carte).getByText('projet-demo.supabase.co')).toBeTruthy();
    expect(within(carte).getByText('demo@exemple.test')).toBeTruthy();
    expect(within(carte).getByRole('button', { name: 'Synchroniser maintenant' })).toBeTruthy();
    expect(within(carte).getByRole('button', { name: 'Me déconnecter' })).toBeTruthy();
    // La santé suit, avec ses gestes rares en pied.
    const sante = screen.getByRole('heading', { name: 'Santé du projet' }).closest('section') as HTMLElement;
    expect(await within(sante).findByText('Un inconnu ne lit rien')).toBeTruthy();
    expect(within(sante).getByRole('button', { name: 'Changer de projet' })).toBeTruthy();
    expect(within(sante).getByRole('button', { name: 'États précédents' })).toBeTruthy();
  });

  it('« Synchroniser maintenant » sur un compte vide envoie cet appareil', async () => {
    const appel = reponses([], [], ligne(AVEC_DONNEES, 1));
    monter();
    expect(await screen.findByText('à envoyer')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Synchroniser maintenant' }));

    expect((await screen.findByRole('status')).textContent).toMatch(/enregistrées sur le compte/);
    expect(ecritures(appel)).toEqual([{ url: `${CONFIG.url}/rest/v1/freel_faits`, methode: 'POST' }]);
  });

  /** Charger écrase cet appareil : même par « Synchroniser », on montre d'abord. */
  it('« Synchroniser maintenant » sur un appareil vide montre ce que le compte apporte, sans rien remplacer', async () => {
    useFaits.setState({ faits: faitsVides() });
    const appel = reponses(ligne(AVEC_DONNEES), ligne(AVEC_DONNEES));
    monter();
    expect(await screen.findByText('à recevoir')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Synchroniser maintenant' }));

    expect(await screen.findByText(/remplaceront/)).toBeTruthy();
    expect(useFaits.getState().faits.clients).toHaveLength(0);
    expect(ecritures(appel)).toEqual([]);
  });

  // Rien ne dit lequel est le plus récent : deviner écraserait l'un des deux.
  it('deux côtés différents : « Synchroniser maintenant » n’écrit rien et fait choisir le sens', async () => {
    const autre = { ...AVEC_DONNEES, clients: [{ id: 'c2', nom: 'Autre client' }] };
    const appel = reponses(ligne(autre), ligne(autre));
    monter();
    expect(await screen.findByText('diffère')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Synchroniser maintenant' }));

    expect((await screen.findByRole('status')).textContent).toMatch(/choisis le sens ci-dessous/);
    expect(ecritures(appel)).toEqual([]);
    expect(screen.getByRole('button', { name: 'Enregistrer cet appareil sur le compte' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Charger le compte sur cet appareil' })).toBeTruthy();
  });
});

describe('relié : les gestes rares', () => {
  it('« États précédents » ouvre la liste et la lit aussitôt', async () => {
    const appel = reponses(ligne(AVEC_DONNEES), [
      { id: 7, version: 2, schema: VERSION_SCHEMA, maj_le: null, remplace_le: '2026-11-21T09:30:00Z' }
    ]);
    monter();
    await screen.findByText('à jour');
    await userEvent.setup().click(screen.getByRole('button', { name: 'États précédents' }));

    expect(await screen.findByRole('list', { name: 'États précédents du compte' })).toBeTruthy();
    expect(appel.mock.calls.some(([url]) => String(url).includes('freel_faits_historique'))).toBe(true);
  });

  /**
   * Une session appartient au projet d'avant : changer de projet connecté
   * déconnecte d'abord, après confirmation, et mène droit à l'adresse et à la clé.
   */
  it('« Changer de projet », connecté : confirmer, se déconnecter, oublier le projet', async () => {
    const appel = reponses(ligne(AVEC_DONNEES));
    const local = monter();
    await screen.findByText('à jour');
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: 'Changer de projet' }));
    expect(screen.getByRole('group', { name: /Tu seras déconnecté de ce projet/ })).toBeTruthy();
    expect(local.contenu[CLE_CONFIG]).toBeDefined();

    await utilisateur.click(screen.getByRole('button', { name: 'Me déconnecter et changer' }));

    expect(await screen.findByRole('heading', { name: '3. Relier FREEL' })).toBeTruthy();
    expect(local.contenu[CLE_CONFIG]).toBeUndefined();
    expect(local.contenu[CLE_SESSION]).toBeUndefined();
    expect(appel.mock.calls.some(([url]) => String(url).endsWith('/auth/v1/logout'))).toBe(true);
  });

  it('« Me déconnecter » laisse les données ici, le dit, et rouvre « Ton compte »', async () => {
    reponses(ligne(AVEC_DONNEES));
    const local = monter();
    await screen.findByText('à jour');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Me déconnecter' }));

    expect((await screen.findByRole('status')).textContent).toMatch(/Tes données restent sur cet appareil/);
    expect(await screen.findByRole('heading', { name: 'Ton compte' })).toBeTruthy();
    expect(local.contenu[CLE_SESSION]).toBeUndefined();
    expect(useFaits.getState().faits.clients).toHaveLength(1);
  });
});
