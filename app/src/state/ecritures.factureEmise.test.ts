import { beforeEach, describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import { type Recette, faitsVides } from './schema';
import { useFaits } from './store';
import { type SaisieFactureEmise, ajouterRecette, annulerRecette, enregistrerFactureEmise, rattacherAuMois } from './ecritures.recettes';
import { numeroSuivant, reediterFacture } from './selecteurs.facture';

beforeEach(() => {
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

const AUJOURDHUI = dateISO('2026-09-10');

const saisie = (p: Partial<SaisieFactureEmise> = {}): SaisieFactureEmise => ({
  clientNom: 'Client France', libelle: 'Mission A — août 2026', montant: euros(10_500),
  tvaCollectee: euros(0), numero: 'F-2026-0042', emiseLe: dateISO('2026-09-02'),
  envoyeeLe: dateISO('2026-09-02'), echeanceLe: dateISO('2026-10-31'), moisFacture: mois('2026-08'),
  ...p
});

const recettes = (): readonly Recette[] => useFaits.getState().faits.recettes;

describe('enregistrer une facture émise dans un autre logiciel', () => {
  it('porte au suivi une facture émise ailleurs, avec son numéro, ses dates et son mois', () => {
    const r = enregistrerFactureEmise(saisie(), AUJOURDHUI);
    expect('id' in r).toBe(true);
    expect(recettes()[0]).toMatchObject({
      numero: 'F-2026-0042', emiseLe: '2026-09-02', envoyeeLe: '2026-09-02', echeanceLe: '2026-10-31',
      moisFacture: '2026-08', emisePar: 'externe', lignes: null, encaisseeLe: null, justificatifId: null
    });
  });

  /*
   * AUCUNE NUMÉROTATION DE FREEL N'EST CONSOMMÉE. Si elle l'était, la suite de
   * FREEL avancerait d'un cran à chaque facture de Tiime ; le jour où l'on
   * revient à FREEL, elle aurait des trous qu'aucune facture n'explique — un
   * numéro absent se lit, en contrôle, comme une facture retirée du registre.
   */
  it('ne prend aucun numéro de FREEL : la suite reste celle d’avant', () => {
    ajouterRecette({
      clientNom: 'Client France', libelle: 'Prestation', montant: euros(1000),
      emiseLe: dateISO('2026-03-31'), encaisseeLe: null, modeReglement: null
    });
    const avant = numeroSuivant(useFaits.getState().faits, new Date('2026-09-10T09:00:00'));
    enregistrerFactureEmise(saisie(), AUJOURDHUI);
    enregistrerFactureEmise(saisie({ numero: 'F-2026-0043' }), AUJOURDHUI);
    expect(numeroSuivant(useFaits.getState().faits, new Date('2026-09-10T09:00:00'))).toBe(avant);
    expect(avant).toBe('2026-002');
  });

  /* Sans numéro, le livre des recettes ne renverrait à aucune pièce — et FREEL
     n'en inventera pas un : ce serait celui de sa propre suite. */
  it('exige le numéro de l’autre logiciel, et n’en attribue jamais', () => {
    const r = enregistrerFactureEmise(saisie({ numero: '  ' }), AUJOURDHUI);
    expect(r).toEqual({ motif: expect.stringMatching(/numéro/) });
    expect(recettes()).toHaveLength(0);
  });

  /* Une pièce, une écriture : un numéro saisi deux fois compterait deux fois
     le chiffre d'affaires, et la seconde saisie est presque toujours un
     doublon — la facture rattrapée depuis la liste après l'avoir été depuis
     le mois. */
  it('refuse un numéro déjà au livre, sans la casse ni les blancs', () => {
    enregistrerFactureEmise(saisie(), AUJOURDHUI);
    const doublon = enregistrerFactureEmise(saisie({ numero: ' f-2026-0042' }), AUJOURDHUI);
    expect(doublon).toEqual({ motif: expect.stringMatching(/déjà au livre/) });
    expect(recettes()).toHaveLength(1);
  });

  it('tient les dates : pas d’émission à venir, pas d’envoi avant l’émission, pas d’échéance avant elle', () => {
    expect(enregistrerFactureEmise(saisie({ emiseLe: dateISO('2026-09-11') }), AUJOURDHUI))
      .toEqual({ motif: expect.stringMatching(/à venir/) });
    expect(enregistrerFactureEmise(saisie({ envoyeeLe: dateISO('2026-09-01') }), AUJOURDHUI))
      .toEqual({ motif: expect.stringMatching(/date d’envoi/) });
    expect(enregistrerFactureEmise(saisie({ echeanceLe: dateISO('2026-09-01') }), AUJOURDHUI))
      .toEqual({ motif: expect.stringMatching(/échéance/) });
    expect(recettes()).toHaveLength(0);
  });

  /* « Pas encore envoyée » est une réponse : la facture attendra « Marquer
     envoyée » dans la liste. */
  it('accepte une facture pas encore partie', () => {
    enregistrerFactureEmise(saisie({ envoyeeLe: null }), AUJOURDHUI);
    expect(recettes()[0]?.envoyeeLe).toBeNull();
  });

  /* Rééditer une facture de Tiime produirait, sous son numéro, un document
     que le client n'a jamais reçu : un faux, même par l'adresse collée à la main. */
  it('ne se réédite pas : FREEL n’en a pas le document', () => {
    enregistrerFactureEmise(saisie(), AUJOURDHUI);
    const r = reediterFacture(useFaits.getState().faits, 'F-2026-0042');
    expect(r).toEqual({ cas: 'impossible', motif: expect.stringMatching(/émise dans ton logiciel/) });
  });
});

describe('dire le mois d’une facture déjà au livre', () => {
  it('pose le mois, sans toucher au reste de la facture', () => {
    const id = ajouterRecette({
      clientNom: 'Client France', libelle: 'Prestation', montant: euros(1000),
      emiseLe: dateISO('2026-08-03'), encaisseeLe: null, modeReglement: null
    });
    expect(rattacherAuMois(id, mois('2026-07'))).toBeNull();
    expect(recettes()[0]).toMatchObject({ moisFacture: '2026-07', numero: '2026-001', montant: 1000 });
  });

  /* Un avoir suit la facture qu'il annule : lui donner un mois en ferait une
     facture de ce mois-là, et le mois sortirait de la liste sur un avoir. */
  it('refuse un avoir et un brouillon', () => {
    const id = ajouterRecette({
      clientNom: 'Client France', libelle: 'Prestation', montant: euros(1000),
      emiseLe: dateISO('2026-08-03'), encaisseeLe: null, modeReglement: null
    });
    annulerRecette(id, dateISO('2026-08-10'));
    expect(rattacherAuMois(`${id}-annulation`, mois('2026-07'))).toMatch(/avoir/);
    const brouillon = ajouterRecette({
      clientNom: 'Client France', libelle: 'Prestation', montant: euros(1000),
      emiseLe: null, encaisseeLe: null, modeReglement: null
    });
    expect(rattacherAuMois(brouillon, mois('2026-07'))).toMatch(/brouillon/);
  });
});
