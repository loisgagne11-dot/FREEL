import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import {
  JOURS_MINIMUM_POUR_PROJETER,
  franchissementPrevu, partDeLAnneeEcoulee, projectionAnnuelle
} from './allure';

/**
 * LE MÊME CHIFFRE VEUT DIRE DEUX CHOSES OPPOSÉES SELON LA DATE.
 *
 * « 69 % du plafond » est une excellente nouvelle au 15 mars et un problème au
 * 15 novembre. Une jauge qui ne montre que la part consommée est un compteur,
 * pas un avertisseur.
 */
describe('part de l’année écoulée', () => {
  it('vaut presque rien au premier jour, presque tout au dernier', () => {
    expect(partDeLAnneeEcoulee(dateISO('2026-01-01'))).toBeCloseTo(1 / 365, 4);
    expect(partDeLAnneeEcoulee(dateISO('2026-12-31'))).toBe(1);
  });

  it('vaut la moitié vers le 1er juillet', () => {
    expect(partDeLAnneeEcoulee(dateISO('2026-07-02'))).toBeCloseTo(0.5, 2);
  });

  /**
   * Comptée en JOURS et non en mois : au 15 juillet, « sept mois » surestime
   * de deux semaines et « six mois » sous-estime d'autant. Le repère se pose
   * sur une barre, il doit tomber au bon endroit.
   */
  it('ne s’arrondit pas au mois', () => {
    const quinzeJuillet = partDeLAnneeEcoulee(dateISO('2026-07-15'));
    expect(quinzeJuillet).toBeGreaterThan(6 / 12);
    expect(quinzeJuillet).toBeLessThan(7 / 12);
  });

  it('tient compte des années bissextiles', () => {
    // 2028 est bissextile : le 31 décembre y est le 366e jour.
    expect(partDeLAnneeEcoulee(dateISO('2028-12-31'))).toBe(1);
    expect(partDeLAnneeEcoulee(dateISO('2028-03-01'))).toBeCloseTo(61 / 366, 5);
  });
});

/**
 * LA PROJECTION EST UNE EXTRAPOLATION, ET ELLE DOIT SAVOIR SE TAIRE.
 *
 * Le seuil majoré de TVA est le cas où prévenir tard coûte le plus cher : le
 * franchir rend la TVA exigible rétroactivement au 1er du mois, sur des
 * factures déjà émises sans TVA.
 */
describe('date probable de franchissement', () => {
  /**
   * LE POINT QUI COMPTE. Sous un trimestre, un seul règlement important
   * suffit à tripler le rythme apparent : la projection dirait « mai » un jour
   * et « pas cette année » le lendemain. Une prévision qui saute n'est pas
   * consultée deux fois.
   */
  it('refuse de projeter sous un trimestre d’activité', () => {
    const f = franchissementPrevu(euros(30_000), euros(39_100), dateISO('2026-02-20'));
    expect(f.statut).toBe('indeterminable');
    expect(f.statut === 'indeterminable' && f.motif).toMatch(/trimestre/);
  });

  it('accepte de projeter à partir du seuil de jours retenu', () => {
    const veille = new Date('2026-01-01T00:00:00Z');
    veille.setUTCDate(veille.getUTCDate() + JOURS_MINIMUM_POUR_PROJETER - 1);
    const f = franchissementPrevu(
      euros(20_000), euros(39_100), veille.toISOString().slice(0, 10) as never
    );
    expect(f.statut).not.toBe('indeterminable');
  });

  /**
   * Sans recette, il n'y a pas de rythme à prolonger. Rendre « hors année »
   * serait une réponse rassurante là où il n'y a pas de réponse.
   */
  it('refuse de projeter sans aucune recette', () => {
    const f = franchissementPrevu(euros(0), euros(39_100), dateISO('2026-07-15'));
    expect(f.statut).toBe('indeterminable');
    expect(f.statut === 'indeterminable' && f.motif).toMatch(/aucune recette/);
  });

  /** Un seuil déjà franchi n'a plus de date à prévoir. */
  it('constate le dépassement au lieu de le prévoir', () => {
    expect(franchissementPrevu(euros(40_000), euros(39_100), dateISO('2026-07-15')).statut)
      .toBe('depasse');
  });

  /**
   * Au 30 juin, 30 000 € encaissés : le rythme donne 60 000 € sur l'année, et
   * les 39 100 € du seuil majoré tombent quelque part en août.
   */
  it('annonce le mois du franchissement au rythme constaté', () => {
    const f = franchissementPrevu(euros(30_000), euros(39_100), dateISO('2026-06-30'));
    expect(f.statut).toBe('prevu');
    expect(f.statut === 'prevu' && f.mois).toBe('2026-08');
  });

  /**
   * Les seuils se mesurent sur l'année civile et se remettent à zéro au 1er
   * janvier : une projection qui déborderait sur l'année suivante n'aurait
   * aucun sens. Elle est rendue comme telle, pas comme une date de mars
   * prochain.
   */
  it('ne projette pas au-delà du 31 décembre', () => {
    const f = franchissementPrevu(euros(10_000), euros(39_100), dateISO('2026-06-30'));
    expect(f.statut).toBe('hors_annee');
  });

  it('reste dans l’année quand le franchissement tombe en décembre', () => {
    // 36 000 € au 30 novembre : rythme de 39 500 € sur l'année, seuil à 39 100.
    const f = franchissementPrevu(euros(36_000), euros(39_100), dateISO('2026-11-30'));
    expect(f.statut).toBe('prevu');
    expect(f.statut === 'prevu' && f.mois).toBe('2026-12');
  });
});

describe('projection annuelle', () => {
  it('prolonge le rythme constaté sur l’année entière', () => {
    // 30 000 € au 30 juin, soit 181 jours : 30000 / 181 × 365 ≈ 60 497.
    expect(projectionAnnuelle(euros(30_000), dateISO('2026-06-30'))).toBe(60_497);
  });

  /** Même abstention que le franchissement, et pour la même raison. */
  it('se tait sous un trimestre d’activité', () => {
    expect(projectionAnnuelle(euros(30_000), dateISO('2026-02-20'))).toBeNull();
  });

  it('se tait sans recette', () => {
    expect(projectionAnnuelle(euros(0), dateISO('2026-07-15'))).toBeNull();
  });
});
