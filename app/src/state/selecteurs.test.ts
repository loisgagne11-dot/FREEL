import { describe, expect, it } from 'vitest';
import { formuler } from '../domain/calculs/aTraiter.libelles';
import { dateISO, euros, mois, ratio } from '../domain/types';
import type { Echeance } from '../domain/calculs/provisions';
import { type Depense, type Faits, faitsVides } from './schema';
import {
  aTraiter, anneesDisponibles, caEncaisseAnnee, etatPilote, finAcreDe, moisCourant,
  provenanceSoldeDe, recettesEncaissees, regimeDe, remunerationDuMois, solde, sousAcreLe
} from './selecteurs';
import { periodeCourante } from '../domain/calculs/periode';
import { etatArgent } from './selecteurs.argent';
import { etatFacturier } from './selecteurs.facture';
import { etatLivre } from './selecteurs.livre';
import { etatAchats, regimeTvaAu } from './selecteurs.achats';

function faits(modifications: Partial<Faits> = {}): Faits {
  const base = faitsVides();
  return {
    ...base,
    // Antérieure à toute fixture de ce fichier : ces tests vérifient que le
    // sélecteur CÂBLE `soldeDerive` (voir l'en-tête de « solde dérivé des
    // faits »), pas la règle de date elle-même — éprouvée exhaustivement dans
    // `domain/calculs/solde.test.ts`. Sans cette date, chaque fixture existante
    // deviendrait « non datée » et cesserait de se dériver, masquant tout ce
    // que ce bloc de tests vérifie.
    soldeInitialAu: dateISO('2000-01-01'),
    ...modifications
  };
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
  echeanceLe: dateISO('2026-07-31'),
  payeeLe: payee ? dateISO('2026-07-31') : null, montantPaye: null
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

/**
 * LE SOLDE SE DÉRIVE DE TOUS LES FAITS, PAS SEULEMENT DU RELEVÉ.
 *
 * Bug remonté sur des données réelles : un utilisateur avait enregistré ses
 * encaissements, ses versements, une dépense et le paiement de ses échéances
 * URSSAF/TVA, sans jamais importer de relevé. Le solde ne bougeait pas — seul
 * `soldeInitial` comptait. Les règles détaillées (mouvement rapproché, sans
 * contrepartie, à traiter) sont éprouvées dans `domain/calculs/solde.test.ts` ;
 * celles-ci vérifient seulement que le sélecteur les câble.
 */
describe('solde dérivé des faits', () => {
  function depense(m: Partial<Depense> = {}): Depense {
    return {
      id: 'dep', libelle: 'Matériel', fournisseur: 'F', provenance: 'france',
      montantTtc: euros(300), tauxTva: ratio(0.20), payeeLe: dateISO('2026-07-05'),
      justificatifId: null, rapprochement: 'en_attente', ...m
    };
  }

  // C'est très exactement le bug remonté : sans lui, cette suite entière
  // retomberait au comportement précédent sans qu'aucun test ne le voie.
  it('ne vaut plus seulement le solde initial dès qu’un fait existe', () => {
    const f = faits({
      soldeInitial: euros(1000),
      recettes: [recette('r1', 4000, '2026-07-10')]
    });
    expect(solde(f)).toBe(5000);
  });

  it('retranche les dépenses payées et les échéances payées', () => {
    const f = faits({
      soldeInitial: euros(10000),
      depenses: [depense()],
      echeances: [ech(1500, true)]
    });
    expect(solde(f)).toBe(10000 - 300 - 1500);
  });

  // Le piège du lot : sans l'exclusion des mouvements rapprochés, ce même
  // encaissement compterait deux fois — une fois côté recette, une fois côté
  // relevé — et le solde afficherait 4000 € de trop.
  it('ne compte pas deux fois une recette dont le mouvement est rapproché', () => {
    const f = faits({
      soldeInitial: euros(1000),
      recettes: [recette('r1', 4000, '2026-07-10')],
      mouvementsBancaires: [{
        id: 'mvt-1', date: dateISO('2026-07-12'), libelle: 'VIR CLIENT',
        montant: euros(4000), rapprocheAvec: 'r1', sansContrepartie: null
      }]
    });
    expect(solde(f)).toBe(5000);
  });

  it('n’ajoute pas un mouvement encore à traiter', () => {
    const f = faits({
      soldeInitial: euros(1000),
      mouvementsBancaires: [{
        id: 'mvt-1', date: dateISO('2026-07-12'), libelle: 'VIR INCONNU',
        montant: euros(4000), rapprocheAvec: null, sansContrepartie: null
      }]
    });
    expect(solde(f)).toBe(1000);
  });

  it('ajoute un versement, mouvement sans contrepartie', () => {
    const f = faits({
      soldeInitial: euros(5000),
      mouvementsBancaires: [{
        id: 'mvt-1', date: dateISO('2026-07-12'), libelle: 'VIR COMPTE PERSO',
        montant: euros(-2000), rapprocheAvec: null, sansContrepartie: 'remuneration'
      }]
    });
    expect(solde(f)).toBe(3000);
  });

  describe('provenance affichée', () => {
    it('« saisi » quand ni fait ni relevé ne contribuent', () => {
      expect(provenanceSoldeDe(faits({ soldeInitial: euros(1000) }))).toBe('saisi');
    });

    it('« derive » dès qu’un fait contribue, sans relevé', () => {
      const f = faits({ recettes: [recette('r1', 4000, '2026-07-10')] });
      expect(provenanceSoldeDe(f)).toBe('derive');
    });

    it('« rapproche » quand un relevé existe et que rien n’y attend de décision', () => {
      const f = faits({
        recettes: [recette('r1', 4000, '2026-07-10')],
        mouvementsBancaires: [{
          id: 'mvt-1', date: dateISO('2026-07-12'), libelle: 'VIR CLIENT',
          montant: euros(4000), rapprocheAvec: 'r1', sansContrepartie: null
        }]
      });
      expect(provenanceSoldeDe(f)).toBe('rapproche');
    });

    it('reste « derive » tant qu’un mouvement du relevé est à traiter', () => {
      const f = faits({
        recettes: [recette('r1', 4000, '2026-07-10')],
        mouvementsBancaires: [{
          id: 'mvt-1', date: dateISO('2026-07-12'), libelle: 'VIR INCONNU',
          montant: euros(150), rapprocheAvec: null, sansContrepartie: null
        }]
      });
      expect(provenanceSoldeDe(f)).toBe('derive');
    });
  });
});

describe('période d\'ACRE', () => {
  const avecAcre = (debut: string) => faits({
    entreprise: {
      ...faitsVides().entreprise, acre: true, debutActivite: dateISO(debut)
    }
  });

  // L'attente précédente était « douze mois pleins », donc janvier 2026
  // exonéré pour un début en février 2025. Elle était fausse : la règle court
  // jusqu'à la fin du 3ᵉ trimestre civil suivant celui de l'affiliation, et le
  // compte du propriétaire l'a confirmé — taux plein constaté dès janvier
  // 2026. Un mois d'ACRE de trop, c'est la moitié des cotisations de ce mois
  // qui n'est pas provisionnée.
  it('couvre jusqu\'à la fin du 3e trimestre civil suivant celui de l\'affiliation', () => {
    const sous = sousAcreLe(avecAcre('2025-02-01'));
    expect(sous(mois('2025-02'))).toBe(true);
    expect(sous(mois('2025-12'))).toBe(true);
    expect(sous(mois('2026-01'))).toBe(false);
  });

  // La fenêtre est observable, et pas seulement calculée : l'écran Config
  // l'écrit pour qu'elle se recoupe avec l'attestation URSSAF.
  it('rend la fin d\'ACRE en clair, et rien quand l\'ACRE n\'est pas déclarée', () => {
    const r = finAcreDe(avecAcre('2025-02-01'));
    expect(r?.statut).not.toBe('refuse');
    expect(r !== null && r.statut !== 'refuse' ? r.valeur : null).toBe('2025-12');
    expect(finAcreDe(faitsVides())).toBeNull();
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
    expect(e.voletAProvisionner).toBeCloseTo(10000 * (0.256 + 0.002), 2);
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

  /* ───────────────────────────────────────────────────────────────────────
     La provision d'impôt sur le revenu au volet 2
     ─────────────────────────────────────────────────────────────────────── */

  const auBareme = (modifications: Partial<Faits> = {}) => faits({
    soldeInitial: euros(60000),
    recettes: [recette('a', 60000, '2026-07-10')],
    partsFiscales: 1,
    autresRevenusFoyer: euros(0),
    versementPerDeductible: euros(0),
    ...modifications
  });

  // Cotisations 25,6 % + CFP 0,2 % : tout ce que le volet 2 retenait avant.
  const provisionsSansImpot = 60000 * (0.256 + 0.002);

  /**
   * LE VERSABLE CESSAIT D'ÊTRE SURÉVALUÉ.
   *
   * Sous le régime du barème, `tauxImpotEtContributions` ne rend que la CFP —
   * 0,2 %. La ligne « impôt » du volet 2 valait donc 120 € sur 60 000 € de
   * chiffre d'affaires, et le versable proposait de se verser les 5 045 €
   * d'impôt sur le revenu de l'année. Si ce test sautait, l'application
   * inviterait de nouveau à dépenser l'argent du fisc.
   */
  it('retranche l’impôt sur le revenu du versable, sous le régime du barème', () => {
    const e = etatPilote(auBareme(), [], maintenant);
    // Le solde compte le solde initial ET la recette encaissée : 60 000 €
    // saisis en Config, 60 000 € de mission réellement entrés en banque.
    // Avant que le solde se dérive des faits (lot H-B), cette recette
    // encaissée ne comptait pour rien et `versableAvant` valait
    // `60000 - provisionsSansImpot` : la moitié de l'argent réellement
    // disponible aurait alors été invisible.
    const versableAvant = (60000 + 60000) - provisionsSansImpot;
    expect(e.tresorerie.versable).toBeLessThan(versableAvant);
    // 60 000 × 66 % = 39 600 imposables ; barème : 5 045,48 €.
    expect(e.tresorerie.versable).toBeCloseTo(versableAvant - 5045.48, 2);
  });

  // La ventilation doit rester lisible : la CFP est un taux, l'impôt sur le
  // revenu un montant annuel, et les deux se lisent sur la même ligne sans se
  // recouvrir.
  it('range l’impôt sur le revenu dans la nature « impot », à côté de la CFP', () => {
    const e = etatPilote(auBareme(), [], maintenant);
    expect(e.provisionsParNature.impot).toBeCloseTo(60000 * 0.002 + 5045.48, 2);
    expect(e.provisionsParNature.urssaf).toBeCloseTo(60000 * 0.256, 2);
  });

  /**
   * LA CONDITION SANS LAQUELLE L'ANOMALIE E ROUVRE.
   *
   * L'acompte de prélèvement à la source est un fait saisi, déjà porté par le
   * volet 1 quand il n'est pas payé. La provision ne couvre que le reste :
   * sans cette soustraction, la même dette serait provisionnée deux fois.
   */
  it('ne provisionne que ce que les acomptes de prélèvement à la source ne couvrent pas', () => {
    const acompte: Echeance = {
      id: 'pas', nature: 'impot', montant: euros(2000),
      echeanceLe: dateISO('2026-06-15'), payeeLe: null, montantPaye: null
    };
    const e = etatPilote(auBareme({ echeances: [acompte] }), [acompte], maintenant);
    // Volet 1 : l'acompte appelé et non payé. Volet 2 : l'impôt de l'année
    // moins ce même acompte. La somme vaut l'impôt de l'année, pas le double.
    expect(e.voletConstate).toBe(2000);
    expect(e.provisionsParNature.impot).toBeCloseTo(60000 * 0.002 + 5045.48, 2);
  });

  // Les deux régimes sont exclusifs : sous versement libératoire, l'impôt est
  // déjà dans le taux de 2,2 %, et une seconde ligne le compterait deux fois.
  it('n’ajoute aucune provision d’impôt sous le versement libératoire', () => {
    const e = etatPilote(
      auBareme({ entreprise: { ...faitsVides().entreprise, versementLiberatoire: true } }),
      [], maintenant
    );
    expect(e.provisionImpotRevenu).toBeNull();
    expect(e.provisionsParNature.impot).toBeCloseTo(60000 * (0.002 + 0.022), 2);
  });

  /**
   * SANS PARTS, ON NE MONTRE PAS UN CHIFFRE.
   *
   * Le total est alors sous-évalué de tout l'impôt de l'année — la plus grosse
   * sous-évaluation possible. L'écran doit le dire au lieu de présenter le
   * versable comme un résultat.
   */
  it('signale un calcul incomplet tant que les parts fiscales ne sont pas renseignées', () => {
    const e = etatPilote(auBareme({ partsFiscales: null }), [], maintenant);
    expect(e.provisionImpotRevenu?.statut).toBe('refuse');
    expect(e.tresorerie.incomplet).toBe(true);
    expect(e.tresorerie.motifsIncomplets.join(' ')).toMatch(/parts/i);
  });

  // Le pipeline des encaissements à venir n'est pas accessible depuis ici
  // (`etatProjection` appelle `etatPilote`) : le montant est un plancher, et
  // il le dit plutôt que de passer pour l'impôt complet de l'année.
  it('dit que les encaissements à venir ne sont pas dans l’assiette', () => {
    const e = etatPilote(auBareme(), [], maintenant);
    const r = e.provisionImpotRevenu;
    expect(r !== null && r.statut !== 'refuse' && r.valeur.ignore)
      .toContain('encaissements_a_venir_non_fournis');
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
      montant: euros(-120), rapprocheAvec: null, sansContrepartie: null
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

/**
 * LA RÉMUNÉRATION EST DÉRIVÉE DU RELEVÉ, JAMAIS SAISIE.
 *
 * L'audit demandait « un versement de rémunération à enregistrer ». Ç'aurait
 * été un fait de trop : se verser de l'argent n'est pas une opération
 * comptable en micro — la personne et l'entreprise sont la même —, le virement
 * figure déjà au relevé, et le saisir une seconde fois le compterait deux fois.
 *
 * Ce qui manquait n'était pas un fait mais un NOM : savoir lequel des
 * mouvements sortants est une rémunération.
 */
describe('rémunération versée', () => {
  const mouvement = (m: Partial<Faits['mouvementsBancaires'][number]> = {}) => ({
    id: 'mv1', date: dateISO('2026-08-05'), libelle: 'VIR COMPTE PERSO',
    montant: euros(-2500), rapprocheAvec: null,
    sansContrepartie: 'remuneration' as const, ...m
  });

  it('totalise les virements nommés « rémunération » du mois', () => {
    const f = faits({
      mouvementsBancaires: [
        mouvement(),
        mouvement({ id: 'mv2', date: dateISO('2026-08-20'), montant: euros(-500) })
      ]
    });
    expect(remunerationDuMois(f, mois('2026-08'))).toBe(3000);
  });

  // Un débit est négatif au relevé : on rend le montant VERSÉ, pas son opposé.
  it('rend un montant positif', () => {
    const f = faits({ mouvementsBancaires: [mouvement()] });
    expect(remunerationDuMois(f, mois('2026-08'))).toBeGreaterThan(0);
  });

  it('ignore les mouvements d’un autre mois', () => {
    const f = faits({ mouvementsBancaires: [mouvement({ date: dateISO('2026-07-05') })] });
    expect(remunerationDuMois(f, mois('2026-08'))).toBe(0);
  });

  /**
   * Les frais bancaires sont eux aussi « sans contrepartie », et ce ne sont
   * pas des rémunérations. C'est précisément pourquoi le booléen est devenu un
   * motif : un seul état ne pouvait pas distinguer les deux.
   */
  it('ne compte pas les autres mouvements sans contrepartie', () => {
    const f = faits({
      mouvementsBancaires: [mouvement({ sansContrepartie: 'autre', montant: euros(-12) })]
    });
    expect(remunerationDuMois(f, mois('2026-08'))).toBe(0);
  });

  it('ne compte pas un mouvement rapproché d’une dépense', () => {
    const f = faits({
      mouvementsBancaires: [mouvement({ sansContrepartie: null, rapprocheAvec: 'd1' })]
    });
    expect(remunerationDuMois(f, mois('2026-08'))).toBe(0);
  });

  // Sans relevé, rien n'est su : zéro est alors une absence de mesure, et
  // l'écran ne l'affiche pas (voir `soldeEstSuivi`).
  it('rend zéro sans aucun relevé', () => {
    expect(remunerationDuMois(faits(), mois('2026-08'))).toBe(0);
  });
});

/**
 * LA CFE — LA CHARGE QUE L'APPLICATION IGNORAIT.
 *
 * Annuelle, payable au 15 décembre, invisible avant la parution de l'avis en
 * novembre. Rien ne la signalait : quelqu'un qui se verse tout son disponible
 * en octobre se verse la CFE de décembre.
 *
 * Ces tests portent sur le CÂBLAGE — quand le sujet apparaît, quand il
 * disparaît, où il mène. Les règles elles-mêmes sont éprouvées dans
 * `bareme/cfe.test.ts`.
 */
describe('obligations de CFE', () => {
  const entreprise = (debutActivite: string) => ({
    ...faitsVides().entreprise, debutActivite: dateISO(debutActivite)
  });

  const echeanceCfe = (annee: number): Echeance => ({
    id: `cfe-${annee}`, nature: 'cfe', montant: euros(410),
    echeanceLe: dateISO(`${annee}-12-15`), payeeLe: null, montantPaye: null
  });

  /** Le 5 octobre : dans le préavis de 75 jours du paiement du 15 décembre. */
  const enOctobre = new Date('2026-10-05T09:00:00Z');

  it('rappelle la CFE avant qu’il soit trop tard pour la provisionner', () => {
    const sujets = aTraiter(
      faits({ entreprise: entreprise('2020-01-01'), recettes: [recette('r', 40000, '2024-05-01')] }),
      enOctobre
    );
    const cfe = sujets.find((s) => s.id.includes('cfe-paiement'));
    expect(cfe).toBeTruthy();
    expect(cfe === undefined ? '' : formuler(cfe).contexte).toMatch(/disponible est surestimé/);
  });

  /**
   * LE POINT QUI REND L'ALERTE CRÉDIBLE. Dès que l'échéance est saisie, la
   * dette entre dans les provisions par le chemin normal et le sujet s'efface.
   * Un rappel qui survit à son traitement apprend à ignorer les rappels.
   */
  it('se taît dès que l’échéance est saisie', () => {
    const sujets = aTraiter(
      faits({
        entreprise: entreprise('2020-01-01'),
        recettes: [recette('r', 40000, '2024-05-01')],
        echeances: [echeanceCfe(2026)]
      }),
      enOctobre
    );
    expect(sujets.find((s) => s.id.includes('cfe-paiement'))).toBeUndefined();
  });

  // Une échéance de l'an dernier ne couvre pas cette année-ci.
  it('ne tient pas la CFE de l’an passé pour celle de cette année', () => {
    const sujets = aTraiter(
      faits({
        entreprise: entreprise('2020-01-01'),
        recettes: [recette('r', 40000, '2024-05-01')],
        echeances: [echeanceCfe(2025)]
      }),
      enOctobre
    );
    expect(sujets.find((s) => s.id.includes('cfe-paiement'))).toBeTruthy();
  });

  it('ne réclame rien l’année de la création, qui est exonérée', () => {
    const sujets = aTraiter(faits({ entreprise: entreprise('2026-02-01') }), enOctobre);
    expect(sujets.find((s) => s.id.includes('cfe-paiement'))).toBeUndefined();
  });

  /**
   * L'année de création, c'est la 1447-C qui est due — et elle, elle mérite
   * d'être rappelée : l'omettre fait perdre l'exonération de première année.
   */
  it('rappelle la déclaration initiale l’année de la création', () => {
    const sujets = aTraiter(faits({ entreprise: entreprise('2026-02-01') }), enOctobre);
    const d = sujets.find((s) => s.id.includes('1447c'));
    expect(d === undefined ? '' : formuler(d).intitule).toMatch(/1447-C/);
    expect(d?.ecran).toBe('config');
  });

  it('ne rappelle plus la déclaration initiale les années suivantes', () => {
    const sujets = aTraiter(faits({ entreprise: entreprise('2024-02-01') }), enOctobre);
    expect(sujets.find((s) => s.id.includes('1447c'))).toBeUndefined();
  });

  // Le sujet se règle en saisissant une échéance : il doit mener là où on la
  // saisit, pas sur Config.
  it('mène là où l’échéance se saisit', () => {
    const sujets = aTraiter(
      faits({ entreprise: entreprise('2020-01-01'), recettes: [recette('r', 40000, '2024-05-01')] }),
      enOctobre
    );
    expect(sujets.find((s) => s.id.includes('cfe-paiement'))?.ecran).toBe('argent');
  });

  /**
   * En juin, le paiement de décembre est encore loin : l'annoncer alors
   * n'ajoute rien et occupe une ligne pour six mois.
   */
  it('ne parle pas du paiement de décembre au mois de juin', () => {
    const sujets = aTraiter(
      faits({ entreprise: entreprise('2020-01-01'), recettes: [recette('r', 40000, '2024-05-01')] }),
      new Date('2026-06-20T09:00:00Z')
    );
    expect(sujets.find((s) => s.id.includes('cfe-paiement'))).toBeUndefined();
  });

  /**
   * LA PREMIÈRE ANNÉE D'IMPOSITION EST DUE, MÊME SANS UN EURO DE RECETTES.
   *
   * Entreprise créée en 2025, aucune recette enregistrée : le chiffre de
   * référence est nul ou inconnu selon la lecture, et il serait tentant d'en
   * conclure « rien à payer ». C'est faux — la base est réduite de moitié, pas
   * supprimée. Le sujet doit donc apparaître, et dire pourquoi.
   *
   * (Le cas « N−2 inexistant » lui-même se teste côté domaine, sur
   * `regimeCfe(…, null)` : ici les régimes de création l'absorbent avant que le
   * chiffre de référence soit consulté.)
   */
  it('réclame la CFE de la première année d’imposition, même sans recettes', () => {
    const sujets = aTraiter(faits({ entreprise: entreprise('2025-01-01') }), enOctobre);
    const cfe = sujets.find((s) => s.id.includes('cfe-paiement'));
    expect(cfe).toBeTruthy();
    expect(cfe === undefined ? '' : formuler(cfe).contexte).toMatch(/réduite de moitié/);
  });

  // Au plus 5 000 € de recettes en N−2 : pas de cotisation minimum, donc rien
  // à provisionner et rien à dire.
  it('ne réclame rien sous le seuil de cotisation minimum', () => {
    const sujets = aTraiter(
      faits({ entreprise: entreprise('2020-01-01'), recettes: [recette('r', 4000, '2024-05-01')] }),
      enOctobre
    );
    expect(sujets.find((s) => s.id.includes('cfe-paiement'))).toBeUndefined();
  });
});

/**
 * L'INDICATEUR QUI ÉTAIT FAUX FAUTE D'ÊTRE TESTÉ.
 *
 * `etatArgent` n'avait aucun test, et son « reste à rentrer » était la
 * différence entre deux agrégats annuels, bornée à zéro. Une facture émise en
 * décembre et encaissée en janvier gonfle l'encaissé d'une année sans
 * contrepartie dans le réalisé de la même : la soustraction devient négative,
 * la borne l'écrase à zéro, et l'écran annonce que tout est rentré alors qu'il
 * manque des milliers d'euros.
 *
 * Le reste à rentrer ne se déduit pas d'agrégats. Il se compte facture par
 * facture.
 */
describe('reste à rentrer de l’écran Argent', () => {
  const enJuillet = new Date('2026-07-15T12:00:00Z');

  const f = (
    id: string, montant: number, emiseLe: string | null, encaisseeLe: string | null
  ) => ({
    id, clientNom: 'C', libelle: 'l', montant: euros(montant),
    emiseLe: emiseLe === null ? null : dateISO(emiseLe),
    encaisseeLe: encaisseeLe === null ? null : dateISO(encaisseeLe),
    modeReglement: 'virement' as const, numero: id
  });

  it('compte ce qui est émis et non réglé', () => {
    const etat = etatArgent(
      faits({ recettes: [f('a', 3000, '2026-05-01', null), f('b', 2000, '2026-05-01', '2026-06-01')] }),
      [], enJuillet
    );
    expect(etat.resteARentrer).toBe(3000);
  });

  /**
   * LE CAS QUI CASSAIT L'ANCIENNE FORMULE. 40 000 € réalisés en 2026, 44 000 €
   * encaissés dont 12 000 € émis en 2025 : la différence annuelle vaut −4 000,
   * bornée à 0. Or 8 000 € émis en 2026 ne sont pas rentrés.
   */
  it('ne s’écrase pas à zéro quand l’encaissé de l’année dépasse le réalisé', () => {
    const etat = etatArgent(faits({
      recettes: [
        f('n1a', 12_000, '2025-12-01', '2026-01-15'),
        f('a', 32_000, '2026-02-01', '2026-03-01'),
        f('b', 8_000, '2026-06-01', null)
      ]
    }), [], enJuillet);

    expect(etat.caRealise).toBe(40_000);
    expect(etat.caEncaisse).toBe(44_000);
    expect(etat.resteARentrer).toBe(8_000);
    expect(etat.resteARentrer).not.toBe(0);
  });

  /**
   * Une facture de l'an dernier qui n'est pas réglée reste due au 1er janvier.
   * La borner à l'année en cours ferait disparaître de l'écran exactement
   * celle qu'il faut aller chercher.
   */
  it('n’oublie pas un impayé des années précédentes', () => {
    const etat = etatArgent(
      faits({ recettes: [f('vieux', 5000, '2025-03-01', null)] }), [], enJuillet
    );
    expect(etat.caRealise).toBe(0);
    expect(etat.resteARentrer).toBe(5000);
  });

  /** Un brouillon n'a pas été envoyé : personne ne doit rien. */
  it('ne compte pas les brouillons', () => {
    const etat = etatArgent(
      faits({ recettes: [f('br', 9000, null, null)] }), [], enJuillet
    );
    expect(etat.resteARentrer).toBe(0);
  });

  /** Une seule définition : celle du facturier, sur toutes les factures. */
  it('donne le même chiffre que le facturier sur la même assiette', () => {
    const jeu = faits({
      recettes: [
        f('a', 3000, '2026-05-01', null),
        f('b', 2000, '2026-05-01', '2026-06-01'),
        f('c', 1500, '2026-06-20', null)
      ]
    });
    const argent = etatArgent(jeu, [], enJuillet);
    const facturier = etatFacturier(jeu, periodeCourante('annee', enJuillet), enJuillet);
    expect(argent.resteARentrer).toBe(facturier.resteARentrer);
  });
});

/**
 * LA BASCULE D'ANNÉE DE LA BARRE DU HAUT.
 *
 * L'année était verrouillée sur `maintenant.getFullYear()` : au 1ᵉʳ janvier,
 * le pilier Performance perdait toute recette de l'année qui venait de se
 * terminer, et rien ne permettait de la revoir. `etatArgent` reçoit
 * maintenant l'année comme un paramètre distinct de l'horloge — voir sa
 * documentation pour la raison des DEUX paramètres de temps.
 */
describe('bascule d’année de l’écran Argent', () => {
  const le15juillet2026 = new Date('2026-07-15T12:00:00Z');

  const f = (id: string, montant: number, emiseLe: string, encaisseeLe: string) => ({
    id, clientNom: 'C', libelle: 'l', montant: euros(montant),
    emiseLe: dateISO(emiseLe), encaisseeLe: dateISO(encaisseeLe),
    modeReglement: 'virement' as const, numero: id
  });

  const deuxAnnees = faits({
    recettes: [
      f('r2025', 12_000, '2025-03-01', '2025-03-15'),
      f('r2026', 40_000, '2026-02-01', '2026-02-20')
    ]
  });

  /*
   * LE CŒUR DU LOT : LA BASCULE CHANGE LE CHIFFRE D'AFFAIRES DE L'ANNÉE.
   *
   * Si ce test tombait, l'écran Argent redeviendrait ce que l'audit
   * signalait : une année verrouillée sur l'horloge, la précédente
   * inatteignable.
   */
  it('affiche le chiffre d’affaires de l’année demandée, pas celle de l’horloge', () => {
    const en2026 = etatArgent(deuxAnnees, [], le15juillet2026, 2026);
    const en2025 = etatArgent(deuxAnnees, [], le15juillet2026, 2025);

    expect(en2026.annee).toBe(2026);
    expect(en2026.caRealise).toBe(40_000);
    expect(en2025.annee).toBe(2025);
    expect(en2025.caRealise).toBe(12_000);
  });

  /**
   * LE POINT DUR DU LOT.
   *
   * Le solde est un état INSTANTANÉ — combien il y a sur le compte
   * maintenant — et non une période. Il vient de `pilote.tresorerie`, calculé
   * sur `maintenant` et jamais sur `annee`. Si ce test tombait, regarder 2024
   * changerait ce que l'écran affiche pour le compte en banque d'aujourd'hui
   * — l'écart exact que l'utilisateur a signalé : « la trésorerie ne doit pas
   * être impactée par les périodes ».
   */
  it('ne change pas le solde du compte quand on change l’année regardée', () => {
    const en2026 = etatArgent(deuxAnnees, [], le15juillet2026, 2026);
    const en2025 = etatArgent(deuxAnnees, [], le15juillet2026, 2025);
    const en2019 = etatArgent(deuxAnnees, [], le15juillet2026, 2019);

    expect(en2026.tresorerie.solde).toBe(en2025.tresorerie.solde);
    expect(en2026.tresorerie.solde).toBe(en2019.tresorerie.solde);
    expect(en2026.tresorerie.dispo).toBe(en2025.tresorerie.dispo);
  });

  /** Sans le paramètre, on retombe sur l'année de l'horloge — le comportement
   *  de tous les appelants d'avant ce lot, tests compris. */
  it('retombe sur l’année de l’horloge quand aucune n’est choisie', () => {
    const etat = etatArgent(deuxAnnees, [], le15juillet2026);
    expect(etat.annee).toBe(2026);
  });
});

describe('années proposables au sélecteur de période', () => {
  const mission = (debut: string | null, fin: string | null) => ({
    id: 'm', clientId: null, clientNom: 'C', description: '', tjm: euros(0),
    debut: debut === null ? null : dateISO(debut), fin: fin === null ? null : dateISO(fin),
    statut: 'active' as const, entites: []
  });

  /** Sans le moindre fait daté, il n'y a rien à comparer : proposer une plage
   *  imaginaire ferait choisir entre des années toutes vides. */
  it('ne propose que l’année courante à un dossier vide', () => {
    expect(anneesDisponibles(faitsVides(), new Date('2026-07-15'))).toEqual([2026]);
  });

  /** La borne basse vient du fait le plus ancien du dossier, quel qu'il soit —
   *  ici une dépense, pas une recette. */
  it('descend jusqu’à l’année du plus ancien fait, quelle que soit sa nature', () => {
    const jeu = faits({
      depenses: [{
        id: 'd', libelle: 'l', fournisseur: 'f', provenance: 'france',
        montantTtc: euros(100), tauxTva: ratio(0.2), payeeLe: dateISO('2022-03-01'),
        justificatifId: null, rapprochement: 'sans_banque'
      } as Depense]
    });
    expect(anneesDisponibles(jeu, new Date('2026-07-15'))).toEqual(
      [2022, 2023, 2024, 2025, 2026]
    );
  });

  /** Une année intermédiaire sans le moindre fait reste proposable : la plage
   *  est continue, elle ne saute pas les trous. */
  it('comble les années intermédiaires qui n’ont elles-mêmes aucun fait', () => {
    const jeu = faits({
      recettes: [
        { id: 'a', clientNom: 'C', libelle: 'l', montant: euros(1000), emiseLe: dateISO('2023-01-10'),
          encaisseeLe: dateISO('2023-01-10'), modeReglement: 'virement', numero: '1' }
      ]
    });
    // 2024 et 2025 n'ont aucun fait, et figurent quand même : c'est le
    // dossier repris que l'audit citait — deux ans d'historique qui
    // n'en montraient qu'un.
    expect(anneesDisponibles(jeu, new Date('2026-02-01'))).toEqual(
      [2023, 2024, 2025, 2026]
    );
  });

  /** Une mission déjà planifiée l'an prochain rend cette année-là proposable
   *  — mais seulement elle, pas un intervalle ouvert vers l'avenir. */
  it('ajoute l’année suivante seulement si un fait y figure déjà', () => {
    const jeu = faits({ missions: [mission('2027-01-05', '2027-03-01')] });
    expect(anneesDisponibles(jeu, new Date('2026-07-15'))).toEqual([2026, 2027]);
  });
});
