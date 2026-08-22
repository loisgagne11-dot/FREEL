/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO } from '../../domain/types';
import { CRENEAUX, creneauxOccupes } from '../../domain/calculs/planning';
import type { Creneau, Lieu } from '../../domain/calculs/planning';
import type { JourDeLaSemaine, PlanningSemaine } from '../../state/selecteurs.activite';
import { VueSemaine } from './VueSemaine';

afterEach(cleanup);

/** Une ligne d'occupation, telle que le sélecteur la rend. */
const ligne = (o: {
  nom?: string; description?: string; couleur?: string;
  retenu?: number; ajuste?: boolean; lieu?: Lieu | null;
  creneaux?: readonly Creneau[] | null;
} = {}) => ({
  missionId: 'mis-1',
  entiteId: `co-${o.nom ?? 'A'}`,
  libelle: o.description ?? 'Mission',
  nom: o.nom ?? 'Studio Démo',
  description: o.description ?? 'Design system',
  couleur: o.couleur ?? '',
  prevu: 1,
  retenu: o.retenu ?? 1,
  ajuste: o.ajuste ?? false,
  lieu: o.lieu ?? null,
  positions: o.creneaux ?? null
});

/**
 * Un jour, avec ses créneaux dérivés comme le sélecteur les dérive.
 *
 * Le fabricant emploie `creneauxOccupes` — la MÊME fonction que le sélecteur.
 * Le recopier à la main ferait un test qui vérifie le fabricant plutôt que le
 * composant, et qui resterait vert si la règle de répartition changeait.
 */
const jour = (
  date: string,
  o: Partial<{
    ferie: boolean; weekEnd: boolean; conge: number;
    lignes: readonly ReturnType<typeof ligne>[];
  }> = {}
): JourDeLaSemaine => {
  const lignes = o.lignes ?? [];
  return {
    date: dateISO(date),
    ferie: o.ferie ?? false,
    weekEnd: o.weekEnd ?? false,
    conge: o.conge ?? 0,
    prevu: lignes.reduce((s, l) => s + l.prevu, 0),
    retenu: lignes.reduce((s, l) => s + l.retenu, 0),
    parMission: lignes.map(({ positions: _p, ...l }) => l),
    creneaux: CRENEAUX.map((creneau) => ({
      creneau,
      occupants: lignes.flatMap((l) => {
        const occupe = creneauxOccupes(l.retenu, l.positions).find((c) => c.creneau === creneau);
        if (occupe === undefined) return [];
        const { positions: _p, ...reste } = l;
        return [{ ...reste, sur: occupe.sur }];
      })
    }))
  };
};

/** Une semaine ordinaire : lundi 6 au dimanche 12 juillet 2026. */
function semaine(modifications: Partial<Record<string, JourDeLaSemaine>> = {}) {
  const base = [
    jour('2026-07-06'), jour('2026-07-07'), jour('2026-07-08'),
    jour('2026-07-09'), jour('2026-07-10'),
    jour('2026-07-11', { weekEnd: true }), jour('2026-07-12', { weekEnd: true })
  ];
  const jours = base.map((j) => modifications[j.date] ?? j);
  const planning: PlanningSemaine = {
    lundi: dateISO('2026-07-06'),
    jours,
    totalPrevu: jours.reduce((s, j) => s + j.prevu, 0),
    totalRetenu: jours.reduce((s, j) => s + j.retenu, 0)
  };
  return planning;
}

const rendre = (
  planning: PlanningSemaine,
  onBasculer: (d: string, m: string, e: string, c: Creneau) => void = () => { /* ailleurs */ }
) => render(
  <VueSemaine
    planning={planning}
    aujourdhui={dateISO('2026-07-08')}
    onBasculer={onBasculer}
    onRevenirAuRythme={() => { /* testé ailleurs */ }}
  />
);

/* ─────────────────────────────────────────────────────────────────────────
   Le compte des jours ouvrés
   ───────────────────────────────────────────────────────────────────────── */

/**
 * LE CHIFFRE QUE LE DOMAINE CALCULE, ET QUE RIEN NE GARDAIT À L'ÉCRAN.
 *
 * `decompterJours` est éprouvé côté domaine, y compris son accord avec le plan
 * de charge du mois. Mais son seul chemin vers l'utilisateur ne l'était pas :
 * supprimer le paragraphe de résumé laissait les tests au vert.
 *
 * Un calcul juste qu'aucun écran ne montre ne vaut pas mieux qu'un calcul
 * absent — c'est la leçon que ce projet a déjà payée quatre fois avec les
 * actions du magasin injoignables.
 */
describe('compte des jours ouvrés de la semaine', () => {
  it('affiche les jours ouvrés de la semaine visible', () => {
    rendre(semaine());
    // « j ouvrés », comme le dessin — voir la correction d'ergonomie sur
    // l'abréviation, dans VueSemaine.tsx.
    expect(screen.getByText(/5 j ouvrés/)).toBeTruthy();
  });

  /**
   * Cinq n'est pas toujours la réponse : une semaine avec un férié en compte
   * quatre, et un taux d'occupation lu sans le savoir est faux d'un cinquième.
   */
  it('retire les jours fériés du compte', () => {
    rendre(semaine({ '2026-07-08': jour('2026-07-08', { ferie: true }) }));
    expect(screen.getByText(/4 j ouvrés/)).toBeTruthy();
  });

  /**
   * LE POINT QUI COMPTE. Les congés restent des jours OUVRÉS — c'est le mois
   * qui les retire, pour son dénominateur d'occupation. Les deux nombres sont
   * justes, et l'écran les dit ensemble plutôt que d'en choisir un.
   */
  it('compte les congés parmi les ouvrés, et les nomme à part', () => {
    rendre(semaine({
      '2026-07-06': jour('2026-07-06', { conge: 1 }),
      '2026-07-07': jour('2026-07-07', { conge: 1 })
    }));
    const resume = screen.getByText(/j ouvrés/);
    expect(resume.textContent).toMatch(/5 j ouvrés/);
    expect(resume.textContent).toMatch(/dont 2 de congé/);
  });

  // Sans congé, la précision n'a rien à dire et n'encombre pas la ligne.
  it('ne mentionne les congés que s’il y en a', () => {
    rendre(semaine());
    expect(screen.getByText(/j ouvrés/).textContent).not.toMatch(/congé/);
  });

  // Une demi-journée occupe le jour : il compte comme jour en congé.
  it('tient une demi-journée pour un jour en congé', () => {
    rendre(semaine({ '2026-07-06': jour('2026-07-06', { conge: 0.5 }) }));
    expect(screen.getByText(/j ouvrés/).textContent).toMatch(/dont 1 de congé/);
  });

  /**
   * LA CONVENTION EST ANNONCÉE, PARCE QUE C'EN EST UNE.
   *
   * Une journée dont les créneaux n'ont pas été saisis est RÉPARTIE entre matin
   * et après-midi pour pouvoir être dessinée. Ne pas le dire ferait lire une
   * position que personne n'a renseignée — et le lecteur n'a aucun moyen de
   * distinguer les deux cas sur la grille.
   */
  it('annonce la convention de lecture de la grille', () => {
    rendre(semaine());
    expect(screen.getByText(/matin.+après-midi.+client.+lieu/u)).toBeTruthy();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   La journée se lit par créneau
   ───────────────────────────────────────────────────────────────────────── */

describe('les deux moitiés de la journée', () => {
  /**
   * CE QUE LA VERSION D'AVANT NE POUVAIT PAS DIRE.
   *
   * Elle empilait une paire de cases par client, sans nommer les moitiés :
   * « 0,5 j » se dessinait sur la première case et rien ne disait laquelle
   * c'était. Les moitiés portent maintenant leur nom.
   */
  it('nomme le matin et l’après-midi de chaque jour', () => {
    rendre(semaine({ '2026-07-06': jour('2026-07-06', { lignes: [ligne()] }) }));
    expect(screen.getAllByText('MATIN').length).toBe(7);
    expect(screen.getAllByText('APRÈS-M.').length).toBe(7);
  });

  it('porte le nom du client et ce qu’on fait pour lui', () => {
    rendre(semaine({
      '2026-07-06': jour('2026-07-06', {
        lignes: [ligne({ nom: 'Studio Démo', description: 'Design system' })]
      })
    }));
    expect(screen.getAllByText('Studio Démo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Design system').length).toBeGreaterThan(0);
  });

  /**
   * LE POINT DUR DU SCHÉMA 14.
   *
   * Une demi-journée d'APRÈS-MIDI remplit la seconde moitié et laisse la
   * première vide. C'est exactement ce qu'aucune convention ne saurait rendre :
   * « 0,5 » remplissait le matin, toujours, et se trompait une fois sur deux.
   */
  it('place une demi-journée d’après-midi sur la bonne moitié', () => {
    rendre(semaine({
      '2026-07-06': jour('2026-07-06', {
        lignes: [ligne({ nom: 'Après-midi', retenu: 0.5, creneaux: ['apresMidi'] })]
      })
    }));

    const matin = screen.getByRole('button', { name: /6 juil\. 2026, matin/ });
    const apresMidi = screen.getByRole('button', { name: /6 juil\. 2026, après-midi/ });
    expect(matin.textContent).not.toContain('Après-midi');
    expect(apresMidi.textContent).toContain('Après-midi');
  });

  /**
   * DEUX CLIENTS SUR LA MÊME MATINÉE.
   *
   * Le dessin ne montre jamais le cas — son jeu d'exemple ne l'a pas. N'afficher
   * que le premier ferait DISPARAÎTRE du travail déclaré, en silence, pendant
   * que le CRA continuerait de le compter.
   */
  it('montre les deux clients quand deux occupent le même créneau', () => {
    rendre(semaine({
      '2026-07-06': jour('2026-07-06', {
        lignes: [ligne({ nom: 'Client Un' }), ligne({ nom: 'Client Deux' })]
      })
    }));

    const matin = screen.getByRole('button', { name: /6 juil\. 2026, matin/ });
    expect(matin.textContent).toContain('Client Un');
    expect(matin.textContent).toContain('Client Deux');
  });

  /**
   * LA BANDE NE MENT PAS SUR QUI L'OCCUPE.
   *
   * La case prenait sa couleur sur le PREMIER occupant : un créneau à deux
   * clients affichait un fond d'une seule teinte alors que deux noms y
   * figuraient — la couleur affirmait un fait faux. Ici les deux teintes
   * doivent apparaître, pas seulement celle de « Client Un ».
   */
  it('ne teinte pas un créneau à deux occupants de la seule couleur du premier', () => {
    rendre(semaine({
      '2026-07-06': jour('2026-07-06', {
        lignes: [
          ligne({ nom: 'Client Un', couleur: '#3b82f6' }),
          ligne({ nom: 'Client Deux', couleur: '#a855f7' })
        ]
      })
    }));

    const matin = screen.getByRole('button', { name: /6 juil\. 2026, matin/ });
    const fond = matin.style.background;
    expect(fond).toContain('#3b82f6');
    expect(fond).toContain('#a855f7');
  });

  /**
   * LE DOSAGE DU FOND SUIT CELUI DU DESSIN, PAS CELUI DE LA TEINTE SAISIE.
   *
   * Même règle que VueMois, pour la même raison : un dosage trop généreux
   * laisse ressortir la vivacité d'une teinte saisie par l'utilisateur au
   * lieu de l'atténuer comme le fait le dessin (`rgba(couleur,.2)`). Sans ce
   * test, remonter le dosage à 22 % (l'ancien réglage) ne ferait rien
   * échouer.
   */
  it('assourdit la teinte du client au même dosage que le dessin', () => {
    rendre(semaine({
      '2026-07-06': jour('2026-07-06', { lignes: [ligne({ nom: 'Client', couleur: '#3b82f6' })] })
    }));

    const matin = screen.getByRole('button', { name: /6 juil\. 2026, matin/ });
    expect(matin.style.background).toContain('color-mix(in srgb, #3b82f6 20%, var(--panel))');
  });

  /**
   * LE LIEU EST UN FAIT, PAS UNE DÉDUCTION.
   *
   * Sur un créneau seulement RÉPARTI — la position n'a pas été saisie — il n'y a
   * pas de lieu. En dessiner un serait l'inventer, et il serait indiscernable
   * d'un lieu réellement déclaré.
   */
  it('n’affiche le lieu que sur un créneau dont la position est saisie', () => {
    rendre(semaine({
      '2026-07-06': jour('2026-07-06', {
        lignes: [ligne({ nom: 'Sur site', lieu: 'sur_site', creneaux: ['matin', 'apresMidi'] })]
      }),
      '2026-07-07': jour('2026-07-07', {
        // Même lieu porté par la ligne, mais AUCUNE position saisie.
        lignes: [ligne({ nom: 'Réparti', lieu: 'sur_site', creneaux: null })]
      })
    }));

    const saisi = screen.getByRole('button', { name: /6 juil\. 2026, matin/ });
    const reparti = screen.getByRole('button', { name: /7 juil\. 2026, matin/ });
    expect(within(saisi).getAllByTitle('sur site').length).toBe(1);
    expect(within(reparti).queryByTitle('sur site')).toBeNull();
  });

  /**
   * LE CONGÉ NE HACHURE QUE CE QUI EST LIBRE.
   *
   * Une demi-journée de congé le matin laisse l'après-midi travaillé. Hachurer
   * les deux dirait le contraire de ce que le CRA compte.
   */
  it('laisse le créneau travaillé visible sur un jour à demi en congé', () => {
    rendre(semaine({
      '2026-07-06': jour('2026-07-06', {
        conge: 0.5,
        lignes: [ligne({ nom: 'Travaillé', retenu: 0.5, creneaux: ['apresMidi'] })]
      })
    }));

    expect(screen.getByRole('button', { name: /6 juil\. 2026, matin, congé/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /6 juil\. 2026, après-midi, Travaillé/ }))
      .toBeTruthy();
  });

  it('dit « libre » d’une moitié que rien n’occupe', () => {
    rendre(semaine());
    expect(screen.getByRole('button', { name: /6 juil\. 2026, matin, libre/ })).toBeTruthy();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Le clic vise une moitié
   ───────────────────────────────────────────────────────────────────────── */

describe('le clic sur une moitié', () => {
  /**
   * Le créneau cliqué doit remonter. Sans lui, l'appelant ne peut que faire
   * tourner la journée entière — et l'écran retomberait sur le geste que le
   * schéma 14 est venu remplacer.
   */
  it('remonte la moitié visée, et non seulement le jour', async () => {
    const appels: unknown[][] = [];
    rendre(
      semaine({ '2026-07-06': jour('2026-07-06', { lignes: [ligne({ nom: 'Client' })] }) }),
      (...args) => appels.push(args)
    );
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: /6 juil\. 2026, après-midi/ }));

    expect(appels).toHaveLength(1);
    expect(appels[0]?.[0]).toBe('2026-07-06');
    expect(appels[0]?.[3]).toBe('apresMidi');
  });

  /**
   * Une moitié vide reste cliquable : c'est là qu'on déclare une demi-journée
   * que le rythme ne prévoyait pas — un rendu un samedi, une astreinte un
   * férié. L'ancienne application le permettait déjà.
   */
  it('laisse déclarer une moitié que le rythme ne prévoyait pas', async () => {
    const appels: unknown[][] = [];
    rendre(semaine(), (...args) => appels.push(args));
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: /11 juil\. 2026, matin/ }));

    expect(appels).toHaveLength(1);
    // Sans ligne à viser, l'écran devra demander à qui rattacher la journée.
    expect(appels[0]?.[2]).toBe('');
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   La légende
   ───────────────────────────────────────────────────────────────────────── */

describe('la légende', () => {
  /**
   * Sept teintes sur quatorze cases ne se lisent pas sans clé. La légende ne
   * liste que les clients PRÉSENTS cette semaine : y faire figurer les autres
   * ferait chercher une couleur qui n'est nulle part sur la grille.
   */
  it('ne nomme que les clients présents cette semaine', () => {
    rendre(semaine({
      '2026-07-06': jour('2026-07-06', { lignes: [ligne({ nom: 'Présent' })] })
    }));

    const legende = screen.getByRole('list');
    expect(within(legende).getByText('Présent')).toBeTruthy();
    expect(within(legende).getByText('Congé')).toBeTruthy();
    expect(within(legende).getByText('télétravail')).toBeTruthy();
    expect(within(legende).getByText('sur site')).toBeTruthy();
  });

  // Un client ne figure qu'une fois, quel que soit le nombre de jours occupés.
  it('ne répète pas un client présent plusieurs jours', () => {
    rendre(semaine({
      '2026-07-06': jour('2026-07-06', { lignes: [ligne({ nom: 'Répété' })] }),
      '2026-07-07': jour('2026-07-07', { lignes: [ligne({ nom: 'Répété' })] })
    }));

    const legende = screen.getByRole('list');
    expect(within(legende).getAllByText('Répété')).toHaveLength(1);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Défaire
   ───────────────────────────────────────────────────────────────────────── */

describe('revenir au rythme', () => {
  /**
   * Le bouton n'apparaît que s'il y a quelque chose à défaire : un bouton
   * toujours là qui ne fait rien apprend à ne plus le regarder.
   */
  it('reste absent tant qu’aucune journée n’est corrigée', () => {
    rendre(semaine({ '2026-07-06': jour('2026-07-06', { lignes: [ligne()] }) }));
    expect(screen.queryByRole('button', { name: /Revenir au rythme/ })).toBeNull();
  });

  it('apparaît dès qu’une journée est corrigée', () => {
    rendre(semaine({
      '2026-07-06': jour('2026-07-06', { lignes: [ligne({ ajuste: true })] })
    }));
    expect(screen.getByRole('button', { name: /Revenir au rythme/ })).toBeTruthy();
  });

  it('appelle son action au clic', async () => {
    const defaire = vi.fn();
    render(
      <VueSemaine
        planning={semaine({
          '2026-07-06': jour('2026-07-06', { lignes: [ligne({ ajuste: true })] })
        })}
        aujourdhui={dateISO('2026-07-08')}
        onBasculer={() => { /* ailleurs */ }}
        onRevenirAuRythme={defaire}
      />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: /Revenir au rythme/ }));
    expect(defaire).toHaveBeenCalledOnce();
  });
});
