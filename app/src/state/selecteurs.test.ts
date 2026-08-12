import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois, ratio } from '../domain/types';
import type { Echeance } from '../domain/calculs/provisions';
import { type Depense, type Faits, faitsVides } from './schema';
import {
  caEncaisseAnnee, etatAchats, etatLivre, etatPilote, moisCourant,
  recettesEncaissees, regimeDe, regimeTvaAu, sousAcreLe
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

describe('écran Achats', () => {
  function depense(m: Partial<Depense> = {}): Depense {
    return {
      id: 'd', libelle: 'Abonnement', fournisseur: 'F', provenance: 'france',
      montantTtc: euros(120), tauxTva: ratio(0.20), payeeLe: dateISO('2026-09-10'),
      justificatifId: 'p1', rapprochement: 'rapproche', ...m
    };
  }

  const ASSUJETTI_DEPUIS_JUILLET = faits({
    entreprise: { ...faitsVides().entreprise, tvaDepuis: mois('2026-07') },
    // Un relevé importé : c'est lui, et non un booléen, qui rend le
    // rapprochement possible.
    mouvementsBancaires: [{
      id: 'mvt-1', date: dateISO('2026-09-10'), libelle: 'PRLV',
      montant: euros(-120), rapprocheAvec: null, sansContrepartie: false
    }]
  });

  // Franchir le seuil en cours d'année est le cas ordinaire. Appliquer le
  // régime d'aujourd'hui à une dépense de mars rendrait déductible une TVA
  // qui ne l'était pas.
  it('résout le régime de TVA à la date de paiement de chaque dépense', () => {
    const etat = etatAchats({
      ...ASSUJETTI_DEPUIS_JUILLET,
      depenses: [
        depense({ id: 'avant', payeeLe: dateISO('2026-03-10') }),
        depense({ id: 'apres', payeeLe: dateISO('2026-09-10') })
      ]
    });
    const parId = new Map(etat.lignes.map((l) => [l.depense.id, l]));
    expect(parId.get('avant')?.regimeTva).toBe('franchise');
    expect(parId.get('apres')?.regimeTva).toBe('assujetti');
    expect(etat.resume.tvaRecuperable).toBe(20);
  });

  it('rattache une dépense sans date au régime courant, faute de mieux', () => {
    const etat = etatAchats(
      { ...ASSUJETTI_DEPUIS_JUILLET, depenses: [depense({ payeeLe: null })] },
      new Date('2026-09-15T12:00:00Z')
    );
    expect(etat.lignes[0]?.regimeTva).toBe('assujetti');
    expect(etat.sansDate).toBe(1);
  });

  // Une dépense non datée est le premier problème à traiter, pas une ligne à
  // reléguer en bas de liste.
  it('range de la plus récente à la plus ancienne, les non datées en tête', () => {
    const etat = etatAchats({
      ...ASSUJETTI_DEPUIS_JUILLET,
      depenses: [
        depense({ id: 'vieille', payeeLe: dateISO('2026-08-01') }),
        depense({ id: 'sans-date', payeeLe: null }),
        depense({ id: 'recente', payeeLe: dateISO('2026-09-30') })
      ]
    });
    expect(etat.lignes.map((l) => l.depense.id)).toEqual(['sans-date', 'recente', 'vieille']);
  });

  // Sans compte relié, afficher « rapprochée » affirmerait un contrôle qui
  // n'a plus lieu.
  it('ne présente rien comme rapproché quand aucune banque n\'est reliée', () => {
    const etat = etatAchats({
      ...ASSUJETTI_DEPUIS_JUILLET, mouvementsBancaires: [], depenses: [depense()]
    });
    expect(etat.lignes[0]?.rapprochement).toBe('sans_banque');
    expect(etat.banqueReliee).toBe(false);
  });

  it('chiffre la TVA perdue faute de pièce', () => {
    const etat = etatAchats({
      ...ASSUJETTI_DEPUIS_JUILLET,
      depenses: [depense({ justificatifId: null })]
    });
    expect(etat.resume.tvaPerdueFauteDePiece).toBe(20);
    expect(etat.lignes[0]?.tva.motifNonRecuperable).toBe('justificatif_manquant');
  });

  it('sur un fichier vierge, ne produit que des zéros', () => {
    const etat = etatAchats(faits());
    expect(etat.lignes).toEqual([]);
    expect(etat.resume.nombre).toBe(0);
  });
});

describe('régime de TVA par période', () => {
  it('est la franchise tant qu\'aucun assujettissement n\'est déclaré', () => {
    expect(regimeTvaAu(faits(), mois('2026-09'))).toBe('franchise');
  });

  // Le mois d'assujettissement est inclus : on est redevable dès ce mois-là.
  it('bascule à partir du mois d\'assujettissement, celui-ci compris', () => {
    const f = faits({ entreprise: { ...faitsVides().entreprise, tvaDepuis: mois('2026-07') } });
    expect(regimeTvaAu(f, mois('2026-06'))).toBe('franchise');
    expect(regimeTvaAu(f, mois('2026-07'))).toBe('assujetti');
    expect(regimeTvaAu(f, mois('2026-08'))).toBe('assujetti');
  });
});

describe('livre des recettes', () => {
  const rec = (m: Partial<Faits['recettes'][number]> = {}) => ({
    id: 'r1', clientNom: 'ClientA', libelle: 'Mission', montant: euros(4000),
    emiseLe: dateISO('2026-06-30'), encaisseeLe: dateISO('2026-07-15'),
    modeReglement: 'virement' as const, numero: '2026-001', ...m
  });

  // L'y faire figurer serait déclarer une recette qui n'a pas eu lieu, et
  // payer des cotisations dessus.
  it('ne porte au registre que les encaissements', () => {
    const etat = etatLivre(faits({
      recettes: [
        rec({ id: 'encaissee' }),
        rec({ id: 'attente', numero: '2026-002', encaisseeLe: null, modeReglement: null })
      ]
    }));
    expect(etat.ecritures.map((e) => e.id)).toEqual(['encaissee']);
    expect(etat.enAttente.map((e) => e.id)).toEqual(['attente']);
    expect(etat.total.total).toBe(4000);
  });

  it('range les écritures dans l’ordre des encaissements', () => {
    const etat = etatLivre(faits({
      recettes: [
        rec({ id: 'tard', numero: '2026-002', encaisseeLe: dateISO('2026-09-01') }),
        rec({ id: 'tot', numero: '2026-001', encaisseeLe: dateISO('2026-07-01') })
      ]
    }));
    expect(etat.ecritures.map((e) => e.id)).toEqual(['tot', 'tard']);
  });

  // La facture la plus ancienne est celle qui inquiète : elle vient en tête.
  it('range les factures en attente de la plus récente à la plus ancienne', () => {
    const etat = etatLivre(faits({
      recettes: [
        rec({ id: 'vieille', numero: '2026-001', emiseLe: dateISO('2026-05-01'), encaisseeLe: null }),
        rec({ id: 'recente', numero: '2026-002', emiseLe: dateISO('2026-08-01'), encaisseeLe: null })
      ]
    }));
    expect(etat.enAttente.map((e) => e.id)).toEqual(['recente', 'vieille']);
  });

  // Un écart affiché seulement dans un récapitulatif oblige à retrouver la
  // ligne concernée à la main.
  it('rattache chaque écart à son écriture', () => {
    const etat = etatLivre(faits({ recettes: [rec({ modeReglement: null })] }));
    expect(etat.ecartsParEcriture.get('r1')?.[0]?.nature).toBe('mode_reglement_manquant');
  });

  it('sur un fichier vierge, ne produit ni écriture ni écart', () => {
    const etat = etatLivre(faits());
    expect(etat.ecritures).toEqual([]);
    expect(etat.ecarts).toEqual([]);
    expect(etat.total.total).toBe(0);
  });
});
