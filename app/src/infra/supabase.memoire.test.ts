import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ConfigSupabase, Session } from './supabase';
import { effacerFaitsDuCompte } from './supabase';
import {
  ETATS_GARDES, TAILLE_MAX_FAITS, lireEtatPrecedent, listerEtatsPrecedents, sqlMemoireDuCompte
} from './supabase.memoire';
import { sqlProtectionFaits, sqlProtectionLegacy } from './supabase.acces';

const CONFIG: ConfigSupabase = { url: 'https://exemple.test', cleAnon: 'cle-anon' };
const SESSION: Session = {
  jeton: 'jeton-abc', jetonRafraichissement: 'r', expireLe: Date.now() + 3_600_000,
  utilisateurId: 'user-1', email: 'demo@exemple.test'
};

function enSuite(...reponses: readonly (readonly [unknown, number])[]) {
  let n = 0;
  const appel = vi.fn().mockImplementation(() => {
    const [corps, statut] = reponses[Math.min(n++, reponses.length - 1)] as readonly [unknown, number];
    return Promise.resolve({
      ok: statut >= 200 && statut < 300, status: statut,
      text: async () => (corps === null ? '' : JSON.stringify(corps))
    });
  });
  vi.stubGlobal('fetch', appel);
  return appel;
}

afterEach(() => { vi.unstubAllGlobals(); });

const ETAT = { id: 7, version: 4, schema: 21, maj_le: '2026-11-10T08:00:00Z', remplace_le: '2026-11-12T09:30:00Z' };

describe('états précédents — lecture', () => {
  it('liste ceux du compte connecté, du plus récent au plus ancien, sans télécharger leurs faits', async () => {
    const appel = enSuite([[ETAT], 200]);
    const r = await listerEtatsPrecedents(CONFIG, SESSION);
    expect(r).toEqual({ statut: 'ok', valeur: [{ id: 7, version: 4, schema: 21, majLe: '2026-11-10T08:00:00Z', remplaceLe: '2026-11-12T09:30:00Z' }] });
    const url = (appel.mock.calls[0] as [string])[0];
    expect(url).toContain('freel_faits_historique?user_id=eq.user-1');
    expect(url).toContain('order=remplace_le.desc');
    expect(url).not.toContain('faits,');
  });

  /** « Réessaie » face à une table absente ne changerait jamais rien : c'est un script à exécuter. */
  it('une table absente se dit « non installée », pas « erreur »', async () => {
    enSuite([{ message: 'relation does not exist' }, 404]);
    expect(await listerEtatsPrecedents(CONFIG, SESSION)).toEqual({ statut: 'non-installe' });
  });

  it('lit un état avec ses faits, ou `null` s’il n’existe plus', async () => {
    const appel = enSuite([[{ version: 4, schema: 21, faits: { version: 21 }, maj_le: null }], 200], [[], 200]);
    const r = await lireEtatPrecedent(CONFIG, SESSION, 7);
    expect(r).toMatchObject({ statut: 'ok', valeur: { version: 4, schema: 21, faits: { version: 21 } } });
    expect((appel.mock.calls[0] as [string])[0]).toContain('&id=eq.7&');
    expect(await lireEtatPrecedent(CONFIG, SESSION, 8)).toEqual({ statut: 'ok', valeur: null });
  });
});

/**
 * Un effacement qui laisserait vingt copies du dossier sur le serveur n'en
 * serait pas un : les états précédents partent avec la copie, relecture à
 * l'appui pour eux aussi.
 */
describe('effacement — les états précédents partent avec la copie', () => {
  it('efface la copie puis ses états précédents, et le prouve deux fois', async () => {
    const appel = enSuite([[{ user_id: 'user-1' }], 200], [[], 200], [[ETAT], 200], [[], 200]);
    expect(await effacerFaitsDuCompte(CONFIG, SESSION)).toEqual({ statut: 'efface' });
    const appels = appel.mock.calls.map((c) => [(c[1] as RequestInit).method ?? 'GET', (c as [string])[0]]);
    expect(appels[2]).toEqual(['DELETE', expect.stringContaining('freel_faits_historique?user_id=eq.user-1')]);
    expect(appels[3]).toEqual(['GET', expect.stringContaining('freel_faits_historique?user_id=eq.user-1')]);
  });

  it('ne dit pas « effacé » quand des états précédents restent', async () => {
    enSuite([[{ user_id: 'user-1' }], 200], [[], 200], [[], 200], [[ETAT], 200]);
    expect(await effacerFaitsDuCompte(CONFIG, SESSION)).toEqual({ statut: 'regle-absente' });
  });

  it('une table d’historique absente (SQL non exécuté) n’empêche pas l’effacement', async () => {
    enSuite([[{ user_id: 'user-1' }], 200], [[], 200], [{ message: 'absente' }, 404]);
    expect(await effacerFaitsDuCompte(CONFIG, SESSION)).toEqual({ statut: 'efface' });
  });
});

/** Le SQL que l'écran propose est celui du dépôt, mot pour mot. */
describe('docs/supabase.sql', () => {
  const script = readFileSync(new URL('../../../docs/supabase.sql', import.meta.url), 'utf8');

  it('porte la mémoire du compte et les règles d’accès telles que l’application les propose', () => {
    expect(script).toContain(sqlMemoireDuCompte());
    expect(script).toContain(sqlProtectionFaits());
    expect(script).toContain(sqlProtectionLegacy());
  });

  /** Sans rôle nommé, une règle s'évaluait aussi pour l'anonyme : la protection tenait à un nul. */
  it('chaque règle d’accès nomme le rôle connecté', () => {
    const regles = script.split('create policy').slice(1).map((r) => r.split(';')[0] ?? '');
    expect(regles.length).toBeGreaterThanOrEqual(7);
    for (const r of regles) expect(r).toMatch(/\n\s+to authenticated\n/);
    expect(script).not.toMatch(/using \(auth\.uid\(\)/);
  });

  it('garde vingt états, ne laisse personne en écrire, et n’archive pas une suppression', () => {
    expect(ETATS_GARDES).toBe(20);
    expect(sqlMemoireDuCompte()).toContain('limit 20');
    expect(sqlMemoireDuCompte()).toContain('revoke insert, update on public.freel_faits_historique from anon, authenticated');
    expect(sqlMemoireDuCompte()).toMatch(/after update on public\.freel_faits\n/);
  });

  /**
   * La borne laisse passer dix ans d'un compte CHARGÉ, avec une marge du
   * double. « Dix fois le jeu d'essai » (185 Ko) aurait refusé un tel compte
   * au bout d'un an : la taille d'un élément est mesurée ici sur le jeu.
   */
  it('la borne de taille tient dix ans d’un compte chargé, deux fois', () => {
    const jeu = JSON.parse(readFileSync(new URL('../test/jeu-d-essai.json', import.meta.url), 'utf8')) as Record<string, unknown[]>;
    const moyenne = (cle: string): number => {
      const liste = jeu[cle] ?? [];
      return new TextEncoder().encode(JSON.stringify(liste)).length / Math.max(liste.length, 1);
    };
    const parAn = 480 * moyenne('mouvementsBancaires') + 150 * moyenne('depenses')
      + 24 * moyenne('recettes') + 20 * moyenne('echeances');
    expect(10 * parAn * 2).toBeLessThan(TAILLE_MAX_FAITS);
    expect(sqlMemoireDuCompte()).toContain(`octet_length(faits::text) <= ${TAILLE_MAX_FAITS}`);
  });
});
