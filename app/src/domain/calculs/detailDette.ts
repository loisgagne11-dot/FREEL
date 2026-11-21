/**
 * Le détail d'une dette, mois par mois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les vignettes de provision disaient trois nombres : ce qui est mis de côté,
 * ce qui est dû, et la date qui vient. Elles répondaient à « est-ce que le
 * 5 juillet va passer », et c'est déjà l'essentiel.
 *
 * Elles ne répondaient pas à « d'où sort ce montant », ni à « qu'est-ce que
 * j'ai à faire ». Sur un dossier réel, une provision d'URSSAF est la somme de
 * huit mois d'encaissements à des taux qui ont pu changer, plus deux appels
 * déjà reçus dont un est payé. Le total seul ne permet ni de vérifier, ni
 * d'agir : on ne sait pas quel mois n'a pas été déclaré, ni quelle échéance
 * attend son règlement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX ORIGINES QUI NE SE MÉLANGENT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une dette arrive ici par deux chemins, et l'écran doit pouvoir les
 * distinguer parce que le geste qui les fait avancer n'est pas le même :
 *
 *   - CONSTATÉE (volet 1) : une échéance a été reçue. Elle porte un montant
 *     appelé, une date, et se solde en enregistrant son paiement.
 *   - ESTIMÉE (volet 2) : aucun appel n'existe encore, la dette se déduit des
 *     recettes encaissées et du taux du mois. Elle avance en DÉCLARANT la
 *     période — après quoi elle repasse en volet 1 sous forme d'échéance.
 *
 * Les fondre en une seule liste ferait proposer « enregistrer le paiement »
 * sur une dette que personne n'a encore appelée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE MODULE NE RECALCULE PAS LES PROVISIONS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Il les VENTILE. Le total qu'il rend doit retomber sur celui de
 * `provisions()` — une seconde définition de la même dette finirait par ne pas
 * tomber d'accord avec la première, et l'écran afficherait deux chiffres pour
 * une seule notion. Le taux vient donc de la même source (`tauxCotisations`),
 * et la règle d'exclusion d'une période déclarée est la même (`estDeclare`).
 */

import type { DateISO, Euros, Mois, Resolution } from '../types';
import { euros } from '../types';
import { tauxCotisations } from '../bareme/urssaf';
import { tauxCfp } from '../bareme/impot';
import type {
  ContexteProvisions, Echeance, NatureDette, PeriodesDeclarees, RecetteEncaissee
} from './provisions';
import { estDeclare, estPayee, tauxImpotDuMois } from './provisions';

/** Le mois d'une date ISO. */
const moisDe = (d: DateISO): Mois => d.slice(0, 7) as Mois;

/**
 * Ce qu'une ligne attend de l'utilisateur.
 *
 * Un STATUT, et non un booléen « fait / pas fait » : trois états distincts se
 * suivent dans le temps, et les réduire à deux ferait confondre « la période
 * n'est pas déclarée » avec « l'appel n'est pas payé » — deux situations qui
 * n'appellent pas le même geste, à des mois d'écart.
 */
export type StatutLigneDette =
  /** Estimée, période non déclarée. Le geste : déclarer la période. */
  | 'a_declarer'
  /** Appelée par une échéance reçue, non réglée. Le geste : enregistrer le paiement. */
  | 'a_payer'
  /** Réglée. Plus rien à faire, et c'est une information. */
  | 'payee';

/** Une ligne du détail : un mois, un montant, un statut, et de quoi agir. */
export interface LigneDette {
  /** Le mois auquel la dette se rattache. */
  readonly mois: Mois;
  readonly libelle: string;
  readonly montant: Euros;
  readonly statut: StatutLigneDette;
  /**
   * L'échéance dont la ligne vient, quand elle en vient d'une.
   *
   * `null` sur une dette estimée : il n'y a pas encore d'appel, et l'écran ne
   * doit pas proposer d'en enregistrer le paiement.
   */
  readonly echeanceId: string | null;
  /** La date attendue du paiement, sur une ligne appelée. */
  readonly echeanceLe: DateISO | null;
}

/** Une année du détail, et ses mois. */
export interface AnneeDette {
  readonly annee: number;
  /** Ce qui reste à sortir sur l'année : les lignes non réglées. */
  readonly reste: Euros;
  readonly lignes: readonly LigneDette[];
}

/**
 * Une part du reste à sortir qui ne tient pas dans un mois : l'impôt sur le
 * revenu de l'année (dette annuelle du foyer), la TVA collectée pas encore
 * déclarée. Elle est COMPRISE dans `reste` (lot 33).
 */
export interface PartHorsLignes {
  readonly libelle: string;
  readonly montant: Euros;
  readonly hypothese: boolean;
}

export interface DetailDette {
  readonly nature: NatureDette;
  /**
   * Ce qui reste à sortir pour cette nature, toutes années confondues — LU
   * dans la source unique (les provisions par nature), jamais recalculé ici.
   *
   * ───────────────────────────────────────────────────────────────────────
   * DEUX TOTAUX POUR UNE NOTION (lot 33, décision 8)
   * ───────────────────────────────────────────────────────────────────────
   *
   * Le détail additionnait ses lignes ; la vignette lisait les provisions.
   * Pour l'impôt, le détail comptait la CFP et taisait l'impôt sur le revenu
   * (« en plus des lignes ») ; pour la TVA, il ignorait la TVA collectée pas
   * encore déclarée ; pour la CFP, il ne comptait rien. Même mot, deux
   * chiffres, sur deux écrans voisins. Les lignes expliquent désormais le
   * total au lieu de le refaire, et ce qui ne s'explique pas se dit
   * (`ecart`).
   */
  readonly reste: Euros;
  /** Les parts du reste qui ne se rangent pas dans un mois. */
  readonly horsLignes: readonly PartHorsLignes[];
  /**
   * `reste` moins ce que les lignes et les parts hors lignes expliquent. Zéro
   * à l'arrondi près ; au-delà, l'écran le dit plutôt que de le cacher.
   */
  readonly ecart: Euros;
  /** Ce qui est déjà sorti du compte. */
  readonly paye: Euros;
  /** De la plus récente à la plus ancienne : on regarde l'année en cours. */
  readonly annees: readonly AnneeDette[];
  /**
   * Les recettes dont la dette ne se calcule pas, avec leur motif.
   *
   * Le barème peut ne pas couvrir un mois — voir `tauxCotisations`. On
   * s'abstient alors plutôt que d'inventer un taux, et l'écran doit pouvoir
   * dire que son total est PARTIEL. Un total silencieusement incomplet est
   * pire qu'une absence de total : il a l'air d'une réponse.
   */
  readonly nonCalculables: readonly { readonly mois: Mois; readonly motif: string }[];
  /**
   * Nature `impot` : la provision d'impôt sur le revenu retenue par le versable,
   * au même chiffre. Elle ne se ventile pas par mois (dette annuelle du foyer),
   * d'où un champ à part plutôt qu'une ligne : sans lui, le détail montrait le
   * taux sur les encaissements et taisait l'essentiel de l'impôt. `null` hors
   * de cette nature ou sans provision (versement libératoire).
   */
  readonly impotRevenu: Resolution<Euros> | null;
  /** Nature `tva` : la part autoliquidée de la provision (« dont »), sinon `null`. */
  readonly tvaAutoliquidee: Resolution<Euros> | null;
}

/**
 * Le détail d'une nature de dette, mois par mois.
 *
 * `recettes` et `declarees` ne servent qu'aux natures ESTIMABLES — l'URSSAF et
 * l'impôt. Pour la TVA, la CFE et la CFP, aucune règle ne permet de déduire
 * une dette d'un encaissement : elles n'existent qu'appelées, et le détail se
 * réduit alors à leurs échéances. Rendre une estimation pour elles reviendrait
 * à fabriquer une dette que rien ne fonde.
 */
export function detailDette(
  nature: NatureDette,
  echeances: readonly Echeance[],
  recettes: readonly RecetteEncaissee[],
  declarees: PeriodesDeclarees,
  ctx: ContexteProvisions,
  /**
   * Le reste à sortir de cette nature, tel que la source le donne. Absent,
   * le reste est ce que les lignes expliquent — le cas des tests du calcul
   * lui-même, qui n'ont pas de provisions à lire.
   */
  resteSource?: Euros
): DetailDette {
  const lignes: LigneDette[] = [];
  const nonCalculables: { mois: Mois; motif: string }[] = [];

  // ── Volet 1 : ce qui a été appelé ────────────────────────────────────────
  for (const e of echeances) {
    if (e.nature !== nature) continue;
    lignes.push({
      mois: moisDe(e.echeanceLe),
      libelle: libelleEcheance(nature, e),
      montant: e.montant,
      statut: estPayee(e) ? 'payee' : 'a_payer',
      echeanceId: e.id,
      echeanceLe: e.echeanceLe
    });
  }

  // ── Volet 2 : ce qui est estimé, mois par mois ───────────────────────────
  if (nature === 'urssaf' || nature === 'impot' || nature === 'cfp') {
    for (const [mois, part] of estimationParMois(nature, recettes, declarees, ctx, nonCalculables)) {
      if (part <= 0) continue;
      lignes.push({
        mois,
        libelle: `CA encaissé en ${mois}`,
        montant: euros(part),
        statut: 'a_declarer',
        echeanceId: null,
        echeanceLe: null
      });
    }
  }

  // ── Hors lignes : ce que la source compte sans le ranger dans un mois ───
  // Les MÊMES termes que `voletAProvisionner`, et pas d'autres : la moindre
  // différence de règle referait deux totaux.
  const horsLignes: PartHorsLignes[] = [];
  const ir = ctx.impotRevenu;
  if (nature === 'impot' && ir !== undefined && ir.statut !== 'refuse' && ir.valeur > 0) {
    horsLignes.push({
      libelle: 'Impôt sur le revenu de l’année, à mettre de côté',
      montant: ir.valeur,
      hypothese: ir.statut === 'hypothese'
    });
  }
  const tvaCourue = Math.max(0, ctx.tvaAReverser ?? 0);
  if (nature === 'tva' && tvaCourue > 0) {
    horsLignes.push({
      libelle: 'TVA collectée, pas encore déclarée',
      montant: euros(tvaCourue),
      hypothese: false
    });
  }

  const assemble = assembler(nature, lignes, nonCalculables);
  const explique = assemble.resteDesLignes + horsLignes.reduce((t, h) => t + h.montant, 0);
  const reste = resteSource ?? euros(explique);
  const { resteDesLignes: _, ...sansResteDesLignes } = assemble;
  return {
    ...sansResteDesLignes,
    reste,
    horsLignes,
    ecart: euros(Math.round((reste - explique) * 100) / 100),
    impotRevenu: nature === 'impot' ? ctx.impotRevenu ?? null : null,
    tvaAutoliquidee: nature === 'tva' ? ctx.tvaAutoliquidee ?? null : null
  };
}

/**
 * La part estimée de chaque mois, pour une nature estimable.
 *
 * Le mois est celui de l'ENCAISSEMENT, pas de la facturation : c'est lui qui
 * commande le taux applicable et la période à déclarer. Les confondre
 * appliquerait à un encaissement de janvier le taux de la facture de
 * novembre.
 */
function estimationParMois(
  nature: 'urssaf' | 'impot' | 'cfp',
  recettes: readonly RecetteEncaissee[],
  declarees: PeriodesDeclarees,
  ctx: ContexteProvisions,
  nonCalculables: { mois: Mois; motif: string }[]
): ReadonlyMap<Mois, number> {
  const parMois = new Map<Mois, number>();

  for (const r of recettes) {
    const m = moisDe(r.encaisseeLe);
    // Période déclarée : la dette est passée en volet 1, sous forme
    // d'échéance. La compter ici la doublerait — c'est la même exclusion que
    // `voletAProvisionner`, et elle doit le rester.
    if (estDeclare(declarees, m)) continue;

    const taux: Resolution<number> = tauxCotisations(
      m, ctx.typeActivite, ctx.sousAcreLe(m), ctx.periodesUrssaf,
      ctx.debutActivite
    );
    if (taux.statut === 'refuse') {
      if (!nonCalculables.some((n) => n.mois === m)) {
        nonCalculables.push({ mois: m, motif: taux.motif });
      }
      continue;
    }

    // Le partage de `voletAProvisionner`, à l'identique : la CFP est prise sur
    // le taux « impôt et contributions », et n'en est plus comptée en impôt.
    const cfp = tauxCfp(m, ctx.typeActivite);
    const impot = tauxImpotDuMois(ctx, m);
    const partCfp = Math.min(impot, cfp.statut === 'refuse' ? 0 : cfp.valeur);
    const part = nature === 'urssaf'
      ? r.montant * taux.valeur
      : nature === 'cfp'
        ? r.montant * partCfp
        : r.montant * (impot - partCfp);
    parMois.set(m, (parMois.get(m) ?? 0) + part);
  }

  return parMois;
}

/** Le libellé d'une échéance : la nature, et le mois qu'elle appelle. */
function libelleEcheance(nature: NatureDette, e: Echeance): string {
  const quand = moisDe(e.echeanceLe);
  return nature === 'cfe' ? `Cotisation foncière ${quand.slice(0, 4)}` : `Appel de ${quand}`;
}

/**
 * Regroupe les lignes par année, de la plus récente à la plus ancienne.
 *
 * L'année en cours EN TÊTE : c'est celle qu'on vient consulter. Trier à
 * l'endroit obligerait à dérouler trois ans d'historique avant d'atteindre le
 * mois qui attend une déclaration.
 */
function assembler(
  nature: NatureDette,
  lignes: readonly LigneDette[],
  nonCalculables: readonly { readonly mois: Mois; readonly motif: string }[]
): Omit<DetailDette, 'impotRevenu' | 'tvaAutoliquidee' | 'reste' | 'horsLignes' | 'ecart'> & { readonly resteDesLignes: number } {
  const parAnnee = new Map<number, LigneDette[]>();
  for (const l of lignes) {
    const a = Number(l.mois.slice(0, 4));
    const groupe = parAnnee.get(a);
    if (groupe === undefined) parAnnee.set(a, [l]);
    else groupe.push(l);
  }

  const annees = [...parAnnee.entries()]
    .map(([annee, sesLignes]) => ({
      annee,
      reste: euros(sesLignes.filter((l) => l.statut !== 'payee')
        .reduce((s, l) => s + l.montant, 0)),
      // À l'intérieur d'une année, les mois dans l'ordre du temps : on lit une
      // année comme on l'a vécue.
      lignes: [...sesLignes].sort((x, y) => x.mois.localeCompare(y.mois))
    }))
    .sort((x, y) => y.annee - x.annee);

  return {
    nature,
    resteDesLignes: lignes.filter((l) => l.statut !== 'payee')
      .reduce((s, l) => s + l.montant, 0),
    paye: euros(lignes.filter((l) => l.statut === 'payee')
      .reduce((s, l) => s + l.montant, 0)),
    annees,
    nonCalculables
  };
}
