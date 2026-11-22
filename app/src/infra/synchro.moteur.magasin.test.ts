/**
 * Le moteur branché sur le VRAI magasin (lot 42).
 *
 * `synchro.moteur.test.ts` fait tourner deux appareils sur des dossiers en
 * mémoire. Ici, l'appareil qui reçoit est le magasin de l'application : ce
 * qui vient du compte passe par `adopterFaitsDistants` — validation du schéma,
 * copie de côté, écriture sur le disque —, et une saisie faite par une
 * écriture ordinaire du magasin part toute seule. Si le moteur contournait le
 * magasin, ou si l'écoute du magasin ne le réveillait pas, c'est ici que ça se
 * verrait.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { euros } from '../domain/types';
import { CLE_STOCKAGE, VERSION_SCHEMA, faitsVides, type Faits } from '../state/schema';
import { instantaneAvantRemplacement, useFaits } from '../state/store';
import { type MoteurSynchro, creerMoteur, portsDuMagasin } from './synchro.moteur';
import { lireBase, noterSynchronisation } from './synchro.appareil';
import { CLE_CONFIG, CLE_SESSION, lireConfig, verrouDuNavigateur } from './supabase';

const UTILISATEUR = 'user-1';

const AVEC_DONNEES: Faits = {
  ...faitsVides(),
  entreprise: { ...faitsVides().entreprise, nom: 'Atelier Exemple' },
  clients: [{ id: 'c1', nom: 'Client exemple' }] as never
};

/** Le stockage du navigateur : le magasin, la session et la base y vivent ensemble. */
function navigateur() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; }
  };
}

function serveur(ligne: { version: number; schema: number; faits: unknown }) {
  const etat = { ligne: { ...ligne, maj_le: '2026-11-22T08:30:00.000Z' }, patchs: 0 };
  const repondre = (corps: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(corps) });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    if ((init?.method ?? 'GET') === 'GET') return repondre([etat.ligne]);
    const attendue = Number(u.searchParams.get('version')?.replace('eq.', ''));
    if (etat.ligne.version !== attendue) return repondre([]);
    const corps = JSON.parse(String(init?.body)) as { faits: unknown; schema: number };
    etat.patchs++;
    etat.ligne = { version: attendue + 1, schema: corps.schema, faits: corps.faits, maj_le: '2026-11-22T09:41:00.000Z' };
    return repondre([etat.ligne]);
  }));
  return etat;
}

let moteur: MoteurSynchro | null = null;

function relier(stockage: ReturnType<typeof navigateur>): MoteurSynchro {
  stockage.setItem(CLE_STOCKAGE, JSON.stringify(AVEC_DONNEES));
  stockage.setItem(CLE_CONFIG, JSON.stringify({ url: 'https://projet-demo.supabase.co', cleAnon: 'cle-anon-factice' }));
  stockage.setItem(CLE_SESSION, JSON.stringify({
    jeton: 'jeton', jetonRafraichissement: 'renouv', expireLe: Date.now() + 3_600_000,
    utilisateurId: UTILISATEUR, email: 'demo@exemple.test'
  }));
  useFaits.getState().initialiser(stockage);
  noterSynchronisation(stockage, UTILISATEUR, 1, useFaits.getState().faits, new Date(Date.now() - 3_600_000));
  moteur = creerMoteur({
    stockage,
    config: () => lireConfig(stockage),
    ...portsDuMagasin(),
    verrou: verrouDuNavigateur,
    enLigne: () => true,
    visible: () => true,
    saisieEnCours: () => false,
    maintenant: () => new Date(),
    publier: () => undefined,
    delais: { ecriture: 10, fraicheur: 0 }
  });
  return moteur;
}

beforeEach(() => {
  useFaits.setState({ faits: faitsVides(), chargement: { phase: 'initial' }, saisiesEcartees: 0 });
});

afterEach(() => {
  moteur?.arreter();
  moteur = null;
  vi.unstubAllGlobals();
});

describe('le moteur et le magasin de l’application', () => {
  /**
   * B S'OUVRE ET A LA DONNÉE — par la porte du magasin : sur le disque, et
   * avec la copie de ce qu'elle remplace (« Revenir à l'état d'avant »). Une
   * adoption qui écrirait l'état sans passer par là disparaîtrait au
   * rechargement, ou remplacerait sans filet.
   */
  it('ce que le compte apporte est adopté par le magasin, écrit, et l’état d’avant gardé', async () => {
    const recu = { ...AVEC_DONNEES, clients: [...AVEC_DONNEES.clients, { id: 'c2', nom: 'Client du téléphone' }] };
    serveur({ version: 2, schema: VERSION_SCHEMA, faits: JSON.parse(JSON.stringify(recu)) });
    const stockage = navigateur();
    const m = relier(stockage);

    expect((await m.synchroniser('ouverture')).phase).toBe('a-jour');
    expect(useFaits.getState().faits.clients.map((c) => c.nom)).toContain('Client du téléphone');
    expect(stockage.getItem(CLE_STOCKAGE)).toContain('Client du téléphone');
    expect(instantaneAvantRemplacement()?.brut).not.toContain('Client du téléphone');
    expect(lireBase(stockage, UTILISATEUR)?.version).toBe(2);
  });

  // La validation du magasin est la dernière porte : un schéma plus récent ne
  // la franchit pas, même si la règle l'avait laissé passer.
  it('un compte d’un schéma plus récent ne touche ni au magasin ni au disque', async () => {
    serveur({ version: 2, schema: VERSION_SCHEMA + 1, faits: { ...JSON.parse(JSON.stringify(AVEC_DONNEES)), version: VERSION_SCHEMA + 1 } });
    const stockage = navigateur();
    const m = relier(stockage);
    const avant = stockage.getItem(CLE_STOCKAGE);

    expect((await m.synchroniser('ouverture')).phase).toBe('mettre-a-jour');
    expect(stockage.getItem(CLE_STOCKAGE)).toBe(avant);
    expect(useFaits.getState().faits.clients).toHaveLength(1);
  });

  /**
   * UNE ÉCRITURE ORDINAIRE DU MAGASIN RÉVEILLE LE MOTEUR. Si l'écoute ne
   * marchait pas, rien ne partirait jamais tout seul : il faudrait revenir à
   * « Enregistrer » à la main, le geste que ce lot supprime.
   */
  it('une saisie du magasin part toute seule, et l’adoption ne repart pas', async () => {
    const compte = serveur({ version: 1, schema: VERSION_SCHEMA, faits: JSON.parse(JSON.stringify(AVEC_DONNEES)) });
    const m = relier(navigateur());
    m.demarrer();
    expect((await m.synchroniser('manuel')).phase).toBe('a-jour');

    useFaits.getState().definirReserve(euros(4200));
    await vi.waitFor(() => expect(compte.patchs).toBe(1));
    expect((compte.ligne.faits as { reserve: number }).reserve).toBe(4200);

    // Ce qui vient du compte n'est pas une modification d'ici : l'adopter ne
    // doit pas le renvoyer, sinon chaque appareil réécrirait le compte à
    // chaque ouverture, et remplirait ses vingt états précédents de copies.
    compte.ligne = { ...compte.ligne, version: 3, faits: { ...JSON.parse(JSON.stringify(AVEC_DONNEES)), reserve: 9000 } };
    await m.synchroniser('retour');
    expect(useFaits.getState().faits.reserve).toBe(9000);
    await new Promise((r) => setTimeout(r, 40));
    expect(compte.patchs).toBe(1);
  });
});
