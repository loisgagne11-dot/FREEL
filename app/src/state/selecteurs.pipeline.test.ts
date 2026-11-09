import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../domain/types';
import { type Faits, faitsVides } from './schema';
import { etatPilote, impotRevenuAProvisionner, provisionIrDe } from './selecteurs';
import { encaissementsAttendusDeLAnnee } from './selecteurs.pipeline';
import { compositionDe } from './selecteurs.composition';

/*
 * Un foyer fictif d'une part, sans autre revenu : 30 000 € encaissés en
 * mars, et deux factures émises en juin que le client règle au second
 * semestre. Valeurs et noms fictifs.
 */
const juin = new Date('2026-06-30T10:00:00');

function foyer(modifications: Partial<Faits> = {}): Faits {
  return {
    ...faitsVides(),
    soldeInitialAu: dateISO('2000-01-01'),
    soldeInitial: euros(60000),
    recettes: [
      {
        id: 'r1', clientNom: 'Client démo', libelle: 'Mission', montant: euros(30000),
        emiseLe: dateISO('2026-03-01'), encaisseeLe: dateISO('2026-03-10'),
        modeReglement: 'virement', numero: '2026-001'
      },
      {
        id: 'r2', clientNom: 'Client démo', libelle: 'Mission', montant: euros(15000),
        emiseLe: dateISO('2026-06-20'), encaisseeLe: null,
        modeReglement: null, numero: '2026-002'
      },
      {
        id: 'r3', clientNom: 'Client démo', libelle: 'Mission', montant: euros(15000),
        emiseLe: dateISO('2026-06-25'), encaisseeLe: null,
        modeReglement: null, numero: '2026-003'
      }
    ],
    partsFiscales: 1,
    autresRevenusFoyer: euros(0),
    versementPerDeductible: euros(0),
    ...modifications
  };
}

const valeurIr = (f: Faits, quand: Date, ca?: ReturnType<typeof euros> | null) => {
  const r = provisionIrDe(f, quand, ca);
  if (r === null || r.statut === 'refuse') throw new Error('provision attendue');
  return r.valeur;
};

describe('l’impôt se provisionne au taux de l’année projetée', () => {
  /**
   * Si `provisionIrDe` ne lisait plus le pipeline, les factures déjà émises
   * resteraient hors de l'assiette : l'impôt serait calculé au taux d'un
   * revenu de demi-année et le versable surévalué de plusieurs milliers
   * d'euros, jusqu'à ce que les factures soient réglées.
   */
  it('compte les factures émises non réglées dans l’assiette projetée', () => {
    const f = foyer();
    expect(encaissementsAttendusDeLAnnee(f, juin)).toBe(30000);

    const plancher = valeurIr(f, juin, null);
    const v = valeurIr(f, juin);
    expect(v.caProjete).toBe(60000);
    expect(v.partEncaissee).toBe(0.5);
    expect(v.resteAProvisionner).toBeGreaterThan(plancher.resteAProvisionner);
    expect(v.resteAProvisionner).toBeGreaterThanOrEqual(4 * plancher.resteAProvisionner);
  });

  it('ne compte pas une facture qui s’encaisse après décembre', () => {
    const f = foyer({
      recettes: [{
        id: 'r9', clientNom: 'Client démo', libelle: 'Mission', montant: euros(9000),
        emiseLe: dateISO('2026-12-28'), encaisseeLe: null, modeReglement: null, numero: '2026-009'
      }]
    });
    expect(encaissementsAttendusDeLAnnee(f, new Date('2026-12-29T10:00:00'))).toBe(0);
  });

  /**
   * Un chiffre, deux lecteurs : si l'un d'eux recalculait l'impôt par un
   * autre chemin, le Pilote et la composition afficheraient deux versables
   * différents pour les mêmes faits. (`detailDeLaDette` reçoit le même
   * `impotRevenu` mais ne le lit pas : son détail « impôt » ne montre que le
   * taux d'impôt et contributions sur les encaissements — hors de ce lot.)
   */
  it('donne le même impôt au Pilote et à la composition', () => {
    const f = foyer();
    const attendu = impotRevenuAProvisionner(f, juin);
    if (attendu === undefined || attendu.statut === 'refuse') throw new Error('impôt attendu');

    const pilote = etatPilote(f, f.echeances, juin).provisionsParNature.impot;
    const composition = compositionDe(f, 'provisions', juin).termes
      .find((t) => t.libelle === 'Impôt sur le revenu')?.montant;

    expect(attendu.valeur).toBeGreaterThan(2000);
    expect(pilote).toBeCloseTo(attendu.valeur, 2);
    expect(composition).toBeCloseTo(attendu.valeur, 2);
  });
});
