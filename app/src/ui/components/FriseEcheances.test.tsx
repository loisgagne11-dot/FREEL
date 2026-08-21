/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { dateISO, euros } from '../../domain/types';
import type { Echeance } from '../../domain/calculs/provisions';
import { FriseEcheances } from './FriseEcheances';
import styles from './FriseEcheances.module.css';

afterEach(cleanup);

const formater = (v: number) => `${v} €`;

const echeance = (p: Partial<Echeance> & { readonly id: string }): Echeance => ({
  nature: 'urssaf', montant: euros(2400), echeanceLe: dateISO('2026-09-05'),
  payeeLe: null, montantPaye: null, ...p
});

function rendre(echeances: readonly Echeance[], aujourdhui = dateISO('2026-08-21')) {
  return render(
    <FriseEcheances echeances={echeances} annee={2026} aujourdhui={aujourdhui} formater={formater} />
  );
}

/**
 * `noUncheckedIndexedAccess` type l'accès à `styles` en `string | undefined`,
 * alors que le module CSS existe réellement à l'exécution. Un nom qui manque
 * vraiment doit faire échouer le test tout de suite — pas produire un
 * sélecteur `.undefined` qui ne matche jamais rien et fait échouer le test
 * pour une raison illisible.
 */
function classe(nom: string | undefined): string {
  if (nom === undefined) throw new Error('classe CSS manquante dans FriseEcheances.module.css');
  return nom;
}

/**
 * LA CONVENTION DE LA RÉFÉRENCE, ET SON INVERSE QUI S'ÉTAIT GLISSÉ.
 *
 * La frise dessinait l'anneau creux pour ce qui était réglé et la pastille
 * pleine pour ce qui restait à venir — l'exact inverse de la maquette. Sans
 * ces tests, remettre l'inversion en place ne fait tomber personne : les deux
 * classes existent toujours, seule leur affectation change de sens.
 */
describe('convention plein / creux du point', () => {
  it('marque d’une pastille PLEINE une échéance réglée', () => {
    rendre([echeance({ id: 'e1', payeeLe: dateISO('2026-08-01') })]);
    const point = document.querySelector(`.${classe(styles.point)}.${classe(styles.urssaf)}`);
    expect(point?.classList.contains(classe(styles.pointAVenir))).toBe(false);
    expect(point?.classList.contains(classe(styles.pointRetard))).toBe(false);
  });

  it('marque d’un anneau CREUX une échéance qui n’est pas encore due', () => {
    rendre([echeance({ id: 'e1', echeanceLe: dateISO('2026-12-05') })]);
    const point = document.querySelector(`.${classe(styles.point)}.${classe(styles.urssaf)}`);
    expect(point?.classList.contains(classe(styles.pointAVenir))).toBe(true);
  });

  /**
   * Le jour même de l'échéance, ce n'est pas un retard — même règle que
   * `statutDe` dans `Echeances.tsx` : on a la journée pour régler.
   */
  it('ne considère pas en retard une échéance dont le jour même est aujourd’hui', () => {
    rendre([echeance({ id: 'e1', echeanceLe: dateISO('2026-08-21') })], dateISO('2026-08-21'));
    const point = document.querySelector(`.${classe(styles.point)}.${classe(styles.urssaf)}`);
    expect(point?.classList.contains(classe(styles.pointRetard))).toBe(false);
    expect(point?.classList.contains(classe(styles.pointAVenir))).toBe(true);
  });
});

/**
 * LA NUANCE QUE LE LOT DEMANDE EXPLICITEMENT : PASSÉ ≠ RÉGLÉ.
 *
 * Une échéance dont la date est dépassée et qui n'a pas été payée est
 * l'information la plus importante de la frise — c'est un retard, pas une
 * simple échéance à venir. La confondre avec l'anneau creux la ferait
 * disparaître visuellement dans la masse des échéances normales à venir.
 */
describe('le retard, distinct du réglé et du à venir', () => {
  it('marque une échéance passée et impayée d’une couleur qui n’est ni celle du réglé ni celle de l’à venir', () => {
    rendre([echeance({ id: 'e1', echeanceLe: dateISO('2026-07-01'), payeeLe: null })]);
    const point = document.querySelector(`.${classe(styles.point)}.${classe(styles.urssaf)}`);
    expect(point?.classList.contains(classe(styles.pointRetard))).toBe(true);
    expect(point?.classList.contains(classe(styles.pointAVenir))).toBe(false);
  });

  it('dit « en retard » en toutes lettres, pas seulement par la couleur', () => {
    rendre([echeance({ id: 'e1', echeanceLe: dateISO('2026-07-01'), payeeLe: null })]);
    expect(screen.getByText('en retard')).toBeTruthy();
  });

  // Une échéance réglée en retard reste réglée : le paiement fait foi, la
  // date d'origine ne compte plus une fois la dette éteinte.
  it('ne marque pas en retard une échéance réglée après sa date d’échéance', () => {
    rendre([echeance({
      id: 'e1', echeanceLe: dateISO('2026-07-01'), payeeLe: dateISO('2026-07-20')
    })]);
    expect(screen.queryByText('en retard')).toBeNull();
    const point = document.querySelector(`.${classe(styles.point)}.${classe(styles.urssaf)}`);
    expect(point?.classList.contains(classe(styles.pointRetard))).toBe(false);
  });
});

/**
 * L'AXE DIT « ÉCOULÉ », PAS « RÉGLÉ ».
 *
 * Une année où rien n'est encore payé a quand même des mois qui se sont
 * écoulés : le vert ne doit pas se lire comme une promesse que tout va bien
 * jusqu'au repère du jour, seulement que ce temps-là est passé.
 */
describe('le segment écoulé de l’axe', () => {
  it('colore en vert la part de l’année déjà passée, même si rien n’est réglé', () => {
    rendre(
      [echeance({ id: 'e1', echeanceLe: dateISO('2026-07-01'), payeeLe: null })],
      dateISO('2026-08-21')
    );
    const segment = document.querySelector(`.${classe(styles.axeEcoule)}`) as HTMLElement | null;
    expect(segment).toBeTruthy();
    // 21 août est le 233ᵉ jour d'une année non bissextile : ~63,8 % de l'année.
    const largeur = parseFloat(segment!.style.width);
    expect(largeur).toBeGreaterThan(60);
    expect(largeur).toBeLessThan(66);
  });

  it('ne peint aucun segment vert quand l’année affichée n’a pas commencé', () => {
    rendre([echeance({ id: 'e1' })], dateISO('2025-01-01'));
    expect(document.querySelector(`.${classe(styles.axeEcoule)}`)).toBeNull();
  });

  it('peint tout l’axe en vert quand l’année affichée est entièrement passée', () => {
    rendre([echeance({ id: 'e1' })], dateISO('2027-01-01'));
    const segment = document.querySelector(`.${classe(styles.axeEcoule)}`) as HTMLElement | null;
    expect(segment?.style.width).toBe('100%');
  });
});
