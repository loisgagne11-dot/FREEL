import { describe, expect, it } from 'vitest';
import { euros } from '../types';
import { SEUIL_ETALEMENT_SOLDE, prelevementsDuSolde } from './soldeImpot';

const valeur = (r: ReturnType<typeof prelevementsDuSolde>) => {
  if (r.statut === 'refuse') throw new Error(r.motif);
  return r.valeur;
};

describe('le solde de l’impôt sur le revenu', () => {
  it('se prélève en une fois, fin septembre, jusqu’à 300 €', () => {
    const r = prelevementsDuSolde(euros(300), 2026);
    expect(r.statut).toBe('publie');
    expect(valeur(r)).toEqual([{ date: '2026-09-25', montant: 300 }]);
  });

  // Le seuil est « supérieur à 300 € » : 300,01 € s'étale déjà.
  it('s’étale en quatre prélèvements égaux, de septembre à décembre, au-delà', () => {
    expect(SEUIL_ETALEMENT_SOLDE).toBe(300);
    expect(valeur(prelevementsDuSolde(euros(1200), 2026))).toEqual([
      { date: '2026-09-25', montant: 300 },
      { date: '2026-10-26', montant: 300 },
      { date: '2026-11-26', montant: 300 },
      { date: '2026-12-28', montant: 300 }
    ]);
    expect(valeur(prelevementsDuSolde(euros(300.01), 2026))).toHaveLength(4);
  });

  it('s’étale en deux prélèvements, novembre et décembre, pour un avis tardif', () => {
    expect(valeur(prelevementsDuSolde(euros(800), 2026, true))).toEqual([
      { date: '2026-11-25', montant: 400 },
      { date: '2026-12-28', montant: 400 }
    ]);
  });

  // Sans quoi la somme des prélèvements s'écarte de l'avis d'un centime, et
  // la provision de l'année passée ne se solde jamais exactement.
  it('retombe exactement sur l’avis : le reste de la division va au dernier', () => {
    const p = valeur(prelevementsDuSolde(euros(1000.01), 2026));
    expect(p.map((x) => x.montant)).toEqual([250, 250, 250, 250.01]);
    expect(Math.round(p.reduce((s, x) => s + x.montant, 0) * 100)).toBe(100001);
  });

  it('donne, pour une année non relevée, le 25 ou le jour ouvré suivant — en hypothèse', () => {
    const r = prelevementsDuSolde(euros(1200), 2027);
    expect(r.statut).toBe('hypothese');
    // 25/09/2027 samedi → lundi 27 ; 25/12/2027 samedi, férié → lundi 27.
    expect(valeur(r).map((x) => x.date)).toEqual(['2027-09-27', '2027-10-25', '2027-11-25', '2027-12-27']);
  });

  // Le 25 décembre 2028 est un lundi : un jour ouvré de la semaine, mais pas
  // un jour de prélèvement.
  it('saute Noël, même un jour de semaine', () => {
    expect(valeur(prelevementsDuSolde(euros(1200), 2028)).map((x) => x.date))
      .toEqual(['2028-09-25', '2028-10-25', '2028-11-27', '2028-12-26']);
  });

  it('refuse un solde nul ou négatif plutôt que d’inventer des prélèvements', () => {
    expect(prelevementsDuSolde(euros(0), 2026).statut).toBe('refuse');
    expect(prelevementsDuSolde(euros(-5), 2026).statut).toBe('refuse');
  });
});
