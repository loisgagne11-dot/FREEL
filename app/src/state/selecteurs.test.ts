import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import type { Echeance } from '../domain/calculs/provisions';
import { type Faits, faitsVides } from './schema';
import {
  caEncaisseAnnee, etatPilote, moisCourant, recettesEncaissees, regimeDe, sousAcreLe
} from './selecteurs';

function faits(modifications: Partial<Faits> = {}): Faits {
  const base = faitsVides();
  return { ...base, ...modifications };
}

function recette(id: string, montant: number, encaisseeLe: string | null) {
  return {
    id, clientNom: 'C', libelle: 'l', montant: euros(montant),
    emiseLe: dateISO('2026-07-01'),
    encaisseeLe: encaisseeLe === null ? null : dateISO(encaisseeLe),
    modeReglement: 'virement' as const, numero: '1'
  };
}

const ech = (montant: number, payee: boolean): Echeance => ({
  id: 'e', nature: 'urssaf', montant: euros(montant),
  echeanceLe: dateISO('2026-07-31'), payee
});

describe('mois courant', () => {
  // L'ancienne application codait ses périodes en dur : au 1er janvier, les
  // dépenses tombaient à zéro et l'autonomie bondissait sans cause réelle.
  it('dérive de l\'horloge, jamais d\'une constante', () => {
    expect(moisCourant(new Date('2026-07-15T12:00:00Z'))).toBe('2026-07');
    expect(moisCourant(new Date('2027-01-01T12:00:00Z'))).toBe('2027-01');
  });

  it('complète le mois sur deux chiffres', () => {
    expect(moisCourant(new Date('2026-03-05T12:00:00Z'))).toBe('2026-03');
  });
});

describe('régime d\'imposition dérivé des faits', () => {
  it('versement libératoire quand l\'option est prise', () => {
    const f = faits({ entreprise: { ...faitsVides().entreprise, versementLiberatoire: true } });
    expect(regimeDe(f).regime).toBe('versement_liberatoire');
  });

  it('barème sinon, avec l\'acompte saisi', () => {
    const r = regimeDe(faits(), euros(620));
    expect(r.regime).toBe('bareme');
    expect(r.regime === 'bareme' && r.acomptePasSaisi).toBe(620);
  });
});

describe('recettes encaissées', () => {
  // Seul l'encaissement fait naître la dette : une facture émise et non payée
  // ne doit pas être provisionnée.
  it('exclut les recettes non encaissées', () => {
    const f = faits({ recettes: [recette('a', 1000, '2026-07-10'), recette('b', 2000, null)] });
    const encaissees = recettesEncaissees(f);
    expect(encaissees).toHaveLength(1);
    expect(encaissees[0]?.id).toBe('a');
  });

  it('somme le chiffre d\'affaires encaissé d\'une année', () => {
    const f = faits({
      recettes: [
        recette('a', 1000, '2026-03-10'),
        recette('b', 2000, '2026-11-20'),
        recette('c', 5000, '2025-06-01'),
        recette('d', 9999, null)
      ]
    });
    expect(caEncaisseAnnee(f, 2026)).toBe(3000);
    expect(caEncaisseAnnee(f, 2025)).toBe(5000);
    expect(caEncaisseAnnee(f, 2024)).toBe(0);
  });
});

describe('période d\'ACRE', () => {
  const avecAcre = (debut: string) => faits({
    entreprise: {
      ...faitsVides().entreprise, acre: true, debutActivite: dateISO(debut)
    }
  });

  it('couvre les quatre trimestres suivant le début d\'activité', () => {
    const sous = sousAcreLe(avecAcre('2025-02-01'));
    expect(sous(mois('2025-02'))).toBe(true);
    expect(sous(mois('2025-12'))).toBe(true);
    expect(sous(mois('2026-01'))).toBe(true);
  });

  // Le cas de la persona de l'audit : ACRE éteinte, donc trimestre à taux
  // plein. L'ancienne app appliquait encore un taux ACRE.
  it('s\'éteint après la durée d\'ACRE', () => {
    const sous = sousAcreLe(avecAcre('2025-02-01'));
    expect(sous(mois('2026-02'))).toBe(false);
    expect(sous(mois('2026-07'))).toBe(false);
  });

  it('ne s\'applique pas avant le début d\'activité', () => {
    const sous = sousAcreLe(avecAcre('2025-02-01'));
    expect(sous(mois('2025-01'))).toBe(false);
  });

  it('ne s\'applique jamais si l\'ACRE n\'est pas cochée', () => {
    const f = faits({
      entreprise: { ...faitsVides().entreprise, acre: false, debutActivite: dateISO('2025-02-01') }
    });
    expect(sousAcreLe(f)(mois('2025-06'))).toBe(false);
  });

  it('ne s\'applique jamais sans date de début d\'activité', () => {
    const f = faits({ entreprise: { ...faitsVides().entreprise, acre: true } });
    expect(sousAcreLe(f)(mois('2025-06'))).toBe(false);
  });
});

describe('état de l\'écran Pilote', () => {
  const maintenant = new Date('2026-07-15T12:00:00Z');

  it('sur des faits vides, tout est à zéro sans erreur', () => {
    const e = etatPilote(faits(), [], maintenant);
    expect(e.tresorerie.dispo).toBe(0);
    expect(e.tresorerie.versable).toBe(0);
    expect(e.autonomie).toBeNull();
    expect(e.tauxImpotIndisponible).toBe(false);
  });

  it('calcule le versable à partir du solde, des provisions et de la réserve', () => {
    const e = etatPilote(
      faits({ soldeInitial: euros(10000), reserve: euros(1000) }),
      [ech(2000, false)],
      maintenant
    );
    expect(e.voletConstate).toBe(2000);
    expect(e.tresorerie.dispo).toBe(8000);
    expect(e.tresorerie.versable).toBe(7000);
  });

  // Le volet 2 de D3 : la dette née à l'encaissement, avant toute échéance.
  it('provisionne les recettes encaissées dont la période n\'est pas déclarée', () => {
    const e = etatPilote(
      faits({ soldeInitial: euros(20000), recettes: [recette('a', 10000, '2026-07-10')] }),
      [], maintenant
    );
    // 26,1 % de cotisations + 0,2 % de CFP (régime du barème par défaut)
    expect(e.voletAProvisionner).toBeCloseTo(10000 * (0.261 + 0.002), 2);
    expect(e.voletConstate).toBe(0);
  });

  it('cesse de provisionner une période déclarée', () => {
    const base = { soldeInitial: euros(20000), recettes: [recette('a', 10000, '2026-07-10')] };
    const avant = etatPilote(faits(base), [], maintenant);
    const apres = etatPilote(faits({ ...base, periodesDeclarees: [mois('2026-07')] }), [], maintenant);
    expect(avant.voletAProvisionner).toBeGreaterThan(0);
    expect(apres.voletAProvisionner).toBe(0);
  });

  it('ajoute le versement libératoire à la provision quand l\'option est prise', () => {
    const base = { soldeInitial: euros(20000), recettes: [recette('a', 10000, '2026-07-10')] };
    const bareme = etatPilote(faits(base), [], maintenant);
    const vl = etatPilote(
      faits({ ...base, entreprise: { ...faitsVides().entreprise, versementLiberatoire: true } }),
      [], maintenant
    );
    expect(vl.voletAProvisionner).toBeGreaterThan(bareme.voletAProvisionner);
  });

  it('calcule l\'autonomie quand le besoin mensuel est renseigné', () => {
    const e = etatPilote(
      faits({ soldeInitial: euros(10000), besoinMensuel: euros(2000) }), [], maintenant
    );
    expect(e.autonomie).toBe(5);
  });

  // Une recette hors barème rend le total sous-évalué : l'écran doit le dire.
  it('signale un calcul incomplet quand une recette sort du barème', () => {
    const e = etatPilote(
      faits({ soldeInitial: euros(10000), recettes: [recette('vieux', 5000, '2019-03-10')] }),
      [], maintenant
    );
    expect(e.tresorerie.incomplet).toBe(true);
    expect(e.tresorerie.motifsIncomplets.length).toBeGreaterThan(0);
  });

  it('ne stocke aucun dérivé : deux appels sur les mêmes faits donnent le même résultat', () => {
    const f = faits({ soldeInitial: euros(10000), reserve: euros(500) });
    expect(etatPilote(f, [], maintenant)).toEqual(etatPilote(f, [], maintenant));
  });
});
