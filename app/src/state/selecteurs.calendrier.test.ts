import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois, ratio } from '../domain/types';
import { type Faits, faitsVides } from './schema';
import { calendrierDesObligations, evenementsDuCalendrier, uidMuet } from './selecteurs.calendrier';

const faits = (m: Partial<Faits> = {}, entreprise: Partial<Faits['entreprise']> = {}): Faits => ({
  ...faitsVides(),
  ...m,
  entreprise: {
    ...faitsVides().entreprise, debutActivite: dateISO('2020-01-01'), urssafPeriodicite: 'trimestriel', ...entreprise
  }
});
const recette = (id: string, le: string, montant: number) => ({
  id, clientNom: 'Studio Démo Confidentiel', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO(le), encaisseeLe: dateISO(le), modeReglement: 'virement' as const, numero: id
});
const AUJOURDHUI = dateISO('2026-11-17');

/**
 * CE QUE LE CALENDRIER CONTIENT : LES DOUZE MOIS À VENIR.
 */
describe('contenu du calendrier', () => {
  const compte = faits({
    recettes: [recette('a', '2026-10-10', 9000), recette('b', '2024-05-01', 40000)],
    missions: [{
      id: 'mission-studio-demo-confidentiel', clientId: null, clientNom: 'Studio Démo Confidentiel',
      description: 'Refonte pour Studio Démo Confidentiel', tjm: euros(500), statut: 'active', entites: [],
      debut: dateISO('2026-09-01'), fin: dateISO('2027-01-29')
    }],
    pieces: [{
      id: 'piece-demandee', sorte: 'vigilance', libelle: 'Demandée par Studio Démo Confidentiel',
      obtenueLe: dateISO('2026-08-03'), valableJusquau: null, provisoire: false
    }]
  });
  const evenements = evenementsDuCalendrier(compte, AUJOURDHUI);
  const titres = evenements.map((e) => e.titre);

  it('porte les obligations à venir, une fin de mission, une pièce qui expire', () => {
    expect(titres.some((t) => t.startsWith('URSSAF, T4 2026'))).toBe(true);
    expect(titres).toContain('Fin de mission');
    expect(titres).toContain('Attestation de vigilance URSSAF');
    expect(evenements.find((e) => e.titre === 'Attestation de vigilance URSSAF')?.date).toBe('2027-02-03');
  });

  it('ne garde que les douze mois qui viennent', () => {
    for (const e of evenements) {
      expect(e.date >= AUJOURDHUI).toBe(true);
      expect(e.date <= '2027-11-17').toBe(true);
    }
  });

  // Décision du 17/11 : les montants estimés y sont, marqués « ≈ ».
  it('dit le montant estimé, marqué « ≈ »', () => {
    expect(titres.find((t) => t.startsWith('URSSAF, T4 2026'))).toMatch(/· ≈ \d/u);
  });

  // Un agenda se synchronise chez un tiers.
  it('ne nomme aucun client, ni par un libellé, ni par une description, ni par un identifiant', () => {
    const ics = calendrierDesObligations(compte, new Date('2026-11-17T09:00:00Z'), AUJOURDHUI);
    expect(ics).not.toMatch(/Studio|Confidentiel/u);
    expect(ics.replace(/\r\n /gu, '')).not.toMatch(/studio-demo/u);
  });

  it('prévient trois jours avant chaque événement', () => {
    expect(evenements.every((e) => e.rappelJours === 3)).toBe(true);
  });
});

/**
 * AUCUN JOUR INVENTÉ.
 *
 * Une CA3 sans nom d'exploitant, une déclaration de revenus d'une année non
 * publiée n'ont pas de jour : un agenda prendrait un jour inventé pour vrai.
 * Une date calculée le dit.
 */
describe('dates du calendrier', () => {
  const autoliquidation = (nomExploitant: string) => faits({
    depenses: [{
      id: 'logiciel', libelle: 'Logiciel', fournisseur: 'Éditeur', provenance: 'ue', montantTtc: euros(145),
      tauxTva: ratio(0), payeeLe: dateISO('2026-11-05'), justificatifId: 'p', rapprochement: 'sans_banque'
    }]
  }, { nomExploitant, codePostal: '33000' });

  it('écarte une CA3 dont le jour manque, et une déclaration de revenus non publiée', () => {
    const titres = evenementsDuCalendrier(autoliquidation(''), AUJOURDHUI).map((e) => e.titre);
    expect(titres.some((t) => t.startsWith('TVA sur un achat'))).toBe(false);
    expect(titres.some((t) => t.startsWith('Déclaration des revenus'))).toBe(false);
  });

  it('dit « date calculée » sur une date que l’espace professionnel corrige', () => {
    const ca3 = evenementsDuCalendrier(autoliquidation('Durand'), AUJOURDHUI)
      .find((e) => e.titre.startsWith('TVA sur un achat'));
    expect(ca3?.date).toBe('2026-12-16');
    expect(ca3?.description).toMatch(/date calculée/u);
  });

  it('dit « date calculée » même quand le détail ne le dit pas', () => {
    const redevable = faits(
      { recettes: [{ ...recette('a', '2026-11-05', 1000), tvaCollectee: euros(200) }] },
      { tvaDepuis: mois('2026-01'), regimeTva: 'reel_normal', nomExploitant: 'Durand', codePostal: '33000' }
    );
    const ca3 = evenementsDuCalendrier(redevable, AUJOURDHUI).find((e) => e.titre.startsWith('TVA, novembre 2026'));
    expect(ca3?.date).toBe('2026-12-16');
    expect(ca3?.description).toMatch(/Date calculée/u);
  });

  // Un second import remplace les événements au lieu de les doubler.
  it('garde des identifiants stables, muets et distincts', () => {
    const a = evenementsDuCalendrier(autoliquidation('Durand'), AUJOURDHUI).map((e) => e.uid);
    const b = evenementsDuCalendrier(autoliquidation('Durand'), AUJOURDHUI).map((e) => e.uid);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
    expect(uidMuet('mission:studio-demo')).toMatch(/^freel-[0-9a-f]{16}$/u);
  });
});
