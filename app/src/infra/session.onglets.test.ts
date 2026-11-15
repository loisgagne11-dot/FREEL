/**
 * Deux onglets, une session (lot 59, constat S9).
 *
 * Le serveur n'accepte qu'UNE fois un jeton de renouvellement : c'est ce que
 * le faux serveur ci-dessous reproduit. Deux onglets qui renouvellent en même
 * temps avec le même jeton se déconnectaient l'un l'autre.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ConfigSupabase, type Session, type StockageLocal, type Verrou,
  CLE_SESSION, ecrireSession, lireSession, reprendreSession
} from './supabase';

const CONFIG: ConfigSupabase = { url: 'https://exemple.test', cleAnon: 'cle-anon' };

const EXPIREE: Session = {
  jeton: 'jeton-1', jetonRafraichissement: 'renouv-1',
  expireLe: Date.now() - 1000, utilisateurId: 'user-1', email: 'demo@exemple.test'
};

function stockageMemoire(): StockageLocal & { readonly contenu: Map<string, string> } {
  const contenu = new Map<string, string>();
  return {
    contenu,
    getItem: (c) => contenu.get(c) ?? null,
    setItem: (c, v) => { contenu.set(c, v); },
    removeItem: (c) => { contenu.delete(c); }
  };
}

/** Un serveur à rotation : chaque jeton de renouvellement ne sert qu'une fois. */
function serveurARotation() {
  const consommes = new Set<string>();
  let suivant = 1;
  const appels = vi.fn(async (_url: string, init?: RequestInit) => {
    // La réponse arrive plus tard : les deux onglets ont le temps de partir.
    await new Promise((r) => setTimeout(r, 5));
    const { refresh_token: jeton } = JSON.parse(String(init?.body)) as { refresh_token: string };
    if (consommes.has(jeton)) {
      return { ok: false, status: 400, text: async () => JSON.stringify({ error_description: 'Invalid Refresh Token: Already Used' }) };
    }
    consommes.add(jeton);
    suivant++;
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify({
        access_token: `jeton-${suivant}`, refresh_token: `renouv-${suivant}`, expires_in: 3600,
        user: { id: 'user-1', email: 'demo@exemple.test' }
      })
    };
  });
  return appels;
}

/** Un verrou exclusif en file, comme `navigator.locks` entre onglets. */
function verrouEnFile(): Verrou {
  let queue: Promise<unknown> = Promise.resolve();
  return <T>(_nom: string, travail: () => Promise<T>): Promise<T> => {
    const tour = queue.then(travail);
    queue = tour.catch(() => undefined);
    return tour;
  };
}

const sansVerrou: Verrou = (_nom, travail) => travail();

afterEach(() => { vi.unstubAllGlobals(); });

describe('deux onglets sur une session expirée', () => {
  it('un seul renouvelle ; les deux restent connectés', async () => {
    const serveur = serveurARotation();
    vi.stubGlobal('fetch', serveur);
    const stockage = stockageMemoire();
    ecrireSession(stockage, EXPIREE);
    const verrou = verrouEnFile();

    const [onglet1, onglet2] = await Promise.all([
      reprendreSession(CONFIG, stockage, verrou),
      reprendreSession(CONFIG, stockage, verrou)
    ]);

    expect(serveur).toHaveBeenCalledTimes(1);
    expect(onglet1?.jeton).toBe('jeton-2');
    expect(onglet2?.jeton).toBe('jeton-2');
    expect(lireSession(stockage)?.jetonRafraichissement).toBe('renouv-2');
  });

  // Navigateur sans API de verrous : le second onglet est refusé, mais ne
  // doit pas effacer la session neuve que le premier vient d'écrire.
  it('sans verrou, le refus du second n’efface pas la session du premier', async () => {
    vi.stubGlobal('fetch', serveurARotation());
    const stockage = stockageMemoire();
    ecrireSession(stockage, EXPIREE);

    const [onglet1, onglet2] = await Promise.all([
      reprendreSession(CONFIG, stockage, sansVerrou),
      reprendreSession(CONFIG, stockage, sansVerrou)
    ]);

    expect(onglet1?.jeton).toBe('jeton-2');
    expect(onglet2).toBeNull();
    expect(lireSession(stockage)?.jetonRafraichissement).toBe('renouv-2');
  });

  it('un refus de la session qu’on a présentée l’efface', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => '{}' }));
    const stockage = stockageMemoire();
    ecrireSession(stockage, EXPIREE);
    expect(await reprendreSession(CONFIG, stockage, sansVerrou)).toBeNull();
    expect(lireSession(stockage)).toBeNull();
  });

  it('une panne réseau ne l’efface pas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('hors ligne')));
    const stockage = stockageMemoire();
    ecrireSession(stockage, EXPIREE);
    expect(await reprendreSession(CONFIG, stockage, sansVerrou)).toBeNull();
    expect(lireSession(stockage)).not.toBeNull();
  });
});

describe('une session conservée se lit en entier, ou pas du tout', () => {
  const avec = (modif: Record<string, unknown>): StockageLocal => {
    const s = stockageMemoire();
    s.setItem(CLE_SESSION, JSON.stringify({ ...EXPIREE, expireLe: Date.now() + 3_600_000, ...modif }));
    return s;
  };

  it('accepte une session complète', () => {
    expect(lireSession(avec({}))).not.toBeNull();
  });

  it.each([
    ['sans échéance', { expireLe: undefined }],
    ['à l’échéance en texte', { expireLe: '2099-01-01' }],
    ['à l’échéance nulle', { expireLe: 0 }],
    ['sans jeton de renouvellement', { jetonRafraichissement: undefined }],
    ['au jeton vide', { jeton: '' }],
    ['sans adresse', { email: null }]
  ])('refuse une session %s', (_, modif) => {
    expect(lireSession(avec(modif))).toBeNull();
  });

  it('ne recopie que les champs connus', () => {
    expect(Object.keys(lireSession(avec({ intrus: 1 })) ?? {})).not.toContain('intrus');
  });
});
