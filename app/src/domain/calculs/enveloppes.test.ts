import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import type { Echeance, VentilationProvisions } from './provisions';
import { enveloppesDeProvision } from './enveloppes';

function ventilation(p: Partial<VentilationProvisions> = {}): VentilationProvisions {
  return {
    urssaf: euros(0), tva: euros(0), impot: euros(0),
    cfe: euros(0), cfp: euros(0), ...p
  };
}

function echeance(
  id: string, nature: Echeance['nature'], montant: number, echeanceLe: string
): Echeance {
  return {
    id, nature,
    montant: euros(montant), montantPaye: euros(0),
    echeanceLe: dateISO(echeanceLe), payeeLe: null
  };
}

const parNature = (e: readonly { nature: string; couvert: number }[]) =>
  Object.fromEntries(e.map((x) => [x.nature, x.couvert]));

describe('couverture des enveloppes', () => {
  /**
   * L'ÉCHÉANCE LA PLUS PROCHE EST SERVIE D'ABORD, ET C'EST TOUT L'INTÉRÊT.
   *
   * 1 500 € sur le compte, 1 000 € d'URSSAF le 5 juillet et 1 000 € d'impôt le
   * 15 septembre. Un prorata rendrait deux enveloppes à 750 € — deux problèmes
   * également flous. Ici l'URSSAF est pleine et l'impôt à moitié : on voit
   * LAQUELLE ne passera pas, et il reste deux mois pour y faire quelque chose.
   */
  it('sert l’échéance la plus proche avant la suivante', () => {
    const e = enveloppesDeProvision(
      euros(1_500),
      ventilation({ urssaf: euros(1_000), impot: euros(1_000) }),
      [echeance('e1', 'urssaf', 1_000, '2026-07-05'),
        echeance('e2', 'impot', 1_000, '2026-09-15')]
    );

    const c = parNature(e);
    expect(c['urssaf']).toBe(1_000);
    expect(c['impot']).toBe(500);
  });

  /** Le sens de la règle se prouve en inversant les dates. */
  it('change de gagnante quand l’ordre des échéances s’inverse', () => {
    const e = enveloppesDeProvision(
      euros(1_500),
      ventilation({ urssaf: euros(1_000), impot: euros(1_000) }),
      [echeance('e1', 'urssaf', 1_000, '2026-09-15'),
        echeance('e2', 'impot', 1_000, '2026-07-05')]
    );

    const c = parNature(e);
    expect(c['impot']).toBe(1_000);
    expect(c['urssaf']).toBe(500);
  });

  /**
   * UNE DETTE SANS DATE PASSE APRÈS CELLES QUI EN ONT UNE.
   *
   * Rien n'obligera à la payer avant. La servir en premier laisserait à
   * découvert une échéance qui, elle, tombe dans trois semaines.
   */
  it('sert en dernier une nature dont rien n’est encore appelé', () => {
    const e = enveloppesDeProvision(
      euros(1_000),
      ventilation({ urssaf: euros(1_000), tva: euros(1_000) }),
      [echeance('e1', 'urssaf', 1_000, '2026-07-05')]
    );

    const c = parNature(e);
    expect(c['urssaf']).toBe(1_000);
    expect(c['tva']).toBe(0);
  });

  /** La couverture ne dépasse jamais le dû : un excédent n'est pas une provision. */
  it('ne couvre pas au-delà de ce qui est dû', () => {
    const e = enveloppesDeProvision(
      euros(10_000), ventilation({ urssaf: euros(1_000) }),
      [echeance('e1', 'urssaf', 1_000, '2026-07-05')]
    );

    expect(parNature(e)['urssaf']).toBe(1_000);
  });

  /** Un solde négatif ne couvre rien, et ne rend pas des montants négatifs. */
  it('ne couvre rien sur un compte à découvert', () => {
    const e = enveloppesDeProvision(
      euros(-500), ventilation({ urssaf: euros(1_000) }),
      [echeance('e1', 'urssaf', 1_000, '2026-07-05')]
    );

    expect(parNature(e)['urssaf']).toBe(0);
  });

  /**
   * LES VIGNETTES NE CHANGENT PAS DE PLACE.
   *
   * L'ordre de SERVICE suit les échéances ; l'ordre RENDU est celui, fixe, des
   * natures. Sans quoi une vignette se déplacerait d'un mois à l'autre parce
   * qu'une échéance est passée, et on ne saurait plus laquelle on regarde.
   */
  it('rend les natures dans leur ordre canonique, pas dans l’ordre de service', () => {
    const e = enveloppesDeProvision(
      euros(2_000),
      ventilation({ urssaf: euros(1_000), impot: euros(1_000) }),
      [echeance('e1', 'impot', 1_000, '2026-07-05'),
        echeance('e2', 'urssaf', 1_000, '2026-09-15')]
    );

    expect(e.map((x) => x.nature)).toEqual(['urssaf', 'tva', 'impot', 'cfe', 'cfp']);
  });

  /** Toutes les natures sont rendues, y compris à zéro : voir l'en-tête. */
  it('garde les natures vides plutôt que de décaler les autres', () => {
    const e = enveloppesDeProvision(euros(0), ventilation(), []);
    expect(e).toHaveLength(5);
    expect(e.every((x) => x.du === 0 && x.couvert === 0)).toBe(true);
  });

  /** Une échéance déjà payée n'est plus une provision : elle ne date rien. */
  it('ignore une échéance réglée', () => {
    const e = enveloppesDeProvision(
      euros(1_000), ventilation({ urssaf: euros(1_000) }),
      [{ ...echeance('e1', 'urssaf', 1_000, '2026-07-05'), payeeLe: dateISO('2026-07-05') }]
    );

    expect(e.find((x) => x.nature === 'urssaf')?.prochaineEcheance).toBeNull();
    expect(e.find((x) => x.nature === 'urssaf')?.appele).toBe(0);
  });

  /** La plus proche des deux échéances d'une même nature fait la date. */
  it('retient la plus proche quand une nature en porte plusieurs', () => {
    const e = enveloppesDeProvision(
      euros(3_000), ventilation({ urssaf: euros(3_000) }),
      [echeance('e1', 'urssaf', 1_000, '2026-10-05'),
        echeance('e2', 'urssaf', 2_000, '2026-07-05')]
    );

    const urssaf = e.find((x) => x.nature === 'urssaf');
    expect(urssaf?.prochaineEcheance).toBe('2026-07-05');
    expect(urssaf?.appele).toBe(3_000);
  });

  /** Un règlement partiel ne compte que pour ce qui reste à sortir. */
  it('ne compte comme appelé que le reste à payer', () => {
    const e = enveloppesDeProvision(
      euros(1_000), ventilation({ urssaf: euros(1_000) }),
      [{ ...echeance('e1', 'urssaf', 1_000, '2026-07-05'), montantPaye: euros(400) }]
    );

    expect(e.find((x) => x.nature === 'urssaf')?.appele).toBe(600);
  });
});
