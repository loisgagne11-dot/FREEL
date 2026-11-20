import { describe, expect, it } from 'vitest';
import { dateISO, mois, type TypeActivite } from '../types';
import {
  PERIODES_CIPAV, PERIODES_URSSAF, baremeDeLaCaisse, tauxCotisations, verifierIntegrite
} from './urssaf';
import { tauxCfp, tauxVersementLiberatoire } from './impot';

/** Le taux de cotisations d'un affilié Cipav, ou `null` si le barème refuse. */
function cipav(m: string, acreDepuis: string | null = null, type: TypeActivite = 'BNC'): number | null {
  const r = tauxCotisations(mois(m), type, acreDepuis !== null, baremeDeLaCaisse('cipav', type),
    acreDepuis === null ? null : dateISO(acreDepuis));
  return r.statut === 'refuse' ? null : r.valeur;
}

/*
 * La Cipav cotise d'un point au-dessus de la SSI depuis le 1er juillet 2024, et
 * n'a pas suivi ses marches de 2025 et 2026. Si la caisse sautait, un libéral
 * Cipav serait provisionné à 25,6 % au lieu de 23,2 % en 2026 : 240 € de trop
 * sur 10 000 € encaissés, déclarés à un montant que l'URSSAF ne demande pas.
 */
describe('barème de la Cipav — décret n° 2024-484', () => {
  it('cotise à 23,2 % en 2026', () => {
    expect(cipav('2026-03')).toBe(0.232);
    expect(cipav('2026-11')).toBe(0.232);
  });

  it('cotise à 21,2 % jusqu’au 30 juin 2024, 23,2 % dès le 1er juillet', () => {
    expect(cipav('2024-06')).toBe(0.212);
    expect(cipav('2024-07')).toBe(0.232);
  });

  // ACRE à 50 % pour une création avant le 1er juillet 2026 (voir `acre.ts`).
  it('divise le taux par deux sous ACRE à 50 % : 11,6 %', () => {
    expect(cipav('2026-03', '2026-01-15')).toBeCloseTo(0.116, 10);
  });

  /* Le versement libératoire et la CFP ne dépendent pas de la caisse : 25,4 %
     avec le versement libératoire, comme le dit la fiche F36232. */
  it('ajoute 2,2 % de versement libératoire (25,4 %) et 0,2 % de CFP, comme à la SSI', () => {
    const vl = tauxVersementLiberatoire(mois('2026-03'), 'BNC');
    const cfp = tauxCfp(mois('2026-03'), 'BNC');
    if (vl.statut === 'refuse' || cfp.statut === 'refuse') throw new Error('taux attendu');
    expect((cipav('2026-03') ?? 0) + vl.valeur).toBeCloseTo(0.254, 10);
    expect(cfp.valeur).toBe(0.002);
  });

  it('refuse un mois antérieur à son plus ancien barème', () => {
    expect(cipav('2023-12')).toBeNull();
  });
});

/*
 * La Cipav n'affilie que des libéraux. Servir son taux à une vente de
 * marchandises la ferait cotiser à 23,2 % au lieu de 12,3 %.
 */
describe('la caisse n’a de sens qu’en BNC', () => {
  it('sert le barème de la SSI à une activité BIC, quelle que soit la caisse', () => {
    expect(baremeDeLaCaisse('cipav', 'BIC_vente')).toBe(PERIODES_URSSAF);
    expect(baremeDeLaCaisse('cipav', 'BIC_service')).toBe(PERIODES_URSSAF);
    expect(cipav('2026-03', null, 'BIC_vente')).toBe(0.123);
  });

  it('sert le barème de la SSI à un libéral de la SSI', () => {
    expect(baremeDeLaCaisse('ssi', 'BNC')).toBe(PERIODES_URSSAF);
  });

  // Ses colonnes BIC ne servent qu'au type : elles reprennent celles de la
  // SSI, et une seconde copie des taux finirait par diverger.
  it('reprend dans sa table les colonnes BIC de la SSI au même mois', () => {
    for (const per of PERIODES_CIPAV) {
      const ssi = tauxCotisations(per.du, 'BIC_vente', false, PERIODES_URSSAF);
      expect(ssi.statut !== 'refuse' && ssi.valeur).toBe(per.taux.BIC_vente);
    }
  });
});

describe('provenance et intégrité de la table Cipav', () => {
  it('est contiguë, sans trou ni chevauchement, et seule sa dernière période reste ouverte', () => {
    expect(verifierIntegrite(PERIODES_CIPAV)).toEqual([]);
  });

  it('porte sa source et la date de sa vérification', () => {
    for (const per of PERIODES_CIPAV) {
      expect(per.source).toMatch(/2024-484/);
      expect(per.verifieLe).toBe('2026-11-20');
    }
  });
});
