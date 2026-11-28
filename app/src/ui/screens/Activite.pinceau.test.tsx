/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Activite } from './Activite';

/**
 * La saisie au pinceau, demandée par le propriétaire le 22/11 : choisir une
 * fois ce qu'on pose, puis toucher ou glisser sur les jours.
 *
 * L'horloge est au mardi 12 mai 2026 : la semaine affichée est celle du lundi
 * 11, dont le jeudi 14 est l'Ascension, et le mois est mai — quatre fériés,
 * dont trois en semaine… et le lundi de Pentecôte.
 */
afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-05-12T09:00:00Z'));
  window.location.hash = '';
  semer();
});

/** Une mission SANS rythme : tout ce qu'elle a, elle le tient du pinceau. */
const mission = (): Faits['missions'][number] => ({
  id: 'mis-1', clientId: null, clientNom: 'ClientA', description: 'Mission A',
  tjm: euros(400), debut: dateISO('2026-01-05'), fin: null, statut: 'active',
  entites: [{
    id: 'mis-1-co1', nom: 'ClientA', couleur: '', adresse: '', contact: '',
    email: '', telephone: '', rythmes: [], ajustements: {}
  }]
});

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), missions: [mission()], ...modifications } });
}

const ajustements = () => useFaits.getState().faits.missions[0]?.entites[0]?.ajustements ?? {};
const joursPoses = () => Object.keys(ajustements()).sort();
const moitie = (motif: RegExp) => screen.getByRole('button', { name: motif });

/** Compte les écritures du magasin : une par geste, pas une par jour. */
function compterLesEcritures(): { readonly combien: () => number; readonly fin: () => void } {
  let n = 0;
  const fin = useFaits.subscribe((e, avant) => { if (e.faits !== avant.faits) n += 1; });
  return { combien: () => n, fin };
}

/** Ouvre l'écran et prend le pinceau du client — la barre arrive à la demande. */
async function prendreLePinceau(nom = 'Pinceau ClientA') {
  render(<Activite />);
  const utilisateur = userEvent.setup();
  await utilisateur.click(await screen.findByRole('button', { name: nom }));
  return utilisateur;
}

/** Passe au mois — qui arrive à la demande, lui aussi : on attend sa grille. */
async function ouvrirLeMois(utilisateur: ReturnType<typeof userEvent.setup>): Promise<void> {
  await utilisateur.click(screen.getByRole('button', { name: 'Mois' }));
  await screen.findByRole('group', { name: /^Plan de charge de / });
}

describe('poser au pinceau', () => {
  /**
   * Une semaine ordinaire, glissée du lundi au dimanche : cinq jours posés,
   * le samedi et le dimanche sautés. Poser le week-end ferait deux corrections
   * à défaire une à une, et un CRA qui facture deux jours non travaillés.
   */
  it('pose cinq jours d’un glissé sur la semaine, et saute samedi et dimanche', async () => {
    vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
    const utilisateur = await prendreLePinceau();
    const ecritures = compterLesEcritures();

    await utilisateur.pointer([
      { keys: '[MouseLeft>]', target: moitie(/^8 juin 2026, matin/) },
      ...['9', '10', '11', '12', '13', '14'].map((j) => ({ target: moitie(new RegExp(`^${j} juin 2026, matin`)) })),
      { keys: '[/MouseLeft]' }
    ]);

    expect(joursPoses()).toEqual(['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12']);
    // UNE écriture pour le geste entier : l'annulation et la synchronisation
    // ne voient qu'un changement.
    expect(ecritures.combien()).toBe(1);
    ecritures.fin();
    expect(screen.getByText(/10 demi-journées posées pour ClientA · sautés : 2 jours de week-end\./)).toBeTruthy();
  });

  /**
   * Du lundi 11 au lundi 18 mai, sur le mois : cinq jours, et l'Ascension
   * sautée avec le week-end. Le message la NOMME — un glissé qui pose quatre
   * jours sur une semaine de cinq, sans dire pourquoi, se referait à la main.
   */
  it('saute le férié d’une plage, et le dit', async () => {
    const utilisateur = await prendreLePinceau();
    await ouvrirLeMois(utilisateur);
    const ecritures = compterLesEcritures();

    await utilisateur.pointer([
      { keys: '[MouseLeft>]', target: moitie(/^11 mai 2026, matin/) },
      { target: moitie(/^14 mai 2026, matin/) },
      { target: moitie(/^18 mai 2026, matin/) },
      { keys: '[/MouseLeft]' }
    ]);

    expect(joursPoses()).toEqual(['2026-05-11', '2026-05-12', '2026-05-13', '2026-05-15', '2026-05-18']);
    expect(ecritures.combien()).toBe(1);
    ecritures.fin();
    expect(screen.getByText(/sautés : 2 jours de week-end, Ascension\./)).toBeTruthy();
  });

  /**
   * Un clic isolé sur un férié le pose : c'est l'astreinte, le rendu du jour
   * de l'Ascension. Une plage le saute, un jour visé exprès non.
   */
  it('pose un férié touché seul, sans ouvrir l’éditeur', async () => {
    const utilisateur = await prendreLePinceau();
    await utilisateur.click(moitie(/^14 mai 2026, matin, jour férié : Ascension/));
    expect(joursPoses()).toEqual(['2026-05-14']);
    expect(ajustements()['2026-05-14']?.quotite).toBe(1);
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
  });

  /**
   * « Jours ouvrés du mois » : les jours de semaine de mai, moins les trois
   * fériés tombés en semaine… et le lundi de Pentecôte, moins le congé déjà
   * posé le 20. Seize jours, en un geste et une écriture.
   */
  it('pose les jours ouvrés du mois d’un raccourci, fériés et congés sautés', async () => {
    semer({ conges: [{ date: dateISO('2026-05-20'), quotite: 1 }] });
    const utilisateur = await prendreLePinceau();
    await ouvrirLeMois(utilisateur);
    const ecritures = compterLesEcritures();

    await utilisateur.click(screen.getByRole('button', { name: 'Jours ouvrés du mois' }));

    const poses = joursPoses();
    expect(poses).toHaveLength(16);
    for (const chome of ['2026-05-01', '2026-05-08', '2026-05-14', '2026-05-25', '2026-05-20', '2026-05-16']) {
      expect(poses).not.toContain(chome);
    }
    expect(ecritures.combien()).toBe(1);
    ecritures.fin();
    expect(screen.getByText(/^32 demi-journées posées pour ClientA/)).toBeTruthy();
  });

  it('pose toute la semaine affichée d’un raccourci', async () => {
    const utilisateur = await prendreLePinceau();
    await utilisateur.click(screen.getByRole('button', { name: 'Toute la semaine' }));
    expect(joursPoses()).toEqual(['2026-05-11', '2026-05-12', '2026-05-13', '2026-05-15']);
  });

  /** Maj + clic pose du dernier jour touché à celui-ci, comme une sélection. */
  it('pose du dernier jour touché au jour visé avec Maj + clic', async () => {
    const utilisateur = await prendreLePinceau();
    await utilisateur.click(moitie(/^11 mai 2026, matin/));
    await utilisateur.keyboard('{Shift>}');
    await utilisateur.click(moitie(/^13 mai 2026, après-midi/));
    await utilisateur.keyboard('{/Shift}');
    expect(joursPoses()).toEqual(['2026-05-11', '2026-05-12', '2026-05-13']);
  });

  /**
   * Au clavier : les flèches déplacent, Maj + flèches étendent, Entrée pose.
   * Sans quoi le geste le plus rapide de l'écran n'existerait que pour la
   * souris.
   */
  it('pose une plage au clavier', async () => {
    const utilisateur = await prendreLePinceau();
    moitie(/^11 mai 2026, matin/).focus();
    await utilisateur.keyboard('{Shift>}{ArrowRight}{ArrowRight}{/Shift}{Enter}');
    expect(joursPoses()).toEqual(['2026-05-11', '2026-05-12', '2026-05-13']);
  });

  it('pose sur la seule portée choisie', async () => {
    const utilisateur = await prendreLePinceau();
    const portee = screen.getByRole('group', { name: 'Portée du pinceau' });
    await utilisateur.click(within(portee).getByRole('button', { name: 'Après-midi' }));
    await utilisateur.click(moitie(/^11 mai 2026, matin/));
    expect(ajustements()['2026-05-11']).toEqual({ quotite: 0.5, creneaux: ['apresMidi'] });
  });
});

describe('défaire un geste', () => {
  /**
   * « Annuler » rétablit l'état d'avant en UN geste : les seize jours d'un
   * raccourci, pas le dernier seulement. Sans ce filet, le geste qui fait
   * gagner le plus de clics serait celui qu'on hésite le plus à faire.
   */
  it('rétablit l’état d’avant d’un seul « Annuler »', async () => {
    semer({ conges: [{ date: dateISO('2026-05-20'), quotite: 1 }] });
    const avant = useFaits.getState().faits;
    const utilisateur = await prendreLePinceau();
    await ouvrirLeMois(utilisateur);
    await utilisateur.click(screen.getByRole('button', { name: 'Jours ouvrés du mois' }));
    expect(joursPoses()).toHaveLength(16);

    const ecritures = compterLesEcritures();
    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(useFaits.getState().faits).toEqual(avant);
    expect(ecritures.combien()).toBe(1);
    ecritures.fin();
    expect(screen.getByText(/Annulé : les journées sont revenues à leur état d’avant\./)).toBeTruthy();
  });

  it('défait le dernier geste avec Ctrl+Z', async () => {
    const utilisateur = await prendreLePinceau();
    await utilisateur.click(moitie(/^11 mai 2026, matin/));
    await utilisateur.click(moitie(/^12 mai 2026, matin/));
    expect(joursPoses()).toEqual(['2026-05-11', '2026-05-12']);
    await utilisateur.keyboard('{Control>}z{/Control}');
    expect(joursPoses()).toEqual(['2026-05-11']);
    await utilisateur.keyboard('{Control>}z{/Control}');
    expect(joursPoses()).toEqual([]);
  });
});

describe('le détail reste à portée', () => {
  /**
   * Le double-clic ouvre l'éditeur d'une demi-journée — et ne laisse rien
   * derrière : son premier clic avait posé le pinceau sur la case qu'on
   * voulait justement examiner.
   */
  it('ouvre l’éditeur d’un double-clic, sans rien poser', async () => {
    const utilisateur = await prendreLePinceau();
    await utilisateur.dblClick(moitie(/^11 mai 2026, matin/));
    expect(await screen.findByRole('button', { name: 'Enregistrer' })).toBeTruthy();
    expect(joursPoses()).toEqual([]);
  });

  /** Reposer le pinceau rend au clic son geste d'avant : l'éditeur. */
  it('rouvre l’éditeur au clic quand on repose le pinceau', async () => {
    const utilisateur = await prendreLePinceau();
    await utilisateur.click(screen.getByRole('button', { name: 'Pinceau ClientA' }));
    await utilisateur.click(moitie(/^11 mai 2026, matin/));
    expect(await screen.findByRole('button', { name: 'Enregistrer' })).toBeTruthy();
    expect(joursPoses()).toEqual([]);
  });
});
