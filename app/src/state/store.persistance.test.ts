/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { euros } from '../domain/types';
import { CLE_STOCKAGE, VERSION_SCHEMA, type Recette, faitsVides } from './schema';
import { instantaneAvantRemplacement, useFaits } from './store';

/** Un stockage en mémoire qu'on peut remplir — le quota, sans navigateur. */
function stockageEssai(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  let plein = false;
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (plein) throw new DOMException('quota', 'QuotaExceededError');
      m.set(k, v);
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    remplir: () => { plein = true; },
    liberer: () => { plein = false; },
    contenu: () => m.get(CLE_STOCKAGE) ?? null,
    ecrireCommeUnAutreOnglet: (v: string) => { m.set(CLE_STOCKAGE, v); }
  };
}

const recetteDeLAutreOnglet = {
  id: 'r-autre', numero: '2026-001', clientNom: 'Client démo', libelle: 'Prestation',
  montant: euros(1000), emiseLe: null, encaisseeLe: null, modeReglement: null
} as unknown as Recette;

const bloc = (modif: Record<string, unknown> = {}) =>
  JSON.stringify({ ...faitsVides(), ...modif });

beforeEach(() => {
  localStorage.clear();
  useFaits.setState({ faits: faitsVides(), chargement: { phase: 'initial' }, saisiesEcartees: 0 });
});
afterEach(() => { vi.restoreAllMocks(); });

/**
 * UN QUOTA ATTEINT EN COURS DE SESSION SE DIT.
 *
 * Si la règle sautait, l'échec d'écriture serait avalé : l'écran dirait que
 * tout va bien, et tout ce qu'on saisit ensuite disparaîtrait à la fermeture
 * de l'onglet.
 */
describe('échec d’écriture', () => {
  it('passe en « sans persistance » au premier échec, puis s’en relève', () => {
    const s = stockageEssai({ [CLE_STOCKAGE]: bloc() });
    useFaits.getState().initialiser(s);
    expect(useFaits.getState().chargement.phase).toBe('pret');

    s.remplir();
    useFaits.getState().definirReserve(euros(200));
    const pendant = useFaits.getState().chargement;
    expect(pendant.phase).toBe('sans-persistance');
    expect(pendant.phase === 'sans-persistance' && pendant.motif).toMatch(/plein/);
    // La saisie reste juste en mémoire : seule la conservation a échoué.
    expect(useFaits.getState().faits.reserve).toBe(200);

    s.liberer();
    useFaits.getState().definirReserve(euros(300));
    expect(useFaits.getState().chargement.phase).toBe('pret');
    expect(JSON.parse(s.contenu() ?? '{}').reserve).toBe(300);
  });

  // L'ancienne détection écrivait pour tester : plein, elle échouait, et
  // l'application partait VIDE en parlant de navigation privée.
  it('montre les données d’un stockage plein au démarrage, et le dit', () => {
    localStorage.setItem(CLE_STOCKAGE, bloc({ recettes: [recetteDeLAutreOnglet] }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    useFaits.getState().initialiser();

    expect(useFaits.getState().faits.recettes).toHaveLength(1);
    const etat = useFaits.getState().chargement;
    expect(etat.phase === 'sans-persistance' && etat.motif).toMatch(/plein/);
  });
});

/**
 * DEUX ONGLETS NE S'EFFACENT PLUS L'UN L'AUTRE.
 *
 * Si la règle sautait, l'onglet resté sur un état ancien réécrirait tout le
 * compte à sa première saisie : ce que l'autre venait d'enregistrer
 * disparaîtrait, et deux factures pourraient porter le même numéro.
 */
describe('deux onglets', () => {
  it('laisse gagner l’autre onglet et signale la saisie écartée', () => {
    const s = stockageEssai({ [CLE_STOCKAGE]: bloc() });
    useFaits.getState().initialiser(s);

    const ecritParLAutre = bloc({ recettes: [recetteDeLAutreOnglet] });
    s.ecrireCommeUnAutreOnglet(ecritParLAutre);
    useFaits.getState().definirReserve(euros(500));

    expect(s.contenu()).toBe(ecritParLAutre);
    expect(useFaits.getState().faits.recettes).toHaveLength(1);
    expect(useFaits.getState().faits.reserve).not.toBe(500);
    expect(useFaits.getState().saisiesEcartees).toBe(1);

    // L'onglet est resynchronisé : la saisie suivante s'enregistre.
    useFaits.getState().definirReserve(euros(600));
    expect(JSON.parse(s.contenu() ?? '{}').reserve).toBe(600);
    expect(JSON.parse(s.contenu() ?? '{}').recettes).toHaveLength(1);
  });

  it('se met à jour quand l’autre onglet écrit', () => {
    localStorage.setItem(CLE_STOCKAGE, bloc());
    useFaits.getState().initialiser();

    window.dispatchEvent(new StorageEvent('storage', {
      key: CLE_STOCKAGE,
      newValue: bloc({ recettes: [recetteDeLAutreOnglet] }),
      storageArea: localStorage
    }));
    expect(useFaits.getState().faits.recettes).toHaveLength(1);
  });

  // Une version plus récente ouverte à côté : continuer d'écrire depuis
  // celle-ci raboterait les champs qu'elle ne connaît pas.
  it('cesse d’écrire quand l’autre onglet est d’une version plus récente', () => {
    const avant = bloc();
    localStorage.setItem(CLE_STOCKAGE, avant);
    useFaits.getState().initialiser();

    const recent = bloc({ version: VERSION_SCHEMA + 1 });
    localStorage.setItem(CLE_STOCKAGE, recent);
    window.dispatchEvent(new StorageEvent('storage', {
      key: CLE_STOCKAGE, newValue: recent, storageArea: localStorage
    }));
    const etat = useFaits.getState().chargement;
    expect(etat.phase === 'sans-persistance' && etat.motif).toMatch(/Recharge/);

    useFaits.getState().definirReserve(euros(700));
    expect(localStorage.getItem(CLE_STOCKAGE)).toBe(recent);
  });
});

/**
 * REMPLACER TOUT GARDE UNE COPIE DE CE QUI PART.
 *
 * Si la règle sautait, restaurer le mauvais fichier ou charger le compte par
 * erreur écraserait la saisie du jour sans retour possible : l'aperçu montrait
 * ce qui arrivait, jamais ce qui partait.
 */
describe('copie avant remplacement', () => {
  const plein = bloc({ recettes: [recetteDeLAutreOnglet] });

  it('met de côté l’état actuel avant de l’écraser', async () => {
    const s = stockageEssai({ [CLE_STOCKAGE]: plein });
    useFaits.getState().initialiser(s);
    expect(await useFaits.getState().adopterFaitsDistants(JSON.parse(bloc()))).toBeNull();

    expect(useFaits.getState().faits.recettes).toHaveLength(0);
    expect(instantaneAvantRemplacement()?.brut).toBe(plein);
  });

  // Remplir un appareil neuf ne doit pas effacer la copie utile d'avant.
  it('ne met rien de côté quand il n’y a rien à perdre', async () => {
    const s = stockageEssai({ [CLE_STOCKAGE]: bloc() });
    useFaits.getState().initialiser(s);
    await useFaits.getState().adopterFaitsDistants(JSON.parse(plein));
    expect(instantaneAvantRemplacement()).toBeNull();
  });

  it('refuse de remplacer quand la copie ne peut pas s’écrire', async () => {
    const s = stockageEssai({ [CLE_STOCKAGE]: plein });
    useFaits.getState().initialiser(s);
    s.remplir();
    const refus = await useFaits.getState().adopterFaitsDistants(JSON.parse(bloc()));
    expect(refus).toMatch(/mettre de côté/);
    expect(useFaits.getState().faits.recettes).toHaveLength(1);
  });
});
