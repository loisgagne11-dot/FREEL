/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VERSION_SCHEMA, faitsVides, type Faits } from '../../state/schema';
import { useFaits } from '../../state/store';
import { CLE_CONFIG, CLE_SESSION } from '../../infra/supabase';
import { lireBase, noterSynchronisation } from '../../infra/synchro.appareil';
import { type EtatSynchroAppareil, publierEtatSynchro } from '../../infra/synchro.etat';
import type { MoteurSynchro } from '../../infra/synchro.moteur';
import type { VerificationProjet } from '../../infra/supabase.verification';
import { Compte } from './Compte';

/*
 * Réglages › Compte, quand l'appareil se synchronise tout seul (lot 42) :
 * l'entrée dans la synchronisation automatique, la phrase « Dernière
 * synchronisation », et la carte « À choisir ».
 */
const CONFIG = { url: 'https://projet-demo.supabase.co', cleAnon: 'eyJ.factice.anon' };

const SANTE: VerificationProjet = {
  reglages: { statut: 'ok', valeur: { inscriptionsFermees: true, confirmationAutomatique: false } },
  acces: {
    faits: { statut: 'protegee' }, historique: { statut: 'protegee' }, legacy: { statut: 'absente' },
    le: '2026-11-22T08:40:00.000Z'
  },
  cleDeService: false,
  le: '2026-11-22T08:40:00.000Z'
};

const AVEC_DONNEES: Faits = {
  ...faitsVides(),
  entreprise: { ...faitsVides().entreprise, nom: 'Atelier Exemple' },
  clients: [{ id: 'c1', nom: 'Client exemple' }] as never
};
const AILLEURS: Faits = { ...AVEC_DONNEES, clients: [{ id: 'c2', nom: 'Client saisi ailleurs' }] as never };

function relie() {
  const contenu: Record<string, string> = {
    [CLE_CONFIG]: JSON.stringify(CONFIG),
    [CLE_SESSION]: JSON.stringify({
      jeton: 'j', jetonRafraichissement: 'r', expireLe: Date.now() + 3_600_000,
      utilisateurId: 'user-1', email: 'demo@exemple.test'
    })
  };
  return {
    contenu,
    getItem: (c: string) => contenu[c] ?? null,
    setItem: (c: string, v: string) => { contenu[c] = v; },
    removeItem: (c: string) => { delete contenu[c]; }
  };
}

function reponses(...corps: unknown[]) {
  const appel = vi.fn();
  for (const c of corps) appel.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(c) });
  appel.mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
  vi.stubGlobal('fetch', appel);
  return appel;
}

const ligne = (faits: unknown, version = 3) =>
  [{ version, schema: VERSION_SCHEMA, faits: JSON.parse(JSON.stringify(faits)), maj_le: aujourdhui(9, 41).toISOString() }];

function aujourdhui(h: number, m: number): Date {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function fauxMoteur(apres: EtatSynchroAppareil = { phase: 'a-jour', le: new Date().toISOString() }) {
  return {
    demarrer: vi.fn(), arreter: vi.fn(), partir: vi.fn(), surChangement: vi.fn(),
    synchroniser: vi.fn(async () => apres),
    trancher: vi.fn(async () => apres)
  } satisfies MoteurSynchro;
}

const ecritures = (appel: ReturnType<typeof vi.fn>) =>
  (appel.mock.calls as [string, RequestInit | undefined][])
    .filter(([url, o]) => String(o?.method ?? 'GET') !== 'GET' && !String(url).includes('/auth/v1/'));

beforeEach(() => {
  window.sessionStorage.clear();
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: AVEC_DONNEES });
  publierEtatSynchro({ phase: 'inactif' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('entrer dans la synchronisation automatique', () => {
  /**
   * UN APPAREIL DÉJÀ RELIÉ AVANT LE LOT 42 ENTRE EN OUVRANT L'ÉCRAN. Les deux
   * côtés portent la même chose : c'est une synchronisation, qu'il retient —
   * sans rien envoyer ni recevoir. Sans cela, le propriétaire, dont les deux
   * appareils sont déjà d'accord, n'aurait aucun moyen d'en profiter.
   */
  it('des deux côtés identiques, l’appareil retient la synchronisation, sans rien écrire', async () => {
    const appel = reponses(ligne(AVEC_DONNEES));
    const local = relie();
    const moteur = fauxMoteur();
    render(<Compte stockage={local} verifier={async () => SANTE} moteur={moteur} />);
    await screen.findByText('à jour');
    expect(lireBase(local, 'user-1')?.version).toBe(3);
    expect(moteur.demarrer).toHaveBeenCalled();
    expect(ecritures(appel)).toEqual([]);
  });

  /**
   * LA PREMIÈRE LIAISON RESTE À L'UTILISATEUR. Les deux côtés diffèrent : rien
   * ne dit lequel garder, l'appareil ne retient rien et l'écran fait choisir
   * le sens, comme avant. Retenir ici ferait « prendre » ou « envoyer » tout
   * seul à la prochaine ouverture.
   */
  it('deux côtés différents ne font rien retenir : le sens reste à choisir à la main', async () => {
    reponses(ligne(AILLEURS));
    const local = relie();
    render(<Compte stockage={local} verifier={async () => SANTE} moteur={fauxMoteur()} />);
    expect(await screen.findByText('diffère')).toBeTruthy();
    expect(lireBase(local, 'user-1')).toBeNull();
  });

  // Un envoi réussi à la main est une synchronisation : la suite se fera seule.
  it('un envoi fait à la main fait entrer l’appareil dans la synchronisation', async () => {
    reponses([], [], ligne(AVEC_DONNEES, 1));
    const local = relie();
    render(<Compte stockage={local} verifier={async () => SANTE} moteur={fauxMoteur()} />);
    await screen.findByText('à envoyer');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Synchroniser maintenant' }));
    await screen.findByText(/enregistrées sur le compte/);
    expect(lireBase(local, 'user-1')?.version).toBe(1);
  });
});

describe('synchronisé', () => {
  function synchronise() {
    const local = relie();
    noterSynchronisation(local, 'user-1', 3, AVEC_DONNEES, aujourdhui(9, 41));
    return local;
  }

  // La même règle que l'automatique : une seconde règle, à la main, finirait
  // par dire autre chose que la pastille.
  it('« Synchroniser maintenant » passe par le moteur, et dit ce qu’il a constaté', async () => {
    reponses(ligne(AVEC_DONNEES), ligne(AVEC_DONNEES));
    const moteur = fauxMoteur();
    render(<Compte stockage={synchronise()} verifier={async () => SANTE} moteur={moteur} />);
    await screen.findByText('à jour');
    // L'écran relit le moteur à l'ouverture ; le clic en demande un second
    // passage — qui, ici, trouve le réseau coupé. Une règle à part, à la main,
    // aurait dit « à jour » sur la seule foi de sa propre lecture.
    expect(moteur.synchroniser).toHaveBeenCalledTimes(1);
    moteur.synchroniser.mockResolvedValueOnce({ phase: 'hors-ligne', aEnvoyer: true });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Synchroniser maintenant' }));
    expect(moteur.synchroniser).toHaveBeenCalledTimes(2);
    expect(moteur.synchroniser).toHaveBeenLastCalledWith('manuel');
    expect((await screen.findByRole('status')).textContent).toMatch(/^Hors ligne : rien n’a pu partir/);
  });

  it('la carte dit « hors ligne » et ce qui attend, sans rien perdre', async () => {
    reponses(ligne(AVEC_DONNEES));
    render(<Compte stockage={synchronise()} verifier={async () => SANTE} moteur={fauxMoteur()} />);
    await screen.findByText('à jour');
    act(() => { publierEtatSynchro({ phase: 'hors-ligne', aEnvoyer: true }); });
    expect(screen.getByText('hors ligne')).toBeTruthy();
    expect(screen.getByText(/partiront au retour du réseau/)).toBeTruthy();
  });

  describe('à choisir', () => {
    const conflit = (): EtatSynchroAppareil => ({
      phase: 'a-choisir', pourquoi: 'les-deux-ont-change', modifieLe: aujourdhui(9, 30).toISOString(),
      local: 'donnees',
      distant: { version: 4, schema: VERSION_SCHEMA, faits: JSON.parse(JSON.stringify(AILLEURS)), majLe: aujourdhui(9, 41).toISOString() }
    });

    async function monterEnConflit(moteur = fauxMoteur()) {
      reponses(ligne(AILLEURS, 4), ligne(AILLEURS, 4));
      publierEtatSynchro(conflit());
      render(<Compte stockage={synchronise()} verifier={async () => SANTE} moteur={moteur} />);
      const carte = (await screen.findByRole('heading', { name: 'À choisir' })).closest('section') as HTMLElement;
      return { carte, moteur };
    }

    /**
     * LES DATES DES DEUX CÔTÉS, AVANT TOUT BOUTON. Elles disent QUAND chacun a
     * changé — pas qui a raison : c'est à la personne de trancher.
     */
    it('dit quand chaque côté a changé, et ce que chacun porte', async () => {
      const { carte } = await monterEnConflit();
      expect(carte.textContent).toMatch(/Cet appareil a été modifié à 9\u00a0h\u00a030, le compte à 9\u00a0h\u00a041 depuis un autre appareil/);
      expect(within(carte).getByRole('button', { name: 'Garder ce que j’ai ici' })).toBeTruthy();
      expect(within(carte).getByRole('button', { name: 'Prendre celui du compte' })).toBeTruthy();
      expect(screen.getByText('à choisir')).toBeTruthy();
    });

    /**
     * D'ABORD TÉLÉCHARGER CE QU'ON ÉCARTE. « Garder ici » écarte le COMPTE :
     * c'est lui que le fichier doit contenir — l'inverse donnerait une copie
     * de ce qu'on garde, et rien de ce qu'on perd.
     */
    it('« garder ici » propose de télécharger la version du compte, puis tranche', async () => {
      const blobs: Blob[] = [];
      vi.stubGlobal('URL', Object.assign(URL, {
        createObjectURL: vi.fn((b: Blob) => { blobs.push(b); return 'blob:essai'; }),
        revokeObjectURL: vi.fn()
      }));
      const { carte, moteur } = await monterEnConflit();
      const utilisateur = userEvent.setup();
      await utilisateur.click(within(carte).getByRole('button', { name: 'Garder ce que j’ai ici' }));
      const groupe = within(carte).getByRole('group', { name: 'Garder ce que j’ai ici' });
      expect(groupe.textContent).toMatch(/états précédents/);
      expect(moteur.trancher).not.toHaveBeenCalled();

      await utilisateur.click(within(groupe).getByRole('button', { name: 'Télécharger la version que tu écartes' }));
      expect(await blobs[0]?.text()).toContain('Client saisi ailleurs');

      await utilisateur.click(within(groupe).getByRole('button', { name: 'Garder ce que j’ai ici' }));
      expect(moteur.trancher).toHaveBeenCalledWith('garder-ici', 4);
    });

    it('« prendre le compte » propose de télécharger ce qu’il y a ici', async () => {
      const blobs: Blob[] = [];
      vi.stubGlobal('URL', Object.assign(URL, {
        createObjectURL: vi.fn((b: Blob) => { blobs.push(b); return 'blob:essai'; }),
        revokeObjectURL: vi.fn()
      }));
      const { carte, moteur } = await monterEnConflit();
      const utilisateur = userEvent.setup();
      await utilisateur.click(within(carte).getByRole('button', { name: 'Prendre celui du compte' }));
      const groupe = within(carte).getByRole('group', { name: 'Prendre celui du compte' });
      expect(groupe.textContent).toMatch(/Revenir à l’état d’avant/);
      await utilisateur.click(within(groupe).getByRole('button', { name: 'Télécharger la version que tu écartes' }));
      const texte = await blobs[0]?.text();
      expect(texte).toContain('Client exemple');
      expect(texte).not.toContain('Client saisi ailleurs');

      await utilisateur.click(within(groupe).getByRole('button', { name: 'Prendre celui du compte' }));
      expect(moteur.trancher).toHaveBeenCalledWith('prendre-compte', 4);
    });

    // Changer d'avis ne coûte rien : rien n'est parti.
    it('« Revenir » referme la question sans rien trancher', async () => {
      const { carte, moteur } = await monterEnConflit();
      const utilisateur = userEvent.setup();
      await utilisateur.click(within(carte).getByRole('button', { name: 'Garder ce que j’ai ici' }));
      await utilisateur.click(within(carte).getByRole('button', { name: 'Revenir' }));
      expect(within(carte).queryByRole('group')).toBeNull();
      expect(moteur.trancher).not.toHaveBeenCalled();
    });
  });

  /**
   * EFFACÉ D'ICI, LA BASE NE DÉSIGNE PLUS RIEN. Gardée, elle ferait dire à
   * cet appareil même « effacé ailleurs » ; les autres appareils, eux, le
   * diront — et ne renverront rien tout seuls.
   */
  it('effacer la copie du compte oublie la synchronisation de cet appareil', async () => {
    reponses(ligne(AVEC_DONNEES), [{ user_id: 'user-1' }], [], [], [], []);
    const local = synchronise();
    render(<Compte stockage={local} verifier={async () => SANTE} moteur={fauxMoteur()} />);
    await screen.findByText('à jour');
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: 'Effacer la copie de cette version' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Effacer du compte' }));
    await screen.findByText(/Relu après coup/);
    expect(lireBase(local, 'user-1')).toBeNull();
  });
});
