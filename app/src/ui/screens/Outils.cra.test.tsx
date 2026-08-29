/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, type Mission, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { GenerateurCra } from './Outils.cra';

afterEach(cleanup);

/** Les espaces insécables d'`Intl` ne se distinguent pas à l'œil. */
const lisible = (t: string | null): string => (t ?? '').replace(/[  ]/g, ' ');

function mission(nom: string, parJour: Record<string, number>, m: Partial<Mission> = {}): Mission {
  return {
    id: `m-${nom}`, clientId: null, clientNom: nom, description: 'Mission',
    tjm: euros(500), debut: dateISO('2026-06-01'), fin: dateISO('2026-06-30'),
    statut: 'active',
    entites: [{
      id: `e-${nom}`, nom, couleur: '#1f8b58',
      adresse: '', contact: '', email: '', telephone: '',
      rythmes: [{ du: dateISO('2026-06-01'), au: dateISO('2026-06-30'), parJour, tjm: null }],
      ajustements: {}
    }],
    ...m
  };
}

function semer(modifications: Partial<Faits> = {}): void {
  const base = faitsVides();
  useFaits.setState({
    faits: {
      ...base,
      entreprise: { ...base.entreprise, nom: 'Studio Témoin', ville: 'Ailleurs' },
      ...modifications
    }
  });
}

beforeEach(() => semer());

const rendre = () =>
  render(<GenerateurCra ouvert annee={2026} onFermer={() => {}} />);

describe('ce que le générateur lit', () => {
  it('rend un document sans aucun montant', () => {
    semer({ missions: [mission('Client Alpha', { lun: 1, mar: 1 })] });
    rendre();

    const papier = document.querySelector('[data-papier]') as HTMLElement;
    // La règle du document : un CRA qui porte un prix se renégocie au lieu de
    // se signer. Ni euro, ni TJM, nulle part.
    expect(lisible(papier.textContent)).not.toMatch(/€/);
    expect(lisible(papier.textContent)).toMatch(/aucun montant/i);
  });

  it('groupe les journées par semaine, avec leur rang dans le mois', () => {
    semer({ missions: [mission('Client Alpha', { lun: 1 })] });
    rendre();

    const papier = document.querySelector('[data-papier]') as HTMLElement;
    // Juin 2026 commence un lundi : cinq lundis, donc cinq semaines.
    expect(within(papier).getByText('Semaine 1')).toBeTruthy();
    expect(within(papier).getByText('Semaine 5')).toBeTruthy();
  });

  it('totalise le mois en jours', () => {
    semer({ missions: [mission('Client Alpha', { lun: 1, mar: 0.5 })] });
    rendre();

    const papier = document.querySelector('[data-papier]') as HTMLElement;
    // Juin 2026 : 5 lundis et 5 mardis → 5 + 2,5 = 7,5 jours.
    const total = within(papier).getByText(/Grand total/).closest('tr') as HTMLElement;
    expect(lisible(total.textContent)).toMatch(/7,5 j/);
  });

  it('dit qu’il n’y a rien à documenter plutôt que de rendre un document vide', () => {
    rendre();
    expect(screen.getByText(/Aucune journée travaillée sur ce mois/)).toBeTruthy();
  });
});

/*
 * LE CLOISONNEMENT ENTRE CLIENTS EST LA PROPRIÉTÉ CRITIQUE DE CET ÉCRAN.
 *
 * Un client qui découvre sur son propre CRA le volume consacré à son
 * concurrent ne le prend jamais bien — et c'est un document qu'on lui demande
 * de signer.
 */
/*
 * LE MOIS PAR DÉFAUT N'ATTESTE PAS D'UN TRAVAIL QUI N'A PAS EU LIEU.
 *
 * Le planning est rempli d'office par le rythme : juillet porte déjà des
 * journées au mois de juin. Sans borne, le générateur s'ouvrait sur le CRA de
 * juillet — et c'est la CAPTURE qui l'a montré, pas un test : rien n'y était
 * faux, seulement prématuré.
 */
describe('le mois choisi d’office', () => {
  it('ne s’ouvre jamais sur un mois à venir', () => {
    // L'horloge du poste est en août 2026 ; le rythme couvre juin ET septembre.
    const m = mission('Client Alpha', { lun: 1 });
    semer({
      missions: [{
        ...m,
        entites: [{
          ...m.entites[0] as (typeof m.entites)[number],
          rythmes: [
            { du: dateISO('2026-06-01'), au: dateISO('2026-06-30'), parJour: { lun: 1 }, tjm: null },
            { du: dateISO('2026-12-01'), au: dateISO('2026-12-31'), parJour: { lun: 1 }, tjm: null }
          ]
        }]
      }]
    });
    rendre();

    const choisi = (screen.getByLabelText(/^Mois/) as HTMLSelectElement).value;
    expect(Number(choisi.slice(5, 7))).toBeLessThanOrEqual(new Date().getMonth() + 1);
    expect(choisi).toBe('2026-06');
  });

  // Les regarder reste permis : c'est les attester d'office qui ne l'est pas.
  it('propose tout de même les mois à venir', () => {
    const m = mission('Client Alpha', { lun: 1 });
    semer({
      missions: [{
        ...m,
        entites: [{
          ...m.entites[0] as (typeof m.entites)[number],
          rythmes: [
            { du: dateISO('2026-06-01'), au: dateISO('2026-06-30'), parJour: { lun: 1 }, tjm: null },
            { du: dateISO('2026-12-01'), au: dateISO('2026-12-31'), parJour: { lun: 1 }, tjm: null }
          ]
        }]
      }]
    });
    rendre();
    expect(screen.getByRole('option', { name: /décembre 2026/ })).toBeTruthy();
  });
});

describe('un document par client qui signe', () => {
  const deux = {
    missions: [
      mission('Client Alpha', { lun: 1, mar: 1 }),
      mission('Client Beta', { jeu: 1 })
    ]
  };

  // Le destinataire par défaut est le client le plus occupé : Alpha (lundi et
  // mardi) devant Beta (le jeudi seul).
  it('n’expose jamais l’autre client sur le document du premier', () => {
    semer(deux);
    rendre();

    const papier = document.querySelector('[data-papier]') as HTMLElement;
    expect(lisible(papier.textContent)).toMatch(/Client Alpha/);
    expect(lisible(papier.textContent)).not.toMatch(/Client Beta/);
  });

  it('avertit avant de produire le récapitulatif tous clients', async () => {
    semer(deux);
    rendre();

    await userEvent.selectOptions(
      screen.getByLabelText(/Destinataire/),
      screen.getByRole('option', { name: /Tous clients/ })
    );
    expect(screen.getByText(/expose à chaque client le volume consacré aux autres/))
      .toBeTruthy();
  });

  it('ne propose pas « tous clients » quand il n’y a qu’un client', () => {
    semer({ missions: [mission('Client Alpha', { lun: 1 })] });
    rendre();
    expect(screen.queryByRole('option', { name: /Tous clients/ })).toBeNull();
  });
});

/*
 * LA VENTILATION PAR LIEU S'ABSTIENT PLUTÔT QUE DE DEVINER.
 *
 * Une mission facturée « sur site » qui ne l'a pas été se conteste : ranger
 * une journée sans lieu dans « télétravail » ferait signer au client une
 * répartition que personne n'a constatée.
 */
describe('le lieu, quand on le connaît', () => {
  it('cache les colonnes de lieu quand aucune journée n’en porte', () => {
    semer({ missions: [mission('Client Alpha', { lun: 1 })] });
    rendre();

    const papier = document.querySelector('[data-papier]') as HTMLElement;
    expect(within(papier).queryByText('Télétrav.')).toBeNull();
    expect(within(papier).getByText('Total')).toBeTruthy();
  });

  it('ventile et signale la part sans lieu dès qu’une journée est renseignée', () => {
    const m = mission('Client Alpha', { lun: 1 });
    semer({
      missions: [{
        ...m,
        entites: [{
          ...m.entites[0] as (typeof m.entites)[number],
          ajustements: {
            '2026-06-01': { quotite: 1, creneaux: ['matin', 'apresMidi'], lieu: 'sur_site' }
          }
        }]
      }]
    });
    rendre();

    const papier = document.querySelector('[data-papier]') as HTMLElement;
    expect(within(papier).getByText('Sur site')).toBeTruthy();
    // Les quatre autres lundis n'ont pas de lieu : ils comptent au total sans
    // être rangés, et le document le DIT.
    expect(lisible(papier.textContent)).toMatch(/sans lieu/);
  });
});

describe('la phrase de tâches', () => {
  it('s’enregistre dans les faits, pour ne pas être retapée au mois suivant', async () => {
    semer({ missions: [mission('Client Alpha', { lun: 1 })] });
    rendre();

    const zones = screen.getAllByLabelText(/Tâches accomplies/);
    await userEvent.type(zones[0] as HTMLElement, 'Recette');

    const notes = useFaits.getState().faits.notesCra;
    expect(notes).toHaveLength(1);
    expect(notes[0]?.semaine).toBe('2026-06-01');
    expect(notes[0]?.destinataire).toBe('Client Alpha');
  });

  it('n’enregistre pas une note vide', async () => {
    semer({
      missions: [mission('Client Alpha', { lun: 1 })],
      notesCra: [{ semaine: dateISO('2026-06-01'), destinataire: 'Client Alpha', texte: 'A' }]
    });
    rendre();

    const zones = screen.getAllByLabelText(/Tâches accomplies/);
    await userEvent.clear(zones[0] as HTMLElement);
    expect(useFaits.getState().faits.notesCra).toHaveLength(0);
  });

  it('porte la phrase sur le document', () => {
    semer({
      missions: [mission('Client Alpha', { lun: 1 })],
      notesCra: [{
        semaine: dateISO('2026-06-01'), destinataire: 'Client Alpha',
        texte: 'Cadrage et recette'
      }]
    });
    rendre();

    const papier = document.querySelector('[data-papier]') as HTMLElement;
    expect(lisible(papier.textContent)).toMatch(/Tâches — Cadrage et recette/);
  });

  /*
   * Les notes d'un client ne suivent PAS sur le document d'un autre : elles
   * décrivent un travail qui ne le concerne pas.
   */
  it('ne montre pas la note d’un client sur le document d’un autre', async () => {
    semer({
      missions: [
        mission('Client Alpha', { lun: 1 }),
        mission('Client Beta', { jeu: 1 })
      ],
      notesCra: [{
        semaine: dateISO('2026-06-01'), destinataire: 'Client Alpha',
        texte: 'Cadrage et recette'
      }]
    });
    rendre();

    // Le destinataire par défaut est le plus occupé — ici « Atelier Exemple
    // Deux » n'a que les jeudis, donc c'est Studio qui sort. On bascule.
    await userEvent.selectOptions(
      screen.getByLabelText(/Destinataire/), 'Client Beta'
    );
    const papier = document.querySelector('[data-papier]') as HTMLElement;
    expect(lisible(papier.textContent)).not.toMatch(/Cadrage et recette/);
  });
});

describe('sortir le document', () => {
  it('télécharge un fichier autonome, qui emporte sa feuille de style', async () => {
    semer({ missions: [mission('Client Alpha', { lun: 1 })] });

    let ecrit = '';
    const creerUrl = vi.fn((blob: Blob) => {
      void blob.text().then((t) => { ecrit = t; });
      return 'blob:x';
    });
    vi.stubGlobal('URL', { ...URL, createObjectURL: creerUrl, revokeObjectURL: vi.fn() });

    rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger' }));
    await new Promise((r) => { setTimeout(r, 0); });

    expect(creerUrl).toHaveBeenCalled();
    // Autonome : il s'ouvrira chez le client, sans notre application autour.
    expect(ecrit).toMatch(/<!doctype html>/);
    expect(ecrit).toMatch(/\.doc-table/);
    expect(ecrit).toMatch(/Compte-rendu d’activité/);
    vi.unstubAllGlobals();
  });
});
