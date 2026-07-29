/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { Activite } from './Activite';

afterEach(() => { cleanup(); vi.useRealTimers(); });

/**
 * L'écran s'ouvre sur le mois courant, lu à l'horloge. On la fixe pour que les
 * assertions portent sur un mois connu — juillet 2026 : 23 jours de semaine,
 * dont le 14 férié, soit 22 jours ouvrables.
 */
function figerHorloge(): void {
  // `shouldAdvanceTime` laisse le temps s'écouler malgré l'horloge figée :
  // sans lui, les délais internes de `userEvent` n'arrivent jamais à terme et
  // chaque interaction expire.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-07-15T09:00:00Z'));
}

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...modifications } });
}

beforeEach(() => { figerHorloge(); semer(); });

const mission = (m: Partial<Faits['missions'][number]> = {}) => ({
  id: 'mis-1', clientId: null, clientNom: 'ClientA', description: 'Mission A',
  tjm: euros(400), debut: dateISO('2026-01-05'), fin: null,
  statut: 'active' as const, ...m
});

const recette = (m: Partial<Faits['recettes'][number]> = {}) => ({
  id: 'rec-1', clientNom: 'ClientA', libelle: 'Facture', montant: euros(4000),
  emiseLe: dateISO('2026-07-10'), encaisseeLe: null,
  modeReglement: null, numero: '2026-001', ...m
});

describe('plan de charge', () => {
  // L'ancienne application divisait par 20, une constante : un mois de mai à
  // 19 jours ouvrés donnait 95 % à qui avait travaillé tous les jours.
  it('affiche les jours ouvrables réels du mois', () => {
    render(<Activite />);
    // Juillet 2026 : 23 jours de semaine, moins le 14 juillet (mardi).
    expect(screen.getByText('Jours ouvrables').nextSibling?.textContent).toBe('22');
  });

  it('convertit les recettes du mois en équivalent-jours', () => {
    semer({ missions: [mission()], recettes: [recette()] });
    render(<Activite />);
    // 4 000 € à 400 € par jour → 10 jours.
    expect(screen.getByText('Équivalent-jours facturés').nextSibling?.textContent).toBe('10');
  });

  it('rapporte les jours facturés aux jours ouvrables', () => {
    semer({ missions: [mission()], recettes: [recette()] });
    render(<Activite />);
    // 10 / 22 ≈ 45 %. L'espace avant le signe est une insécable étroite,
    // posée par l'API d'internationalisation : la comparer à une espace
    // ordinaire ferait échouer un affichage pourtant correct.
    expect(screen.getByText('Occupation').nextSibling?.textContent).toMatch(/^45\s%$/u);
  });

  // Les compter à un tarif supposé fabriquerait de l'occupation.
  it('signale les recettes dont le tarif journalier est inconnu', () => {
    semer({ recettes: [recette()] });
    render(<Activite />);
    expect(screen.getByText(/pas de tarif journalier connu/)).toBeTruthy();
    expect(screen.getByText('Équivalent-jours facturés').nextSibling?.textContent).toBe('0');
  });

  it('n’affiche aucune occupation quand aucun jour n’est ouvrable', () => {
    const toutJuillet = Array.from(
      { length: 31 },
      (_, i) => dateISO(`2026-07-${String(i + 1).padStart(2, '0')}`)
    );
    semer({ conges: toutJuillet });
    render(<Activite />);
    expect(screen.getByText('Occupation').nextSibling?.textContent).toBe('—');
  });
});

describe('calendrier des congés', () => {
  // La modale de l'ancienne version empêchait de voir en même temps les jours
  // posés et leur effet sur l'occupation — la seule question qui se pose.
  it('est dans la page, pas dans une fenêtre', () => {
    render(<Activite />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: /Congés de juillet 2026/i })).toBeTruthy();
  });

  it('pose un congé au clic, et le retire au clic suivant', async () => {
    render(<Activite />);
    const utilisateur = userEvent.setup();
    const lundi = screen.getByRole('button', { name: /27 juil\. 2026, jour travaillé/ });

    await utilisateur.click(lundi);
    expect(useFaits.getState().faits.conges).toEqual(['2026-07-27']);

    await utilisateur.click(screen.getByRole('button', { name: /27 juil\. 2026, congé posé/ }));
    expect(useFaits.getState().faits.conges).toEqual([]);
  });

  it('fait baisser les jours ouvrables et monter l’occupation', async () => {
    semer({ missions: [mission()], recettes: [recette()] });
    render(<Activite />);
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: /27 juil\. 2026, jour travaillé/ }));
    expect(screen.getByText('Jours ouvrables').nextSibling?.textContent).toBe('21');
    // 10 / 21 ≈ 48 %.
    expect(screen.getByText('Occupation').nextSibling?.textContent).toMatch(/^48\s%$/u);
  });

  // Un congé posé ce jour-là ne consomme rien et ne changerait aucun chiffre.
  it('n’offre pas de poser un congé un jour férié ou un week-end', () => {
    render(<Activite />);
    expect(screen.queryByRole('button', { name: /14 juil\. 2026, jour travaillé/ })).toBeNull();
    expect(screen.getByText(/14 juil\. 2026, jour férié/)).toBeTruthy();
    expect(screen.getByText(/25 juil\. 2026, week-end/)).toBeTruthy();
  });

  it('compte les congés de l’année entière, pas seulement du mois affiché', () => {
    semer({ conges: [dateISO('2026-02-16'), dateISO('2026-08-10'), dateISO('2025-12-24')] });
    render(<Activite />);
    expect(screen.getByText('Congés posés dans l’année').nextSibling?.textContent).toBe('2');
  });
});

describe('navigation entre les mois', () => {
  // L'ancienne application recalculait tout sur « le mois courant » lu à
  // l'affichage : consulter un mois passé supposait de changer l'horloge.
  it('permet de reculer et d’avancer', async () => {
    render(<Activite />);
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Mois précédent' }));
    expect(screen.getByRole('status').textContent).toBe('juin 2026');

    await utilisateur.click(screen.getByRole('button', { name: 'Mois suivant' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Mois suivant' }));
    expect(screen.getByRole('status').textContent).toBe('août 2026');
  });

  it('franchit correctement le passage à l’année', async () => {
    render(<Activite />);
    const utilisateur = userEvent.setup();
    for (let i = 0; i < 6; i++) {
      await utilisateur.click(screen.getByRole('button', { name: 'Mois suivant' }));
    }
    expect(screen.getByRole('status').textContent).toBe('janvier 2027');
  });
});

describe('missions', () => {
  it('montre ce que chaque mission a facturé et encaissé', async () => {
    semer({
      missions: [mission()],
      recettes: [
        recette({ id: 'r1', montant: euros(4000), encaisseeLe: dateISO('2026-07-20') }),
        recette({ id: 'r2', montant: euros(2000), encaisseeLe: null })
      ]
    });
    render(<Activite />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('tab', { name: 'Missions' }));

    const liste = screen.getByRole('list');
    expect(within(liste).getByText('Mission A')).toBeTruthy();
    expect(within(liste).getByText(/Encaissé 4 000/)).toBeTruthy();
    expect(within(liste).getByText(/Reste 2 000/)).toBeTruthy();
  });

  it('signale un TJM absent au lieu d’en supposer un', async () => {
    semer({ missions: [mission({ tjm: euros(0) })] });
    render(<Activite />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('tab', { name: 'Missions' }));
    expect(screen.getByText('TJM non renseigné')).toBeTruthy();
  });
});

describe('délais de paiement', () => {
  it('affiche le délai médian et l’encours par client', async () => {
    semer({
      recettes: [
        recette({ id: 'r1', emiseLe: dateISO('2026-01-01'), encaisseeLe: dateISO('2026-02-01') }),
        recette({ id: 'r2', emiseLe: dateISO('2026-03-01'), encaisseeLe: dateISO('2026-04-01') }),
        recette({ id: 'r3', montant: euros(5000), emiseLe: dateISO('2026-04-01'), encaisseeLe: null })
      ]
    });
    render(<Activite />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('tab', { name: 'Clients' }));

    expect(screen.getByText('31 j en médiane')).toBeTruthy();
    expect(screen.getByText('5 000 €')).toBeTruthy();
    expect(screen.getByText(/au-delà de son délai habituel/)).toBeTruthy();
  });

  // Accuser un client sans référence serait pire que se taire.
  it('ne mesure rien quand aucune facture n’a été réglée', async () => {
    semer({ recettes: [recette({ encaisseeLe: null })] });
    render(<Activite />);
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('tab', { name: 'Clients' }));

    expect(screen.getByText('Délai non mesurable')).toBeTruthy();
    expect(screen.queryByText(/au-delà de son délai habituel/)).toBeNull();
  });
});
