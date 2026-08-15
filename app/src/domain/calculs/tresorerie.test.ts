import { describe, expect, it } from 'vitest';
import { euros } from '../types';
import type { DetailProvisions } from './provisions';
import { autonomieMois, calculerTresorerie } from './tresorerie';

const detail = (
  total: number, nonCalculables: readonly { id: string; motif: string }[] = []
): DetailProvisions => ({
  voletConstate: euros(total),
  voletAProvisionner: euros(0),
  total: euros(total),
  parNature: {
    urssaf: euros(total), tva: euros(0), impot: euros(0),
    cfe: euros(0), cfp: euros(0)
  },
  recettesNonCalculables: nonCalculables
});

describe('dispo et versable', () => {
  it('dispo retire les provisions du solde', () => {
    const r = calculerTresorerie({ solde: euros(10000), reserve: euros(0) }, detail(3000));
    expect(r.dispo).toBe(7000);
  });

  it('versable retire la réserve du dispo', () => {
    const r = calculerTresorerie({ solde: euros(10000), reserve: euros(2000) }, detail(3000));
    expect(r.versable).toBe(5000);
  });

  // Un dispo négatif doit rester visible tel quel — c'est une information —
  // mais on ne propose jamais de se verser une dette.
  it('montre un dispo négatif mais borne le versable à zéro', () => {
    const r = calculerTresorerie({ solde: euros(1000), reserve: euros(500) }, detail(3000));
    expect(r.dispo).toBe(-2000);
    expect(r.versable).toBe(0);
  });

  it('versable vaut zéro quand la réserve absorbe tout le dispo', () => {
    const r = calculerTresorerie({ solde: euros(5000), reserve: euros(5000) }, detail(0));
    expect(r.versable).toBe(0);
  });

  it('reporte le solde, les provisions et la réserve sans les altérer', () => {
    const r = calculerTresorerie({ solde: euros(8000), reserve: euros(1500) }, detail(2000));
    expect(r.solde).toBe(8000);
    expect(r.provisions).toBe(2000);
    expect(r.reserve).toBe(1500);
  });
});

describe('signalement d\'un calcul incomplet', () => {
  it('n\'est pas incomplet quand toutes les recettes sont calculables', () => {
    const r = calculerTresorerie({ solde: euros(10000), reserve: euros(0) }, detail(3000));
    expect(r.incomplet).toBe(false);
    expect(r.motifsIncomplets).toHaveLength(0);
  });

  // Sans ce signalement, un versable sous-évalué en provisions — donc trop
  // élevé — conduirait à se verser de l'argent déjà dû.
  it('est incomplet et porte les motifs dès qu\'une recette n\'est pas calculable', () => {
    const r = calculerTresorerie(
      { solde: euros(10000), reserve: euros(0) },
      detail(3000, [{ id: 'r1', motif: 'Barème absent pour 2019-03' }])
    );
    expect(r.incomplet).toBe(true);
    expect(r.motifsIncomplets).toContain('Barème absent pour 2019-03');
  });
});

describe('autonomie en mois', () => {
  it('divise le versable par le besoin mensuel, au dixième', () => {
    expect(autonomieMois(euros(6600), euros(2000))).toBe(3.3);
  });

  // L'ancienne version affichait une autonomie qui bondissait sans cause
  // réelle quand les dépenses de l'année tombaient à zéro au 1er janvier.
  it('ne renvoie rien plutôt qu\'un chiffre absurde si le besoin est nul ou absent', () => {
    expect(autonomieMois(euros(6600), euros(0))).toBeNull();
    expect(autonomieMois(euros(6600), euros(-100))).toBeNull();
  });

  it('vaut zéro quand il n\'y a rien à verser', () => {
    expect(autonomieMois(euros(0), euros(2000))).toBe(0);
  });
});
