import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import { type FactureSuivie, type StatutFacture, suivre } from './facturier';
import { recouvrementDe } from './recouvrement';

const AUJOURDHUI = dateISO('2026-06-10');
const SECOURS = () => dateISO('2026-07-10');

interface Brouillon {
  readonly numero: string;
  readonly montant: number;
  readonly clientNom?: string;
  readonly emiseLe?: string | null;
  readonly envoyeeLe?: string | null;
  readonly encaisseeLe?: string | null;
  readonly annuleEcriture?: string | null;
}

/** Une facture passée par `suivre`, pour que son statut soit celui du domaine. */
function facturesDe(bruts: readonly Brouillon[]): readonly FactureSuivie[] {
  const recettes = bruts.map((b) => ({
    id: b.numero,
    clientNom: b.clientNom ?? 'Client de démonstration',
    libelle: 'prestation',
    montant: euros(b.montant),
    numero: b.numero,
    emiseLe: b.emiseLe === undefined ? dateISO('2026-04-01') : (b.emiseLe as never),
    envoyeeLe: b.envoyeeLe === undefined ? null : (b.envoyeeLe as never),
    encaisseeLe: (b.encaisseeLe ?? null) as never,
    echeanceLe: dateISO('2026-05-01'),
    annuleEcriture: b.annuleEcriture ?? null,
    tvaCollectee: euros(0)
  }));
  return suivre(recettes, SECOURS, AUJOURDHUI);
}

const statuts = (f: readonly FactureSuivie[]): readonly StatutFacture[] => f.map((x) => x.statut);

/**
 * LE POINT DE L'INDICATEUR.
 *
 * L'ancienne application comptait les FACTURES : `nb payées / nb émises`. Une
 * facture de 300 € réglée et une de 12 000 € impayée donnaient 50 %, ce qui
 * décrit une situation confortable là où 97,6 % du chiffre d'affaires manque.
 * C'est l'écart assumé avec l'ancienne, et c'est une correction.
 */
describe('le taux se mesure en euros, pas en factures', () => {
  it('ne dit pas 50 % quand la moitié des factures pèse 2 % de l’argent', () => {
    const r = recouvrementDe(facturesDe([
      { numero: 'F-1', montant: 300, encaisseeLe: '2026-04-20' },
      { numero: 'F-2', montant: 12_000 }
    ]));

    expect(r.facture).toBe(12_300);
    expect(r.encaisse).toBe(300);
    expect(r.taux).toBeCloseTo(0.0244, 4);
    expect(r.resteARentrer).toBe(12_000);
  });

  /**
   * ZÉRO FACTURÉ N'EST PAS ZÉRO POUR CENT.
   *
   * « 0 % de recouvrement » sur un trimestre sans facture décrit un échec là où
   * il n'y a eu aucune tentative — et c'est le premier trimestre de toute
   * activité qui commence.
   */
  it('s’abstient quand rien n’a été facturé', () => {
    expect(recouvrementDe([]).taux).toBeNull();
    expect(recouvrementDe(facturesDe([
      { numero: 'F-1', montant: 1_000, emiseLe: null }
    ])).taux).toBeNull();
  });
});

/**
 * UN AVOIR N'EST PAS UN ÉCHEC DE RECOUVREMENT.
 *
 * Compter les annulations dans l'assiette ferait baisser le taux à chaque
 * correction d'erreur — ce qui punirait exactement le bon geste. Un brouillon,
 * lui, n'a jamais été réclamé à personne.
 */
describe('l’assiette', () => {
  it('ignore les brouillons', () => {
    const f = facturesDe([
      { numero: 'F-1', montant: 1_000, encaisseeLe: '2026-04-20' },
      { numero: '', montant: 9_000, emiseLe: null }
    ]);
    expect(statuts(f)).toContain('brouillon');
    expect(recouvrementDe(f).facture).toBe(1_000);
    expect(recouvrementDe(f).taux).toBe(1);
  });

  it('ignore une facture annulée et son avoir', () => {
    const f = facturesDe([
      { numero: 'F-1', montant: 1_000, encaisseeLe: '2026-04-20' },
      { numero: 'F-2', montant: 5_000 },
      { numero: 'AV-2', montant: -5_000, annuleEcriture: 'F-2' }
    ]);
    expect(recouvrementDe(f).facture).toBe(1_000);
    expect(recouvrementDe(f).taux).toBe(1);
  });
});

/**
 * L'ENVOI D'ABORD, L'ÉMISSION EN SECOURS.
 *
 * Un client ne peut pas régler une facture qu'il n'a pas reçue. Compter depuis
 * l'émission lui imputerait les jours pendant lesquels le document a dormi
 * dans un dossier — le cas ordinaire en fin de mois, où l'on établit d'un coup
 * et où l'on envoie ensuite.
 */
describe('le délai court depuis la mise en recouvrement', () => {
  it('part de la date d’envoi quand elle existe', () => {
    const r = recouvrementDe(facturesDe([{
      numero: 'F-1', montant: 1_000,
      emiseLe: '2026-04-01', envoyeeLe: '2026-04-16', encaisseeLe: '2026-05-26'
    }]));
    // 16 avril → 26 mai = 40 jours, et non 55 depuis l'émission.
    expect(r.delaiMedian).toBe(40);
  });

  it('retombe sur l’émission pour une facture d’avant le schéma 8', () => {
    const r = recouvrementDe(facturesDe([{
      numero: 'F-1', montant: 1_000,
      emiseLe: '2026-04-01', envoyeeLe: null, encaisseeLe: '2026-05-26'
    }]));
    expect(r.delaiMedian).toBe(55);
  });

  /**
   * UN DÉLAI NÉGATIF N'EXISTE PAS.
   *
   * Une facture encaissée avant sa date d'envoi est une saisie incohérente. La
   * laisser passer tirerait la médiane sous zéro et l'écran annoncerait des
   * règlements d'avance — plus troublant que la saisie qui l'a produit.
   */
  it('borne à zéro un encaissement antérieur à l’envoi', () => {
    const r = recouvrementDe(facturesDe([{
      numero: 'F-1', montant: 1_000,
      emiseLe: '2026-04-01', envoyeeLe: '2026-05-20', encaisseeLe: '2026-04-20'
    }]));
    expect(r.delaiMedian).toBe(0);
  });
});

/**
 * LA MÉDIANE DÉCRIT CE QUI ARRIVE, LA MOYENNE DÉCRIT UN CLIENT QUI N'EXISTE
 * PAS. Leur écart, lui, est l'information : il signale qu'un dossier traîne.
 */
describe('médiane et moyenne', () => {
  const dossierQuiTraine = () => recouvrementDe(facturesDe([
    { numero: 'F-1', montant: 1_000, envoyeeLe: '2026-04-01', encaisseeLe: '2026-05-01' },
    { numero: 'F-2', montant: 1_000, envoyeeLe: '2026-04-01', encaisseeLe: '2026-05-01' },
    { numero: 'F-3', montant: 1_000, envoyeeLe: '2026-04-01', encaisseeLe: '2026-05-01' },
    { numero: 'F-4', montant: 1_000, envoyeeLe: '2026-01-05', encaisseeLe: '2026-06-05' }
  ]));

  it('rend 30 jours en médiane là où la moyenne en dit 60', () => {
    const r = dossierQuiTraine();
    // Trois règlements à 30 jours et un à 151 : la moyenne décrit un délai
    // auquel rien n'est jamais arrivé.
    expect(r.delaiMedian).toBe(30);
    expect(r.delaiMoyen).toBe(60);
    expect(r.nombreMesure).toBe(4);
  });

  it('met le dossier le plus long en tête : c’est celui qu’on vient chercher', () => {
    expect(dossierQuiTraine().delais[0]?.numero).toBe('F-4');
  });
});

/**
 * TOUTE FACTURE ENCAISSÉE EST MESURABLE, ET C'EST UNE PROPRIÉTÉ DE `suivre`.
 *
 * `statutDe` classe en BROUILLON toute recette sans date d'émission — une
 * facture ne peut donc être « encaissée » qu'en en portant une, et
 * `depuisQuand` retombe dessus à défaut d'envoi. `nonMesurables` vaut zéro sur
 * tout ce que `suivre` produit.
 *
 * Le compteur reste, et ce test dit pourquoi : il empêche qu'un changement
 * futur de `statutDe` fasse disparaître des factures de la médiane SANS RIEN
 * DIRE. Le jour où il cesse de valoir zéro, c'est ce test qui l'annonce — et
 * la médiane calculée sur trois factures cessera de ressembler à une médiane
 * calculée sur trente.
 */
describe('ce que le recouvrement avoue', () => {
  it('ne perd aucune facture encaissée en route', () => {
    const r = recouvrementDe(facturesDe([
      { numero: 'F-1', montant: 1_000, envoyeeLe: '2026-04-01', encaisseeLe: '2026-05-01' },
      { numero: 'F-2', montant: 1_000, envoyeeLe: null, encaisseeLe: '2026-05-01' },
      // Sans date d'émission : `suivre` en fait un brouillon, pas une facture
      // encaissée. Elle ne compte donc nulle part, et c'est le bon traitement.
      { numero: '', montant: 9_000, emiseLe: null, encaisseeLe: '2026-05-01' }
    ]));

    expect(r.nonMesurables).toBe(0);
    expect(r.nombreMesure).toBe(2);
    expect(r.encaisse).toBe(2_000);
  });
});
