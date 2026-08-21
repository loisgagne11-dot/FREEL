/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros, mois } from '../../domain/types';
import type { Ajustements, Creneau } from '../../domain/calculs/planning';
import { type Faits, faitsVides } from '../../state/schema';
import { planningDuMois } from '../../state/selecteurs.activite';
import { VueMois } from './VueMois';

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
});

const D = (s: string) => dateISO(s);

/**
 * Le planning vient du SÉLECTEUR, pas d'un objet fabriqué à la main.
 *
 * Un fixture recopié laisserait le test vert si la règle de répartition des
 * créneaux changeait : il vérifierait le fixture, pas la chaîne. Ici le
 * composant reçoit exactement ce que l'écran lui donne.
 */
function planning(faits: Partial<Faits> = {}) {
  return planningDuMois({ ...faitsVides(), ...faits } as Faits, mois('2026-06'));
}

const missionDe = (o: {
  nom: string; couleur?: string; parJour: Record<string, number>;
  ajustements?: Ajustements;
}) => ({
  id: `mis-${o.nom}`, clientId: null, clientNom: o.nom, description: 'Mission',
  tjm: euros(500), debut: D('2026-01-01'), fin: null, statut: 'active' as const,
  entites: [{
    id: `co-${o.nom}`, nom: o.nom, couleur: o.couleur ?? '', adresse: '',
    contact: '', email: '', telephone: '',
    rythmes: [{
      du: D('2026-01-01'), au: D('2026-12-31'),
      parJour: o.parJour, tjm: euros(500)
    }],
    ajustements: o.ajustements ?? {}
  }]
});

const rendre = (
  faits: Partial<Faits> = {},
  onBasculer: (d: string, m: string, e: string, c: Creneau) => void = () => { /* ailleurs */ }
) => render(
  <VueMois
    planning={planning(faits)}
    libellePeriode="juin 2026"
    aujourdhui={D('2026-06-10')}
    onBasculer={onBasculer}
  />
);

/* ─────────────────────────────────────────────────────────────────────────
   La grille
   ───────────────────────────────────────────────────────────────────────── */

describe('la grille du mois', () => {
  /**
   * Juin 2026 compte 30 jours, et chacun porte DEUX moitiés : 60 cases. Un mois
   * dessiné avec une case par jour ne saurait pas montrer une demi-journée —
   * c'est le défaut que le schéma 14 est venu corriger.
   */
  it('donne deux moitiés à chacun des trente jours de juin', () => {
    rendre();
    expect(screen.getAllByRole('button')).toHaveLength(60);
  });

  /**
   * LE DÉCALAGE DU 1ᵉʳ.
   *
   * Le 1ᵉʳ juin 2026 est un LUNDI : la grille commence sans case vide. Un
   * décalage calculé sur un dimanche à zéro ferait glisser le mois entier d'un
   * jour, et chaque journée tomberait sur le mauvais jour de semaine.
   */
  it('aligne le premier jour sur son jour de semaine', () => {
    const { container } = rendre();
    // Juin 2026 commence un lundi : aucune case hors mois avant lui.
    expect(container.querySelectorAll('[class*="horsMois"]')).toHaveLength(0);
  });

  it('décale le premier jour d’un mois qui ne commence pas un lundi', () => {
    // Juillet 2026 commence un MERCREDI : deux cases vides devant.
    const { container } = render(
      <VueMois
        planning={planningDuMois(faitsVides(), mois('2026-07'))}
        libellePeriode="juillet 2026"
        aujourdhui={D('2026-07-01')}
        onBasculer={() => { /* ailleurs */ }}
      />
    );
    expect(container.querySelectorAll('[class*="horsMois"]')).toHaveLength(2);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Ce que chaque case dit
   ───────────────────────────────────────────────────────────────────────── */

describe('ce que chaque moitié porte', () => {
  /**
   * LES INITIALES SONT UNE ABRÉVIATION, LE NOM ACCESSIBLE EST LA DONNÉE.
   *
   * Une case de mois fait soixante pixels : « Brasserie Vent d'Ouest » y serait
   * tronqué à « Brass… », ce qui ne distingue plus deux clients. Un lecteur
   * d'écran, lui, n'a pas de contrainte de largeur — lui servir « BV » serait
   * lui servir moins que ce que l'œil reçoit.
   */
  it('abrège à l’écran et nomme en entier pour la lecture', () => {
    rendre({ missions: [missionDe({ nom: 'Brasserie Vent', parJour: { lun: 1 } })] });

    const case1 = screen.getByRole('button', { name: /^1 juin 2026, matin, Brasserie Vent/ });
    expect(case1.textContent).toContain('BV');
    expect(case1.textContent).not.toContain('Brasserie Vent d');
  });

  /** Un nom d'un seul mot donne ses deux premières lettres, jamais une seule :
      « K » solitaire serait ambigu dès le deuxième client en K. */
  it('prend deux lettres même sur un nom d’un seul mot', () => {
    rendre({ missions: [missionDe({ nom: 'Kessler', parJour: { lun: 1 } })] });
    expect(screen.getByRole('button', { name: /^1 juin 2026, matin, Kessler/ }).textContent)
      .toContain('KE');
  });

  /**
   * Une demi-journée d'APRÈS-MIDI remplit la seconde moitié et laisse la
   * première vide — le cas qu'aucune convention ne sait rendre.
   */
  it('place une demi-journée d’après-midi sur la bonne moitié', () => {
    rendre({
      missions: [missionDe({
        nom: 'Studio Démo',
        parJour: { lun: 1 },
        ajustements: { '2026-06-01': { quotite: 0.5, creneaux: ['apresMidi'] } }
      })]
    });

    expect(screen.getByRole('button', { name: /^1 juin 2026, matin, libre/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^1 juin 2026, après-midi, Studio Démo/ }))
      .toBeTruthy();
  });

  /**
   * LE LIEU EST UN FAIT. Sur un créneau seulement RÉPARTI — la position n'a pas
   * été saisie — il n'y en a pas, et en dessiner un serait l'inventer.
   */
  it('ne montre le lieu que sur une position saisie', () => {
    rendre({
      missions: [missionDe({
        nom: 'Sur Site',
        parJour: { lun: 1 },
        ajustements: {
          '2026-06-01': { quotite: 1, creneaux: ['matin', 'apresMidi'], lieu: 'sur_site' }
        }
      })]
    });

    const saisi = screen.getByRole('button', { name: /^1 juin 2026, matin, Sur Site/ });
    const reparti = screen.getByRole('button', { name: /^8 juin 2026, matin, Sur Site/ });
    expect(saisi.textContent).toContain('▤');
    expect(reparti.textContent).not.toContain('▤');
  });

  /** Le congé porte sa lettre, et la légende la donne — sans elle, « C » n'est
      qu'un caractère de plus dans une case. */
  it('marque les congés d’un C', () => {
    rendre({ conges: [{ date: D('2026-06-02'), quotite: 1 }] });
    expect(screen.getByRole('button', { name: /^2 juin 2026, matin, congé/ }).textContent)
      .toContain('C');
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   La légende, et le clic
   ───────────────────────────────────────────────────────────────────────── */

describe('la légende du mois', () => {
  it('donne la clé des initiales employées sur la grille', () => {
    rendre({ missions: [missionDe({ nom: 'Studio Démo', parJour: { lun: 1 } })] });

    const legende = screen.getByRole('list');
    expect(within(legende).getByText('SD')).toBeTruthy();
    expect(within(legende).getByText('Studio Démo')).toBeTruthy();
    expect(within(legende).getByText('Congé')).toBeTruthy();
  });

  // Les clients absents du mois n'y figurent pas : chercher une couleur qui
  // n'est nulle part sur la grille est une perte de temps garantie.
  it('ne nomme que les clients présents ce mois-ci', () => {
    rendre({
      missions: [
        missionDe({ nom: 'Présent', parJour: { lun: 1 } }),
        missionDe({ nom: 'Absent', parJour: {} })
      ]
    });

    const legende = screen.getByRole('list');
    expect(within(legende).getByText('Présent')).toBeTruthy();
    expect(within(legende).queryByText('Absent')).toBeNull();
  });
});

describe('le clic sur une moitié du mois', () => {
  /**
   * LE MÊME GESTE QUE LA SEMAINE.
   *
   * Deux onglets du même écran, à un clic l'un de l'autre : un clic qui
   * basculerait la journée entière ici et la moitié là-bas serait un piège.
   */
  it('remonte la date, la ligne et la moitié visée', async () => {
    const appels: unknown[][] = [];
    rendre(
      { missions: [missionDe({ nom: 'Studio Démo', parJour: { lun: 1 } })] },
      (...args) => appels.push(args)
    );

    await userEvent.setup()
      .click(screen.getByRole('button', { name: /^1 juin 2026, après-midi/ }));

    expect(appels).toHaveLength(1);
    expect(appels[0]?.[0]).toBe('2026-06-01');
    expect(appels[0]?.[3]).toBe('apresMidi');
  });

  /**
   * Un week-end reste cliquable : les astreintes et les rendus de nuit
   * existent, et un plan de charge qui les refuse fait perdre de l'argent.
   */
  it('laisse déclarer une moitié de week-end', async () => {
    const appels: unknown[][] = [];
    rendre({}, (...args) => appels.push(args));

    // Samedi 6 juin 2026.
    await userEvent.setup()
      .click(screen.getByRole('button', { name: /^6 juin 2026, matin/ }));

    expect(appels).toHaveLength(1);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Le compte, et son accord avec la semaine
   ───────────────────────────────────────────────────────────────────────── */

describe('le compte du mois', () => {
  /**
   * Juin 2026 : 22 jours de semaine, aucun férié. Le même décompte que le plan
   * de charge, et par la même fonction du domaine — deux comptes de « jours
   * ouvrés » sur un même écran finissent par ne pas tomber d'accord.
   */
  it('annonce les jours ouvrés du mois', () => {
    rendre();
    expect(screen.getByText(/22 jours ouvrés/)).toBeTruthy();
  });

  it('nomme les congés à part, sans les retirer des ouvrés', () => {
    rendre({ conges: [{ date: D('2026-06-02'), quotite: 1 }] });
    const resume = screen.getByText(/jours ouvrés/);
    expect(resume.textContent).toMatch(/22 jours ouvrés/);
    expect(resume.textContent).toMatch(/dont 1 de congé/);
  });

  it('totalise ce qui a été travaillé', () => {
    rendre({ missions: [missionDe({ nom: 'Studio Démo', parJour: { lun: 1 } })] });
    // Juin 2026 compte cinq lundis : 1, 8, 15, 22, 29.
    expect(screen.getByText('5 j')).toBeTruthy();
  });
});
