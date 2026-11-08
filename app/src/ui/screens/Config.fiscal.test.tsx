/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, mois } from '../../domain/types';
import { tauxCotisations, tauxVersementLiberatoire } from '../../domain/bareme';
import { faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { FournisseurToasts } from '../components/Toasts';
import { pct } from '../format';
import { Config } from './Config';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-15T09:00:00Z'));
  useFaits.setState({ faits: faitsVides(), chargement: { phase: 'initial' } });
  window.location.hash = '';
});

async function ouvrirFiscal() {
  window.location.hash = '#/config/fiscal';
  render(<FournisseurToasts><Config /></FournisseurToasts>);
  await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());
  return screen.findByRole('region', { name: /Barèmes 2026 en vigueur/ });
}

/** La valeur affichée et l'aide d'une ligne de la grille, par son libellé. */
function ligne(carte: HTMLElement, libelle: string) {
  const dt = within(carte).getByText(libelle);
  const bloc = dt.parentElement as HTMLElement;
  const dd = bloc.querySelectorAll('dd');
  return { valeur: dd[0]?.textContent ?? '', aide: dd[1]?.textContent ?? '' };
}

describe('carte des barèmes en vigueur', () => {
  // Sans elle, l'utilisateur ne voit pas les taux que l'application applique.
  it('affiche les six valeurs, dont le versement libératoire tel que le barème le publie', async () => {
    const carte = await ouvrirFiscal();
    for (const l of [
      'Abattement forfaitaire', 'Taux de cotisations', 'Versement libératoire',
      'Formation professionnelle (CFP)', 'Plafond micro', 'Seuil de franchise de TVA'
    ]) expect(within(carte).getByText(l)).toBeTruthy();

    const vl = tauxVersementLiberatoire(mois('2026-09'), 'BNC');
    if (vl.statut === 'refuse') throw new Error('barème VL attendu');
    expect(ligne(carte, 'Versement libératoire').valeur).toBe(pct(vl.valeur));
  });

  // Afficher le taux plein à quelqu'un d'exonéré lui ferait provisionner trop.
  it('montre le taux réduit et rappelle le taux plein quand l’ACRE couvre le mois courant', async () => {
    useFaits.setState((e) => ({
      faits: {
        ...e.faits,
        entreprise: { ...e.faits.entreprise, acre: true, debutActivite: dateISO('2026-03-01') }
      }
    }));
    const carte = await ouvrirFiscal();
    const plein = tauxCotisations(mois('2026-09'), 'BNC', false);
    const reduit = tauxCotisations(
      mois('2026-09'), 'BNC', true, undefined, dateISO('2026-03-01')
    );
    if (plein.statut === 'refuse' || reduit.statut === 'refuse') throw new Error('barème attendu');
    expect(reduit.valeur).toBeLessThan(plein.valeur);
    const { valeur, aide } = ligne(carte, 'Taux de cotisations');
    expect(valeur).toBe(pct(reduit.valeur));
    expect(aide).toContain(`Taux plein ${pct(plein.valeur)}`);
  });

  it('affiche le taux plein sans ACRE', async () => {
    const carte = await ouvrirFiscal();
    const plein = tauxCotisations(mois('2026-09'), 'BNC', false);
    if (plein.statut === 'refuse') throw new Error('barème attendu');
    const { valeur, aide } = ligne(carte, 'Taux de cotisations');
    expect(valeur).toBe(pct(plein.valeur));
    expect(aide).toBe('Taux plein, hors ACRE');
  });
});

describe('périodicité', () => {
  // Même valeur stockée que l'ancienne liste : l'échéancier en dépend.
  it('change la périodicité stockée au clic', async () => {
    await ouvrirFiscal();
    const utilisateur = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await utilisateur.click(screen.getByRole('radio', { name: 'Trimestrielle' }));
    expect(useFaits.getState().faits.entreprise.urssafPeriodicite).toBe('trimestriel');
    expect(screen.getByRole('radio', { name: 'Trimestrielle' }).getAttribute('aria-checked')).toBe('true');
    await utilisateur.click(screen.getByRole('radio', { name: 'Mensuelle' }));
    expect(useFaits.getState().faits.entreprise.urssafPeriodicite).toBe('mensuel');
  });
});
