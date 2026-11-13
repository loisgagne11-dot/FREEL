import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../domain/types';
import type { Echeance } from '../domain/calculs/provisions';
import { type Faits, faitsVides } from './schema';
import { etatPilote, provisionIrDe, soldeImpotPrecedentDe } from './selecteurs';
import { prelevementsDuSolde } from '../domain/bareme/soldeImpot';

/*
 * Un foyer d'une part, sans autre revenu, qui a encaissé 60 000 € en 2026 au
 * régime du barème : 39 600 € imposables, 4 983,99 € d'impôt (barème 2025,
 * repris en hypothèse pour les années suivantes). Valeurs fictives.
 */
function foyer(modifications: Partial<Faits> = {}): Faits {
  return {
    ...faitsVides(),
    soldeInitialAu: dateISO('2000-01-01'),
    soldeInitial: euros(60000),
    recettes: [{
      id: 'r1', clientNom: 'Client démo', libelle: 'Mission', montant: euros(60000),
      emiseLe: dateISO('2026-07-01'), encaisseeLe: dateISO('2026-07-10'),
      modeReglement: 'virement', numero: '2026-001'
    }],
    partsFiscales: 1,
    autresRevenusFoyer: euros(0),
    versementPerDeductible: euros(0),
    ...modifications
  };
}

// 2026 se résout en hypothèse sur le barème 2025 (loi n° 2026-103). Foyer d'une
// part, 60 000 € × 66 % = 39 600 € imposables, brut au-delà de la décote :
// (29 579 − 11 600) × 11 % = 1 977,69 ; (39 600 − 29 579) × 30 % = 3 006,30.
const IMPOT_2026 = 4983.99;
const finDecembre = new Date('2026-12-31T10:00:00');
const debutJanvier = new Date('2027-01-02T10:00:00');

const impot = (id: string, montant: number, le: string, exercice?: number): Echeance => ({
  id, nature: 'impot', montant: euros(montant), echeanceLe: dateISO(le),
  payeeLe: null, montantPaye: null, ...(exercice === undefined ? {} : { exercice })
});

const reste = (r: ReturnType<typeof soldeImpotPrecedentDe>): number => {
  if (r === null || r.statut === 'refuse') throw new Error('solde attendu');
  return r.valeur.resteAProvisionner;
};

/**
 * AU 1ᴱᴿ JANVIER, L'IMPÔT DE L'ANNÉE ÉCOULÉE RESTE DE CÔTÉ.
 *
 * Si la règle sautait, la provision repartirait de zéro le 2 janvier : les
 * 4 984 € d'impôt sur les revenus de 2026 — qui se soldent à l'automne 2027 —
 * sortiraient des provisions, et « tu peux te verser » monterait d'autant
 * jusqu'à la saisie de l'avis, l'été suivant.
 */
describe('passage du 31 décembre', () => {
  it('garde l’impôt de l’année écoulée dans les provisions', () => {
    const avant = etatPilote(foyer(), [], finDecembre);
    const apres = etatPilote(foyer(), [], debutJanvier);

    expect(reste(soldeImpotPrecedentDe(foyer(), debutJanvier))).toBeCloseTo(IMPOT_2026, 2);
    // La provision d'impôt ne s'effondre pas en changeant d'année…
    expect(apres.provisionsParNature.impot).toBeCloseTo(avant.provisionsParNature.impot, 2);
    // … et le versable ne bondit donc pas de l'impôt de l'année.
    expect(apres.tresorerie.versable).toBeCloseTo(avant.tresorerie.versable, 2);
  });

  it('retranche les acomptes déjà prélevés sur l’année écoulée', () => {
    const f = foyer({ echeances: [impot('a1', 2000, '2026-06-15')] });
    expect(reste(soldeImpotPrecedentDe(f, debutJanvier))).toBeCloseTo(IMPOT_2026 - 2000, 2);
  });

  // Une année sans encaissement n'a pas d'impôt à estimer : on ne fabrique
  // rien pour la première année d'activité.
  it('n’estime rien pour une année sans encaissement', () => {
    expect(soldeImpotPrecedentDe(foyer({ recettes: [] }), debutJanvier)).toBeNull();
  });

  it('n’estime rien sous le versement libératoire', () => {
    const f = foyer({ entreprise: { ...faitsVides().entreprise, versementLiberatoire: true } });
    expect(soldeImpotPrecedentDe(f, debutJanvier)).toBeNull();
  });
});

/**
 * L'AVIS SAISI REMPLACE L'ESTIMATION, IL NE S'Y AJOUTE PAS.
 *
 * Si la règle sautait, le solde serait compté deux fois une fois l'avis reçu :
 * estimé au volet 2, et appelé au volet 1.
 */
describe('avis de solde saisi', () => {
  const avis = impot('solde', 3000, '2027-09-25', 2026);

  it('cesse d’estimer dès que le solde de l’année est saisi', () => {
    const f = foyer({ echeances: [avis] });
    expect(soldeImpotPrecedentDe(f, debutJanvier)).toBeNull();
    const e = etatPilote(f, [avis], debutJanvier);
    // Volet 1 : l'avis appelé (3 000 €). Plus d'estimation d'impôt au volet 2 ;
    // la CFP des recettes non déclarées est rangée à part.
    expect(e.provisionsParNature.impot).toBeCloseTo(3000, 2);
  });

  // À l'automne, le solde de l'an dernier et l'acompte du mois se prélèvent
  // ensemble. Compté comme acompte de l'année, le solde réduisait à tort la
  // provision de l'année en cours.
  it('ne compte pas le solde de l’an dernier comme un acompte de l’année', () => {
    const f = foyer({
      echeances: [avis],
      recettes: [{
        id: 'r2', clientNom: 'Client démo', libelle: 'Mission', montant: euros(60000),
        emiseLe: dateISO('2027-07-01'), encaisseeLe: dateISO('2027-07-10'),
        modeReglement: 'virement', numero: '2027-001'
      }]
    });
    const r = provisionIrDe(f, new Date('2027-10-15T10:00:00'));
    if (r === null || r.statut === 'refuse') throw new Error('provision attendue');
    expect(r.valeur.acomptesPasSaisis).toBe(0);
  });
});

/**
 * LA PREMIÈRE ANNÉE D'ACTIVITÉ, PUIS L'AUTOMNE SUIVANT.
 *
 * Le cas du propriétaire, en chiffres fictifs. Aucun acompte la première
 * année (2025) : le prélèvement à la source d'un indépendant ne démarre
 * qu'en septembre de l'année suivante (BOFiP, BOI-IR-PAS-20-20-20). À
 * l'automne 2026, deux séries se prélèvent les mêmes mois :
 *
 *   · le solde de 2025, révélé par l'avis — 2 400 €, en quatre fois ;
 *   · l'acompte de 2026, qui vient de s'activer — 350 € le 15 de chaque mois.
 *
 * Si l'exercice se perdait, les 2 400 € de solde passaient pour des acomptes
 * de 2026 : retranchés de la provision de 2026, ils la faisaient fondre, et
 * l'estimation de 2025 restait en plus — compté deux fois, d'un côté, oublié
 * de l'autre.
 */
describe('première année d’activité, puis l’automne suivant', () => {
  const recettes2025 = {
    id: 'r0', clientNom: 'Client démo', libelle: 'Mission', montant: euros(40000),
    emiseLe: dateISO('2025-06-01'), encaisseeLe: dateISO('2025-06-10'),
    modeReglement: 'virement' as const, numero: '2025-001'
  };
  const juin = new Date('2026-06-10T10:00:00');
  const octobre = new Date('2026-10-20T10:00:00');

  const soldeR = prelevementsDuSolde(euros(2400), 2026);
  if (soldeR.statut === 'refuse') throw new Error('prélèvements attendus');
  const solde2025 = soldeR.valeur.map((p, i) => impot(`s${i}`, p.montant, p.date, 2025));
  const acomptes2026 = ['2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15']
    .map((le, i) => impot(`a${i}`, 350, le));
  const paye = (e: Echeance): Echeance => ({ ...e, payeeLe: e.echeanceLe, montantPaye: e.montant });

  // Au 20 octobre : septembre réglé des deux côtés, l'acompte d'octobre aussi.
  const echeances = [
    paye(solde2025[0]!), solde2025[1]!, solde2025[2]!, solde2025[3]!,
    paye(acomptes2026[0]!), paye(acomptes2026[1]!), acomptes2026[2]!, acomptes2026[3]!
  ];
  const avantLAvis = foyer({ recettes: [recettes2025, ...foyer().recettes] });
  const apresLAvis = { ...avantLAvis, echeances };

  it('garde l’impôt de 2025 estimé tant que l’avis manque, sans acompte à retrancher', () => {
    expect(reste(soldeImpotPrecedentDe(avantLAvis, juin))).toBeGreaterThan(0);
    const r = provisionIrDe(avantLAvis, juin);
    if (r === null || r.statut === 'refuse') throw new Error('provision attendue');
    expect(r.valeur.acomptesPasSaisis).toBe(0);
  });

  it('remplace l’estimation de 2025 par l’avis, et ne retranche de 2026 que ses acomptes', () => {
    expect(soldeImpotPrecedentDe(apresLAvis, octobre)).toBeNull();
    const r = provisionIrDe(apresLAvis, octobre);
    if (r === null || r.statut === 'refuse') throw new Error('provision attendue');
    // Les quatre acomptes de 2026, payés ou non — et pas un euro du solde.
    expect(r.valeur.acomptesPasSaisis).toBe(1400);
  });

  it('compte chaque euro une fois : ce qui reste appelé, plus ce que 2026 coûtera encore', () => {
    const r = provisionIrDe(apresLAvis, octobre);
    if (r === null || r.statut === 'refuse') throw new Error('provision attendue');
    const appeleNonPaye = 3 * 600 + 2 * 350;
    expect(etatPilote(apresLAvis, echeances, octobre).provisionsParNature.impot)
      .toBeCloseTo(appeleNonPaye + r.valeur.resteAProvisionner, 2);
  });
});
