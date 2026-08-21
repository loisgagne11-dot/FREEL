/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { dateISO, euros, mois } from '../../domain/types';
import type { Ajustements } from '../../domain/calculs/planning';
import { type Faits, faitsVides } from '../../state/schema';
import { moisEnChiffres } from '../../state/selecteurs.activite';
import { eur } from '../format';
import { MoisEnChiffres } from './MoisEnChiffres';

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
});

const D = (s: string) => dateISO(s);

const missionDe = (o: {
  nom: string; parJour: Record<string, number>; tjm?: number;
  ajustements?: Ajustements;
}) => ({
  id: `mis-${o.nom}`, clientId: null, clientNom: o.nom, description: 'Mission',
  tjm: euros(o.tjm ?? 500), debut: D('2026-01-01'), fin: null,
  statut: 'active' as const,
  entites: [{
    id: `co-${o.nom}`, nom: o.nom, couleur: '#22c55e', adresse: '', contact: '',
    email: '', telephone: '',
    rythmes: [{
      du: D('2026-01-01'), au: D('2026-12-31'), parJour: o.parJour, tjm: euros(o.tjm ?? 500)
    }],
    ajustements: o.ajustements ?? {}
  }]
});

/**
 * Les chiffres viennent du SÉLECTEUR, jamais d'un objet fabriqué à la main.
 *
 * Un fixture recopié laisserait le test vert si la règle de calcul changeait :
 * il vérifierait le fixture, pas la chaîne. Ici le composant reçoit exactement
 * ce que l'écran lui donne.
 */
const rendre = (faits: Partial<Faits> = {}) => render(
  <MoisEnChiffres
    chiffres={moisEnChiffres({ ...faitsVides(), ...faits } as Faits, mois('2026-06'))}
  />
);

/* ─────────────────────────────────────────────────────────────────────────
   Ce que le panneau mesure
   ───────────────────────────────────────────────────────────────────────── */

describe('les chiffres du mois', () => {
  /**
   * « GÉNÉRÉ », ET NON « ENCAISSÉ ».
   *
   * Les deux diffèrent de tout le délai de paiement. Un mois de juin bien
   * rempli dont les factures rentrent en août se lirait comme un mois faible,
   * et c'est le contraire de ce que le plan de charge doit dire.
   */
  it('compte le CA que le travail du mois produit', () => {
    rendre({ missions: [missionDe({ nom: 'Studio Démo', parJour: { lun: 1 }, tjm: 400 })] });

    // Juin 2026 compte cinq lundis : 5 j à 400 €.
    expect(screen.getByText('Jours travaillés').parentElement?.textContent).toContain('5');
    expect(screen.getByText('CA généré').parentElement?.textContent).toContain(eur(2000));
  });

  /**
   * LE DÉNOMINATEUR EST SOUS LA JAUGE.
   *
   * « 84 % » est une bonne nouvelle sur 22 jours ouvrés et une autre histoire
   * sur 12. Sans lui, le taux ne se compare pas d'un mois à l'autre.
   */
  it('écrit sur quoi le taux d’occupation est calculé', () => {
    rendre({
      missions: [missionDe({ nom: 'Studio Démo', parJour: { lun: 1, mar: 1 } })],
      conges: [{ date: D('2026-06-03'), quotite: 1 }]
    });

    // Juin 2026 : 22 jours de semaine, moins un congé posé un mercredi.
    expect(screen.getByText(/j ouvrés/).textContent).toMatch(/\/ 21\s?j ouvrés/u);
    expect(screen.getByText(/j ouvrés/).textContent).toContain('1 j de congé');
  });

  /**
   * L'ABSTENTION PLUTÔT QUE ZÉRO.
   *
   * Un mois entièrement pris en congé n'a pas une occupation de 0 %, il n'en a
   * pas : le dénominateur est vide. Afficher zéro ferait lire un mois
   * catastrophique là où il n'y a rien à lire.
   */
  it('s’abstient de chiffrer l’occupation d’un mois sans jour ouvrable', () => {
    const toutJuin = Array.from({ length: 30 }, (_, i) => ({
      date: D(`2026-06-${String(i + 1).padStart(2, '0')}`), quotite: 1
    }));
    rendre({ conges: toutJuin });

    expect(screen.getByText('Occupation').parentElement?.textContent).toContain('—');
    expect(screen.getByText('Occupation').parentElement?.textContent).not.toContain('0 %');
  });

  // La jauge est une image : sans valeur à tracer, elle ne se dessine pas.
  it('ne trace aucune jauge quand l’occupation ne se chiffre pas', () => {
    const toutJuin = Array.from({ length: 30 }, (_, i) => ({
      date: D(`2026-06-${String(i + 1).padStart(2, '0')}`), quotite: 1
    }));
    rendre({ conges: toutJuin });
    expect(screen.queryByRole('img')).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   La répartition du temps
   ───────────────────────────────────────────────────────────────────────── */

describe('la répartition du temps', () => {
  /**
   * EN JOURS, ET C'EST TOUT L'INTÉRÊT.
   *
   * L'écran porte une autre répartition, en euros et sur l'année : la
   * dépendance commerciale. Un client qui prend 40 % des journées pour 15 % du
   * chiffre est mal tarifé, et aucune des deux ne le dit seule.
   */
  it('donne les journées de chaque client, du plus lourd au plus léger', () => {
    rendre({
      missions: [
        missionDe({ nom: 'Gros', parJour: { lun: 1, mar: 1 } }),
        missionDe({ nom: 'Petit', parJour: { ven: 0.5 } })
      ]
    });

    const liste = screen.getByRole('list');
    const clients = within(liste).getAllByRole('listitem');
    expect(clients[0]?.textContent).toContain('Gros');
    expect(clients[1]?.textContent).toContain('Petit');
    // Juin 2026 : 5 lundis + 5 mardis = 10 j ; 4 vendredis à ½ = 2 j.
    expect(clients[0]?.textContent).toContain('10');
    expect(clients[1]?.textContent).toContain('2');
  });

  it('dit qu’il n’y a rien à répartir plutôt que d’afficher une barre vide', () => {
    rendre();
    expect(screen.getByText(/rien à répartir/)).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Le télétravail
   ───────────────────────────────────────────────────────────────────────── */

describe('la part de télétravail', () => {
  /**
   * LE POINT DUR : LE DÉNOMINATEUR EST L'INFORMATION.
   *
   * Le lieu n'est connu que sur les demi-journées dont la position a été
   * saisie. Deux demi-journées à domicile sur un mois de vingt jours donnent
   * « 100 % » — parfaitement faux, et d'autant plus crédible que le chiffre est
   * rond. La ligne dit donc sur combien il porte.
   */
  it('dit sur combien de demi-journées la part est calculée', () => {
    rendre({
      missions: [missionDe({
        nom: 'Studio Démo',
        parJour: { lun: 1 },
        ajustements: {
          '2026-06-01': { quotite: 1, creneaux: ['matin', 'apresMidi'], lieu: 'teletravail' }
        }
      })]
    });

    expect(screen.getByText('Télétravail').parentElement?.textContent).toContain('100');
    expect(screen.getByText(/demi-journées renseignées sur/).textContent)
      .toMatch(/sur 2 demi-journées renseignées sur 10/u);
  });

  /** Documenté de bout en bout, la précision n'a rien à dire et n'encombre pas. */
  it('ne précise rien quand tout le mois porte un lieu', () => {
    const ajustements: Record<string, unknown> = {};
    // Les cinq lundis de juin 2026, tous renseignés.
    for (const j of ['01', '08', '15', '22', '29']) {
      ajustements[`2026-06-${j}`] = {
        quotite: 1, creneaux: ['matin', 'apresMidi'], lieu: 'sur_site'
      };
    }
    rendre({
      missions: [missionDe({
        nom: 'Studio Démo', parJour: { lun: 1 }, ajustements: ajustements as Ajustements
      })]
    });

    expect(screen.getByText('Télétravail').parentElement?.textContent).toContain('0');
    expect(screen.queryByText(/demi-journées renseignées sur/)).toBeNull();
  });

  /**
   * AUCUN LIEU RENSEIGNÉ : ON S'ABSTIENT, ET ON DIT POURQUOI.
   *
   * Un « 0 % » se lirait « je n'ai jamais télétravaillé », ce qui n'est pas ce
   * que l'absence de donnée signifie. C'est le même refus que celui de
   * l'autonomie sans besoin mensuel, et pour la même raison.
   */
  it('s’abstient quand aucune demi-journée ne porte de lieu', () => {
    rendre({ missions: [missionDe({ nom: 'Studio Démo', parJour: { lun: 1 } })] });

    const ligne = screen.getByText('Télétravail').parentElement;
    expect(ligne?.textContent).toContain('aucun lieu renseigné');
    expect(ligne?.textContent).not.toContain('0 %');
  });

  /**
   * UN LIEU SANS POSITION N'EST PAS UNE DEMI-JOURNÉE DOCUMENTÉE.
   *
   * Un ajustement peut porter un lieu et AUCUN créneau — un bloc venu d'un
   * compte distant, un formulaire à venir qui demanderait le lieu sans la
   * position. Les deux moitiés sont alors RÉPARTIES par convention : dire
   * « 100 % de télétravail » reviendrait à affirmer que la matinée s'est passée
   * à domicile, ce que personne n'a saisi.
   *
   * Ce test existe parce qu'une mutation a survécu : retirer la garde
   * `sur === 'saisi'` ne faisait tomber aucun test, alors qu'elle porte
   * exactement cette distinction.
   */
  it('ne documente pas une journée dont le lieu est posé sans créneau', () => {
    rendre({
      missions: [missionDe({
        nom: 'Studio Démo',
        parJour: { lun: 1 },
        // Un lieu, mais pas de `creneaux` : la position reste inconnue.
        ajustements: { '2026-06-01': { quotite: 1, lieu: 'teletravail' } }
      })]
    });

    const ligne = screen.getByText('Télétravail').parentElement;
    expect(ligne?.textContent).toContain('aucun lieu renseigné');
    expect(ligne?.textContent).not.toContain('100');
  });

  /**
   * Le lieu se compte par DEMI-JOURNÉE. Une journée à domicile le matin et sur
   * site l'après-midi n'est ni l'un ni l'autre : la compter comme une journée
   * entière obligerait à choisir, et le choix serait faux la moitié du temps.
   */
  it('compte les moitiés, et non les journées', () => {
    rendre({
      missions: [missionDe({
        nom: 'Studio Démo',
        parJour: { lun: 1 },
        ajustements: {
          '2026-06-01': { quotite: 0.5, creneaux: ['matin'], lieu: 'teletravail' },
          '2026-06-08': { quotite: 0.5, creneaux: ['apresMidi'], lieu: 'sur_site' }
        }
      })]
    });

    // Une moitié à domicile sur deux renseignées : 50 %, jamais 0 ni 100.
    expect(screen.getByText('Télétravail').parentElement?.textContent).toContain('50');
  });
});
