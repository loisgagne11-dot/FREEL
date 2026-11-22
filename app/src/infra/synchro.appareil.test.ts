import { describe, expect, it } from 'vitest';
import { type BaseSynchro, CLE_SYNCHRO, ecrireBase, lireBase } from './synchro.appareil';
import type { StockageLocal } from './session';

function memoire(): StockageLocal & { readonly contenu: Map<string, string> } {
  const contenu = new Map<string, string>();
  return {
    contenu,
    getItem: (c) => contenu.get(c) ?? null,
    setItem: (c, v) => { contenu.set(c, v); },
    removeItem: (c) => { contenu.delete(c); }
  };
}

const BASE: BaseSynchro = {
  compte: 'user-1', version: 3, le: '2026-11-22T08:41:00.000Z', empreinte: 'e-1', modifieLe: null
};

describe('ce que l’appareil retient de sa dernière synchronisation', () => {
  it('se relit tel qu’il a été écrit', () => {
    const s = memoire();
    ecrireBase(s, BASE);
    expect(lireBase(s, 'user-1')).toEqual(BASE);
  });

  /**
   * LA BASE D'UN AUTRE COMPTE NE DIT RIEN DE CELUI-CI. Après un changement de
   * projet, elle ferait croire « déjà vu à la version 3 » d'un compte jamais
   * lu, et l'appareil « recevrait » ou « enverrait » à tort.
   */
  it('ne vaut que pour le compte qui l’a écrite', () => {
    const s = memoire();
    ecrireBase(s, BASE);
    expect(lireBase(s, 'user-2')).toBeNull();
  });

  // Une base abîmée ne se répare pas en devinant : elle ramène à la première
  // liaison, où l'utilisateur voit les deux côtés avant de choisir.
  it('une base illisible ou incomplète vaut « jamais synchronisé »', () => {
    const s = memoire();
    for (const brut of ['{', '{"compte":"user-1"}', JSON.stringify({ ...BASE, version: 0 }),
      JSON.stringify({ ...BASE, le: 'hier' }), JSON.stringify({ ...BASE, empreinte: '' }),
      JSON.stringify({ ...BASE, modifieLe: 42 })]) {
      s.setItem(CLE_SYNCHRO, brut);
      expect(lireBase(s, 'user-1')).toBeNull();
    }
  });

  // « Effacer cet appareil » retire toutes les clés qui commencent par `freel`.
  it('vit sous une clé de Freel, que l’effacement de l’appareil emporte', () => {
    expect(CLE_SYNCHRO.startsWith('freel')).toBe(true);
    const s = memoire();
    ecrireBase(s, BASE);
    ecrireBase(s, null);
    expect(s.contenu.has(CLE_SYNCHRO)).toBe(false);
  });
});
