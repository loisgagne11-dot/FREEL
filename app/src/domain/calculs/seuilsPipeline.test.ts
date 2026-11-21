import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../types';
import { franchissementParLePipeline, joursFacturablesAvantSeuil } from './seuilsPipeline';

const attendu = (m: string, montant: number) => ({ mois: mois(m), montant: euros(montant) });

/**
 * LES SEUILS FRANCHIS PAR CE QUI EST ÉMIS ET SIGNÉ (lot 49).
 *
 * Le rythme de l'encaissé prolongé ignore la mission signée qui démarre en
 * septembre ; ce calcul-ci n'ignore qu'elle seule — ce qui n'est pas signé.
 */
describe('le franchissement par le pipeline', () => {
  it('tombe le mois où l’encaissé plus l’attendu atteint le seuil', () => {
    const f = franchissementParLePipeline(euros(30_000), euros(37_500),
      [attendu('2026-07', 4_000), attendu('2026-08', 4_000), attendu('2026-09', 4_000)]);
    expect(f).toEqual({ statut: 'prevu', mois: '2026-08' });
  });

  it('dit « non atteint » quand l’attendu de l’année n’y suffit pas', () => {
    expect(franchissementParLePipeline(euros(10_000), euros(37_500), [attendu('2026-12', 5_000)]))
      .toEqual({ statut: 'non_atteint' });
  });

  it('dit « déjà dépassé » sans rien prévoir', () => {
    expect(franchissementParLePipeline(euros(40_000), euros(37_500), [])).toEqual({ statut: 'depasse' });
  });
});

describe('les jours facturables avant le seuil', () => {
  const calcul = (tjms: readonly number[], dejaCompte = 22_720) => joursFacturablesAvantSeuil({
    seuil: euros(37_500), dejaCompte: euros(dejaCompte), tjms: tjms.map((t) => euros(t)),
    mois: mois('2026-06'), aujourdhui: dateISO('2026-06-10')
  });

  /*
   * La planche dit « ◇ encore 28 jours facturables » pour 22 720 € sur
   * 37 500 € à 520 € : 28,4 jours, et le vingt-neuvième franchit. Arrondir
   * au plus proche annoncerait un jour de trop.
   */
  it('divise le reste par le tarif moyen des missions signées, à l’inférieur', () => {
    const j = calcul([520]);
    expect(j.statut).toBe('hypothese');
    expect(j.statut !== 'refuse' && j.valeur).toBe(28);
    const deux = calcul([500, 540]);
    expect(deux.statut !== 'refuse' && deux.valeur).toBe(28);
    // 29,56 jours à 500 € : vingt-neuf, pas trente.
    const cinqCents = calcul([500]);
    expect(cinqCents.statut !== 'refuse' && cinqCents.valeur).toBe(29);
  });

  /* Un tarif nul n'est pas un tarif : diviser par lui annoncerait l'infini. */
  it('s’abstient, avec son motif, sans mission signée qui porte un tarif', () => {
    const j = calcul([0]);
    expect(j.statut).toBe('refuse');
    expect(j.statut === 'refuse' && j.motif).toMatch(/tarif journalier/);
  });

  it('ne compte pas en négatif un seuil déjà franchi', () => {
    const j = calcul([520], 40_000);
    expect(j.statut !== 'refuse' && j.valeur).toBe(0);
  });
});
