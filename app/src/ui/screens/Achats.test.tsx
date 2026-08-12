/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros, mois, ratio } from '../../domain/types';
import { type Depense, type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { stockageMemoireJustificatifs } from '../../infra/justificatifs';
import { Achats } from './Achats';

afterEach(cleanup);

function depense(m: Partial<Depense> = {}): Depense {
  return {
    id: 'd1', libelle: 'Abonnement', fournisseur: 'Fournisseur',
    provenance: 'france', montantTtc: euros(120), tauxTva: ratio(0.20),
    payeeLe: dateISO('2026-09-10'), justificatifId: null,
    rapprochement: 'en_attente', ...m
  };
}

/**
 * Sème le magasin sans passer par la persistance : les écrans se testent sur
 * des faits, pas sur un `localStorage` reconstitué.
 */
function semer(modifications: Partial<Faits> = {}): void {
  const base = faitsVides();
  useFaits.setState({
    faits: {
      ...base,
      entreprise: { ...base.entreprise, tvaDepuis: mois('2026-01') },
      ...modifications
    }
  });
}

beforeEach(() => semer());

function rendre(stockage = stockageMemoireJustificatifs()) {
  const rendu = render(<Achats stockage={stockage} />);
  return { ...rendu, stockage };
}

describe('ce que l’absence de pièce coûte', () => {
  // « Justificatif manquant » n'incite personne à chercher une facture ; un
  // montant, si. C'est toute la raison d'être de l'écran.
  it('chiffre la TVA non récupérable faute de pièce', () => {
    semer({ depenses: [depense()] });
    rendre();
    const bandeau = screen.getByText(/sans justificatif/i);
    expect(bandeau.textContent).toMatch(/20,00|20\s?€/);
  });

  it('ne montre aucun avertissement quand toutes les pièces sont là', () => {
    semer({ depenses: [depense({ justificatifId: 'p1' })] });
    rendre();
    expect(screen.queryByText(/sans justificatif/i)).toBeNull();
  });

  it('marque chaque ligne sans pièce', () => {
    semer({ depenses: [depense()] });
    rendre();
    expect(screen.getByText('Sans pièce')).toBeTruthy();
    expect(screen.getByText('TVA non récupérable')).toBeTruthy();
  });
});

describe('dépôt d’une pièce', () => {
  it('conserve le fichier, le rattache, et la TVA devient récupérable', async () => {
    semer({ depenses: [depense()] });
    const { stockage } = rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));
    const champ = await screen.findByLabelText(/Déposer une pièce/i);
    await utilisateur.upload(
      champ,
      new File(['contenu de la facture'], 'facture.pdf', { type: 'application/pdf' })
    );

    // La pièce est réellement conservée, pas seulement annoncée.
    await waitFor(() => expect(stockage.contenu.size).toBe(1));
    const depenseFinale = useFaits.getState().faits.depenses[0];
    expect(depenseFinale?.justificatifId).not.toBeNull();
    await screen.findByText(/Pièce conservée : facture\.pdf/);
  });

  // Un fichier refusé ne doit surtout pas rendre la TVA récupérable : c'est
  // exactement le `piece: true` sans fichier de l'ancienne version.
  it('refuse un format non accepté sans rien rattacher, et dit pourquoi', async () => {
    semer({ depenses: [depense()] });
    const { stockage } = rendre();
    // `applyAccept: false` reproduit ce que fait un utilisateur réel : le
    // filtre `accept` du sélecteur de fichiers se contourne d'un clic sur
    // « tous les fichiers ». Le contrôle qui compte est celui du domaine, pas
    // celui du sélecteur.
    const utilisateur = userEvent.setup({ applyAccept: false });

    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));
    await utilisateur.upload(
      await screen.findByLabelText(/Déposer une pièce/i),
      new File(['<html>'], 'page.html', { type: 'text/html' })
    );

    await screen.findByText(/Format non accepté/);
    expect(stockage.contenu.size).toBe(0);
    expect(useFaits.getState().faits.depenses[0]?.justificatifId).toBeNull();
  });

  // C'est ce contrôle qui donne sa valeur à l'empreinte : la stocker sans
  // jamais la recalculer n'apporterait rien.
  it('sait dire qu’une pièce conservée est intacte', async () => {
    semer({ depenses: [depense()] });
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));
    await utilisateur.upload(
      await screen.findByLabelText(/Déposer une pièce/i),
      new File(['abc'], 'facture.pdf', { type: 'application/pdf' })
    );
    await screen.findByText(/Pièce conservée : facture\.pdf/);

    await utilisateur.click(screen.getByRole('button', { name: /Vérifier l’intégrité/ }));
    await screen.findByText(/intacte depuis son dépôt/);
  });

  it('détecte une pièce altérée après son dépôt', async () => {
    semer({ depenses: [depense()] });
    const { stockage } = rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));
    await utilisateur.upload(
      await screen.findByLabelText(/Déposer une pièce/i),
      new File(['abc'], 'facture.pdf', { type: 'application/pdf' })
    );
    await waitFor(() => expect(stockage.contenu.size).toBe(1));

    // Substitution du contenu sous le même identifiant.
    const [id, piece] = [...stockage.contenu.entries()][0] as [string, never];
    stockage.contenu.set(id, { ...(piece as object), contenu: new Blob(['falsifié']) } as never);

    await utilisateur.click(screen.getByRole('button', { name: /Vérifier l’intégrité/ }));
    await screen.findByText(/a été modifiée/);
  });
});

describe('franchise en base', () => {
  // L'ancienne application affichait « TVA déductible 760 € » à un utilisateur
  // en franchise, qui n'a droit à rien.
  it('n’annonce aucune TVA récupérable, ni aucune perte', () => {
    semer({
      entreprise: { ...faitsVides().entreprise, tvaDepuis: null },
      depenses: [depense({ justificatifId: 'p1' })]
    });
    rendre();
    expect(screen.getByText('Franchise')).toBeTruthy();
    expect(screen.queryByText(/sans justificatif/i)).toBeNull();
  });
});

describe('achats hors de France', () => {
  it('annonce la TVA à autoliquider', () => {
    semer({
      depenses: [depense({ provenance: 'ue', montantTtc: euros(100), tauxTva: ratio(0) })]
    });
    rendre();
    expect(screen.getByText(/à autoliquider/i)).toBeTruthy();
    expect(screen.getByText('Autoliquidation')).toBeTruthy();
  });
});

describe('rapprochement bancaire', () => {
  it('n’offre aucun réglage tant qu’aucun relevé n’est disponible', async () => {
    semer({ depenses: [depense()], banqueReliee: false });
    rendre();
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));

    expect(screen.getAllByText(/Aucun relevé bancaire/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Rapprochée' })).toBeNull();
  });

  it('devient corrigeable dès qu’un relevé est disponible', async () => {
    semer({ depenses: [depense()], banqueReliee: true });
    rendre();
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));

    await utilisateur.click(screen.getByRole('button', { name: 'Rapprochée' }));
    expect(useFaits.getState().faits.depenses[0]?.rapprochement).toBe('rapproche');
  });
});

describe('saisie', () => {
  // Le taux est saisi, jamais supposé : l'ancienne version appliquait 20 % par
  // défaut, y compris sur des dépenses qui n'en portaient pas.
  it('enregistre une dépense sans pièce, et enchaîne sur le dépôt', async () => {
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter une dépense' }));
    await utilisateur.type(screen.getByLabelText('Libellé'), 'Train Paris-Lyon');
    await utilisateur.type(screen.getByLabelText('Montant TTC (€)'), '88');
    await utilisateur.clear(screen.getByLabelText('Taux de TVA (%)'));
    await utilisateur.type(screen.getByLabelText('Taux de TVA (%)'), '10');
    await utilisateur.click(screen.getByRole('button', { name: /Ajouter, puis déposer la pièce/ }));

    const enregistree = useFaits.getState().faits.depenses[0];
    expect(enregistree?.libelle).toBe('Train Paris-Lyon');
    expect(enregistree?.montantTtc).toBe(88);
    expect(enregistree?.tauxTva).toBeCloseTo(0.10, 10);
    // Une dépense naît sans pièce, et l'écran le dit tout de suite.
    expect(enregistree?.justificatifId).toBeNull();
    expect(await screen.findByLabelText(/Déposer une pièce/i)).toBeTruthy();
  });

  it('refuse un montant nul plutôt que d’enregistrer une ligne vide', async () => {
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter une dépense' }));
    await utilisateur.type(screen.getByLabelText('Libellé'), 'Vide');
    await utilisateur.type(screen.getByLabelText('Montant TTC (€)'), '0');
    await utilisateur.click(screen.getByRole('button', { name: /Ajouter, puis déposer la pièce/ }));

    expect(screen.getByRole('alert').textContent).toMatch(/supérieur à zéro/);
    expect(useFaits.getState().faits.depenses).toHaveLength(0);
  });

  // Fabriquer une date plausible rattacherait la dépense à un exercice et à un
  // régime de TVA choisis au hasard.
  it('accepte une dépense sans date, et la signale', async () => {
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter une dépense' }));
    await utilisateur.type(screen.getByLabelText('Libellé'), 'Sans date');
    await utilisateur.type(screen.getByLabelText('Montant TTC (€)'), '40');
    await utilisateur.click(screen.getByRole('button', { name: /Ajouter, puis déposer la pièce/ }));

    expect(useFaits.getState().faits.depenses[0]?.payeeLe).toBeNull();
    const liste = screen.getByRole('list');
    expect(within(liste).getByText('Date à saisir')).toBeTruthy();
  });
});

describe('liste vide', () => {
  it('dit ce qui manque au lieu d’afficher un tableau vide', () => {
    rendre();
    expect(screen.getByText(/Aucune dépense enregistrée/)).toBeTruthy();
  });
});
