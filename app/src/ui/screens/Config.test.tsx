/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros, mois } from '../../domain/types';
import { PERIODES_URSSAF } from '../../domain/bareme/urssaf';
import { PART_GARDEE_MAX, type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { periodesUrssafEffectives } from '../../state/selecteurs';
import { FournisseurToasts } from '../components/Toasts';
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
  // La section est chargée à la demande : sans cette attente, on interrogerait
  // l'écran de chargement et non le barème.
  await screen.findByRole('table');
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

/**
 * Trésorerie — deux faits qui n'avaient aucune porte d'entrée.
 *
 * `soldeInitial` et `besoinMensuel` existaient dans le schéma et dans le
 * magasin, mais aucun écran ne les écrivait. Un utilisateur venu de l'ancienne
 * application héritait d'un solde qu'il ne pouvait pas corriger et d'une
 * autonomie bloquée à zéro. Un fait qu'on ne peut pas saisir est un fait qui
 * restera faux.
 */
describe('trésorerie', () => {
  it('écrit le solde du compte dans les faits', async () => {
    render(<Config />);
    const utilisateur = utilisateurTest();

    const champ = screen.getByRole('spinbutton', { name: /Solde du compte/ });
    await utilisateur.clear(champ);
    await utilisateur.type(champ, '53984');

    expect(useFaits.getState().faits.soldeInitial).toBe(53984);
  });

  it('écrit le besoin mensuel, sans lequel l’autonomie reste à zéro', async () => {
    render(<Config />);
    const utilisateur = utilisateurTest();

    const champ = screen.getByRole('spinbutton', { name: /Besoin mensuel/ });
    await utilisateur.clear(champ);
    await utilisateur.type(champ, '2500');

    expect(useFaits.getState().faits.besoinMensuel).toBe(2500);
  });

  /**
   * Le libellé doit dire ce que le montant SIGNIFIE, et cela change selon
   * qu'un relevé est importé ou non : point de départ d'une suite de
   * mouvements, ou solde affiché tel quel. Un seul libellé pour les deux
   * situations en rendrait une des deux fausse.
   */
  it('dit que le montant vaut solde tant qu’aucun relevé n’est importé', () => {
    render(<Config />);
    expect(screen.getByRole('spinbutton', { name: /Solde du compte aujourd/ })).toBeTruthy();
    expect(screen.getByText(/Aucun relevé n’est importé/)).toBeTruthy();
  });

  it('change de libellé dès qu’un relevé est importé', () => {
    const faits: Faits = {
      ...faitsVides(),
      mouvementsBancaires: [{
        id: 'mv1', date: dateISO('2026-08-01'), libelle: 'Virement',
        montant: euros(1000), rapprocheAvec: null, sansContrepartie: null
      }]
    };
    useFaits.setState({ faits });
    render(<Config />);

    expect(screen.getByRole('spinbutton', { name: /avant le premier mouvement/ })).toBeTruthy();
  });

  /**
   * L'OBJECTIF EST FACULTATIF, ET SON ABSENCE N'EST PAS UN ZÉRO.
   *
   * Le champ part vide, et non à « 0 » : un zéro affiché se lirait comme un
   * objectif de zéro euro, alors que l'état réel est « je ne m'en suis pas
   * fixé ». C'est cet état-là qui fait que le graphe ne trace aucune ligne
   * d'objectif — et un zéro stocké l'aurait fait tracer, à zéro.
   */
  it('part sans objectif de chiffre d’affaires', () => {
    render(<Config />);
    const champ = screen.getByRole('spinbutton', { name: /Objectif de chiffre d’affaires/ });
    expect((champ as HTMLInputElement).value).toBe('');
    expect(useFaits.getState().faits.objectifCaAnnuel).toBeNull();
  });

  it('écrit l’objectif de chiffre d’affaires dans les faits', async () => {
    render(<Config />);
    const utilisateur = utilisateurTest();

    const champ = screen.getByRole('spinbutton', { name: /Objectif de chiffre d’affaires/ });
    await utilisateur.type(champ, '60000');

    expect(useFaits.getState().faits.objectifCaAnnuel).toBe(60_000);
  });

  it('efface l’objectif quand on vide le champ, au lieu de le mettre à zéro', async () => {
    useFaits.setState({ faits: { ...faitsVides(), objectifCaAnnuel: euros(60_000) } });
    render(<Config />);
    const utilisateur = utilisateurTest();

    await utilisateur.clear(screen.getByRole('spinbutton', { name: /Objectif de chiffre d’affaires/ }));

    expect(useFaits.getState().faits.objectifCaAnnuel).toBeNull();
  });
});

/**
 * UNE SAUVEGARDE QU'ON NE SAIT PAS RELIRE N'EST PAS UNE SAUVEGARDE.
 *
 * L'export existait depuis le début, la restauration non : on pouvait produire
 * un fichier, pas le réinjecter. C'est un fichier qui rassure, pas un filet.
 */
describe('restauration d’une sauvegarde', () => {
  const sauvegarde = (contenu: unknown, nom = 'freel.json') =>
    new File([JSON.stringify(contenu)], nom, { type: 'application/json' });

  async function ouvrirDonnees() {
    render(<FournisseurToasts><Config /></FournisseurToasts>);
    const utilisateur = utilisateurTest();
    await utilisateur.click(screen.getByRole('tab', { name: 'Données' }));
    return utilisateur;
  }

  const bloc = {
    ...faitsVides(),
    clients: [{
      id: 'c1', nom: 'Client repris', adresse: '', siret: '', email: '',
      delaiPaiementJours: 30, pays: '', tvaIntracom: ''
    }]
  };

  /**
   * Restaurer écrase tout. Le faire au choix du fichier ferait perdre une
   * saisie du jour sans que personne l'ait vue passer.
   */
  it('montre ce que contient le fichier avant d’écraser quoi que ce soit', async () => {
    const utilisateur = await ouvrirDonnees();
    await utilisateur.upload(
      screen.getByLabelText('Restaurer une sauvegarde'), sauvegarde(bloc)
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toMatch(/1 .*client/);
    // Rien n'a encore bougé.
    expect(useFaits.getState().faits.clients).toEqual([]);
  });

  it('remplace les faits une fois confirmé', async () => {
    const utilisateur = await ouvrirDonnees();
    await utilisateur.upload(
      screen.getByLabelText('Restaurer une sauvegarde'), sauvegarde(bloc)
    );
    await waitFor(() => screen.getByRole('alert'));
    await utilisateur.click(
      screen.getByRole('button', { name: 'Remplacer mes données par cette sauvegarde' })
    );

    expect(useFaits.getState().faits.clients[0]?.nom).toBe('Client repris');
  });

  it('laisse annuler sans rien toucher', async () => {
    useFaits.setState({
      faits: {
        ...faitsVides(),
        clients: [{
          id: 'existant', nom: 'Déjà là', adresse: '', siret: '', email: '',
          delaiPaiementJours: 30, pays: '', tvaIntracom: ''
        }]
      }
    });
    const utilisateur = await ouvrirDonnees();
    await utilisateur.upload(
      screen.getByLabelText('Restaurer une sauvegarde'), sauvegarde(bloc)
    );
    await waitFor(() => screen.getByRole('alert'));
    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(useFaits.getState().faits.clients[0]?.nom).toBe('Déjà là');
  });

  // Un fichier illisible doit se dire tout de suite, pas après confirmation.
  it('refuse un fichier qui n’est pas du JSON, et dit pourquoi', async () => {
    const utilisateur = await ouvrirDonnees();
    await utilisateur.upload(
      screen.getByLabelText('Restaurer une sauvegarde'),
      new File(['ceci n’est pas du JSON'], 'notes.json', { type: 'application/json' })
    );

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/pas du JSON/));
    expect(screen.queryByRole('button', { name: /Remplacer mes données/ })).toBeNull();
  });

  /**
   * Le refus de fond — schéma plus récent que ce code — appartient à
   * `adopterFaitsDistants`, et il est RENDU à l'utilisateur plutôt qu'avalé.
   */
  it('relaie le refus d’un bloc écrit par une version plus récente', async () => {
    const utilisateur = await ouvrirDonnees();
    await utilisateur.upload(
      screen.getByLabelText('Restaurer une sauvegarde'),
      sauvegarde({ ...bloc, version: 999 })
    );
    await waitFor(() => screen.getByRole('alert'));
    await utilisateur.click(
      screen.getByRole('button', { name: 'Remplacer mes données par cette sauvegarde' })
    );

    expect(useFaits.getState().faits.clients).toEqual([]);
    await waitFor(() => expect(screen.getByText(/plus récente/i)).toBeTruthy());
  });
});

/**
 * L'IDENTITÉ DE L'ENTREPRISE — CE QUI EMPÊCHAIT D'ÉMETTRE LA MOINDRE FACTURE.
 *
 * `adresse`, `codePostal`, `ville`, `iban` et `bic` existaient au schéma et
 * étaient repris de l'ancienne application à la migration. Aucun n'était
 * saisissable.
 *
 * Conséquence, mesurable : l'adresse est une mention obligatoire, `etatFacture`
 * bloque l'émission sans elle, et le message de blocage renvoyait « à
 * renseigner dans Config → Profil » — où le champ n'existait pas. Une
 * entreprise créée dans la nouvelle version ne pouvait donc émettre AUCUNE
 * facture ; seules celles migrées de l'ancienne avaient une adresse.
 */
describe('identité de l’entreprise', () => {
  it('permet de saisir l’adresse, sans laquelle aucune facture ne peut sortir', async () => {
    render(<Config />);
    const utilisateur = utilisateurTest();

    await utilisateur.type(screen.getByLabelText('Adresse'), '1 rue Exemple');
    await utilisateur.type(screen.getByLabelText('Code postal'), '75001');
    await utilisateur.type(screen.getByLabelText('Ville'), 'Paris');

    const e = useFaits.getState().faits.entreprise;
    expect(e.adresse).toBe('1 rue Exemple');
    expect(e.codePostal).toBe('75001');
    expect(e.ville).toBe('Paris');
  });

  it('permet de saisir l’IBAN, sans lequel la facture est impayable', async () => {
    render(<Config />);
    await utilisateurTest().type(
      screen.getByLabelText('IBAN'), 'FR0000000000000000000000000'
    );
    expect(useFaits.getState().faits.entreprise.iban).toBe('FR0000000000000000000000000');
  });
});

/**
 * LES CLÉS DE CONTRÔLE, QUI SE CALCULENT HORS LIGNE.
 *
 * Un IBAN faux : le virement n'arrive jamais, et on l'apprend en relançant des
 * semaines plus tard. Un SIRET faux : c'est une mention obligatoire, et un
 * numéro erroné vaut mention absente — 15 € par mention et par facture.
 */
describe('contrôle des identifiants', () => {
  it('signale un SIRET dont la clé ne tombe pas juste', async () => {
    render(<Config />);
    await utilisateurTest().type(screen.getByLabelText('SIRET'), '12000101100001');
    expect(await screen.findByText(/clé de contrôle/)).toBeTruthy();
  });

  it('ne dit rien d’un SIRET valide', async () => {
    render(<Config />);
    await utilisateurTest().type(screen.getByLabelText('SIRET'), '12000101100010');
    expect(screen.queryByText(/clé de contrôle/)).toBeNull();
  });

  it('signale un IBAN dont la clé ne tombe pas juste', async () => {
    render(<Config />);
    await utilisateurTest().type(
      screen.getByLabelText('IBAN'), 'FR1111111111111111111111111'
    );
    expect(await screen.findByText(/clé de contrôle/)).toBeTruthy();
  });

  /**
   * L'avertissement ne BLOQUE rien. Une clé qui ne tombe pas juste dit
   * « improbable », jamais « faux » — et empêcher de saisir sur un test qui
   * n'est pas une preuve serait pire que le laisser passer.
   */
  it('n’empêche jamais la saisie', async () => {
    render(<Config />);
    const champ = screen.getByLabelText('SIRET') as HTMLInputElement;
    await utilisateurTest().type(champ, '12000101100001');
    expect(champ.value).toBe('12000101100001');
    expect(champ.disabled).toBe(false);
  });

  // Un formulaire vierge n'est pas un formulaire fautif : un avertissement
  // permanent cesse d'être lu.
  it('ne reproche rien sur un champ vide', () => {
    render(<Config />);
    expect(screen.queryByText(/clé de contrôle/)).toBeNull();
    expect(screen.queryByText(/que des chiffres/)).toBeNull();
  });
});

/**
 * UNE APPLICATION VIDE NE MONTRE RIEN DE CE QU'ELLE SAIT FAIRE.
 *
 * Les graphes sont plats, les indicateurs à zéro. Le jeu de démonstration
 * existe pour qu'on puisse juger — et il passe par la MÊME confirmation qu'une
 * restauration, parce qu'il écrase autant qu'elle. L'appeler « démonstration »
 * ne le rend pas moins destructeur.
 */
describe('jeu de démonstration', () => {
  it('demande confirmation avant d’écraser, et n’écrit rien avant', async () => {
    const avant = { ...faitsVides(), soldeInitial: euros(4242) };
    useFaits.setState({ faits: avant });
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ version: 10, recettes: [{}, {}], depenses: [], missions: [{}], clients: [{}] }),
      { status: 200 }
    )) as typeof fetch;

    render(<Config />);
    const utilisateur = utilisateurTest();
    await utilisateur.click(screen.getByRole('tab', { name: /Données/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Charger un jeu de démonstration' }));

    // La confirmation annonce le contenu, et rien n'est encore écrit.
    expect(await screen.findByText(/recette\(s\)/)).toBeTruthy();
    expect(useFaits.getState().faits.soldeInitial).toBe(4242);
  });

  it('dit que le jeu n’a pas pu être chargé plutôt que d’échouer en silence', async () => {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;

    render(<Config />);
    const utilisateur = utilisateurTest();
    await utilisateur.click(screen.getByRole('tab', { name: /Données/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Charger un jeu de démonstration' }));

    expect(await screen.findByText(/n’a pas pu être chargé/)).toBeTruthy();
  });
});

/**
 * LES DEUX RÉGLAGES DE PRUDENCE SONT DEUX NOTIONS, PAS DEUX ÉCRITURES DU MÊME.
 *
 * Le seuil de sécurité est un PLANCHER en euros ; la part gardée est une
 * FRACTION du versable. Les exprimer tous deux en pourcentage du disponible —
 * ce que fait le prototype du handoff — fabrique une boucle : le plancher
 * descend à mesure qu'on vide le compte, et le versement soutenable finit par
 * tout autoriser.
 *
 * Ils vivaient sur le Pilote. Ils sont ici parce que le handoff les y range, et
 * parce que le Pilote est le seul écran du paquet d'entrée : le second curseur
 * lui a fait franchir son plafond.
 */
describe('seuil de sécurité et part gardée', () => {
  const champSeuil = () =>
    screen.getByRole('spinbutton', { name: /Seuil de sécurité/ }) as HTMLInputElement;
  const curseurPart = () =>
    screen.getByRole('slider', { name: /Part gardée/ }) as HTMLInputElement;

  it('écrit le seuil de sécurité dans les faits', () => {
    render(<Config />);
    fireEvent.change(champSeuil(), { target: { value: '3500' } });
    expect(useFaits.getState().faits.reserve).toBe(3500);
  });

  /**
   * Le seuil est un CHAMP et non un curseur, contrairement à la part. Une
   * plage aurait eu besoin d'une borne haute, et la seule disponible est le
   * solde : quelqu'un qui a 8 000 € en banque mais n'a pas encore saisi son
   * solde de départ n'aurait pas pu se fixer un plancher à 5 000 €.
   */
  it('n’enferme pas le seuil dans la borne d’un curseur', () => {
    render(<Config />);
    fireEvent.change(champSeuil(), { target: { value: '5000' } });
    expect(useFaits.getState().faits.reserve).toBe(5000);
  });

  /**
   * Le prototype du handoff écrit « sur ta part disponible, tu gardes N % » —
   * sans le seuil. À 0 % il propose donc de verser le matelas avec. La phrase
   * doit dire les DEUX réglages, sinon elle décrit un autre calcul que celui
   * qui s'applique.
   */
  it('dit le calcul complet, seuil compris', () => {
    useFaits.setState({
      faits: { ...faitsVides(), soldeInitial: euros(8000), reserve: euros(5000) }
    });
    render(<Config />);
    fireEvent.change(curseurPart(), { target: { value: '50' } });

    const phrase = screen.getByText(/Sur un solde de/).textContent ?? '';
    expect(phrase).toMatch(/8\s?000/u);   // le solde
    expect(phrase).toMatch(/5\s?000/u);   // ce que le seuil garde
    expect(phrase).toMatch(/3\s?000/u);   // le versable
    expect(phrase).toMatch(/1\s?500/u);   // ce qu'il reste à se verser
  });

  it('écrit la part gardée en ratio, pas en pourcentage', () => {
    render(<Config />);
    fireEvent.change(curseurPart(), { target: { value: '25' } });
    expect(useFaits.getState().faits.partGardeeAuVersement).toBeCloseTo(0.25, 10);
  });

  /**
   * Un défaut à 50 %, comme dans le prototype, couperait en deux le versable de
   * tout compte existant sans qu'un geste ait été fait.
   */
  it('part de zéro pour cent, qui ne décide rien', () => {
    render(<Config />);
    expect(curseurPart().value).toBe('0');
    expect(useFaits.getState().faits.partGardeeAuVersement).toBe(0);
  });

  it('ne laisse pas régler une part au-delà du maximum du schéma', () => {
    render(<Config />);
    expect(Number(curseurPart().max)).toBe(PART_GARDEE_MAX * 100);
  });

  /**
   * Un plancher négatif n'existe pas : il autoriserait un versement supérieur
   * au disponible.
   */
  it('refuse un seuil négatif plutôt que de l’enregistrer', () => {
    render(<Config />);
    fireEvent.change(champSeuil(), { target: { value: '-400' } });
    expect(useFaits.getState().faits.reserve).toBe(0);
  });
});
