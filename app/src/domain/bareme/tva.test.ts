import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois, type Euros, type Mois, type TypeActivite } from '../types';
import {
  PERIODES_TVA,
  assujettissementTva, etatAssujettissement, periodeTvaPour, resteAvantFranchise,
  resteAvantMajore, seuilsTva, seuilsTvaPourAnnee, verifierIntegriteTva
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

/**
 * LE BUG REMONTÉ : les seuils ne regardaient que le CA de l'année en cours.
 * Un encaissement de décembre N-1, avec TVA déjà collectée dessus, était
 * invisible pour une application ouverte en N. Toutes les valeurs ci-dessous
 * sont fictives (aucun rapport avec un compte réel) ; seuls les DEUX seuils
 * de la table (37 500 € / 41 250 €) sont de vrais montants publiés.
 */
describe('prorata temporis de la première année', () => {
  // 184 jours entre le 1er juillet et le 31 décembre : sans le prorata, une
  // entreprise créée en juillet se voit comparée à un seuil pensé pour douze
  // mois d'activité qu'elle n'a jamais eus.
  it('réduit les deux seuils au nombre de jours d’activité', () => {
    const r = seuilsTvaPourAnnee(2026, 'BNC', dateISO('2026-07-01'));
    expect(r.statut).not.toBe('refuse');
    expect(r.statut !== 'refuse' && r.valeur).toEqual({ franchise: 18904, majore: 20795 });
  });

  // Le garde-fou de la formule : un début au 1er janvier couvre toute
  // l'année, le prorata doit donc être neutre — sinon la formule elle-même
  // serait fausse, pas seulement le cas limite.
  it('ne change rien pour un début d’activité au 1er janvier', () => {
    const r = seuilsTvaPourAnnee(2026, 'BNC', dateISO('2026-01-01'));
    expect(r.statut !== 'refuse' && r.valeur).toEqual({ franchise: 37500, majore: 41250 });
  });

  it('ne s’applique qu’à l’année de création, pas aux suivantes', () => {
    const r = seuilsTvaPourAnnee(2027, 'BNC', dateISO('2026-07-01'));
    expect(r.statut !== 'refuse' && r.valeur).toEqual({ franchise: 37500, majore: 41250 });
  });

  // Sans date de début connue, on ne pénalise pas une entreprise sur une
  // hypothèse de création qu'on ne peut pas vérifier : seuil plein.
  it('ne prorate rien quand le début d’activité est inconnu', () => {
    const r = seuilsTvaPourAnnee(2026, 'BNC', null);
    expect(r.statut !== 'refuse' && r.valeur).toEqual({ franchise: 37500, majore: 41250 });
  });
});

describe('assujettissementTva — le CA de N-1 rend redevable dès le 1er janvier N', () => {
  const ancienne = dateISO('2015-03-01'); // entreprise établie de longue date

  const parMois = (
    montants: Readonly<Record<string, number>>
  ): readonly { readonly mois: Mois; readonly encaisse: Euros }[] =>
    Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, '0');
      return { mois: mois(`2026-${m}`), encaisse: euros(montants[m] ?? 0) };
    });

  // C'EST LE CAS DU BUG : la franchise a été dépassée en 2025 (zone tolérée,
  // sans même atteindre le seuil majoré) ; l'application qui ne regarde que
  // 2026 ne peut pas le savoir. Sans cette règle, l'écran dirait
  // « sous_franchise » à quelqu'un déjà redevable depuis le 1er janvier.
  it('redevable au 1er janvier quand N-1 a dépassé la franchise, même sous le seuil majoré', () => {
    const r = assujettissementTva({
      annee: 2026, type: 'BNC', debutActivite: ancienne,
      caAnneePrecedente: euros(39_000), // > 37 500, ≤ 41 250
      parMoisAnneeEnCours: parMois({})
    });
    expect(r.statut).not.toBe('refuse');
    expect(r.statut !== 'refuse' && r.valeur).toEqual({
      cas: 'redevable', depuis: '2026-01', motif: 'annee_precedente'
    });
  });

  it('redevable au 1er janvier quand N-1 a dépassé le seuil majoré', () => {
    const r = assujettissementTva({
      annee: 2026, type: 'BNC', debutActivite: ancienne,
      caAnneePrecedente: euros(50_000),
      parMoisAnneeEnCours: parMois({})
    });
    expect(r.statut !== 'refuse' && r.valeur).toEqual({
      cas: 'redevable', depuis: '2026-01', motif: 'annee_precedente'
    });
  });

  it('reste sous la franchise quand N-1 était propre et N aussi', () => {
    const r = assujettissementTva({
      annee: 2026, type: 'BNC', debutActivite: ancienne,
      caAnneePrecedente: euros(10_000),
      parMoisAnneeEnCours: parMois({ '01': 5_000 })
    });
    expect(r.statut !== 'refuse' && r.valeur).toEqual({ cas: 'sous_franchise' });
  });

  it('perd la franchise au 1er janvier suivant quand N seul dépasse la franchise simple', () => {
    const r = assujettissementTva({
      annee: 2026, type: 'BNC', debutActivite: ancienne,
      caAnneePrecedente: euros(10_000),
      parMoisAnneeEnCours: parMois({ '01': 39_000 }) // > 37 500, ≤ 41 250
    });
    expect(r.statut !== 'refuse' && r.valeur).toEqual({
      cas: 'perte_franchise', depuis: '2027-01'
    });
  });

  // La date n'est pas « cette année », elle est le MOIS exact où le cumul a
  // franchi le seuil majoré — sans ça, l'écran ne peut dire qu'« un jour
  // cette année », ce qui ne dit pas depuis quand facturer avec TVA.
  it('redevable dès le mois exact où le cumul dépasse le seuil majoré en cours d’année', () => {
    const r = assujettissementTva({
      annee: 2026, type: 'BNC', debutActivite: ancienne,
      caAnneePrecedente: euros(10_000),
      parMoisAnneeEnCours: parMois({ '01': 10_000, '02': 10_000, '03': 25_000 }) // cumul mars : 45 000
    });
    expect(r.statut !== 'refuse' && r.valeur).toEqual({
      cas: 'redevable', depuis: '2026-03', motif: 'annee_en_cours'
    });
  });

  // La première année d'activité n'a pas de N-1 : le CA « précédent » fourni
  // ne peut être qu'une valeur sans rapport (activité antérieure différente,
  // reliquat d'un ancien statut...) et doit être ignoré, pas comparé.
  it('ignore le CA de l’année précédente pendant l’année de création', () => {
    const r = assujettissementTva({
      annee: 2026, type: 'BNC', debutActivite: dateISO('2026-04-01'),
      caAnneePrecedente: euros(999_999), // ignoré : pas de N-1 pour une création en 2026
      parMoisAnneeEnCours: parMois({ '05': 1_000 })
    });
    expect(r.statut !== 'refuse' && r.valeur).toEqual({ cas: 'sous_franchise' });
  });

  // Aucun seuil connu avant 2025 : demander l'état de 2025 exige un seuil de
  // 2024 pour juger N-1, que le barème refuse plutôt que d'inventer.
  it('refuse quand le seuil de l’année précédente n’est pas couvert par le barème', () => {
    const r = assujettissementTva({
      annee: 2025, type: 'BNC', debutActivite: null,
      caAnneePrecedente: euros(0),
      parMoisAnneeEnCours: parMois({})
    });
    expect(r.statut).toBe('refuse');
  });
});
