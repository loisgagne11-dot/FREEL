import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../types';
import type { ContexteProvisions, Echeance, RecetteEncaissee } from './provisions';
import { provisions } from './provisions';
import { detailDette } from './detailDette';
import { PERIODES_URSSAF } from '../bareme/urssaf';

const CTX: ContexteProvisions = {
  typeActivite: 'BNC',
  sousAcreLe: () => false,
  tauxImpotEtContributions: 0.022,
  periodesUrssaf: PERIODES_URSSAF
};

const recette = (id: string, montant: number, encaisseeLe: string): RecetteEncaissee =>
  ({ id, montant: euros(montant), encaisseeLe: dateISO(encaisseeLe) });

const echeance = (o: Partial<Echeance> & { readonly id: string }): Echeance => ({
  nature: 'urssaf', montant: euros(1000),
  echeanceLe: dateISO('2026-07-05'), payeeLe: null, montantPaye: null,
  ...o
});

describe('détail d’une dette, mois par mois', () => {
  /**
   * LE POINT QUI TIENT TOUT LE RESTE.
   *
   * Ce module VENTILE les provisions, il ne les recalcule pas. Son total doit
   * retomber sur celui de `provisions()` — une seconde définition de la même
   * dette finirait par ne pas tomber d'accord avec la première, et l'écran
   * afficherait deux chiffres pour une seule notion.
   */
  it('retombe sur le total que les provisions annoncent', () => {
    const recettes = [
      recette('r1', 10_000, '2026-01-15'),
      recette('r2', 8_000, '2026-02-20'),
      recette('r3', 6_000, '2026-03-10')
    ];
    const declarees = { mois: [] };
    const p = provisions([], recettes, declarees, CTX);

    const urssaf = detailDette('urssaf', [], recettes, declarees, CTX);
    const impot = detailDette('impot', [], recettes, declarees, CTX);

    // La provision d'IR annuelle n'est pas ventilée par mois — elle n'a pas de
    // mois d'encaissement. Le contexte n'en pose pas ici, les deux totaux
    // doivent donc coïncider au centime.
    expect(urssaf.reste + impot.reste).toBeCloseTo(p.total, 2);
  });

  /** Un mois par ligne, et non une ligne par recette : c'est le mois qu'on
      déclare, pas la facture. */
  it('regroupe les encaissements par mois d’encaissement', () => {
    const d = detailDette('urssaf', [], [
      recette('r1', 5_000, '2026-01-10'),
      recette('r2', 5_000, '2026-01-28')
    ], { mois: [] }, CTX);

    const lignes = d.annees[0]?.lignes ?? [];
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.mois).toBe('2026-01');
    expect(lignes[0]?.statut).toBe('a_declarer');
  });

  /**
   * UNE PÉRIODE DÉCLARÉE SORT DE L'ESTIMATION.
   *
   * Sa dette est désormais matérialisée par une échéance, donc portée par le
   * volet 1. La compter des deux côtés la doublerait — c'est la même
   * exclusion que `voletAProvisionner`, et elle doit le rester.
   */
  it('retire de l’estimation un mois déjà déclaré', () => {
    const recettes = [recette('r1', 10_000, '2026-01-15')];
    const d = detailDette('urssaf', [], recettes, { mois: [mois('2026-01')] }, CTX);
    expect(d.annees).toHaveLength(0);
    expect(d.reste).toBe(0);
  });

  /**
   * DEUX ORIGINES QUI NE SE MÉLANGENT PAS. Une dette appelée se solde en
   * enregistrant son paiement ; une dette estimée avance en déclarant la
   * période. Les fondre ferait proposer « enregistrer le paiement » sur une
   * dette que personne n'a encore appelée.
   */
  it('distingue ce qui est appelé de ce qui est estimé', () => {
    const d = detailDette(
      'urssaf',
      [echeance({ id: 'e1', montant: euros(2_000), echeanceLe: dateISO('2026-02-05') })],
      [recette('r1', 10_000, '2026-05-15')],
      { mois: [] },
      CTX
    );

    const lignes = d.annees[0]?.lignes ?? [];
    const appelee = lignes.find((l) => l.echeanceId === 'e1');
    const estimee = lignes.find((l) => l.mois === '2026-05');

    expect(appelee?.statut).toBe('a_payer');
    expect(estimee?.statut).toBe('a_declarer');
    // Seule la ligne appelée porte de quoi enregistrer un paiement.
    expect(estimee?.echeanceId).toBeNull();
  });

  it('sépare ce qui est payé de ce qui reste dû', () => {
    const d = detailDette('urssaf', [
      echeance({ id: 'e1', montant: euros(2_000), payeeLe: dateISO('2026-02-06') }),
      echeance({ id: 'e2', montant: euros(3_000) })
    ], [], { mois: [] }, CTX);

    expect(d.paye).toBe(2_000);
    expect(d.reste).toBe(3_000);
  });

  /** L'année en cours en tête : c'est celle qu'on vient consulter. Trier à
      l'endroit obligerait à dérouler l'historique pour l'atteindre. */
  it('range les années de la plus récente à la plus ancienne', () => {
    const d = detailDette('urssaf', [
      echeance({ id: 'e1', echeanceLe: dateISO('2025-07-05') }),
      echeance({ id: 'e2', echeanceLe: dateISO('2026-07-05') })
    ], [], { mois: [] }, CTX);

    expect(d.annees.map((a) => a.annee)).toEqual([2026, 2025]);
  });

  /**
   * AUCUNE RÈGLE NE DÉDUIT UNE TVA D'UN ENCAISSEMENT.
   *
   * La TVA, la CFE et la CFP n'existent qu'appelées. En rendre une estimation
   * fabriquerait une dette que rien ne fonde — et elle s'ajouterait au total
   * affiché comme si elle était due.
   */
  it('n’estime rien pour une nature qui n’existe qu’appelée', () => {
    const d = detailDette('tva', [], [recette('r1', 10_000, '2026-01-15')], { mois: [] }, CTX);
    expect(d.reste).toBe(0);
    expect(d.annees).toHaveLength(0);
  });

  /**
   * UN TOTAL SILENCIEUSEMENT INCOMPLET EST PIRE QU'UNE ABSENCE DE TOTAL : il a
   * l'air d'une réponse. Quand le barème ne couvre pas un mois, on s'abstient
   * et l'écran doit pouvoir le dire.
   */
  it('signale les mois dont le taux n’est pas connu, sans les compter', () => {
    const d = detailDette('urssaf', [], [recette('r1', 10_000, '2015-01-15')], { mois: [] }, CTX);
    expect(d.nonCalculables).toHaveLength(1);
    expect(d.nonCalculables[0]?.mois).toBe('2015-01');
    expect(d.reste).toBe(0);
  });
});
