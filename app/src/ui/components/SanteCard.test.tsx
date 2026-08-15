/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SanteCard, indicateursDeSante, syntheseDeSante } from './SanteCard';

afterEach(cleanup);

const SAIN = {
  dispo: 3000, provisions: 980, impayes: 0, montantImpaye: 0, periodesEnRetard: 0
};

describe('constats de santé', () => {
  it('dit que les provisions sont couvertes quand le disponible tient', () => {
    const [provisions] = indicateursDeSante(SAIN);
    expect(provisions?.etat).toBe('bon');
  });

  /**
   * Un disponible négatif signifie que les provisions dépassent le solde :
   * l'argent des cotisations a déjà été dépensé. Ce n'est pas une nuance,
   * c'est une alerte.
   */
  it('alerte quand le disponible ne couvre plus les provisions', () => {
    const [provisions] = indicateursDeSante({ ...SAIN, dispo: -1200 });
    expect(provisions?.etat).toBe('alerte');
    expect(provisions?.valeur).toMatch(/il manque/);
  });

  it('distingue « rien à provisionner » de « couvert »', () => {
    const [provisions] = indicateursDeSante({ ...SAIN, provisions: 0 });
    expect(provisions?.valeur).toMatch(/rien à provisionner/);
    expect(provisions?.etat).toBe('bon');
  });

  it('compte les impayés et leur montant', () => {
    const [, factures] = indicateursDeSante({
      ...SAIN, impayes: 3, montantImpaye: 12000
    });
    expect(factures?.etat).toBe('attention');
    expect(factures?.valeur).toMatch(/3 en attente/);
  });

  it('alerte sur les périodes non déclarées', () => {
    const [, , declarations] = indicateursDeSante({ ...SAIN, periodesEnRetard: 2 });
    expect(declarations?.etat).toBe('alerte');
    expect(declarations?.valeur).toMatch(/2 périodes en retard/);
  });
});

describe('carte santé', () => {
  /**
   * La maquette affichait « 78/100 », mais la spec relève que ces valeurs
   * sont écrites en dur, sans aucune fonction pour les calculer. Inventer la
   * formule produirait un chiffre d'apparence officielle que personne n'a
   * validé — et une note se retient, se compare, puis commande des décisions.
   */
  it('n’affiche aucune note globale inventée', () => {
    render(<SanteCard indicateurs={indicateursDeSante(SAIN)} autonomie={4.2} />);
    expect(screen.queryByText(/\/\s?100/)).toBeNull();
  });

  it('affiche les trois constats', () => {
    render(<SanteCard indicateurs={indicateursDeSante(SAIN)} autonomie={4.2} />);
    expect(screen.getByText('Provisions couvertes')).toBeTruthy();
    expect(screen.getByText('Factures')).toBeTruthy();
    expect(screen.getByText('Déclarations')).toBeTruthy();
  });

  // Sans besoin mensuel renseigné, l'autonomie n'est pas calculable : afficher
  // « 0 mois » ferait croire à une trésorerie à sec.
  it('dit que l’autonomie est inconnue plutôt que d’afficher zéro', () => {
    render(<SanteCard indicateurs={indicateursDeSante(SAIN)} autonomie={null} />);
    expect(screen.getByText('Autonomie inconnue')).toBeTruthy();
  });
});

/**
 * LE COUP D'ŒIL, SANS INVENTER DE NOTE.
 *
 * Refuser le « 78/100 » était juste : sa formule aurait été inventée. Mais le
 * score répondait à une vraie question — « est-ce que ça va ? » — en UNE
 * information, et trois pastilles en font trois. La phrase répond à la même
 * question sans rien pondérer : elle nomme LE PLUS GRAVE.
 */
describe('phrase de synthèse', () => {
  const sain = { dispo: 5000, provisions: 2000, impayes: 0, montantImpaye: 0, periodesEnRetard: 0 };

  it('ne réclame rien quand les trois constats sont bons', () => {
    const s = syntheseDeSante(indicateursDeSante(sain));
    expect(s.ton).toBe('bon');
    expect(s.phrase).toMatch(/Rien ne réclame/);
  });

  /**
   * LE POINT QUI COMPTE. L'ordre est une GRAVITÉ, pas une pondération : une
   * provision non couverte est le seul des trois qui soit DÉJÀ dépensé, et il
   * passe donc devant une déclaration en retard comme devant un impayé.
   */
  it('nomme la provision non couverte avant tout le reste', () => {
    const s = syntheseDeSante(indicateursDeSante({
      ...sain, dispo: -1240, impayes: 3, montantImpaye: 9000, periodesEnRetard: 2
    }));
    expect(s.ton).toBe('alerte');
    expect(s.phrase).toMatch(/Provisions/);
    expect(s.phrase).toMatch(/1\s*240/u);
  });

  /** Une déclaration en retard passe devant un impayé : sa pénalité court seule. */
  it('place la déclaration en retard devant l’impayé', () => {
    const s = syntheseDeSante(indicateursDeSante({
      ...sain, impayes: 2, montantImpaye: 4000, periodesEnRetard: 1
    }));
    expect(s.phrase).toMatch(/Déclarations/);
  });

  /** Un impayé seul ne déclenche qu'une attention : un tiers doit, rien n'est perdu. */
  it('signale l’impayé sans en faire une alerte', () => {
    const s = syntheseDeSante(indicateursDeSante({
      ...sain, impayes: 1, montantImpaye: 4000
    }));
    expect(s.ton).toBe('attention');
    expect(s.phrase).toMatch(/Factures/);
  });

  /**
   * Le sujet est nommé ET chiffré : « attention » sans dire à quoi oblige à
   * aller chercher, ce qui est exactement ce que le coup d'œil doit éviter.
   */
  it('chiffre ce qu’elle nomme', () => {
    const s = syntheseDeSante(indicateursDeSante({
      ...sain, impayes: 2, montantImpaye: 7500
    }));
    expect(s.phrase).toMatch(/7\s*500/u);
  });

  /** Une liste vide ne fait pas échouer la carte. */
  it('ne casse pas sur une liste vide', () => {
    expect(syntheseDeSante([]).ton).toBe('bon');
  });
});
