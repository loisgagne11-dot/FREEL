/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { CLE_CONFIG, CLE_SESSION } from '../../infra/supabase';
import { CLE_LIEN } from '../../infra/supabase.inscription';
import { capturerRetourDuLien, oublierRetourDuLien } from '../../infra/retourDuLien';
import type { VerificationProjet } from '../../infra/supabase.verification';
import { Compte } from './Compte';

/*
 * Créer son compte, mot de passe oublié, et le retour des liens envoyés par
 * courriel (phase C). Les requêtes ont leurs tests (`supabase.inscription.test.ts`) ;
 * ici, ce que l'écran en dit, et où il mène.
 */
const CONFIG = { url: 'https://projet-demo.supabase.co', cleAnon: 'eyJ.factice.anon' };
const SANTE: VerificationProjet = {
  reglages: { statut: 'ok', valeur: { inscriptionsFermees: false, confirmationAutomatique: false } },
  acces: {
    faits: { statut: 'protegee' }, historique: { statut: 'protegee' }, legacy: { statut: 'absente' },
    le: '2026-11-22T08:40:00.000Z'
  },
  cleDeService: false,
  le: '2026-11-22T08:40:00.000Z'
};
const verifier = async () => SANTE;
const CORPS_SESSION = {
  access_token: 'jeton-neuf', refresh_token: 'r2', expires_in: 3600,
  user: { id: 'user-1', email: 'demo@exemple.test' }
};

function stockage(initial: Record<string, string> = {}) {
  const contenu: Record<string, string> = { [CLE_CONFIG]: JSON.stringify(CONFIG), ...initial };
  return {
    contenu,
    getItem: (c: string) => contenu[c] ?? null,
    setItem: (c: string, v: string) => { contenu[c] = v; },
    removeItem: (c: string) => { delete contenu[c]; }
  };
}

function reponses(...corps: { corps: unknown; statut?: number }[]) {
  const appel = vi.fn();
  for (const c of corps) {
    appel.mockResolvedValueOnce({ ok: (c.statut ?? 200) < 300, status: c.statut ?? 200, text: async () => JSON.stringify(c.corps) });
  }
  appel.mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
  vi.stubGlobal('fetch', appel);
  return appel;
}

const appels = (appel: ReturnType<typeof vi.fn>) =>
  (appel.mock.calls as [string, RequestInit | undefined][]).map(([url, o]) => `${o?.method ?? 'GET'} ${url}`);

/** Un lien de courriel vient de ramener ici, avec ce que porte son adresse. */
function revenirAvec(requete: string) {
  window.history.replaceState(null, '', `/?${requete}`);
  capturerRetourDuLien();
}

const ENATTENTE = (motif: string) => ({ [CLE_LIEN]: JSON.stringify({ verifieur: 'v'.repeat(43), motif }) });

beforeEach(() => {
  window.sessionStorage.clear();
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  oublierRetourDuLien();
  window.history.replaceState(null, '', '/');
});

async function remplir(utilisateur: ReturnType<typeof userEvent.setup>, motDePasse = 'motdepasse') {
  await utilisateur.type(await screen.findByLabelText('Courriel'), 'demo@exemple.test');
  await utilisateur.type(screen.getByLabelText('Mot de passe'), motDePasse);
}

describe('créer mon compte', () => {
  it('confirmation demandée : le courriel est annoncé, et l’adresse de retour à déclarer est montrée', async () => {
    const appel = reponses({ corps: { id: 'user-1', identities: [{ id: 'i' }] } });
    render(<Compte stockage={stockage()} verifier={verifier} />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(await screen.findByRole('tab', { name: 'Créer mon compte' }));
    await remplir(utilisateur);
    await utilisateur.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    expect((await screen.findByRole('status')).textContent).toBe(
      'Un courriel de confirmation est parti à demo@exemple.test : clique le lien, puis reviens te connecter ici.'
    );
    expect(appels(appel)[0]).toMatch(/^POST https:\/\/projet-demo\.supabase\.co\/auth\/v1\/signup\?redirect_to=/);
    // L'adresse où FREEL est ouvert, à déclarer dans le projet : sans elle, le lien ramène ailleurs.
    expect(screen.getByText(`${window.location.origin}/`)).toBeTruthy();
    expect(screen.getByText(/Authentication › URL Configuration/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copier l’adresse' })).toBeTruthy();
  });

  it('une adresse déjà inscrite ramène à « Me connecter », et le dit', async () => {
    reponses({ corps: { error_code: 'user_already_exists' }, statut: 422 });
    render(<Compte stockage={stockage()} verifier={verifier} />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(await screen.findByRole('tab', { name: 'Créer mon compte' }));
    await remplir(utilisateur);
    await utilisateur.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    expect((await screen.findByRole('status')).textContent).toMatch(/déjà un compte dans ce projet : connecte-toi/);
    expect(screen.getByRole('tab', { name: 'Me connecter' }).getAttribute('aria-selected')).toBe('true');
  });

  it('un mot de passe trop court se dit', async () => {
    reponses({ corps: { error_code: 'weak_password' }, statut: 422 });
    render(<Compte stockage={stockage()} verifier={verifier} />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(await screen.findByRole('tab', { name: 'Créer mon compte' }));
    await remplir(utilisateur, '12');
    await utilisateur.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/trop faible/);
  });
});

describe('mot de passe oublié', () => {
  it('demande le lien, dit ce qui part sans révéler qui est inscrit, et l’adresse de retour', async () => {
    const appel = reponses({ corps: {} });
    const local = stockage();
    render(<Compte stockage={local} verifier={verifier} />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(await screen.findByRole('button', { name: /^Mot de passe oublié/ }));
    await utilisateur.type(screen.getByLabelText('Courriel'), 'demo@exemple.test');
    await utilisateur.click(screen.getByRole('button', { name: 'M’envoyer le lien' }));

    expect((await screen.findByRole('status')).textContent).toMatch(
      /^Si un compte existe pour demo@exemple\.test dans ce projet, le courriel est parti\. Ouvre son lien dans ce navigateur-ci/
    );
    expect(appels(appel)[0]).toMatch(/^POST https:\/\/projet-demo\.supabase\.co\/auth\/v1\/recover\?redirect_to=/);
    expect(JSON.parse(local.contenu[CLE_LIEN] ?? '{}').motif).toBe('recuperation');
    expect(screen.getByText(/Authentication › URL Configuration/)).toBeTruthy();
  });
});

describe('le retour d’un lien', () => {
  it('mot de passe oublié : le code s’échange, on choisit le nouveau, et on est connecté', async () => {
    revenirAvec('code=0b6f2c1e-0001-4a6b-9a5e-1f2e3d4c5b6a');
    const appel = reponses({ corps: CORPS_SESSION }, { corps: { id: 'user-1' } }, { corps: [] });
    const local = stockage(ENATTENTE('recuperation'));
    render(<Compte stockage={local} verifier={verifier} />);
    const utilisateur = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Choisis ton nouveau mot de passe' })).toBeTruthy();
    // Le code n'est plus dans l'adresse : il en est sorti avant le premier rendu.
    expect(window.location.href).not.toContain('0b6f2c1e');
    await utilisateur.type(screen.getByLabelText('Nouveau mot de passe'), 'nouveau-mot');
    await utilisateur.type(screen.getByLabelText('Retape-le'), 'nouveau-mot');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer ce mot de passe' }));

    expect((await screen.findByRole('status')).textContent).toBe('Mot de passe changé : tu es connecté.');
    expect(await screen.findByRole('heading', { name: 'Santé du projet' })).toBeTruthy();
    expect(appels(appel).slice(0, 2)).toEqual([
      'POST https://projet-demo.supabase.co/auth/v1/token?grant_type=pkce',
      'PUT https://projet-demo.supabase.co/auth/v1/user'
    ]);
    expect(local.contenu[CLE_SESSION]).toContain('jeton-neuf');
    expect(local.contenu[CLE_LIEN]).toBeUndefined();
  });

  it('deux saisies différentes ne partent pas', async () => {
    revenirAvec('code=0b6f2c1e-0002-4a6b-9a5e-1f2e3d4c5b6a');
    const appel = reponses({ corps: CORPS_SESSION });
    render(<Compte stockage={stockage(ENATTENTE('recuperation'))} verifier={verifier} />);
    const utilisateur = userEvent.setup();
    await utilisateur.type(await screen.findByLabelText('Nouveau mot de passe'), 'nouveau-mot');
    await utilisateur.type(screen.getByLabelText('Retape-le'), 'nouveau-mo');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer ce mot de passe' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Les deux saisies diffèrent/);
    expect(appels(appel)).toHaveLength(1);
  });

  it('inscription confirmée : connecté, et le guide reprend à « Fermer les inscriptions »', async () => {
    revenirAvec('code=0b6f2c1e-0003-4a6b-9a5e-1f2e3d4c5b6a');
    reponses({ corps: CORPS_SESSION });
    render(<Compte stockage={stockage(ENATTENTE('inscription'))} verifier={verifier} />);

    expect(await screen.findByRole('heading', { name: '5. Fermer les inscriptions' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Adresse confirmée : tu es connecté.');
  });

  it('un code invalide ou expiré est refusé, et dit de redemander le lien', async () => {
    revenirAvec('code=0b6f2c1e-0004-4a6b-9a5e-1f2e3d4c5b6a');
    reponses({ corps: { error_code: 'flow_state_not_found', msg: 'Texte du serveur' }, statut: 404 });
    render(<Compte stockage={stockage(ENATTENTE('recuperation'))} verifier={verifier} />);

    expect((await screen.findByRole('alert')).textContent).toMatch(/Ce lien ne vaut plus.*Redemande-le/);
    expect(screen.queryByText(/Texte du serveur/)).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByRole('heading', { name: 'Ton compte' })).toBeTruthy();
  });

  // Ouvert ailleurs, le code ne vaut rien sans le secret gardé ici : on ne l'envoie pas.
  it('ouvert dans un autre navigateur : rien ne part, et l’écran dit quoi faire', async () => {
    revenirAvec('code=0b6f2c1e-0005-4a6b-9a5e-1f2e3d4c5b6a');
    const appel = reponses();
    render(<Compte stockage={stockage()} verifier={verifier} />);

    expect((await screen.findByRole('alert')).textContent).toMatch(/autre navigateur/);
    expect(appels(appel).filter((a) => a.includes('/auth/'))).toEqual([]);
  });

  it('un lien expiré revient en erreur : on le dit, sans la description du serveur', async () => {
    revenirAvec('error=access_denied&error_code=otp_expired&error_description=Texte+du+serveur');
    render(<Compte stockage={stockage()} verifier={verifier} />);

    expect((await screen.findByRole('alert')).textContent).toBe('Ce lien a expiré, ou a déjà servi : redemande-le.');
    expect(screen.queryByText(/Texte du serveur/)).toBeNull();
  });
});
