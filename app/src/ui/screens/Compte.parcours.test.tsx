/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { CLE_CONFIG, CLE_SESSION } from '../../infra/supabase';
import type { VerdictAcces, VerdictTable } from '../../infra/supabase.acces';
import type { VerificationProjet } from '../../infra/supabase.verification';
import { Compte } from './Compte';

/*
 * Le parcours de première connexion (maquette `direction/compte.html`) : les
 * deux portes, le guide en cinq étapes vérifiées, l'écran relié.
 *
 * La vérification du projet est INJECTÉE : ses requêtes ont leurs tests
 * (`supabase.verification.test.ts`) ; ici, ce que l'écran fait de son verdict.
 */
const CONFIG = { url: 'https://projet-demo.supabase.co', cleAnon: 'eyJ.factice.anon' };
const P: VerdictTable = { statut: 'protegee' };
const ABSENTE: VerdictTable = { statut: 'absente' };

function verification(
  { acces = {}, inscriptionsFermees = true, code }: {
    acces?: Partial<VerdictAcces>; inscriptionsFermees?: boolean; code?: number
  } = {}
): VerificationProjet {
  return {
    reglages: code === undefined
      ? { statut: 'ok', valeur: { inscriptionsFermees, confirmationAutomatique: false } }
      : { statut: 'erreur', motif: 'x', code },
    acces: code === undefined
      ? { faits: P, historique: P, legacy: ABSENTE, le: '2026-11-22T08:40:00.000Z', ...acces }
      : null,
    cleDeService: false,
    le: '2026-11-22T08:40:00.000Z'
  };
}

function stockage(initial: Record<string, string> = {}) {
  const contenu: Record<string, string> = { ...initial };
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

const SESSION_OK = {
  corps: { access_token: 'jeton', refresh_token: 'r', expires_in: 3600, user: { id: 'user-1', email: 'demo@exemple.test' } }
};

beforeEach(() => {
  window.sessionStorage.clear();
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Ouvre le guide à l'étape 3, comme « J'ai déjà un projet Supabase ». */
async function versLEtape3(utilisateur: ReturnType<typeof userEvent.setup>) {
  await utilisateur.click(screen.getByRole('button', { name: 'J’ai déjà un projet Supabase' }));
  return screen.findByRole('heading', { name: '3. Relier FREEL' });
}

async function saisirLeProjet(utilisateur: ReturnType<typeof userEvent.setup>, url = CONFIG.url, cle = CONFIG.cleAnon) {
  await utilisateur.type(screen.getByRole('textbox', { name: /Adresse du projet/ }), url);
  await utilisateur.type(screen.getByRole('textbox', { name: /Clé publique/ }), cle);
  await utilisateur.click(screen.getByRole('button', { name: 'Vérifier' }));
}

describe('rien n’est relié : deux portes', () => {
  it('« Sans compte » mène à la sauvegarde en fichier, dans Données & export', () => {
    render(<Compte stockage={stockage()} />);
    expect(screen.getByRole('link', { name: /Réglages › Données & export/ }).getAttribute('href')).toBe('#/reglages/donnees');
  });

  it('« J’ai déjà un projet Supabase » ouvre directement l’étape 3', async () => {
    render(<Compte stockage={stockage()} />);
    await versLEtape3(userEvent.setup());
    expect(screen.getByRole('textbox', { name: /Adresse du projet/ })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /Clé publique/ })).toBeTruthy();
  });
});

describe('le guide : créer le projet, préparer la base', () => {
  it('« Me guider pas à pas » : cinq étapes, la première en cours, supabase.com dans un autre onglet', async () => {
    render(<Compte stockage={stockage()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Me guider pas à pas' }));

    const fil = (await screen.findByRole('heading', { name: 'Relier FREEL en cinq étapes' })).closest('section') as HTMLElement;
    const etapes = within(fil).getAllByRole('listitem');
    expect(etapes.map((e) => e.querySelector('b')?.textContent)).toEqual(
      ['Créer ton projet', 'Préparer la base', 'Relier FREEL', 'Ton compte', 'Fermer les inscriptions']
    );
    expect(etapes[0]?.getAttribute('aria-current')).toBe('step');
    // Une simple navigation : rien n'est chargé d'ailleurs, aucun référent ne part.
    const lien = within(fil).getByRole('link', { name: /Ouvrir supabase\.com/ });
    expect(lien.getAttribute('target')).toBe('_blank');
    expect(lien.getAttribute('rel')).toBe('noopener noreferrer');
  });

  /**
   * L'étape est un état d'ÉCRAN : elle tient l'aller-retour vers supabase.com
   * (rechargement compris), et n'entre jamais dans les faits.
   */
  it('l’étape en cours survit à un rechargement de l’écran, sans rien écrire dans les faits', async () => {
    const local = stockage();
    const avant = JSON.stringify(useFaits.getState().faits);
    const { unmount } = render(<Compte stockage={local} />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: 'Me guider pas à pas' }));
    await utilisateur.click(await screen.findByRole('button', { name: 'C’est fait' }));
    expect(await screen.findByRole('button', { name: 'Copier le script' })).toBeTruthy();
    unmount();

    render(<Compte stockage={local} />);
    expect(await screen.findByRole('button', { name: 'Copier le script' })).toBeTruthy();
    expect(screen.getByText(/— fait/).closest('li')?.textContent).toMatch(/Créer ton projet/);
    expect(JSON.stringify(useFaits.getState().faits)).toBe(avant);
    expect(Object.keys(local.contenu)).toEqual([]);
  });

  /**
   * UNE SEULE SOURCE. Le script copié est `docs/supabase.sql`, lu au build ;
   * une copie recollée dans le code finirait par diverger, et la base préparée
   * ne serait plus celle que l'application attend.
   */
  it('« Copier le script » copie docs/supabase.sql, mot pour mot', async () => {
    window.sessionStorage.setItem('freel.compte.guide', '2');
    render(<Compte stockage={stockage()} />);
    const utilisateur = userEvent.setup();
    const ecrire = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: ecrire }, configurable: true });

    await utilisateur.click(await screen.findByRole('button', { name: 'Copier le script' }));

    // Sous jsdom, `import.meta.url` n'est pas une adresse de fichier : les tests partent de `app/`.
    const script = readFileSync(join(process.cwd(), '..', 'docs', 'supabase.sql'), 'utf8');
    expect(await screen.findByText(/Script copié/)).toBeTruthy();
    expect(ecrire).toHaveBeenCalledWith(script);
  });

  it('presse-papiers refusé : le script s’affiche, à copier à la main', async () => {
    window.sessionStorage.setItem('freel.compte.guide', '2');
    render(<Compte stockage={stockage()} />);
    const utilisateur = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => { throw new Error('refusé'); } }, configurable: true
    });

    await utilisateur.click(await screen.findByRole('button', { name: 'Copier le script' }));

    expect(await screen.findByText(/refuse la copie/)).toBeTruthy();
    expect(document.querySelector('pre')?.textContent).toContain('create table if not exists public.freel_faits');
  });
});

describe('le guide : relier FREEL (étape 3)', () => {
  it('« Vérifier » dit lequel des maillons casse, et le geste qui répare', async () => {
    const local = stockage();
    render(<Compte stockage={local} verifier={async () => verification({ acces: { faits: ABSENTE, historique: ABSENTE } })} />);
    const utilisateur = userEvent.setup();
    await versLEtape3(utilisateur);
    await saisirLeProjet(utilisateur);

    const liste = await screen.findByRole('list', { name: 'Vérification' });
    expect(within(liste).getAllByRole('listitem').map((l) => l.firstChild?.textContent)).toEqual(['✓', '✓', '✗', '·']);
    expect(within(liste).getByText(/Refais l’étape 2 : colle le script entier, puis Run/)).toBeTruthy();
    // Le projet et la clé ont tenu : ils sont gardés, la base se prépare ensuite.
    expect(JSON.parse(local.contenu[CLE_CONFIG] ?? '{}')).toEqual(CONFIG);
    // Mais on ne passe pas à la suite sur une base absente.
    expect(screen.queryByRole('button', { name: 'Continuer' })).toBeNull();

    await utilisateur.click(within(liste).getByRole('button', { name: /Revoir l’étape 2/ }));
    expect(await screen.findByRole('button', { name: 'Copier le script' })).toBeTruthy();
  });

  // Une clé refusée ne s'enregistre pas : la connexion échouerait ensuite sans dire pourquoi.
  it('une clé refusée n’est pas enregistrée', async () => {
    const local = stockage();
    render(<Compte stockage={local} verifier={async () => verification({ code: 401 })} />);
    const utilisateur = userEvent.setup();
    await versLEtape3(utilisateur);
    await saisirLeProjet(utilisateur);

    expect(await screen.findByText('Clé refusée')).toBeTruthy();
    expect(screen.getByText(/la longue qui commence par eyJ/)).toBeTruthy();
    expect(local.contenu[CLE_CONFIG]).toBeUndefined();
  });

  it('enregistre l’adresse sans le chemin de l’API collé avec elle, et le montre', async () => {
    const local = stockage();
    const verifier = vi.fn(async () => verification());
    render(<Compte stockage={local} verifier={verifier} />);
    const utilisateur = userEvent.setup();
    await versLEtape3(utilisateur);
    await saisirLeProjet(utilisateur, 'https://projet-demo.supabase.co/rest/v1/');

    await screen.findByRole('list', { name: 'Vérification' });
    expect(verifier).toHaveBeenCalledWith(CONFIG);
    expect(JSON.parse(local.contenu[CLE_CONFIG] ?? '{}')).toEqual(CONFIG);
    expect((screen.getByRole('textbox', { name: /Adresse du projet/ }) as HTMLInputElement).value).toBe(CONFIG.url);
  });

  /**
   * UNE ADRESSE EN CLAIR EST REFUSÉE AVANT D'ÊTRE ENREGISTRÉE — vérification
   * réelle, sans réseau : elle était enregistrée, puis refusée à la relecture,
   * et l'écran revenait sans un mot.
   */
  it('refuse une adresse en http, et dit pourquoi', async () => {
    const appel = reponses();
    const local = stockage();
    render(<Compte stockage={local} />);
    const utilisateur = userEvent.setup();
    await versLEtape3(utilisateur);
    await saisirLeProjet(utilisateur, 'http://projet-demo.supabase.co');

    expect(await screen.findByText('Adresse refusée')).toBeTruthy();
    expect(screen.getByText(/https:\/\//, { selector: 'small' })).toBeTruthy();
    expect(local.contenu[CLE_CONFIG]).toBeUndefined();
    expect(appel).not.toHaveBeenCalled();
  });

  it('tout tient : « Continuer » mène à l’étape 4, ton compte', async () => {
    render(<Compte stockage={stockage()} verifier={async () => verification()} />);
    const utilisateur = userEvent.setup();
    await versLEtape3(utilisateur);
    await saisirLeProjet(utilisateur);

    await utilisateur.click(await screen.findByRole('button', { name: 'Continuer' }));
    expect(await screen.findByRole('heading', { name: '4. Ton compte' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Me connecter' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Créer mon compte' })).toBeTruthy();
    // Les deux comptes ne se confondent plus.
    expect(screen.getByText(/ton compte dans le projet/).closest('p')?.textContent).toMatch(/pas ceux du site supabase\.com/);
  });
});

describe('le guide : ton compte, puis fermer les inscriptions', () => {
  it('connecté, l’étape 5 relit le réglage ; fermé, « Terminer » mène au compte relié', async () => {
    reponses(SESSION_OK, { corps: [] });
    window.sessionStorage.setItem('freel.compte.guide', '4');
    const verifier = vi.fn()
      .mockResolvedValueOnce(verification({ inscriptionsFermees: false }))
      .mockResolvedValue(verification({ inscriptionsFermees: true }));
    const local = stockage({ [CLE_CONFIG]: JSON.stringify(CONFIG) });
    render(<Compte stockage={local} verifier={verifier} />);
    const utilisateur = userEvent.setup();

    await utilisateur.type(await screen.findByLabelText('Courriel'), 'demo@exemple.test');
    await utilisateur.type(screen.getByLabelText('Mot de passe'), 'motdepasse');
    await utilisateur.click(screen.getByRole('button', { name: 'Me connecter' }));

    expect(await screen.findByRole('heading', { name: '5. Fermer les inscriptions' })).toBeTruthy();
    expect(await screen.findByText('Inscriptions encore ouvertes')).toBeTruthy();
    expect(screen.getByText(/FREEL relit ce réglage/)).toBeTruthy();
    expect(local.contenu[CLE_SESSION]).toContain('demo@exemple.test');

    await utilisateur.click(screen.getByRole('button', { name: 'Vérifier à nouveau' }));
    await utilisateur.click(await screen.findByRole('button', { name: 'Terminer' }));

    expect(await screen.findByRole('heading', { name: 'Santé du projet' })).toBeTruthy();
    expect(screen.getByText('demo@exemple.test')).toBeTruthy();
    expect(window.sessionStorage.getItem('freel.compte.guide')).toBeNull();
  });
});
