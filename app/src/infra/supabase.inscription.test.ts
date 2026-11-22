import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLE_LIEN, MOTIF_AUTRE_NAVIGATEUR, changerMotDePasse, creerCompte, defiPkce, demanderLienDeReinitialisation,
  echangerCode, genererVerifieur, lireLienEnAttente, lireRetour, motifDuRetour
} from './supabase.inscription';

afterEach(() => { vi.unstubAllGlobals(); });

const CONFIG = { url: 'https://projet-demo.supabase.co', cleAnon: 'eyJ.factice.anon' };
const RETOUR = 'https://freel.exemple.test/app/';
const SESSION = {
  jeton: 'jeton', jetonRafraichissement: 'r', expireLe: Date.now() + 3_600_000,
  utilisateurId: 'user-1', email: 'camille@exemple.test'
};
const CORPS_SESSION = {
  access_token: 'jeton-neuf', refresh_token: 'r2', expires_in: 3600,
  user: { id: 'user-1', email: 'camille@exemple.test' }
};
/** Un vérifieur factice, de la forme attendue (43 caractères). */
const VERIFIEUR = 'a'.repeat(43);

function stockage(initial: Record<string, string> = {}) {
  const contenu: Record<string, string> = { ...initial };
  return {
    contenu,
    getItem: (c: string) => contenu[c] ?? null,
    setItem: (c: string, v: string) => { contenu[c] = v; },
    removeItem: (c: string) => { delete contenu[c]; }
  };
}

function repondre(statut: number, corps: unknown) {
  const appel = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: statut < 300, status: statut, text: async () => JSON.stringify(corps)
  }));
  vi.stubGlobal('fetch', appel);
  return appel;
}

const requete = (appel: ReturnType<typeof repondre>) => {
  const [url, init] = appel.mock.calls[0] as [string, RequestInit];
  return { url, methode: init.method, corps: JSON.parse(String(init.body ?? 'null')) as Record<string, unknown>, init };
};

describe('PKCE : le secret et son empreinte', () => {
  // L'exemple publié de la RFC 7636 (annexe B) : si l'empreinte divergeait, le
  // projet refuserait chaque échange, et aucun lien ne ramènerait jamais.
  it('l’empreinte S256 est celle de la RFC 7636', async () => {
    expect(await defiPkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .toEqual({ defi: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', methode: 's256' });
  });

  it('le secret fait 43 caractères sûrs pour une adresse', () => {
    const v = genererVerifieur(new Uint8Array(32).fill(255));
    expect(v).toHaveLength(43);
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('sans de quoi hacher, le secret part en clair (« plain ») plutôt que de bloquer', async () => {
    expect(await defiPkce(VERIFIEUR, null)).toEqual({ defi: VERIFIEUR, methode: 'plain' });
  });
});

describe('créer son compte', () => {
  it('demande l’inscription avec l’empreinte et l’adresse de retour, et garde le secret ici', async () => {
    const appel = repondre(200, { id: 'user-1', email: 'camille@exemple.test', identities: [{ id: 'i' }] });
    const local = stockage();
    const issue = await creerCompte(CONFIG, 'camille@exemple.test', 'motdepasse', local, RETOUR);

    expect(issue).toEqual({ statut: 'confirmation' });
    const r = requete(appel);
    expect(r.url).toBe(`${CONFIG.url}/auth/v1/signup?redirect_to=${encodeURIComponent(RETOUR)}`);
    expect(r.methode).toBe('POST');
    expect(r.corps).toMatchObject({ email: 'camille@exemple.test', password: 'motdepasse', code_challenge_method: 's256' });
    // Le secret reste ici ; seule son empreinte est partie.
    const lien = lireLienEnAttente(local);
    expect(lien?.motif).toBe('inscription');
    expect(r.corps['code_challenge']).toBe((await defiPkce(lien?.verifieur ?? '')).defi);
    expect(JSON.stringify(r.corps)).not.toContain(lien?.verifieur);
  });

  it('un projet sans confirmation rend la session tout de suite, et le secret est oublié', async () => {
    repondre(200, CORPS_SESSION);
    const local = stockage();
    const issue = await creerCompte(CONFIG, 'camille@exemple.test', 'motdepasse', local, RETOUR);
    expect(issue).toMatchObject({ statut: 'connecte', session: { jeton: 'jeton-neuf', email: 'camille@exemple.test' } });
    expect(local.contenu[CLE_LIEN]).toBeUndefined();
  });

  /**
   * Quand le projet demande une confirmation, une adresse déjà inscrite ne se
   * dit pas par une erreur : Supabase rend un utilisateur factice, sans
   * identité. Sans ce cas, l'écran annoncerait un courriel qui ne part jamais.
   */
  it('une adresse déjà inscrite se reconnaît, en erreur comme en utilisateur sans identité', async () => {
    repondre(200, { id: 'factice', identities: [] });
    expect(await creerCompte(CONFIG, 'camille@exemple.test', 'motdepasse', stockage(), RETOUR))
      .toEqual({ statut: 'deja-inscrit' });
    repondre(422, { error_code: 'user_already_exists', msg: 'User already registered' });
    expect(await creerCompte(CONFIG, 'camille@exemple.test', 'motdepasse', stockage(), RETOUR))
      .toEqual({ statut: 'deja-inscrit' });
  });

  it('un mot de passe trop court et des inscriptions fermées se disent, dans nos mots', async () => {
    repondre(422, { error_code: 'weak_password', msg: 'Texte du serveur' });
    const court = await creerCompte(CONFIG, 'camille@exemple.test', '123', stockage(), RETOUR);
    expect(court).toMatchObject({ statut: 'refus', motif: expect.stringMatching(/trop faible.*six caractères/) });

    repondre(422, { error_code: 'signup_disabled', msg: 'Texte du serveur' });
    const ferme = await creerCompte(CONFIG, 'camille@exemple.test', 'motdepasse', stockage(), RETOUR);
    expect(ferme).toMatchObject({ statut: 'refus', motif: expect.stringMatching(/inscriptions sont fermées/) });
    expect(JSON.stringify([court, ferme])).not.toContain('Texte du serveur');
  });

  it('un refus inconnu ne montre que son code HTTP, jamais le texte du serveur', async () => {
    const local = stockage();
    repondre(400, { error_code: 'code_que_personne_ne_connait', msg: 'Texte du serveur' });
    const issue = await creerCompte(CONFIG, 'camille@exemple.test', 'motdepasse', local, RETOUR);
    expect(issue).toEqual({ statut: 'refus', motif: 'Le projet a refusé la demande (erreur 400).' });
    expect(local.contenu[CLE_LIEN]).toBeUndefined();
  });
});

describe('mot de passe oublié', () => {
  it('demande le lien avec l’empreinte et l’adresse de retour ; le secret est marqué « récupération »', async () => {
    const appel = repondre(200, {});
    const local = stockage();
    expect(await demanderLienDeReinitialisation(CONFIG, 'camille@exemple.test', local, RETOUR)).toEqual({ statut: 'envoye' });
    const r = requete(appel);
    expect(r.url).toBe(`${CONFIG.url}/auth/v1/recover?redirect_to=${encodeURIComponent(RETOUR)}`);
    expect(r.corps).toMatchObject({ email: 'camille@exemple.test', code_challenge_method: 's256' });
    expect(lireLienEnAttente(local)?.motif).toBe('recuperation');
  });

  it('trop de courriels demandés se dit, et le secret inutile est oublié', async () => {
    repondre(429, { error_code: 'over_email_send_rate_limit' });
    const local = stockage();
    const issue = await demanderLienDeReinitialisation(CONFIG, 'camille@exemple.test', local, RETOUR);
    expect(issue).toMatchObject({ statut: 'refus', motif: expect.stringMatching(/Trop de courriels/) });
    expect(local.contenu[CLE_LIEN]).toBeUndefined();
  });
});

describe('le retour du lien', () => {
  const enAttente = (motif: string) => stockage({ [CLE_LIEN]: JSON.stringify({ verifieur: VERIFIEUR, motif }) });

  it('échange le code et le secret gardé ici contre une session, puis oublie le secret', async () => {
    const appel = repondre(200, CORPS_SESSION);
    const local = enAttente('recuperation');
    const issue = await echangerCode(CONFIG, 'code-du-lien-1234', local);

    expect(issue).toMatchObject({ statut: 'session', motif: 'recuperation', session: { jeton: 'jeton-neuf' } });
    const r = requete(appel);
    expect(r.url).toBe(`${CONFIG.url}/auth/v1/token?grant_type=pkce`);
    expect(r.corps).toEqual({ auth_code: 'code-du-lien-1234', code_verifier: VERIFIEUR });
    expect(local.contenu[CLE_LIEN]).toBeUndefined();
  });

  // Ouvert dans un autre navigateur, le code ne vaut rien : on ne l'envoie pas, on le dit.
  it('sans secret dans ce navigateur, rien ne part et l’écran dit quoi faire', async () => {
    const appel = repondre(200, CORPS_SESSION);
    expect(await echangerCode(CONFIG, 'code-du-lien-1234', stockage()))
      .toEqual({ statut: 'refus', motif: MOTIF_AUTRE_NAVIGATEUR, reessayable: false });
    expect(appel).not.toHaveBeenCalled();
  });

  it('un code invalide ou expiré est refusé pour de bon, et le secret oublié', async () => {
    repondre(404, { error_code: 'flow_state_not_found', msg: 'Texte du serveur' });
    const local = enAttente('recuperation');
    const issue = await echangerCode(CONFIG, 'code-du-lien-1234', local);
    expect(issue).toEqual({
      statut: 'refus', reessayable: false, motif: 'Ce lien ne vaut plus : il a expiré, ou a déjà servi. Redemande-le.'
    });
    expect(local.contenu[CLE_LIEN]).toBeUndefined();
  });

  it('un projet qui ne répond pas laisse réessayer avec le même code', async () => {
    repondre(503, {});
    const local = enAttente('inscription');
    expect(await echangerCode(CONFIG, 'code-du-lien-1234', local)).toMatchObject({ statut: 'refus', reessayable: true });
    expect(lireLienEnAttente(local)?.motif).toBe('inscription');
  });

  it('lit le code, ou le seul code d’erreur — jamais la description venue du réseau', () => {
    expect(lireRetour(new URLSearchParams('code=0b6f2c1e-4d1a-4a6b-9a5e-1f2e3d4c5b6a')))
      .toEqual({ code: '0b6f2c1e-4d1a-4a6b-9a5e-1f2e3d4c5b6a' });
    expect(lireRetour(new URLSearchParams('error=access_denied&error_code=otp_expired&error_description=Texte+du+serveur')))
      .toEqual({ erreur: 'otp_expired' });
    expect(lireRetour(new URLSearchParams('code=<script>'))).toEqual({ erreur: 'illisible' });
    expect(motifDuRetour('otp_expired')).toMatch(/expiré/);
  });
});

describe('choisir le nouveau mot de passe', () => {
  it('envoie le mot de passe avec la session ouverte par le lien', async () => {
    const appel = repondre(200, { id: 'user-1' });
    expect(await changerMotDePasse(CONFIG, SESSION, 'nouveau-mot')).toEqual({ statut: 'ok' });
    const r = requete(appel);
    expect(r.url).toBe(`${CONFIG.url}/auth/v1/user`);
    expect(r.methode).toBe('PUT');
    expect(r.corps).toEqual({ password: 'nouveau-mot' });
    expect((r.init.headers as Record<string, string>)['Authorization']).toBe('Bearer jeton');
  });

  it('le même mot de passe qu’avant est refusé, dans nos mots', async () => {
    repondre(422, { error_code: 'same_password', msg: 'Texte du serveur' });
    expect(await changerMotDePasse(CONFIG, SESSION, 'ancien'))
      .toEqual({ statut: 'refus', motif: 'C’est déjà ton mot de passe : choisis-en un autre.' });
  });
});
