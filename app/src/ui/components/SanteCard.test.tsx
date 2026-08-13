/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SanteCard, indicateursDeSante } from './SanteCard';

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
