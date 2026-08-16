import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import { allureObjectif } from './objectif';

/**
 * UN OBJECTIF NON FIXÉ N'EST PAS UN OBJECTIF ATTEINT.
 *
 * Le rendre comme « 100 % dès le 1er janvier » féliciterait pour rien, et
 * diviserait par zéro dans la foulée.
 */
describe('absence d’objectif', () => {
  it('rend null quand rien n’est fixé', () => {
    expect(allureObjectif(null, euros(30_000), dateISO('2026-07-01'))).toBeNull();
  });

  it('rend null pour un objectif à zéro ou négatif', () => {
    expect(allureObjectif(euros(0), euros(30_000), dateISO('2026-07-01'))).toBeNull();
    expect(allureObjectif(euros(-1), euros(30_000), dateISO('2026-07-01'))).toBeNull();
  });
});

/**
 * L'ALLURE ATTENDUE EST UN FAIT DE CALENDRIER.
 *
 * Elle ne prolonge aucun rythme : elle dit seulement où il faudrait en être si
 * l'objectif se réalisait régulièrement. C'est ce qui la rend vraie dès le
 * premier jour, là où la projection doit se taire un trimestre.
 */
describe('allure attendue à date', () => {
  it('vaut la moitié de l’objectif au milieu de l’année', () => {
    const a = allureObjectif(euros(60_000), euros(30_000), dateISO('2026-07-02'));
    // Le 2 juillet est le 183e jour sur 365 : à quatre-vingt-deux euros près,
    // et non à l'euro — l'année ne se coupe pas en deux moitiés entières.
    expect(a?.attenduADate).toBe(30_082);
    expect(a?.partDeLAnnee).toBeCloseTo(0.5, 2);
  });

  it('vaut l’objectif entier au 31 décembre', () => {
    const a = allureObjectif(euros(60_000), euros(50_000), dateISO('2026-12-31'));
    expect(a?.attenduADate).toBe(60_000);
    expect(a?.ecart).toBe(-10_000);
  });

  it('ne s’arrondit pas au mois écoulé', () => {
    // Au 15 juillet, 195 jours sur 365 sont passés, pas 6 mois ni 7.
    const a = allureObjectif(euros(36_500), euros(0), dateISO('2026-07-15'));
    expect(a?.attenduADate).toBe(19_600);
  });
});

/**
 * L'ÉCART SE DIT EN JOURS, PARCE QU'UN MONTANT SEUL NE SE COMPARE À RIEN.
 *
 * 4 200 € de retard au 15 janvier et 4 200 € au 15 décembre ne racontent pas
 * la même histoire. Ramené au rythme de l'objectif, l'écart devient une durée,
 * qui reste juste à toute date.
 */
describe('écart ramené en jours', () => {
  it('compte l’avance positivement', () => {
    // 36 500 € sur 365 jours : 100 € par jour d'objectif.
    // Au 100e jour, l'attendu est de 10 000 € ; 11 000 € encaissés font 10 jours d'avance.
    const a = allureObjectif(euros(36_500), euros(11_000), dateISO('2026-04-10'));
    expect(a?.attenduADate).toBe(10_000);
    expect(a?.joursDEcart).toBe(10);
  });

  it('compte le retard négativement', () => {
    const a = allureObjectif(euros(36_500), euros(8_500), dateISO('2026-04-10'));
    expect(a?.joursDEcart).toBe(-15);
  });

  it('rend zéro jour quand on est exactement sur l’allure', () => {
    const a = allureObjectif(euros(36_500), euros(10_000), dateISO('2026-04-10'));
    expect(a?.ecart).toBe(0);
    expect(a?.joursDEcart).toBe(0);
  });

  /**
   * Le rythme de référence est celui de l'OBJECTIF, pas celui constaté. Prendre
   * le rythme constaté rendrait l'écart illisible : quelqu'un qui n'a rien
   * encaissé aurait un retard infini, et quelqu'un qui a beaucoup encaissé
   * verrait son avance rétrécir à mesure qu'il progresse.
   */
  it('mesure l’écart au rythme de l’objectif, pas au rythme constaté', () => {
    const rien = allureObjectif(euros(36_500), euros(0), dateISO('2026-04-10'));
    expect(rien?.joursDEcart).toBe(-100);
  });
});

/**
 * LA PROJECTION EST RÉEMPLOYÉE, PAS REFAITE.
 *
 * Un objectif est un seuil qu'on veut franchir plutôt que subir ; l'arithmétique
 * est la même. Refaire la division ici aurait perdu l'abstention sous un
 * trimestre d'activité, qui vaut exactement autant pour un objectif.
 */
describe('date d’atteinte', () => {
  it('s’abstient sous un trimestre d’activité', () => {
    const a = allureObjectif(euros(36_500), euros(5_000), dateISO('2026-02-15'));
    expect(a?.franchissement.statut).toBe('indeterminable');
  });

  it('annonce l’objectif déjà atteint', () => {
    const a = allureObjectif(euros(36_500), euros(40_000), dateISO('2026-09-01'));
    expect(a?.franchissement.statut).toBe('depasse');
    expect(a?.partRealisee).toBeCloseTo(40_000 / 36_500, 4);
  });

  it('annonce un mois quand le rythme y mène', () => {
    // Au 1er juillet (182e jour), 30 000 € encaissés : 164,8 €/jour.
    // Il reste 6 500 € à faire, soit 40 jours — début août.
    const a = allureObjectif(euros(36_500), euros(30_000), dateISO('2026-07-01'));
    expect(a?.franchissement).toEqual({ statut: 'prevu', mois: '2026-08' });
  });

  it('annonce « hors année » quand le rythme n’y mène pas', () => {
    const a = allureObjectif(euros(100_000), euros(20_000), dateISO('2026-07-01'));
    expect(a?.franchissement.statut).toBe('hors_annee');
  });
});
