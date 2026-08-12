import { describe, expect, it } from 'vitest';
import { dateISO, euros, ratio } from '../types';
import {
  type ContexteDepenses, type Depense,
  libelleMotif, rapprochementEffectif, resumerDepenses, tvaDeDepense
} from './depenses';

function depense(m: Partial<Depense> = {}): Depense {
  return {
    id: 'd1', libelle: 'Abonnement', fournisseur: 'Fournisseur',
    provenance: 'france', montantTtc: euros(120), tauxTva: ratio(0.20),
    payeeLe: dateISO('2026-07-10'), justificatifId: 'piece-1', rapprochement: 'rapproche',
    ...m
  };
}

const ASSUJETTI: ContexteDepenses = { regimeTva: 'assujetti', banqueSynchronisee: true };
const FRANCHISE: ContexteDepenses = { regimeTva: 'franchise', banqueSynchronisee: true };

describe('pas de TVA récupérable sans justificatif', () => {
  // L'invariant central du modèle cible : déduire sans pièce, c'est un rappel
  // assuré en contrôle.
  it('récupère la TVA quand la pièce est là', () => {
    const t = tvaDeDepense(depense(), ASSUJETTI);
    expect(t.recuperable).toBe(20); // 120 TTC à 20 % → 20 € de TVA
    expect(t.motifNonRecuperable).toBeNull();
  });

  it('ne récupère rien sans pièce', () => {
    const t = tvaDeDepense(depense({ justificatifId: null }), ASSUJETTI);
    expect(t.recuperable).toBe(0);
    expect(t.motifNonRecuperable).toBe('justificatif_manquant');
  });

  // Un booléen ne suffirait pas : la pièce doit être retrouvable.
  it('exige un identifiant de pièce, pas une case cochée', () => {
    const avec = tvaDeDepense(depense({ justificatifId: 'fichier-abc' }), ASSUJETTI);
    const sans = tvaDeDepense(depense({ justificatifId: null }), ASSUJETTI);
    expect(avec.recuperable).toBeGreaterThan(0);
    expect(sans.recuperable).toBe(0);
  });
});

describe('franchise en base', () => {
  // L'ancienne application affichait « TVA déductible 760 € » à un utilisateur
  // en franchise, qui n'a droit à rien. Affirmation fausse, pas approximation.
  it('ne déduit jamais rien, même avec la pièce', () => {
    const t = tvaDeDepense(depense(), FRANCHISE);
    expect(t.recuperable).toBe(0);
    expect(t.motifNonRecuperable).toBe('franchise');
  });

  // Annoncer « justificatif manquant » en franchise enverrait l'utilisateur
  // chercher une pièce qui ne changerait rien.
  it('donne la franchise comme motif, pas l\'absence de pièce', () => {
    const t = tvaDeDepense(depense({ justificatifId: null }), FRANCHISE);
    expect(t.motifNonRecuperable).toBe('franchise');
  });
});

describe('autoliquidation sur les achats hors de France', () => {
  // Risque majeur de l'audit : la TVA est due ET non déductible. C'est ce
  // double effet que l'ancienne application ignorait.
  it('ne récupère rien et signale l\'autoliquidation, pour un fournisseur UE', () => {
    const t = tvaDeDepense(depense({ provenance: 'ue', montantTtc: euros(100), tauxTva: ratio(0) }), FRANCHISE);
    expect(t.recuperable).toBe(0);
    expect(t.motifNonRecuperable).toBe('autoliquidation');
    expect(t.aAutoliquider).toBeGreaterThan(0);
  });

  it('traite de même un fournisseur hors UE', () => {
    const t = tvaDeDepense(depense({ provenance: 'hors_ue', montantTtc: euros(100), tauxTva: ratio(0) }), FRANCHISE);
    expect(t.motifNonRecuperable).toBe('autoliquidation');
  });

  it('l\'emporte sur l\'absence de pièce : le motif utile est l\'autoliquidation', () => {
    const t = tvaDeDepense(depense({ provenance: 'ue', justificatifId: null }), ASSUJETTI);
    expect(t.motifNonRecuperable).toBe('autoliquidation');
  });

  it('un achat français ne déclenche aucune autoliquidation', () => {
    expect(tvaDeDepense(depense(), ASSUJETTI).aAutoliquider).toBe(0);
  });
});

describe('taux de TVA', () => {
  // Le taux est saisi, jamais supposé : l'ancienne version appliquait 20 % par
  // défaut, y compris sur des dépenses qui n'en portaient pas.
  it('ne récupère rien sur une dépense sans TVA', () => {
    const t = tvaDeDepense(depense({ tauxTva: ratio(0) }), ASSUJETTI);
    expect(t.recuperable).toBe(0);
    expect(t.motifNonRecuperable).toBe('taux_nul');
  });

  it('calcule la TVA contenue dans le TTC, pas ajoutée au TTC', () => {
    // 110 € TTC à 10 % contiennent 10 € de TVA, pas 11.
    const t = tvaDeDepense(depense({ montantTtc: euros(110), tauxTva: ratio(0.10) }), ASSUJETTI);
    expect(t.recuperable).toBe(10);
  });
});

describe('rapprochement bancaire', () => {
  // Un état « rapproché » hérité d'une ancienne configuration survivrait à la
  // déconnexion du compte et laisserait croire à un contrôle qui n'a plus lieu.
  it('n\'est jamais présenté comme rapproché sans banque synchronisée', () => {
    const sansBanque: ContexteDepenses = { regimeTva: 'assujetti', banqueSynchronisee: false };
    expect(rapprochementEffectif(depense({ rapprochement: 'rapproche' }), sansBanque))
      .toBe('sans_banque');
  });

  it('rend l\'état stocké quand la banque est synchronisée', () => {
    expect(rapprochementEffectif(depense({ rapprochement: 'en_attente' }), ASSUJETTI))
      .toBe('en_attente');
  });
});

describe('résumé', () => {
  const lot = [
    depense({ id: 'a', montantTtc: euros(120), tauxTva: ratio(0.20) }),
    depense({ id: 'b', montantTtc: euros(240), tauxTva: ratio(0.20), justificatifId: null }),
    depense({ id: 'c', montantTtc: euros(100), tauxTva: ratio(0), provenance: 'hors_ue' }),
    depense({ id: 'd', montantTtc: euros(60), tauxTva: ratio(0.20), rapprochement: 'en_attente' })
  ];

  it('totalise les montants et la TVA réellement récupérable', () => {
    const r = resumerDepenses(lot, ASSUJETTI);
    expect(r.nombre).toBe(4);
    expect(r.totalTtc).toBe(520);
    // a : 20 €, d : 10 €. b n'a pas de pièce, c est autoliquidé.
    expect(r.tvaRecuperable).toBe(30);
  });

  // Dire « justificatif manquant » n'incite personne à chercher une pièce ;
  // chiffrer ce que l'oubli coûte change la décision.
  it('chiffre la TVA perdue faute de pièce', () => {
    const r = resumerDepenses(lot, ASSUJETTI);
    expect(r.sansJustificatif).toBe(1);
    expect(r.tvaPerdueFauteDePiece).toBe(40); // 240 TTC à 20 %
  });

  it('compte les dépenses restant à rapprocher', () => {
    expect(resumerDepenses(lot, ASSUJETTI).aRapprocher).toBe(1);
  });

  it('sans banque synchronisée, plus rien n\'est en attente de rapprochement', () => {
    const r = resumerDepenses(lot, { regimeTva: 'assujetti', banqueSynchronisee: false });
    expect(r.aRapprocher).toBe(0);
  });

  it('en franchise, aucune TVA récupérable et aucune perte à déplorer', () => {
    const r = resumerDepenses(lot, FRANCHISE);
    expect(r.tvaRecuperable).toBe(0);
    // La pièce manquante ne coûte rien en franchise : la signaler comme une
    // perte serait faux.
    expect(r.tvaPerdueFauteDePiece).toBe(0);
  });

  it('un lot vide ne produit que des zéros', () => {
    const r = resumerDepenses([], ASSUJETTI);
    expect(r).toMatchObject({ nombre: 0, totalTtc: 0, tvaRecuperable: 0, sansJustificatif: 0 });
  });
});

describe('contexte résolu dépense par dépense', () => {
  // Franchir le seuil de TVA en cours d'année est le cas ordinaire, pas
  // l'exception. Un contexte unique pour tout le lot rendrait déductible une
  // TVA payée alors qu'on était encore en franchise — ou l'inverse.
  const AVANT = depense({ id: 'avant', payeeLe: dateISO('2026-03-15'), montantTtc: euros(120) });
  const APRES = depense({ id: 'apres', payeeLe: dateISO('2026-09-15'), montantTtc: euros(120) });
  const assujettiDepuisJuillet = (d: Depense): ContexteDepenses => ({
    regimeTva: d.payeeLe !== null && d.payeeLe >= '2026-07-01' ? 'assujetti' : 'franchise',
    banqueSynchronisee: true
  });

  it('applique le régime en vigueur à la date de paiement', () => {
    const r = resumerDepenses([AVANT, APRES], assujettiDepuisJuillet);
    // Seule la dépense de septembre ouvre droit à récupération.
    expect(r.tvaRecuperable).toBe(20);
  });

  it('accepte encore un contexte unique, qui vaut alors pour tout le lot', () => {
    expect(resumerDepenses([AVANT, APRES], ASSUJETTI).tvaRecuperable).toBe(40);
  });
});

describe('motifs lisibles', () => {
  it('chaque motif a un libellé qui dit quoi faire, ou pourquoi il n\'y a rien à faire', () => {
    const motifs = ['franchise', 'justificatif_manquant', 'autoliquidation', 'taux_nul'] as const;
    for (const m of motifs) {
      expect(libelleMotif(m).length).toBeGreaterThan(15);
    }
  });
});
