import { beforeEach, describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import type { MouvementBancaire } from '../domain/calculs/banque';
import { faitsVides } from './schema';
import { useFaits } from './store';
import { ignorerMouvement, marquerSansContrepartie, rapprocherMouvement } from './ecritures.achats';
import { annulerDeclaration, declarerPeriode } from './ecritures.echeances';

const mvt: MouvementBancaire = {
  id: 'm1', date: dateISO('2026-05-02'), libelle: 'VIR DEMO', montant: euros(-500),
  rapprocheAvec: null, sansContrepartie: null, ignoree: false
};

beforeEach(() => {
  useFaits.setState({ faits: { ...faitsVides(), mouvementsBancaires: [mvt] } });
});

const premier = (): MouvementBancaire => useFaits.getState().faits.mouvementsBancaires[0] as MouvementBancaire;

/**
 * Les trois états d'une ligne du relevé sont exclusifs. Une ligne à la fois
 * « ignorée » et « sans contrepartie » serait comptée par une règle et
 * écartée par l'autre : le solde dépendrait de l'ordre des tests.
 */
describe('relevé — ignorer une opération', () => {
  it('ignorer efface un pointage antérieur', () => {
    marquerSansContrepartie('m1', 'autre');
    ignorerMouvement('m1', true);
    expect(premier()).toMatchObject({ ignoree: true, sansContrepartie: null, rapprocheAvec: null });
  });

  it('pointer ou rapprocher annule l’ignorance', () => {
    ignorerMouvement('m1', true);
    marquerSansContrepartie('m1', 'remuneration');
    expect(premier()).toMatchObject({ ignoree: false, sansContrepartie: 'remuneration' });
    ignorerMouvement('m1', true);
    rapprocherMouvement('m1', 'dep-1');
    expect(premier()).toMatchObject({ ignoree: false, rapprocheAvec: 'dep-1' });
  });

  it('se défait : la ligne revient dans la file', () => {
    ignorerMouvement('m1', true);
    ignorerMouvement('m1', false);
    expect(premier()).toMatchObject({ ignoree: false, sansContrepartie: null, rapprocheAvec: null });
  });
});

/** Un trimestre se déclare d'un geste : trois mois, une date. */
describe('déclaration — datée, d’un geste par période', () => {
  const T2 = ['2026-04', '2026-05', '2026-06'].map(mois);

  it('pose la même date sur les mois de la période', () => {
    declarerPeriode(T2, dateISO('2026-07-28'));
    expect(useFaits.getState().faits.periodesDeclarees).toEqual(
      T2.map((mois) => ({ mois, declareeLe: '2026-07-28' })));
  });

  it('redéclarer remplace la date au lieu de doubler les mois', () => {
    declarerPeriode(T2, null);
    declarerPeriode(T2, dateISO('2026-08-02'));
    const d = useFaits.getState().faits.periodesDeclarees;
    expect(d).toHaveLength(3);
    expect(d.every((p) => p.declareeLe === '2026-08-02')).toBe(true);
  });

  it('annuler retire la période entière, et elle seule', () => {
    declarerPeriode([mois('2026-03')], dateISO('2026-04-20'));
    declarerPeriode(T2, dateISO('2026-07-28'));
    annulerDeclaration(T2);
    expect(useFaits.getState().faits.periodesDeclarees.map((p) => p.mois)).toEqual(['2026-03']);
  });
});
