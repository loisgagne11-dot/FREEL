import { describe, expect, it } from 'vitest';
import { mois } from '../types';
import {
  declarationTvaDe, groupeDuDepartement, initialeDuNom, jourCa3, limiteAcompteSimplifie, limiteCa12
} from './obligations.tva';

const valeur = (r: ReturnType<typeof jourCa3>) => (r.statut === 'refuse' ? r.motif : r.valeur);

/**
 * LE JOUR DE LA CA3 D'UNE ENTREPRISE INDIVIDUELLE (CIBS A161-29).
 *
 * Paris et la petite couronne : 15 de A à H, 17 de I à Z ; ailleurs : 16 et
 * 19 — reporté au premier jour ouvré (ann. IV 199-0). Les dates attendues sont
 * celles du relevé du 17/11, calculées et non publiées.
 */
describe('jour de dépôt de la CA3', () => {
  it('suit l’initiale et le département', () => {
    expect(valeur(jourCa3(mois('2026-04'), 'Arnaud', '75010'))).toBe('2026-04-15');
    expect(valeur(jourCa3(mois('2026-04'), 'Martin', '92100'))).toBe('2026-04-17');
    expect(valeur(jourCa3(mois('2026-04'), 'Bernard', '69001'))).toBe('2026-04-16');
  });

  it('reporte au jour ouvré un jour qui tombe un week-end', () => {
    // Le 19 avril 2026 est un dimanche ; le 17 janvier 2026, un samedi.
    expect(valeur(jourCa3(mois('2026-04'), 'Zola', '69001'))).toBe('2026-04-20');
    expect(valeur(jourCa3(mois('2026-01'), 'Martin', '93200'))).toBe('2026-01-19');
    // Le 16 janvier 2027 est un samedi.
    expect(valeur(jourCa3(mois('2027-01'), 'Durand', '33000'))).toBe('2027-01-18');
  });

  it('est une date calculée, que l’espace professionnel corrige', () => {
    const r = jourCa3(mois('2026-07'), 'Durand', '33000');
    expect(r.statut).toBe('hypothese');
    expect(r.statut === 'hypothese' ? r.source : '').toMatch(/espace professionnel fait foi/);
  });

  /*
   * Le nom de l'entreprise est souvent une enseigne (« Atelier … ») dont
   * l'initiale n'a rien à voir : deviner donnerait une date fausse une fois
   * sur deux. Sans nom, on le demande.
   */
  it('refuse sans nom de l’exploitant, en disant quoi faire', () => {
    const r = jourCa3(mois('2026-07'), '', '75010');
    expect(r.statut).toBe('refuse');
    expect(valeur(r)).toMatch(/Indique ton nom/);
    expect(jourCa3(mois('2026-07'), 'Durand', '').statut).toBe('refuse');
  });

  it('lit l’initiale sans ses accents, et la petite couronne sur le code postal', () => {
    expect(initialeDuNom('Émile')).toBe('E');
    expect(initialeDuNom('  ')).toBeNull();
    expect(groupeDuDepartement('94300')).toBe('paris_petite_couronne');
    expect(groupeDuDepartement('95000')).toBe('autres');
    expect(groupeDuDepartement('75 01')).toBeNull();
  });
});

/**
 * LA DÉCLARATION D'UN REDEVABLE, ANNÉE PAR ANNÉE.
 *
 * Le régime simplifié est supprimé au 01/01/2027 : CA12 jusqu'à 2026, CA3
 * trimestrielle ensuite, mensuelle sur option.
 */
describe('régime déclaratif de TVA', () => {
  it('rend la CA12 en 2026 au régime simplifié, la CA3 mensuelle au réel normal', () => {
    expect(declarationTvaDe(2026, 'simplifie', false)).toBe('ca12');
    expect(declarationTvaDe(2026, 'reel_normal', false)).toBe('ca3_mensuelle');
  });

  it('rend la CA3 trimestrielle à partir de 2027, mensuelle sur option', () => {
    expect(declarationTvaDe(2027, 'simplifie', false)).toBe('ca3_trimestrielle');
    expect(declarationTvaDe(2027, 'reel_normal', false)).toBe('ca3_trimestrielle');
    expect(declarationTvaDe(2027, 'simplifie', true)).toBe('ca3_mensuelle');
  });

  it('date la dernière CA12 au 4 mai 2027, et ne l’invente pas pour un exercice non relevé', () => {
    const derniere = limiteCa12(2026);
    expect(derniere.statut === 'publie' ? derniere.valeur : '').toBe('2027-05-04');
    expect(limiteCa12(2024).statut).toBe('refuse');
  });

  // La fenêtre est publiée (« entre les 15 et 24 »), le jour ne l'est pas.
  it('ne fixe aucun jour aux acomptes du régime simplifié', () => {
    const r = limiteAcompteSimplifie(2026, 7);
    expect(r.statut).toBe('refuse');
    expect(r.statut === 'refuse' ? r.motif : '').toMatch(/15 et le 24 juillet/);
  });
});
