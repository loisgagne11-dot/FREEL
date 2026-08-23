import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../domain/types';
import { type Faits, faitsVides } from './schema';
import { evolutionCompte } from './selecteurs.argent';

/**
 * LE GRAPHE « ÉVOLUTION DU COMPTE » (lot L1).
 *
 * Trois défauts remontés par l'utilisateur, sur une seule carte : un graphe
 * peu lisible, qui ignorait la bascule d'année et projetait un disponible
 * « sans rien te verser » à la place du solde réel. Ce fichier tient la
 * frontière qui rend le solde réel possible : un mois clos est un FAIT
 * exact, un mois à venir reste une HYPOTHÈSE — jamais l'inverse.
 */

const MAINTENANT = new Date('2026-06-10T09:00:00Z');

function poser(m: Partial<Faits> = {}): Faits {
  return {
    ...faitsVides(),
    soldeInitial: euros(10_000),
    soldeInitialAu: dateISO('2026-01-01'),
    ...m
  } as Faits;
}

const recette = (id: string, montant: number, le: string) => ({
  id, clientNom: 'Client d’essai', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO(le), encaisseeLe: dateISO(le),
  modeReglement: 'virement' as const, numero: id
});

const depense = (le: string, montant: number) => ({
  id: `dep-${le}`, libelle: 'Matériel', fournisseur: 'Fournisseur d’essai', provenance: 'france' as const,
  montantTtc: euros(montant), tauxTva: 0.20 as never, payeeLe: dateISO(le),
  justificatifId: null, rapprochement: 'en_attente' as const
});

describe('évolution du compte — la frontière entre le fait et l’hypothèse', () => {
  /**
   * LE SOLDE DE FIN DE MOIS D'UN MOIS PASSÉ EST UN FAIT.
   *
   * Sans cette règle, le graphe redeviendrait ce que l'utilisateur a
   * explicitement rejeté : une hypothèse là où le dossier connaît la réponse
   * exacte.
   */
  it('vaut ce que les faits disent pour un mois déjà clos', () => {
    const faits = poser({
      recettes: [recette('r1', 4000, '2026-03-10')]
    });

    const evolution = evolutionCompte(faits, 2026, MAINTENANT);
    const mars = evolution.find((m) => m.mois === '2026-03');

    expect(mars?.estProjete).toBe(false);
    // 10 000 (solde initial au 1er janvier) + 4 000 (la recette de mars).
    expect(mars?.niveau).toBe(14_000);
    expect(mars?.entrees).toBe(4000);
  });

  /**
   * UN MOIS À VENIR EST MARQUÉ COMME PROJETÉ, JAMAIS COMME UN FAIT.
   *
   * C'est la garantie que l'écran ne dessinera pas une hypothèse avec le même
   * trait qu'un solde réel — la confusion que l'infobulle de la carte existe
   * pour prévenir.
   */
  it('marque un mois à venir comme projeté, et non comme un fait', () => {
    const faits = poser();
    const evolution = evolutionCompte(faits, 2026, MAINTENANT);
    const decembre = evolution.find((m) => m.mois === '2026-12');

    expect(decembre?.estProjete).toBe(true);
  });

  // Le mois courant lui-même est un fait : rien n'existe encore après
  // « maintenant », donc son solde de fin de mois est simplement le solde
  // d'aujourd'hui — pas une hypothèse de plus.
  it('traite le mois courant comme un fait, pas comme une projection', () => {
    const faits = poser();
    const evolution = evolutionCompte(faits, 2026, MAINTENANT);
    const juin = evolution.find((m) => m.mois === '2026-06');

    expect(juin?.estProjete).toBe(false);
  });

  /**
   * CHANGER D'ANNÉE CHANGE LES MOIS COUVERTS.
   *
   * Avant ce lot, la carte ignorait la bascule d'année et projetait toujours
   * douze mois glissants depuis aujourd'hui — le deuxième défaut remonté.
   */
  it('couvre janvier à décembre de l’année choisie, pas un rouleau de douze mois', () => {
    const faits = poser();

    const surAnneeChoisie = evolutionCompte(faits, 2025, MAINTENANT);
    expect(surAnneeChoisie).toHaveLength(12);
    expect(surAnneeChoisie[0]?.mois).toBe('2025-01');
    expect(surAnneeChoisie[11]?.mois).toBe('2025-12');

    const surAnneeCourante = evolutionCompte(faits, 2026, MAINTENANT);
    expect(surAnneeCourante[0]?.mois).toBe('2026-01');
    expect(surAnneeCourante[11]?.mois).toBe('2026-12');
  });

  /**
   * SUR UNE ANNÉE PASSÉE, AUCUN MOIS N'EST PROJETÉ.
   *
   * Toute l'année est close : il n'y a plus rien à deviner, et la courbe
   * entière doit se dessiner comme un fait.
   */
  it('ne projette aucun mois sur une année déjà terminée', () => {
    const faits = poser();
    const evolution = evolutionCompte(faits, 2025, MAINTENANT);

    expect(evolution.every((m) => !m.estProjete)).toBe(true);
  });

  // Le pendant : une année future déjà annoncée par un fait est projetée en
  // entier, y compris janvier — rien n'y est encore un fait.
  it('projette l’année entière quand elle est encore à venir', () => {
    const faits = poser();
    const evolution = evolutionCompte(faits, 2027, MAINTENANT);

    expect(evolution.every((m) => m.estProjete)).toBe(true);
    expect(evolution).toHaveLength(12);
  });

  it('compte les dépenses et les échéances payées dans les sorties d’un mois clos', () => {
    const faits = poser({
      depenses: [depense('2026-02-10', 500)],
      echeances: [{
        id: 'e1', nature: 'urssaf', montant: euros(800), montantPaye: euros(800),
        echeanceLe: dateISO('2026-02-05'), payeeLe: dateISO('2026-02-05')
      }]
    });

    const evolution = evolutionCompte(faits, 2026, MAINTENANT);
    const fevrier = evolution.find((m) => m.mois === '2026-02');

    expect(fevrier?.sorties).toBe(1300);
  });
});

/**
 * AVANT LE SOLDE DE DÉPART, IL N'Y A RIEN À SAVOIR.
 *
 * La dérivation ne compte que les faits POSTÉRIEURS à `soldeInitialAu` : ceux
 * d'avant sont réputés déjà contenus dans le montant saisi. C'est juste pour
 * le solde d'aujourd'hui, et faux pour un mois antérieur à cette date.
 *
 * Un dossier réel l'a montré : sur une année d'avant, des barres
 * d'encaissement bien visibles de juillet à décembre, et une courbe immobile
 * au montant de départ au-dessus. Aucune des deux ne mentait — les
 * encaissements ont eu lieu, et le solde de ces mois-là est simplement
 * inconnu — mais rien ne disait laquelle croire.
 */
describe('une année antérieure au solde de départ', () => {
  const faits = poser({
    soldeInitialAu: dateISO('2026-01-29'),
    recettes: [
      recette('r1', 5_000, '2025-07-15'),
      recette('r2', 8_000, '2025-11-20')
    ]
  });

  it('ne prétend connaître aucun solde de cette année-là', () => {
    const mois = evolutionCompte(faits, 2025, MAINTENANT);
    expect(mois.every((m) => m.niveau === null)).toBe(true);
  });

  /**
   * Les FLUX, eux, sont connus : ce sont des écritures datées. Les taire
   * aussi ferait disparaître une année entière d'activité de l'écran, alors
   * que seule la position du compte manque.
   */
  it('montre quand même les encaissements de l’année', () => {
    const mois = evolutionCompte(faits, 2025, MAINTENANT);
    expect(mois.find((m) => m.mois === '2025-07')?.entrees).toBe(5_000);
    expect(mois.find((m) => m.mois === '2025-11')?.entrees).toBe(8_000);
  });

  /** L'année qui contient la date d'ancrage reprend son solde à partir du mois
      où il devient connu, et pas avant. */
  it('reprend le solde au mois où il devient connu', () => {
    const mois = evolutionCompte(faits, 2026, MAINTENANT);
    expect(mois.find((m) => m.mois === '2026-01')?.niveau).not.toBeNull();
  });
});
