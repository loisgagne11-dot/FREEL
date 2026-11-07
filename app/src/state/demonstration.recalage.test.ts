import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { type DateISO, dateISO, mois } from '../domain/types';
import { verifierConformite } from '../domain/calculs/livreRecettes';
import { tauxImpotEtContributions } from '../domain/bareme/impot';
import { voletAProvisionner } from '../domain/calculs/provisions';
import { motifRefusFaits, type Faits } from './schema';
import { completerFaits } from './schema.migrations';
import {
  aTraiter, etatPilote, periodesUrssafEffectives, recettesEncaissees, regimeDe, sousAcreLe
} from './selecteurs';
import { ANCRE_DEMONSTRATION, recalerDemonstration, recalerJeuBrut } from './demonstration.recalage';

/** Le jeu RÉEL, tel qu'il est servi — pas une copie écrite dans le test. */
const brut: unknown = JSON.parse(
  readFileSync(new URL('../../public/jeu-de-demonstration.json', import.meta.url), 'utf8')
);
const demo = completerFaits(brut);
const a9h = (j: string) => new Date(`${j}T09:00:00Z`);
const sujets = (f: Faits, j: string) => aTraiter(f, a9h(j)).map((s) => s.id);

/**
 * LA DÉMONSTRATION MONTRE UNE ACTIVITÉ SEREINE.
 *
 * Elle annonçait quatre déclarations en retard et 0,1 mois d'autonomie :
 * aucune période de 2025 n'était déclarée, et l'URSSAF du deuxième trimestre
 * était saisie avant d'être déclarée — comptée une fois en échéance, une
 * seconde fois en provision sur les mêmes encaissements.
 */
describe('le jeu de démonstration, au 10 juin 2026', () => {
  it('n’a qu’un sujet à traiter : la facture à relancer', () => {
    const ids = sujets(demo, ANCRE_DEMONSTRATION);
    expect(ids).toContain('factures-en-retard');
    expect(ids).not.toContain('periodes-a-declarer');
    // Le reste est de l'information réglementaire, datée par la loi.
    expect(aTraiter(demo, a9h(ANCRE_DEMONSTRATION)).filter((s) => s.gravite !== 'information'))
      .toHaveLength(1);
  });

  it('laisse plusieurs mois d’autonomie, provisions couvertes', () => {
    const e = etatPilote(demo, demo.echeances, a9h(ANCRE_DEMONSTRATION));
    expect(e.autonomie).toBeGreaterThanOrEqual(3);
    expect(e.tresorerie.solde).toBeGreaterThan(e.tresorerie.provisions + demo.reserve);
  });

  /**
   * Chaque URSSAF payée vaut ce que l'application calcule sur les
   * encaissements de son trimestre : écrits à la main, les montants ne
   * correspondaient à aucune base.
   */
  it('paie chaque trimestre déclaré au montant que l’application calcule', () => {
    const urssaf = demo.echeances.filter((e) => e.nature === 'urssaf');
    expect(urssaf.length).toBeGreaterThan(0);
    for (const e of urssaf) {
      const fin = mois(e.echeanceLe.slice(0, 7));
      const trimestre = [-3, -2, -1].map((k) => {
        const t = Number(fin.slice(0, 4)) * 12 + Number(fin.slice(5, 7)) - 1 + k;
        return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
      });
      const base = recettesEncaissees(demo).filter((r) => trimestre.includes(r.encaisseeLe.slice(0, 7)));
      const taux = tauxImpotEtContributions(regimeDe(demo), mois(trimestre[2] as string), 'BNC');
      const attendu = voletAProvisionner(base, { mois: [] }, {
        typeActivite: 'BNC', sousAcreLe: sousAcreLe(demo),
        periodesUrssaf: periodesUrssafEffectives(demo),
        tauxImpotEtContributions: taux.statut === 'refuse' ? 0 : taux.valeur
      }).montant;
      expect(e.montant).toBeCloseTo(attendu, 2);
    }
  });
});

/**
 * RECALÉE, ELLE RESTE SEREINE — QUEL QUE SOIT LE JOUR OÙ ON LA CHARGE.
 *
 * Figée au 10 juin, elle vieillissait en retards qu'elle n'avait pas :
 * chargée en novembre, deux trimestres « en retard », trois factures
 * impayées, un compte immobile depuis juin.
 */
describe('recaler la démonstration sur la date du jour', () => {
  const jours: DateISO[] = [];
  for (let k = 0; k < 24; k += 1) {
    jours.push(dateISO(new Date(Date.UTC(2026, 5, 10 + k * 33)).toISOString().slice(0, 10)));
  }

  it('ne change rien au jour de l’ancre, ni avant', () => {
    expect(recalerDemonstration(demo, dateISO(ANCRE_DEMONSTRATION))).toBe(demo);
    expect(recalerDemonstration(demo, dateISO('2026-05-01'))).toBe(demo);
  });

  it('avance par semaines entières : un rythme écrit par jour de semaine reste juste', () => {
    const f = recalerDemonstration(demo, dateISO('2026-11-07'));
    const avant = demo.recettes.find((r) => r.id === 'rec-023')?.encaisseeLe as string;
    const apres = f.recettes.find((r) => r.id === 'rec-023')?.encaisseeLe as string;
    const ecart = (Date.parse(apres) - Date.parse(avant)) / 86_400_000;
    expect(ecart % 7).toBe(0);
    expect(ecart).toBeGreaterThan(140);
    expect(Date.parse(apres)).toBeLessThanOrEqual(Date.parse('2026-11-07'));
  });

  it.each(jours)('le %s : rien en retard que la facture à relancer, de l’autonomie', (jour) => {
    const f = recalerDemonstration(demo, jour);
    expect(motifRefusFaits(f)).toBeNull();

    const ids = sujets(f, jour);
    expect(ids).not.toContain('periodes-a-declarer');
    expect(ids).not.toContain('tva-a-regulariser');
    expect(ids).not.toContain('seuil-tva');
    expect(aTraiter(f, a9h(jour)).filter((s) => s.gravite === 'retard').map((s) => s.id))
      .toEqual(['factures-en-retard']);

    const e = etatPilote(f, f.echeances, a9h(jour));
    expect(e.tresorerie.versable).toBeGreaterThan(0);
    expect(e.autonomie).toBeGreaterThanOrEqual(1.5);
  });

  /**
   * La numérotation est annuelle : une facture de 2025 décalée en 2026 ne
   * peut pas garder son numéro 2025, ni laisser un trou dans la suite.
   */
  it.each(jours)('le %s : une suite de numéros continue, à l’année d’émission', (jour) => {
    const f = recalerDemonstration(demo, jour);
    expect(verifierConformite(f.recettes).map((e) => e.nature))
      .not.toContain('numero_manquant_dans_la_suite');
    for (const r of f.recettes) {
      if (r.emiseLe !== null) expect(r.numero.slice(0, 4)).toBe(r.emiseLe.slice(0, 4));
    }
  });

  /**
   * Décalé, le début d'activité tombait dans l'année de la plupart des
   * encaissements : seuil de TVA proratisé franchi, et la démonstration
   * réclamait la TVA de factures émises sans.
   */
  it('garde le début d’activité', () => {
    expect(recalerDemonstration(demo, dateISO('2027-01-12')).entreprise.debutActivite)
      .toBe(demo.entreprise.debutActivite);
  });
});

describe('recaler le fichier tel qu’il est servi', () => {
  it('laisse passer tel quel un bloc que le schéma refuse', () => {
    const refuse = { version: 999 };
    expect(recalerJeuBrut(refuse, dateISO('2026-11-07'))).toBe(refuse);
  });

  it('charge la démonstration même si le recalage échoue', () => {
    const bizarre = { version: 10, recettes: [{}, {}], depenses: [], missions: [{}], clients: [{}] };
    expect(() => recalerJeuBrut(bizarre, dateISO('2026-11-07'))).not.toThrow();
  });
});
