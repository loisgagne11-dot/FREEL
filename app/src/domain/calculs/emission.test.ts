import { describe, expect, it } from 'vitest';
import { dateISO, mois } from '../types';
import { emiseParFreel, moisFactureDe, numeroDejaPris } from './emission';

describe('la provenance d’une facture', () => {
  /* Toute facture d'avant le schéma 29 a été produite par FREEL. Lire
     l'absence comme « ailleurs » retirerait « Revoir la facture » à tout
     l'historique — le chemin qu'on prend quand un client redemande sa facture. */
  it('une facture sans provenance dite est de FREEL', () => {
    expect(emiseParFreel({})).toBe(true);
    expect(emiseParFreel({ emisePar: 'freel' })).toBe(true);
    expect(emiseParFreel({ emisePar: 'externe' })).toBe(false);
  });
});

describe('le mois qu’une facture couvre', () => {
  /*
   * La facture d'août émise le 2 septembre : lue à sa date d'émission, elle
   * couvrirait septembre, et août resterait « à enregistrer » alors qu'il est
   * facturé — pendant que septembre, lui, sortirait de la liste sans l'être.
   */
  it('le mois dit l’emporte sur celui de l’émission', () => {
    expect(moisFactureDe({ moisFacture: mois('2026-08'), emiseLe: dateISO('2026-09-02') })).toBe('2026-08');
  });

  it('faute de mois dit, celui de l’émission — la règle d’avant', () => {
    expect(moisFactureDe({ moisFacture: null, emiseLe: dateISO('2026-09-02') })).toBe('2026-09');
    expect(moisFactureDe({ emiseLe: dateISO('2026-09-02') })).toBe('2026-09');
  });

  /* Un brouillon n'est pas émis : il ne facture aucun mois, même s'il en dit un. */
  it('un brouillon ne couvre aucun mois', () => {
    expect(moisFactureDe({ moisFacture: mois('2026-08'), emiseLe: null })).toBeNull();
  });
});

describe('un numéro de facture déjà pris', () => {
  const livre = [
    { numero: 'F-2026-0012' },
    { numero: '2026-001' },
    // L'avoir recopie le numéro de la facture qu'il annule : c'est son rôle.
    { numero: 'F-2026-0013', annuleEcriture: 'r-13' }
  ];

  /* Deux écritures pour une même pièce : un chiffre d'affaires compté deux fois. */
  it('se reconnaît sans la casse ni les blancs', () => {
    expect(numeroDejaPris('F-2026-0012', livre)).toBe(true);
    expect(numeroDejaPris('  f-2026-0012 ', livre)).toBe(true);
    expect(numeroDejaPris('F-2026-0014', livre)).toBe(false);
  });

  it('ignore le numéro recopié par un avoir, et un numéro vide', () => {
    expect(numeroDejaPris('F-2026-0013', livre)).toBe(false);
    expect(numeroDejaPris('   ', [{ numero: '' }])).toBe(false);
  });
});
