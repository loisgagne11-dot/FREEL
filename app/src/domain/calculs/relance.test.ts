import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import { detteDeRetard, redigerRelance, tonRelance } from './relance';

/**
 * CE QUI EST DÛ DE PLEIN DROIT, ET QUE PRESQUE PERSONNE NE RÉCLAME.
 *
 * Entre professionnels, un retard ouvre droit à DEUX choses distinctes qui se
 * cumulent (art. L441-10 du code de commerce) : une indemnité forfaitaire de
 * 40 € par facture, fixe, et des pénalités de retard au taux des conditions de
 * vente. Aucune n'a besoin d'un juge pour être due.
 */
describe('ce qui est dû sur une facture en retard', () => {
  const echeance = dateISO('2026-06-30');

  it('compte les jours écoulés depuis l’échéance', () => {
    const d = detteDeRetard(euros(4000), echeance, dateISO('2026-08-13'), null);
    expect(d.joursDeRetard).toBe(44);
  });

  /**
   * L'indemnité est FORFAITAIRE : elle ne dépend ni de la durée du retard ni du
   * montant. Un jour de retard sur 200 € l'ouvre autant que six mois sur
   * 20 000 €.
   */
  it('ouvre l’indemnité forfaitaire dès le premier jour de retard', () => {
    const d = detteDeRetard(euros(200), echeance, dateISO('2026-07-01'), null);
    expect(d.joursDeRetard).toBe(1);
    expect(d.indemniteForfaitaire).toBe(40);
  });

  /**
   * Rien n'est dû avant l'échéance — et l'annoncer avant serait une menace, pas
   * une information. Le jour même de l'échéance n'est pas un retard.
   */
  it('ne réclame rien tant que l’échéance n’est pas passée', () => {
    const d = detteDeRetard(euros(4000), echeance, echeance, null);
    expect(d.joursDeRetard).toBe(0);
    expect(d.indemniteForfaitaire).toBe(0);
    expect(d.penalites).toBeNull();
  });

  it('ne réclame rien sur une facture pas encore échue', () => {
    const d = detteDeRetard(euros(4000), echeance, dateISO('2026-06-01'), null);
    expect(d.joursDeRetard).toBe(0);
  });
});

/**
 * LE TAUX NE S'INVENTE PAS.
 *
 * Il vient des conditions de vente ; à défaut, le code retient le taux BCE
 * majoré de dix points, avec un plancher à trois fois l'intérêt légal — deux
 * valeurs qui changent chaque semestre et qu'aucune source automatisable ne
 * fournit.
 */
describe('pénalités de retard', () => {
  const echeance = dateISO('2026-06-30');

  it('calcule au prorata des jours, sur l’année', () => {
    // 4 000 € à 12 % sur 44 jours : 4000 × 0,12 × 44 / 365 = 57,86 → 58 €.
    const d = detteDeRetard(euros(4000), echeance, dateISO('2026-08-13'), 0.12);
    expect(d.penalites).toBe(58);
  });

  /**
   * LE POINT QUI COMPTE. `null` n'est pas zéro : c'est « je ne peux pas le
   * dire ». Afficher zéro ferait croire qu'il n'y a rien à réclamer, et
   * réclamer un montant calculé sur un taux supposé serait contestable — c'est
   * exactement le document qu'on ne veut pas fragiliser.
   */
  it('refuse de chiffrer sans taux, plutôt que d’annoncer zéro', () => {
    const d = detteDeRetard(euros(4000), echeance, dateISO('2026-08-13'), null);
    expect(d.penalites).toBeNull();
    expect(d.penalites).not.toBe(0);
  });

  it('croît avec la durée du retard', () => {
    const court = detteDeRetard(euros(4000), echeance, dateISO('2026-07-31'), 0.12);
    const long = detteDeRetard(euros(4000), echeance, dateISO('2026-12-31'), 0.12);
    expect(long.penalites).toBeGreaterThan(court.penalites ?? 0);
  });
});

/**
 * TROIS TONS, PARCE QUE TROIS MESSAGES.
 *
 * Écrire la mise en demeure en premier brûle la relation commerciale ; répéter
 * un rappel courtois au cinquième mois n'obtient rien.
 */
describe('ton de la relance', () => {
  it('commence par un rappel', () => {
    expect(tonRelance(0)).toBe('rappel');
  });

  it('durcit à la deuxième', () => {
    expect(tonRelance(1)).toBe('ferme');
  });

  it('met en demeure au-delà', () => {
    expect(tonRelance(2)).toBe('mise_en_demeure');
    expect(tonRelance(5)).toBe('mise_en_demeure');
  });

  /**
   * Le ton suit le NOMBRE de relances, pas la durée du retard : un client
   * jamais relancé mérite un rappel même à trois mois — il arrive qu'une
   * facture n'ait simplement jamais été reçue.
   */
  it('ne durcit pas sur la seule ancienneté', () => {
    expect(tonRelance(0)).toBe('rappel');
  });
});

describe('rédaction', () => {
  const base = {
    numero: '2026-014',
    montant: euros(4000),
    echeanceLe: dateISO('2026-06-30'),
    dette: detteDeRetard(euros(4000), dateISO('2026-06-30'), dateISO('2026-08-13'), 0.12)
  };

  it('nomme la facture, son montant et son échéance', () => {
    const r = redigerRelance({ ...base, relancesFaites: 0 });
    expect(r.corps).toContain('2026-014');
    expect(r.corps).toMatch(/4\s*000/u);
    expect(r.corps).toContain('30 juin 2026');
  });

  /**
   * Un premier rappel laisse la porte ouverte : il arrive qu'un règlement soit
   * déjà parti. Annoncer les pénalités d'entrée donnerait au message un ton
   * qu'il n'a pas.
   */
  it('n’annonce aucune pénalité dans un premier rappel', () => {
    const r = redigerRelance({ ...base, relancesFaites: 0 });
    expect(r.corps).not.toMatch(/L441-10/);
    expect(r.corps).toMatch(/ne pas tenir compte/);
  });

  it('rappelle les droits à partir de la relance ferme', () => {
    const r = redigerRelance({ ...base, relancesFaites: 1 });
    expect(r.corps).toContain('L441-10');
    expect(r.corps).toContain('40');
  });

  /**
   * Sans taux, le texte réserve les pénalités au lieu de les chiffrer. Une mise
   * en demeure qui réclamerait un montant calculé sur un taux supposé serait
   * contestable.
   */
  it('réserve les pénalités quand le taux est inconnu', () => {
    const sansTaux = detteDeRetard(
      euros(4000), dateISO('2026-06-30'), dateISO('2026-08-13'), null
    );
    const r = redigerRelance({ ...base, dette: sansTaux, relancesFaites: 2 });
    expect(r.corps).toMatch(/conditions de vente/);
    expect(r.corps).not.toMatch(/s'élevant à ce jour/);
  });

  it('chiffre les pénalités quand le taux est connu', () => {
    const r = redigerRelance({ ...base, relancesFaites: 2 });
    expect(r.corps).toMatch(/s'élevant à ce jour/);
  });

  it('adapte l’objet au ton', () => {
    expect(redigerRelance({ ...base, relancesFaites: 0 }).objet).toMatch(/^Rappel/);
    expect(redigerRelance({ ...base, relancesFaites: 1 }).objet).toMatch(/^Relance/);
    expect(redigerRelance({ ...base, relancesFaites: 2 }).objet).toMatch(/^Mise en demeure/);
  });
});
