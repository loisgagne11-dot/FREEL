import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../types';
import {
  type Rythme, craDuMois, jourDeSemaine, planifier, quotitePrevue, rythmePour
} from './planning';

const D = (s: string) => dateISO(s);

/** Lundi à jeudi pleins, vendredi à mi-temps — le rythme le plus courant. */
const SEMAINE: Rythme = {
  du: D('2026-01-01'), au: D('2026-12-31'),
  parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 0.5 },
  tjm: euros(500)
};

const SANS = { rythmes: [SEMAINE], ajustements: {}, feries: new Set<string>(), conges: {} };

describe('jour de semaine', () => {
  /**
   * Calculé en UTC, jamais dans le fuseau local : à Paris, `new Date('...')`
   * sur une date nue tombe la veille au soir en heure d'hiver, et le lundi
   * devient dimanche. Un planning décalé d'un jour est un CRA faux.
   */
  it('ne dépend pas du fuseau', () => {
    expect(jourDeSemaine(D('2026-08-10'))).toBe('lun');
    expect(jourDeSemaine(D('2026-08-16'))).toBe('dim');
  });
});

describe('rythme applicable', () => {
  it('trouve celui qui couvre la date', () => {
    expect(rythmePour(D('2026-06-15'), [SEMAINE])).toBe(SEMAINE);
    expect(rythmePour(D('2027-01-05'), [SEMAINE])).toBeUndefined();
  });

  /**
   * L'ancienne application autorise des périodes qui se chevauchent. Le
   * dernier déclaré décrit l'intention la plus fraîche : prendre le premier
   * appliquerait un rythme que l'utilisateur croit avoir remplacé.
   */
  it('retient le dernier déclaré quand deux se chevauchent', () => {
    const ancien: Rythme = { ...SEMAINE, parJour: { lun: 1 }, tjm: euros(400) };
    const nouveau: Rythme = { ...SEMAINE, parJour: { lun: 0.5 }, tjm: euros(600) };
    expect(rythmePour(D('2026-06-15'), [ancien, nouveau])).toBe(nouveau);
  });

  it('rend la quotité du jour de semaine', () => {
    expect(quotitePrevue(D('2026-08-10'), [SEMAINE])).toBe(1);    // lundi
    expect(quotitePrevue(D('2026-08-14'), [SEMAINE])).toBe(0.5);  // vendredi
    expect(quotitePrevue(D('2026-08-15'), [SEMAINE])).toBe(0);    // samedi, absent du rythme
  });
});

describe('planning', () => {
  it('remplit la semaine depuis le rythme, sans rien saisir', () => {
    const jours = planifier(
      ['2026-08-10', '2026-08-11', '2026-08-14', '2026-08-15'].map(D),
      SANS
    );
    expect(jours.map((j) => j.retenu)).toEqual([1, 1, 0.5, 0]);
  });

  it('ne prévoit ni week-end ni jour férié', () => {
    const jours = planifier(['2026-08-15', '2026-07-14'].map(D), {
      ...SANS, feries: new Set(['2026-07-14'])
    });
    expect(jours[0]?.weekEnd).toBe(true);
    expect(jours[1]?.ferie).toBe(true);
    expect(jours.every((j) => j.retenu === 0)).toBe(true);
  });

  it('retranche le congé du prévu', () => {
    const [plein, demi] = planifier(['2026-08-10', '2026-08-11'].map(D), {
      ...SANS, conges: { '2026-08-10': 1, '2026-08-11': 0.5 }
    });
    expect(plein?.retenu).toBe(0);
    expect(demi?.retenu).toBe(0.5);
  });

  /**
   * LE POINT DUR. Sans priorité absolue de l'ajustement, effacer une journée
   * serait impossible : le rythme la remettrait à chaque calcul, et le CRA
   * facturerait un jour qui n'a pas eu lieu.
   */
  it('laisse l’ajustement l’emporter, y compris à zéro', () => {
    const [j] = planifier(
      [D('2026-08-10')], { ...SANS, ajustements: { '2026-08-10': { quotite: 0 } } }
    );
    expect(j?.prevu).toBe(1);
    expect(j?.retenu).toBe(0);
    expect(j?.ajuste).toBe(true);
  });

  /**
   * Les astreintes et les rendus de nuit existent. Un CRA qui les efface
   * parce que c'était un dimanche fait perdre de l'argent.
   */
  it('permet de déclarer un jour travaillé un week-end ou un férié', () => {
    const [samedi, ferie] = planifier(['2026-08-15', '2026-07-14'].map(D), {
      ...SANS,
      feries: new Set(['2026-07-14']),
      ajustements: { '2026-08-15': { quotite: 1 }, '2026-07-14': { quotite: 0.5 } }
    });
    expect(samedi?.retenu).toBe(1);
    expect(ferie?.retenu).toBe(0.5);
  });

  it('ne prévoit rien hors de la plage du rythme', () => {
    const [j] = planifier([D('2027-03-01')], SANS);
    expect(j?.retenu).toBe(0);
  });
});

describe('compte rendu d’activité', () => {
  const AOUT = ['2026-08-10', '2026-08-11', '2026-08-14', '2026-08-15'].map(D);

  it('totalise les jours réellement travaillés', () => {
    const cra = craDuMois(mois('2026-08'), planifier(AOUT, SANS), [SEMAINE], euros(500));
    expect(cra.totalJours).toBe(2.5);
    expect(cra.montant).toBe(1250);
  });

  // Un CRA qui liste des zéros n'est pas plus complet, il est seulement plus
  // long à relire — et le client le signe moins volontiers.
  it('ne liste que les jours travaillés', () => {
    const cra = craDuMois(mois('2026-08'), planifier(AOUT, SANS), [SEMAINE], euros(500));
    expect(cra.lignes).toHaveLength(3);
    expect(cra.lignes.every((l) => l.quotite > 0)).toBe(true);
  });

  it('ignore les jours d’un autre mois', () => {
    const planning = planifier([...AOUT, D('2026-09-07')], SANS);
    expect(craDuMois(mois('2026-08'), planning, [SEMAINE], euros(500)).lignes).toHaveLength(3);
  });

  /**
   * Chaque jour est valorisé au TJM en vigueur À SA DATE. Appliquer le tarif
   * du jour de l'édition réécrirait le passé à chaque renégociation — et un
   * CRA déjà signé changerait de montant.
   */
  it('valorise au tarif en vigueur à la date, pas au dernier connu', () => {
    const avant: Rythme = {
      du: D('2026-01-01'), au: D('2026-08-12'), parJour: { lun: 1, mar: 1 }, tjm: euros(400)
    };
    const apres: Rythme = {
      du: D('2026-08-13'), au: D('2026-12-31'), parJour: { lun: 1, mar: 1 }, tjm: euros(600)
    };
    const dates = ['2026-08-10', '2026-08-18'].map(D); // un lundi avant, un mardi après
    const planning = planifier(dates, {
      ...SANS, rythmes: [avant, apres]
    });
    const cra = craDuMois(mois('2026-08'), planning, [avant, apres], euros(999));
    expect(cra.totalJours).toBe(2);
    expect(cra.montant).toBe(1000); // 400 + 600, jamais 2 × 999
  });

  // Sans TJM de période, celui de la mission s'applique : c'est le cas le
  // plus courant, et exiger un tarif par période obligerait à le répéter.
  it('retombe sur le TJM de la mission', () => {
    const sansTjm: Rythme = { ...SEMAINE, tjm: null };
    const cra = craDuMois(
      mois('2026-08'), planifier([D('2026-08-10')], { ...SANS, rythmes: [sansTjm] }),
      [sansTjm], euros(700)
    );
    expect(cra.montant).toBe(700);
  });
});
