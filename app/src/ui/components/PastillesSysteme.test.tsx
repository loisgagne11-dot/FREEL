/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CLE_SESSION } from '../../infra/session';
import { ecrireBase } from '../../infra/synchro.appareil';
import { publierEtatSynchro } from '../../infra/synchro.etat';
import { PastillesSysteme } from './PastillesSysteme';

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-confidentiel');
});

/**
 * LE THÈME A QUITTÉ LA BARRE DU HAUT (lot 51, décision 4).
 *
 * On le choisit une fois : il vit dans Config › Affichage, où ses tests ont
 * suivi. Un menu « Palette » resté ici ferait deux portes pour un réglage, et
 * occuperait la place de ce qu'on touche tous les jours.
 */
it('ne porte plus le choix du thème', () => {
  render(<PastillesSysteme />);
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByText('Palette')).toBeNull();
});

/**
 * Le mode confidentialité.
 *
 * Il floute les montants pour qu'on puisse partager son écran. Un flou
 * partiel serait pire qu'aucun : l'utilisateur se croirait couvert sans
 * l'être. La complétude est constatée par `verifier-confidentialite`, qui
 * charge les sept écrans dans un navigateur ; ici on vérifie la bascule.
 */
describe('bascule de confidentialité', () => {
  it('dit l’action, et porte l’état dans aria-pressed', () => {
    render(<PastillesSysteme />);
    const bouton = screen.getByRole('button', { name: /Masquer les montants/ });
    expect(bouton.getAttribute('aria-pressed')).toBe('false');
  });

  it('marque le document quand on l’active', async () => {
    render(<PastillesSysteme />);
    await userEvent.click(screen.getByRole('button', { name: /Masquer les montants/ }));
    expect(document.documentElement.getAttribute('data-confidentiel')).toBe('oui');
    expect(screen.getByRole('button', { name: /Montants masqués/ }).getAttribute('aria-pressed'))
      .toBe('true');
  });

  it('revient en arrière au second clic', async () => {
    render(<PastillesSysteme />);
    await userEvent.click(screen.getByRole('button', { name: /Masquer les montants/ }));
    await userEvent.click(screen.getByRole('button', { name: /Montants masqués/ }));
    expect(document.documentElement.hasAttribute('data-confidentiel')).toBe(false);
  });

  it('part de l’état déjà persisté', () => {
    localStorage.setItem('freel.confidentialite.v1', 'oui');
    render(<PastillesSysteme />);
    expect(screen.getByRole('button', { name: /Montants masqués/ })).toBeTruthy();
  });
});

/**
 * LA PASTILLE CLOUD, ET LE CAS QU'ELLE EXISTE POUR SIGNALER.
 *
 * Trois états, pas deux. Entre « relié » et « local » se trouve la session
 * EXPIRÉE : on croit être synchronisé, on saisit une semaine de travail, et
 * rien ne remonte. C'est le seul des trois qui coûte quelque chose, et c'est
 * celui qu'un indicateur binaire escamote.
 */
describe('état du compte', () => {
  const session = (expireLe: number) => JSON.stringify({
    jeton: 'j', jetonRafraichissement: 'r', expireLe,
    utilisateurId: 'u1', email: 'contact@atelier-demo.fr'
  });

  it('dit « non synchronisé » quand aucun compte n’est relié', () => {
    render(<PastillesSysteme />);
    expect(screen.getByRole('link', { name: /Tes données restent sur cet appareil/ }))
      .toBeTruthy();
  });

  /**
   * ÉCRITE, PAS SEULEMENT UN POINT DE COULEUR (décision 2).
   *
   * Le libellé disparaissait sous 1 680 px — presque tous les écrans de
   * bureau — et laissait un point de huit pixels dont la couleur seule disait
   * l'état. Le texte est là ; `verifier-responsive` constate qu'il se VOIT au
   * bureau, ce que jsdom ne sait pas mesurer.
   */
  it('écrit l’état de la synchronisation', () => {
    render(<PastillesSysteme />);
    const lien = screen.getByRole('link', { name: /Tes données restent sur cet appareil/ });
    expect(lien.querySelector('[data-role="libelle-synchro"]')?.textContent).toBe('Non synchronisé');
  });

  it('dit que le compte est relié quand la session est valable', () => {
    localStorage.setItem(CLE_SESSION, session(Date.now() + 3_600_000));
    render(<PastillesSysteme />);
    expect(screen.getByRole('link', { name: /Compte relié/ })).toBeTruthy();
  });

  /** LE TEST QUI COMPTE : une session morte ne doit jamais se lire « relié ». */
  it('signale une session expirée plutôt que de la dire reliée', () => {
    localStorage.setItem(CLE_SESSION, session(Date.now() - 1000));
    render(<PastillesSysteme />);
    expect(screen.getByRole('link', { name: /Session expirée/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Compte relié/ })).toBeNull();
  });

  // Signaler sans offrir le chemin serait un reproche, pas un outil.
  it('mène à l’écran où l’on s’y reconnecte', () => {
    localStorage.setItem(CLE_SESSION, session(Date.now() - 1000));
    render(<PastillesSysteme />);
    const lien = screen.getByRole('link', { name: /Session expirée/ });
    expect(lien.getAttribute('href')).toBe('#/reglages/compte');
  });

  /**
   * Une session sur le point d'expirer est traitée comme expirée : partir sur
   * une requête avec un jeton qui meurt en chemin ne synchronise rien, et
   * l'aurait annoncé comme réussi.
   */
  it('compte la marge d’une minute du côté prudent', () => {
    localStorage.setItem(CLE_SESSION, session(Date.now() + 30_000));
    render(<PastillesSysteme />);
    expect(screen.getByRole('link', { name: /Session expirée/ })).toBeTruthy();
  });
});

/**
 * LA PASTILLE D'UN APPAREIL SYNCHRONISÉ (lot 42).
 *
 * Elle dit la vérité : l'heure de la dernière synchronisation réussie, puis
 * ce qui se passe. Chaque état est publié par le moteur ; la pastille ne fait
 * aucune requête. Si elle se taisait sur « hors ligne » ou « à choisir », on
 * croirait ses appareils d'accord alors qu'ils ne le sont pas.
 */
describe('la synchronisation automatique, dans la barre du haut', () => {
  const aujourdhui941 = () => { const d = new Date(); d.setHours(9, 41, 0, 0); return d; };
  const synchronise = (le: Date = aujourdhui941(), expireLe = Date.now() + 3_600_000) => {
    localStorage.setItem(CLE_SESSION, JSON.stringify({
      jeton: 'j', jetonRafraichissement: 'r', expireLe, utilisateurId: 'u1', email: 'contact@atelier-demo.fr'
    }));
    ecrireBase(localStorage, { compte: 'u1', version: 4, le: le.toISOString(), empreinte: 'e', modifieLe: null });
  };
  // Le libellé principal : le court (bureau étroit) est caché aux lecteurs d'écran.
  const libelle = () => document.querySelector('[data-role="libelle-synchro"] > span:not([aria-hidden])')?.textContent;

  beforeEach(() => { publierEtatSynchro({ phase: 'inactif' }); });

  // « Synchronisé à 9 h 41 », comme la maquette : l'heure est la réponse à « est-ce parti ? ».
  it('écrit l’heure de la dernière synchronisation', () => {
    synchronise();
    render(<PastillesSysteme />);
    expect(libelle()).toBe('Synchronisé à 9\u00a0h\u00a041');
    expect(screen.getByRole('link', { name: /Synchronisé à 9\sh\s41/ }).getAttribute('href')).toBe('#/reglages/compte');
  });

  // Une heure seule, la veille, se lirait « ce matin » : le retard disparaîtrait.
  it('dit « hier » plutôt qu’une heure qui se lirait aujourd’hui', () => {
    const hier = aujourdhui941();
    hier.setDate(hier.getDate() - 1);
    synchronise(hier);
    render(<PastillesSysteme />);
    expect(libelle()).toBe('Synchronisé hier');
    expect(screen.getByRole('link', { name: /Synchronisé hier à 9\sh\s41/ })).toBeTruthy();
  });

  it('suit ce que publie le moteur : envoi, hors ligne, à choisir', () => {
    synchronise();
    render(<PastillesSysteme />);
    act(() => { publierEtatSynchro({ phase: 'envoi' }); });
    expect(libelle()).toBe('Envoi…');
    act(() => { publierEtatSynchro({ phase: 'hors-ligne', aEnvoyer: true }); });
    expect(libelle()).toBe('Hors ligne — changements à envoyer');
    // Le libellé court ne dit pas moins : il abrège, il ne retire rien.
    expect(document.querySelector('[data-role="libelle-synchro"] > span[aria-hidden]:last-child')?.textContent)
      .toBe('Hors ligne · à envoyer');
    expect(screen.getByRole('link', { name: /partiront au retour du réseau/ })).toBeTruthy();
    act(() => { publierEtatSynchro({ phase: 'hors-ligne', aEnvoyer: false }); });
    expect(libelle()).toBe('Hors ligne');
  });

  /** « À CHOISIR » MÈNE OÙ L'ON CHOISIT. Le dire sans le chemin serait un reproche. */
  it('« à choisir » mène à Réglages › Compte, et dit pourquoi', () => {
    synchronise();
    render(<PastillesSysteme />);
    act(() => {
      publierEtatSynchro({
        phase: 'a-choisir', pourquoi: 'les-deux-ont-change', modifieLe: null, local: 'donnees',
        distant: { faits: {}, version: 5, schema: 28, majLe: null }
      });
    });
    expect(libelle()).toBe('À choisir');
    const lien = screen.getByRole('link', { name: /ont changé chacun de leur côté/ });
    expect(lien.getAttribute('href')).toBe('#/reglages/compte');
  });

  /**
   * SYNCHRONISÉ, UNE SESSION EXPIRÉE N'EST PAS UNE ALERTE : le moteur la
   * renouvelle. Seul un REFUS du serveur dit « Reconnecte-toi » — sans cela,
   * l'alerte d'une heure sur deux apprendrait à ne plus la lire.
   */
  it('ne crie pas « session expirée » quand le moteur va la renouveler', () => {
    synchronise(aujourdhui941(), Date.now() - 1000);
    render(<PastillesSysteme />);
    expect(libelle()).toBe('Synchronisé à 9\u00a0h\u00a041');
    act(() => { publierEtatSynchro({ phase: 'reconnecter' }); });
    expect(libelle()).toBe('Reconnecte-toi');
    expect(screen.getByRole('link', { name: /rien n’est perdu/ })).toBeTruthy();
  });

  /**
   * UN REFUS EFFACE LA SESSION (`reprendreSession`) : la pastille doit dire
   * « Reconnecte-toi », pas « Non synchronisé » — les modifications d'ici
   * attendent seulement la reconnexion, et rien ne les a perdues.
   */
  it('dit « Reconnecte-toi » même quand le refus a effacé la session', () => {
    synchronise();
    localStorage.removeItem(CLE_SESSION);
    render(<PastillesSysteme />);
    act(() => { publierEtatSynchro({ phase: 'reconnecter' }); });
    expect(libelle()).toBe('Reconnecte-toi');
  });

  // La base d'un autre compte ne dit rien de celui-ci : retour aux états d'avant.
  it('la base d’un autre compte ne fait pas dire « synchronisé »', () => {
    synchronise();
    ecrireBase(localStorage, { compte: 'autre', version: 4, le: new Date().toISOString(), empreinte: 'e', modifieLe: null });
    render(<PastillesSysteme />);
    expect(libelle()).toBe('Compte relié');
  });

  // Au téléphone, seule l'icône se voit : son tracé doit changer avec l'état.
  it('le tracé de l’icône change avec l’état', () => {
    synchronise();
    render(<PastillesSysteme />);
    const trace = () => document.querySelectorAll('svg path')[1]?.getAttribute('d');
    const coche = trace();
    act(() => { publierEtatSynchro({ phase: 'hors-ligne', aEnvoyer: true }); });
    const barre = trace();
    act(() => { publierEtatSynchro({ phase: 'reconnecter' }); });
    expect(new Set([coche, barre, trace()]).size).toBe(3);
  });
});
