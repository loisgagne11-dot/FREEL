import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import { moisDeclares, periodesADeclarer } from '../domain/calculs/declarations';
import { type Faits, faitsVides } from './schema';
import { etatPilote, recettesEncaissees } from './selecteurs';
import { aTraiter, montantDeclaration } from './selecteurs.aTraiter';
import type { Recette } from './schema';

const recetteEncaissee = (id: string, le: string, montant: number): Recette => ({
  id, clientNom: 'Client', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO(le), encaisseeLe: dateISO(le), modeReglement: 'virement', numero: id
});

/**
 * LE PILOTE NE RÉCLAME QUE CE QUE L'ÉCHÉANCIER PERMET DE DÉCLARER.
 *
 * Deux fonctions du même nom, deux règles : le Pilote annonçait quatre
 * périodes en retard, l'échéancier n'en montrait qu'une, et les trois autres
 * ne pouvaient jamais être marquées déclarées. Ce test tient l'accord entre
 * les deux écrans, sur un compte qui a des trimestres vides.
 */
describe('accord du Pilote et de l’échéancier', () => {
  const faits: Faits = {
    ...faitsVides(),
    entreprise: {
      ...faitsVides().entreprise,
      debutActivite: dateISO('2025-10-01'),
      urssafPeriodicite: 'trimestriel'
    },
    recettes: [{
      id: 'r1', clientNom: 'Client démo', libelle: 'Mission', montant: euros(4000),
      emiseLe: dateISO('2026-05-01'), encaisseeLe: dateISO('2026-05-12'),
      modeReglement: 'virement', numero: '2026-001'
    }]
  };
  const maintenant = new Date('2026-08-15T10:00:00');

  it('compte autant de périodes à déclarer que l’échéancier en propose', () => {
    const sujet = aTraiter(faits, maintenant).find((s) => s.id === 'periodes-a-declarer');
    const declarables = periodesADeclarer(
      recettesEncaissees(faits), 'trimestriel', moisDeclares(faits.periodesDeclarees), '2026-08-15', mois('2025-10')
    ).filter((p) => p.close && !p.declaree);

    // T4 2025 et T1 2026 à zéro, T2 2026 avec la recette : trois périodes.
    expect(declarables.map((p) => p.id)).toEqual(['2026-T2', '2026-T1', '2025-T4']);
    expect(sujet?.nombre).toBe(declarables.length);
  });

  it('éteint l’alerte une fois toutes les périodes marquées', () => {
    const toutDeclare: Faits = {
      ...faits,
      periodesDeclarees: periodesADeclarer(
        recettesEncaissees(faits), 'trimestriel', [], '2026-08-15', mois('2025-10')
      ).filter((p) => p.close).flatMap((p) => p.mois).map((m) => ({ mois: m, declareeLe: null }))
    };
    expect(aTraiter(toutDeclare, maintenant).some((s) => s.id === 'periodes-a-declarer')).toBe(false);
  });
});

/**
 * CE QUE COÛTE LA DÉCLARATION : LA MÊME RÈGLE QUE LE VOLET « À PROVISIONNER ».
 *
 * Le Pilote et l'échéancier annoncent ce montant ; il doit valoir, au centime,
 * ce que la provision gardait pour ces encaissements — sinon on déclare un
 * chiffre et on en a provisionné un autre.
 */
describe('montant d’une déclaration', () => {
  const base = (): Faits => ({
    ...faitsVides(),
    entreprise: {
      ...faitsVides().entreprise, debutActivite: dateISO('2025-01-01'),
      versementLiberatoire: true, urssafPeriodicite: 'trimestriel'
    },
    recettes: [
      recetteEncaissee('a', '2026-04-14', 5200), recetteEncaissee('b', '2026-05-28', 3600),
      recetteEncaissee('c', '2026-07-02', 9999)
    ]
  });

  it('vaut le volet « à provisionner » des encaissements de la période', () => {
    const f = { ...base(), recettes: base().recettes.slice(0, 2) };
    const m = montantDeclaration(f, [mois('2026-04'), mois('2026-05'), mois('2026-06')]);
    const provision = etatPilote(f, [], new Date('2026-06-20T09:00:00Z')).voletAProvisionner;
    expect(m.statut).toBe('publie');
    expect(m.statut === 'refuse' ? null : m.valeur).toBeCloseTo(provision, 2);
  });

  it('vaut un vrai zéro pour une période sans encaissement', () => {
    const m = montantDeclaration(base(), [mois('2026-01'), mois('2026-02'), mois('2026-03')]);
    expect(m.statut === 'refuse' ? null : m.valeur).toBe(0);
  });

  it('arrive avec le sujet de la déclaration', () => {
    const declarees = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07',
      '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']
      .map((m) => ({ mois: mois(m), declareeLe: null }));
    const s = aTraiter({ ...base(), periodesDeclarees: declarees }, new Date('2026-07-10T09:00:00Z'))
      .find((x) => x.id === 'periodes-a-declarer');
    expect(s?.gravite).toBe('a_faire');
    expect(typeof s?.donnees['montant']).toBe('number');
  });
});
