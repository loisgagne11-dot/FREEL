import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import { changerOptionVl } from '../domain/calculs/optionVl.changement';
import { type Faits, type Recette, faitsVides } from './schema';
import { etatPilote, provisionIrDe, soldeImpotPrecedentDe, vlAu } from './selecteurs';
import { obligationsEntre, ventilationDeclaration } from './selecteurs.obligations';

const recette = (id: string, le: string, montant: number): Recette => ({
  id, clientNom: 'Client fictif', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO(le), encaisseeLe: dateISO(le), modeReglement: 'virement', numero: id
});

/*
 * Un libéral fictif d'une part, sans autre revenu, qui a quitté le versement
 * libératoire au 1er janvier 2026 : l'option valait jusqu'en décembre 2025,
 * le barème depuis. 18 000 € encaissés en 2025, 12 000 € en 2026.
 */
const quitteeAu1erJanvier2026 = (): Faits => ({
  ...faitsVides(),
  entreprise: {
    ...faitsVides().entreprise, debutActivite: dateISO('2024-06-01'), urssafPeriodicite: 'trimestriel',
    versementLiberatoire: false, historiqueVl: [{ jusquA: mois('2025-12'), actif: true }]
  },
  recettes: [recette('a', '2025-03-10', 10000), recette('b', '2025-11-20', 8000), recette('c', '2026-02-10', 12000)],
  partsFiscales: 1, autresRevenusFoyer: euros(0), versementPerDeductible: euros(0)
});

/** La même, corrigée : « je n'ai jamais été sous versement libératoire ». */
const corrigee = (f: Faits): Faits => ({
  ...f, entreprise: { ...f.entreprise, ...changerOptionVl(f.entreprise, false, 'debut', 2026) }
});

const cases = (f: Faits, annee: number) =>
  obligationsEntre(f, dateISO('2025-01-01'), dateISO('2028-12-31'), dateISO(`${annee}-04-20`))
    .find((o) => o.id === `revenus-${annee}`)?.cases;

const mars2026 = new Date('2026-03-15T10:00:00');

describe('l’option se lit au mois', () => {
  it('vaut jusqu’en décembre 2025, et plus en janvier 2026', () => {
    expect(vlAu(quitteeAu1erJanvier2026(), mois('2025-12'))).toBe(true);
    expect(vlAu(quitteeAu1erJanvier2026(), mois('2026-01'))).toBe(false);
  });
});

/*
 * CHANGER D'OPTION NE RÉÉCRIT PAS LE PASSÉ.
 *
 * Lue sur le booléen du jour, l'option quittée en 2026 faisait déclarer les
 * 18 000 € de 2025 en 5HQ — des recettes déjà imposées par le versement
 * libératoire, recopiées au barème sur la 2042-C-PRO — et inventait un solde
 * d'impôt 2025 de plusieurs centaines d'euros, retranché du versable alors que
 * personne ne le doit.
 */
describe('quitter le versement libératoire au 1er janvier 2026', () => {
  it('déclare les revenus 2025 en 5TE, et ceux de 2026 en 5HQ', () => {
    const f = quitteeAu1erJanvier2026();
    expect(cases(f, 2026)).toEqual({ '5TE': 18000, '5HQ': 0 });
    expect(cases(f, 2027)).toEqual({ '5TE': 0, '5HQ': 12000 });
  });

  it('n’estime aucun solde d’impôt 2025 : le versement libératoire l’a payé', () => {
    expect(soldeImpotPrecedentDe(quitteeAu1erJanvier2026(), mars2026)).toBeNull();
  });

  it('provisionne l’impôt de 2026 au barème, sur les seules recettes de 2026', () => {
    const r = provisionIrDe(quitteeAu1erJanvier2026(), mars2026, euros(0));
    if (r === null || r.statut === 'refuse') throw new Error('provision attendue');
    // 12 000 € × 66 % = 7 920 € imposables : les 18 000 € de 2025, imposés
    // par le versement libératoire, n'y entrent pas.
    expect(r.valeur.assiette).toBe(12000);
    expect(r.valeur.revenuImposableMicro).toBeCloseTo(7920, 2);
  });

  // Le quatrième trimestre 2025 se déclare en janvier 2026, sous l'option de
  // 2025 : 2,2 % de ses 8 000 €, et non zéro parce qu'on l'a quittée depuis.
  it('déclare le quatrième trimestre 2025 avec son versement libératoire', () => {
    const v = ventilationDeclaration(quitteeAu1erJanvier2026(), [mois('2025-10'), mois('2025-11'), mois('2025-12')]);
    if (v.statut === 'refuse') throw new Error(v.motif);
    expect(v.valeur.impot).toBeCloseTo(176, 2);
  });

  /* En janvier 2026, novembre 2025 n'est pas encore déclaré : il garde ses
     2,2 % de versement libératoire. Au taux du mois courant — le barème —, ils
     disparaissaient du dû, et rien ne les reprenait. */
  it('garde au dû le versement libératoire des recettes de 2025 encore à déclarer en janvier', () => {
    const e = etatPilote(quitteeAu1erJanvier2026(), [], new Date('2026-01-15T10:00:00'));
    expect(e.provisionsParNature.impot).toBeCloseTo(18000 * 0.022, 2);
    // La CFP, elle, ne dépend pas de l'option : elle court sur les trois
    // recettes non déclarées, février 2026 compris.
    expect(e.provisionsParNature.cfp).toBeCloseTo(30000 * 0.002, 2);
  });
});

/*
 * L'écran ne pose une fin d'option qu'en décembre, mais l'histoire en admet
 * une à tout mois — un dossier importé, une perte du droit en cours d'année :
 * la déclaration partage alors les recettes à la date d'encaissement, et la
 * provision doit suivre le même partage. Sans lui, elle imposait au barème
 * des recettes déjà imposées par le versement libératoire.
 */
describe('une année partagée entre l’option et le barème', () => {
  const partagee = (): Faits => ({
    ...quitteeAu1erJanvier2026(),
    entreprise: { ...quitteeAu1erJanvier2026().entreprise, historiqueVl: [{ jusquA: mois('2026-06'), actif: true }] },
    recettes: [recette('a', '2026-03-10', 30000), recette('b', '2026-09-10', 20000)]
  });

  it('n’impose au barème que ce qui a été encaissé hors de l’option, comme la case 5HQ', () => {
    const f = partagee();
    expect(cases(f, 2027)).toEqual({ '5TE': 30000, '5HQ': 20000 });
    const r = provisionIrDe(f, new Date('2026-10-15T10:00:00'), euros(0));
    if (r === null || r.statut === 'refuse') throw new Error('provision attendue');
    expect(r.valeur.assiette).toBe(20000);
  });
});

/*
 * Corriger une erreur, c'est l'option du jour depuis toujours : tout bascule,
 * comme le faisait la case avant le lot 34-bis.
 */
describe('corriger « depuis le début »', () => {
  it('fait tout basculer au barème : 2025 en 5HQ, et son solde estimé', () => {
    const f = corrigee(quitteeAu1erJanvier2026());
    expect(f.entreprise.historiqueVl).toEqual([]);
    expect(cases(f, 2026)).toEqual({ '5TE': 0, '5HQ': 18000 });
    expect(soldeImpotPrecedentDe(f, mars2026)).not.toBeNull();
  });
});
