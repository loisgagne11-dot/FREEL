import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois, type TypeActivite } from '../types';
import {
  type ContexteProvisions, type Echeance, type PeriodesDeclarees,
  type RecetteEncaissee,
  provisions, voletAProvisionner, voletConstate
} from './provisions';

const ctx = (
  taux = 0, type: TypeActivite = 'BNC', acre = false
): ContexteProvisions => ({
  typeActivite: type,
  sousAcreLe: () => acre,
  tauxImpotEtContributions: taux
});

const ech = (id: string, montant: number, payee: boolean): Echeance => ({
  id, nature: 'urssaf', montant: euros(montant), echeanceLe: dateISO('2026-07-31'),
  payeeLe: payee ? dateISO('2026-07-31') : null, montantPaye: null
});

const rec = (id: string, montant: number, le: string): RecetteEncaissee => ({
  id, montant: euros(montant), encaisseeLe: dateISO(le)
});

const declarees = (...m: string[]): PeriodesDeclarees => ({ mois: m.map(mois) });

describe('volet 1 — dettes constatées', () => {
  it('somme les échéances non payées', () => {
    expect(voletConstate([ech('a', 1000, false), ech('b', 500, false)])).toBe(1500);
  });

  // Le bug de l'ancienne version : les échéances payées étaient comptées,
  // donc l'argent déjà sorti du compte l'était une seconde fois.
  it('exclut les échéances payées, dont l\'argent a déjà quitté le compte', () => {
    expect(voletConstate([ech('a', 1000, false), ech('b', 500, true)])).toBe(1000);
  });

  it('vaut zéro sans échéance', () => {
    expect(voletConstate([])).toBe(0);
  });
});

describe('volet 2 — charges sur recettes encaissées non déclarées', () => {
  // La correction incomplète consisterait à s'arrêter au volet 1. Entre
  // l'encaissement et l'appel de cotisations, la dette existe déjà.
  it('provisionne les cotisations dues sur une recette encaissée non déclarée', () => {
    const r = voletAProvisionner([rec('r1', 10000, '2026-07-15')], declarees(), ctx());
    expect(r.montant).toBe(2560); // 10 000 × 26,1 % (juillet 2026)
  });

  it('ignore une recette dont la période est déjà déclarée, pour ne pas compter deux fois', () => {
    const r = voletAProvisionner([rec('r1', 10000, '2026-07-15')], declarees('2026-07'), ctx());
    expect(r.montant).toBe(0);
  });

  // Le taux se lit au mois d'encaissement : un CA annuel × taux unique serait
  // faux, puisque le taux change au 1er juillet.
  // La bascule qui existe réellement est celle du 1er juillet 2024 : 21,1 %
  // avant, 23,1 % après. Celle de juillet 2026 avait été programmée puis
  // annulée par le décret n° 2025-943.
  it('résout le taux au mois d\'encaissement, de part et d\'autre d\'une bascule', () => {
    const juin = voletAProvisionner([rec('r1', 10000, '2024-06-30')], declarees(), ctx());
    const juillet = voletAProvisionner([rec('r2', 10000, '2024-07-01')], declarees(), ctx());
    expect(juin.montant).toBe(2110);
    expect(juillet.montant).toBe(2310);
    expect(juin.montant).not.toBe(juillet.montant);
  });

  it('ajoute l\'impôt et les contributions au taux de cotisations', () => {
    const r = voletAProvisionner([rec('r1', 10000, '2026-07-15')], declarees(), ctx(0.022));
    expect(r.montant).toBe(2780); // 10 000 × (25,6 % + 2,2 %)
  });

  it('applique l\'abattement ACRE quand la recette y est éligible', () => {
    const r = voletAProvisionner([rec('r1', 10000, '2026-07-15')], declarees(), ctx(0, 'BNC', true));
    expect(r.montant).toBe(1280); // 10 000 × 13,05 %
  });

  // Une recette non calculable ne doit pas disparaître en silence : le total
  // serait sous-évalué et l'utilisateur se verserait de l'argent dû.
  it('signale une recette dont le barème ne couvre pas la période, sans l\'inclure', () => {
    const r = voletAProvisionner([rec('vieux', 10000, '2019-03-10')], declarees(), ctx());
    expect(r.montant).toBe(0);
    expect(r.nonCalculables).toHaveLength(1);
    expect(r.nonCalculables[0]?.id).toBe('vieux');
    expect(r.nonCalculables[0]?.motif).toMatch(/extrapol/);
  });

  it('n\'empêche pas les autres recettes d\'être provisionnées', () => {
    const r = voletAProvisionner(
      [rec('vieux', 10000, '2019-03-10'), rec('r1', 10000, '2026-07-15')],
      declarees(), ctx()
    );
    expect(r.montant).toBe(2560);
    expect(r.nonCalculables).toHaveLength(1);
  });
});

describe('les deux volets réunis', () => {
  it('additionne le constaté et le à-provisionner', () => {
    const d = provisions(
      [ech('e1', 1000, false), ech('e2', 500, true)],
      [rec('r1', 10000, '2026-07-15')],
      declarees(),
      ctx()
    );
    expect(d.voletConstate).toBe(1000);
    expect(d.voletAProvisionner).toBe(2560);
    expect(d.total).toBe(3560);
    expect(d.recettesNonCalculables).toHaveLength(0);
  });

  // Le mécanisme de bascule : déclarer une période fait passer sa dette du
  // volet 2 au volet 1, sans jamais la compter dans les deux.
  it('la déclaration fait basculer la dette d\'un volet à l\'autre, sans double compte', () => {
    const recettes = [rec('r1', 10000, '2026-07-15')];

    const avant = provisions([], recettes, declarees(), ctx());
    expect(avant.voletAProvisionner).toBe(2560);
    expect(avant.voletConstate).toBe(0);

    // Après déclaration, l'URSSAF émet l'échéance correspondante.
    const apres = provisions([ech('urssaf-T3', 2560, false)], recettes, declarees('2026-07'), ctx());
    expect(apres.voletAProvisionner).toBe(0);
    expect(apres.voletConstate).toBe(2560);

    // Le total ne bouge pas : c'est la même dette, vue à deux stades.
    expect(apres.total).toBe(avant.total);
  });
});
