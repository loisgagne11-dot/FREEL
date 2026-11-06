import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../domain/types';
import type { Echeance } from '../domain/calculs/provisions';
import { type Faits, faitsVides } from './schema';
import { etatPilote, provisionIrDe, soldeImpotPrecedentDe } from './selecteurs';

/*
 * Un foyer d'une part, sans autre revenu, qui a encaissé 60 000 € en 2026 au
 * régime du barème : 39 600 € imposables, 5 045,48 € d'impôt (barème 2024,
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

const IMPOT_2026 = 5045.48;
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
 * 5 045 € d'impôt sur les revenus de 2026 — qui se soldent à l'automne 2027 —
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
    // Volet 1 : l'avis appelé (3 000 €). Volet 2 : la seule CFP des recettes
    // de 2026 non encore déclarées — plus d'estimation d'impôt.
    expect(e.provisionsParNature.impot).toBeCloseTo(3000 + 60000 * 0.002, 2);
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
