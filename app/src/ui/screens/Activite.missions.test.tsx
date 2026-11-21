/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, type Mission, faitsVides } from '../../state/schema';
import { completerFaits } from '../../state/schema.migrations';
import { useFaits } from '../../state/store';
import { Activite } from './Activite';

afterEach(() => { cleanup(); vi.useRealTimers(); window.location.hash = ''; });

/** Le 10 juin 2026, l'horloge des captures et de la maquette. */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00'));
  window.location.hash = '#/activite/missions';
});

const demonstration = (): Faits =>
  completerFaits(JSON.parse(readFileSync('public/jeu-de-demonstration.json', 'utf8')));

const semer = (faits: Faits): void => { useFaits.setState({ faits }); };

const mission = (m: Partial<Mission> & { readonly id: string }): Mission => ({
  clientId: null, clientNom: 'Client Démo', description: `Mission ${m.id}`, tjm: euros(500),
  debut: dateISO('2026-06-01'), fin: dateISO('2026-09-30'), statut: 'active',
  joursCommandes: null, preavisFinJours: null, reconduction: null, probabilite: null,
  entites: [{ id: `${m.id}-co1`, nom: '', couleur: '', adresse: '', contact: '', email: '', telephone: '', rythmes: [], ajustements: {} }],
  ...m
});

async function ouvrirLOnglet() {
  render(<Activite />);
  await screen.findByRole('heading', { name: /^Toutes les missions/ });
  return userEvent.setup();
}

const tuile = (nom: string): string => screen.getByRole('group', { name: nom }).textContent ?? '';
const ligneDe = (nom: string): HTMLElement =>
  within(screen.getByRole('table')).getByRole('button', { name: nom }).closest('tr') as HTMLElement;

/**
 * Le titre répond à la question qu'on vient poser — jusqu'à quand suis-je
 * couvert ? Une mission signée sans fin ne devient pas une date ; rien de
 * signé ne devient pas « couvert jusqu'à aujourd'hui ».
 */
describe('le titre de l’onglet', () => {
  it('dit jusqu’où ce qui est signé couvre l’avenir', async () => {
    semer(demonstration());
    await ouvrirLOnglet();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Couvert jusqu’au 31 juillet.');
  });

  it('dit « Couvert, sans fin fixée. » dès qu’une mission signée n’a pas de fin', async () => {
    semer({ ...faitsVides(), missions: [mission({ id: 'a' }), mission({ id: 'b', fin: null })] });
    await ouvrirLOnglet();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Couvert, sans fin fixée.');
    expect(tuile('Carnet signé')).toMatch(/Mission b \(sans fin fixée\)/);
  });

  it('dit « Rien de signé. » quand seul un prospect court', async () => {
    semer({ ...faitsVides(), missions: [mission({ id: 'p', statut: 'prospect', joursCommandes: 25, probabilite: 90 })] });
    await ouvrirLOnglet();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Rien de signé.');
    expect(tuile('Carnet signé')).toMatch(/Aucune mission signée/);
  });
});

describe('les trois tuiles, sur la démonstration', () => {
  /* 32 commandés − 15,5 faits pour la refonte ; 4,5 planifiés d'ici le 30 juin
     pour l'identité, reconduite sans volume ; 3 − 0,5 pour la carte. Le
     prospect, 25 jours à 60 %, n'y est pas. */
  it('comptent le carnet signé en jours et en euros, sans le prospect', async () => {
    semer(demonstration());
    await ouvrirLOnglet();
    expect(tuile('Carnet signé')).toMatch(/23,5 jours/);
    expect(tuile('Carnet signé')).toMatch(/11\s890\s€ qu’il te reste à produire/u);
  });

  it('disent la fin de visibilité, à préparer dans son préavis', async () => {
    semer(demonstration());
    await ouvrirLOnglet();
    expect(tuile('Fin de visibilité')).toMatch(/31 juillet/);
    expect(tuile('Fin de visibilité')).toMatch(/Dans 51 jours, plus rien n’est signé/);
    expect(tuile('Fin de visibilité')).toMatch(/◇ À préparer/);
  });

  it('disent l’occupation du mois, congés retirés', async () => {
    semer(demonstration());
    await ouvrirLOnglet();
    expect(tuile('Occupation de juin')).toMatch(/98 %/);
    expect(tuile('Occupation de juin')).toMatch(/19,5 jours sur 20 ouvrés, 2 jours de congé retirés/);
  });
});

describe('les douze mois à venir', () => {
  /* La rangée du bas n'existe nulle part ailleurs en texte : la phrase de la
     frise la porte, pour qui ne voit pas le dessin. */
  it('se disent en une phrase : missions, prospect non compté, jours signés', async () => {
    semer(demonstration());
    await ouvrirLOnglet();
    const frise = screen.getByRole('img', { name: /^Carnet de juin 2026 à mai 2027/ });
    const phrase = frise.getAttribute('aria-label') ?? '';
    expect(phrase).toMatch(/trois missions signées, la dernière s’arrête le 31 juillet/);
    expect(phrase).toMatch(/un prospect de septembre à octobre, non compté/);
    expect(phrase).toMatch(/Jours signés : juin 19,5, juillet 7, août 0, septembre 0, octobre 0\./);
  });

  it('annoncent la fin dans son préavis, et la reconduction tacite', async () => {
    semer(demonstration());
    await ouvrirLOnglet();
    expect(screen.getByText('◇ Refonte du site se termine dans 51 jours.')).toBeTruthy();
    expect(screen.getByText('◇ Identité de marque se reconduit le 1ᵉʳ juillet sauf dénonciation.')).toBeTruthy();
    // Sept jours de préavis : la carte & menus, qui finit dans vingt, ne s'annonce pas encore.
    expect(screen.queryByText(/Carte & menus se termine/)).toBeNull();
  });
});

describe('toutes les missions', () => {
  it('disent l’état de chaque mission, un signe et un mot', async () => {
    semer(demonstration());
    await ouvrirLOnglet();
    expect(ligneDe('Refonte du site').textContent).toMatch(/◇ Fin dans 51 jours/);
    expect(ligneDe('Carte & menus').textContent).toMatch(/● En cours/);
    expect(ligneDe('Catalogue produits').textContent).toMatch(/○ Prospect, 60 %/);
    expect(ligneDe('Lancement de marque').textContent).toMatch(/● Terminée, soldée/);
    expect(ligneDe('Refonte du site').textContent).toMatch(/15,5 \/ 32/);
    expect(ligneDe('Catalogue produits').textContent).toMatch(/— \/ 25/);
  });

  it('se filtrent par statut, une perdue rangée avec les terminées', async () => {
    semer(demonstration());
    const u = await ouvrirLOnglet();
    await u.click(screen.getByRole('button', { name: 'Terminées 2' }));
    const lignes = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(lignes.map((l) => within(l).getAllByRole('button')[0]?.textContent))
      .toEqual(['Lancement de marque', 'Charte éditoriale']);
    expect(ligneDe('Charte éditoriale').textContent).toMatch(/× Perdue/);
    await u.click(screen.getByRole('button', { name: 'En cours 3' }));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
  });

  it('dit « à facturer » d’une mission dont le volume est atteint', async () => {
    semer({ ...faitsVides(), missions: [mission({
      id: 'c', joursCommandes: 2, tjm: euros(460),
      entites: [{ id: 'c-co1', nom: '', couleur: '', adresse: '', contact: '', email: '', telephone: '',
        rythmes: [{ du: dateISO('2026-06-01'), au: dateISO('2026-09-30'), parJour: { lun: 1 }, tjm: null }], ajustements: {} }]
    })] });
    await ouvrirLOnglet();
    expect(ligneDe('Mission c').textContent).toMatch(/◇\s*920\s€\s*à facturer/u);
  });

  /* Le geste de l'ancienne ligne : son nom ouvre la mission — modifier,
     arrêter, retirer un client, la supprimer. */
  it('ouvrent leur formulaire depuis leur nom', async () => {
    semer(demonstration());
    const u = await ouvrirLOnglet();
    await u.click(within(screen.getByRole('table')).getByRole('button', { name: 'Refonte du site' }));
    expect(await screen.findByRole('dialog', { name: 'Modifier la mission' })).toBeTruthy();
    expect((await screen.findByLabelText('Description') as HTMLInputElement).value).toBe('Refonte du site');
  });
});

/**
 * « Préparer la suite », depuis « à traiter » : l'adresse ouvre la mission
 * elle-même, puis redevient celle de l'onglet — un rechargement ne rouvre pas
 * un formulaire qu'on a fermé.
 */
describe('l’adresse d’une mission', () => {
  it('ouvre la mission qu’elle désigne, puis rend l’adresse de l’onglet', async () => {
    semer(demonstration());
    window.location.hash = '#/activite/mission-mis-refonte';
    render(<Activite />);
    expect(await screen.findByRole('dialog', { name: 'Modifier la mission' })).toBeTruthy();
    expect((await screen.findByLabelText('Description') as HTMLInputElement).value).toBe('Refonte du site');
    expect(window.location.hash).toBe('#/activite/missions');
  });
});

describe('le formulaire, ses quatre champs du carnet', () => {
  async function nouvelle() {
    semer({ ...faitsVides(), missions: [mission({ id: 'a' })] });
    const u = await ouvrirLOnglet();
    await u.click(screen.getByRole('button', { name: 'Ajouter une mission' }));
    await u.type(await screen.findByLabelText('Client'), 'Client Démo');
    return u;
  }
  const enregistree = () => useFaits.getState().faits.missions[1];

  it('enregistre un volume en demi-journées, et refuse ce qui ne s’y compte pas', async () => {
    const u = await nouvelle();
    await u.type(screen.getByLabelText('Jours commandés'), '12,3');
    await u.click(screen.getByRole('button', { name: 'Ajouter la mission' }));
    expect(screen.getByRole('alert').textContent).toMatch(/demi-journées/);
    expect(useFaits.getState().faits.missions).toHaveLength(1);

    await u.clear(screen.getByLabelText('Jours commandés'));
    await u.type(screen.getByLabelText('Jours commandés'), '12,5');
    await u.click(screen.getByRole('button', { name: 'Ajouter la mission' }));
    expect(enregistree()?.joursCommandes).toBe(12.5);
  });

  it('enregistre le préavis choisi, et la reconduction tacite avec sa période', async () => {
    const u = await nouvelle();
    await u.type(screen.getByLabelText(/Préavis de fin/), '30');
    await u.click(screen.getByRole('checkbox', { name: 'Reconduction tacite' }));
    await u.clear(screen.getByLabelText(/Par périodes de/));
    await u.type(screen.getByLabelText(/Par périodes de/), '3');
    await u.click(screen.getByRole('button', { name: 'Ajouter la mission' }));
    expect(enregistree()).toMatchObject({ preavisFinJours: 30, reconduction: { dureeMois: 3 } });
  });

  it('ne demande la probabilité qu’à un prospect', async () => {
    const u = await nouvelle();
    expect(screen.queryByLabelText(/Probabilité/)).toBeNull();
    await u.selectOptions(screen.getByLabelText('Statut'), 'prospect');
    await u.type(screen.getByLabelText(/Probabilité/), '40');
    await u.click(screen.getByRole('button', { name: 'Ajouter la mission' }));
    expect(enregistree()).toMatchObject({ statut: 'prospect', probabilite: 40 });
  });
});
