import { describe, expect, it } from 'vitest';
import { euros, mois, type TypeActivite } from '../types';
import {
  PERIODES_TVA,
  etatAssujettissement, periodeTvaPour, resteAvantFranchise, resteAvantMajore,
  seuilsTva, verifierIntegriteTva
} from './tva';

const M = '2026-07';

function etat(ca: number, type: TypeActivite = 'BNC'): string | null {
  const r = etatAssujettissement(euros(ca), mois(M), type);
  return r.statut === 'refuse' ? null : r.valeur.cas;
}

function reste(ca: number, type: TypeActivite = 'BNC'): number | null {
  const r = resteAvantMajore(euros(ca), mois(M), type);
  return r.statut === 'refuse' ? null : r.valeur;
}

describe('les deux seuils', () => {
  it('expose franchise ET seuil majoré pour les prestations de services', () => {
    const r = seuilsTva(mois(M), 'BNC');
    expect(r.statut !== 'refuse' && r.valeur).toEqual({ franchise: 37500, majore: 41250 });
  });

  it('expose les seuils propres à la vente de marchandises', () => {
    const r = seuilsTva(mois(M), 'BIC_vente');
    expect(r.statut !== 'refuse' && r.valeur).toEqual({ franchise: 85000, majore: 93500 });
  });

  // BNC et BIC_service sont tous deux des prestations de services au sens de
  // la franchise de TVA : mêmes seuils, contrairement aux cotisations.
  it('traite BNC et BIC_service avec les mêmes seuils', () => {
    const bnc = seuilsTva(mois(M), 'BNC');
    const bic = seuilsTva(mois(M), 'BIC_service');
    expect(bnc.statut !== 'refuse' && bnc.valeur)
      .toEqual(bic.statut !== 'refuse' && bic.valeur);
  });

  it('le seuil majoré est toujours supérieur à la franchise', () => {
    for (const p of PERIODES_TVA) {
      for (const type of ['BNC', 'BIC_vente', 'BIC_service'] as const) {
        expect(p.seuils[type].majore).toBeGreaterThan(p.seuils[type].franchise);
      }
    }
  });
});

describe('les trois états d\'assujettissement', () => {
  it('sous la franchise', () => {
    expect(etat(20000)).toBe('sous_franchise');
  });

  it('au-delà de la franchise mais sous le majoré : assujettissement au 1er janvier suivant', () => {
    expect(etat(39000)).toBe('depassement_franchise');
  });

  it('au-delà du seuil majoré : assujettissement immédiat', () => {
    expect(etat(45000)).toBe('depassement_majore');
  });

  // Les bornes exactes, parce que c'est là que se jouent les erreurs : un
  // chiffre d'affaires PILE au seuil ne le franchit pas.
  it('à la franchise exactement, la franchise est conservée', () => {
    expect(etat(37500)).toBe('sous_franchise');
  });

  it('un euro au-dessus de la franchise, le dépassement est constaté', () => {
    expect(etat(37501)).toBe('depassement_franchise');
  });

  it('au seuil majoré exactement, pas encore d\'assujettissement immédiat', () => {
    expect(etat(41250)).toBe('depassement_franchise');
  });

  it('un euro au-dessus du seuil majoré, l\'assujettissement est immédiat', () => {
    expect(etat(41251)).toBe('depassement_majore');
  });

  it('un chiffre d\'affaires nul reste sous la franchise', () => {
    expect(etat(0)).toBe('sous_franchise');
  });
});

describe('reste facturable avant le seuil majoré', () => {
  // La fonction la plus utile du barème : sans elle, l'utilisateur franchit
  // le seuil sans le savoir et doit la TVA sur des factures déjà émises sans
  // elle, sans pouvoir la répercuter au client.
  it('donne ce qu\'il reste à facturer avant l\'assujettissement immédiat', () => {
    expect(reste(35000)).toBe(6250); // 41 250 − 35 000
  });

  it('vaut le seuil entier quand rien n\'a encore été encaissé', () => {
    expect(reste(0)).toBe(41250);
  });

  it('vaut zéro pile au seuil', () => {
    expect(reste(41250)).toBe(0);
  });

  // Jamais de négatif : au-delà du seuil, il ne reste rien, ce n'est pas une
  // dette de facturation.
  it('vaut zéro au-delà du seuil, jamais un montant négatif', () => {
    expect(reste(50000)).toBe(0);
  });

  it('suit les seuils de la vente pour une activité de vente', () => {
    expect(reste(50000, 'BIC_vente')).toBe(43500); // 93 500 − 50 000
  });
});

describe('reste avant la franchise simple', () => {
  // Alerte plus douce : franchir la franchise ne déclenche rien d'immédiat.
  it('prévient plus tôt que le seuil majoré', () => {
    const franchise = resteAvantFranchise(euros(30000), mois(M), 'BNC');
    const majore = resteAvantMajore(euros(30000), mois(M), 'BNC');
    const vf = franchise.statut !== 'refuse' ? franchise.valeur : -1;
    const vm = majore.statut !== 'refuse' ? majore.valeur : -1;
    expect(vf).toBe(7500); // 37 500 − 30 000
    expect(vf).toBeLessThan(vm);
  });

  it('vaut zéro au-delà de la franchise, jamais un négatif', () => {
    const r = resteAvantFranchise(euros(40000), mois(M), 'BNC');
    expect(r.statut !== 'refuse' && r.valeur).toBe(0);
  });
});

describe('asymétrie du temps', () => {
  // Aucun seuil n'est saisi avant 2025 : on refuse plutôt que d'appliquer
  // les seuils actuels à une année antérieure.
  it('refuse une période antérieure au plus ancien barème', () => {
    const r = seuilsTva(mois('2024-06'), 'BNC');
    expect(r.statut).toBe('refuse');
    if (r.statut === 'refuse') expect(r.motif).toContain('2024-06');
  });

  it('propage le refus jusqu\'aux fonctions dérivées', () => {
    expect(etatAssujettissement(euros(40000), mois('2024-06'), 'BNC').statut).toBe('refuse');
    expect(resteAvantMajore(euros(40000), mois('2024-06'), 'BNC').statut).toBe('refuse');
    expect(resteAvantFranchise(euros(40000), mois('2024-06'), 'BNC').statut).toBe('refuse');
  });

  it('couvre le futur par la période ouverte', () => {
    expect(seuilsTva(mois('2031-03'), 'BNC').statut).not.toBe('refuse');
  });
});

describe('intégrité et provenance de la table', () => {
  it('la table est saine', () => {
    expect(verifierIntegriteTva()).toEqual([]);
  });

  it('chaque période porte sa source et sa date de vérification', () => {
    for (const p of PERIODES_TVA) {
      expect(p.source).toBeTruthy();
      expect(p.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  // La réserve sur le projet de seuil unique à 25 000 € doit rester visible :
  // c'est une incertitude connue, pas un oubli.
  it('documente la réserve sur le projet de seuil unique à 25 000 €', () => {
    const sources = PERIODES_TVA.map((p) => p.source).join(' ');
    expect(sources).toMatch(/25\s?000/);
  });

  it('periodeTvaPour ne trouve rien hors de toute période', () => {
    expect(periodeTvaPour(mois(M))).toBeDefined();
    expect(periodeTvaPour(mois('2024-06'))).toBeUndefined();
  });
});
