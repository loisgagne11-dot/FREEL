import { describe, expect, it } from 'vitest';
import { type Euros, dateISO, euros } from '../types';
import type { PieceAutoliquidee, PieceCollectee, PieceDeduite } from './dossierTva';
import { dossierTva, estComplet, estUnCredit, ventilationParTaux } from './dossierTva';

const DU = dateISO('2026-07-01');
const AU = dateISO('2026-09-30');

/** La ventilation suit le montant et la TVA de la pièce, sauf si le test la fixe. */
const encaissement = (o: Partial<PieceCollectee> = {}): PieceCollectee => {
  const p = {
    id: 'r1', numero: '2026-001', clientNom: 'Client',
    encaisseeLe: dateISO('2026-08-10'),
    montantHt: euros(5000), tva: euros(1000) as Euros | null, ...o
  };
  return { ...p, ventilation: o.ventilation !== undefined ? o.ventilation : ventilationParTaux(p.montantHt, p.tva, null) };
};

const achat = (o: Partial<PieceDeduite> = {}): PieceDeduite => ({
  id: 'd1', libelle: 'Matériel', payeeLe: dateISO('2026-08-05'),
  montantTtc: euros(1200), tvaRecuperable: euros(200), ...o
});

const dossier = (
  encaissements: readonly PieceCollectee[] = [],
  achats: readonly PieceDeduite[] = []
) => dossierTva({ du: DU, au: AU, encaissements, achats });

/**
 * LE PIÈGE QUI FAIT DÉCLARER FAUX.
 *
 * La TVA collectée sur les prestations de services est exigible à
 * l'ENCAISSEMENT (art. 269-2-c du CGI), pas à la facturation. C'est l'inverse
 * de la règle qui range les factures partout ailleurs dans cette application,
 * et les confondre décale toute une déclaration d'un trimestre.
 */
describe('quelle date fait entrer une facture dans la déclaration', () => {
  it('retient une facture ENCAISSÉE dans la période', () => {
    const d = dossier([encaissement({ encaisseeLe: dateISO('2026-08-10') })]);
    expect(d.encaissements).toHaveLength(1);
    expect(d.collectee).toBe(1000);
  });

  /**
   * LE CAS QUI COMPTE. Facture de juin réglée en août : elle relève du
   * trimestre d'AOÛT. La ranger sur juin la ferait déclarer un trimestre trop
   * tôt — et manquer au trimestre où elle est due.
   */
  it('ignore la date d’émission au profit de l’encaissement', () => {
    const dedans = dossier([encaissement({ encaisseeLe: dateISO('2026-07-02') })]);
    const dehors = dossier([encaissement({ encaisseeLe: dateISO('2026-06-30') })]);

    expect(dedans.encaissements).toHaveLength(1);
    expect(dehors.encaissements).toHaveLength(0);
    expect(dehors.collectee).toBe(0);
  });

  it('inclut les bornes de la période', () => {
    const d = dossier([
      encaissement({ id: 'a', encaisseeLe: DU }),
      encaissement({ id: 'b', encaisseeLe: AU })
    ]);
    expect(d.encaissements).toHaveLength(2);
  });

  it('range les encaissements dans l’ordre où ils sont tombés', () => {
    const d = dossier([
      encaissement({ id: 'tard', encaisseeLe: dateISO('2026-09-20') }),
      encaissement({ id: 'tot', encaisseeLe: dateISO('2026-07-05') })
    ]);
    expect(d.encaissements[0]?.id).toBe('tot');
  });
});

describe('TVA déductible sur les achats', () => {
  /** Elle se déduit sur la période de PAIEMENT, pas de facturation. */
  it('retient les dépenses payées dans la période', () => {
    const d = dossier([], [
      achat({ id: 'dedans', payeeLe: dateISO('2026-08-05') }),
      achat({ id: 'dehors', payeeLe: dateISO('2026-10-05') })
    ]);
    expect(d.achats).toHaveLength(1);
    expect(d.deductible).toBe(200);
  });

  /**
   * Une dépense sans TVA récupérable n'a rien à faire dans un dossier de
   * déclaration : l'y lister ferait chercher une ligne qui ne s'y trouvera
   * jamais.
   */
  it('écarte les dépenses sans TVA récupérable', () => {
    const d = dossier([], [achat({ tvaRecuperable: euros(0) })]);
    expect(d.achats).toHaveLength(0);
  });

  it('soustrait la déductible de la collectée', () => {
    const d = dossier([encaissement()], [achat()]);
    expect(d.collectee).toBe(1000);
    expect(d.deductible).toBe(200);
    expect(d.aPayer).toBe(800);
  });

  /**
   * Une déduction supérieure à la collecte est un CRÉDIT de TVA, pas une somme
   * à payer. Afficher « −450 € à payer » ferait chercher une erreur là où il y
   * a un droit.
   */
  it('annonce un crédit quand la déduction dépasse la collecte', () => {
    const d = dossier([encaissement({ tva: euros(100) })], [achat({ tvaRecuperable: euros(550) })]);
    expect(d.aPayer).toBe(-450);
    expect(estUnCredit(d)).toBe(true);
  });
});

/**
 * CE QU'ON NE SAIT PAS NE VAUT PAS ZÉRO.
 *
 * Sous-évaluer une TVA collectée est le sens dangereux de l'erreur : c'est
 * celui qui produit un rappel.
 */
describe('encaissements dont la TVA n’a pas été conservée', () => {
  it('les met à part au lieu de les compter pour zéro', () => {
    const d = dossier([
      encaissement({ id: 'connu', tva: euros(1000) }),
      encaissement({ id: 'inconnu', tva: null })
    ]);

    expect(d.collectee).toBe(1000);
    expect(d.encaissementsSansTva).toHaveLength(1);
    expect(d.encaissementsSansTva[0]?.id).toBe('inconnu');
  });

  it('déclare le dossier incomplet', () => {
    expect(estComplet(dossier([encaissement({ tva: null })]))).toBe(false);
    expect(estComplet(dossier([encaissement({ tva: euros(1000) })]))).toBe(true);
  });

  /**
   * Le chiffre d'affaires, lui, est connu : c'est le montant porté au livre.
   * Seule la taxe manque. La base doit donc rester complète, sinon deux lignes
   * du formulaire seraient fausses au lieu d'une.
   */
  it('garde la base hors taxes complète', () => {
    const d = dossier([
      encaissement({ id: 'a', montantHt: euros(5000), tva: euros(1000) }),
      encaissement({ id: 'b', montantHt: euros(3000), tva: null })
    ]);
    expect(d.baseHt).toBe(8000);
    expect(d.collectee).toBe(1000);
  });

  /** Une facture émise en franchise porte zéro de TVA, et c'est juste. */
  it('compte normalement une TVA à zéro', () => {
    const d = dossier([encaissement({ tva: euros(0) })]);
    expect(d.collectee).toBe(0);
    expect(estComplet(d)).toBe(true);
  });
});

describe('dossier vide', () => {
  it('ne fabrique rien à déclarer sur une période sans mouvement', () => {
    const d = dossier();
    expect(d.collectee).toBe(0);
    expect(d.deductible).toBe(0);
    expect(d.aPayer).toBe(0);
    expect(estUnCredit(d)).toBe(false);
    expect(estComplet(d)).toBe(true);
  });
});

/**
 * LA TVA AUTOLIQUIDÉE SE DÉCLARE, ET NE SE DÉDUIT QU'EN ASSUJETTISSEMENT.
 *
 * Chez un redevable, due et déductible sur la même déclaration : le solde ne
 * bouge pas, mais l'omettre rend la déclaration fausse. Chez un franchisé, elle
 * est due sans déduction : un vrai paiement que le dossier taisait.
 */
describe('les achats autoliquidés', () => {
  const auto = (o: Partial<PieceAutoliquidee> = {}): PieceAutoliquidee => ({
    id: 'a1', libelle: 'Hébergement', fournisseur: 'Fournisseur d’essai', provenance: 'ue',
    payeeLe: dateISO('2026-08-05'), baseHt: euros(100), tvaDue: euros(20),
    regime: 'assujetti', ...o
  });
  const avec = (autoliquidations: readonly PieceAutoliquidee[]) =>
    dossierTva({ du: DU, au: AU, encaissements: [encaissement()], achats: [], autoliquidations });

  // Si la règle sautait : la déclaration d'un redevable omettrait un achat de
  // service européen, ou son solde bougerait d'une TVA qui s'annule.
  it('chez un redevable, la TVA est due et déductible : le solde ne bouge pas', () => {
    const d = avec([auto({ baseHt: euros(100), tvaDue: euros(20), regime: 'assujetti' })]);
    expect(d.autoliquideeDue).toBe(20);
    expect(d.autoliquideeDeductible).toBe(20);
    expect(d.autoliquideeBase).toBe(100);
    expect(d.aPayer).toBe(avec([]).aPayer);
  });

  // Si la règle sautait : le franchisé croirait ne rien devoir, alors que la
  // provision retient déjà ces 20 €.
  it('en franchise, la TVA est due sans être déductible : elle s’ajoute au solde', () => {
    const d = avec([auto({ regime: 'franchise' })]);
    expect(d.autoliquideeDue).toBe(20);
    expect(d.autoliquideeDeductible).toBe(0);
    expect(d.aPayer).toBe(avec([]).aPayer + 20);
  });

  // Si la règle sautait : un achat de juin gonflerait la déclaration d'août.
  it('ignore un achat payé hors du trimestre', () => {
    const d = avec([auto({ payeeLe: dateISO('2026-06-30') }), auto({ id: 'a2', payeeLe: dateISO('2026-10-01') })]);
    expect(d.autoliquidations).toHaveLength(0);
    expect(d.autoliquideeDue).toBe(0);
  });

  it('retient chaque achat selon le régime de son propre mois de paiement', () => {
    const d = avec([
      auto({ id: 'a', regime: 'franchise', payeeLe: dateISO('2026-07-10') }),
      auto({ id: 'b', regime: 'assujetti', payeeLe: dateISO('2026-09-10') })
    ]);
    expect(d.autoliquideeDue).toBe(40);
    expect(d.autoliquideeDeductible).toBe(20);
    expect(d.aPayer).toBe(avec([]).aPayer + 20);
  });
});

/**
 * PAR TAUX, COMME LE FORMULAIRE LE DEMANDE.
 *
 * Trois sources, dans cet ordre : les lignes conservées, le taux unique que
 * trahit le rapport TVA / HT, sinon « à ventiler » — jamais une répartition
 * supposée.
 */
describe('la ventilation par taux', () => {
  const ligne = (quantite: number, prix: number, taux: number) =>
    ({ quantite, prixUnitaireHt: prix, tauxTva: taux });

  it('lit les lignes conservées, plusieurs taux compris', () => {
    expect(ventilationParTaux(euros(1000), euros(150), [ligne(5, 100, 0.2), ligne(1, 500, 0.1)])).toEqual([
      { taux: 0.2, base: 500, tva: 100 },
      { taux: 0.1, base: 500, tva: 50 }
    ]);
  });

  /** Le livre fait foi : des lignes qui le contredisent ne sont pas crues. */
  it('refuse des lignes qui ne retombent pas sur le livre', () => {
    expect(ventilationParTaux(euros(1000), euros(150), [ligne(4, 100, 0.2)])).toBeNull();
  });

  it('reconnaît le taux unique d’une facture sans lignes', () => {
    expect(ventilationParTaux(euros(1000), euros(55), null)).toEqual([{ taux: 0.055, base: 1000, tva: 55 }]);
  });

  /** Un avoir porte le taux de la facture qu'il annule, au signe opposé. */
  it('ventile un avoir au signe opposé', () => {
    expect(ventilationParTaux(euros(-1000), euros(-200), null)).toEqual([{ taux: 0.2, base: -1000, tva: -200 }]);
  });

  it('laisse à ventiler une facture mêlée sans lignes, et ne dit rien d’une TVA inconnue', () => {
    expect(ventilationParTaux(euros(1000), euros(150), null)).toBeNull();
    expect(ventilationParTaux(euros(1000), null, null)).toBeNull();
  });
});

describe('le dossier par taux', () => {
  it('cumule base et TVA par taux, avoirs déduits, du plus fort au plus faible', () => {
    const d = dossier([
      encaissement({ id: 'a', montantHt: euros(1000), tva: euros(200) }),
      encaissement({ id: 'b', montantHt: euros(400), tva: euros(40) }),
      encaissement({ id: 'avoir', montantHt: euros(-500), tva: euros(-100), avoir: true })
    ]);
    expect(d.parTaux).toEqual([
      { taux: 0.2, base: 500, tva: 100 },
      { taux: 0.1, base: 400, tva: 40 }
    ]);
  });

  /** Sa TVA compte au total ; sa base, elle, se répartit à la main. */
  it('compte à part la facture mêlée sans détail, sans la retirer du total', () => {
    const d = dossier([
      encaissement({ id: 'mele', numero: '2025-014', montantHt: euros(1000), tva: euros(150) }),
      encaissement({ id: 'net', montantHt: euros(1000), tva: euros(200) })
    ]);
    expect(d.aVentiler.map((e) => e.numero)).toEqual(['2025-014']);
    expect(d.collectee).toBe(350);
    expect(d.parTaux).toEqual([{ taux: 0.2, base: 1000, tva: 200 }]);
  });
});
