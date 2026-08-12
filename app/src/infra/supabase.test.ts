import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ConfigSupabase, type Session, type StockageLocal,
  TABLE_FAITS, bundleDepuisLegacy, chargerDonneesLegacy, configEffective,
  ecrireConfig, ecrireSession, lireConfig, lireSession, pousserFaits,
  rafraichir, seConnecter, sessionValide, tirerFaits
} from './supabase';

const CONFIG: ConfigSupabase = { url: 'https://exemple.test', cleAnon: 'cle-anon' };

const SESSION: Session = {
  jeton: 'jeton-abc', jetonRafraichissement: 'refresh-abc',
  expireLe: Date.now() + 3_600_000, utilisateurId: 'user-1', email: 'demo@exemple.test'
};

/** Un stockage en mémoire, pour tester sans navigateur. */
function stockageMemoire(initial: Record<string, string> = {}): StockageLocal & {
  contenu: Record<string, string>;
} {
  const contenu = { ...initial };
  return {
    contenu,
    getItem: (c) => (c in contenu ? contenu[c] as string : null),
    setItem: (c, v) => { contenu[c] = v; },
    removeItem: (c) => { delete contenu[c]; }
  };
}

function repondre(corps: unknown, statut = 200) {
  return vi.fn().mockResolvedValue({
    ok: statut >= 200 && statut < 300,
    status: statut,
    text: async () => (corps === null ? '' : JSON.stringify(corps))
  });
}

afterEach(() => { vi.unstubAllGlobals(); });
beforeEach(() => { vi.unstubAllGlobals(); });

describe('connexion', () => {
  it('rend une session exploitable', async () => {
    vi.stubGlobal('fetch', repondre({
      access_token: 'jeton', refresh_token: 'refresh', expires_in: 3600,
      user: { id: 'user-1', email: 'demo@exemple.test' }
    }));

    const r = await seConnecter(CONFIG, 'demo@exemple.test', 'motdepasse');
    expect(r.statut).toBe('ok');
    if (r.statut !== 'ok') return;
    expect(r.valeur).toMatchObject({ jeton: 'jeton', utilisateurId: 'user-1' });
    expect(r.valeur.expireLe).toBeGreaterThan(Date.now());
  });

  // « Invalid login credentials » n'aide pas à savoir quoi corriger.
  it('traduit un refus d’identifiants', async () => {
    vi.stubGlobal('fetch', repondre({ error_description: 'Invalid login credentials' }, 400));
    const r = await seConnecter(CONFIG, 'demo@exemple.test', 'faux');
    expect(r.statut).toBe('erreur');
    if (r.statut === 'erreur') expect(r.motif).toMatch(/mot de passe incorrect/i);
  });

  it('distingue une panne réseau d’un refus du serveur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const r = await seConnecter(CONFIG, 'a@b.test', 'x');
    expect(r.statut).toBe('erreur');
    if (r.statut === 'erreur') expect(r.motif).toMatch(/injoignable/i);
  });

  it('envoie la clé anonyme et le bon chemin', async () => {
    const appel = repondre({ access_token: 'j', user: { id: 'u', email: 'e' } });
    vi.stubGlobal('fetch', appel);
    await seConnecter(CONFIG, 'a@b.test', 'x');

    const [url, options] = appel.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://exemple.test/auth/v1/token?grant_type=password');
    expect((options.headers as Record<string, string>).apikey).toBe('cle-anon');
  });

  // Le mot de passe ne doit jamais être conservé : seuls les jetons le sont.
  it('ne conserve jamais le mot de passe', async () => {
    vi.stubGlobal('fetch', repondre({ access_token: 'j', user: { id: 'u', email: 'e' } }));
    const r = await seConnecter(CONFIG, 'a@b.test', 'secret-du-compte');
    if (r.statut !== 'ok') throw new Error('connexion attendue');
    expect(JSON.stringify(r.valeur)).not.toContain('secret-du-compte');
  });
});

describe('durée de vie de la session', () => {
  // Sans renouvellement, l'application se déconnecterait au bout d'une heure
  // au milieu d'une saisie.
  it('se déclare invalide avant l’expiration, pas après', () => {
    const maintenant = 1_000_000;
    expect(sessionValide({ ...SESSION, expireLe: maintenant + 300_000 }, maintenant)).toBe(true);
    // Dans la minute qui précède l'expiration, un appel en cours pourrait
    // échouer : la session est déjà considérée périmée.
    expect(sessionValide({ ...SESSION, expireLe: maintenant + 30_000 }, maintenant)).toBe(false);
    expect(sessionValide({ ...SESSION, expireLe: maintenant - 1 }, maintenant)).toBe(false);
  });

  it('renouvelle avec le jeton de rafraîchissement', async () => {
    const appel = repondre({
      access_token: 'nouveau', refresh_token: 'nouveau-refresh', expires_in: 3600,
      user: { id: 'user-1', email: 'demo@exemple.test' }
    });
    vi.stubGlobal('fetch', appel);

    const r = await rafraichir(CONFIG, SESSION);
    expect(r.statut).toBe('ok');
    if (r.statut === 'ok') expect(r.valeur.jeton).toBe('nouveau');
    expect((appel.mock.calls[0] as [string])[0]).toContain('grant_type=refresh_token');
  });

  it('refuse de renouveler sans jeton de rafraîchissement', async () => {
    const r = await rafraichir(CONFIG, { ...SESSION, jetonRafraichissement: '' });
    expect(r.statut).toBe('erreur');
  });
});

describe('chargement des données du compte', () => {
  it('lit les colonnes de l’ancienne application', async () => {
    const appel = repondre([{
      updated_at: '2026-08-01T10:00:00Z',
      company: { nom: 'Démo' }, missions: [], clients: [], treasury: {}, ir_config: {}
    }]);
    vi.stubGlobal('fetch', appel);

    const r = await chargerDonneesLegacy(CONFIG, SESSION);
    expect(r.statut).toBe('ok');
    if (r.statut === 'ok') expect(r.valeur?.updated_at).toBe('2026-08-01T10:00:00Z');

    const [url, options] = appel.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('user_id=eq.user-1');
    // Le jeton de session, pas la clé anonyme : les règles RLS s'appuient
    // dessus pour ne rendre que les lignes du compte.
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer jeton-abc');
  });

  // Un compte neuf n'est pas une erreur, et ne doit pas s'afficher comme telle.
  it('rend null quand le compte n’a rien enregistré', async () => {
    vi.stubGlobal('fetch', repondre([]));
    const r = await chargerDonneesLegacy(CONFIG, SESSION);
    expect(r.statut).toBe('ok');
    if (r.statut === 'ok') expect(r.valeur).toBeNull();
  });

  it('traduit une session expirée en invitation à se reconnecter', async () => {
    vi.stubGlobal('fetch', repondre({ message: 'JWT expired' }, 401));
    const r = await chargerDonneesLegacy(CONFIG, SESSION);
    expect(r.statut).toBe('erreur');
    if (r.statut === 'erreur') expect(r.motif).toMatch(/reconnectez-vous/i);
  });

  // Sans quoi l'application dirait deux choses différentes selon que la
  // donnée vient du réseau ou du navigateur.
  it('reconstitue le bundle attendu par la migration', () => {
    const bundle = bundleDepuisLegacy({
      company: { nom: 'Démo' }, missions: [1], clients: [2], treasury: { soldeInitial: 5 },
      ir_config: { '2026': {} }, updated_at: null
    });
    expect(bundle).toEqual({
      c: { nom: 'Démo' }, m: [1], cl: [2], t: { soldeInitial: 5 }, ir: { '2026': {} }
    });
  });
});

/**
 * Une réponse par appel, dans l'ordre. Nécessaire dès qu'une opération en
 * enchaîne plusieurs : une écriture refusée relit l'état distant derrière.
 */
function repondreEnSuite(...reponses: readonly (readonly [unknown, number])[]) {
  let n = 0;
  return vi.fn().mockImplementation(() => {
    const r = reponses[Math.min(n++, reponses.length - 1)] as readonly [unknown, number];
    const [corps, statut] = r;
    return Promise.resolve({
      ok: statut >= 200 && statut < 300,
      status: statut,
      text: async () => (corps === null ? '' : JSON.stringify(corps))
    });
  });
}

const LIGNE = {
  version: 4, schema: 1, faits: { version: 1, clients: [] },
  maj_le: '2026-08-12T09:00:00Z'
};

describe('lecture des faits du compte', () => {
  it('lit la table de la nouvelle application, pas celle de l’ancienne', async () => {
    const appel = repondre([LIGNE]);
    vi.stubGlobal('fetch', appel);
    await tirerFaits(CONFIG, SESSION);

    const [url] = appel.mock.calls[0] as [string];
    expect(url).toContain(TABLE_FAITS);
    // La table de l'ancienne application reste lue ailleurs, jamais ici — et
    // surtout jamais écrite : c'est ce qui la garde utilisable.
    expect(url).not.toContain('user_data');
    expect(url).toContain('user_id=eq.user-1');
  });

  it('rend la version et l’horodatage avec les faits', async () => {
    vi.stubGlobal('fetch', repondre([LIGNE]));
    const r = await tirerFaits(CONFIG, SESSION);
    expect(r.statut).toBe('ok');
    if (r.statut !== 'ok') return;
    expect(r.valeur).toMatchObject({ version: 4, schema: 1, majLe: '2026-08-12T09:00:00Z' });
  });

  it('rend null sur un compte encore vide', async () => {
    vi.stubGlobal('fetch', repondre([]));
    const r = await tirerFaits(CONFIG, SESSION);
    expect(r.statut === 'ok' && r.valeur).toBeNull();
  });

  // Une version illisible ne doit pas devenir une version plausible : elle ne
  // correspondra à aucune ligne, et la prochaine écriture sera refusée.
  it('ne fabrique pas une version quand elle est absente', async () => {
    vi.stubGlobal('fetch', repondre([{ ...LIGNE, version: null }]));
    const r = await tirerFaits(CONFIG, SESSION);
    expect(r.statut === 'ok' && r.valeur?.version).toBe(0);
  });

  it('indique quoi faire quand la table n’existe pas encore', async () => {
    vi.stubGlobal('fetch', repondre({ message: 'relation does not exist' }, 404));
    const r = await tirerFaits(CONFIG, SESSION);
    expect(r.statut).toBe('erreur');
    if (r.statut === 'erreur') expect(r.motif).toContain('docs/supabase.sql');
  });
});

describe('écriture des faits sur le compte', () => {
  it('crée la ligne à la première écriture', async () => {
    const appel = repondreEnSuite([[{ ...LIGNE, version: 1 }], 201]);
    vi.stubGlobal('fetch', appel);

    const r = await pousserFaits(CONFIG, SESSION, { version: 1 }, 1, null);
    expect(r.statut).toBe('ok');

    const [url, options] = appel.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(TABLE_FAITS);
    expect(options.method).toBe('POST');
    const corps = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(corps['version']).toBe(1);
    expect(corps['user_id']).toBe('user-1');
  });

  /**
   * LE POINT DUR.
   *
   * Le filtre `version=eq.<attendue>` doit voyager dans la requête : c'est le
   * serveur qui vérifie, en une opération atomique. Une vérification faite
   * dans l'application — lire, comparer, écrire — laisserait entre la lecture
   * et l'écriture une fenêtre où l'autre appareil se glisse.
   */
  it('conditionne la mise à jour à la version lue', async () => {
    const appel = repondreEnSuite([[{ ...LIGNE, version: 5 }], 200]);
    vi.stubGlobal('fetch', appel);

    await pousserFaits(CONFIG, SESSION, { version: 1 }, 1, 4);

    const [url, options] = appel.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('PATCH');
    expect(url).toContain('version=eq.4');
    expect(url).toContain('user_id=eq.user-1');
    // Le compteur avance, sinon deux écritures successives se croiseraient
    // sans que la seconde s'en aperçoive.
    expect(JSON.parse(String(options.body))['version']).toBe(5);
  });

  /**
   * Zéro ligne modifiée signifie que la version distante n'est plus celle
   * qu'on a lue : quelqu'un a écrit entre-temps. Traiter ce cas comme un
   * succès effacerait son travail en silence — c'est exactement la perte que
   * le compteur existe pour empêcher.
   */
  it('refuse l’écriture quand le compte a bougé', async () => {
    const appel = repondreEnSuite(
      [[], 200],                        // le PATCH ne touche aucune ligne
      [[{ ...LIGNE, version: 9 }], 200] // relecture de l'état distant
    );
    vi.stubGlobal('fetch', appel);

    const r = await pousserFaits(CONFIG, SESSION, { version: 1 }, 1, 4);
    expect(r.statut).toBe('conflit');
    if (r.statut !== 'conflit') return;
    // Le refus dit AUSSI ce qu'il y a en face : sans cela, l'utilisateur
    // choisirait entre deux états dont il n'en connaît qu'un.
    expect(r.distant?.version).toBe(9);
  });

  it('traite une ligne préexistante comme un conflit, pas comme une panne', async () => {
    const appel = repondreEnSuite(
      [{ code: '23505', message: 'duplicate key value' }, 409],
      [[LIGNE], 200]
    );
    vi.stubGlobal('fetch', appel);

    const r = await pousserFaits(CONFIG, SESSION, { version: 1 }, 1, null);
    expect(r.statut).toBe('conflit');
    if (r.statut === 'conflit') expect(r.distant?.version).toBe(4);
  });

  // Un conflit dont on ne peut pas relire l'autre côté reste un conflit :
  // le dégrader en erreur inviterait à réessayer, donc à écraser.
  it('reste un conflit même quand la relecture échoue', async () => {
    const appel = repondreEnSuite([[], 200], [{ message: 'JWT expired' }, 401]);
    vi.stubGlobal('fetch', appel);

    const r = await pousserFaits(CONFIG, SESSION, { version: 1 }, 1, 4);
    expect(r.statut).toBe('conflit');
    if (r.statut === 'conflit') expect(r.distant).toBeNull();
  });

  it('distingue une panne réseau d’un conflit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const r = await pousserFaits(CONFIG, SESSION, { version: 1 }, 1, 4);
    expect(r.statut).toBe('erreur');
  });

  // La condition de cohabitation : l'ancienne application doit rester
  // utilisable, donc sa table ne doit jamais recevoir d'écriture.
  it('n’écrit jamais dans la table de l’ancienne application', async () => {
    const appel = repondreEnSuite([[LIGNE], 200]);
    vi.stubGlobal('fetch', appel);
    await pousserFaits(CONFIG, SESSION, { version: 1 }, 1, 4);

    for (const [url, options] of appel.mock.calls as [string, RequestInit][]) {
      if (options.method !== undefined && options.method !== 'GET') {
        expect(url).not.toContain('user_data');
      }
    }
  });

  it('envoie le jeton de session, pas la clé anonyme', async () => {
    const appel = repondreEnSuite([[LIGNE], 200]);
    vi.stubGlobal('fetch', appel);
    await pousserFaits(CONFIG, SESSION, { version: 1 }, 1, 4);

    const [, options] = appel.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer jeton-abc');
  });
});

describe('conservation locale', () => {
  it('relit une session écrite', () => {
    const s = stockageMemoire();
    ecrireSession(s, SESSION);
    expect(lireSession(s)?.utilisateurId).toBe('user-1');
  });

  it('efface la session à la déconnexion', () => {
    const s = stockageMemoire();
    ecrireSession(s, SESSION);
    ecrireSession(s, null);
    expect(lireSession(s)).toBeNull();
  });

  it('ignore une session corrompue plutôt que d’échouer au démarrage', () => {
    expect(lireSession(stockageMemoire({ 'freel.session.supabase.v1': '{ cassé' }))).toBeNull();
  });

  it('normalise la barre oblique finale de l’URL', () => {
    const s = stockageMemoire();
    ecrireConfig(s, { url: 'https://exemple.test/', cleAnon: 'k' });
    expect(lireConfig(s)?.url).toBe('https://exemple.test');
  });

  // Sans configuration de build, c'est la saisie de l'utilisateur qui vaut.
  it('retombe sur la configuration saisie quand le build n’en porte pas', () => {
    const s = stockageMemoire();
    expect(configEffective(s)).toBeNull();
    ecrireConfig(s, CONFIG);
    expect(configEffective(s)).toMatchObject({ url: 'https://exemple.test' });
  });
});
