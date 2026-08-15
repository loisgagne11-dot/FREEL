import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../types';
import type { Resolution } from '../types';
import { tjmEffectif, tjmNet } from './tjm';

const publie = (valeur: number): Resolution<number> => ({
  statut: 'publie', valeur, source: 'test', verifieLe: dateISO('2026-01-01')
});

/**
 * LE TARIF AFFICHÉ N'EST PAS CE QU'ON FACTURE.
 *
 * Tous les jours travaillés ne se facturent pas : une remise consentie, un
 * forfait qui déborde, une demi-journée de reprise offerte. L'écart entre le
 * tarif du contrat et le rapport réel est la mesure de ce qui s'est perdu en
 * route — et il n'existait nulle part.
 */
describe('tarif journalier effectif', () => {
  it('ramène le facturé à la journée réellement passée', () => {
    const t = tjmEffectif({ jours: 20, produit: euros(10_000), facture: euros(9000) });
    expect(t.affiche).toBe(500);
    expect(t.effectif).toBe(450);
  });

  /** L'écart EST l'information : c'est ce qui se perd entre le tarif et la facture. */
  it('chiffre l’écart, dans les deux sens', () => {
    const perte = tjmEffectif({ jours: 20, produit: euros(10_000), facture: euros(9000) });
    expect(perte.ecart).toBe(-50);

    const gain = tjmEffectif({ jours: 20, produit: euros(10_000), facture: euros(11_000) });
    expect(gain.ecart).toBe(50);
  });

  /**
   * LE POINT QUI COMPTE. Les deux tarifs se divisent par les MÊMES journées.
   * Prendre deux dénominateurs différents rendrait l'écart illisible : on ne
   * saurait plus s'il vient du tarif ou du décompte.
   */
  it('divise les deux par les mêmes journées', () => {
    const t = tjmEffectif({ jours: 8, produit: euros(4000), facture: euros(4000) });
    expect(t.affiche).toBe(t.effectif);
    expect(t.ecart).toBe(0);
  });

  /**
   * Sans journée, il n'y a pas de moyenne. Zéro dirait « une journée rapporte
   * zéro », ce qui est faux : elle n'a simplement pas eu lieu.
   */
  it('refuse de moyenner sans aucune journée', () => {
    const t = tjmEffectif({ jours: 0, produit: euros(0), facture: euros(5000) });
    expect(t.effectif).toBeNull();
    expect(t.affiche).toBeNull();
    expect(t.ecart).toBeNull();
  });

  /** Un mois travaillé sans rien facturer se voit, au lieu de disparaître. */
  it('rend un effectif nul quand rien n’a été facturé', () => {
    const t = tjmEffectif({ jours: 15, produit: euros(7500), facture: euros(0) });
    expect(t.effectif).toBe(0);
    expect(t.ecart).toBe(-500);
  });
});

/**
 * CE QUI RENTRE N'EST PAS CE QUI RESTE.
 *
 * En micro-BNC, cotisations et impôt prélèvent près d'un quart du chiffre
 * d'affaires. C'est l'écart que tout indépendant sous-estime, et celui qu'il
 * faut avoir en tête pour dire oui ou non à une mission.
 */
describe('ce qu’il reste d’une journée', () => {
  it('retire les charges du tarif brut', () => {
    const net = tjmNet(euros(500), publie(0.256));
    expect(net.statut).toBe('publie');
    expect(net.statut !== 'refuse' && net.valeur).toBe(372);
  });

  /**
   * LE POINT QUI COMPTE. Un barème qui ne couvre pas la période REFUSE, et le
   * refus remonte intact. Retomber sur un taux nul annoncerait qu'une journée
   * rapporte net ce qu'elle rapporte brut — faux de vingt-cinq pour cent, et
   * c'est le chiffre sur lequel on décide d'accepter une mission.
   */
  it('remonte le refus du barème au lieu de retomber sur zéro', () => {
    const net = tjmNet(euros(500), { statut: 'refuse', motif: 'période non couverte' });
    expect(net.statut).toBe('refuse');
    expect(net.statut === 'refuse' && net.motif).toBe('période non couverte');
  });

  /**
   * Un net calculé sur une hypothèse reste une hypothèse. Le promouvoir en
   * « publié » ferait engager sur un chiffre qui ne l'était pas.
   */
  it('garde la qualification du taux qui l’a produit', () => {
    const net = tjmNet(euros(500), {
      statut: 'hypothese', valeur: 0.256, source: 'test',
      verifieLe: dateISO('2026-01-01'), depuis: mois('2027-01')
    });
    expect(net.statut).toBe('hypothese');
    expect(net.statut === 'hypothese' && net.depuis).toBe('2027-01');
  });

  it('ne retire rien à taux nul', () => {
    const net = tjmNet(euros(500), publie(0));
    expect(net.statut !== 'refuse' && net.valeur).toBe(500);
  });
});
