import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois, ratio } from '../domain/types';
import type { Depense } from '../domain/calculs/depenses';
import { type Echeance, LIBELLE_NATURE } from '../domain/calculs/provisions';
import { enveloppesDeProvision } from '../domain/calculs/enveloppes';
import { type Faits, faitsVides } from './schema';
import {
  etatPilote, impotRevenuAProvisionner, tvaAReverserDe, tvaAutoliqueeProvisionnee
} from './selecteurs';
import { compositionDe } from './selecteurs.composition';
import { detailDeLaDette } from './selecteurs.dette';

/*
 * Lot 13 — la TVA autoliquidée entre dans la provision de TVA, et le détail de
 * la dette « impôt » montre la provision d'impôt sur le revenu. Faits fictifs.
 */

const maintenant = new Date('2026-12-15T10:00:00');

/** 100 € HT facturés par un fournisseur de l'Union : 20 € de TVA due par l'acheteur. */
const achatUe = (o: Partial<Depense> = {}): Depense => ({
  id: 'd1', libelle: 'Abonnement', fournisseur: 'Logiciel démo', provenance: 'ue',
  montantTtc: euros(100), tauxTva: ratio(0.2), payeeLe: dateISO('2026-10-05'),
  justificatifId: null, rapprochement: 'sans_banque', ...o
});

const tva = (id: string, montant: number, payee: boolean): Echeance => ({
  id, nature: 'tva', montant: euros(montant), echeanceLe: dateISO('2026-11-24'),
  payeeLe: payee ? dateISO('2026-11-24') : null, montantPaye: payee ? euros(montant) : null
});

function franchise(modifications: Partial<Faits> = {}): Faits {
  return {
    ...faitsVides(),
    entreprise: { ...faitsVides().entreprise, versementLiberatoire: true },
    depenses: [achatUe()],
    ...modifications
  };
}

/**
 * Franchisé jusqu'en juin, redevable de la TVA à partir de juillet : l'achat
 * européen de mai doit 20 € (non déductibles, en franchise), la facture de
 * septembre 300 € de TVA collectée. Une déclaration, 320 €.
 */
function franchiPuisRedevable(modifications: Partial<Faits> = {}): Faits {
  return {
    ...faitsVides(),
    entreprise: { ...faitsVides().entreprise, versementLiberatoire: true, tvaDepuis: mois('2026-07') },
    recettes: [{
      id: 'r1', clientNom: 'Client démo', libelle: 'Mission', montant: euros(1500),
      emiseLe: dateISO('2026-09-01'), encaisseeLe: dateISO('2026-09-10'),
      modeReglement: 'virement', numero: '2026-001', tvaCollectee: euros(300)
    }],
    depenses: [achatUe({ payeeLe: dateISO('2026-05-05') })],
    ...modifications
  };
}

/** 300 € de TVA collectés sur une facture encaissée ; la TVA est appliquée depuis janvier. */
function assujetti(modifications: Partial<Faits> = {}): Faits {
  return {
    ...faitsVides(),
    entreprise: { ...faitsVides().entreprise, versementLiberatoire: true, tvaDepuis: mois('2026-01') },
    recettes: [{
      id: 'r1', clientNom: 'Client démo', libelle: 'Mission', montant: euros(1500),
      emiseLe: dateISO('2026-09-01'), encaisseeLe: dateISO('2026-09-10'),
      modeReglement: 'virement', numero: '2026-001', tvaCollectee: euros(300)
    }],
    // 120 € TTC à 20 % : la TVA contenue vaut 20 € chez un assujetti.
    depenses: [achatUe({ montantTtc: euros(120) })],
    ...modifications
  };
}

const provisionTva = (f: Faits): number => etatPilote(f, f.echeances, maintenant).provisionsParNature.tva;

/**
 * UN ACHAT DE SERVICE À L'UNION FAIT NAÎTRE UNE TVA DUE, FRANCHISE COMPRISE.
 *
 * Si la règle sautait, un franchisé qui paie 100 € HT un logiciel européen
 * verrait son versable trop haut de 20 € : l'application l'inviterait à se
 * verser de l'argent qu'il doit à l'administration.
 */
describe('TVA autoliquidée dans les provisions', () => {
  it('provisionne la TVA d’un achat à l’Union chez un franchisé, en hypothèse', () => {
    const f = franchise();
    expect(provisionTva(f)).toBe(20);

    const r = tvaAutoliqueeProvisionnee(f, maintenant);
    expect(r?.statut).toBe('hypothese');
    if (r?.statut === 'hypothese') {
      expect(r.valeur).toBe(20);
      expect(r.source).toContain('art. 283-2 du CGI');
      expect(r.source).toContain('à confirmer auprès de ton service des impôts');
    }
  });

  // Une dépense non payée n'a pas fait sortir d'argent : comme la TVA
  // déductible, la TVA autoliquidée se compte au paiement.
  it('ne provisionne rien tant que l’achat n’est pas payé', () => {
    const f = franchise({ depenses: [achatUe({ payeeLe: null })] });
    expect(provisionTva(f)).toBe(0);
    expect(tvaAutoliqueeProvisionnee(f, maintenant)).toBeNull();
  });

  // Aucune date d'échéance n'est inventée : la provision ne fabrique pas
  // d'échéance réglementaire, elle reste dans le volet 2 (non appelé).
  it('n’invente aucune échéance', () => {
    const f = franchise();
    expect(f.echeances).toHaveLength(0);
    expect(etatPilote(f, f.echeances, maintenant).voletConstate).toBe(0);
  });

  it('cesse de provisionner la TVA autoliquidée une fois l’échéance TVA réglée', () => {
    const f = franchise({ echeances: [tva('t1', 20, true)] });
    expect(provisionTva(f)).toBe(0);
    expect(tvaAutoliqueeProvisionnee(f, maintenant)).toBeNull();
  });

  /**
   * LE DOUBLE COMPTE QUE LE LOT ÉVITE.
   *
   * 300 € collectés + 20 € autoliquidés en franchise : une déclaration, un
   * paiement de 320 €. Si l'autoliquidée s'ajoutait APRÈS le retranchement des
   * échéances, 300 − 320 donnerait zéro puis + 20 : 20 € resteraient
   * provisionnés pour toujours, alors que tout a été payé.
   */
  it('additionne collectée et autoliquidée, sans double compte une fois payée', () => {
    expect(provisionTva(franchiPuisRedevable())).toBe(320);

    const reglee = franchiPuisRedevable({ echeances: [tva('t1', 320, true)] });
    expect(tvaAReverserDe(reglee)).toBe(0);
    expect(provisionTva(reglee)).toBe(0);
  });

  it('plafonne le « dont » à ce qui reste provisionné', () => {
    // 300 réglés sur 320 : il reste 20 à provisionner, pas plus de 20 de « dont ».
    const f = franchiPuisRedevable({ echeances: [tva('t1', 300, true)] });
    const r = tvaAutoliqueeProvisionnee(f, maintenant);
    expect(r?.statut === 'hypothese' ? r.valeur : null).toBe(20);

    // 310 réglés : il ne reste que 10.
    const g = franchiPuisRedevable({ echeances: [tva('t1', 310, true)] });
    const s = tvaAutoliqueeProvisionnee(g, maintenant);
    expect(s?.statut === 'hypothese' ? s.valeur : null).toBe(10);
  });

  /**
   * Chez un redevable, la TVA autoliquidée est due et déductible sur la même
   * déclaration : elle s'annule. La provisionner retenait chaque achat de
   * service européen d'un assujetti comme une dette qu'il n'a pas.
   */
  it('ne provisionne rien de plus pour un assujetti : l’autoliquidée s’annule', () => {
    expect(provisionTva(assujetti())).toBe(300);
    expect(tvaAutoliqueeProvisionnee(assujetti(), maintenant)).toBeNull();
  });
});

/**
 * LE DÉTAIL DE LA DETTE « IMPÔT » DIT CE QUE LE VERSABLE RETIENT.
 *
 * Il recevait `impotRevenu` sans le lire : il montrait le taux sur les
 * encaissements et taisait l'essentiel de l'impôt. L'écart avec la vignette
 * était exactement la provision d'impôt sur le revenu, sans que rien le dise.
 */
describe('détail de la dette « impôt »', () => {
  const auBareme = (): Faits => ({
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
    versementPerDeductible: euros(0)
  });

  it('montre la provision d’impôt sur le revenu, au chiffre de la fonction du versable', () => {
    const f = auBareme();
    const attendu = impotRevenuAProvisionner(f, maintenant);
    expect(attendu?.statut).not.toBe('refuse');
    expect(attendu && attendu.statut !== 'refuse' ? attendu.valeur : 0).toBeGreaterThan(0);

    const detail = detailDeLaDette(f, 'impot', maintenant);
    expect(detail.impotRevenu).toEqual(attendu);
  });

  it('ne montre rien d’impôt sur le revenu sous le versement libératoire', () => {
    const f = { ...auBareme(), entreprise: { ...faitsVides().entreprise, versementLiberatoire: true } };
    expect(detailDeLaDette(f, 'impot', maintenant).impotRevenu).toBeNull();
  });

  it('ne mêle pas la provision d’impôt au détail des autres natures', () => {
    expect(detailDeLaDette(auBareme(), 'urssaf', maintenant).impotRevenu).toBeNull();
  });
});

/**
 * UNE NOTION, UNE SOURCE : QUATRE LECTEURS, UN CHIFFRE.
 *
 * Si l'un des lecteurs recalculait la TVA ou l'impôt de son côté, le Pilote
 * annoncerait un versable et l'enveloppe un autre dû, pour la même dette.
 */
describe('accord du Pilote, de la composition, des enveloppes et de la dette', () => {
  const f: Faits = {
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
    // Payé en mai, avant le franchissement du seuil : en franchise, donc dû
    // et non déductible. Payé après, il s'annulerait (due et déductible).
    depenses: [achatUe({ payeeLe: dateISO('2026-05-05') })]
  };

  it('donnent la même TVA', () => {
    const pilote = etatPilote(f, f.echeances, maintenant);
    const composition = compositionDe(f, 'provisions', maintenant)
      .termes.find((t) => t.libelle === LIBELLE_NATURE.tva);
    const enveloppe = enveloppesDeProvision(pilote.tresorerie.solde, pilote.provisionsParNature, f.echeances)
      .find((e) => e.nature === 'tva');
    const detail = detailDeLaDette(f, 'tva', maintenant).tvaAutoliquidee;

    // Le chiffre importe moins que le fait que les quatre lecteurs le
    // partagent.
    const attendu = tvaAReverserDe(f);
    expect(attendu).toBeGreaterThan(0);
    expect(pilote.provisionsParNature.tva).toBe(attendu);
    expect(composition?.montant).toBe(attendu);
    expect(enveloppe?.du).toBe(attendu);
    expect(detail?.statut === 'hypothese' ? detail.valeur : null).toBe(attendu);
  });

  it('donnent le même impôt', () => {
    const pilote = etatPilote(f, f.echeances, maintenant);
    const ir = impotRevenuAProvisionner(f, maintenant);
    const valeur = ir && ir.statut !== 'refuse' ? ir.valeur : NaN;
    const composition = compositionDe(f, 'provisions', maintenant)
      .termes.find((t) => t.libelle === LIBELLE_NATURE.impot);
    const enveloppe = enveloppesDeProvision(pilote.tresorerie.solde, pilote.provisionsParNature, f.echeances)
      .find((e) => e.nature === 'impot');
    const detail = detailDeLaDette(f, 'impot', maintenant).impotRevenu;

    expect(valeur).toBeGreaterThan(0);
    // Au barème, `impot` ne porte que l'IR : la CFP a sa propre nature.
    expect(pilote.provisionsParNature.impot).toBeCloseTo(valeur, 2);
    expect(composition?.montant).toBeCloseTo(valeur, 2);
    expect(enveloppe?.du).toBeCloseTo(valeur, 2);
    expect(detail?.statut === 'refuse' ? NaN : detail?.valeur).toBe(valeur);
  });
});
