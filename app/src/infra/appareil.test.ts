import { afterEach, describe, expect, it, vi } from 'vitest';
import { euros } from '../domain/types';
import { CLE_STOCKAGE, faitsVides } from '../state/schema';
import { useFaits } from '../state/store';
import { type Bases, type StockageParcourable, effacerCetAppareil } from './appareil';
import { NOM_BASE } from './justificatifs';

/** Un stockage parcourable, comme `localStorage` : `key(i)` suit l'ordre d'insertion. */
function stockage(initial: Record<string, string>): StockageParcourable & {
  readonly m: Map<string, string>; getItem(c: string): string | null; setItem(c: string, v: string): void;
} {
  const m = new Map(Object.entries(initial));
  return {
    m,
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (c) => m.get(c) ?? null,
    setItem: (c, v) => { m.set(c, v); },
    removeItem: (c) => { m.delete(c); }
  };
}

function bases(presentes: string[] | null, echec = false): Bases & { readonly supprimees: string[] } {
  const supprimees: string[] = [];
  return {
    supprimees,
    supprimer: async (nom) => {
      if (echec) throw new Error('tenue ouverte');
      supprimees.push(nom);
      presentes?.splice(presentes.indexOf(nom), 1);
    },
    lister: async () => presentes
  };
}

/** Tout ce que Freel range, nouvelle et ancienne version. */
const DE_FREEL = {
  'freel.faits.v1': '{}', 'freel.session.supabase.v1': '{}', 'freel.config.supabase.v1': '{}',
  'freel.avant-remplacement.v1': '{}', 'freel.derniere-archive.v1': '2026-01-01',
  'freel.pli.pilote': '{}', 'freel-v111-theme': 'calme',
  freel_v50_bundle: '{}', freel_goal_ca: '1', freel_supabase: '{}'
};

describe('effacer cet appareil', () => {
  it('retire toutes les clés de Freel, et seulement elles', async () => {
    // L'adresse …github.io est partagée avec les autres sites du même compte.
    const s = stockage({ ...DE_FREEL, 'autre-site.preferences': 'x' });
    const bilan = await effacerCetAppareil(s, bases([NOM_BASE]));
    expect([...s.m.keys()]).toEqual(['autre-site.preferences']);
    expect(bilan).toEqual({ clesRestantes: [], baseRestante: false });
  });

  it('supprime la base des pièces, et le constate en relisant', async () => {
    const b = bases([NOM_BASE, 'autre-base']);
    await effacerCetAppareil(stockage({}), b);
    expect(b.supprimees).toEqual([NOM_BASE]);
  });

  it('dit que la base reste quand sa suppression échoue', async () => {
    expect((await effacerCetAppareil(stockage({}), bases([NOM_BASE], true))).baseRestante).toBe(true);
  });

  it('dit qu’il ne sait pas quand le navigateur ne liste pas les bases', async () => {
    expect((await effacerCetAppareil(stockage({}), bases(null))).baseRestante).toBeNull();
  });

  it('nomme une clé qui résiste', async () => {
    const s = stockage(DE_FREEL);
    const tenace = { ...s, removeItem: (c: string) => { if (c !== 'freel-v111-theme') s.m.delete(c); } };
    expect((await effacerCetAppareil(tenace, bases([]))).clesRestantes).toEqual(['freel-v111-theme']);
  });
});

/**
 * UN ONGLET RESTÉ OUVERT NE RAMÈNE PAS CE QU'ON VIENT D'EFFACER.
 *
 * Avant le lot 59, `persister` réécrivait l'état en mémoire dès la première
 * saisie, et le dossier effacé revenait sur l'appareil.
 */
describe('le dossier effacé ailleurs', () => {
  // La garde du lot 59 confondait « jamais écrit » et « effacé » : sur un
  // appareil neuf, la première saisie rechargeait la page au lieu de
  // s'écrire — et la suivante aussi. Aucun essai ne partait d'un stockage vide.
  it('laisse s’écrire la première saisie d’un appareil neuf', () => {
    const s = stockage({});
    useFaits.getState().initialiser(s);
    expect(s.getItem(CLE_STOCKAGE)).toBeNull();
    useFaits.getState().definirReserve(euros(100));
    expect(s.getItem(CLE_STOCKAGE)).not.toBeNull();
  });

  it('n’est pas réécrit par la saisie suivante', () => {
    const s = stockage({ [CLE_STOCKAGE]: JSON.stringify(faitsVides()) });
    useFaits.getState().initialiser(s);
    useFaits.getState().definirReserve(euros(100));
    expect(s.getItem(CLE_STOCKAGE)).not.toBeNull();

    s.removeItem(CLE_STOCKAGE);
    useFaits.getState().definirReserve(euros(200));
    expect(s.getItem(CLE_STOCKAGE)).toBeNull();
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  // L'effacement fait dans un AUTRE onglet arrive par l'événement `storage` :
  // cet onglet se recharge aussitôt, plutôt que de montrer encore ce qui
  // vient d'être effacé, et cesse d'écrire.
  it('fait recharger un onglet resté ouvert, qui cesse d’écrire', () => {
    let ecouteur: ((e: unknown) => void) | undefined;
    vi.stubGlobal('window', { addEventListener: (t: string, f: (e: unknown) => void) => { if (t === 'storage') ecouteur = f; } });
    const recharger = vi.fn();
    vi.stubGlobal('location', { reload: recharger });
    const s = stockage({ [CLE_STOCKAGE]: JSON.stringify(faitsVides()) });
    useFaits.getState().initialiser(s);

    s.removeItem(CLE_STOCKAGE);
    ecouteur?.({ key: CLE_STOCKAGE, newValue: null, storageArea: s });
    expect(recharger).toHaveBeenCalledOnce();
    useFaits.getState().definirReserve(euros(300));
    expect(s.getItem(CLE_STOCKAGE)).toBeNull();
  });
});
