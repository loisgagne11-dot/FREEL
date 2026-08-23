import { describe, expect, it } from 'vitest';
import { dateISO, euros, ratio } from '../types';
import {
  compositionDisponible, compositionProvisions, compositionSolde, compositionVersable,
  sommeDesTermes
} from './composition';
import type { PartsSolde } from './solde';
import { soldeDerive } from './solde';
import type { DetailProvisions } from './provisions';
import type { Depense } from './depenses';
import type { Echeance, RecetteEncaissee } from './provisions';
import type { MouvementBancaire } from './banque';

const AVANT_TOUT = dateISO('2025-12-31');

const parts = (o: Partial<PartsSolde> = {}): PartsSolde => ({
  depart: euros(1_000), recettes: euros(0), depenses: euros(0),
  echeances: euros(0), releve: euros(0),
  nombres: { recettes: 0, depenses: 0, echeances: 0, mouvements: 0 },
  ...o
});

const detail = (o: Partial<DetailProvisions> = {}): DetailProvisions => ({
  voletConstate: euros(0),
  voletAProvisionner: euros(0),
  total: euros(0),
  parNature: {
    urssaf: euros(0), tva: euros(0), impot: euros(0), cfe: euros(0), cfp: euros(0)
  },
  recettesNonCalculables: [],
  impotRevenuNonProvisionne: null,
  ...o
});

/**
 * LE POINT QUI TIENT TOUT LE RESTE.
 *
 * Une composition qui ne retombe pas sur le chiffre qu'elle prétend expliquer
 * est pire que pas de composition du tout : elle donne une raison de plus de
 * ne pas croire l'écran. `ecart` mesure cette distance, et il doit valoir zéro
 * sur tous les chemins.
 */
describe('la colonne retombe sur son total', () => {
  it('sur le solde, quand toutes les parts contribuent', () => {
    const c = compositionSolde(
      parts({
        depart: euros(1_000), recettes: euros(4_000), depenses: euros(600),
        echeances: euros(1_200), releve: euros(-40),
        nombres: { recettes: 3, depenses: 2, echeances: 1, mouvements: 1 }
      }),
      euros(3_160),
      AVANT_TOUT
    );

    expect(c.ecart).toBe(0);
    expect(sommeDesTermes(c.termes)).toBeCloseTo(3_160, 2);
  });

  /**
   * LE RELEVÉ CHANGE D'OPÉRATEUR, PAS DE SIGNE.
   *
   * C'est la seule part dont le sens n'est pas connu d'avance. Portée en
   * « plus » d'un montant négatif, elle donnait « + Mouvements du relevé …
   * −3 182 € » : le lecteur venu vérifier une colonne devait additionner un
   * négatif de tête. Le contrôle visuel l'a relevé.
   */
  it('retranche un relevé au net négatif au lieu d’ajouter un montant négatif', () => {
    const c = compositionSolde(
      parts({
        depart: euros(8_120), releve: euros(-3_182),
        nombres: { recettes: 0, depenses: 0, echeances: 0, mouvements: 5 }
      }),
      euros(4_938),
      AVANT_TOUT
    );

    const releve = c.termes.find((t) => t.libelle.startsWith('Mouvements du relevé'));
    expect(releve?.signe).toBe('moins');
    expect(releve?.montant).toBe(3_182);
    expect(c.ecart).toBe(0);
  });

  it('l’ajoute quand le relevé est au net positif', () => {
    const c = compositionSolde(
      parts({
        depart: euros(1_000), releve: euros(250),
        nombres: { recettes: 0, depenses: 0, echeances: 0, mouvements: 2 }
      }),
      euros(1_250),
      AVANT_TOUT
    );

    const releve = c.termes.find((t) => t.libelle.startsWith('Mouvements du relevé'));
    expect(releve?.signe).toBe('plus');
    expect(releve?.montant).toBe(250);
    expect(c.ecart).toBe(0);
  });

  it('sur les provisions, où la ventilation par nature somme au total', () => {
    const c = compositionProvisions(detail({
      total: euros(5_400),
      parNature: {
        urssaf: euros(3_000), tva: euros(1_400), impot: euros(1_000),
        cfe: euros(0), cfp: euros(0)
      }
    }));

    expect(c.ecart).toBe(0);
    expect(c.termes).toHaveLength(3);
  });

  it('sur le disponible', () => {
    const c = compositionDisponible(euros(10_000), euros(5_400), euros(4_600));
    expect(c.ecart).toBe(0);
  });

  it('sur le versable', () => {
    const c = compositionVersable(euros(4_600), euros(2_000), euros(2_600));
    expect(c.ecart).toBe(0);
  });
});

/**
 * LA COMPOSITION DU SOLDE VIENT DE `soldeDerive`, PAS D'UNE COPIE.
 *
 * Le tri qui produit les parts porte trois règles subtiles — la borne de date,
 * le sort des mouvements rapprochés, l'abstention totale sans date — qui ont
 * déjà produit deux bugs à elles seules. Ce test vérifie que la colonne
 * affichée est bien celle du calcul, sur un cas où les trois jouent.
 */
describe('la composition du solde reste collée au calcul du solde', () => {
  const recette = (id: string, montant: number, le: string): RecetteEncaissee =>
    ({ id, montant: euros(montant), encaisseeLe: dateISO(le) });
  // Construits en entier, sans `as` : un cast laisserait passer un champ ajouté
  // au type sans que ce fichier ne s'en aperçoive, et la colonne testée ne
  // serait plus celle que le calcul produit.
  const depense = (montant: number, le: string): Depense => ({
    id: `d-${le}`, libelle: 'achat', fournisseur: 'fournisseur', provenance: 'france',
    montantTtc: euros(montant), tauxTva: ratio(0.2), payeeLe: dateISO(le),
    justificatifId: null, rapprochement: 'sans_banque'
  });
  const echeance = (montant: number, le: string): Echeance => ({
    id: `e-${le}`, nature: 'urssaf', montant: euros(montant),
    echeanceLe: dateISO(le), payeeLe: dateISO(le), montantPaye: euros(montant)
  });
  const mouvement = (montant: number): MouvementBancaire => ({
    id: 'm1', date: dateISO('2026-03-02'), libelle: 'frais',
    montant: euros(montant), rapprocheAvec: null, sansContrepartie: 'autre'
  });

  it('rend une colonne qui somme au montant que le calcul annonce', () => {
    const d = soldeDerive(
      euros(1_000), AVANT_TOUT,
      [recette('r1', 4_000, '2026-01-15'), recette('r2', 2_000, '2026-02-10')],
      [depense(600, '2026-01-20')],
      [echeance(1_200, '2026-02-05')],
      [mouvement(-40)]
    );

    const c = compositionSolde(d.parts, d.montant, AVANT_TOUT);

    expect(c.ecart).toBe(0);
    expect(sommeDesTermes(c.termes)).toBeCloseTo(d.montant, 2);
    // Et les libellés portent de quoi se reconnaître : « 2 encaissements »
    // permet de recouper son propre dossier, « 6 000 € » seul ne se vérifie
    // contre rien.
    const encaissements = c.termes.find((t) => t.libelle === 'Encaissements');
    expect(encaissements?.montant).toBeCloseTo(6_000, 2);
    expect(encaissements?.precision).toBe('2 encaissements');
  });

  /**
   * UN FAIT ANTÉRIEUR À L'ANCRAGE N'ENTRE PAS DANS LA COLONNE.
   *
   * C'est la règle la plus contre-intuitive de `soldeDerive` — le solde de
   * départ le contient déjà — et c'est aussi celle qui a produit « je ne
   * comprends pas les données ». Si la composition l'ignorait, elle
   * afficherait un encaissement que le total ne contient pas.
   */
  it('n’affiche pas un encaissement déjà compris dans le solde de départ', () => {
    const d = soldeDerive(
      euros(1_000), dateISO('2026-02-01'),
      [recette('r1', 4_000, '2026-01-15')],
      [], [], []
    );

    const c = compositionSolde(d.parts, d.montant, dateISO('2026-02-01'));
    expect(c.ecart).toBe(0);
    expect(c.termes.map((t) => t.libelle)).toEqual(['Solde de départ']);
  });
});

/**
 * L'ABSENCE DE DATE EST LA PREMIÈRE CHOSE À DIRE.
 *
 * Sans elle, le solde ne bouge pas quoi que l'utilisateur saisisse. Une
 * colonne qui montrerait « solde de départ = 40 € » et rien d'autre, sans
 * expliquer pourquoi, laisserait le lecteur exactement où il était.
 */
describe('ce que la composition avoue', () => {
  it('dit que le solde ne suit pas les saisies tant qu’il n’a pas de date', () => {
    const c = compositionSolde(parts(), euros(1_000), null);
    expect(c.reserves).toHaveLength(1);
    expect(c.reserves[0]).toMatch(/date/i);
    expect(c.reserves[0]).toMatch(/Config/);
  });

  it('ne dit rien de tel quand la date est posée', () => {
    const c = compositionSolde(parts(), euros(1_000), AVANT_TOUT);
    expect(c.reserves).toHaveLength(0);
  });

  it('reprend le motif d’un impôt sur le revenu non provisionné', () => {
    const c = compositionProvisions(detail({
      impotRevenuNonProvisionne: 'aucun avis d’imposition renseigné'
    }));
    expect(c.reserves).toContain('aucun avis d’imposition renseigné');
  });

  it('signale les encaissements dont la charge n’a pas pu être calculée', () => {
    const c = compositionProvisions(detail({
      recettesNonCalculables: [
        { id: 'r1', motif: 'barème inconnu pour 2015-01' },
        { id: 'r2', motif: 'barème inconnu pour 2015-02' }
      ]
    }));
    expect(c.reserves[0]).toMatch(/^2 encaissements ne sont pas comptés/);
  });

  /**
   * LA BORNE À ZÉRO SE DIT, SINON ELLE RESSEMBLE À UNE PANNE.
   *
   * Un disponible de 800 € et un seuil de 2 000 € donnent « 0 € ». Sans
   * explication, ce zéro se lit comme un calcul qui n'a pas abouti.
   */
  it('explique un versable ramené à zéro par le seuil de sécurité', () => {
    const c = compositionVersable(euros(800), euros(2_000), euros(0));
    expect(c.ecart).toBe(0);
    expect(c.reserves).toHaveLength(1);
    expect(c.reserves[0]).toMatch(/seuil de sécurité/);
  });

  it('ne l’explique pas quand la borne ne mord pas', () => {
    const c = compositionVersable(euros(4_600), euros(2_000), euros(2_600));
    expect(c.reserves).toHaveLength(0);
  });
});

/**
 * L'ÉCART EST UNE DONNÉE, PAS UNE ASSERTION.
 *
 * `composer` ne suppose pas que ses termes retombent sur le total : elle
 * mesure. C'est ce qui permet à l'écran de signaler une colonne fausse au lieu
 * d'afficher un total recalculé qui ne serait plus celui de la tuile.
 *
 * Ce test est la preuve par mutation des quatre précédents : si `ecart`
 * rendait zéro par construction, il passerait au vert et ils ne tiendraient
 * plus rien.
 */
describe('un terme manquant se voit', () => {
  it('rend un écart non nul quand la colonne ne somme pas au total', () => {
    const c = compositionSolde(
      parts({ depart: euros(1_000) }),
      // 3 000 € annoncés pour 1 000 € de termes : il manque 2 000 € d'une
      // origine qu'aucune ligne n'explique.
      euros(3_000),
      AVANT_TOUT
    );
    expect(c.ecart).toBe(2_000);
  });

  /** Les centimes, et pas au-delà : deux flottants égaux à l'euro près le sont. */
  it('ne crie pas au dixième de centime près', () => {
    const c = compositionDisponible(euros(0.1 + 0.2), euros(0), euros(0.3));
    expect(c.ecart).toBe(0);
  });
});
