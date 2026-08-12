/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { faitsVides } from '../../state/schema';
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

/** Enchaîne des réponses HTTP, dans l'ordre des appels. */
function reponses(...corps: { corps: unknown; statut?: number }[]) {
  const appel = vi.fn();
  corps.forEach((c) => {
    appel.mockResolvedValueOnce({
      ok: (c.statut ?? 200) < 300,
      status: c.statut ?? 200,
      text: async () => JSON.stringify(c.corps)
    });
  });
  vi.stubGlobal('fetch', appel);
  return appel;
}

const SESSION_OK = {
  corps: {
    access_token: 'jeton', refresh_token: 'refresh', expires_in: 3600,
    user: { id: 'user-1', email: 'demo@exemple.test' }
  }
};

const BUNDLE = {
  corps: [{
    updated_at: '2026-08-01T10:00:00Z',
    company: { nom: 'Démo', typeActivite: 'BNC' },
    missions: [{
      id: 'M1', client: 'ClientA', description: 'Mission', tjm: 400,
      factures: [{ id: 'F1', numero: '2026-001', montant: 4000, date: '2026-06-30' }]
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
    reponses(SESSION_OK);
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
  it('reprend une session encore valable au chargement', () => {
    const local = CONFIGURE();
    local.contenu['freel.session.supabase.v1'] = JSON.stringify({
      jeton: 'j', jetonRafraichissement: 'r', expireLe: Date.now() + 3_600_000,
      utilisateurId: 'user-1', email: 'repris@exemple.test'
    });
    render(<Compte stockage={local} />);
    expect(screen.getByText('repris@exemple.test')).toBeTruthy();
  });
});

describe('chargement des données', () => {
  // Charger en silence ferait disparaître une saisie hors ligne sans que
  // personne le voie.
  it('montre ce qui serait chargé avant de remplacer quoi que ce soit', async () => {
    reponses(SESSION_OK, BUNDLE);
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(
      await screen.findByRole('button', { name: /Charger les données du compte/ })
    );

    expect(await screen.findByText(/remplaceront/)).toBeTruthy();
    expect(screen.getByText('Recettes').nextSibling?.textContent).toBe('1');
    // Rien n'a bougé tant que rien n'est confirmé.
    expect(useFaits.getState().faits.recettes).toHaveLength(0);
  });

  it('remplace les faits à la confirmation', async () => {
    reponses(SESSION_OK, BUNDLE);
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(
      await screen.findByRole('button', { name: /Charger les données du compte/ })
    );
    await utilisateur.click(
      await screen.findByRole('button', { name: /Remplacer les données de cet appareil/ })
    );

    const faits = useFaits.getState().faits;
    expect(faits.entreprise.nom).toBe('Démo');
    expect(faits.recettes).toHaveLength(1);
    expect(faits.soldeInitial).toBe(5000);
  });

  it('laisse annuler sans rien toucher', async () => {
    reponses(SESSION_OK, BUNDLE);
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(
      await screen.findByRole('button', { name: /Charger les données du compte/ })
    );
    await utilisateur.click(await screen.findByRole('button', { name: 'Annuler' }));

    expect(useFaits.getState().faits.recettes).toHaveLength(0);
    expect(screen.queryByText(/remplaceront/)).toBeNull();
  });

  // Un compte neuf n'est pas une erreur.
  it('dit qu’un compte est vide sans crier à l’erreur', async () => {
    reponses(SESSION_OK, { corps: [] });
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(
      await screen.findByRole('button', { name: /Charger les données du compte/ })
    );
    expect((await screen.findByRole('status')).textContent).toMatch(/aucune donnée/i);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // C'est la condition pour que l'ancienne version reste utilisable, et qu'un
  // essai de la nouvelle ne puisse pas abîmer des données comptables.
  it('n’envoie jamais rien au serveur', async () => {
    const appel = reponses(SESSION_OK, BUNDLE);
    render(<Compte stockage={CONFIGURE()} />);
    const utilisateur = await seConnecter();

    await utilisateur.click(
      await screen.findByRole('button', { name: /Charger les données du compte/ })
    );
    await utilisateur.click(
      await screen.findByRole('button', { name: /Remplacer les données de cet appareil/ })
    );

    const methodesEcriture = appel.mock.calls
      .map((c) => String((c[1] as RequestInit | undefined)?.method ?? 'GET').toUpperCase())
      .filter((m, i) => i > 0 && m !== 'GET');
    expect(methodesEcriture).toEqual([]);
  });
});
