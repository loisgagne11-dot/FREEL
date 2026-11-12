import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../domain/types';
import type { Echeance } from '../domain/calculs/provisions';
import { type Faits, faitsVides } from './schema';
import { provisionIrDe, soldeImpotPrecedentDe } from './selecteurs';
import { repartitionImpotDe, soldeImpotPrevuDe } from './selecteurs.impotCalendrier';

/* Un foyer d'une part, sans autre revenu. Valeurs fictives. */
const recette = (id: string, montant: number, le: string) => ({
  id, clientNom: 'Client démo', libelle: 'Mission', montant: euros(montant),
  emiseLe: dateISO(le), encaisseeLe: dateISO(le), modeReglement: 'virement' as const, numero: id
});

function foyer(modifications: Partial<Faits> = {}): Faits {
  return {
    ...faitsVides(),
    recettes: [recette('r1', 40000, '2025-06-10'), recette('r2', 20000, '2026-03-10'), recette('r3', 30000, '2026-07-10')],
    partsFiscales: 1,
    autresRevenusFoyer: euros(0),
    versementPerDeductible: euros(0),
    ...modifications
  };
}

const impot = (id: string, montant: number, le: string, p: Partial<Echeance> = {}): Echeance => ({
  id, nature: 'impot', montant: euros(montant), echeanceLe: dateISO(le), payeeLe: null, montantPaye: null, ...p
});

const juin = new Date('2026-06-10T10:00:00');
const octobre = new Date('2026-10-20T10:00:00');

describe('le solde de l’an passé, placé à ses dates', () => {
  it('découpe l’estimation que la provision garde déjà, aux dates publiées', () => {
    const s = soldeImpotPrecedentDe(foyer(), juin);
    if (s === null || s.statut === 'refuse') throw new Error('solde attendu');
    const prevus = soldeImpotPrevuDe(foyer(), juin);
    expect(prevus.map((p) => p.date)).toEqual(['2026-09-25', '2026-10-26', '2026-11-26', '2026-12-28']);
    // La frise place le montant de la provision, elle n'en invente pas un autre.
    expect(Math.round(prevus.reduce((t, p) => t + p.montant, 0) * 100))
      .toBe(Math.round(s.valeur.resteAProvisionner * 100));
  });

  it('disparaît dès que l’avis est saisi', () => {
    const f = foyer({ echeances: [impot('s', 1200, '2026-09-25', { exercice: 2025 })] });
    expect(soldeImpotPrevuDe(f, juin)).toEqual([]);
  });

  it('n’existe pas sous le versement libératoire', () => {
    const f = foyer({ entreprise: { ...faitsVides().entreprise, versementLiberatoire: true } });
    expect(soldeImpotPrevuDe(f, juin)).toEqual([]);
  });
});

describe('la provision de l’année, mois par mois', () => {
  const acomptes = [
    impot('a9', 350, '2026-09-15', { payeeLe: dateISO('2026-09-15'), montantPaye: euros(350) }),
    impot('a10', 350, '2026-10-15', { payeeLe: dateISO('2026-10-15'), montantPaye: euros(350) }),
    impot('a11', 350, '2026-11-15'),
    impot('a12', 350, '2026-12-15'),
    // Le solde de 2025 se prélève les mêmes mois ; il ne règle pas 2026.
    impot('s9', 600, '2026-09-25', { exercice: 2025, payeeLe: dateISO('2026-09-25'), montantPaye: euros(600) })
  ];

  it('va de janvier au mois courant, sur les encaissements de l’année seulement', () => {
    const r = repartitionImpotDe(foyer({ echeances: acomptes }), octobre);
    expect(r?.lignes.map((l) => l.mois)).toHaveLength(10);
    expect(r?.lignes.filter((l) => l.encaisse > 0).map((l) => l.mois)).toEqual(['2026-03', '2026-07']);
    expect(r?.lignes.map((l) => l.preleve).filter((x) => x > 0)).toEqual([350, 350]);
  });

  // Une seule règle : ce qu'il faut garder à la fin du mois courant est la
  // provision du jour, plus les acomptes appelés que le volet 1 porte déjà.
  it('retombe sur la provision du jour, acomptes appelés compris', () => {
    const f = foyer({ echeances: acomptes });
    const r = repartitionImpotDe(f, octobre);
    const p = provisionIrDe(f, octobre);
    if (r === null || p === null || p.statut === 'refuse') throw new Error('provision attendue');
    expect(r.appelesNonPreleves).toBe(700);
    expect(r.lignes.at(-1)?.aGarder).toBeCloseTo(p.valeur.resteAProvisionner + r.appelesNonPreleves, 2);
  });

  it('se tait quand la provision ne se calcule pas', () => {
    expect(repartitionImpotDe(foyer({ partsFiscales: null }), octobre)).toBeNull();
  });
});
