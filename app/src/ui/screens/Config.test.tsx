/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mois } from '../../domain/types';
import { PERIODES_URSSAF } from '../../domain/bareme/urssaf';
import { type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { periodesUrssafEffectives } from '../../state/selecteurs';
import { Config } from './Config';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2027-01-20T09:00:00Z'));
  useFaits.setState({ faits: faitsVides(), chargement: { phase: 'initial' } });
});

const utilisateurTest = () => userEvent.setup();

async function ouvrirBareme() {
  render(<Config />);
  await utilisateurTest().click(screen.getByRole('tab', { name: 'Barème' }));
}

async function saisirPeriode(
  utilisateur: ReturnType<typeof userEvent.setup>,
  { du, bnc, source }: { du: string; bnc: string; source: string }
) {
  await utilisateur.type(screen.getByLabelText('À partir du mois'), du);
  await utilisateur.type(screen.getByLabelText('Taux BNC (%)'), bnc);
  await utilisateur.type(screen.getByLabelText('Taux BIC service (%)'), '21,2');
  await utilisateur.type(screen.getByLabelText('Taux BIC vente (%)'), '12,3');
  await utilisateur.type(screen.getByLabelText('Source'), source);
  await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la période' }));
}

describe('profil', () => {
  // L'ancienne version avait un formulaire à valider, et la moitié des champs
  // n'étaient jamais persistés faute de clic sur « Enregistrer ».
  it('écrit dans les faits sans bouton d’enregistrement', async () => {
    render(<Config />);
    const utilisateur = utilisateurTest();
    await utilisateur.type(screen.getByLabelText('Nom'), 'Exemple');
    expect(useFaits.getState().faits.entreprise.nom).toBe('Exemple');
  });

  it('change le type d’activité, qui détermine taux, abattement et plafond', async () => {
    render(<Config />);
    const utilisateur = utilisateurTest();
    await utilisateur.selectOptions(
      screen.getByLabelText('Type d’activité'), 'BIC_service'
    );
    expect(useFaits.getState().faits.entreprise.typeActivite).toBe('BIC_service');
  });

  // Discriminant exclusif : l'ancienne version cumulait versement libératoire
  // et barème progressif, et surestimait l'impôt à provisionner.
  it('bascule le versement libératoire', async () => {
    render(<Config />);
    const utilisateur = utilisateurTest();
    await utilisateur.click(
      screen.getByRole('checkbox', { name: /Versement libératoire/ })
    );
    expect(useFaits.getState().faits.entreprise.versementLiberatoire).toBe(true);
  });

  it('laisse la TVA vide en franchise en base', async () => {
    render(<Config />);
    expect(screen.getByLabelText(/Assujetti à la TVA depuis/)).toHaveProperty('value', '');
    expect(useFaits.getState().faits.entreprise.tvaDepuis).toBeNull();
  });
});

describe('barème affiché', () => {
  // Une table affichée qui différerait de celle appliquée serait exactement le
  // genre de divergence que la refonte cherche à rendre impossible.
  it('montre la table réellement appliquée par les calculs', async () => {
    await ouvrirBareme();
    const table = screen.getByRole('table');
    for (const p of PERIODES_URSSAF) {
      expect(within(table).getByText(new RegExp(`^${p.du} →`))).toBeTruthy();
    }
  });

  it('affiche la source et la date de vérification de chaque période', async () => {
    await ouvrirBareme();
    const table = screen.getByRole('table');
    // Une cellule de source par période. Elles ne portent pas toutes la même
    // valeur depuis que la période 2026 cite le décret qui l'a fixée : on
    // compte donc les occurrences de chaque source distincte.
    const parSource = new Map<string, number>();
    for (const p of PERIODES_URSSAF) {
      parSource.set(p.source, (parSource.get(p.source) ?? 0) + 1);
    }
    for (const [source, attendu] of parSource) {
      expect(within(table).getAllByText(source)).toHaveLength(attendu);
    }
  });
});

describe('ajout d’une période', () => {
  // Sans cette porte d'entrée, un taux périmé resterait appliqué
  // indéfiniment — ou l'alerte de fraîcheur bloquerait sans qu'on la lève.
  it('prolonge le barème sans redéploiement', async () => {
    await ouvrirBareme();
    const utilisateur = utilisateurTest();
    await saisirPeriode(utilisateur, { du: '2027-01', bnc: '27,2', source: 'avis du 12/01/2027' });

    const ajoutees = useFaits.getState().faits.periodesUrssafAjoutees;
    expect(ajoutees).toHaveLength(1);
    expect(ajoutees[0]?.taux.BNC).toBeCloseTo(0.272, 10);
    expect(screen.getByRole('status').textContent).toMatch(/Période ajoutée/);
  });

  it('ferme la période qui restait ouverte', async () => {
    await ouvrirBareme();
    await saisirPeriode(utilisateurTest(), { du: '2027-01', bnc: '27,2', source: 'avis' });

    const effectives = periodesUrssafEffectives(useFaits.getState().faits);
    expect(effectives.filter((p) => p.au === null)).toHaveLength(1);
    expect(effectives[effectives.length - 1]?.du).toBe('2027-01');
  });

  // Le taux d'un mois écoulé est un fait publié : réécrire une période close
  // ferait diverger les recalculs des déclarations déjà envoyées.
  it('refuse une période tombant dans un barème passé, en disant pourquoi', async () => {
    await ouvrirBareme();
    await saisirPeriode(utilisateurTest(), { du: '2024-03', bnc: '30', source: 'avis' });

    expect(screen.getByRole('alert').textContent).toMatch(/barème passé|période close/i);
    expect(useFaits.getState().faits.periodesUrssafAjoutees).toHaveLength(0);
  });

  // Un taux sans provenance ne peut pas être vérifié plus tard.
  it('refuse une période sans source', async () => {
    await ouvrirBareme();
    const utilisateur = utilisateurTest();
    await utilisateur.type(screen.getByLabelText('À partir du mois'), '2027-01');
    await utilisateur.type(screen.getByLabelText('Taux BNC (%)'), '27,2');
    await utilisateur.type(screen.getByLabelText('Taux BIC service (%)'), '21,2');
    await utilisateur.type(screen.getByLabelText('Taux BIC vente (%)'), '12,3');
    await utilisateur.type(screen.getByLabelText('Source'), '   ');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la période' }));

    expect(screen.getByRole('alert').textContent).toMatch(/source/i);
    expect(useFaits.getState().faits.periodesUrssafAjoutees).toHaveLength(0);
  });

  it('refuse un taux illisible plutôt que d’enregistrer zéro', async () => {
    await ouvrirBareme();
    await saisirPeriode(utilisateurTest(), { du: '2027-01', bnc: 'beaucoup', source: 'avis' });

    expect(screen.getByRole('alert').textContent).toMatch(/pourcentage/i);
    expect(useFaits.getState().faits.periodesUrssafAjoutees).toHaveLength(0);
  });

  // La date de vérification est celle de la saisie : le jour où un humain a
  // lu la valeur à sa source.
  it('horodate la vérification au jour de la saisie', async () => {
    await ouvrirBareme();
    await saisirPeriode(utilisateurTest(), { du: '2027-01', bnc: '27,2', source: 'avis' });
    expect(useFaits.getState().faits.periodesUrssafAjoutees[0]?.verifieLe).toBe('2027-01-20');
  });

  it('distingue visuellement une période saisie d’une période livrée', async () => {
    await ouvrirBareme();
    await saisirPeriode(utilisateurTest(), { du: '2027-01', bnc: '27,2', source: 'avis' });
    expect(screen.getByText('saisie')).toBeTruthy();
  });

  it('rend la main au barème livré quand la période saisie est retirée', async () => {
    await ouvrirBareme();
    const utilisateur = utilisateurTest();
    await saisirPeriode(utilisateur, { du: '2027-01', bnc: '27,2', source: 'avis' });
    await utilisateur.click(screen.getByRole('button', { name: 'Retirer' }));

    expect(useFaits.getState().faits.periodesUrssafAjoutees).toHaveLength(0);
    const effectives = periodesUrssafEffectives(useFaits.getState().faits);
    expect(effectives).toEqual(PERIODES_URSSAF);
  });

  // Le seul moyen de corriger une valeur livrée fausse sans attendre un
  // déploiement.
  it('permet de corriger une période livrée, à début identique', async () => {
    await ouvrirBareme();
    await saisirPeriode(utilisateurTest(), { du: '2026-01', bnc: '25,9', source: 'avis réel' });

    expect(useFaits.getState().faits.periodesUrssafAjoutees).toHaveLength(1);
    const effectives = periodesUrssafEffectives(useFaits.getState().faits);
    expect(effectives).toHaveLength(PERIODES_URSSAF.length);
    expect(effectives[effectives.length - 1]?.taux.BNC).toBeCloseTo(0.259, 10);
  });
});

describe('données', () => {
  async function ouvrirDonnees(faits: Partial<Faits> = {}) {
    useFaits.setState({ faits: { ...faitsVides(), ...faits } });
    render(<Config />);
    await utilisateurTest().click(screen.getByRole('tab', { name: 'Données' }));
  }

  it('dit combien de faits sont conservés, et où', async () => {
    await ouvrirDonnees({ periodesDeclarees: [mois('2026-06')] });
    expect(screen.getByText('Périodes déclarées').nextSibling?.textContent).toBe('1');
    expect(screen.getByText('freel.faits.v1')).toBeTruthy();
  });

  // Laisser croire à une sauvegarde complète serait pire que de ne rien dire.
  it('annonce que les justificatifs ne sont pas dans l’export', async () => {
    await ouvrirDonnees();
    expect(screen.getByText(/justificatifs n’y sont pas/)).toBeTruthy();
  });

  it('avertit quand rien n’est conservé', async () => {
    useFaits.setState({
      faits: faitsVides(),
      chargement: { phase: 'sans-persistance', motif: 'Stockage bloqué.' }
    });
    render(<Config />);
    await utilisateurTest().click(screen.getByRole('tab', { name: 'Données' }));
    expect(screen.getByRole('alert').textContent).toBe('Stockage bloqué.');
  });
});

// D5 : elle proposait des actions que rien ne rattachait aux faits.
describe('propositions retirées', () => {
  it('ne comporte plus de section « Propositions Claude Code »', () => {
    render(<Config />);
    expect(screen.queryByText(/Propositions Claude/i)).toBeNull();
  });
});
