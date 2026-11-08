import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sonderAccesAnonyme, sqlProtectionFaits, sqlProtectionLegacy } from './supabase.acces';

afterEach(() => { vi.unstubAllGlobals(); });

const CONFIG = { url: 'https://exemple-demo.supabase.co', cleAnon: 'cle-anon-factice' };

function reponse(statut: number, contentRange: string | null) {
  return {
    ok: statut < 300,
    status: statut,
    headers: new Headers(contentRange === null ? {} : { 'Content-Range': contentRange }),
    // Le corps n'est jamais lu : s'il l'était, ce test le ferait échouer.
    text: async () => { throw new Error('corps lu'); },
    json: async () => { throw new Error('corps lu'); }
  };
}

function simuler(r: ReturnType<typeof reponse> | Error) {
  const appel = vi.fn(async () => {
    if (r instanceof Error) throw r;
    return r;
  });
  vi.stubGlobal('fetch', appel);
  return appel;
}

describe('sonde d’accès anonyme', () => {
  it('une table qui ne rend aucune ligne sans connexion est protégée', async () => {
    // Si « total 0 » n'était pas reconnu, l'écran n'afficherait jamais le vert.
    simuler(reponse(200, '*/0'));
    const v = await sonderAccesAnonyme(CONFIG);
    expect(v.faits).toEqual({ statut: 'protegee' });
    expect(v.legacy).toEqual({ statut: 'protegee' });
  });

  it('une table qui rend des lignes sans connexion est exposée, avec leur nombre', async () => {
    // Le cas qu'on cherche : sans lui, la fuite resterait silencieuse.
    simuler(reponse(206, '0-0/3'));
    const v = await sonderAccesAnonyme(CONFIG);
    expect(v.legacy).toEqual({ statut: 'exposee', lignes: 3 });
  });

  it('une table inexistante est dite absente, pas protégée', async () => {
    simuler(reponse(404, null));
    expect((await sonderAccesAnonyme(CONFIG)).faits).toEqual({ statut: 'absente' });
  });

  it('une clé refusée (401) ne prouve rien : inconnu, jamais protégée', async () => {
    // Traiter 401 comme « protégée » dirait « sûr » à qui a mal copié sa clé.
    simuler(reponse(401, null));
    const v = await sonderAccesAnonyme(CONFIG);
    expect(v.faits.statut).toBe('inconnu');
    if (v.faits.statut === 'inconnu') expect(v.faits.motif).toMatch(/refuse la requête anonyme/);
  });

  it('une réponse sans Content-Range est inconnue, pas un total de zéro', async () => {
    // Lire l'absence comme 0 déclarerait sûre une table que rien n'a comptée.
    simuler(reponse(200, null));
    expect((await sonderAccesAnonyme(CONFIG)).legacy.statut).toBe('inconnu');
  });

  it('un total non compté (*) est inconnu', async () => {
    simuler(reponse(200, '0-0/*'));
    expect((await sonderAccesAnonyme(CONFIG)).legacy.statut).toBe('inconnu');
  });

  it('une panne réseau est inconnue, jamais protégée', async () => {
    simuler(new TypeError('Failed to fetch'));
    const v = await sonderAccesAnonyme(CONFIG);
    expect(v.faits).toEqual({ statut: 'inconnu', motif: 'Le projet n’a pas répondu.' });
    expect(v.legacy.statut).toBe('inconnu');
  });

  it('la requête est un HEAD qui compte, avec la seule clé publique', async () => {
    // Un jeton de session ferait lire SES lignes : la sonde ne se mettrait plus
    // à la place d'un inconnu.
    const appel = simuler(reponse(200, '*/0'));
    await sonderAccesAnonyme(CONFIG);
    expect(appel).toHaveBeenCalledTimes(2);
    const urls = appel.mock.calls.map((c) => (c as unknown as [string])[0]).sort();
    expect(urls).toEqual([
      'https://exemple-demo.supabase.co/rest/v1/freel_faits?select=user_id',
      'https://exemple-demo.supabase.co/rest/v1/user_data?select=user_id'
    ]);
    for (const c of appel.mock.calls) {
      const init = (c as unknown as [string, RequestInit])[1];
      const entetes = init.headers as Record<string, string>;
      expect(init.method).toBe('HEAD');
      expect(entetes['Prefer']).toBe('count=exact');
      expect(entetes['Authorization']).toBe(`Bearer ${CONFIG.cleAnon}`);
      expect(entetes['apikey']).toBe(CONFIG.cleAnon);
    }
  });

  it('une adresse refusée n’appelle pas le réseau', async () => {
    const appel = simuler(reponse(200, '*/0'));
    const v = await sonderAccesAnonyme({ url: 'http://exemple-demo.supabase.co', cleAnon: 'x' });
    expect(appel).not.toHaveBeenCalled();
    expect(v.faits.statut).toBe('inconnu');
    expect(v.legacy.statut).toBe('inconnu');
  });

  it('la date de vérification est celle fournie', async () => {
    simuler(reponse(200, '*/0'));
    const v = await sonderAccesAnonyme(CONFIG, new Date('2026-11-08T10:00:00Z'));
    expect(v.le).toBe('2026-11-08T10:00:00.000Z');
  });
});

describe('SQL de protection', () => {
  const script = readFileSync(new URL('../../../docs/supabase.sql', import.meta.url), 'utf8');

  it('le SQL proposé pour user_data figure tel quel dans docs/supabase.sql', () => {
    // Deux textes qui divergent : l'écran proposerait une règle que le script
    // n'applique pas.
    expect(script).toContain(sqlProtectionLegacy());
  });

  it('le SQL proposé pour freel_faits figure tel quel dans docs/supabase.sql', () => {
    expect(script).toContain(sqlProtectionFaits());
  });
});
