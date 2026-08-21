import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../types';
import type { JourPlanifie, Rythme } from './planning';
import { ecartDePrevision, previsionDuMois, totaliserPrevisions } from './prevision';

const jour = (
  date: string,
  o: Partial<Pick<JourPlanifie, 'prevu' | 'retenu' | 'ajuste' | 'ferie' | 'weekEnd' | 'conge'>> = {}
): JourPlanifie => ({
  date: dateISO(date),
  prevu: 1, retenu: 1, ajuste: false, ferie: false, weekEnd: false, conge: 0,
  // La prévision ne connaît que la quotité : le créneau et le lieu ne pèsent
  // ni sur les jours ni sur le CA. Ils sont là parce que `JourPlanifie` les
  // porte, à `null` parce que rien ne les a posés.
  creneaux: null, lieu: null,
  ...o
});

const rythme = (du: string, au: string, tjm: number): Rythme => ({
  du: dateISO(du), au: dateISO(au), tjm: euros(tjm),
  parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 }
});

/**
 * LE PREMIER MAILLON DE LA CHAÎNE QUI PART DE LA MISSION.
 *
 * Une mission doit se décliner en prévision de revenu, planning, facture du
 * mois et CRA. Le planning et le CRA existaient ; la prévision non. Le tarif
 * journalier et le rythme étaient là, et rien n'en tirait ce qu'ils annoncent.
 */
describe('prévision de revenu du mois', () => {
  const M = mois('2026-07');

  it('valorise les jours prévus au tarif de la mission', () => {
    const p = previsionDuMois(
      M, [jour('2026-07-06'), jour('2026-07-07')], [], euros(400)
    );
    expect(p.joursPrevus).toBe(2);
    expect(p.montantPrevu).toBe(800);
  });

  /**
   * LE POINT QUI COMPTE. Le CRA valorise ce qui a été RETENU ; la prévision, ce
   * qui était PRÉVU. Les confondre ferait disparaître la question « est-ce que
   * je tiens ce que j'avais prévu ? » — un mois travaillé trois jours de moins
   * que le rythme doit se voir.
   */
  it('distingue le prévu du retenu', () => {
    const p = previsionDuMois(M, [
      jour('2026-07-06'),
      jour('2026-07-07', { retenu: 0.5, ajuste: true }),
      jour('2026-07-08', { retenu: 0, ajuste: true })
    ], [], euros(400));

    expect(p.joursPrevus).toBe(3);
    expect(p.joursRetenus).toBe(1.5);
    expect(p.montantPrevu).toBe(1200);
    expect(p.montantRetenu).toBe(600);
  });

  it('chiffre l’écart, dans les deux sens', () => {
    const moins = previsionDuMois(
      M, [jour('2026-07-06', { retenu: 0 })], [], euros(400)
    );
    expect(ecartDePrevision(moins)).toBe(-400);

    const plus = previsionDuMois(
      M, [jour('2026-07-06', { prevu: 0, retenu: 1, ajuste: true })], [], euros(400)
    );
    expect(ecartDePrevision(plus)).toBe(400);
  });

  /**
   * Congés et fériés sont déjà retirés de `prevu` par `planifier()`. Une
   * prévision qui les compterait annoncerait un revenu de vacances.
   */
  it('ne prévoit rien sur un jour de congé', () => {
    const p = previsionDuMois(
      M, [jour('2026-07-06', { prevu: 0, retenu: 0, conge: 1 })], [], euros(400)
    );
    expect(p.joursPrevus).toBe(0);
    expect(p.montantPrevu).toBe(0);
  });

  /**
   * Chaque journée vaut le tarif EN VIGUEUR À SA DATE. Appliquer celui du jour
   * de l'édition réécrirait le passé à chaque renégociation : une mission qui
   * passe de 400 à 450 en juin doit valoir 400 en mai.
   */
  it('valorise chaque jour au tarif de sa date', () => {
    const rythmes = [
      rythme('2026-05-01', '2026-05-31', 400),
      rythme('2026-06-01', '2026-12-31', 450)
    ];
    const mai = previsionDuMois(
      mois('2026-05'), [jour('2026-05-04')], rythmes, euros(999)
    );
    const juin = previsionDuMois(
      mois('2026-06'), [jour('2026-06-01')], rythmes, euros(999)
    );

    expect(mai.montantPrevu).toBe(400);
    expect(juin.montantPrevu).toBe(450);
  });

  /**
   * Une journée qu'aucun rythme ne couvre retombe sur le tarif de la mission.
   * Sans ce repli elle vaudrait zéro, sans qu'on sache pourquoi.
   */
  it('retombe sur le tarif de la mission hors de tout rythme', () => {
    const p = previsionDuMois(
      M, [jour('2026-07-06')], [rythme('2026-01-01', '2026-01-31', 400)], euros(350)
    );
    expect(p.montantPrevu).toBe(350);
  });

  // Le planning porte l'année entière : ne retenir que le mois demandé.
  it('ne retient que les journées du mois demandé', () => {
    const p = previsionDuMois(
      M, [jour('2026-07-06'), jour('2026-08-03')], [], euros(400)
    );
    expect(p.joursPrevus).toBe(1);
  });
});

describe('totalisation', () => {
  const M = mois('2026-07');

  it('somme plusieurs missions sur un même mois', () => {
    const a = previsionDuMois(M, [jour('2026-07-06')], [], euros(400));
    const b = previsionDuMois(M, [jour('2026-07-07')], [], euros(600));
    const t = totaliserPrevisions([a, b], M);

    expect(t.joursPrevus).toBe(2);
    expect(t.montantPrevu).toBe(1000);
  });

  it('rend un total nul sur une liste vide, sans échouer', () => {
    const t = totaliserPrevisions([], M);
    expect(t.montantPrevu).toBe(0);
    expect(t.joursPrevus).toBe(0);
  });
});
