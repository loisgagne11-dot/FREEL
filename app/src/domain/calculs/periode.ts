import type { DateISO, Mois } from '../types';

/**
 * La période d'observation d'un écran.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST UNE NOTION DU DOMAINE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Le trimestre en cours » n'est pas un filtre d'affichage : c'est la maille
 * dans laquelle on déclare. Un écran qui découperait les trimestres à sa façon
 * et un calcul de provisions qui les découperait à la sienne finiraient par
 * désigner deux périodes différentes sous le même nom — et l'un des deux
 * chiffres partirait dans une déclaration.
 *
 * Le découpage vit donc ici, avec ses tests, et les écrans s'en servent.
 */

export type Granularite = 'mois' | 'trimestre' | 'annee' | 'tout';

export interface Periode {
  readonly granularite: Granularite;
  /** Premier jour inclus, `null` pour « tout ». */
  readonly du: DateISO | null;
  /** Dernier jour inclus, `null` pour « tout ». */
  readonly au: DateISO | null;
  /** Ce qu'on affiche à l'utilisateur : « T3 2026 », « Août 2026 », « 2026 ». */
  readonly libelle: string;
}

const MOIS_LONGS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const jour = (a: number, m: number, j: number): DateISO =>
  `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}` as DateISO;

/** Dernier jour du mois `m` (1-12) de l'année `a`. Bissextiles comprises. */
function dernierJour(a: number, m: number): number {
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/**
 * La période courante pour une granularité donnée.
 *
 * `decalage` déplace de n périodes : -1 pour la précédente, +1 pour la
 * suivante. Sur « tout », il n'a pas de sens et reste sans effet — naviguer
 * dans un ensemble qui contient déjà tout ne mène nulle part.
 */
export function periodeCourante(
  granularite: Granularite,
  maintenant: Date = new Date(),
  decalage = 0
): Periode {
  if (granularite === 'tout') {
    return { granularite, du: null, au: null, libelle: 'Tout' };
  }

  const a = maintenant.getFullYear();
  const m = maintenant.getMonth() + 1;

  if (granularite === 'annee') {
    const annee = a + decalage;
    return {
      granularite,
      du: jour(annee, 1, 1),
      au: jour(annee, 12, 31),
      libelle: String(annee)
    };
  }

  if (granularite === 'trimestre') {
    // Numérotation absolue en trimestres : un décalage de -3 depuis T1 2026
    // doit tomber sur T2 2025, ce qu'une arithmétique par année ne donne pas.
    const absolu = a * 4 + Math.floor((m - 1) / 3) + decalage;
    const annee = Math.floor(absolu / 4);
    const t = ((absolu % 4) + 4) % 4;
    const premierMois = t * 3 + 1;
    const dernierMois = premierMois + 2;
    return {
      granularite,
      du: jour(annee, premierMois, 1),
      au: jour(annee, dernierMois, dernierJour(annee, dernierMois)),
      libelle: `T${t + 1} ${annee}`
    };
  }

  const absolu = a * 12 + (m - 1) + decalage;
  const annee = Math.floor(absolu / 12);
  const mois = (((absolu % 12) + 12) % 12) + 1;
  return {
    granularite,
    du: jour(annee, mois, 1),
    au: jour(annee, mois, dernierJour(annee, mois)),
    libelle: `${MOIS_LONGS[mois - 1]} ${annee}`
  };
}

/**
 * Une date tombe-t-elle dans la période ?
 *
 * Une date absente ne tombe dans AUCUNE période bornée — mais elle tombe dans
 * « tout ». C'est voulu : une dépense sans date de paiement est un problème à
 * traiter, et la faire disparaître de tous les écrans filtrés serait le
 * meilleur moyen de ne jamais la corriger. « Tout » reste l'endroit où on la
 * retrouve.
 */
export function dansLaPeriode(date: DateISO | null, periode: Periode): boolean {
  if (periode.du === null || periode.au === null) return true;
  if (date === null) return false;
  return date >= periode.du && date <= periode.au;
}

/** Le mois d'une période, quand elle en couvre exactement un. */
export function moisDeLaPeriode(periode: Periode): Mois | null {
  return periode.granularite === 'mois' && periode.du !== null
    ? periode.du.slice(0, 7) as Mois
    : null;
}

/**
 * La date depuis laquelle une période se compte, pour une année choisie.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE ANCRE ET NON UN FILTRE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le sélecteur d'année de la barre du haut et les barres de période des écrans
 * (Mois / Trimestre / Année / Tout) répondent à deux questions différentes :
 * l'un dit QUELLE ANNÉE, l'autre QUELLE FINESSE. Les empiler en deux filtres
 * successifs donnerait des états qui ne veulent rien dire — « le mois d'août,
 * dans l'année 2025 » alors que la barre pointe sur août 2026, donc un
 * ensemble vide présenté comme un résultat.
 *
 * L'année déplace donc l'ANCRE à partir de laquelle `periodeCourante` compte
 * son décalage. Une seule source pour l'année, une seule pour la granularité,
 * et toute combinaison des deux désigne un intervalle réel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ANNÉE COURANTE GARDE AUJOURD'HUI, LES AUTRES PRENNENT LEUR FIN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Sur l'année en cours, l'ancre reste `maintenant` : « Mois » désigne le mois
 * où l'on est, ce qui est le comportement qu'on attend en ouvrant l'écran.
 * Ancrer au 31 décembre y ferait ouvrir Facturer sur un mois qui n'est pas
 * encore arrivé, donc vide.
 *
 * Sur une autre année, on ancre au 31 DÉCEMBRE et non au 1ᵉʳ janvier : c'est
 * le dernier mois qui peut porter des faits, donc celui d'où l'on remonte. Une
 * ancre au 1ᵉʳ janvier obligerait à avancer onze fois pour atteindre ce qu'on
 * vient chercher.
 */
export function ancreDeLAnnee(annee: number, maintenant: Date = new Date()): Date {
  if (annee === maintenant.getFullYear()) return maintenant;
  // Midi UTC : à minuit, un fuseau à l'ouest ferait basculer la date au
  // 30 décembre, et l'ancre changerait de mois selon le fuseau du lecteur.
  return new Date(Date.UTC(annee, 11, 31, 12));
}
