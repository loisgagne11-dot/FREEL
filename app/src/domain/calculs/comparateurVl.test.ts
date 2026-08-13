import { describe, expect, it } from 'vitest';
import { euros, mois } from '../types';
import { comparerRegimes } from './comparateurVl';
import type { FoyerFiscal } from './comparateurVl';

const M = mois('2026-08');
const seul: FoyerFiscal = { parts: 1, autresRevenus: euros(0) };

function comparaison(ca: number, foyer: FoyerFiscal = seul) {
  const r = comparerRegimes(euros(ca), M, 'BNC', foyer);
  if (r.statut === 'refuse') throw new Error(`refusé : ${r.motif}`);
  return r.valeur;
}

describe('versement libératoire', () => {
  it('se calcule sur le chiffre d’affaires, pas sur le revenu', () => {
    const c = comparaison(40000);
    // 2,2 % du CA en BNC.
    expect(c.versementLiberatoire).toBeCloseTo(40000 * c.tauxVl, 2);
  });

  /**
   * Le point qui décide de tout : le VL se paie même quand le barème ne
   * réclame rien. C'est ce qui le rend perdant sur les petits chiffres
   * d'affaires, et ce qu'un comparateur doit rendre visible.
   */
  it('reste dû quand le barème ne réclame rien', () => {
    const c = comparaison(12000);
    expect(c.bareme).toBe(0);
    expect(c.versementLiberatoire).toBeGreaterThan(0);
    expect(c.avantage).toBe('bareme');
  });
});

/**
 * On ne compare pas « l'impôt de l'activité » à un taux : on mesure ce que
 * l'activité AJOUTE à l'impôt du foyer. Sans cela, on conclurait toujours en
 * faveur du barème — puisque l'activité seule tombe dans les premières
 * tranches, souvent à taux nul.
 */
describe('surcroît d’impôt du foyer', () => {
  it('dépend des autres revenus du foyer', () => {
    const sansAutres = comparaison(40000);
    const avecAutres = comparaison(40000, { parts: 1, autresRevenus: euros(60000) });

    expect(avecAutres.bareme).toBeGreaterThan(sansAutres.bareme);
  });

  /**
   * LE POINT DE BASCULE, ET POURQUOI IL SURPREND.
   *
   * On croit volontiers que le versement libératoire est « pour les gros
   * revenus ». C'est l'inverse en bas de l'échelle : il se paie dès le premier
   * euro, quand le barème ne réclame encore rien. Mais il devient vite
   * gagnant, parce que 2,2 % du CA — soit environ 3,3 % du revenu après
   * abattement — est très inférieur à la première tranche imposable.
   *
   * Pour un célibataire sans autre revenu, la bascule tombe autour de
   * 24 500 € de chiffre d'affaires. Ce test la borne des deux côtés plutôt
   * que d'inscrire le chiffre exact, qui dépend du barème de l'année.
   */
  it('bascule quelque part entre un petit et un moyen chiffre d’affaires', () => {
    expect(comparaison(15000).avantage).toBe('bareme');
    expect(comparaison(35000).avantage).toBe('versement_liberatoire');
  });

  it('reste favorable au versement libératoire quand le foyer est déjà imposé', () => {
    expect(comparaison(40000, { parts: 1, autresRevenus: euros(80000) }).avantage)
      .toBe('versement_liberatoire');
  });

  it('tient compte des parts', () => {
    const une = comparaison(40000, { parts: 1, autresRevenus: euros(60000) });
    const deux = comparaison(40000, { parts: 2, autresRevenus: euros(60000) });
    // À revenu égal, plus de parts font un quotient plus bas, donc moins d'impôt.
    expect(deux.bareme).toBeLessThan(une.bareme);
  });

  // Un foyer sans aucun revenu ne doit pas produire un impôt négatif.
  it('ne rend jamais un surcroît négatif', () => {
    expect(comparaison(0).bareme).toBe(0);
  });

  it('applique l’abattement avant le barème', () => {
    const c = comparaison(40000);
    // 34 % d'abattement en BNC : l'assiette est bien inférieure au CA.
    expect(c.revenuApresAbattement).toBeLessThan(40000);
  });
});

describe('lecture du résultat', () => {
  /**
   * Le signe suit la question posée — « est-ce que le VL me coûte plus
   * cher ? ». Une économie affichée en négatif se lit à contresens une fois
   * sur deux.
   */
  it('donne un écart positif quand le versement libératoire coûte plus', () => {
    const c = comparaison(15000);
    expect(c.avantage).toBe('bareme');
    expect(c.ecart).toBeGreaterThan(0);
  });

  it('donne un écart négatif quand c’est le barème qui coûte plus', () => {
    const c = comparaison(40000);
    expect(c.avantage).toBe('versement_liberatoire');
    expect(c.ecart).toBeLessThan(0);
  });
});

/**
 * Un arbitrage qui engage douze mois ne se prend pas sur une extrapolation
 * silencieuse : le statut de la résolution se propage.
 */
describe('résolution', () => {
  it('refuse une période que le barème ne couvre pas', () => {
    const r = comparerRegimes(euros(40000), mois('2015-01'), 'BNC', seul);
    expect(r.statut).toBe('refuse');
  });

  it('rend une résolution exploitable sur une période couverte', () => {
    const r = comparerRegimes(euros(40000), M, 'BNC', seul);
    expect(r.statut === 'publie' || r.statut === 'hypothese').toBe(true);
  });
});
