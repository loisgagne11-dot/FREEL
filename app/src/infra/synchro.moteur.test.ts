/**
 * Deux appareils, un compte simulé (lot 42).
 *
 * Le faux serveur ci-dessous tient ce que le vrai garantit : une seule ligne
 * par compte, l'écriture filtrée sur `version = attendue` (zéro ligne
 * touchée sinon), le passage n → n + 1, l'état remplacé rangé dans
 * l'historique, et les clés rendues dans un autre ordre (`jsonb`). Chaque
 * « appareil » a son stockage, son dossier, son moteur ; un seul `fetch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VERSION_SCHEMA, faitsVides, type Faits } from '../state/schema';
import { completerFaits, motifRefusExterieur } from '../state/schema.migrations';
import { type MoteurSynchro, creerMoteur } from './synchro.moteur';
import { type EtatSynchroAppareil } from './synchro.etat';
import { lireBase, noterSynchronisation } from './synchro.appareil';
import { CLE_CONFIG, CLE_SESSION, type StockageLocal, type Verrou, lireConfig } from './supabase';

const CONFIG = { url: 'https://projet-demo.supabase.co', cleAnon: 'cle-anon-factice' };
const UTILISATEUR = 'user-1';

const AVEC_DONNEES: Faits = {
  ...faitsVides(),
  entreprise: { ...faitsVides().entreprise, nom: 'Atelier Exemple' },
  clients: [{ id: 'c1', nom: 'Client exemple' }] as never
};

const avecClient = (f: Faits, id: string, nom: string): Faits =>
  ({ ...f, clients: [...f.clients, { id, nom }] as never });

const DEMONSTRATION: Faits = {
  ...AVEC_DONNEES,
  entreprise: { ...AVEC_DONNEES.entreprise, nom: 'Atelier de démonstration', siret: '000 000 000 00000' }
};

/** Les clés dans l'autre sens, comme une colonne `jsonb` les rend. */
function rangerAutrement(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(rangerAutrement);
  if (typeof v === 'object' && v !== null) {
    return Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, rangerAutrement(x)]));
  }
  return v;
}

interface Ligne { version: number; schema: number; faits: unknown; maj_le: string }

function serveur() {
  const etat = {
    ligne: null as Ligne | null,
    historique: [] as Ligne[],
    /** Aucune réponse : le réseau est coupé (ou le projet en pause). */
    coupe: false,
    /** L'écriture s'applique, puis la réponse se perd en chemin. */
    perdreLaReponse: false,
    /** Appelé après chaque lecture : un autre appareil peut écrire « entre-temps ». */
    apresLecture: null as (() => void) | null,
    /** Le renouvellement de session refusé (jeton révoqué). */
    refuserRenouvellement: false,
    appels: [] as { methode: string; chemin: string; keepalive: boolean }[]
  };
  const reponse = (status: number, corps: unknown) => ({
    ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(corps)
  });
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const methode = init?.method ?? 'GET';
    etat.appels.push({ methode, chemin: u.pathname, keepalive: init?.keepalive === true });
    // La réponse prend un peu de temps, comme sur le réseau : sans cela, un
    // cycle entier tiendrait entre deux minuteurs, et deux onglets ne se
    // croiseraient jamais — le verrou ne serait jamais mis à l'épreuve.
    await new Promise((r) => setTimeout(r, 2));
    if (etat.coupe) throw new TypeError('Failed to fetch');
    if (u.pathname === '/auth/v1/token') {
      if (etat.refuserRenouvellement) return reponse(400, { error_description: 'Invalid Refresh Token' });
      return reponse(200, {
        access_token: 'jeton-neuf', refresh_token: 'renouv-neuf', expires_in: 3600,
        user: { id: UTILISATEUR, email: 'demo@exemple.test' }
      });
    }
    if (u.pathname !== '/rest/v1/freel_faits') return reponse(404, {});
    const corps = init?.body === undefined ? null : JSON.parse(String(init.body)) as Record<string, unknown>;
    const rendre = (l: Ligne) => ({ ...l, faits: rangerAutrement(l.faits) });
    if (methode === 'GET') {
      const lu = etat.ligne === null ? [] : [rendre(etat.ligne)];
      etat.apresLecture?.();
      etat.apresLecture = null;
      return reponse(200, lu);
    }
    if (methode === 'POST') {
      if (etat.ligne !== null) return reponse(409, { message: 'duplicate key' });
      etat.ligne = { version: 1, schema: corps!['schema'] as number, faits: corps!['faits'], maj_le: corps!['maj_le'] as string };
      return reponse(201, [rendre(etat.ligne)]);
    }
    if (methode === 'PATCH') {
      const attendue = Number(u.searchParams.get('version')?.replace('eq.', ''));
      if (etat.ligne === null || etat.ligne.version !== attendue) return reponse(200, []);
      if (corps!['version'] !== attendue + 1) return reponse(400, { message: 'freel : la version passe de n à n + 1' });
      etat.historique.push(etat.ligne);
      etat.ligne = { version: attendue + 1, schema: corps!['schema'] as number, faits: corps!['faits'], maj_le: corps!['maj_le'] as string };
      if (etat.perdreLaReponse) { etat.perdreLaReponse = false; throw new TypeError('connexion perdue'); }
      return reponse(200, [rendre(etat.ligne)]);
    }
    return reponse(405, {});
  });
  /** Ce qu'un autre appareil aurait écrit. */
  const ecrireAilleurs = (faits: unknown, schema: number = VERSION_SCHEMA) => {
    if (etat.ligne !== null) etat.historique.push(etat.ligne);
    etat.ligne = {
      version: (etat.ligne?.version ?? 0) + 1, schema, faits: JSON.parse(JSON.stringify(faits)),
      maj_le: '2026-11-22T08:30:00.000Z'
    };
  };
  const compter = (methode: string) => etat.appels.filter((a) => a.methode === methode && a.chemin === '/rest/v1/freel_faits').length;
  return { etat, fetch, ecrireAilleurs, compter };
}

function memoire(): StockageLocal {
  const contenu = new Map<string, string>();
  return {
    getItem: (c) => contenu.get(c) ?? null,
    setItem: (c, v) => { contenu.set(c, v); },
    removeItem: (c) => { contenu.delete(c); }
  };
}

/** Un verrou exclusif par nom, comme `navigator.locks` : les onglets passent un par un. */
function verrouParNom(): Verrou {
  const files = new Map<string, Promise<unknown>>();
  return <T>(nom: string, travail: () => Promise<T>): Promise<T> => {
    const tour = (files.get(nom) ?? Promise.resolve()).then(travail);
    files.set(nom, tour.catch(() => undefined));
    return tour;
  };
}

interface Appareil {
  readonly moteur: MoteurSynchro;
  readonly stockage: StockageLocal;
  readonly etats: EtatSynchroAppareil[];
  readonly faits: Faits;
  dernier(): EtatSynchroAppareil | undefined;
  modifier(f: (avant: Faits) => Faits): void;
  enLigne: boolean;
  saisie: boolean;
  pret: boolean;
}

/**
 * Un appareil relié au compte. `synchronise` : il a déjà synchronisé à la
 * version 1 du compte, avec ces faits — la situation du propriétaire après
 * sa première liaison.
 */
function appareil(
  options: {
    readonly faits?: Faits; readonly synchronise?: boolean; readonly stockage?: StockageLocal;
    readonly partage?: { faits: Faits; ecouteurs: Set<(q: 'faits' | 'pret') => void> };
    readonly verrou?: Verrou; readonly expiree?: boolean;
  } = {}
): Appareil {
  const stockage = options.stockage ?? memoire();
  stockage.setItem(CLE_CONFIG, JSON.stringify(CONFIG));
  stockage.setItem(CLE_SESSION, JSON.stringify({
    jeton: 'jeton', jetonRafraichissement: 'renouv',
    expireLe: options.expiree === true ? Date.now() - 1000 : Date.now() + 3_600_000,
    utilisateurId: UTILISATEUR, email: 'demo@exemple.test'
  }));
  // Le dossier peut être partagé : deux onglets d'un même navigateur lisent le même disque.
  const dossier = options.partage ?? { faits: options.faits ?? AVEC_DONNEES, ecouteurs: new Set() };
  if (options.synchronise !== false && options.stockage === undefined) {
    noterSynchronisation(stockage, UTILISATEUR, 1, dossier.faits, new Date(Date.now() - 3_600_000));
  }
  const etats: EtatSynchroAppareil[] = [];
  const ici = { enLigne: true, saisie: false, pret: true };
  const moteur = creerMoteur({
    stockage,
    config: () => lireConfig(stockage),
    faits: () => dossier.faits,
    pret: () => ici.pret,
    // La même validation que `adopterFaitsDistants` : refusé ce que le schéma refuse.
    adopter: async (brut) => {
      const motif = motifRefusExterieur(brut);
      if (motif !== null) return motif;
      dossier.faits = completerFaits(brut);
      for (const e of dossier.ecouteurs) e('faits');
      return null;
    },
    ecouter: (rappel) => { dossier.ecouteurs.add(rappel); return () => { dossier.ecouteurs.delete(rappel); }; },
    verrou: options.verrou ?? verrouParNom(),
    enLigne: () => ici.enLigne,
    visible: () => true,
    saisieEnCours: () => ici.saisie,
    maintenant: () => new Date(),
    publier: (e) => { etats.push(e); },
    delais: { ecriture: 10, saisie: 10, reessai: [20], fraicheur: 0, session: 0 }
  });
  return {
    moteur, stockage, etats,
    get faits() { return dossier.faits; },
    dernier: () => etats.at(-1),
    modifier: (f) => {
      dossier.faits = f(dossier.faits);
      for (const e of dossier.ecouteurs) e('faits');
    },
    get enLigne() { return ici.enLigne; },
    set enLigne(v) { ici.enLigne = v; },
    get saisie() { return ici.saisie; },
    set saisie(v) { ici.saisie = v; },
    get pret() { return ici.pret; },
    set pret(v) { ici.pret = v; for (const e of dossier.ecouteurs) e('pret'); }
  };
}

let s: ReturnType<typeof serveur>;
const demarres: MoteurSynchro[] = [];

beforeEach(() => {
  s = serveur();
  vi.stubGlobal('fetch', s.fetch);
  // Le compte, tel que les deux appareils l'ont vu à leur dernière synchronisation.
  s.etat.ligne = { version: 1, schema: VERSION_SCHEMA, faits: JSON.parse(JSON.stringify(AVEC_DONNEES)), maj_le: '2026-11-22T07:00:00.000Z' };
});

afterEach(() => {
  for (const m of demarres.splice(0)) m.arreter();
  vi.unstubAllGlobals();
});

function demarrer(a: Appareil): Appareil {
  a.moteur.demarrer();
  demarres.push(a.moteur);
  return a;
}

const nomsDesClients = (f: Faits) => f.clients.map((c) => c.nom);

describe('deux appareils sur un même compte', () => {
  /**
   * LE BESOIN DU PROPRIÉTAIRE. Modifié au téléphone, l'ordinateur s'ouvre et
   * montre la même chose — sans « Enregistrer » d'un côté ni « Charger » de
   * l'autre. Si l'envoi ou la réception sautait, il retomberait sur les deux
   * gestes à la main, et sur l'oubli de l'un des deux.
   */
  it('A modifie, B s’ouvre : B a la donnée', async () => {
    const a = demarrer(appareil());
    await vi.waitFor(() => expect(a.dernier()?.phase).toBe('a-jour'));
    a.modifier((f) => avecClient(f, 'c2', 'Client du téléphone'));
    await vi.waitFor(() => expect(s.etat.ligne?.version).toBe(2));
    await vi.waitFor(() => expect(a.dernier()?.phase).toBe('a-jour'));

    const b = demarrer(appareil());
    await vi.waitFor(() => expect(nomsDesClients(b.faits)).toContain('Client du téléphone'));
    expect(b.dernier()?.phase).toBe('a-jour');
    expect(lireBase(b.stockage, UTILISATEUR)?.version).toBe(2);
    // Rien n'est reparti de B : il a reçu, il n'avait rien à envoyer.
    expect(s.compter('PATCH')).toBe(1);
  });

  /**
   * AUCUNE FUSION SILENCIEUSE. Les deux ont changé depuis la dernière
   * synchronisation : le second à parler ne doit RIEN écraser. Si la règle
   * sautait, la saisie du premier disparaîtrait du compte sans un mot.
   */
  it('A et B modifient : B demande, et le compte garde ce que A a envoyé', async () => {
    const a = appareil();
    const b = appareil();
    a.modifier((f) => avecClient(f, 'c2', 'Saisi sur A'));
    b.modifier((f) => avecClient(f, 'c3', 'Saisi sur B'));
    await a.moteur.synchroniser('ecriture');
    const etat = await b.moteur.synchroniser('ecriture');

    expect(etat.phase).toBe('a-choisir');
    expect(etat.phase === 'a-choisir' && etat.pourquoi).toBe('les-deux-ont-change');
    expect(nomsDesClients(completerFaits(s.etat.ligne?.faits))).toEqual(['Client exemple', 'Saisi sur A']);
    expect(nomsDesClients(b.faits)).toEqual(['Client exemple', 'Saisi sur B']);
    expect(s.compter('PATCH')).toBe(1);
  });

  /**
   * « Garder ce que j'ai ici » envoie PAR-DESSUS, et l'état écarté part dans
   * les états précédents du serveur : le filet qui reste si l'on s'est trompé.
   */
  it('trancher « garder ici » envoie par-dessus ; l’état écarté reste dans l’historique', async () => {
    const a = appareil();
    const b = appareil();
    a.modifier((f) => avecClient(f, 'c2', 'Saisi sur A'));
    b.modifier((f) => avecClient(f, 'c3', 'Saisi sur B'));
    await a.moteur.synchroniser('ecriture');
    await b.moteur.synchroniser('ecriture');

    const etat = await b.moteur.trancher('garder-ici');
    expect(etat.phase).toBe('a-jour');
    expect(nomsDesClients(completerFaits(s.etat.ligne?.faits))).toEqual(['Client exemple', 'Saisi sur B']);
    expect(nomsDesClients(completerFaits(s.etat.historique.at(-1)?.faits))).toEqual(['Client exemple', 'Saisi sur A']);
    expect(lireBase(b.stockage, UTILISATEUR)?.version).toBe(3);
  });

  it('trancher « prendre le compte » remplace ici, sans rien envoyer', async () => {
    const a = appareil();
    const b = appareil();
    a.modifier((f) => avecClient(f, 'c2', 'Saisi sur A'));
    b.modifier((f) => avecClient(f, 'c3', 'Saisi sur B'));
    await a.moteur.synchroniser('ecriture');
    await b.moteur.synchroniser('ecriture');

    const etat = await b.moteur.trancher('prendre-compte');
    expect(etat.phase).toBe('a-jour');
    expect(nomsDesClients(b.faits)).toEqual(['Client exemple', 'Saisi sur A']);
    expect(s.compter('PATCH')).toBe(1);
  });

  // La réponse portait sur un état qui n'existe plus : on repose la question
  // sur le nouvel état, plutôt qu'écraser un troisième appareil.
  it('si le compte a encore bougé avant la réponse, la question est reposée', async () => {
    const a = appareil();
    const b = appareil();
    a.modifier((f) => avecClient(f, 'c2', 'Saisi sur A'));
    b.modifier((f) => avecClient(f, 'c3', 'Saisi sur B'));
    await a.moteur.synchroniser('ecriture');
    await b.moteur.synchroniser('ecriture');
    s.ecrireAilleurs(avecClient(AVEC_DONNEES, 'c4', 'Saisi sur C'));

    const etat = await b.moteur.trancher('garder-ici');
    expect(etat.phase).toBe('a-choisir');
    expect(etat.phase === 'a-choisir' && etat.distant.version).toBe(3);
    expect(nomsDesClients(completerFaits(s.etat.ligne?.faits))).toContain('Saisi sur C');
  });

  /**
   * LE COMPTE BOUGE ENTRE LA LECTURE ET L'ÉCRITURE. Le filtre de version fait
   * refuser l'envoi par le serveur ; le moteur relit et repasse par la règle.
   * Une vérification côté application aurait laissé la fenêtre ouverte.
   */
  it('un envoi refusé parce que le compte a bougé entre-temps n’écrase rien', async () => {
    const b = appareil();
    b.modifier((f) => avecClient(f, 'c3', 'Saisi sur B'));
    s.etat.apresLecture = () => s.ecrireAilleurs(avecClient(AVEC_DONNEES, 'c2', 'Saisi sur A'));

    const etat = await b.moteur.synchroniser('ecriture');
    expect(etat.phase).toBe('a-choisir');
    expect(nomsDesClients(completerFaits(s.etat.ligne?.faits))).toContain('Saisi sur A');
    expect(nomsDesClients(completerFaits(s.etat.ligne?.faits))).not.toContain('Saisi sur B');
  });
});

describe('hors ligne', () => {
  /**
   * LA MODIFICATION NE SE PERD PAS, ELLE ATTEND. Hors ligne, elle reste sur le
   * disque et la pastille le dit ; au retour du réseau, elle part. Si l'envoi
   * ne se relançait pas, elle resterait ici jusqu'à la prochaine modification.
   */
  it('une modification faite hors ligne part au retour du réseau', async () => {
    const b = demarrer(appareil());
    await vi.waitFor(() => expect(b.dernier()?.phase).toBe('a-jour'));
    b.enLigne = false;
    b.modifier((f) => avecClient(f, 'c3', 'Saisi dans le train'));
    await vi.waitFor(() => expect(b.dernier()).toEqual({ phase: 'hors-ligne', aEnvoyer: true }));
    expect(s.compter('PATCH')).toBe(0);

    b.enLigne = true;
    await b.moteur.synchroniser('reseau');
    expect(nomsDesClients(completerFaits(s.etat.ligne?.faits))).toContain('Saisi dans le train');
    expect(b.dernier()?.phase).toBe('a-jour');
  });

  // Le navigateur se croit en ligne, le serveur ne répond pas (wifi sans
  // Internet, projet en pause) : on réessaie seul, sans attendre un geste.
  it('une coupure que le navigateur ne voit pas se réessaie seule', async () => {
    const b = demarrer(appareil());
    await vi.waitFor(() => expect(b.dernier()?.phase).toBe('a-jour'));
    s.etat.coupe = true;
    b.modifier((f) => avecClient(f, 'c3', 'Saisi sans réseau'));
    await vi.waitFor(() => expect(b.dernier()).toEqual({ phase: 'hors-ligne', aEnvoyer: true }));
    s.etat.coupe = false;
    await vi.waitFor(() => expect(nomsDesClients(completerFaits(s.etat.ligne?.faits))).toContain('Saisi sans réseau'));
  });

  /**
   * L'ENVOI A RÉUSSI, LA RÉPONSE S'EST PERDUE. Au retour, le compte est en
   * avance et dit la même chose que l'appareil : la règle aligne. Si elle ne
   * le faisait pas, on demanderait de choisir entre deux états identiques.
   */
  it('une réponse perdue après un envoi réussi ne fabrique pas de conflit', async () => {
    const b = appareil();
    b.modifier((f) => avecClient(f, 'c3', 'Saisi sur B'));
    s.etat.perdreLaReponse = true;
    expect((await b.moteur.synchroniser('ecriture')).phase).toBe('hors-ligne');
    expect(s.etat.ligne?.version).toBe(2);

    const etat = await b.moteur.synchroniser('retour');
    expect(etat.phase).toBe('a-jour');
    expect(lireBase(b.stockage, UTILISATEUR)?.version).toBe(2);
    expect(s.compter('PATCH')).toBe(1);
  });
});

describe('ce que le compte peut porter de travers', () => {
  /**
   * UN COMPTE PLUS RÉCENT NE SE RABOTE PAS (invariant n°5). Ni adopté — on
   * perdrait ce que cette version ne lit pas —, ni écrasé, même avec une
   * modification d'ici. Si le refus sautait, une vieille version restée sur
   * un téléphone effacerait le travail de la nouvelle.
   */
  it('un schéma distant postérieur est refusé : rien d’adopté, rien d’envoyé', async () => {
    const recent = { ...JSON.parse(JSON.stringify(AVEC_DONNEES)), version: VERSION_SCHEMA + 1, nouveauChamp: [1] };
    s.ecrireAilleurs(recent, VERSION_SCHEMA + 1);
    const b = appareil();
    expect(await b.moteur.synchroniser('ouverture')).toEqual({ phase: 'mettre-a-jour', schema: VERSION_SCHEMA + 1 });
    expect(b.faits).toBe(AVEC_DONNEES);

    b.modifier((f) => avecClient(f, 'c3', 'Saisi sur B'));
    expect((await b.moteur.synchroniser('ecriture')).phase).toBe('mettre-a-jour');
    expect(s.compter('PATCH')).toBe(0);
    expect((s.etat.ligne?.faits as { nouveauChamp?: unknown }).nouveauChamp).toEqual([1]);
  });

  // Le réseau est hostile : un bloc abîmé n'entre pas, même plus récent.
  it('un compte illisible n’est pas adopté', async () => {
    s.ecrireAilleurs({ ...JSON.parse(JSON.stringify(AVEC_DONNEES)), recettes: 'pas une liste' });
    const b = appareil();
    expect(await b.moteur.synchroniser('ouverture')).toEqual({ phase: 'anomalie', pourquoi: 'compte-illisible' });
    expect(b.faits).toBe(AVEC_DONNEES);
  });

  /**
   * EFFACÉ AILLEURS. Renvoyer d'ici défairait un effacement voulu — le droit
   * à l'effacement annulé par un appareil resté fermé.
   */
  it('un compte effacé ailleurs ne se recrée pas tout seul', async () => {
    s.etat.ligne = null;
    const b = appareil();
    b.modifier((f) => avecClient(f, 'c3', 'Saisi sur B'));
    expect(await b.moteur.synchroniser('ecriture')).toEqual({ phase: 'anomalie', pourquoi: 'compte-efface' });
    expect(s.compter('POST') + s.compter('PATCH')).toBe(0);
  });
});

describe('ce que l’appareil ne fait pas tout seul', () => {
  /**
   * LA PREMIÈRE LIAISON RESTE À L'ÉCRAN COMPTE. Un appareil qui n'a jamais
   * synchronisé ne regarde même pas le compte : sans base, il ne saurait pas
   * de quel côté on a changé.
   */
  it('un appareil jamais synchronisé ne fait aucune requête', async () => {
    const b = appareil({ synchronise: false });
    expect(await b.moteur.synchroniser('ouverture')).toEqual({ phase: 'inactif' });
    b.modifier((f) => avecClient(f, 'c3', 'Saisi sur B'));
    expect(await b.moteur.synchroniser('ecriture')).toEqual({ phase: 'inactif' });
    expect(s.fetch).not.toHaveBeenCalled();
  });

  /**
   * PAS SOUS LES DOIGTS. Le compte a changé, un formulaire est ouvert : on
   * attend qu'il se ferme. Si l'attente sautait, l'enregistrement de la fiche
   * partirait sur un dossier que l'utilisateur n'a pas vu arriver.
   */
  it('une adoption attend que le formulaire ouvert se ferme', async () => {
    s.ecrireAilleurs(avecClient(AVEC_DONNEES, 'c2', 'Saisi sur A'));
    const b = appareil();
    b.saisie = true;
    expect(await b.moteur.synchroniser('retour')).toEqual({ phase: 'attente-saisie' });
    expect(nomsDesClients(b.faits)).toEqual(['Client exemple']);

    b.saisie = false;
    await vi.waitFor(() => expect(nomsDesClients(b.faits)).toContain('Saisi sur A'));
    expect(b.dernier()?.phase).toBe('a-jour');
  });

  /**
   * UN DOSSIER PAS ENCORE LU SE LIRAIT VIDE. Tant que le magasin n'a pas
   * chargé le disque, le moteur attend : parti trop tôt, il verrait « cet
   * appareil a été vidé » et demanderait de choisir — ou, sans le garde-fou
   * du vide, effacerait le compte.
   */
  it('rien ne part avant que le dossier local soit chargé', async () => {
    s.ecrireAilleurs(avecClient(AVEC_DONNEES, 'c2', 'Saisi sur A'));
    const b = appareil();
    b.pret = false;
    b.moteur.demarrer();
    demarres.push(b.moteur);
    await new Promise((r) => setTimeout(r, 20));
    expect(s.fetch).not.toHaveBeenCalled();
    b.pret = true;
    await vi.waitFor(() => expect(nomsDesClients(b.faits)).toContain('Saisi sur A'));
  });

  // On la charge pour montrer l'application : ni envoyée, ni remplacée par
  // les vrais chiffres au retour sur l'onglet.
  it('la démonstration ne part pas et n’est pas remplacée', async () => {
    const b = appareil();
    b.modifier(() => DEMONSTRATION);
    expect(await b.moteur.synchroniser('ecriture')).toEqual({ phase: 'demonstration' });
    s.ecrireAilleurs(avecClient(AVEC_DONNEES, 'c2', 'Saisi sur A'));
    expect(await b.moteur.synchroniser('retour')).toEqual({ phase: 'demonstration' });
    expect(b.faits).toBe(DEMONSTRATION);
    expect(s.compter('PATCH')).toBe(0);
  });

  // « Repartir de zéro » promet de ne pas toucher au compte.
  it('un appareil vidé ne vide pas le compte : il demande', async () => {
    const b = appareil();
    b.modifier(() => faitsVides());
    const etat = await b.moteur.synchroniser('ecriture');
    expect(etat.phase === 'a-choisir' && etat.pourquoi).toBe('appareil-vide');
    expect(s.compter('PATCH')).toBe(0);
  });

  /**
   * SESSION REFUSÉE POUR DE BON : la pastille dit « Reconnecte-toi », et rien
   * n'est perdu — la modification reste « à envoyer » derrière la reconnexion.
   */
  it('une session refusée demande de se reconnecter, sans rien perdre', async () => {
    s.etat.refuserRenouvellement = true;
    const b = appareil({ expiree: true });
    b.modifier((f) => avecClient(f, 'c3', 'Saisi sur B'));
    expect(await b.moteur.synchroniser('ecriture')).toEqual({ phase: 'reconnecter' });
    expect(nomsDesClients(b.faits)).toContain('Saisi sur B');
    expect(lireBase(b.stockage, UTILISATEUR)?.version).toBe(1);
    expect(s.compter('PATCH')).toBe(0);
  });

  it('une session expirée se renouvelle, et l’envoi part', async () => {
    const b = appareil({ expiree: true });
    b.modifier((f) => avecClient(f, 'c3', 'Saisi sur B'));
    expect((await b.moteur.synchroniser('ecriture')).phase).toBe('a-jour');
    expect(s.compter('PATCH')).toBe(1);
  });
});

describe('deux onglets du même navigateur', () => {
  /**
   * UN SEUL TRAVAILLE. Les deux voient la même modification (même disque) ;
   * le second, passé le verrou, relit la base que le premier vient d'écrire
   * et n'a plus rien à envoyer. Sans relecture, la même modification partirait
   * deux fois — et la seconde, refusée, créerait un faux conflit.
   */
  it('une modification vue par deux onglets ne part qu’une fois', async () => {
    const stockage = memoire();
    noterSynchronisation(stockage, UTILISATEUR, 1, AVEC_DONNEES, new Date(Date.now() - 3_600_000));
    const partage = { faits: AVEC_DONNEES, ecouteurs: new Set<(q: 'faits' | 'pret') => void>() };
    const verrou = verrouParNom();
    const onglet1 = demarrer(appareil({ stockage, partage, verrou }));
    const onglet2 = demarrer(appareil({ stockage, partage, verrou }));
    await vi.waitFor(() => expect(onglet2.dernier()?.phase).toBe('a-jour'));

    onglet1.modifier((f) => avecClient(f, 'c3', 'Saisi dans un onglet'));
    await vi.waitFor(() => expect(onglet1.dernier()?.phase).toBe('a-jour'));
    await vi.waitFor(() => expect(onglet2.dernier()?.phase).toBe('a-jour'));
    expect(s.compter('PATCH')).toBe(1);
    // Deux lectures à l'ouverture, une avant l'envoi : le second onglet, passé
    // le verrou, n'a même pas eu à relire le compte.
    expect(s.compter('GET')).toBe(3);
    expect(nomsDesClients(completerFaits(s.etat.ligne?.faits))).toContain('Saisi dans un onglet');
  });
});

describe('en quittant', () => {
  /**
   * L'onglet se ferme dans les trois secondes qui suivent une saisie : la
   * modification part tout de suite, par une requête qui survit à la page.
   */
  it('une modification pas encore partie est envoyée en `keepalive`', async () => {
    const b = demarrer(appareil());
    await vi.waitFor(() => expect(b.dernier()?.phase).toBe('a-jour'));
    b.modifier((f) => avecClient(f, 'c3', 'Saisi avant de fermer'));
    b.moteur.partir();
    await vi.waitFor(() => expect(s.etat.ligne?.version).toBe(2));
    expect(s.etat.appels.find((x) => x.methode === 'PATCH')?.keepalive).toBe(true);
    expect(nomsDesClients(completerFaits(s.etat.ligne?.faits))).toContain('Saisi avant de fermer');
  });

  // Le vide et la démonstration demandent une décision, qu'on ne prend pas
  // sans avoir lu le compte — et en partant, on n'a pas le temps de le lire.
  it('en quittant, ni le vide ni la démonstration ne partent', () => {
    const b = demarrer(appareil());
    b.modifier(() => DEMONSTRATION);
    b.moteur.partir();
    b.modifier(() => faitsVides());
    b.moteur.partir();
    expect(s.compter('PATCH')).toBe(0);
  });
});
