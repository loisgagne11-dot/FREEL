import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import type { MouvementBancaire } from '../domain/calculs/banque';
import type { Faits } from '../state/schema';
import {
  etatPilote, fluxDuMois, impotRevenuAProvisionner, remunerationDuMois, solde, virementsImpotDe
} from '../state/selecteurs';
import { chargerJeu, le } from '../test/jeu-d-essai';

/**
 * L'IMPÔT RÉGLÉ DEPUIS LE COMPTE PERSONNEL (lot 35, décision 17).
 *
 * On vire vers son compte personnel sa rémunération ET de quoi payer l'impôt
 * sur le revenu, qui s'y prélève. Le jeu d'essai porte quatre acomptes de
 * 150 € (exercice 2026), payés. Le piège : retrancher du solde du compte pro
 * à la fois le virement « pour l'impôt » et les acomptes qu'il a financés —
 * la même somme deux fois.
 */
const MAINTENANT = le(2026, 12, 15);
const virementImpot = (id: string, date: string, montant: number): MouvementBancaire => ({
  id, date: dateISO(date), libelle: 'VIR VERS COMPTE PERSONNEL DEMO', montant: euros(-montant),
  rapprocheAvec: null, sansContrepartie: 'impot', ignoree: false
});
const avec = (faits: Faits, ...mv: MouvementBancaire[]): Faits =>
  ({ ...faits, mouvementsBancaires: [...faits.mouvementsBancaires, ...mv] });
const ir = (f: Faits): number => {
  const r = impotRevenuAProvisionner(f, MAINTENANT);
  return r === undefined || r.statut === 'refuse' ? 0 : r.valeur;
};

describe('mis de côté pour l’impôt', () => {
  const jeu = chargerJeu();

  it('n’est pas une rémunération : « déjà versé » ne bouge pas', () => {
    const f = avec(jeu, virementImpot('mv-ir-1', '2026-12-05', 500));
    expect(remunerationDuMois(f, mois('2026-12'))).toBe(remunerationDuMois(jeu, mois('2026-12')));
    expect(virementsImpotDe(f, 2026)).toBe(500);
  });

  /** Sans la règle, le solde baissait de 600 € de plus : le virement ET les acomptes qu'il a payés. */
  it('le solde du compte pro compte l’argent parti une seule fois', () => {
    const f = avec(jeu, virementImpot('mv-ir-1', '2026-09-10', 600));
    expect(solde(f)).toBeCloseTo(solde(jeu), 2);
  });

  it('la provision se réduit de ce qui a été viré, et non du virement PLUS les acomptes', () => {
    const base = ir(jeu);
    expect(base).toBeGreaterThan(400);
    // 600 € virés = les 600 € d'acomptes : rien de plus n'est parti.
    expect(ir(avec(jeu, virementImpot('mv-ir-1', '2026-09-10', 600)))).toBeCloseTo(base, 2);
    // 1 000 € virés : 400 € de plus sont mis de côté, la provision baisse d'autant.
    expect(ir(avec(jeu, virementImpot('mv-ir-1', '2026-09-10', 1000)))).toBeCloseTo(base - 400, 2);
  });

  it('par exercice : un virement de 2025 ne solde rien de 2026', () => {
    expect(ir(avec(jeu, virementImpot('mv-ir-0', '2025-11-10', 1000)))).toBeCloseTo(ir(jeu), 2);
  });

  it('« à mettre de côté pour l’impôt » se lit à côté du versable, au chiffre de la provision', () => {
    const f = avec(jeu, virementImpot('mv-ir-1', '2026-09-10', 1000));
    const etat = etatPilote(f, f.echeances, MAINTENANT);
    const flux = fluxDuMois(f, mois('2026-12'), etat, f.echeances, dateISO('2026-12-15'));
    expect(flux.remuneration.impotAMettreDeCote).toBeCloseTo(ir(f), 2);
  });
});
