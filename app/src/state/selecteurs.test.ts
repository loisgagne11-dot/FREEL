import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois, ratio } from '../domain/types';
import type { Echeance } from '../domain/calculs/provisions';
import { type Depense, type Faits, faitsVides } from './schema';
import {
  aTraiter, caEncaisseAnnee, etatPilote, moisCourant, recettesEncaissees, regimeDe,
  remunerationDuMois, sousAcreLe
} from './selecteurs';
import { etatLivre } from './selecteurs.livre';
import { etatAchats, regimeTvaAu } from './selecteurs.achats';

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
    expect(cfe?.contexte).toMatch(/disponible est surestimé/);
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
    expect(d?.intitule).toMatch(/1447-C/);
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
    expect(cfe?.contexte).toMatch(/réduite de moitié/);
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
