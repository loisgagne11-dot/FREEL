import { describe, expect, it } from 'vitest';
import {
  type ClientCarnet,
  nomAPropager, peutSupprimerClient, peutSupprimerMission, rattachementsDe,
  validerNomClient
} from './carnet';

const client = (nom: string, id = nom): ClientCarnet =>
  ({ id, nom, pays: '', tvaIntracom: '' });

describe('nom de client', () => {
  it('accepte un nom neuf', () => {
    expect(validerNomClient('Nouveau', [client('Existant')])).toBeNull();
  });

  // Le nom EST la clé de rattachement : sans lui, une recette ne sait plus à
  // qui elle appartient.
  it('refuse un nom vide', () => {
    expect(validerNomClient('   ', [])?.motif).toBe('nom_vide');
  });

  // Deux homonymes rendraient indécidable l'appartenance de chaque recette.
  it('refuse un homonyme, casse et espaces ignorés', () => {
    expect(validerNomClient('dupont', [client('Dupont')])?.motif).toBe('nom_deja_pris');
    expect(validerNomClient('  Dupont  ', [client('Dupont')])?.motif).toBe('nom_deja_pris');
  });

  it('laisse un client garder son propre nom lors d’une modification', () => {
    expect(validerNomClient('Dupont', [client('Dupont', 'c1')], 'c1')).toBeNull();
  });
});

describe('rattachements', () => {
  const missions = [{ clientNom: 'Dupont' }, { clientNom: 'Autre' }];
  const recettes = [{ clientNom: 'Dupont' }, { clientNom: 'Dupont' }];

  it('compte ce qui pointe vers un client', () => {
    expect(rattachementsDe('Dupont', missions, recettes))
      .toEqual({ missions: 1, recettes: 2 });
  });

  it('ignore la casse, comme le fait le rattachement', () => {
    expect(rattachementsDe('DUPONT', missions, recettes).recettes).toBe(2);
  });

  it('ne compte rien pour un nom inconnu', () => {
    expect(rattachementsDe('Inconnu', missions, recettes))
      .toEqual({ missions: 0, recettes: 0 });
  });
});

describe('suppression d’un client', () => {
  it('autorise la suppression d’un client sans rattachement', () => {
    expect(peutSupprimerClient('Seul', [], [])).toBeNull();
  });

  // Les recettes resteraient au livre — c'est un registre en ajout seul —
  // mais sortiraient des délais de paiement et de la DES sans que rien ne le
  // signale.
  it('refuse tant que des recettes sont rattachées, en les dénombrant', () => {
    const refus = peutSupprimerClient('Dupont', [], [{ clientNom: 'Dupont' }]);
    expect(refus?.motif).toBe('rattachements_existants');
    expect(refus?.message).toMatch(/1 recette/);
  });

  it('refuse tant que des missions sont rattachées', () => {
    const refus = peutSupprimerClient('Dupont', [{ clientNom: 'Dupont' }], []);
    expect(refus?.message).toMatch(/1 mission/);
  });

  it('énumère les deux quand les deux existent', () => {
    const refus = peutSupprimerClient(
      'Dupont', [{ clientNom: 'Dupont' }], [{ clientNom: 'Dupont' }, { clientNom: 'Dupont' }]
    );
    expect(refus?.message).toMatch(/1 mission et 2 recettes/);
  });
});

describe('suppression d’une mission', () => {
  const mission = { clientNom: 'Dupont', debut: '2026-01-01', fin: '2026-12-31' };

  it('autorise la suppression sans recette du client', () => {
    expect(peutSupprimerMission(mission, [{ clientNom: 'Autre', emiseLe: '2026-06-01' }]))
      .toBeNull();
  });

  // Une facture émise ne se retire pas du registre : supprimer la mission qui
  // la justifie rendrait sa présence inexplicable en contrôle.
  it('refuse quand une recette du client tombe dans la période', () => {
    const refus = peutSupprimerMission(
      mission, [{ clientNom: 'Dupont', emiseLe: '2026-06-01' }]
    );
    expect(refus?.motif).toBe('rattachements_existants');
  });

  it('autorise quand les recettes du client sont hors période', () => {
    expect(peutSupprimerMission(
      mission, [{ clientNom: 'Dupont', emiseLe: '2025-06-01' }]
    )).toBeNull();
  });

  // Faute de date, on ne peut pas écarter le rattachement : on s'abstient.
  it('refuse quand une recette du client n’a pas de date', () => {
    expect(peutSupprimerMission(
      mission, [{ clientNom: 'Dupont', emiseLe: null }]
    )?.motif).toBe('rattachements_existants');
  });

  it('traite une mission ouverte comme couvrant tout ce qui suit son début', () => {
    const ouverte = { clientNom: 'Dupont', debut: '2026-01-01', fin: null };
    expect(peutSupprimerMission(
      ouverte, [{ clientNom: 'Dupont', emiseLe: '2030-01-01' }]
    )?.motif).toBe('rattachements_existants');
  });
});

describe('propagation d’un renommage', () => {
  it('ne propage rien quand le nom ne change pas', () => {
    expect(nomAPropager('Dupont', 'Dupont')).toBeNull();
    expect(nomAPropager('Dupont', '  Dupont  ')).toBeNull();
  });

  // Corriger « dupont » en « Dupont » EST un renommage : sans propagation, la
  // casse d'origine subsisterait dans les recettes.
  it('propage un changement de casse', () => {
    expect(nomAPropager('dupont', 'Dupont')).toBe('Dupont');
  });

  it('propage un vrai renommage', () => {
    expect(nomAPropager('Dupont', 'Dupont SARL')).toBe('Dupont SARL');
  });
});
