/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { FournisseurToasts } from './Toasts';
import { estLeJeuDeDemonstration } from '../../domain/calculs/demonstration';
import { Accueil, BandeauDemonstration, dossierVide } from './Accueil';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-12T09:00:00Z'));
  window.localStorage.clear();
  window.location.hash = '';
  useFaits.setState({ faits: faitsVides(), chargement: { phase: 'pret', migrationEffectuee: false } });
});

const rendre = () => render(<FournisseurToasts><Accueil /></FournisseurToasts>);

describe('le dossier vide', () => {
  it('se reconnaît sur un dossier neuf', () => {
    expect(dossierVide(faitsVides())).toBe(true);
  });

  // Un seul champ rempli suffit : l'accueil sur un dossier en cours serait
  // pire que pas d'accueil du tout.
  it.each<[string, (f: Faits) => Faits]>([
    ['un prénom', (f) => ({ ...f, entreprise: { ...f.entreprise, prenom: 'Camille' } })],
    ['un nom d’entreprise', (f) => ({ ...f, entreprise: { ...f.entreprise, nom: 'Atelier' } })],
    ['un début d’activité', (f) => ({ ...f, entreprise: { ...f.entreprise, debutActivite: '2026-01-05' as never } })],
    ['un client', (f) => ({ ...f, clients: [{ id: 'c', nom: 'C' } as never] })],
    ['une mission', (f) => ({ ...f, missions: [{ id: 'm' } as never] })],
    ['une recette', (f) => ({ ...f, recettes: [{ id: 'r' } as never] })],
    ['une dépense', (f) => ({ ...f, depenses: [{ id: 'd' } as never] })],
    ['une échéance', (f) => ({ ...f, echeances: [{ id: 'e' } as never] })],
    ['une opération de relevé', (f) => ({ ...f, mouvementsBancaires: [{ id: 'o' } as never] })]
  ])('cesse de l’être avec %s', (_nom, remplir) => {
    expect(dossierVide(remplir(faitsVides()))).toBe(false);
  });
});

describe('l’accueil', () => {
  it('s’ouvre sur un dossier vide, une fois le chargement fini', () => {
    rendre();
    expect(screen.getByRole('dialog', { name: /Bienvenue dans Freel/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Commencer avec mes données' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reprendre l’ancienne application' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Restaurer une sauvegarde' })).toBeTruthy();
  });

  it('ne s’ouvre pas pendant le chargement : le dossier n’est pas encore lu', () => {
    useFaits.setState({ chargement: { phase: 'initial' } });
    rendre();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ne s’ouvre pas sur un dossier en cours', () => {
    useFaits.setState({ faits: { ...faitsVides(), entreprise: { ...faitsVides().entreprise, prenom: 'Camille' } } });
    rendre();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /**
   * Les six réponses dont dépendent cotisations, impôts et TVA, enregistrées
   * dans le profil — les mêmes champs que Config.
   */
  it('enregistre le profil minimal, puis se referme', async () => {
    rendre();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Commencer' }));
    await u.type(screen.getByLabelText('Prénom'), 'Camille');
    await u.selectOptions(screen.getByLabelText('Ton activité'), 'BIC_service');
    await u.type(screen.getByLabelText('Début d’activité'), '2026-03-02');
    await u.click(screen.getByLabelText('Je bénéficie de l’ACRE'));
    await u.click(screen.getByLabelText('Je facture la TVA'));
    await u.type(screen.getByLabelText('Depuis le mois de'), '2026-09');
    await u.click(screen.getByRole('button', { name: 'Enregistrer mon profil' }));

    const e = useFaits.getState().faits.entreprise;
    expect(e).toMatchObject({
      prenom: 'Camille', typeActivite: 'BIC_service', debutActivite: '2026-03-02',
      acre: true, versementLiberatoire: false, tvaDepuis: '2026-09'
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('refuse « je facture la TVA » sans le mois : il sépare les factures avec et sans TVA', async () => {
    rendre();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Commencer' }));
    await u.click(screen.getByLabelText('Je facture la TVA'));
    await u.click(screen.getByRole('button', { name: 'Enregistrer mon profil' }));
    expect(screen.getByRole('alert').textContent).toMatch(/mois depuis lequel/);
    expect(useFaits.getState().faits.entreprise.tvaDepuis).toBeNull();
  });

  it('charge la démonstration, recalée sur la date du jour, puis se referme', async () => {
    const jeu = readFileSync('public/jeu-de-demonstration.json', 'utf8');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => JSON.parse(jeu) }));
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voir la démonstration' }));

    await vi.waitFor(() => expect(estLeJeuDeDemonstration(useFaits.getState().faits.entreprise)).toBe(true));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Écrit au 10 juin, le jeu doit vivre au 12 novembre : figé, il
    // montrerait des mois entiers de périodes « en retard ».
    const emissions = useFaits.getState().faits.recettes.flatMap((r) => (r.emiseLe === null ? [] : [r.emiseLe]));
    expect([...emissions].sort().at(-1)! >= '2026-10-01').toBe(true);
  });

  it('dit pourquoi la démonstration ne vient pas, sans rien écrire', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('hors ligne')));
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voir la démonstration' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/n’a pas pu être chargé/);
    expect(dossierVide(useFaits.getState().faits)).toBe(true);
  });

  it('mène au compte pour reprendre l’ancienne application', async () => {
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Aller au compte' }));
    expect(window.location.hash).toBe('#/config/compte');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /**
   * Écarté, il ne revient pas à chaque ouverture d'un dossier qu'on laisse
   * vide exprès — mais il revient si l'on repart de zéro après l'avoir
   * rempli : c'est précisément le moment où il sert.
   */
  it('reste écarté sur un dossier vide, et revient après qu’il s’est rempli puis vidé', async () => {
    const { unmount } = rendre();
    await userEvent.setup().keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();

    rendre();
    expect(screen.queryByRole('dialog')).toBeNull();

    useFaits.setState({ faits: { ...faitsVides(), entreprise: { ...faitsVides().entreprise, prenom: 'Camille' } } });
    await vi.waitFor(() => expect(window.localStorage.getItem('freel.accueil.ecarte.v1')).toBeNull());
    useFaits.setState({ faits: faitsVides() });
    expect(await screen.findByRole('dialog', { name: /Bienvenue dans Freel/ })).toBeTruthy();
  });
});

describe('le bandeau de la démonstration', () => {
  it('dit que les données sont fictives, tant que le jeu livré est là', () => {
    useFaits.setState({
      faits: {
        ...faitsVides(),
        entreprise: { ...faitsVides().entreprise, nom: 'Atelier de démonstration', siret: '000 000 000 00000' }
      }
    });
    render(<BandeauDemonstration />);
    expect(screen.getByRole('note').textContent).toMatch(/Démonstration.*fictives/);
    expect(screen.getByRole('link', { name: 'Commencer avec mes données' }).getAttribute('href')).toBe('#/config/donnees');
  });

  it('se tait sur un vrai dossier', () => {
    useFaits.setState({ faits: { ...faitsVides(), entreprise: { ...faitsVides().entreprise, nom: 'Atelier' } } });
    render(<BandeauDemonstration />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});
