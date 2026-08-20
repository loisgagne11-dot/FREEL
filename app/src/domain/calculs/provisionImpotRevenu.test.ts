import { describe, expect, it } from 'vitest';
import { type Euros, type Mois, euros, mois } from '../types';
import {
  type EntreeProvisionIr, type ProvisionImpotRevenu,
  provisionImpotRevenu
} from './provisionImpotRevenu';

/**
 * Les cas se calent sur 2024, seul millésime de barème PUBLIÉ : c'est le seul
 * moyen d'avoir des montants attendus vérifiables à la main plutôt que des
 * chiffres recopiés de la sortie du code.
 */
const entree = (modifications: Partial<EntreeProvisionIr> = {}): EntreeProvisionIr => ({
  annee: 2024,
  moisCourant: mois('2024-06') as Mois,
  typeActivite: 'BNC',
  caEncaisseConstate: euros(60000),
  caAttendu: euros(0),
  foyer: {
    partsFiscales: 1,
    autresRevenusFoyer: euros(0),
    versementPerDeductible: euros(0)
  },
  acomptesPasSaisis: euros(0),
  ...modifications
});

function valeur(modifications: Partial<EntreeProvisionIr> = {}): ProvisionImpotRevenu {
  const r = provisionImpotRevenu(entree(modifications));
  if (r.statut === 'refuse') throw new Error(`refus inattendu : ${r.motif}`);
  return r.valeur;
}

describe('provision d\'impôt sur le revenu', () => {
  /**
   * 60 000 € encaissés, abattement BNC de 34 % → 39 600 € imposables.
   * Barème 2024 : 11 % de 11 497 à 29 315, puis 30 % au-delà.
   *   (29 315 − 11 497) × 11 %  = 1 959,98
   *   (39 600 − 29 315) × 30 %  = 3 085,50
   *                     total   = 5 045,48
   */
  it('applique l’abattement forfaitaire puis le barème progressif', () => {
    const v = valeur();
    expect(v.revenuImposableMicro).toBe(39600);
    expect(v.impotFoyer).toBe(5045.48);
    expect(v.impotMicro).toBe(5045.48);
  });

  /**
   * LA CONDITION SANS LAQUELLE L'ANOMALIE E ROUVRE.
   *
   * L'acompte de prélèvement à la source est un fait saisi, déjà porté par le
   * volet 1 des provisions. Si cette soustraction sautait, la même dette
   * serait provisionnée deux fois — c'est exactement la double imposition que
   * l'audit avait relevée, revenue sous un autre nom.
   */
  it('retranche les acomptes de prélèvement à la source déjà saisis', () => {
    expect(valeur({ acomptesPasSaisis: euros(2000) }).resteAProvisionner).toBe(3045.48);
    // Payés ou non : le volet 1 reprend les non payés, la somme des deux
    // volets vaut alors l'impôt de l'année moins ce qui est déjà décaissé.
    expect(valeur({ acomptesPasSaisis: euros(6000) }).resteAProvisionner).toBe(0);
  });

  /**
   * L'IMPÔT DU FOYER N'EST PAS L'IMPÔT DU MICRO.
   *
   * Avec 39 600 € de micro et 39 600 € d'autres revenus, le foyer paie
   * beaucoup plus — la tranche à 30 % puis 41 % — mais la moitié seulement de
   * cet impôt est imputable au micro. Provisionner l'impôt du foyer entier
   * ferait mettre de côté l'impôt du conjoint.
   */
  it('n’attribue au micro que sa quote-part de l’impôt du foyer', () => {
    const v = valeur({ foyer: { partsFiscales: 1, autresRevenusFoyer: euros(39600), versementPerDeductible: euros(0) } });
    expect(v.impotMicro).toBeLessThan(v.impotFoyer);
    expect(v.impotMicro).toBeCloseTo(v.impotFoyer / 2, 2);
  });

  /**
   * Les autres revenus ne s'ajoutent pas linéairement : ils poussent le micro
   * dans une tranche supérieure. Les ignorer sous-estime l'impôt, ce qui est
   * le sens dangereux — on se verse l'argent de l'impôt.
   */
  it('les autres revenus du foyer relèvent la tranche du micro', () => {
    const seul = valeur().impotMicro;
    const accompagne = valeur({
      foyer: { partsFiscales: 1, autresRevenusFoyer: euros(39600), versementPerDeductible: euros(0) }
    }).impotMicro;
    expect(accompagne).toBeGreaterThan(seul);
  });

  it('le versement PER déduit du revenu imposable du foyer', () => {
    const sans = valeur().impotMicro;
    const avec = valeur({
      foyer: { partsFiscales: 1, autresRevenusFoyer: euros(0), versementPerDeductible: euros(10000) }
    }).impotMicro;
    expect(avec).toBeLessThan(sans);
  });

  /**
   * Le quotient familial : le barème s'applique à UNE part et le résultat se
   * remultiplie. L'appliquer au revenu entier ferait payer la tranche haute à
   * un foyer qui la divise.
   */
  it('divise le revenu par les parts avant d’appliquer le barème', () => {
    const unePart = valeur().impotFoyer;
    const deuxParts = valeur({
      foyer: { partsFiscales: 2, autresRevenusFoyer: euros(0), versementPerDeductible: euros(0) }
    }).impotFoyer;
    expect(deuxParts).toBeLessThan(unePart);
    // 39 600 / 2 = 19 800, entièrement dans la tranche à 11 % :
    //   (19 800 − 11 497) × 11 % × 2 = 1 826,66
    expect(deuxParts).toBe(1826.66);
  });

  /**
   * SANS PARTS, ON REFUSE.
   *
   * Supposer une part est le piège : le foyer de trois parts verrait un impôt
   * du simple au double de la réalité, présenté comme un résultat. Une
   * provision d'impôt fausse fait se verser de l'argent qu'on doit.
   */
  it('refuse tant que le nombre de parts n’est pas renseigné', () => {
    const r = provisionImpotRevenu(entree({
      foyer: { partsFiscales: null, autresRevenusFoyer: euros(0), versementPerDeductible: euros(0) }
    }));
    expect(r.statut).toBe('refuse');
    expect(r.statut === 'refuse' && r.motif).toMatch(/parts/i);
  });

  it('additionne le constaté et les encaissements attendus dans l’assiette', () => {
    const v = valeur({ caEncaisseConstate: euros(40000), caAttendu: euros(20000) });
    expect(v.assiette).toBe(60000);
    expect(v.impotMicro).toBe(valeur().impotMicro);
  });

  /**
   * L'ABSENCE DE PIPELINE NE FAIT PAS RETOMBER LA PROVISION À ZÉRO.
   *
   * Refuser laisserait la ligne « impôt » du volet 2 à zéro, c'est-à-dire
   * l'état qu'on répare. Le montant calculé sur le seul encaissé est un
   * PLANCHER — l'impôt dû sur de l'argent déjà reçu — et il le DIT.
   */
  it('calcule un plancher quand les encaissements à venir ne sont pas fournis, et le dit', () => {
    const v = valeur({ caEncaisseConstate: euros(40000), caAttendu: null });
    expect(v.assiette).toBe(40000);
    expect(v.impotMicro).toBeGreaterThan(0);
    expect(v.impotMicro).toBeLessThan(valeur().impotMicro);
    expect(v.ignore).toContain('encaissements_a_venir_non_fournis');
  });

  it('dit ce qu’il ignore : autres revenus et PER non renseignés', () => {
    const v = valeur({
      foyer: { partsFiscales: 1, autresRevenusFoyer: null, versementPerDeductible: null }
    });
    expect(v.ignore).toContain('autres_revenus_foyer_non_renseignes');
    expect(v.ignore).toContain('versement_per_non_renseigne');
    // Toujours dites, celles-là : elles ne dépendent d'aucune saisie.
    expect(v.ignore).toContain('plafonnement_quotient_familial');
    expect(v.ignore).toContain('decote_et_reductions_d_impot');
  });

  it('répartit le reste sur les mois restants, mois courant inclus', () => {
    const v = valeur({ moisCourant: mois('2024-10') as Mois });
    expect(v.moisRestants).toBe(3);
    expect(v.parMoisRestant).toBe(euros(v.resteAProvisionner / 3));
  });

  /**
   * Le barème d'une année non publiée est repris de la dernière connue : c'est
   * une prévision légitime, mais elle ne doit jamais passer pour un fait.
   */
  it('rend une hypothèse, et le dit, quand le barème de l’année n’est pas publié', () => {
    const r = provisionImpotRevenu(entree({ annee: 2026, moisCourant: mois('2026-06') as Mois }));
    expect(r.statut).toBe('hypothese');
    expect(r.statut !== 'refuse' && r.valeur.ignore).toContain('bareme_de_l_annee_non_publie');
  });

  it('refuse un mois antérieur au plus ancien barème connu plutôt que de l’extrapoler', () => {
    const r = provisionImpotRevenu(entree({ annee: 2019, moisCourant: mois('2019-06') as Mois }));
    expect(r.statut).toBe('refuse');
  });

  it('ne rend jamais un reste à provisionner négatif', () => {
    const v = valeur({ caEncaisseConstate: euros(0), caAttendu: euros(0), acomptesPasSaisis: euros(500) });
    expect(v.resteAProvisionner).toBe(0);
    expect(v.impotMicro).toBe(0);
  });

  it('un chiffre d’affaires nul ne produit aucun impôt et aucune division par zéro', () => {
    const v = valeur({ caEncaisseConstate: euros(0) as Euros, caAttendu: euros(0) });
    expect(v.impotMicro).toBe(0);
    expect(Number.isFinite(v.impotMicro)).toBe(true);
  });
});
