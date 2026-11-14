/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VERSION_SCHEMA, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import type { InstantaneDistant, Session } from '../../infra/supabase';
import { sqlMemoireDuCompte } from '../../infra/supabase.memoire';
import { EtatsPrecedents } from './Compte.historique';

const CONFIG = { url: 'https://exemple.test', cleAnon: 'cle' };
const SESSION: Session = {
  jeton: 'jeton', jetonRafraichissement: 'r', expireLe: Date.now() + 3_600_000,
  utilisateurId: 'user-1', email: 'demo@exemple.test'
};
const DISTANT: InstantaneDistant = { faits: {}, version: 9, schema: VERSION_SCHEMA, majLe: null };
const ETAT = { id: 7, version: 8, schema: VERSION_SCHEMA, maj_le: null, remplace_le: '2026-11-12T09:30:00Z' };
const ANCIENS_FAITS = { ...faitsVides(), soldeInitial: 1234 };

function serveur(...reponses: { corps: unknown; statut?: number }[]) {
  const appel = vi.fn();
  for (const r of reponses) {
    appel.mockResolvedValueOnce({
      ok: (r.statut ?? 200) < 300, status: r.statut ?? 200, text: async () => JSON.stringify(r.corps)
    });
  }
  appel.mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
  vi.stubGlobal('fetch', appel);
  return appel;
}

const ecritures = (appel: ReturnType<typeof vi.fn>) =>
  (appel.mock.calls as [string, RequestInit | undefined][])
    .filter(([, o]) => (o?.method ?? 'GET') !== 'GET')
    .map(([url, o]) => ({ url, methode: o?.method, corps: JSON.parse(String(o?.body ?? 'null')) as unknown }));

function monter(distant: InstantaneDistant | null | 'inconnu' = DISTANT) {
  const onCompteModifie = vi.fn();
  render(<EtatsPrecedents config={CONFIG} session={SESSION} distant={distant}
    desactive={false} onCompteModifie={onCompteModifie} />);
  return onCompteModifie;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('états précédents du compte', () => {
  /** La limite se dit avant tout geste : ceci ne protège pas d'une session volée. */
  it('dit ce qu’ils protègent, et ce qu’ils ne protègent pas', () => {
    serveur();
    monter();
    expect(screen.getByText(/écrasement par/).closest('p')?.textContent)
      .toMatch(/Pas d’une session volée.*tes appareils qui gardent leur copie/s);
  });

  it('se lisent à la demande, datés par le serveur', async () => {
    const appel = serveur({ corps: [ETAT] });
    monter();
    expect(appel).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voir les états précédents' }));
    const liste = await screen.findByRole('list', { name: 'États précédents du compte' });
    expect(liste.textContent).toMatch(/Remplacé le 12 nov\. 2026.*enregistrement n°\s8/s);
  });

  it('le SQL non exécuté se constate, et se copie', async () => {
    serveur({ corps: { message: 'absente' }, statut: 404 });
    monter();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voir les états précédents' }));
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/ne garde pas encore les états précédents/);
    expect(alerte.textContent).toContain(sqlMemoireDuCompte());
  });

  /**
   * Le compte D'ABORD, avec la version lue : un compte qui a bougé refuse
   * l'écriture, et rien n'a bougé nulle part. Puis l'appareil, copie gardée.
   */
  it('« Revenir à cet état » écrit le compte à la version suivante, puis remplace l’appareil', async () => {
    const appel = serveur(
      { corps: [ETAT] },
      { corps: [{ version: 8, schema: VERSION_SCHEMA, faits: ANCIENS_FAITS, maj_le: null }] },
      { corps: [{ version: 10, schema: VERSION_SCHEMA, faits: ANCIENS_FAITS, maj_le: null }] }
    );
    const onCompteModifie = monter();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Voir les états précédents' }));
    await u.click(await screen.findByRole('button', { name: 'Revenir à cet état' }));
    expect(ecritures(appel)).toEqual([]);
    await u.click(screen.getAllByRole('button', { name: 'Revenir à cet état' }).at(-1) as HTMLElement);

    await screen.findByText(/Le compte et cet appareil sont revenus à l’état remplacé le 12 nov\. 2026/);
    const [ecrite] = ecritures(appel);
    expect(ecrite?.methode).toBe('PATCH');
    expect(ecrite?.url).toContain('freel_faits?user_id=eq.user-1&version=eq.9');
    expect(ecrite?.corps).toMatchObject({ version: 10, faits: { soldeInitial: 1234 } });
    expect(onCompteModifie).toHaveBeenCalledWith(expect.objectContaining({ version: 10 }));
    expect(useFaits.getState().faits.soldeInitial).toBe(1234);
  });

  it('un compte qui a bougé entre-temps refuse, et cet appareil ne change pas', async () => {
    serveur(
      { corps: [ETAT] },
      { corps: [{ version: 8, schema: VERSION_SCHEMA, faits: ANCIENS_FAITS, maj_le: null }] },
      { corps: [] },
      { corps: [{ version: 11, schema: VERSION_SCHEMA, faits: {}, maj_le: null }] }
    );
    const onCompteModifie = monter();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Voir les états précédents' }));
    await u.click(await screen.findByRole('button', { name: 'Revenir à cet état' }));
    await u.click(screen.getAllByRole('button', { name: 'Revenir à cet état' }).at(-1) as HTMLElement);

    expect((await screen.findByRole('alert')).textContent).toMatch(/Le compte a changé entre-temps.*Rien n’a été modifié/s);
    expect(useFaits.getState().faits.soldeInitial).not.toBe(1234);
    expect(onCompteModifie).toHaveBeenCalledWith(expect.objectContaining({ version: 11 }));
  });

  /** Le charger effacerait au premier renvoi ce que ce code ne sait pas lire. */
  it('un état écrit par une version plus récente ne se propose pas', async () => {
    serveur({ corps: [{ ...ETAT, schema: VERSION_SCHEMA + 1 }] });
    monter();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voir les états précédents' }));
    expect(await screen.findByText(/Écrit par une version plus récente/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revenir à cet état' })).toBeNull();
  });

  it('sans savoir où en est le compte, le retour est impossible', async () => {
    serveur({ corps: [ETAT] });
    monter('inconnu');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voir les états précédents' }));
    expect((await screen.findByRole('button', { name: 'Revenir à cet état' })).hasAttribute('disabled')).toBe(true);
  });
});
