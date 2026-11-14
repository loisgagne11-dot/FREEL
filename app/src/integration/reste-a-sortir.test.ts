import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NATURES_DETTE } from '../domain/calculs/provisions';
import { completerFaits } from '../state/schema.migrations';
import { detailDeLaDette, resteASortir } from '../state/selecteurs.dette';
import { etatPilote } from '../state/selecteurs';
import { chargerJeu, le } from '../test/jeu-d-essai';

/**
 * « RESTE À SORTIR » : UN SEUL TOTAL (lot 33, décision 8).
 *
 * La vignette des enveloppes lisait les provisions ; le détail de la dette
 * additionnait ses lignes. Pour l'impôt, la TVA et la CFP, les deux ne
 * tombaient pas d'accord — même mot, deux chiffres. Le test d'accord porte
 * sur les deux jeux complets, nature par nature.
 */
const DEMO = completerFaits(JSON.parse(readFileSync(join(import.meta.dirname, '../../public/jeu-de-demonstration.json'), 'utf8')));
const CAS = [
  { nom: 'jeu d’essai, 15/12/2026', faits: chargerJeu(), maintenant: le(2026, 12, 15) },
  { nom: 'démonstration, 10/06/2026', faits: DEMO, maintenant: new Date('2026-06-10T09:00:00Z') }
];

describe.each(CAS)('reste à sortir — $nom', ({ faits, maintenant }) => {
  it('la source est le total de provisions du Pilote, et sa ventilation s’y additionne', () => {
    const r = resteASortir(faits, maintenant);
    expect(r.total).toBe(etatPilote(faits, faits.echeances, maintenant).tresorerie.provisions);
    const somme = NATURES_DETTE.reduce((t, n) => t + r.parNature[n], 0);
    expect(somme).toBeCloseTo(r.total, 2);
  });

  it('le détail de chaque nature lit ce même total, et ses lignes l’expliquent au centime', () => {
    const r = resteASortir(faits, maintenant);
    for (const nature of NATURES_DETTE) {
      const d = detailDeLaDette(faits, nature, maintenant);
      expect(d.reste).toBe(r.parNature[nature]);
      expect(Math.abs(d.ecart)).toBeLessThan(0.02);
    }
  });
});

/**
 * « Lu, jamais recalculé » : la source ventile son total au centime, par les
 * plus forts restes. Sur 1,50 € encaissés, l'URSSAF (0,384 €) et la CFP
 * (0,003 €) s'arrondiraient chacune vers le bas ; leur total, non — la source
 * donne le centime à l'URSSAF (0,39 €). Un détail qui referait sa somme
 * afficherait 0,38 € sous une vignette à 0,39 €.
 */
it('le détail affiche la ventilation de la source, pas la somme arrondie de ses lignes', () => {
  const jeu = chargerJeu();
  const faits = {
    ...jeu,
    echeances: [],
    periodesDeclarees: [],
    recettes: [{
      id: 'r-150', clientNom: 'Client démo', libelle: 'Mission', montant: 1.5,
      emiseLe: '2026-11-02', encaisseeLe: '2026-11-20', modeReglement: 'virement', numero: '2026-900'
    }]
  } as unknown as typeof jeu;
  const maintenant = le(2026, 12, 15);
  const source = resteASortir(faits, maintenant).parNature.urssaf;
  expect(source).toBe(0.39);
  expect(detailDeLaDette(faits, 'urssaf', maintenant).reste).toBe(source);
});
