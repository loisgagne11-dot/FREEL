import { describe, expect, it } from 'vitest';
import { mois } from '../types';
import { optionVlAu } from './optionVl';
import { changerOptionVl, prochainChangementVl } from './optionVl.changement';

const jusqua = (m: string, actif: boolean) => ({ jusquA: mois(m), actif });

/*
 * L'option d'un mois : la première période close qui le couvre, sinon la
 * dernière choisie. Si l'histoire était ignorée, une année passée sous
 * versement libératoire se recalculerait au barème dès qu'on y renonce.
 */
describe('l’option à un mois', () => {
  const histoire = [jusqua('2024-12', false), jusqua('2025-12', true)];

  it('lit la période close qui couvre le mois, bornes comprises', () => {
    expect(optionVlAu(histoire, false, mois('2024-12'))).toBe(false);
    expect(optionVlAu(histoire, false, mois('2025-01'))).toBe(true);
    expect(optionVlAu(histoire, false, mois('2025-12'))).toBe(true);
  });

  it('rend la dernière option après la dernière période', () => {
    expect(optionVlAu(histoire, false, mois('2026-01'))).toBe(false);
  });

  // Tout dossier d'avant le schéma 26 : l'option du jour depuis toujours.
  it('rend l’option du jour pour tous les mois quand l’histoire est vide', () => {
    expect(optionVlAu([], true, mois('2019-05'))).toBe(true);
  });
});

describe('changer d’option', () => {
  const sous = { versementLiberatoire: true, historiqueVl: [] };

  it('pour le 1er janvier suivant : l’année en cours garde l’ancienne option', () => {
    expect(changerOptionVl(sous, false, 'janvier', 2026))
      .toEqual({ versementLiberatoire: false, historiqueVl: [jusqua('2026-12', true)] });
  });

  // Corriger, c'est ce que faisait la case : l'option depuis toujours.
  it('depuis le début : l’histoire s’efface', () => {
    const avecHistoire = { versementLiberatoire: false, historiqueVl: [jusqua('2025-12', true)] };
    expect(changerOptionVl(avecHistoire, true, 'debut', 2026))
      .toEqual({ versementLiberatoire: true, historiqueVl: [] });
  });

  /* Cocher puis décocher en novembre : sans réduction, une période close qui
     ne change rien resterait, et Réglages annoncerait un changement au
     1er janvier qui n'en est pas un. */
  it('revenir sur un changement à venir ne laisse aucune trace', () => {
    const prise = changerOptionVl({ versementLiberatoire: false, historiqueVl: [] }, true, 'janvier', 2026);
    expect(changerOptionVl(prise, false, 'janvier', 2026))
      .toEqual({ versementLiberatoire: false, historiqueVl: [] });
  });

  it('garde les années passées, et fond deux périodes de même valeur', () => {
    const avant = { versementLiberatoire: true, historiqueVl: [jusqua('2024-12', false)] };
    // 2025 et 2026 sous l'option, le barème à partir de 2027.
    expect(changerOptionVl(avant, false, 'janvier', 2026).historiqueVl)
      .toEqual([jusqua('2024-12', false), jusqua('2026-12', true)]);
  });
});

describe('le prochain changement, que Réglages annonce', () => {
  it('dit le 1er janvier qui vient tant que l’option choisie ne vaut pas encore', () => {
    const prise = { versementLiberatoire: true, historiqueVl: [jusqua('2026-12', false)] };
    expect(prochainChangementVl(prise, mois('2026-11'))).toEqual({ le: '2027-01', actif: true });
  });

  it('ne dit rien une fois l’option en vigueur, ni sans histoire', () => {
    const prise = { versementLiberatoire: true, historiqueVl: [jusqua('2026-12', false)] };
    expect(prochainChangementVl(prise, mois('2027-01'))).toBeNull();
    expect(prochainChangementVl({ versementLiberatoire: true, historiqueVl: [] }, mois('2026-11'))).toBeNull();
  });
});
