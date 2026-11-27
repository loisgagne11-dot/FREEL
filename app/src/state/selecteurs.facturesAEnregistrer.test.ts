import { describe, expect, it } from 'vitest';
import { compteursParEcran } from '../domain/calculs/aTraiter';
import { formuler } from '../domain/calculs/aTraiter.libelles';
import { dateISO, euros, mois } from '../domain/types';
import { adresseDuSujet } from '../ui/screens/Pilote.decisions';
import { type Faits, type Mission, type Recette, faitsVides } from './schema';
import { aTraiter } from './selecteurs.aTraiter';

const LE_14_OCTOBRE = new Date('2026-10-14T09:00:00');

const mission: Mission = {
  id: 'm1', clientId: null, clientNom: 'Client France', description: 'Mission A',
  tjm: euros(500), debut: dateISO('2026-08-01'), fin: dateISO('2026-12-31'), statut: 'active',
  entites: [{
    id: 'm1-co', nom: 'Client France', couleur: '', adresse: '', contact: '', email: '', telephone: '',
    rythmes: [{ du: dateISO('2026-08-01'), au: dateISO('2026-12-31'), parJour: { lun: 1, mar: 1 }, tjm: euros(500) }],
    ajustements: {}
  }]
};

const faits = (emissionFactures: 'freel' | 'externe', recettes: readonly Recette[] = []): Faits => ({
  ...faitsVides(),
  entreprise: { ...faitsVides().entreprise, emissionFactures },
  missions: [mission],
  recettes
});

const sujetsDe = (f: Faits) => aTraiter(f, LE_14_OCTOBRE).filter((s) => s.id.startsWith('facture-a-enregistrer-'));

/**
 * LA MÊME LISTE ENTRE DANS « À FAIRE », UN SUJET PAR MOIS. Le facturier ne se
 * consulte qu'en fin de mois : sans le Pilote, août et septembre attendraient
 * leur facture sans que rien ne le rappelle.
 */
describe('les mois à enregistrer, dans « à faire »', () => {
  it('un sujet par mois en attente, sous Factures, à faire et non en retard', () => {
    const sujets = sujetsDe(faits('externe'));
    expect(sujets.map((s) => s.id)).toEqual(['facture-a-enregistrer-2026-08', 'facture-a-enregistrer-2026-09']);
    expect(sujets.every((s) => s.ecran === 'factures' && s.gravite === 'a_faire')).toBe(true);
    expect(compteursParEcran(sujets).factures).toBe(2);

    const [aout] = sujets;
    if (aout === undefined) return;
    expect(formuler(aout).intitule).toBe('Enregistrer la facture d’août 2026');
    // Neuf journées : cinq lundis et quatre mardis, à 500 €.
    expect(formuler(aout).contexte.replace(/[\u202f\u00a0]/gu, ' '))
      .toMatch(/^Client France · 4 500 € HT d’après le planning/u);
    expect(adresseDuSujet(aout.id, aout.ecran, aout.donnees)).toBe('#/factures');
  });

  /* Un mois enregistré sort aussi du Pilote : les deux listes n'en font qu'une. */
  it('le mois enregistré en sort', () => {
    const recette: Recette = {
      id: 'r1', clientNom: 'Client France', libelle: 'Mission A — août 2026', montant: euros(4000),
      emiseLe: dateISO('2026-09-03'), encaisseeLe: null, modeReglement: null, numero: 'F-0042',
      emisePar: 'externe', moisFacture: mois('2026-08')
    };
    expect(sujetsDe(faits('externe', [recette])).map((s) => s.id)).toEqual(['facture-a-enregistrer-2026-09']);
  });

  /* Avec FREEL, chaque brouillon du mois propose déjà « Émettre » : le sujet
     doublerait le geste, et la pastille de Factures compterait des mois que
     personne n'a demandé d'enregistrer. */
  it('se tait quand FREEL émet lui-même', () => {
    expect(sujetsDe(faits('freel'))).toEqual([]);
  });
});
