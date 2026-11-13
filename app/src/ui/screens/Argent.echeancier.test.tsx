/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { dateISO, euros } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { eur } from '../format';
import { FournisseurToasts } from '../components/Toasts';
import { Echeancier } from './Argent.echeancier';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
});

/**
 * L'échéancier est rendu DIRECTEMENT, et non à travers l'écran.
 *
 * Il est chargé à la demande depuis le pilier — il est sous la ligne de
 * flottaison et ne s'ouvre que pour payer ou déclarer. Passer par `<Argent />`
 * obligerait chaque test à attendre deux Suspense imbriqués pour vérifier une
 * date sur une frise.
 */
function poser(m: Partial<Faits> = {}): void {
  useFaits.setState({ faits: { ...faitsVides(), ...m } as Faits });
  render(<FournisseurToasts><Echeancier annee={2026} /></FournisseurToasts>);
}

describe('la frise de l’échéancier', () => {
  const jalon = (id: string, nature: 'urssaf' | 'cfe', montant: number, le: string) => ({
    id, nature, montant: euros(montant), montantPaye: euros(0),
    echeanceLe: dateISO(le), payeeLe: null
  });

  /**
   * LE REPÈRE « AUJ. » EST L'ÉLÉMENT UTILE, PAS UN ORNEMENT.
   *
   * Sans lui, une frise annuelle se lit pareil en février et en novembre. C'est
   * le défaut que les jauges de seuil avaient avant qu'on y pose la part de
   * l'année écoulée.
   */
  it('pose le repère du jour sur la frise', () => {
    poser({ echeances: [jalon('e1', 'urssaf', 1_980, '2026-07-05')] });

    expect(screen.getByText('auj.')).toBeTruthy();
  });

  /**
   * CHAQUE JALON PORTE SA DATE ET SON MONTANT EN TEXTE.
   *
   * La position sur l'axe est une commodité de lecture, pas le seul support de
   * l'information — sans quoi la frise serait illisible à qui n'y voit rien.
   */
  it('écrit le nom, la date et le montant de chaque jalon', () => {
    poser({ echeances: [jalon('e1', 'urssaf', 1_980, '2026-07-05')] });

    const carte = screen.getByText(/Échéancier/).closest('section');
    const dans = within(carte as HTMLElement);
    const jalonRendu = dans.getByText('5 juil').parentElement;
    expect(jalonRendu?.textContent).toContain('URSSAF');
    expect(jalonRendu?.textContent).toContain(eur(1_980));
  });

  /**
   * UNE ÉCHÉANCE RÉGLÉE RESTE SUR LA FRISE, MARQUÉE.
   *
   * Elle raconte l'année. La retirer laisserait un trou là où quelque chose
   * s'est passé, et ferait lire un premier semestre vide.
   */
  it('garde une échéance réglée, en la marquant', () => {
    poser({
      echeances: [{ ...jalon('e1', 'urssaf', 1_980, '2026-04-05'), payeeLe: dateISO('2026-04-05') }]
    });

    const carte = screen.getByText(/Échéancier/).closest('section');
    expect(within(carte as HTMLElement).getByText(/réglée/)).toBeTruthy();
  });

  /**
   * AUCUNE ÉCHÉANCE N'EST UNE INFORMATION, ET ELLE DIT LE SENS DE L'ERREUR.
   *
   * Une frise vide se lirait « rien à payer ». C'est l'inverse : tant qu'aucune
   * échéance n'est saisie, le disponible et le versable sont SURESTIMÉS.
   */
  it('dit que le disponible est surestimé quand rien n’est saisi', () => {
    poser({ soldeInitial: euros(10_000) });

    const carte = screen.getByText(/Échéancier/).closest('section');
    expect(within(carte as HTMLElement).getByText(/surestimés/)).toBeTruthy();
  });

  /** Une échéance d'une autre année n'appartient pas à cette frise. */
  it('ne pose que les échéances de l’année affichée', () => {
    poser({
      echeances: [
        jalon('e1', 'urssaf', 1_980, '2026-07-05'),
        jalon('e2', 'cfe', 148, '2027-12-15')
      ]
    });

    const carte = screen.getByText(/Échéancier/).closest('section');
    const dans = within(carte as HTMLElement);
    expect(dans.getByText('5 juil')).toBeTruthy();
    expect(dans.queryByText('15 déc')).toBeNull();
  });

  /**
   * L'automne de qui n'a pas encore son avis : le solde de l'an passé, que la
   * provision garde déjà, posé aux dates où l'administration le prélèvera.
   */
  it('place le solde estimé de l’an passé à ses dates officielles', () => {
    poser({
      recettes: [{
        id: 'r1', clientNom: 'Client démo', libelle: 'Mission', montant: euros(40_000),
        emiseLe: dateISO('2025-06-01'), encaisseeLe: dateISO('2025-06-10'),
        modeReglement: 'virement', numero: '2025-001'
      }],
      partsFiscales: 1, autresRevenusFoyer: euros(0), versementPerDeductible: euros(0)
    });

    const carte = screen.getByText(/Échéancier/).closest('section');
    const dans = within(carte as HTMLElement);
    expect(dans.getAllByText(/estimé$/)).toHaveLength(4);
    expect(dans.getByText('25 sep')).toBeTruthy();
    expect(dans.getByText('28 déc')).toBeTruthy();
  });
});
