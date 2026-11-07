import { describe, expect, it } from 'vitest';
import { dateISO, euros, ratio } from '../types';
import type { Depense } from './depenses';
import { depensesRecurrentes, normaliserFournisseur } from './depenses.recurrence';

const dep = (id: string, fournisseur: string, date: string | null, ttc: number): Depense => ({
  id, libelle: '', fournisseur, provenance: 'france', montantTtc: euros(ttc),
  tauxTva: ratio(0.2), payeeLe: date === null ? null : dateISO(date),
  justificatifId: null, rapprochement: 'en_attente'
});

describe('dépenses récurrentes (dérivées)', () => {
  // Un abonnement mensuel doit être reconnu à chaque mensualité, la première
  // et la dernière comprises : exiger précédente ET suivante les exclurait.
  it('reconnaît chaque mensualité d’un abonnement régulier, extrémités comprises', () => {
    const r = depensesRecurrentes([
      dep('a', 'OVH', '2026-04-03', 36),
      dep('b', 'OVH', '2026-05-03', 36),
      dep('c', 'OVH', '2026-06-03', 36)
    ]);
    expect([...r].sort()).toEqual(['a', 'b', 'c']);
  });

  // Un fournisseur qui facture 36 € puis 90 € n'est pas un abonnement.
  it('ne reconnaît pas une dépense dont le montant change', () => {
    expect(depensesRecurrentes([
      dep('a', 'OVH', '2026-04-03', 36),
      dep('b', 'OVH', '2026-05-03', 90)
    ]).size).toBe(0);
  });

  it('tolère un euro d’écart, pas davantage', () => {
    expect(depensesRecurrentes([
      dep('a', 'OVH', '2026-04-03', 36),
      dep('b', 'OVH', '2026-05-03', 36.9)
    ]).size).toBe(2);
    expect(depensesRecurrentes([
      dep('a', 'OVH', '2026-04-03', 36),
      dep('b', 'OVH', '2026-05-03', 37.5)
    ]).size).toBe(0);
  });

  // Avril et juin sans mai ne sont pas voisins : le trou rompt la chaîne.
  it('ne relie pas deux mois séparés par un trou', () => {
    expect(depensesRecurrentes([
      dep('a', 'OVH', '2026-04-03', 36),
      dep('b', 'OVH', '2026-06-03', 36)
    ]).size).toBe(0);
  });

  // Un achat fait deux fois dans le mois n'est pas un abonnement.
  it('ne prend pas deux dépenses du même mois pour une récurrence', () => {
    expect(depensesRecurrentes([
      dep('a', 'Fnac', '2026-04-03', 62),
      dep('b', 'Fnac', '2026-04-20', 62)
    ]).size).toBe(0);
  });

  it('enjambe le changement d’année', () => {
    expect(depensesRecurrentes([
      dep('a', 'OVH', '2025-12-03', 36),
      dep('b', 'OVH', '2026-01-03', 36)
    ]).size).toBe(2);
  });

  it('compare les fournisseurs sans tenir compte de la casse ni des accents', () => {
    expect(normaliserFournisseur('  Électricité  DE  France ')).toBe('electricite de france');
    expect(depensesRecurrentes([
      dep('a', 'Café Lumen', '2026-04-03', 20),
      dep('b', 'cafe  lumen', '2026-05-03', 20)
    ]).size).toBe(2);
  });

  // Deux achats anonymes de même montant ne font pas un abonnement.
  it('n’apparie ni fournisseurs différents, ni fournisseurs vides, ni dépenses sans date', () => {
    expect(depensesRecurrentes([
      dep('a', 'OVH', '2026-04-03', 36), dep('b', 'AXA', '2026-05-03', 36),
      dep('c', '', '2026-04-03', 10), dep('d', '', '2026-05-03', 10),
      dep('e', 'WeWork', null, 50), dep('f', 'WeWork', '2026-05-03', 50)
    ]).size).toBe(0);
  });
});
