import { describe, expect, it } from 'vitest';
import {
  CLE_DERNIERE_ARCHIVE, lireDerniereArchive, noterArchive, piecesNonArchivees
} from './archive.derniere';
import type { MetaJustificatif } from './justificatifs';

function meta(id: string, deposeLe: string): MetaJustificatif {
  return {
    id, nomFichier: `${id}.pdf`, typeMime: 'application/pdf', taille: 1,
    empreinte: 'aa', deposeLe, fait: { nature: 'depense', id: 'd' }
  };
}

describe('date de la dernière archive', () => {
  it('se note puis se relit', () => {
    const m = new Map<string, string>();
    noterArchive(new Date('2026-05-01T10:00:00Z'), { setItem: (k, v) => { m.set(k, v); } });
    expect(lireDerniereArchive({ getItem: (k) => m.get(k) ?? null }))
      .toBe('2026-05-01T10:00:00.000Z');
    expect(m.has(CLE_DERNIERE_ARCHIVE)).toBe(true);
  });

  it('un stockage qui lève ne fait échouer ni la lecture ni l’écriture', () => {
    // Coût si la règle sautait : en navigation privée, télécharger l'archive planterait.
    const leve = () => { throw new Error('quota'); };
    expect(lireDerniereArchive({ getItem: leve })).toBeNull();
    expect(() => noterArchive(new Date(), { setItem: leve })).not.toThrow();
    expect(lireDerniereArchive(null)).toBeNull();
  });

  it('une valeur illisible vaut « jamais archivé »', () => {
    expect(lireDerniereArchive({ getItem: () => 'n’importe quoi' })).toBeNull();
  });

  it('sans archive, toutes les pièces sont non archivées ; sinon seules les plus récentes', () => {
    const metas = [meta('a', '2026-01-01T00:00:00Z'), meta('b', '2026-06-01T00:00:00Z')];
    expect(piecesNonArchivees(metas, null)).toBe(2);
    expect(piecesNonArchivees(metas, '2026-03-01T00:00:00Z')).toBe(1);
    expect(piecesNonArchivees(metas, '2026-07-01T00:00:00Z')).toBe(0);
  });
});
