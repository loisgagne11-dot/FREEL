import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import {
  CA_SANS_COTISATION_MINIMUM,
  acompteCfe, cfeDue, cotisationCfe, declaration1447C, paiementCfe, regimeCfe
} from './cfe';

/**
 * LA CHARGE QUE L'APPLICATION IGNORAIT.
 *
 * La CFE est annuelle, payable au 15 décembre, et invisible avant novembre.
 * Quelqu'un qui se verse tout son disponible en octobre se verse la CFE de
 * décembre — l'erreur qui va dans le sens dangereux.
 *
 * Ce module porte les RÈGLES, jamais les montants : la base minimum est fixée
 * par la commune, le taux voté par elle, et seul l'avis les porte. L'ancienne
 * application affichait un montant tiré d'une grille en dur que l'audit
 * comptable a jugée non conforme — c'est précisément ce qu'on ne refait pas.
 */
describe('régime CFE', () => {
  const creation = dateISO('2024-03-15');

  // Art. 1478 II du CGI. C'est une exonération totale, pas un abattement.
  it('exonère entièrement l’année de création', () => {
    expect(regimeCfe(creation, 2024, euros(40000))).toEqual({ type: 'exonere-creation' });
    expect(cfeDue(regimeCfe(creation, 2024, euros(40000)))).toBe(false);
  });

  it('réduit la base de moitié la première année d’imposition', () => {
    expect(regimeCfe(creation, 2025, euros(40000))).toEqual({ type: 'base-reduite-moitie' });
    // Réduite n'est pas nulle : il y a bien une CFE à payer.
    expect(cfeDue(regimeCfe(creation, 2025, euros(40000)))).toBe(true);
  });

  it('applique le droit commun à partir de la deuxième année d’imposition', () => {
    expect(regimeCfe(creation, 2026, euros(40000))).toEqual({ type: 'droit-commun' });
  });

  /**
   * L'ORDRE DES CAS N'EST PAS ARBITRAIRE.
   *
   * Une entreprise créée en 2024, à 3 000 € de recettes, relève en 2025 de la
   * base réduite ET du seuil de dispense. Conclure « rien à payer » serait
   * faux : ce sont deux mécanismes distincts, et la réduction de moitié porte
   * sur une base qui reste due.
   */
  it('fait primer la réduction de moitié sur la dispense de cotisation minimum', () => {
    expect(regimeCfe(creation, 2025, euros(3000))).toEqual({ type: 'base-reduite-moitie' });
  });

  it('fait primer l’exonération de création sur tout le reste', () => {
    expect(regimeCfe(creation, 2024, euros(0))).toEqual({ type: 'exonere-creation' });
  });
});

describe('seuil de cotisation minimum', () => {
  const ancienne = dateISO('2015-01-01');

  it('dispense de cotisation minimum au plus 5 000 € de recettes', () => {
    const r = regimeCfe(ancienne, 2026, CA_SANS_COTISATION_MINIMUM);
    expect(r).toEqual({ type: 'sous-le-seuil-de-cotisation-minimum' });
    expect(cfeDue(r)).toBe(false);
  });

  /** C'est un seuil de dispense, pas un abattement : un euro au-dessus et tout est dû. */
  it('rend la cotisation due dès le premier euro au-dessus', () => {
    const r = regimeCfe(ancienne, 2026, euros(5001));
    expect(r).toEqual({ type: 'droit-commun' });
    expect(cfeDue(r)).toBe(true);
  });

  /**
   * LE PIÈGE. Une entreprise trop jeune pour avoir un N−2 n'a pas « 0 € de
   * recettes en N−2 » : elle n'a pas de N−2. Traiter l'absence comme un zéro
   * la dispenserait à tort, et son disponible serait surestimé.
   */
  it('ne dispense pas une entreprise dont le chiffre de référence est inconnu', () => {
    const r = regimeCfe(ancienne, 2026, null);
    expect(r).toEqual({ type: 'droit-commun' });
  });

  // Sans date de début connue, on ne peut affirmer aucune exonération liée à
  // l'ancienneté : le droit commun est la position prudente.
  it('retient le droit commun quand la date de début est inconnue', () => {
    expect(regimeCfe(null, 2026, euros(40000))).toEqual({ type: 'droit-commun' });
  });
});

describe('cotisation, à partir de l’avis', () => {
  const droitCommun = regimeCfe(dateISO('2015-01-01'), 2026, euros(40000));

  it('multiplie la base notifiée par le taux voté', () => {
    expect(cotisationCfe(euros(600), 0.265, droitCommun)).toBe(159);
  });

  // La réduction porte sur la BASE, pas sur le résultat : l'ordre importerait
  // si l'arrondi intervenait avant la division.
  it('réduit la base de moitié la première année d’imposition', () => {
    const premiere = regimeCfe(dateISO('2025-06-01'), 2026, euros(40000));
    expect(cotisationCfe(euros(600), 0.265, premiere)).toBe(80);
  });

  it('ne réclame rien quand rien n’est dû', () => {
    expect(cotisationCfe(euros(600), 0.265, { type: 'exonere-creation' })).toBe(0);
    expect(cotisationCfe(euros(600), 0.265, { type: 'sous-le-seuil-de-cotisation-minimum' }))
      .toBe(0);
  });

  // L'administration liquide à l'euro ; afficher des centimes donnerait une
  // précision que le calcul n'a pas.
  it('arrondit à l’euro', () => {
    expect(Number.isInteger(cotisationCfe(euros(577), 0.2673, droitCommun))).toBe(true);
  });
});

describe('calendrier', () => {
  it('date le paiement au 15 décembre', () => {
    expect(paiementCfe(2026).date).toBe('2026-12-15');
  });

  /**
   * Le préavis vaut 75 jours, soit début octobre. Ce n'est pas un réglage
   * esthétique : l'avis ne paraît qu'en novembre, et provisionner suppose de
   * savoir AVANT qu'il y aura quelque chose à payer.
   */
  it('prévient assez tôt pour qu’il reste de quoi provisionner', () => {
    expect(paiementCfe(2026).preavisJours).toBeGreaterThanOrEqual(60);
  });

  it('appelle un acompte au 15 juin au-delà de 3 000 € l’an passé', () => {
    const a = acompteCfe(2026, euros(3200));
    expect(a?.date).toBe('2026-06-15');
    expect(a?.intitule).toMatch(/50 %/);
  });

  /** Annoncer un acompte non dû ferait provisionner deux fois la même CFE. */
  it('n’appelle aucun acompte en dessous du seuil', () => {
    expect(acompteCfe(2026, euros(2999))).toBeNull();
  });

  it('appelle l’acompte pile au seuil', () => {
    expect(acompteCfe(2026, euros(3000))).not.toBeNull();
  });
});

/**
 * LA FORMALITÉ QUI N'ÉTAIT MODÉLISÉE NULLE PART.
 *
 * La 1447-C établit la base d'imposition. Ne pas la déposer n'annule pas la
 * CFE : cela fait perdre l'exonération de première année et expose à une
 * taxation d'office. Elle est due avant le 1er janvier suivant la création.
 */
describe('déclaration initiale 1447-C', () => {
  it('échoit le 31 décembre de l’année de création', () => {
    const d = declaration1447C(dateISO('2026-04-02'), 2026);
    expect(d?.date).toBe('2026-12-31');
    expect(d?.intitule).toMatch(/1447-C/);
  });

  /**
   * Hors de l'année de création, elle disparaît. Une échéance passée qui reste
   * affichée devient un reproche permanent, et on cesse de lire les autres.
   */
  it('ne se rappelle pas les années suivantes', () => {
    expect(declaration1447C(dateISO('2024-04-02'), 2026)).toBeNull();
  });

  it('ne se rappelle pas avant la création', () => {
    expect(declaration1447C(dateISO('2027-01-10'), 2026)).toBeNull();
  });

  it('ne s’invente pas sans date de début', () => {
    expect(declaration1447C(null, 2026)).toBeNull();
  });
});
