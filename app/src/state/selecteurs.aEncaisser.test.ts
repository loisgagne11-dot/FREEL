import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import { type Faits, type Recette, faitsVides } from './schema';
import { etatPilote, fluxDuMois } from './selecteurs';
import { fluxDUnAutreMois } from './selecteurs.flux';
import { facturesAEncaisser } from './selecteurs.pipeline';

/*
 * Les factures qui attendent leur argent : une seule liste, lue par le flux du
 * mois, par le flux d'un autre mois et par le panneau qui les pointe.
 * Valeurs et noms fictifs.
 */
const AUJOURDHUI = dateISO('2026-06-10');

function recette(m: Partial<Recette> = {}): Recette {
  return {
    id: 'r', clientNom: 'Client démo', libelle: 'Prestation', montant: euros(1000),
    emiseLe: dateISO('2026-05-02'), encaisseeLe: null, modeReglement: null,
    numero: '2026-001', echeanceLe: dateISO('2026-06-01'), ...m
  };
}

function faits(recettes: readonly Recette[]): Faits {
  return { ...faitsVides(), recettes: [...recettes] };
}

/** Une facture impayée, puis l'avoir qui l'annule : ce que produit `annulerRecette`. */
const annulee = recette({ id: 'annulee', numero: '2026-002', montant: euros(700) });
const avoir = recette({
  id: 'annulee-annulation', numero: '2026-003', montant: euros(-700), annuleEcriture: 'annulee'
});

describe('les factures à encaisser', () => {
  it('ne garde que les factures émises, non réglées et non annulées', () => {
    const liste = facturesAEncaisser(faits([
      recette({ id: 'due' }),
      recette({ id: 'payee', numero: '2026-004', encaisseeLe: dateISO('2026-06-02'), modeReglement: 'virement' }),
      recette({ id: 'brouillon', numero: '2026-005', emiseLe: null, echeanceLe: null }),
      annulee, avoir
    ]), AUJOURDHUI);
    expect(liste.map((f) => f.recette.id)).toEqual(['due']);
  });

  /**
   * Quand un virement arrive, on cherche la facture la plus ancienne : c'est
   * elle qui est attendue, et elle qu'il faut relancer si rien ne vient.
   */
  it('met les retards en tête, le plus ancien d’abord, puis les échéances à venir', () => {
    const liste = facturesAEncaisser(faits([
      recette({ id: 'a-venir', numero: '2026-010', echeanceLe: dateISO('2026-07-01') }),
      recette({ id: 'retard-recent', numero: '2026-011', echeanceLe: dateISO('2026-06-05') }),
      recette({ id: 'retard-ancien', numero: '2026-012', echeanceLe: dateISO('2026-04-30') })
    ]), AUJOURDHUI);
    expect(liste.map((f) => f.recette.id)).toEqual(['retard-ancien', 'retard-recent', 'a-venir']);
    expect(liste.map((f) => f.statut)).toEqual(['en_retard', 'en_retard', 'emise']);
  });
});

/**
 * Une facture annulée et son avoir se compensaient dans le total, mais la
 * colonne affichait le client deux fois — dont une avec un montant négatif
 * « en attente ».
 */
describe('le flux ne montre plus une facture annulée en attente', () => {
  it('ni dans le mois courant', () => {
    const f = faits([recette({ id: 'due' }), annulee, avoir]);
    const flux = fluxDuMois(f, mois('2026-06'), etatPilote(f), [], AUJOURDHUI);
    expect(flux.entrees.lignes.map((l) => l.id)).toEqual(['due']);
    expect(flux.entrees.enAttente).toBe(1000);
  });

  it('ni dans un autre mois', () => {
    const f = faits([recette({ id: 'due' }), annulee, avoir]);
    const flux = fluxDUnAutreMois(f, mois('2026-06'), AUJOURDHUI);
    expect(flux.entrees.lignes.map((l) => l.id)).toEqual(['due']);
    expect(flux.entrees.attendu).toBe(1000);
  });
});
