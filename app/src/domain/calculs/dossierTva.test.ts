import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import type { PieceCollectee, PieceDeduite } from './dossierTva';
import { dossierTva, estComplet, estUnCredit } from './dossierTva';

const DU = dateISO('2026-07-01');
const AU = dateISO('2026-09-30');

const encaissement = (o: Partial<PieceCollectee> = {}): PieceCollectee => ({
  id: 'r1', numero: '2026-001', clientNom: 'Client',
  encaisseeLe: dateISO('2026-08-10'),
  montantHt: euros(5000), tva: euros(1000), ...o
});

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
