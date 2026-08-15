import { describe, expect, it } from 'vitest';
import { euros, mois } from '../types';
import type { EntreeMois } from './projectionSolde';
import {
  depensesMensuellesMoyennes, projeterDisponible, versementSoutenable
} from './projectionSolde';

const entree = (m: string, montant: number): EntreeMois => ({
  mois: mois(m), encaissements: euros(montant)
});

const projeter = (
  entrees: readonly EntreeMois[],
  o: { depart?: number; reserve?: number; taux?: number; depenses?: number } = {}
) => projeterDisponible({
  depart: euros(o.depart ?? 10_000),
  reserve: euros(o.reserve ?? 0),
  entrees,
  tauxDeCharges: o.taux ?? 0,
  depensesMensuelles: euros(o.depenses ?? 0)
});

/**
 * ON PROJETTE LE DISPONIBLE, PAS LE SOLDE.
 *
 * Projeter le solde obligerait à deviner QUAND chaque dette sortira du compte,
 * et la moitié d'entre elles n'a pas encore de date : les charges dues sur des
 * recettes encaissées mais non déclarées existent et l'URSSAF ne les a pas
 * appelées. Une courbe qui les ignore monte joliment jusqu'au trimestre où
 * elle s'effondre.
 */
describe('projection du disponible', () => {
  it('part du disponible d’aujourd’hui', () => {
    const p = projeter([entree('2026-09', 0)], { depart: 7500 });
    expect(p.depart).toBe(7500);
    expect(p.mois[0]?.sansVersement).toBe(7500);
  });

  /**
   * LE POINT QUI COMPTE. Un encaissement de X n'ajoute au disponible que
   * X × (1 − taux) : le reste part en cotisations et impôt, et se retrouve
   * aussitôt en provision. Compter X entier ferait projeter un quart de trop.
   */
  it('n’ajoute d’un encaissement que sa part nette de charges', () => {
    const p = projeter([entree('2026-09', 10_000)], { depart: 0, taux: 0.25 });
    expect(p.mois[0]?.charges).toBe(2500);
    expect(p.mois[0]?.sansVersement).toBe(7500);
  });

  it('cumule les mois les uns sur les autres', () => {
    const p = projeter(
      [entree('2026-09', 4000), entree('2026-10', 4000)],
      { depart: 1000, taux: 0.25 }
    );
    expect(p.mois[0]?.sansVersement).toBe(4000);
    expect(p.mois[1]?.sansVersement).toBe(7000);
  });

  /**
   * Ignorer les dépenses courantes rendrait la projection OPTIMISTE, et
   * l'optimisme est le sens dangereux de l'erreur sur une trésorerie.
   */
  it('retranche les dépenses courantes attendues', () => {
    const p = projeter([entree('2026-09', 0)], { depart: 5000, depenses: 800 });
    expect(p.mois[0]?.sansVersement).toBe(4200);
  });

  it('descend quand rien ne rentre', () => {
    const p = projeter(
      [entree('2026-09', 0), entree('2026-10', 0)],
      { depart: 3000, depenses: 1000 }
    );
    expect(p.mois[1]?.sansVersement).toBe(1000);
  });
});

/**
 * LE VERSEMENT SOUTENABLE.
 *
 * Constant, parce qu'on se verse une rémunération et non un solde de tout
 * compte. Le MINIMUM des contraintes, parce qu'une contrainte violée un seul
 * mois suffit : se verser ce que la moyenne autorise conduit à passer sous la
 * réserve en février pour le rattraper en juin — et à découvrir en février
 * qu'on ne peut pas payer l'URSSAF.
 */
describe('versement mensuel soutenable', () => {
  it('répartit également ce qui est disponible', () => {
    // 3 000 € de disponible constant sur 3 mois : 1 000 € par mois.
    const { montant } = versementSoutenable(
      [euros(3000), euros(3000), euros(3000)], euros(0)
    );
    expect(montant).toBe(1000);
  });

  /**
   * LE CAS QUI COMPTE. Le creux de février commande, même si l'année finit
   * bien. Une moyenne annuelle autoriserait un versement que février ne
   * supporte pas.
   */
  it('se laisse contraindre par le mois le plus creux', () => {
    const { montant, moisLimitant } = versementSoutenable(
      [euros(1000), euros(1200), euros(9000)], euros(0)
    );
    // Le mois 0 impose 1000/1 = 1000 ; le mois 1, 1200/2 = 600 ; le mois 2,
    // 9000/3 = 3000. C'est 600 qui gouverne.
    expect(montant).toBe(600);
    expect(moisLimitant).toBe(1);
  });

  /** La réserve est un plancher : le versement ne l'entame jamais. */
  it('ne descend jamais sous la réserve', () => {
    const { montant } = versementSoutenable([euros(5000)], euros(3000));
    expect(montant).toBe(2000);
  });

  /**
   * On ne se verse pas une dette. Zéro veut dire « rien, pour l'instant », et
   * c'est une réponse — pas une erreur à masquer.
   */
  it('rend zéro quand la réserve n’est pas atteinte', () => {
    const { montant, moisLimitant } = versementSoutenable([euros(1000)], euros(3000));
    expect(montant).toBe(0);
    expect(moisLimitant).toBeNull();
  });

  it('rend zéro sans aucun mois projeté', () => {
    expect(versementSoutenable([], euros(0)).montant).toBe(0);
  });

  /** Arrondi vers le BAS : un euro de trop chaque mois finit par manquer. */
  it('arrondit à l’euro inférieur', () => {
    const { montant } = versementSoutenable([euros(1000), euros(2001)], euros(0));
    expect(montant).toBe(1000);
    expect(Number.isInteger(montant)).toBe(true);
  });
});

describe('les deux scénarios', () => {
  it('creuse l’écart entre se verser et ne pas se verser', () => {
    const p = projeter(
      [entree('2026-09', 4000), entree('2026-10', 4000)],
      { depart: 0, taux: 0 }
    );

    expect(p.versementMensuel).toBe(4000);
    expect(p.mois[0]?.sansVersement).toBe(4000);
    expect(p.mois[0]?.avecVersement).toBe(0);
    expect(p.mois[1]?.sansVersement).toBe(8000);
    expect(p.mois[1]?.avecVersement).toBe(0);
  });

  /** Le cumul versé est ce qu'on veut lire : « depuis janvier, tant ». */
  it('cumule ce qui a été versé, mois après mois', () => {
    const p = projeter(
      [entree('2026-09', 3000), entree('2026-10', 3000)], { depart: 0 }
    );
    expect(p.mois[0]?.verseCumule).toBe(p.versementMensuel);
    expect(p.mois[1]?.verseCumule).toBe(p.versementMensuel * 2);
  });

  /**
   * Nommer le mois qui contraint évite la question « pourquoi si peu ? », qui
   * est la première qu'on se pose devant un versement décevant.
   */
  it('nomme le mois qui limite le versement', () => {
    const p = projeter([
      entree('2026-09', 5000), entree('2026-10', 0), entree('2026-11', 9000)
    ], { depart: 0, depenses: 500 });

    expect(p.moisContraignant).toBe('2026-10');
  });

  it('ne propose aucun versement quand rien n’est disponible', () => {
    const p = projeter([entree('2026-09', 0)], { depart: 0, depenses: 500 });
    expect(p.versementMensuel).toBe(0);
    expect(p.moisContraignant).toBeNull();
  });
});

/**
 * Sous trois mois d'historique, une seule dépense exceptionnelle déforme la
 * moyenne au point de la rendre absurde. `null` dit qu'on ne sait pas.
 */
describe('hypothèse de dépenses courantes', () => {
  it('moyenne l’historique disponible', () => {
    expect(depensesMensuellesMoyennes([euros(900), euros(1100), euros(1000)]))
      .toBe(1000);
  });

  it('se tait sous trois mois d’historique', () => {
    expect(depensesMensuellesMoyennes([euros(900), euros(1100)])).toBeNull();
    expect(depensesMensuellesMoyennes([])).toBeNull();
  });
});
