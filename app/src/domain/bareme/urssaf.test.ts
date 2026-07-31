import { describe, expect, it } from 'vitest';
import { dateISO, mois, ratio, type TypeActivite } from '../types';
import {
  ABATTEMENT_ACRE, PERIODES_URSSAF, fusionnerPeriodes, libelleHypothese,
  periodePour, tauxCotisations, validerAjout, verifierIntegrite
} from './urssaf';

/** Raccourci de lecture : le taux, ou null si le barème refuse. */
function taux(m: string, type: TypeActivite = 'BNC', acre = false): number | null {
  const r = tauxCotisations(mois(m), type, acre);
  return r.statut === 'refuse' ? null : r.valeur;
}

describe('barème URSSAF — résolution par période', () => {
  // Le cœur du sujet : le taux BNC change EN COURS D'ANNÉE, au 1er juillet
  // 2024 et au 1er juillet 2026. Ces cas verrouillent les bascules, mois
  // par mois, de part et d'autre de chaque frontière.
  const attendus: readonly [string, number, string][] = [
    ['2024-01', 0.211, 'début du 1er semestre 2024'],
    ['2024-06', 0.211, 'dernier mois avant la bascule de juillet 2024'],
    ['2024-07', 0.231, 'bascule du 1er juillet 2024'],
    ['2024-12', 0.231, 'fin du 2e semestre 2024'],
    ['2025-01', 0.246, '2025, taux unique sur l\'année'],
    ['2025-12', 0.246, 'fin 2025'],
    ['2026-01', 0.256, 'début du 1er semestre 2026'],
    ['2026-06', 0.256, 'dernier mois avant la bascule de juillet 2026'],
    ['2026-07', 0.261, 'bascule du 1er juillet 2026'],
    ['2026-12', 0.261, 'fin 2026']
  ];

  it.each(attendus)('%s → %d (%s)', (m, attendu) => {
    expect(taux(m)).toBe(attendu);
  });

  it('distingue les deux semestres 2026, ce qu\'une table annuelle ne peut pas faire', () => {
    expect(taux('2026-06')).not.toBe(taux('2026-07'));
  });

  it('applique le taux par type d\'activité', () => {
    expect(taux('2026-07', 'BNC')).toBe(0.261);
    expect(taux('2026-07', 'BIC_vente')).toBe(0.123);
    expect(taux('2026-07', 'BIC_service')).toBe(0.212);
  });

  it('applique l\'abattement ACRE', () => {
    expect(taux('2026-07', 'BNC', true)).toBeCloseTo(0.261 * ABATTEMENT_ACRE, 10);
  });
});

describe('asymétrie du temps', () => {
  // On extrapole vers le futur, jamais vers le passé : le taux d'un mois
  // écoulé est un fait publié, pas une prévision.
  it('sert le dernier taux connu pour un mois futur non publié', () => {
    const r = tauxCotisations(mois('2031-03'), 'BNC', false);
    expect(r.statut).toBe('publie'); // la dernière période reste ouverte
    expect(r.statut !== 'refuse' && r.valeur).toBe(0.261);
  });

  it('refuse un mois antérieur au plus ancien barème, au lieu de l\'extrapoler', () => {
    const r = tauxCotisations(mois('2019-01'), 'BNC', false);
    expect(r.statut).toBe('refuse');
    expect(r.statut === 'refuse' && r.motif).toMatch(/extrapol/);
    expect(r.statut === 'refuse' && r.motif).toContain('2019-01');
  });

  it('ne laisse jamais lire une valeur sur un refus', () => {
    const r = tauxCotisations(mois('2019-01'), 'BNC', false);
    // Le type l'interdit à la compilation ; on vérifie qu'il n'y a rien
    // à lire à l'exécution non plus.
    expect('valeur' in r).toBe(false);
  });
});

describe('provenance et intégrité de la table', () => {
  it('la table est contiguë, sans trou ni chevauchement', () => {
    expect(verifierIntegrite()).toEqual([]);
  });

  it('chaque période porte sa source et sa date de vérification', () => {
    for (const per of PERIODES_URSSAF) {
      expect(per.source).toBeTruthy();
      expect(per.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('seule la dernière période reste ouverte', () => {
    const ouvertes = PERIODES_URSSAF.filter((per) => per.au === null);
    expect(ouvertes).toHaveLength(1);
    expect(ouvertes[0]).toBe(PERIODES_URSSAF[PERIODES_URSSAF.length - 1]);
  });

  it('périodePour trouve la période et rien pour un mois non couvert', () => {
    expect(periodePour(mois('2026-07'))?.du).toBe('2026-07');
    expect(periodePour(mois('2019-01'))).toBeUndefined();
  });
});

describe('l\'hypothèse doit être explicite', () => {
  it('ne produit aucun libellé sur un taux publié', () => {
    expect(libelleHypothese(tauxCotisations(mois('2026-07'), 'BNC', false))).toBeNull();
  });

  it('produit un libellé chiffré et daté sur une hypothèse', () => {
    // Construction directe : la table réelle n'a pas de trou vers le futur.
    const label = libelleHypothese({
      statut: 'hypothese', valeur: ratio(0.261),
      source: 'urssaf.fr', verifieLe: '2026-07-27' as never, depuis: mois('2026-07')
    });
    expect(label).toContain('26,1 %');
    expect(label).toContain('2026-07');
  });
});

describe('garde-fous de typage', () => {
  it('refuse un mois mal formé plutôt que de le tolérer', () => {
    expect(() => mois('2026-13')).toThrow(RangeError);
    expect(() => mois('2026-7')).toThrow(RangeError);
    expect(() => mois('juillet 2026')).toThrow(RangeError);
  });
});

describe('barème complété par l’utilisateur', () => {
  const per = (du: string, au: string | null, bnc: number, source = 'avis d’appel') => ({
    du: mois(du),
    au: au === null ? null : mois(au),
    taux: { BNC: ratio(bnc), BIC_vente: ratio(0.123), BIC_service: ratio(0.212) },
    source,
    verifieLe: dateISO('2027-01-15')
  });

  const BASE = [
    per('2026-01', '2026-06', 0.256),
    per('2026-07', null, 0.261)
  ];

  // Sans cette porte d'entrée, un taux périmé resterait appliqué
  // indéfiniment — ou l'alerte de fraîcheur bloquerait sans qu'on puisse
  // la lever.
  it('prolonge le barème sans redéploiement', () => {
    const fusionne = fusionnerPeriodes(BASE, [per('2027-01', null, 0.272)]);
    expect(fusionne).toHaveLength(3);
    expect(tauxCotisations(mois('2027-03'), 'BNC', false, fusionne)).toMatchObject({
      statut: 'publie', valeur: 0.272
    });
  });

  // Deux périodes ouvertes rendraient la résolution ambiguë : la plus
  // ancienne l'emporterait par simple ordre de parcours.
  it('ferme la période qui restait ouverte', () => {
    const fusionne = fusionnerPeriodes(BASE, [per('2027-01', null, 0.272)]);
    expect(fusionne[1]?.au).toBe('2026-12');
    expect(fusionne.filter((p) => p.au === null)).toHaveLength(1);
  });

  // Le taux d'un mois écoulé est un fait publié : le recalcul d'un trimestre
  // passé doit redonner le montant réellement déclaré à l'époque.
  it('n’altère pas les périodes antérieures', () => {
    const fusionne = fusionnerPeriodes(BASE, [per('2027-01', null, 0.272)]);
    expect(tauxCotisations(mois('2026-03'), 'BNC', false, fusionne)).toMatchObject({
      statut: 'publie', valeur: 0.256
    });
  });

  // Le seul moyen de corriger une valeur livrée fausse sans attendre un
  // déploiement.
  it('permet de corriger une période livrée, à début identique', () => {
    const fusionne = fusionnerPeriodes(BASE, [per('2026-07', null, 0.259)]);
    expect(fusionne).toHaveLength(2);
    expect(tauxCotisations(mois('2026-09'), 'BNC', false, fusionne)).toMatchObject({
      valeur: 0.259
    });
  });

  it('conserve la source saisie, qui devient traçable', () => {
    const fusionne = fusionnerPeriodes(BASE, [per('2027-01', null, 0.272, 'avis du 12/01/2027')]);
    const r = tauxCotisations(mois('2027-03'), 'BNC', false, fusionne);
    expect(r.statut === 'publie' && r.source).toBe('avis du 12/01/2027');
  });

  it('applique l’abattement ACRE sur un taux ajouté comme sur un autre', () => {
    const fusionne = fusionnerPeriodes(BASE, [per('2027-01', null, 0.272)]);
    const r = tauxCotisations(mois('2027-03'), 'BNC', true, fusionne);
    expect(r.statut === 'publie' && r.valeur).toBeCloseTo(0.136, 10);
  });
});

describe('contrôles à l’ajout d’une période', () => {
  const per = (du: string, au: string | null, bnc: number) => ({
    du: mois(du),
    au: au === null ? null : mois(au),
    taux: { BNC: ratio(bnc), BIC_vente: ratio(0.123), BIC_service: ratio(0.212) },
    source: 'urssaf.fr',
    verifieLe: dateISO('2027-01-15')
  });

  const BASE = [per('2026-01', '2026-06', 0.256), per('2026-07', null, 0.261)];

  it('accepte une période qui prolonge la dernière', () => {
    expect(validerAjout(BASE, { du: mois('2027-01'), source: 'avis d’appel' })).toBeNull();
  });

  // Une valeur sans provenance ne peut pas être vérifiée plus tard.
  it('exige une source', () => {
    const refus = validerAjout(BASE, { du: mois('2027-01'), source: '   ' });
    expect(refus).toMatch(/source/i);
  });

  // Réécrire une période close ferait diverger les recalculs des
  // déclarations déjà envoyées.
  it('refuse une période tombant à l’intérieur d’une période close', () => {
    const refus = validerAjout(BASE, { du: mois('2026-03'), source: 'urssaf.fr' });
    expect(refus).toMatch(/barème passé|période close/i);
  });

  it('accepte de corriger un début de période existant', () => {
    expect(validerAjout(BASE, { du: mois('2026-01'), source: 'urssaf.fr' })).toBeNull();
    expect(validerAjout(BASE, { du: mois('2026-07'), source: 'urssaf.fr' })).toBeNull();
  });

  it('accepte tout sur une table vide', () => {
    expect(validerAjout([], { du: mois('2020-01'), source: 'urssaf.fr' })).toBeNull();
  });
});
