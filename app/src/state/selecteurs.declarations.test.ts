import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import { periodesADeclarer } from '../domain/calculs/declarations';
import { type Faits, faitsVides } from './schema';
import { aTraiter, recettesEncaissees } from './selecteurs';

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
      recettesEncaissees(faits), 'trimestriel', faits.periodesDeclarees, '2026-08-15', mois('2025-10')
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
      ).filter((p) => p.close).flatMap((p) => p.mois)
    };
    expect(aTraiter(toutDeclare, maintenant).some((s) => s.id === 'periodes-a-declarer')).toBe(false);
  });
});
