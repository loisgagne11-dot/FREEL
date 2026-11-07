/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SanteCard, indicateursDeSante, syntheseDeSante } from './SanteCard';

afterEach(cleanup);

const SAIN = {
  dispo: 3000, provisions: 980, facturesEnRetard: 0, montantEnRetard: 0,
  declarationsEnRetard: 0, declarationAvant: null, regime: null
} as const;

const constat = (i: ReturnType<typeof indicateursDeSante>, id: string) => i.find((x) => x.id === id);

describe('constats de santé', () => {
  it('dit que les provisions sont couvertes quand le disponible tient', () => {
    expect(constat(indicateursDeSante(SAIN), 'provisions')?.etat).toBe('bon');
  });

  /**
   * Un disponible négatif signifie que les provisions dépassent le solde :
   * l'argent des cotisations a déjà été dépensé. Ce n'est pas une nuance,
   * c'est une alerte.
   */
  it('alerte quand le disponible ne couvre plus les provisions', () => {
    const p = constat(indicateursDeSante({ ...SAIN, dispo: -1200 }), 'provisions');
    expect(p?.etat).toBe('alerte');
    expect(p?.valeur).toMatch(/il manque/);
  });

  it('distingue « rien à provisionner » de « couvert »', () => {
    const p = constat(indicateursDeSante({ ...SAIN, provisions: 0 }), 'provisions');
    expect(p?.valeur).toMatch(/rien à provisionner/);
    expect(p?.etat).toBe('bon');
  });

  /**
   * LES FACTURES EN RETARD, PAS EN ATTENTE.
   *
   * Le constat comptait les factures en attente : une facture à trente jours,
   * parfaitement normale, y passait pour un problème.
   */
  it('compte les factures en retard et leur montant', () => {
    const f = constat(indicateursDeSante({ ...SAIN, facturesEnRetard: 2, montantEnRetard: 3000 }), 'factures');
    expect(f?.etat).toBe('attention');
    expect(f?.libelle).toBe('Factures en retard');
    expect(f?.valeur).toMatch(/2 factures · 3\s*000/u);
    expect(constat(indicateursDeSante(SAIN), 'factures')?.libelle).toBe('Factures à jour');
  });

  it('alerte sur les périodes en retard, prévient d’une déclaration à faire', () => {
    expect(constat(indicateursDeSante({ ...SAIN, declarationsEnRetard: 2 }), 'declarations')?.etat)
      .toBe('alerte');
    const aFaire = constat(indicateursDeSante({ ...SAIN, declarationAvant: '2026-07-31' }), 'declarations');
    expect(aFaire?.etat).toBe('attention');
    expect(aFaire?.valeur).toMatch(/avant le 31 juil/);
  });

  // Une ligne « régime : rien » en permanence apprendrait à ne plus lire la barre.
  it('ne montre le régime que lorsqu’il change', () => {
    expect(constat(indicateursDeSante(SAIN), 'regime')).toBeUndefined();
    expect(constat(indicateursDeSante({ ...SAIN, regime: 'plafond du micro dépassé' }), 'regime')?.etat)
      .toBe('alerte');
  });
});

describe('barre santé', () => {
  /**
   * La maquette affichait « 78/100 », mais ces valeurs sont écrites en dur,
   * sans fonction pour les calculer. Inventer la formule produirait un chiffre
   * d'apparence officielle que personne n'a validé.
   */
  it('n’affiche aucune note globale inventée', () => {
    render(<SanteCard indicateurs={indicateursDeSante(SAIN)} autonomie={4.2} reserve={2470} />);
    expect(screen.queryByText(/\/\s?100/)).toBeNull();
  });

  it('affiche les trois constats', () => {
    render(<SanteCard indicateurs={indicateursDeSante(SAIN)} autonomie={4.2} reserve={2470} />);
    expect(screen.getByText('Provisions couvertes')).toBeTruthy();
    expect(screen.getByText('Factures à jour')).toBeTruthy();
    expect(screen.getByText('Déclarations à jour')).toBeTruthy();
  });

  // Sans besoin mensuel, l'autonomie n'est pas calculable : « 0 mois » ferait
  // croire à une trésorerie à sec.
  it('dit que l’autonomie est inconnue plutôt que d’afficher zéro', () => {
    render(<SanteCard indicateurs={indicateursDeSante(SAIN)} autonomie={null} reserve={2470} />);
    expect(screen.getByText('Autonomie inconnue')).toBeTruthy();
  });
});

/**
 * LE COUP D'ŒIL, SANS INVENTER DE NOTE.
 *
 * La phrase répond à « est-ce que ça va ? » sans rien pondérer : elle nomme
 * LE PLUS GRAVE, dans un ordre écrit.
 */
describe('phrase de synthèse', () => {
  it('dit « tout est en ordre » quand les constats sont bons', () => {
    const s = syntheseDeSante(indicateursDeSante(SAIN));
    expect(s.ton).toBe('bon');
    expect(s.phrase).toBe('Tout est en ordre.');
  });

  /**
   * L'ordre est une GRAVITÉ : une provision à découvert est le seul constat
   * DÉJÀ dépensé, et passe devant tout le reste.
   */
  it('nomme la provision à découvert avant tout le reste', () => {
    const s = syntheseDeSante(indicateursDeSante({
      ...SAIN, dispo: -1240, facturesEnRetard: 3, montantEnRetard: 9000,
      declarationsEnRetard: 2, regime: 'TVA due'
    }));
    expect(s.ton).toBe('alerte');
    expect(s.phrase).toMatch(/Provisions à découvert/);
    expect(s.phrase).toMatch(/1\s*240/u);
  });

  /** Une déclaration en retard passe devant un changement de régime. */
  it('place la déclaration en retard devant le régime', () => {
    const s = syntheseDeSante(indicateursDeSante({ ...SAIN, declarationsEnRetard: 1, regime: 'TVA due' }));
    expect(s.phrase).toMatch(/Déclarations en retard/);
  });

  /**
   * Le régime passe devant une facture en retard : la liste des décisions le
   * classe « en retard » — la phrase ne peut pas dire « tout va bien » à côté.
   */
  it('place le régime devant la facture en retard', () => {
    const s = syntheseDeSante(indicateursDeSante({
      ...SAIN, facturesEnRetard: 1, montantEnRetard: 1200, regime: 'plafond du micro dépassé'
    }));
    expect(s.phrase).toMatch(/plafond du micro dépassé/);
  });

  /** Une facture en retard passe devant une déclaration encore dans sa fenêtre. */
  it('place la facture en retard devant la déclaration à faire', () => {
    const s = syntheseDeSante(indicateursDeSante({
      ...SAIN, facturesEnRetard: 1, montantEnRetard: 1200, declarationAvant: '2026-07-31'
    }));
    expect(s.ton).toBe('attention');
    expect(s.phrase).toMatch(/Factures en retard/);
  });

  it('ne casse pas sur une liste vide', () => {
    expect(syntheseDeSante([]).ton).toBe('bon');
  });
});

// Le seul endroit du Pilote où la réserve paraît : l'autonomie la nomme.
it('nomme la réserve que l’autonomie ne touche pas', () => {
  render(<SanteCard indicateurs={indicateursDeSante(SAIN)} autonomie={4.2} reserve={2470} />);
  expect(screen.getByText(/d’autonomie/).textContent).toMatch(/réserve de 2\s*470/u);
});

