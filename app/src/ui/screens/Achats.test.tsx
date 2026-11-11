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

// Les dépenses de test sont de septembre 2026 : l'écran s'ouvre désormais sur
// le mois de la barre du haut, pas sur « Tout ».
const MOIS_TEST = mois('2026-09');

function rendre(stockage = stockageMemoireJustificatifs()) {
  const rendu = render(<Achats stockage={stockage} mois={MOIS_TEST} />);
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

  it('marque chaque ligne sans pièce, et dit pourquoi la TVA manque', () => {
    semer({ depenses: [depense()] });
    rendre();
    expect(screen.getByRole('button', { name: 'à joindre' })).toBeTruthy();
    expect(screen.getByTitle('TVA non récupérable : pièce manquante')).toBeTruthy();
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
    expect(screen.getByTitle('Franchise en base')).toBeTruthy();
    expect(screen.queryByText(/sans justificatif/i)).toBeNull();
  });
});

describe('achats hors de France', () => {
  it('annonce la TVA à autoliquider', () => {
    // En franchise seulement : un assujetti déduit la TVA qu'il autoliquide.
    // Ce test passait autrefois sur le libellé de la tuile « À autoliquider »,
    // affiché en permanence — sans jamais vérifier le bandeau.
    semer({
      entreprise: { ...faitsVides().entreprise, tvaDepuis: null },
      depenses: [depense({ provenance: 'ue', montantTtc: euros(120), tauxTva: ratio(0.2) })]
    });
    rendre();
    expect(screen.getByText(/de TVA à autoliquider/i)).toBeTruthy();
    expect(screen.getByTitle('Autoliquidation')).toBeTruthy();
  });
});

describe('rapprochement bancaire', () => {
  it('n’offre aucun réglage tant qu’aucun relevé n’est disponible', async () => {
    semer({ depenses: [depense()], mouvementsBancaires: [] });
    rendre();
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));

    expect(screen.getAllByText(/Aucun relevé bancaire/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Rapprochée' })).toBeNull();
  });

  it('devient corrigeable dès qu’un relevé est disponible', async () => {
    semer({
      depenses: [depense()],
      mouvementsBancaires: [{
        id: 'mvt-1', date: dateISO('2026-09-10'), libelle: 'PRLV',
        montant: euros(-999), rapprocheAvec: null, sansContrepartie: null
      }]
    });
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
    // Une dépense sans date n'appartient à aucun mois : on la retrouve dans
    // « Tout », et son panneau s'ouvre quand même à la création.
    await utilisateur.click(screen.getByRole('button', { name: 'Tout' }));
    expect(within(screen.getByRole('table')).getByText('Date à saisir')).toBeTruthy();
  });
});

describe('liste vide', () => {
  it('dit ce qui manque au lieu d’afficher un tableau vide', () => {
    rendre();
    expect(screen.getByText(/Aucune dépense enregistrée/)).toBeTruthy();
  });
});

/**
 * La barre de période.
 *
 * Le mois, le trimestre et l'année ne sont pas des commodités de tri : ce sont
 * les mailles dans lesquelles on déclare. « Tout » a une fonction précise —
 * une dépense sans date de paiement n'appartient à aucune période bornée, et
 * c'est là qu'on la retrouve pour la corriger.
 */
describe('période d’observation', () => {
  it('propose les quatre mailles', () => {
    semer();
    render(<Achats />);
    ['Mois', 'Trimestre', 'Année', 'Tout'].forEach((m) => {
      expect(screen.getByRole('button', { name: m })).toBeTruthy();
    });
  });

  // Naviguer dans un ensemble qui contient déjà tout ne mène nulle part : une
  // flèche inerte apprendrait que les flèches ne servent parfois à rien.
  it('n’offre pas de navigation sur « Tout »', async () => {
    semer();
    render(<Achats />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tout' }));
    expect(screen.queryByRole('button', { name: 'Période précédente' })).toBeNull();
  });

  /**
   * PAS DE SECONDE PAIRE DE FLÈCHES.
   *
   * La période d'Achats est ancrée sur le mois de la barre du haut : ses
   * flèches à elle déplaçaient une autre période que celle de la barre, et
   * l'écran affichait deux « ‹ juin 2026 › » qui pouvaient se contredire.
   */
  it('laisse la navigation au mois de la barre du haut', async () => {
    semer();
    render(<Achats />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mois' }));
    expect(screen.queryByRole('button', { name: 'Période précédente' })).toBeNull();
  });
});

/**
 * CORRIGER SANS TOUT PERDRE.
 *
 * `modifierDepense` existait dans le magasin, aucun écran ne l'appelait : la
 * seule façon de rattraper une faute de saisie était de supprimer puis
 * ressaisir — ce qui détachait le justificatif déposé et remettait le
 * rapprochement à zéro. Autrement dit, corriger un libellé coûtait la pièce
 * justificative, qui est la seule chose ayant valeur probante.
 */
describe('corriger une dépense', () => {
  it('modifie la ligne sans en créer une seconde', async () => {
    semer({ depenses: [depense({ libelle: 'Abonnment' })] });
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: /Abonnment/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Corriger cette dépense' }));

    const champ = screen.getByLabelText('Libellé');
    await utilisateur.clear(champ);
    await utilisateur.type(champ, 'Abonnement');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer la correction' }));

    const depenses = useFaits.getState().faits.depenses;
    expect(depenses).toHaveLength(1);
    expect(depenses[0]?.libelle).toBe('Abonnement');
  });

  it('garde le justificatif attaché et l’état de rapprochement', async () => {
    semer({
      depenses: [depense({ justificatifId: 'j1', rapprochement: 'rapproche' })]
    });
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Corriger cette dépense' }));
    const champ = screen.getByLabelText('Libellé');
    await utilisateur.clear(champ);
    await utilisateur.type(champ, 'Autre libellé');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer la correction' }));

    const d = useFaits.getState().faits.depenses[0];
    expect(d?.justificatifId).toBe('j1');
    expect(d?.rapprochement).toBe('rapproche');
  });

  it('ouvre le formulaire déjà rempli, plutôt que vierge', async () => {
    semer({ depenses: [depense({ libelle: 'Abonnement', montantTtc: euros(120) })] });
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Corriger cette dépense' }));

    expect(screen.getByLabelText<HTMLInputElement>('Libellé').value).toBe('Abonnement');
    expect(screen.getByLabelText<HTMLInputElement>('Montant TTC (€)').value).toBe('120');
    expect(screen.getByLabelText<HTMLInputElement>('Taux de TVA (%)').value).toBe('20');
  });
});

/**
 * SUPPRIMER UNE DÉPENSE SE CONFIRME, ET DÉFAIT SON RAPPROCHEMENT.
 *
 * Un clic la retirait, et le mouvement du relevé qui lui était rapproché
 * restait « Rapprochée » à une écriture disparue : il sortait de la file à
 * traiter sans contrepartie au registre.
 */
describe('supprimer une dépense', () => {
  const rapprochee = () => ({
    depenses: [depense({ justificatifId: 'j1', rapprochement: 'rapproche' })],
    mouvementsBancaires: [{
      id: 'm1', date: dateISO('2026-09-10'), libelle: 'PRLV FOURNISSEUR', montant: euros(-120),
      rapprocheAvec: 'd1', sansContrepartie: null
    }]
  });

  it('dit ce qui part et ce qui reste, et ne supprime qu’à la confirmation', async () => {
    semer(rapprochee());
    rendre();
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer cette dépense' }));

    expect(useFaits.getState().faits.depenses).toHaveLength(1);
    const confirmation = screen.getByRole('group', { name: /quitte le registre/ });
    expect(confirmation.textContent).toMatch(/120.*chez Fournisseur.*10 sept/su);
    expect(confirmation.textContent).toMatch(/opération du relevé qui lui était rapprochée revient à traiter/);
    expect(confirmation.textContent).toMatch(/pièce n’est pas effacée/);

    await utilisateur.click(within(confirmation).getByRole('button', { name: 'Supprimer la dépense' }));
    expect(useFaits.getState().faits.depenses).toHaveLength(0);
  });

  it('remet à traiter le mouvement qui lui était rapproché', async () => {
    semer(rapprochee());
    rendre();
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer cette dépense' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer la dépense' }));

    expect(useFaits.getState().faits.mouvementsBancaires[0]?.rapprocheAvec).toBeNull();
  });

  // En franchise, il n'y a pas de TVA déductible à perdre : la phrase ne
  // l'invente pas.
  it('ne parle de TVA déductible que s’il y en a', async () => {
    semer({ ...rapprochee(), entreprise: { ...faitsVides().entreprise, tvaDepuis: null } });
    rendre();
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer cette dépense' }));
    expect(screen.getByRole('group', { name: /quitte le registre/ }).textContent).not.toMatch(/TVA déductible/);
  });

  it('dit que la TVA déductible part avec la dépense, chez un redevable', async () => {
    semer(rapprochee());
    rendre();
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer cette dépense' }));
    expect(screen.getByRole('group', { name: /quitte le registre/ }).textContent).toMatch(/et sa TVA déductible avec elle/);
  });

  it('« Garder » ne supprime rien', async () => {
    semer(rapprochee());
    rendre();
    const utilisateur = userEvent.setup();
    await utilisateur.click(screen.getByRole('button', { name: /Abonnement/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer cette dépense' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Garder' }));

    expect(useFaits.getState().faits.depenses).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Supprimer cette dépense' })).toBeTruthy();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Le mois de la barre du haut ancre la période de l'écran
   ───────────────────────────────────────────────────────────────────────── */

/**
 * LE MOIS ANCRE, IL NE FILTRE PAS.
 *
 * Avec l'ancre d'année, choisir « mars » dans la barre du haut laissait
 * Achats sur décembre. Le mois choisi est LE mois de l'application.
 */
describe('le mois choisi ancre la période', () => {
  it('ouvre sur le mois choisi, en maille « Mois » par défaut', () => {
    semer();
    render(<Achats mois={mois('2025-03')} />);
    expect(screen.getByText(/Dépenses · mars 2025/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mois' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('retombe sur le mois courant quand l’écran est monté seul', () => {
    semer();
    render(<Achats />);
    const attendu = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
      .format(new Date());
    expect(screen.getByText(`Dépenses · ${attendu}`)).toBeTruthy();
  });

  /** Ce sont les flèches de la barre du haut qui déplacent la période. */
  it('suit le mois de la barre quand il change', () => {
    semer();
    const rendu = render(<Achats mois={mois('2025-03')} />);
    rendu.rerender(<Achats mois={mois('2025-02')} />);
    expect(screen.getByText(/Dépenses · février 2025/)).toBeTruthy();
  });

  it('ne montre que les dépenses du mois choisi', () => {
    semer({ depenses: [
      depense({ id: 'a', libelle: 'Ce mois', payeeLe: dateISO('2026-09-10') }),
      depense({ id: 'b', libelle: 'Autre mois', payeeLe: dateISO('2026-08-10') })
    ] });
    rendre();
    expect(screen.getByText('Ce mois')).toBeTruthy();
    expect(screen.queryByText('Autre mois')).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Tuiles, rapprochement, registre
   ───────────────────────────────────────────────────────────────────────── */

const mouvement = (m: Partial<Faits['mouvementsBancaires'][number]> = {}) => ({
  id: 'm1', date: dateISO('2026-09-12'), libelle: 'PRLV GITHUB INC', montant: euros(-24),
  rapprocheAvec: null, sansContrepartie: null, ...m
});

describe('repère et tuiles', () => {
  it('annonce les justificatifs manquants avec l’accord du pluriel', () => {
    semer({ depenses: [depense({ id: 'a' }), depense({ id: 'b' })] });
    rendre();
    expect(screen.getByText('2 justificatifs manquants')).toBeTruthy();
  });

  it('dit que tout est justifié quand chaque dépense a sa pièce', () => {
    semer({ depenses: [depense({ justificatifId: 'p1' })] });
    rendre();
    expect(screen.getByText('Tout est justifié')).toBeTruthy();
  });

  it('souligne « À rapprocher » seulement quand il reste quelque chose', () => {
    semer({ depenses: [depense({ justificatifId: 'p1' })] });
    rendre();
    expect(screen.getByText('À rapprocher').parentElement?.className).not.toMatch(/Soulignee/);
    cleanup();
    semer({ depenses: [depense()], mouvementsBancaires: [mouvement()] });
    rendre();
    expect(screen.getByText('À rapprocher').parentElement?.className).toMatch(/Soulignee/);
  });
});

describe('rapprochement bancaire', () => {
  // Sans ce bloc, une opération du compte sans dépense restait invisible
  // dans l'écran des achats : la dépense oubliée n'était jamais saisie.
  it('crée la dépense depuis l’opération, pré-remplie, et la relie', async () => {
    semer({ mouvementsBancaires: [mouvement()] });
    rendre();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Créer la dépense' }));
    expect(screen.getByLabelText<HTMLInputElement>('Fournisseur').value).toBe('Github');
    expect(screen.getByLabelText<HTMLInputElement>('Montant TTC (€)').value).toBe('24');
    expect(screen.getByLabelText<HTMLInputElement>('Payée le').value).toBe('2026-09-12');

    await utilisateur.click(screen.getByRole('button', { name: /Créer et relier/ }));
    const faits = useFaits.getState().faits;
    expect(faits.depenses).toHaveLength(1);
    expect(faits.mouvementsBancaires[0]?.rapprocheAvec).toBe(faits.depenses[0]?.id);
  });

  it('relie une dépense saisie à l’opération qui lui correspond', async () => {
    semer({
      depenses: [depense({ montantTtc: euros(24), payeeLe: dateISO('2026-09-12') })],
      mouvementsBancaires: [mouvement()]
    });
    rendre();
    const bloc = screen.getByText('Rapprochement bancaire').closest('section') as HTMLElement;
    // Deux « Relier » : l'opération (côté haut) et la dépense en attente. Les deux posent le même lien.
    await userEvent.setup().click(within(bloc).getAllByRole('button', { name: 'Relier' })[0] as HTMLElement);
    const faits = useFaits.getState().faits;
    expect(faits.mouvementsBancaires[0]?.rapprocheAvec).toBe('d1');
    expect(faits.depenses[0]?.rapprochement).toBe('rapproche');
  });

  it('associe un crédit à la facture en attente, encaissée à la date de l’opération', async () => {
    semer({
      recettes: [{
        id: 'r1', clientNom: 'Client Fictif', libelle: 'Prestation', montant: euros(4160),
        emiseLe: dateISO('2026-08-20'), encaisseeLe: null, modeReglement: null, numero: 'F-023'
      }],
      mouvementsBancaires: [mouvement({ montant: euros(4160), libelle: 'VIR SEPA CLIENT' })]
    });
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Associer' }));
    const faits = useFaits.getState().faits;
    expect(faits.recettes[0]?.encaisseeLe).toBe('2026-09-12');
    expect(faits.mouvementsBancaires[0]?.rapprocheAvec).toBe('r1');
  });

  it('range une dépense « hors compte » : elle n’attend plus d’opération', async () => {
    semer({ depenses: [depense()], mouvementsBancaires: [mouvement({ montant: euros(-5) })] });
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hors compte' }));
    expect(useFaits.getState().faits.depenses[0]?.rapprochement).toBe('sans_banque');
  });

  it('n’apparaît pas sans relevé importé', () => {
    semer({ depenses: [depense()] });
    rendre();
    expect(screen.queryByText('Rapprochement bancaire')).toBeNull();
  });
});

describe('registre en tableau', () => {
  it('marque les dépenses récurrentes d’un « ↻ » nommé', () => {
    semer({ depenses: [
      depense({ id: 'a', payeeLe: dateISO('2026-09-03') }),
      depense({ id: 'b', payeeLe: dateISO('2026-08-03') })
    ] });
    rendre();
    expect(screen.getAllByRole('img', { name: 'récurrente' })).toHaveLength(1);
    expect(screen.getByText(/de dépenses récurrentes sur la période/)).toBeTruthy();
  });

  it('pointe le suivi de TVA vers #/argent/tva', () => {
    semer({ depenses: [depense()] });
    rendre();
    expect(screen.getByRole('link', { name: /Suivi & déclaration TVA/ }).getAttribute('href'))
      .toBe('#/argent/tva');
  });

  it('ouvre la dépense au clic sur sa ligne', async () => {
    semer({ depenses: [depense()] });
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: /Abonnement/ }));
    expect(await screen.findByLabelText(/Déposer une pièce/i)).toBeTruthy();
  });
});
