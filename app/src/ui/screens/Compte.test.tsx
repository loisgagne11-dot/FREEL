/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VERSION_SCHEMA, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { CLE_CONFIG } from '../../infra/supabase';
import { Compte } from './Compte';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

beforeEach(() => {
  vi.unstubAllGlobals();
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

function stockage(initial: Record<string, string> = {}) {
  const contenu = { ...initial };
  return {
    contenu,
    getItem: (c: string) => (c in contenu ? contenu[c] as string : null),
    setItem: (c: string, v: string) => { contenu[c] = v; },
    removeItem: (c: string) => { delete contenu[c]; }
  };
}

const CONFIGURE = () => stockage({
  [CLE_CONFIG]: JSON.stringify({ url: 'https://exemple.test', cleAnon: 'cle' })
});

/**
 * Enchaîne des réponses HTTP, dans l'ordre des appels.
 *
 * La dernière vaut pour tous les appels suivants : un test qui décrit trois
 * échanges n'a pas à énumérer ceux que l'écran fait pour se rafraîchir.
 */
function reponses(...corps: { corps: unknown; statut?: number }[]) {
  const appel = vi.fn();
  corps.forEach((c) => {
    appel.mockResolvedValueOnce({
      ok: (c.statut ?? 200) < 300,
      status: c.statut ?? 200,
      text: async () => JSON.stringify(c.corps)
    });
  });
  appel.mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
  vi.stubGlobal('fetch', appel);
  return appel;
}

const SESSION_OK = {
  corps: {
    access_token: 'jeton', refresh_token: 'refresh', expires_in: 3600,
    user: { id: 'user-1', email: 'demo@exemple.test' }
  }
};

/** Le compte ne contient encore rien pour cette version. */
const COMPTE_VIDE = { corps: [] };

/** Une ligne de la table de cette version. */
const ligneDistante = (version: number, faits: unknown = { version: VERSION_SCHEMA }) => ({
  corps: [{ version, schema: VERSION_SCHEMA, faits, maj_le: '2026-08-10T08:00:00Z' }]
});

const BUNDLE_LEGACY = {
  corps: [{
    updated_at: '2026-08-01T10:00:00Z',
    company: { nom: 'Démo', typeActivite: 'BNC' },
    missions: [{
      id: 'M1', client: 'ClientA', description: 'Mission', tjm: 400,
      factures: [{ id: 'F1', numero: '2026-001', ht: 4000, dateEnvoi: '2026-06-30' }]
    }],
    clients: [{ id: 'C1', nom: 'ClientA' }],
    treasury: { soldeInitial: 5000 },
    ir_config: {}
  }]
};

async function seConnecter() {
  const utilisateur = userEvent.setup();
  await utilisateur.type(screen.getByLabelText(/Adresse électronique/), 'demo@exemple.test');
  await utilisateur.type(screen.getByLabelText(/Mot de passe/), 'motdepasse');
  await utilisateur.click(screen.getByRole('button', { name: 'Se connecter' }));
  return utilisateur;
}

/**
 * Les appels qui modifient des DONNÉES côté serveur.
 *
 * Les échanges d'authentification (`/auth/v1/...`) sont des POST eux aussi,
 * mais ils n'écrivent aucune donnée du compte : les compter fausserait chaque
 * assertion sur ce qui a été enregistré.
 */
function ecritures(appel: ReturnType<typeof vi.fn>) {
  return (appel.mock.calls as [string, RequestInit | undefined][])
    .map(([url, o]) => ({ url, methode: String(o?.method ?? 'GET').toUpperCase() }))
    .filter((a) => a.methode !== 'GET' && !a.url.includes('/auth/v1/'));
}

describe('configuration du compte', () => {
  // L'adresse d'un projet désigne le compte de quelqu'un : elle n'a rien à
  // faire dans le dépôt, elle se saisit.
  it('demande l’adresse du projet quand rien n’est configuré', () => {
    render(<Compte stockage={stockage()} />);
    // Ciblé par rôle : le nom accessible de la section englobante reprend le
    // texte de son explication, qui parle elle aussi de l'URL du projet.
    expect(screen.getByRole('textbox', { name: /URL du projet/ })).toBeTruthy();
    expect(screen.queryByLabelText(/Mot de passe/)).toBeNull();
  });

  it('conserve la configuration saisie et passe à la connexion', async () => {
    const local = stockage();
    render(<Compte stockage={local} />);
    const utilisateur = userEvent.setup();

    await utilisateur.type(
      screen.getByRole('textbox', { name: /URL du projet/ }), 'https://exemple.supabase.co'
    );
    await utilisateur.type(screen.getByRole('textbox', { name: /Clé publique/ }), 'cle-anon');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(local.contenu[CLE_CONFIG]).toContain('exemple.supabase.co');
    expect(screen.getByLabelText(/Mot de passe/)).toBeTruthy();
  });
});

describe('connexion', () => {
  it('affiche l’adresse connectée après authentification', async () => {
    reponses(SESSION_OK, COMPTE_VIDE);
    render(<Compte stockage={CONFIGURE()} />);
    await seConnecter();
    expect(await screen.findByText('demo@exemple.test')).toBeTruthy();
  });

  it('dit ce qui ne va pas plutôt que « une erreur est survenue »', async () => {
    reponses({ corps: { error_description: 'Invalid login credentials' }, statut: 400 });
    render(<Compte stockage={CONFIGURE()} />);
    await seConnecter();
    expect((await screen.findByRole('alert')).textContent).toMatch(/mot de passe incorrect/i);
  });

  // Sans reprise de session, il faudrait se reconnecter à chaque ouverture.
  it('reprend une session encore valable au chargement', async () => {
    reponses(COMPTE_VIDE);
    const local = CONFIGURE();
    local.contenu['freel.session.supabase.v1'] = JSON.stringify({
      jeton: 'j', jetonRafraichissement: 'r', expireLe: Date.now() + 3_600_000,
      utilisateurId: 'user-1', email: 'repris@exemple.test'
    });
    render(<Compte stockage={local} />);

    expect(await screen.findByText('repris@exemple.test')).toBeTruthy();
    // La reprise va aussi lire l'état du compte : on attend que ce second
    // rendu ait eu lieu, sinon il surviendrait hors du test et le rendrait
    // instable pour celui qui suit.
    expect(await screen.findByRole('button', { name: 'Envoyer sur le compte' })).toBeTruthy();
  });
});

describe('envoi sur le compte', () => {
  it('enregistre les faits de l’appareil sur un compte encore vide', async () => {
    const appel = reponses(SESSION_OK, COMPTE_VIDE, ligneDistante(1));
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(await screen.findByRole('button', { name: 'Envoyer sur le compte' }));

    expect((await screen.findByRole('status')).textContent).toMatch(/enregistrées sur le compte/i);
    const envoi = ecritures(appel).at(-1);
    expect(envoi?.methode).toBe('POST');
    expect(envoi?.url).toContain('freel_faits');
  });

  // Le verrou : l'envoi porte la version lue, et c'est le serveur qui vérifie.
  it('conditionne l’envoi à la version lue', async () => {
    const appel = reponses(SESSION_OK, ligneDistante(3), ligneDistante(4));
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(await screen.findByRole('button', { name: 'Envoyer sur le compte' }));

    const envoi = ecritures(appel).at(-1);
    expect(envoi?.methode).toBe('PATCH');
    expect(envoi?.url).toContain('version=eq.3');
  });

  /**
   * Tant qu'on ignore ce que contient le compte, on n'écrit pas dessus.
   * Envoyer « au cas où » recouvrirait des données sans que rien ne l'annonce.
   */
  it('interdit l’envoi tant que l’état du compte est inconnu', async () => {
    reponses(SESSION_OK, { corps: { message: 'boom' }, statut: 500 });
    render(<Compte stockage={CONFIGURE()} />);
    await seConnecter();

    const bouton = await screen.findByRole('button', { name: 'Envoyer sur le compte' });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/L’envoi reste indisponible/)).toBeTruthy();
  });
});

describe('conflit d’écriture', () => {
  /**
   * Zéro ligne modifiée : le compte a bougé. L'écran doit s'arrêter et
   * montrer les deux côtés, pas réessayer — réessayer écraserait justement ce
   * qu'il fallait préserver.
   */
  it('s’arrête et montre les deux états quand le compte a bougé', async () => {
    reponses(
      SESSION_OK,
      ligneDistante(3),
      { corps: [] },                                              // le PATCH ne touche rien
      ligneDistante(9, { version: VERSION_SCHEMA, recettes: [{ id: 'r1' }, { id: 'r2' }] })
    );
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(await screen.findByRole('button', { name: 'Envoyer sur le compte' }));

    expect(await screen.findByText(/Rien n’a été enregistré/)).toBeTruthy();
    expect(screen.getByText('Le compte').nextSibling?.textContent).toMatch(/2 recette/);
    expect(screen.getByRole('button', { name: /Écraser le compte/ })).toBeTruthy();
  });

  it('laisse abandonner l’envoi sans rien modifier', async () => {
    const appel = reponses(SESSION_OK, ligneDistante(3), { corps: [] }, ligneDistante(9));
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(await screen.findByRole('button', { name: 'Envoyer sur le compte' }));
    const avant = ecritures(appel).length;
    await utilisateur.click(await screen.findByRole('button', { name: 'Abandonner l’envoi' }));

    expect((await screen.findByRole('status')).textContent).toMatch(/Rien n’a été modifié/);
    expect(ecritures(appel)).toHaveLength(avant);
  });

  // Le choix d'écraser existe, mais il est explicite et porte la version
  // relue : un « réessayer » qui ignore la version serait le bug d'origine.
  it('réenvoie sur la version relue quand l’utilisateur choisit d’écraser', async () => {
    const appel = reponses(
      SESSION_OK, ligneDistante(3), { corps: [] }, ligneDistante(9), ligneDistante(10)
    );
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(await screen.findByRole('button', { name: 'Envoyer sur le compte' }));
    await utilisateur.click(await screen.findByRole('button', { name: /Écraser le compte/ }));

    expect(ecritures(appel).at(-1)?.url).toContain('version=eq.9');
  });
});

describe('récupération depuis le compte', () => {
  it('montre ce qui serait chargé avant de remplacer quoi que ce soit', async () => {
    const faits = {
      version: VERSION_SCHEMA,
      recettes: [{ id: 'r1' }, { id: 'r2' }],
      clients: [{ id: 'c1' }]
    };
    reponses(SESSION_OK, ligneDistante(3, faits), ligneDistante(3, faits));
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(
      await screen.findByRole('button', { name: 'Récupérer depuis le compte' })
    );

    expect(await screen.findByText(/remplaceront/)).toBeTruthy();
    expect(screen.getByText('Recettes').nextSibling?.textContent).toBe('2');
    // Rien n'a bougé tant que rien n'est confirmé.
    expect(useFaits.getState().faits.recettes).toHaveLength(0);
  });

  it('remplace les faits à la confirmation', async () => {
    const faits = {
      version: VERSION_SCHEMA,
      recettes: [{ id: 'r1', montant: 4000 }],
      entreprise: { nom: 'Entreprise de démo' },
      soldeInitial: 5000
    };
    reponses(SESSION_OK, ligneDistante(3, faits), ligneDistante(3, faits));
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(
      await screen.findByRole('button', { name: 'Récupérer depuis le compte' })
    );
    await utilisateur.click(
      await screen.findByRole('button', { name: /Remplacer les données de cet appareil/ })
    );

    const etat = useFaits.getState().faits;
    expect(etat.recettes).toHaveLength(1);
    expect(etat.entreprise.nom).toBe('Entreprise de démo');
    expect(etat.soldeInitial).toBe(5000);
    // Les champs absents du bloc distant sont comblés, pas laissés indéfinis.
    expect(etat.mouvementsBancaires).toEqual([]);
  });

  /**
   * Une version ancienne qui charge un bloc récent en ignorerait les champs
   * inconnus, puis les effacerait au premier renvoi. Elle refuse.
   */
  it('refuse un bloc écrit par une version plus récente', async () => {
    const futur = { version: VERSION_SCHEMA + 1, recettes: [] };
    reponses(SESSION_OK, ligneDistante(3, futur), ligneDistante(3, futur));
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(
      await screen.findByRole('button', { name: 'Récupérer depuis le compte' })
    );

    expect((await screen.findByRole('alert')).textContent).toMatch(/plus récente/i);
    expect(screen.queryByText(/remplaceront/)).toBeNull();
  });

  // Un compte neuf n'est pas une erreur.
  it('dit qu’un compte est vide sans crier à l’erreur', async () => {
    reponses(SESSION_OK, COMPTE_VIDE, COMPTE_VIDE);
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(
      await screen.findByRole('button', { name: 'Récupérer depuis le compte' })
    );
    expect((await screen.findByRole('status')).textContent).toMatch(/aucune donnée/i);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('cohabitation avec l’ancienne application', () => {
  it('reprend les données de l’ancienne application sur demande', async () => {
    reponses(SESSION_OK, COMPTE_VIDE, BUNDLE_LEGACY);
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(
      await screen.findByRole('button', { name: /Reprendre l’ancienne application/ })
    );
    await utilisateur.click(
      await screen.findByRole('button', { name: /Remplacer les données de cet appareil/ })
    );

    const faits = useFaits.getState().faits;
    expect(faits.entreprise.nom).toBe('Démo');
    expect(faits.recettes).toHaveLength(1);
    expect(faits.soldeInitial).toBe(5000);
  });

  /**
   * L'invariant de la cohabitation. L'écran écrit désormais — mais jamais
   * dans `user_data`, sinon un essai de cette version pourrait abîmer les
   * données dont l'ancienne se sert encore.
   */
  it('n’écrit jamais dans la table de l’ancienne application', async () => {
    const appel = reponses(
      SESSION_OK, COMPTE_VIDE, BUNDLE_LEGACY, ligneDistante(1)
    );
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(
      await screen.findByRole('button', { name: /Reprendre l’ancienne application/ })
    );
    await utilisateur.click(
      await screen.findByRole('button', { name: /Remplacer les données de cet appareil/ })
    );
    await utilisateur.click(await screen.findByRole('button', { name: 'Envoyer sur le compte' }));

    const versLegacy = ecritures(appel).filter((e) => e.url.includes('user_data'));
    expect(versLegacy).toEqual([]);
  });
});
