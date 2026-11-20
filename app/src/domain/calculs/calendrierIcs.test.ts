import { describe, expect, it } from 'vitest';
import { dateISO } from '../types';
import { type EvenementIcs, OCTETS_PAR_LIGNE, calendrierIcs, echapper, plier } from './calendrierIcs';

const evenement = (m: Partial<EvenementIcs> = {}): EvenementIcs => ({
  uid: 'freel-0123456789abcdef', date: dateISO('2026-12-15'), titre: 'CFE 2026',
  description: 'Avis en novembre.', rappelJours: 3, ...m
});
const MAINTENANT = new Date('2026-11-17T09:30:12.345Z');

/** Les lignes physiques du fichier, sans leur CRLF. */
const lignesPhysiques = (ics: string): string[] => ics.split('\r\n').slice(0, -1);
/** Les lignes logiques : le pliage retiré (§ 3.1, CRLF suivi d'une espace). */
const lignesLogiques = (ics: string): string[] => ics.replace(/\r\n /gu, '').split('\r\n').slice(0, -1);
const valeurDe = (ics: string, nom: string): string | undefined =>
  lignesLogiques(ics).find((l) => l.startsWith(`${nom}:`))?.slice(nom.length + 1);

/**
 * L'ÉCHAPPEMENT DES VALEURS TEXT (RFC 5545, § 3.3.11).
 *
 * Un point-virgule ou une virgule non échappés coupent une valeur ; un saut de
 * ligne en ouvre une nouvelle — une propriété que l'agenda lirait comme
 * venue du fichier.
 */
describe('échappement', () => {
  it('préfixe la barre oblique inverse, le point-virgule et la virgule', () => {
    expect(echapper('a\\b;c,d')).toBe('a\\\\b\\;c\\,d');
  });

  it('écrit tout saut de ligne en « \\n », et retire les autres contrôles', () => {
    expect(echapper('un\r\ndeux\nthree\rquatre')).toBe('un\\ndeux\\nthree\\nquatre');
    expect(echapper('a\u0000b\u0007c\u007Fd')).toBe('abcd');
  });

  // La norme interdit d'échapper le deux-points : « \: » s'afficherait tel quel.
  it('laisse le deux-points tel quel', () => {
    expect(echapper('Date : 15 décembre')).toBe('Date : 15 décembre');
  });
});

/**
 * LE PLIAGE À 75 OCTETS (§ 3.1), SANS COUPER UNE SÉQUENCE UTF-8.
 *
 * La mesure est en octets : « é » en compte deux, un émoji quatre. Couper au
 * milieu d'une séquence fait afficher un caractère de remplacement — l'erreur
 * que la note du § 3.1 attribue aux implémentations naïves.
 */
describe('pliage', () => {
  const longue = `SUMMARY:${'é'.repeat(50)}${'💶'.repeat(20)}${'a'.repeat(30)}`;

  it('ne dépasse jamais 75 octets par ligne, espace de pliage comprise', () => {
    for (const l of plier(longue).split('\r\n')) {
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(OCTETS_PAR_LIGNE);
    }
  });

  /* Un caractère coupé entre deux lignes devient, à l'encodage, deux
     caractères de remplacement : l'aller-retour en UTF-8 ne rend plus la
     ligne. */
  it('ne coupe aucune séquence UTF-8', () => {
    for (const l of plier(longue).split('\r\n')) {
      expect(new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(l))).toBe(l);
    }
  });

  it('se déplie à l’identique', () => {
    expect(plier(longue).replace(/\r\n /gu, '')).toBe(longue);
  });

  /* L'espace qui ouvre une suite compte dans les 75 octets : sur une
     longue ligne d'ASCII, chaque suite porte 74 caractères, pas 75. */
  it('compte l’espace de pliage dans les 75 octets', () => {
    const ascii = `DESCRIPTION:${'a'.repeat(300)}`;
    const lignes = plier(ascii).split('\r\n');
    expect(lignes.every((l) => new TextEncoder().encode(l).length <= OCTETS_PAR_LIGNE)).toBe(true);
    expect(lignes[1]).toBe(` ${'a'.repeat(74)}`);
  });

  it('laisse une ligne courte telle quelle', () => {
    expect(plier('VERSION:2.0')).toBe('VERSION:2.0');
  });
});

describe('le fichier', () => {
  const ics = calendrierIcs([evenement()], MAINTENANT);

  it('termine chaque ligne par CRLF, sans saut de ligne nu', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/gu, '')).not.toMatch(/[\r\n]/u);
  });

  it('porte VERSION et PRODID une fois chacun', () => {
    expect(lignesLogiques(ics).filter((l) => l.startsWith('VERSION:'))).toEqual(['VERSION:2.0']);
    expect(lignesLogiques(ics).filter((l) => l.startsWith('PRODID:'))).toHaveLength(1);
  });

  it('pose un événement d’une journée entière, la fin exclusive au lendemain', () => {
    expect(lignesLogiques(ics)).toContain('DTSTART;VALUE=DATE:20261215');
    expect(lignesLogiques(ics)).toContain('DTEND;VALUE=DATE:20261216');
  });

  // DTSTAMP « MUST be specified in the UTC time format » (§ 3.8.7.2).
  it('horodate en UTC', () => {
    expect(valeurDe(ics, 'DTSTAMP')).toBe('20261117T093012Z');
  });

  it('prévient trois jours avant', () => {
    expect(lignesLogiques(ics)).toContain('TRIGGER:-P3D');
    expect(calendrierIcs([evenement({ rappelJours: null })], MAINTENANT)).not.toContain('VALARM');
  });
});

/**
 * UN LIBELLÉ HOSTILE.
 *
 * Sauts de ligne, point-virgule, virgule, barre oblique inverse, émoji,
 * deux cents caractères, et une tentative d'ouvrir un événement : le fichier
 * garde exactement ses événements, et la valeur dépliée est la valeur saisie,
 * échappée.
 */
describe('libellé hostile', () => {
  const hostile = `Réunion; client, « X »\\ 🎉\r\nEND:VEVENT\r\nBEGIN:VEVENT\nSUMMARY:pirate ${'é'.repeat(160)}`;
  const ics = calendrierIcs([evenement({ titre: hostile, description: hostile })], MAINTENANT);

  it('n’ouvre aucun événement de plus', () => {
    expect(lignesLogiques(ics).filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lignesLogiques(ics).filter((l) => l.startsWith('SUMMARY:'))).toHaveLength(1);
  });

  it('rend, dépliée, la valeur saisie échappée', () => {
    expect(valeurDe(ics, 'SUMMARY')).toBe(echapper(hostile));
    expect(valeurDe(ics, 'DESCRIPTION')).toBe(echapper(hostile));
  });

  it('plie ses lignes à 75 octets sans couper une séquence', () => {
    for (const l of lignesPhysiques(ics)) {
      const brut = new TextEncoder().encode(l);
      expect(brut.length).toBeLessThanOrEqual(OCTETS_PAR_LIGNE);
      expect(new TextDecoder('utf-8', { fatal: true }).decode(brut)).toBe(l);
    }
  });
});
