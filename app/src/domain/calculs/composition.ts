/**
 * La composition d'un indicateur : la formule, ses termes, et ce qu'elle tait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Quatre chiffres commandent toutes les décisions de l'application : le solde,
 * ce qu'il faut garder de côté, ce qui reste disponible, et ce qu'on peut se
 * verser. Ils s'enchaînent — le total de l'un est un terme du suivant — mais
 * l'écran ne montrait que les quatre résultats. Un utilisateur qui reprenait
 * ses données trouvait quatre nombres sans moyen de les recouper, et concluait
 * qu'il ne comprenait pas les données. Il avait raison : rien ne les
 * expliquait.
 *
 * Ce module rend, pour chacun, la FORMULE et ses TERMES. Pas un commentaire
 * d'aide : la décomposition réelle, aux mêmes montants que le total.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉCART EST UNE DONNÉE, PAS UNE ASSERTION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `composer` ne suppose pas que ses termes retombent sur le total : elle
 * mesure l'écart et le rend. Un `assert` planterait l'écran ; une somme
 * silencieusement recalculée depuis les termes cacherait la divergence en
 * affichant un total qui n'est plus celui de la tuile — le lecteur verrait
 * deux nombres différents pour la même notion, sans savoir lequel croire.
 *
 * L'écart affiché, lui, se voit et se corrige. Il vaut zéro sur tous les
 * chemins connus, et un test le vérifie pour chaque composition ; s'il cesse
 * un jour de valoir zéro, l'écran le dira avant qu'un test ne le rattrape.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE MODULE NE CALCULE RIEN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Il reçoit les montants déjà calculés — `PartsSolde` vient de `soldeDerive`,
 * la ventilation vient de `provisions` — et se contente de les mettre en
 * forme. Recalculer une part ici en ferait une seconde définition, et
 * l'invariant du projet est qu'une notion n'en a qu'une : deux calculs
 * concurrents finissent par ne pas tomber d'accord.
 */

import { type DateISO, type Euros, euros } from '../types';
import type { PartsSolde } from './solde';
import { LIBELLE_NATURE, NATURES_DETTE } from './provisions';
import type { DetailProvisions } from './provisions';

/**
 * Le rôle d'un terme dans la formule.
 *
 * `depart` et non « plus » pour le premier : un solde de départ n'est pas une
 * entrée du mois, c'est le point d'où l'on compte. Écrire « + 40 € » en tête
 * d'une colonne le ferait lire comme un encaissement de quarante euros.
 */
export type SigneTerme = 'depart' | 'plus' | 'moins';

/** Un terme de la formule : ce qu'il vaut, et ce qu'il recouvre. */
export interface TermeComposition {
  readonly libelle: string;
  /**
   * Le montant, TOUJOURS POSITIF : le signe est porté par `signe`, jamais par
   * la valeur.
   *
   * Sans cette règle, une part signée — le net d'un relevé, qui peut aller
   * dans les deux sens — s'affiche « + Mouvements du relevé … −3 182 € », et
   * le lecteur venu vérifier une colonne doit additionner un négatif de tête.
   * Le contrôle visuel l'a relevé sur la première version. Un terme dont la
   * valeur peut changer de sens change donc d'OPÉRATEUR, pas de signe.
   */
  readonly montant: Euros;
  readonly signe: SigneTerme;
  /** Ce que le terme recouvre : « 12 encaissements », « réglé dans Config ». */
  readonly precision: string | null;
  /**
   * La date à laquelle le terme se rattache, quand il en a une.
   *
   * Rendue brute plutôt que formatée : la mise en forme d'une date est une
   * affaire de présentation, et le domaine qui s'en chargerait importerait
   * `ui/format` — la dépendance irait alors dans le mauvais sens. C'est la
   * même règle que sur `LigneDette.echeanceLe`.
   */
  readonly date: DateISO | null;
}

/**
 * Ce qu'une composition dit d'elle-même.
 *
 * `lecture` est la phrase qui dit ce que le chiffre VEUT DIRE, et non comment
 * il se calcule — la formule s'en charge. Les deux sont nécessaires : savoir
 * que « disponible = solde − provisions » ne dit pas encore qu'on peut le
 * dépenser.
 */
export interface Composition {
  readonly titre: string;
  readonly formule: string;
  readonly lecture: string;
  readonly termes: readonly TermeComposition[];
  /** Le chiffre affiché sur la tuile — celui qu'on vient vérifier. */
  readonly total: Euros;
  /**
   * Ce que la somme signée des termes ne rejoint pas.
   *
   * Zéro sur tous les chemins connus. Non nul, c'est qu'un terme manque à la
   * formule : l'écran doit le dire plutôt que de laisser croire que la
   * colonne est complète.
   */
  readonly ecart: Euros;
  /**
   * Ce que le total ignore, ne garantit pas, ou sous-évalue.
   *
   * Même règle que partout ailleurs : un total silencieusement incomplet est
   * pire qu'une absence de total, parce qu'il a l'air d'une réponse.
   */
  readonly reserves: readonly string[];
}

/** Les indicateurs qui savent se décomposer. */
export type CleComposition = 'solde' | 'provisions' | 'disponible' | 'versable';

/**
 * Une borne appliquée après la formule.
 *
 * `plancher_zero` existe pour le versable, qui vaut `max(0, dispo − réserve)`.
 * Sans elle, un dispo inférieur à la réserve donnerait un écart non nul —
 * l'écran signalerait une incohérence là où il n'y a qu'une borne voulue.
 */
type Borne = 'plancher_zero' | null;

/** Les centimes, et pas au-delà : deux flottants égaux à l'euro près le sont. */
const auCentime = (n: number): number => Math.round(n * 100) / 100;

/** La somme signée des termes. `depart` compte comme une entrée. */
export function sommeDesTermes(termes: readonly TermeComposition[]): number {
  return termes.reduce((s, t) => (t.signe === 'moins' ? s - t.montant : s + t.montant), 0);
}

function composer(
  base: Omit<Composition, 'ecart'> & { readonly borne?: Borne }
): Composition {
  const somme = sommeDesTermes(base.termes);
  const attendu = base.borne === 'plancher_zero' ? Math.max(0, somme) : somme;
  return {
    titre: base.titre,
    formule: base.formule,
    lecture: base.lecture,
    termes: base.termes,
    total: base.total,
    ecart: euros(auCentime(base.total - attendu)),
    reserves: base.reserves
  };
}

/** « 12 encaissements », « un encaissement », ou rien quand il n'y en a pas. */
function comptés(n: number, singulier: string, pluriel: string): string | null {
  if (n === 0) return null;
  return n === 1 ? `1 ${singulier}` : `${n} ${pluriel}`;
}

/* ─────────────────────────────────────────────────────────────────────────
   Le solde
   ───────────────────────────────────────────────────────────────────────── */

/**
 * D'où sort le solde du compte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DATE D'ANCRAGE EST LA PREMIÈRE CHOSE À LIRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Sans elle, la colonne est incompréhensible : le solde de départ vaut le
 * montant saisi et rien ne s'y ajoute, parce que l'application s'abstient de
 * recouper des faits dont elle ne sait pas s'ils y sont déjà compris (voir
 * `soldeDerive`). C'est exactement ce qui produisait « je ne comprends pas les
 * données » après un import : un solde figé à 40 € pendant qu'un an
 * d'encaissements défilait à côté sans jamais l'atteindre.
 *
 * La réserve le dit en toutes lettres, et dit où le corriger.
 */
export function compositionSolde(
  parts: PartsSolde,
  total: Euros,
  soldeInitialAu: DateISO | null
): Composition {
  const termes: TermeComposition[] = [
    {
      libelle: 'Solde de départ',
      montant: parts.depart,
      signe: 'depart',
      precision: soldeInitialAu === null ? 'date non renseignée' : null,
      date: soldeInitialAu
    }
  ];

  // Une part nulle qui ne recouvre AUCUN fait ne fait pas de ligne : « 0 € ·
  // aucune dépense » occupe une ligne pour ne rien apprendre. Une part nulle
  // qui recouvre des faits, en revanche, reste affichée — c'est une
  // information, et souvent la réponse à « pourquoi ça ne bouge pas ».
  if (parts.recettes !== 0 || parts.nombres.recettes > 0) {
    termes.push({
      libelle: 'Encaissements',
      montant: parts.recettes,
      signe: 'plus',
      precision: comptés(parts.nombres.recettes, 'encaissement', 'encaissements'),
      date: null
    });
  }
  if (parts.depenses !== 0 || parts.nombres.depenses > 0) {
    termes.push({
      libelle: 'Dépenses payées',
      montant: parts.depenses,
      signe: 'moins',
      precision: comptés(parts.nombres.depenses, 'dépense', 'dépenses'),
      date: null
    });
  }
  if (parts.echeances !== 0 || parts.nombres.echeances > 0) {
    termes.push({
      libelle: 'Échéances réglées',
      montant: parts.echeances,
      signe: 'moins',
      precision: comptés(parts.nombres.echeances, 'échéance', 'échéances'),
      date: null
    });
  }
  // Le net du relevé est la seule part dont le SENS n'est pas connu d'avance :
  // des frais bancaires et un remboursement peuvent se solder dans les deux
  // directions. C'est donc l'opérateur qui bascule, jamais le montant — sinon
  // la ligne s'écrit « + … −3 182 € » et la colonne cesse de s'additionner à
  // l'œil.
  if (parts.releve !== 0 || parts.nombres.mouvements > 0) {
    termes.push({
      libelle: 'Mouvements du relevé sans contrepartie',
      montant: euros(Math.abs(parts.releve)),
      signe: parts.releve < 0 ? 'moins' : 'plus',
      precision: comptés(parts.nombres.mouvements, 'mouvement', 'mouvements'),
      date: null
    });
  }

  return composer({
    titre: 'Solde du compte',
    formule: 'solde de départ + encaissements − dépenses − échéances réglées',
    lecture:
      'Ce que la banque doit afficher aujourd’hui. Ce n’est pas ce que tu peux '
      + 'dépenser : une partie est due, et se lit sur « À garder de côté ».',
    termes,
    total,
    reserves: soldeInitialAu === null
      ? [
        'Ton solde de départ n’a pas de date : l’application ne sait pas si tes '
        + 'encaissements et tes dépenses y sont déjà compris, et s’abstient donc '
        + 'de les ajouter. Renseigne la date dans Config › Solde du compte pour '
        + 'que le solde suive tes saisies.'
      ]
      : []
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Ce qu'il faut garder de côté
   ───────────────────────────────────────────────────────────────────────── */

/**
 * D'où sortent les provisions, nature par nature.
 *
 * PAR NATURE ET NON PAR VOLET. Le Pilote montre déjà « échéances à payer » et
 * « charges sur recettes encaissées » — le découpage par volet est donc déjà
 * lisible ailleurs, et le répéter ici n'apprendrait rien. Ce que la vignette
 * ne dit nulle part, c'est à QUI l'argent est dû : c'est la question qu'on se
 * pose devant un total, et c'est ce qui permet d'aller ouvrir la bonne
 * enveloppe pour en voir le détail mois par mois.
 */
export function compositionProvisions(detail: DetailProvisions): Composition {
  const termes: TermeComposition[] = NATURES_DETTE
    // Une nature à zéro n'a rien à dire ici. Elle reste visible sur les
    // enveloppes, où l'absence de montant est justement l'information — voir
    // `DetailProvisions.parNature`.
    .filter((n) => detail.parNature[n] !== 0)
    .map((n) => ({
      libelle: LIBELLE_NATURE[n],
      montant: detail.parNature[n],
      signe: 'plus' as const,
      precision: null,
      date: null
    }));

  const reserves = [
    ...(detail.impotRevenuNonProvisionne === null ? [] : [detail.impotRevenuNonProvisionne]),
    ...(detail.recettesNonCalculables.length === 0
      ? []
      : [
        detail.recettesNonCalculables.length === 1
          ? `Un encaissement n’est pas compté : ${detail.recettesNonCalculables[0]?.motif}`
          : `${detail.recettesNonCalculables.length} encaissements ne sont pas comptés : `
            + `${detail.recettesNonCalculables[0]?.motif}`
      ])
  ];

  return composer({
    titre: 'À garder de côté',
    formule: 'somme de ce qui est dû, appelé ou non',
    lecture:
      'Ce que tu dois, à qui. Chaque ligne mêle ce qui a déjà été appelé et ce '
      + 'que tes encaissements ont fait naître sans qu’aucun avis ne soit encore '
      + 'arrivé. Ouvre une enveloppe pour en voir le détail mois par mois.',
    termes,
    total: detail.total,
    reserves
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Le disponible et le versable — les deux maillons qui ferment la chaîne
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Disponible = solde − provisions.
 *
 * Deux termes, et c'est tout l'intérêt : chacun est le TOTAL d'une autre
 * composition. C'est ce qui fait qu'on peut remonter la chaîne jusqu'aux faits
 * sans jamais rencontrer un nombre qui vienne de nulle part.
 */
export function compositionDisponible(
  solde: Euros,
  provisions: Euros,
  total: Euros
): Composition {
  return composer({
    titre: 'Disponible',
    formule: 'solde du compte − à garder de côté',
    lecture:
      'Ce qui reste une fois tes dettes mises de côté. Négatif, il dit que ce '
      + 'que tu dois dépasse ce que tu as — et le montant manquant est celui-là.',
    termes: [
      {
        libelle: 'Solde du compte', montant: solde, signe: 'depart',
        precision: null, date: null
      },
      {
        libelle: 'À garder de côté', montant: provisions, signe: 'moins',
        precision: null, date: null
      }
    ],
    total,
    reserves: []
  });
}

/**
 * Versable = max(0, disponible − seuil de sécurité).
 *
 * La borne se dit à l'écran quand elle mord, et pas seulement dans le code :
 * sans elle, un disponible de 800 € et un seuil de 2 000 € donneraient « 0 € »
 * sans aucune explication, ce qui se lit comme une panne.
 */
export function compositionVersable(
  dispo: Euros,
  reserve: Euros,
  total: Euros
): Composition {
  const bornee = dispo - reserve < 0;

  return composer({
    titre: 'Je peux me verser',
    formule: 'disponible − seuil de sécurité, jamais négatif',
    lecture:
      'Ce que tu peux te virer aujourd’hui sans entamer ni tes dettes ni ton '
      + 'matelas. Se verser de l’argent n’est pas une opération comptable en '
      + 'micro : la personne et l’entreprise sont la même.',
    termes: [
      { libelle: 'Disponible', montant: dispo, signe: 'depart', precision: null, date: null },
      {
        libelle: 'Seuil de sécurité',
        montant: reserve,
        signe: 'moins',
        precision: 'réglé dans Config',
        date: null
      }
    ],
    total,
    borne: 'plancher_zero',
    reserves: bornee
      ? [
        'Ton disponible est inférieur à ton seuil de sécurité : la différence '
        + 'est ramenée à zéro plutôt que d’afficher un versement négatif. Il n’y '
        + 'a rien à te verser sans entamer ton matelas.'
      ]
      : []
  });
}
