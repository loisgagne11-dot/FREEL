import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { euros, mois, type TypeActivite } from '../types';
import {
  PERIODES_CFP, PERIODES_IR, PERIODES_VERSEMENT_LIBERATOIRE,
  calculerLigneFiscale, irParTranches, tauxCfp, tauxImpotEtContributions,
  tauxVersementLiberatoire, tranchesIR, verifierIntegriteImpot
} from './impot';

const M = '2026-07';

function vl(m = M, type: TypeActivite = 'BNC'): number | null {
  const r = tauxVersementLiberatoire(mois(m), type);
  return r.statut === 'refuse' ? null : r.valeur;
}

describe('versement libératoire', () => {
  it('applique 2,2 % au BNC', () => {
    expect(vl()).toBe(0.022);
  });

  it('applique 1 % à la vente et 1,7 % aux services BIC', () => {
    expect(vl(M, 'BIC_vente')).toBe(0.01);
    expect(vl(M, 'BIC_service')).toBe(0.017);
  });

  // Le facteur × 1,56 de l'ancienne application n'avait aucun fondement légal
  // et a été supprimé par décision (D2). Ce test empêche sa réintroduction,
  // sous quelque forme que ce soit.
  it('le versement libératoire est un taux plat, sans facteur multiplicateur', () => {
    const montantAttendu = 10000 * 0.022;
    const ligne = calculerLigneFiscale(
      { regime: 'versement_liberatoire' }, euros(10000), mois(M), 'BNC'
    );
    const calc = ligne.versementLiberatoire;
    expect(calc?.statut !== 'refuse' && calc?.valeur.montant).toBe(montantAttendu);
    expect(montantAttendu).toBe(220); // et non 343,20 comme avec × 1,56
  });

  it('aucune trace du facteur 1,56 dans le code source du module', () => {
    const source = readFileSync(new URL('./impot.ts', import.meta.url), 'utf-8');
    // Le nombre ne doit apparaître que dans un commentaire d'avertissement,
    // jamais dans une expression de calcul.
    const lignesDeCalcul = source
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'))
      .join('\n');
    expect(lignesDeCalcul).not.toMatch(/1\.56|1,56/);
  });
});

describe('contribution à la formation professionnelle', () => {
  it('applique 0,2 % au BNC', () => {
    const r = tauxCfp(mois(M), 'BNC');
    expect(r.statut !== 'refuse' && r.valeur).toBe(0.002);
  });

  it('applique 0,1 % à la vente', () => {
    const r = tauxCfp(mois(M), 'BIC_vente');
    expect(r.statut !== 'refuse' && r.valeur).toBe(0.001);
  });
});

describe('exclusivité du régime d\'imposition (D2)', () => {
  // Le point que l'ancienne application avait faux : elle cumulait versement
  // libératoire ET acompte de prélèvement à la source, alors que les deux
  // régimes sont exclusifs.
  it('sous versement libératoire : une ligne de VL, aucun acompte', () => {
    const l = calculerLigneFiscale({ regime: 'versement_liberatoire' }, euros(10000), mois(M), 'BNC');
    expect(l.versementLiberatoire).not.toBeNull();
    expect(l.acomptePas).toBeNull();
  });

  it('sous le barème : un acompte, aucune ligne de VL', () => {
    const l = calculerLigneFiscale(
      { regime: 'bareme', acomptePasSaisi: euros(620) }, euros(10000), mois(M), 'BNC'
    );
    expect(l.versementLiberatoire).toBeNull();
    expect(l.acomptePas).toBe(620);
  });

  it('jamais les deux à la fois, quel que soit le régime', () => {
    const regimes = [
      { regime: 'versement_liberatoire' as const },
      { regime: 'bareme' as const, acomptePasSaisi: euros(620) }
    ];
    for (const r of regimes) {
      const l = calculerLigneFiscale(r, euros(10000), mois(M), 'BNC');
      const deuxRenseignes = l.versementLiberatoire !== null && l.acomptePas !== null;
      expect(deuxRenseignes).toBe(false);
    }
  });

  // L'acompte est notifié par la DGFiP : c'est un fait saisi, pas un calcul.
  it('reprend l\'acompte tel qu\'il a été saisi, sans le recalculer', () => {
    for (const montant of [0, 1, 620, 12345.67]) {
      const l = calculerLigneFiscale(
        { regime: 'bareme', acomptePasSaisi: euros(montant) }, euros(50000), mois(M), 'BNC'
      );
      expect(l.acomptePas).toBe(euros(montant));
    }
  });
});

describe('part d\'impôt et de contributions à provisionner', () => {
  // Cette grandeur alimente directement ContexteProvisions.
  it('sous versement libératoire : CFP + VL', () => {
    const r = tauxImpotEtContributions({ regime: 'versement_liberatoire' }, mois(M), 'BNC');
    expect(r.statut !== 'refuse' && r.valeur).toBeCloseTo(0.002 + 0.022, 10);
  });

  // L'acompte de PAS n'est pas un taux sur les recettes : il ne doit pas
  // entrer dans ce ratio, sinon il serait provisionné deux fois.
  it('sous le barème : CFP seule, l\'acompte n\'est pas un taux', () => {
    const r = tauxImpotEtContributions(
      { regime: 'bareme', acomptePasSaisi: euros(620) }, mois(M), 'BNC'
    );
    expect(r.statut !== 'refuse' && r.valeur).toBe(0.002);
  });

  it('le régime change le résultat', () => {
    const a = tauxImpotEtContributions({ regime: 'versement_liberatoire' }, mois(M), 'BNC');
    const b = tauxImpotEtContributions(
      { regime: 'bareme', acomptePasSaisi: euros(0) }, mois(M), 'BNC'
    );
    const va = a.statut !== 'refuse' ? a.valeur : -1;
    const vb = b.statut !== 'refuse' ? b.valeur : -1;
    expect(va).toBeGreaterThan(vb);
  });
});

describe('impôt par tranches', () => {
  const tranches2024 = tranchesIR(mois('2024-06'));

  it('résout les tranches de 2024', () => {
    expect(tranches2024.statut).not.toBe('refuse');
  });

  it('calcule progressivement, tranche par tranche', () => {
    if (tranches2024.statut === 'refuse') throw new Error('tranches attendues');
    // 11 497 à 0 % = 0
    // 11 497 → 29 315 : 17 818 × 11 % = 1 959,98
    // 29 315 → 30 000 :    685 × 30 % =   205,50
    expect(irParTranches(euros(30000), tranches2024.valeur)).toBeCloseTo(2165.48, 2);
  });

  it('ne prélève rien sous le seuil de la première tranche imposable', () => {
    if (tranches2024.statut === 'refuse') throw new Error('tranches attendues');
    expect(irParTranches(euros(11497), tranches2024.valeur)).toBe(0);
    expect(irParTranches(euros(0), tranches2024.valeur)).toBe(0);
  });

  it('applique le taux marginal le plus élevé sur les très hauts revenus', () => {
    if (tranches2024.statut === 'refuse') throw new Error('tranches attendues');
    const impot = irParTranches(euros(500000), tranches2024.valeur);
    // Le taux moyen reste inférieur au taux marginal : c'est le propre d'un
    // barème progressif, et une erreur classique consiste à appliquer 45 %
    // au revenu entier.
    expect(impot / 500000).toBeLessThan(0.45);
    expect(impot / 500000).toBeGreaterThan(0.30);
  });

  // Les tranches ne sont publiées que pour 2024 : les périodes ultérieures
  // sont donc une hypothèse, et doivent le dire.
  it('marque comme hypothèse une période postérieure aux tranches publiées', () => {
    const r = tranchesIR(mois('2026-07'));
    expect(r.statut).toBe('hypothese');
  });

  it('refuse une période antérieure aux tranches publiées', () => {
    const r = tranchesIR(mois('2015-01'));
    expect(r.statut).toBe('refuse');
  });
});

describe('intégrité et provenance des trois tables', () => {
  it('les tables sont saines', () => {
    expect(verifierIntegriteImpot()).toEqual([]);
  });

  it('chaque période de chaque table porte sa source et sa date de vérification', () => {
    const toutes = [...PERIODES_IR, ...PERIODES_VERSEMENT_LIBERATOIRE, ...PERIODES_CFP];
    expect(toutes.length).toBeGreaterThan(0);
    for (const p of toutes) {
      expect(p.source).toBeTruthy();
      expect(p.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('les tranches sont ordonnées par seuil croissant et par taux croissant', () => {
    for (const p of PERIODES_IR) {
      for (let i = 1; i < p.tranches.length; i++) {
        const precedente = p.tranches[i - 1];
        const courante = p.tranches[i];
        if (!precedente || !courante) throw new Error('tranche manquante');
        expect(courante.seuil).toBeGreaterThan(precedente.seuil);
        expect(courante.taux).toBeGreaterThan(precedente.taux);
      }
    }
  });

  it('la première tranche part de zéro à taux nul', () => {
    for (const p of PERIODES_IR) {
      expect(p.tranches[0]?.seuil).toBe(0);
      expect(p.tranches[0]?.taux).toBe(0);
    }
  });
});
