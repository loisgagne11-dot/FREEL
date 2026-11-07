import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dateISO } from '../domain/types';
import { ajouterJours } from '../domain/calculs/aTraiter';
import { dateDuJour, moisCourant } from './selecteurs';

/*
 * La suite tourne en UTC : c'est précisément pourquoi ces défauts n'ont été
 * vus par aucun test. Ce fichier se place à Paris, où vit l'utilisateur.
 */
const fuseauDOrigine = process.env['TZ'];
beforeAll(() => { process.env['TZ'] = 'Europe/Paris'; });
afterAll(() => {
  if (fuseauDOrigine === undefined) delete process.env['TZ'];
  else process.env['TZ'] = fuseauDOrigine;
});

/**
 * AJOUTER UN JOUR AJOUTE UN JOUR, MÊME AU CHANGEMENT D'HEURE.
 *
 * La version précédente mêlait lecture UTC et ajout en heure locale : à
 * Paris, « 29 mars + 1 jour » rendait le 29 mars. Une échéance de facture ou
 * un retard calculés à cheval sur la fin mars tombaient un jour trop tôt.
 */
describe('arithmétique des dates à Paris', () => {
  it('franchit le passage à l’heure d’été', () => {
    expect(ajouterJours(dateISO('2026-03-29'), 1)).toBe('2026-03-30');
    expect(ajouterJours(dateISO('2026-03-28'), 2)).toBe('2026-03-30');
  });

  it('franchit le retour à l’heure d’hiver', () => {
    expect(ajouterJours(dateISO('2026-10-24'), 2)).toBe('2026-10-26');
  });
});

/**
 * LE JOUR EST CELUI DU CALENDRIER DE LA PERSONNE.
 *
 * Le 1er janvier à 0 h 30 à Paris, le mois courant disait janvier et la date
 * du jour le 31 décembre : une facture émise ou annulée à cette heure-là
 * tombait dans l'année précédente.
 */
describe('date du jour à Paris', () => {
  const premierJanvierMinuitTrente = new Date('2026-12-31T23:30:00Z');

  it('date le 1er janvier, comme le mois courant', () => {
    expect(dateDuJour(premierJanvierMinuitTrente)).toBe('2027-01-01');
    expect(moisCourant(premierJanvierMinuitTrente)).toBe('2027-01');
  });
});
