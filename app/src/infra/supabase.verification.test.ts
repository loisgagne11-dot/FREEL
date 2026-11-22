import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VerdictAcces, VerdictTable } from './supabase.acces';
import {
  type Maillon, type VerificationProjet, constatsDuProjet, estCleDeService, projetJoint, projetPret,
  verifierProjet
} from './supabase.verification';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const CONFIG = { url: 'https://projet-demo.supabase.co', cleAnon: 'eyJ.factice.anon' };
const TOUS: readonly Maillon[] = ['joignable', 'cle', 'base', 'acces', 'inscriptions'];

/** Une réponse du projet ; le corps est du texte, comme `fetch` le rend. */
function repondre(statut: number, corps: unknown) {
  const appel = vi.fn(async () => ({
    ok: statut < 300, status: statut, text: async () => JSON.stringify(corps)
  }));
  vi.stubGlobal('fetch', appel);
  return appel;
}

const P: VerdictTable = { statut: 'protegee' };
const ABSENTE: VerdictTable = { statut: 'absente' };
const sonde = (faits: VerdictTable, historique: VerdictTable, legacy: VerdictTable = ABSENTE) =>
  vi.fn(async (): Promise<VerdictAcces> => ({ faits, historique, legacy, le: '2026-11-22T08:40:00.000Z' }));

const statuts = (v: VerificationProjet) => constatsDuProjet(v, TOUS).map((c) => `${c.maillon}:${c.statut}`);
const constat = (v: VerificationProjet, m: Maillon) => constatsDuProjet(v, [m])[0];

describe('vérifier un projet : le projet et sa clé', () => {
  // Sans ce constat, une adresse mal saisie et un projet en pause se disaient
  // de la même façon, et aucun des deux gestes n'était désigné.
  it('une adresse qui ne répond pas est injoignable, avec la forme attendue, et rien d’autre n’est jugé', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const sonder = sonde(P, P);
    const v = await verifierProjet(CONFIG, { sonder });
    expect(constat(v, 'joignable')).toMatchObject({ statut: 'ko', libelle: 'Projet injoignable' });
    expect(constat(v, 'joignable')?.detail).toContain('https://identifiant.supabase.co');
    expect(statuts(v)).toEqual(['joignable:ko', 'cle:attente', 'base:attente', 'acces:attente', 'inscriptions:attente']);
    expect(sonder).not.toHaveBeenCalled();
  });

  it('un projet qui répond par une erreur serveur est dit « ne répond pas », avec la pause à rouvrir', async () => {
    repondre(503, { message: 'indisponible' });
    const v = await verifierProjet(CONFIG, { sonder: sonde(P, P) });
    expect(constat(v, 'joignable')).toMatchObject({ statut: 'ko', libelle: 'Le projet ne répond pas' });
    expect(constat(v, 'joignable')?.detail).toMatch(/en pause, rouvre-le depuis supabase\.com/);
  });

  it('un projet qui tarde au-delà du délai est dit « ne répond pas », pas « injoignable »', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_: string, init: RequestInit) => new Promise((_r, rejeter) => {
      init.signal?.addEventListener('abort', () => rejeter(new DOMException('Abandon', 'AbortError')));
    })));
    const attente = verifierProjet(CONFIG, { sonder: sonde(P, P) });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(constat(await attente, 'joignable')?.libelle).toBe('Le projet ne répond pas');
  });

  it('une réponse qui n’est pas celle d’un projet Supabase désigne l’adresse', async () => {
    repondre(404, { message: 'introuvable' });
    const v = await verifierProjet(CONFIG, { sonder: sonde(P, P) });
    expect(constat(v, 'joignable')).toMatchObject({ statut: 'ko', libelle: 'Projet injoignable' });
  });

  // 401 dit deux choses à la fois : le projet est là, la clé n'est pas la sienne.
  it('une clé refusée laisse le projet joignable et dit de prendre la clé anon', async () => {
    repondre(401, { message: 'Invalid API key' });
    const sonder = sonde(P, P);
    const v = await verifierProjet(CONFIG, { sonder });
    expect(statuts(v).slice(0, 3)).toEqual(['joignable:ok', 'cle:ko', 'base:attente']);
    expect(constat(v, 'cle')?.detail).toMatch(/clé publique anon, la longue qui commence par eyJ/);
    expect(sonder).not.toHaveBeenCalled();
  });

  it('une adresse en http est refusée avant tout envoi, avec notre motif', async () => {
    const appel = repondre(200, {});
    const v = await verifierProjet({ ...CONFIG, url: 'http://projet-demo.supabase.co' }, { sonder: sonde(P, P) });
    expect(appel).not.toHaveBeenCalled();
    expect(constat(v, 'joignable')).toMatchObject({ statut: 'ko', libelle: 'Adresse refusée' });
  });

  /**
   * LE CORPS EST HOSTILE. Une adresse saisie peut désigner n'importe quel
   * serveur : s'il suffisait d'y écrire un texte pour qu'il s'affiche, la page
   * dirait ce que ce serveur veut.
   */
  it('aucun texte du serveur ne passe dans les constats', async () => {
    for (const statut of [401, 404, 500]) {
      repondre(statut, { message: 'Texte du serveur', msg: 'Texte du serveur', error_description: 'Texte du serveur' });
      const v = await verifierProjet(CONFIG, { sonder: sonde(P, P) });
      for (const c of constatsDuProjet(v, TOUS)) {
        expect(`${c.libelle} ${c.detail ?? ''}`).not.toContain('Texte du serveur');
      }
    }
  });
});

describe('vérifier un projet : la clé de service', () => {
  /** Un jeton factice dont la charge dit `role`. */
  const jeton = (role: string) =>
    `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.signature`;

  // Conservée dans le navigateur, elle ferait de la page un passe-partout du projet.
  it('reconnaît la clé service_role sans l’envoyer nulle part', async () => {
    const appel = repondre(200, {});
    const v = await verifierProjet({ ...CONFIG, cleAnon: jeton('service_role') });
    expect(appel).not.toHaveBeenCalled();
    expect(constat(v, 'cle')).toMatchObject({ statut: 'ko', libelle: 'C’est la clé service_role' });
    expect(projetJoint(v)).toBe(false);
  });

  it('distingue la clé anon, la clé secrète nouvelle forme, et un texte quelconque', () => {
    expect(estCleDeService(jeton('anon'))).toBe(false);
    expect(estCleDeService(jeton('service_role'))).toBe(true);
    expect(estCleDeService('sb_secret_factice')).toBe(true);
    expect(estCleDeService('sb_publishable_factice')).toBe(false);
    expect(estCleDeService('pas.un.jeton')).toBe(false);
  });
});

describe('vérifier un projet : la base et ses règles', () => {
  const reglages = { disable_signup: false, mailer_autoconfirm: false };

  it('deux tables absentes : refaire l’étape 2, coller le script entier', async () => {
    repondre(200, reglages);
    const v = await verifierProjet(CONFIG, { sonder: sonde(ABSENTE, ABSENTE) });
    expect(constat(v, 'base')).toMatchObject({ statut: 'ko', libelle: 'Base pas encore préparée' });
    expect(constat(v, 'base')?.detail).toMatch(/Refais l’étape 2 : colle le script entier, puis Run/);
    expect(constat(v, 'acces')?.statut).toBe('attente');
    expect(projetPret(v)).toBe(false);
  });

  // Un script d'avant la mémoire du compte (lot 57) : la table des faits existe, pas l'historique.
  it('une seule des deux tables : base d’une version précédente, à réexécuter sans rien perdre', async () => {
    repondre(200, reglages);
    const v = await verifierProjet(CONFIG, { sonder: sonde(P, ABSENTE) });
    expect(constat(v, 'base')).toMatchObject({ statut: 'ko', libelle: 'Base d’une version précédente' });
    expect(constat(v, 'base')?.detail).toMatch(/il ne perd rien/);
  });

  it('les deux tables comptées à zéro : base préparée, un inconnu ne lit rien', async () => {
    repondre(200, reglages);
    const v = await verifierProjet(CONFIG, { sonder: sonde(P, P) });
    expect(statuts(v).slice(0, 4)).toEqual(['joignable:ok', 'cle:ok', 'base:ok', 'acces:ok']);
    expect(projetJoint(v)).toBe(true);
    expect(projetPret(v)).toBe(true);
  });

  it('une table lisible sans connexion est un ✗, et le projet n’est pas prêt', async () => {
    repondre(200, reglages);
    const v = await verifierProjet(CONFIG, { sonder: sonde(P, P, { statut: 'exposee', lignes: 3 }) });
    expect(constat(v, 'acces')).toMatchObject({ statut: 'ko', libelle: 'Un inconnu peut lire tes données' });
    expect(constat(v, 'acces')?.detail).toMatch(/^3 ligne\(s\) se lisent sans connexion/);
    expect(projetPret(v)).toBe(false);
  });

  // Un vert sur ce qu'on n'a pas pu compter serait pire que pas de verdict.
  it('une table qu’on n’a pas pu compter n’est jamais ✓', async () => {
    repondre(200, reglages);
    const v = await verifierProjet(CONFIG, { sonder: sonde(P, P, { statut: 'inconnu', motif: 'Le projet n’a pas répondu.' }) });
    expect(constat(v, 'acces')).toMatchObject({ statut: 'inconnu', detail: 'Le projet n’a pas répondu.' });
  });
});

describe('vérifier un projet : les inscriptions', () => {
  it('relit le réglage : ouvertes, c’est un ✗ avec la case à décocher', async () => {
    repondre(200, { disable_signup: false });
    const v = await verifierProjet(CONFIG, { sonder: sonde(P, P) });
    expect(constat(v, 'inscriptions')).toMatchObject({ statut: 'ko', libelle: 'Inscriptions encore ouvertes' });
    expect(constat(v, 'inscriptions')?.detail).toMatch(/Authentication › Sign In \/ Providers.*Allow new users to sign up/);
  });

  it('fermées : ✓', async () => {
    repondre(200, { disable_signup: true });
    expect(constat(await verifierProjet(CONFIG, { sonder: sonde(P, P) }), 'inscriptions')?.statut).toBe('ok');
  });

  // Un champ absent n'est ni ouvert ni fermé.
  it('un réglage absent ou d’un autre type n’est ni ouvert ni fermé', async () => {
    repondre(200, { disable_signup: 'true' });
    expect(constat(await verifierProjet(CONFIG, { sonder: sonde(P, P) }), 'inscriptions')?.statut).toBe('inconnu');
  });
});
