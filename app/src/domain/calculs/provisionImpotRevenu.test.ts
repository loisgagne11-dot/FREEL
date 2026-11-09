import { describe, expect, it } from 'vitest';
import { type Euros, type Mois, euros, mois } from '../types';
import {
  type EntreeProvisionIr, type ProvisionImpotRevenu,
  provisionImpotRevenu
} from './provisionImpotRevenu';
import { comparerRegimes } from './comparateurVl';

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
   * L'ACTIVITÉ COÛTE CE QU'ELLE AJOUTE À L'IMPÔT DU FOYER.
   *
   * Une part, 30 000 € d'autres revenus, 30 000 € encaissés (19 800 €
   * imposables). Barème 2024 : 8 105,48 € avec l'activité, 2 165,48 € sans —
   * l'activité coûte 5 940 €. Le prorata au taux moyen en retenait 3 223 € :
   * si la règle revenait, 2 717 € d'impôt passeraient dans « tu peux te
   * verser ». Arbitré au taux marginal le 6/11/2026.
   */
  it('impute à l’activité ce qu’elle ajoute à l’impôt du foyer', () => {
    const v = valeur({
      caEncaisseConstate: euros(30000),
      foyer: { partsFiscales: 1, autresRevenusFoyer: euros(30000), versementPerDeductible: euros(0) }
    });
    expect(v.impotFoyer).toBeCloseTo(8105.48, 2);
    expect(v.impotMicro).toBeCloseTo(5940, 2);
  });

  // Invariant n°4 : le comparateur et la provision disaient deux « impôts de
  // l'activité » différents pour le même foyer.
  it('rend le même impôt de l’activité que le comparateur', () => {
    const v = valeur({
      caEncaisseConstate: euros(30000),
      foyer: { partsFiscales: 2, autresRevenusFoyer: euros(30000), versementPerDeductible: euros(0) }
    });
    const c = comparerRegimes(euros(30000), mois('2024-06') as Mois, 'BNC', {
      parts: 2, autresRevenus: euros(30000)
    } as Parameters<typeof comparerRegimes>[3]);
    if (c.statut === 'refuse') throw new Error(c.motif);
    expect(v.impotMicro).toBeCloseTo(c.valeur.bareme, 2);
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
    //   (19 800 − 11 497) × 11 % × 2 = 1 826,66 d'impôt brut.
    // Situation non renseignée : décote d'une personne seule, la plus faible,
    //   889 − 45,25 % × 1 826,66 = 62,44 → 1 764,22.
    expect(deuxParts).toBe(1764.22);
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
    expect(v.ignore).toContain('reductions_et_credits_d_impot');
  });

  /**
   * LA DÉCOTE DÉPEND D'UNE SITUATION QUE LES PARTS NE DISENT PAS.
   *
   * Deux parts, 46 000 € d'autres revenus, 9 091 € encaissés (6 000 €
   * imposables après 34 %) : 660 € si l'on est seul, 958,65 € en couple. La
   * situation inconnue fait retenir le plus haut, et le dire.
   */
  it('retient la décote la moins favorable tant que la situation manque, et le dit', () => {
    const foyer = { partsFiscales: 2, autresRevenusFoyer: euros(46000), versementPerDeductible: euros(0) };
    const ca = { caEncaisseConstate: euros(6000 / 0.66) };
    const inconnue = valeur({ ...ca, foyer });
    const couple = valeur({ ...ca, foyer: { ...foyer, impositionCommune: true } });
    const seule = valeur({ ...ca, foyer: { ...foyer, impositionCommune: false } });

    expect(seule.impotMicro).toBe(660);
    expect(couple.impotMicro).toBe(958.65);
    expect(inconnue.impotMicro).toBe(958.65);
    expect(inconnue.ignore).toContain('situation_familiale_non_renseignee');
    expect(couple.ignore).not.toContain('situation_familiale_non_renseignee');
  });

  it('ne réclame pas la situation quand aucune décote ne joue', () => {
    // 120 000 € encaissés pour deux parts : 10 090,96 € d'impôt brut, bien
    // au-dessus des 3 249 € où la décote du couple s'éteint.
    const v = valeur({
      caEncaisseConstate: euros(120000),
      foyer: { partsFiscales: 2, autresRevenusFoyer: euros(0), versementPerDeductible: euros(0) }
    });
    expect(v.ignore).not.toContain('situation_familiale_non_renseignee');
  });

  it('compte les mois restants, mois courant inclus', () => {
    expect(valeur({ moisCourant: mois('2024-10') as Mois }).moisRestants).toBe(3);
  });

  /**
   * LE DÉFAUT DU LOT 12, SUR LE CAS FICTIF QUI L'A RÉVÉLÉ.
   *
   * 30 000 € encaissés au 30 juin, autant à venir, une part, rien d'autre.
   * Sur l'encaissé seul, l'impôt tombait au taux d'un revenu de demi-année
   * (quelques centaines d'euros) alors que l'année en coûte plus de 2 000 pour
   * ce qui est déjà entré. Si la règle sautait, le versable resterait
   * surévalué de ~2 100 € au premier semestre, puis s'effondrerait.
   */
  it('provisionne au taux de l’année projetée, pas à celui d’un revenu de demi-année', () => {
    const juin = { annee: 2026, moisCourant: mois('2026-06') as Mois, caEncaisseConstate: euros(30000) };
    const plancher = valeur({ ...juin, caAttendu: null });
    const v = valeur({ ...juin, caAttendu: euros(30000) });

    expect(v.caProjete).toBe(60000);
    expect(v.partEncaissee).toBe(0.5);
    expect(v.impotAnneeProjetee).toBe(v.impotMicro);
    expect(Math.abs(v.resteAProvisionner - v.impotAnneeProjetee * 0.5)).toBeLessThan(0.01);
    expect(v.resteAProvisionner).toBeGreaterThanOrEqual(4 * plancher.resteAProvisionner);
  });

  /** Au 31 décembre rien n'est attendu : tout est entré, l'impôt est dû en entier. */
  it('provisionne l’impôt entier, moins les acomptes, quand tout est encaissé', () => {
    const v = valeur({
      moisCourant: mois('2024-12') as Mois,
      caEncaisseConstate: euros(60000), caAttendu: euros(0),
      acomptesPasSaisis: euros(1000)
    });
    expect(v.partEncaissee).toBe(1);
    expect(v.resteAProvisionner).toBe(euros(v.impotAnneeProjetee - 1000));
    expect(v.resteSurEncaissementsAVenir).toBe(0);
  });

  /**
   * Même année projetée, argent arrivé à des rythmes différents : la provision
   * suit l'argent reçu. Si elle suivait le calendrier, 50 € reçus seraient
   * grevés de l'impôt de 59 950 € pas encore arrivés.
   */
  it('suit l’argent réellement reçu quand les encaissements sont irréguliers', () => {
    const base = { caAttendu: null as Euros | null };
    const peu = valeur({ ...base, caEncaisseConstate: euros(15000), caAttendu: euros(45000) });
    const beaucoup = valeur({ ...base, caEncaisseConstate: euros(45000), caAttendu: euros(15000) });

    expect(peu.caProjete).toBe(beaucoup.caProjete);
    expect(peu.impotAnneeProjetee).toBe(beaucoup.impotAnneeProjetee);
    expect(peu.partEncaissee).toBe(0.25);
    expect(beaucoup.partEncaissee).toBe(0.75);
    expect(Math.abs(beaucoup.resteAProvisionner - 3 * peu.resteAProvisionner)).toBeLessThan(0.02);
  });

  it('dit ce qu’il reste à mettre de côté sur les encaissements à venir', () => {
    const v = valeur({ caEncaisseConstate: euros(30000), caAttendu: euros(30000), acomptesPasSaisis: euros(500) });
    expect(Math.abs(
      v.resteAProvisionner + v.resteSurEncaissementsAVenir + 500 - v.impotAnneeProjetee
    )).toBeLessThan(0.02);
  });

  /**
   * Des encaissements attendus sont des promesses : l'ensemble cesse d'être
   * un fait. Sans eux, la provision ne repose que sur du constaté.
   */
  it('devient une hypothèse dès que les encaissements attendus contribuent, et le dit', () => {
    const avec = provisionImpotRevenu(entree({ caAttendu: euros(10000) }));
    expect(avec.statut).toBe('hypothese');
    expect(avec.statut !== 'refuse' && avec.source).toMatch(/factures émises et planning/);
    expect(avec.statut === 'hypothese' && avec.depuis).toBeTruthy();

    const sans = provisionImpotRevenu(entree({ caAttendu: euros(0) }));
    expect(sans.statut).toBe('publie');
    expect(sans.statut !== 'refuse' && sans.valeur.ignore).toContain('aucun_encaissement_attendu');
    expect(avec.statut !== 'refuse' && avec.valeur.ignore).not.toContain('aucun_encaissement_attendu');
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

/**
 * Une année close ne peut plus rien recevoir : « l'impôt montera si d'autres
 * recettes arrivent » y serait faux. Le solde de l'année précédente le portait.
 */
describe('année close', () => {
  it('ne dit pas « aucun encaissement attendu » d’une année terminée', () => {
    const base = {
      annee: 2025, moisCourant: mois('2025-12'), typeActivite: 'BNC' as const,
      caEncaisseConstate: euros(40000), caAttendu: euros(0),
      foyer: { partsFiscales: 1, autresRevenusFoyer: euros(0), versementPerDeductible: euros(0), impositionCommune: null },
      acomptesPasSaisis: euros(0)
    };
    const ouverte = provisionImpotRevenu(base);
    const close = provisionImpotRevenu({ ...base, anneeClose: true });
    if (ouverte.statut === 'refuse' || close.statut === 'refuse') throw new Error('refus inattendu');
    expect(ouverte.valeur.ignore).toContain('aucun_encaissement_attendu');
    expect(close.valeur.ignore).not.toContain('aucun_encaissement_attendu');
  });
});

