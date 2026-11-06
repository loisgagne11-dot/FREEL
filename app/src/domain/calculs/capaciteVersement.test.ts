import { describe, expect, it } from 'vitest';
import { type Mois, type Resolution, dateISO, euros, mois } from '../types';
import { capaciteDuMois, natureDuMois } from './capaciteVersement';

const publie = (valeur: number): Resolution<number> => ({
  statut: 'publie', valeur, source: 'table d’essai', verifieLe: dateISO('2026-01-01')
});

const hypothese = (valeur: number): Resolution<number> => ({
  statut: 'hypothese', valeur, source: 'table d’essai',
  verifieLe: dateISO('2026-01-01'), depuis: mois('2026-01')
});

const refuse: Resolution<number> = { statut: 'refuse', motif: 'barème absent' };

const entree = (m: string, o: Partial<{
  encaisse: number; depenses: number; verse: number; taux: Resolution<number>;
}> = {}) => ({
  mois: m as Mois,
  encaisse: euros(o.encaisse ?? 10_000),
  depenses: euros(o.depenses ?? 0),
  verse: euros(o.verse ?? 0),
  tauxDeCharges: o.taux ?? publie(0.246)
});

/**
 * L'ACRE S'ÉTEINT EN COURS D'ANNÉE, ET LE TAUX AVEC.
 *
 * Si cette règle sautait, un taux unique serait appliqué aux douze mois. Sur
 * une année où l'ACRE s'arrête en juin, les six derniers mois seraient calculés
 * à un taux de moitié — donc une capacité surestimée d'environ un huitième du
 * chiffre d'affaires, et toujours dans le sens qui invite à se verser trop.
 */
describe('le taux se prend au mois', () => {
  it('applique à chaque mois son propre taux, jamais une moyenne', () => {
    const sousAcre = capaciteDuMois(entree('2026-05', { taux: publie(0.123) }), mois('2026-08'));
    const apresAcre = capaciteDuMois(entree('2026-07', { taux: publie(0.246) }), mois('2026-08'));

    expect(sousAcre.statut).toBe('publie');
    expect(apresAcre.statut).toBe('publie');
    if (sousAcre.statut === 'refuse' || apresAcre.statut === 'refuse') return;

    expect(sousAcre.valeur.charges).toBe(1230);
    expect(apresAcre.valeur.charges).toBe(2460);
    // Un taux moyen (0,1845) aurait donné 8 155 € des deux côtés : les deux
    // mois ne doivent surtout pas se ressembler.
    expect(sousAcre.valeur.capacite).toBe(8770);
    expect(apresAcre.valeur.capacite).toBe(7540);
  });

  it('reste une hypothèse quand le taux en est une', () => {
    const r = capaciteDuMois(entree('2027-03', { taux: hypothese(0.246) }), mois('2026-08'));
    expect(r.statut).toBe('hypothese');
  });
});

/**
 * UN MOIS À VENIR N'A AUCUN VERSÉ.
 *
 * Si la règle sautait, l'écran dessinerait un plein à l'intérieur d'une barre
 * hachurée : on lirait « je me suis versé 2 000 € en novembre » alors que rien
 * n'est sorti du compte. `null` et zéro ne disent pas la même chose — zéro est
 * un constat, `null` dit qu'il n'y a rien à constater.
 */
describe('mois à venir', () => {
  it('ne porte aucun versé, même si on lui en passe un', () => {
    const r = capaciteDuMois(entree('2026-11', { verse: 2000 }), mois('2026-08'));
    expect(r.statut).toBe('publie');
    if (r.statut === 'refuse') return;
    expect(r.valeur.nature).toBe('projete');
    expect(r.valeur.verse).toBeNull();
  });

  it('garde le versé d’un mois passé', () => {
    const r = capaciteDuMois(entree('2026-06', { verse: 2000 }), mois('2026-08'));
    if (r.statut === 'refuse') return;
    expect(r.valeur.nature).toBe('constate');
    expect(r.valeur.verse).toBe(2000);
  });

  it('range le mois courant parmi les constatés', () => {
    // Il est incomplet, mais tout ce qu'il porte est arrivé. Le projeter
    // effacerait le versement du mois en cours — celui qu'on regarde.
    expect(natureDuMois(mois('2026-08'), mois('2026-08'))).toBe('constate');
    const r = capaciteDuMois(entree('2026-08', { verse: 1500 }), mois('2026-08'));
    if (r.statut === 'refuse') return;
    expect(r.valeur.verse).toBe(1500);
  });
});

/**
 * UN TAUX INCONNU FAIT TAIRE LE MOIS, IL NE LE MET PAS À ZÉRO CHARGE.
 *
 * Si la règle sautait, un mois sans barème afficherait 10 000 € de capacité au
 * lieu de 7 540 € : un quart de trop, sur le chiffre qui décide d'un virement.
 */
describe('abstention', () => {
  it('refuse la capacité quand le taux se dérobe', () => {
    const r = capaciteDuMois(entree('2029-04', { taux: refuse }), mois('2026-08'));
    expect(r.statut).toBe('refuse');
    expect(r.statut === 'refuse' && r.motif).toBe('barème absent');
  });
});

/**
 * UN MOIS SANS ENCAISSEMENT N'EST PAS UN MOIS NEUTRE.
 *
 * Si la capacité était bornée à zéro, un mois creux ressemblerait à un mois
 * sans activité — alors qu'il a coûté ses abonnements. Le signal disparaîtrait
 * exactement là où il compte.
 */
describe('mois sans encaissement', () => {
  /*
   * `if (r.statut === 'refuse') return;` a été retiré de ces deux tests.
   * Il les rendait VIDES le jour où la capacité se met à s'abstenir : le test
   * sortait avant sa première assertion et restait vert. C'est exactement le
   * défaut que la mutation cherche — un test qui ne tient rien.
   */
  it('rend une capacité négative à hauteur des dépenses, sur un mois VÉCU', () => {
    const r = capaciteDuMois(entree('2026-02', { encaisse: 0, depenses: 480 }), mois('2026-08'));
    expect(r.statut).not.toBe('refuse');
    if (r.statut === 'refuse') throw new Error(r.motif);
    expect(r.valeur.charges).toBe(0);
    expect(r.valeur.capacite).toBe(-480);
  });

  it('rend zéro quand il n’y a ni encaissement ni dépense', () => {
    const r = capaciteDuMois(entree('2026-02', { encaisse: 0 }), mois('2026-08'));
    expect(r.statut).not.toBe('refuse');
    if (r.statut === 'refuse') throw new Error(r.motif);
    expect(r.valeur.capacite).toBe(0);
  });
});

/*
 * SIX MOIS À « −0,1 k€ » NE SONT PAS UN DIAGNOSTIC, C'EST UN ARTEFACT.
 *
 * Le contrôle visuel a montré la fin d'année entière en négatif sur le plan de
 * capacité. Aucun de ces mois n'attendait quoi que ce soit : le nombre ne
 * venait que de dépenses projetées, et se lisait « le reste de mon année est
 * dans le rouge » — une conclusion que rien ne soutient.
 *
 * Sur un mois VÉCU la même valeur reste juste, et c'est toute la différence.
 */
describe('un mois à venir s’abstient tant que rien n’y est attendu', () => {
  it('refuse la capacité d’un mois futur sans encaissement prévu', () => {
    const r = capaciteDuMois(entree('2026-12', { encaisse: 0, depenses: 120 }), mois('2026-06'));
    expect(r.statut).toBe('refuse');
    if (r.statut !== 'refuse') return;
    expect(r.motif).toMatch(/attendu/);
  });

  // Un mois à venir qui porte une échéance de facture a, lui, une capacité —
  // négative comprise, puisqu'elle repose sur quelque chose.
  it('garde la capacité d’un mois futur qui attend un encaissement', () => {
    const r = capaciteDuMois(entree('2026-12', { encaisse: 200, depenses: 900 }), mois('2026-06'));
    expect(r.statut).not.toBe('refuse');
    if (r.statut === 'refuse') throw new Error(r.motif);
    expect(r.valeur.capacite).toBeLessThan(0);
  });

  // Le mois COURANT est constaté, pas projeté : il ne s'abstient pas.
  it('ne s’abstient pas sur le mois courant sans encaissement', () => {
    const r = capaciteDuMois(entree('2026-06', { encaisse: 0, depenses: 120 }), mois('2026-06'));
    expect(r.statut).not.toBe('refuse');
    if (r.statut === 'refuse') throw new Error(r.motif);
    expect(r.valeur.capacite).toBe(-120);
  });
});
