import type { Euros, Mois } from '../types';
import { euros } from '../types';

/**
 * Les périodes à déclarer à l'URSSAF, et celles qui l'ont été.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE FAIT QUI MANQUAIT À L'INTERFACE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La décision D3 tient les provisions en DEUX volets : ce que l'URSSAF a déjà
 * appelé, et ce qui est dû sur des recettes encaissées mais pas encore
 * déclaré. Le second bascule dans le premier au moment de la déclaration.
 *
 * Le magasin savait faire basculer — `marquerPeriodeDeclaree` existait. Aucun
 * écran ne l'appelait. Une période déclarée restait donc éternellement dans le
 * volet « à provisionner » : les provisions montaient sans jamais redescendre,
 * et le versable — ce qu'on peut se verser — baissait d'autant. C'est une des
 * raisons pour lesquelles les chiffres ne ressemblaient plus à rien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA PÉRIODE SUIT LA PÉRIODICITÉ DÉCLARÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un déclarant trimestriel ne déclare pas un mois : il déclare un trimestre.
 * Lui demander de cocher avril, mai puis juin l'obligerait à faire trois fois
 * un geste qu'il fait une fois — et à se tromper une fois sur trois, en
 * oubliant le mois où il n'a rien encaissé.
 *
 * Une période trimestrielle porte donc ses trois mois, et la marquer déclarée
 * les marque tous les trois d'un coup.
 */

export type Periodicite = 'mensuel' | 'trimestriel';

export interface PeriodeADeclarer {
  /** Clé stable : `2026-07` en mensuel, `2026-T3` en trimestriel. */
  readonly id: string;
  readonly libelle: string;
  /** Les mois couverts — ce que `marquerPeriodeDeclaree` attend. */
  readonly mois: readonly Mois[];
  /** Ce qui a été encaissé sur la période. */
  readonly encaisse: Euros;
  /** Toute la période est-elle marquée déclarée ? */
  readonly declaree: boolean;
  /**
   * La période est-elle terminée ?
   *
   * On ne déclare pas un trimestre en cours : l'URSSAF ouvre la déclaration
   * après sa clôture, et permettre de la cocher avant ferait sortir du volet
   * « à provisionner » des recettes encore à encaisser dessus.
   */
  readonly close: boolean;
}

const MOIS_LISIBLES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

/**
 * Range les encaissements en périodes déclarables.
 *
 * Seules les périodes qui portent au moins un encaissement sont rendues : une
 * période vide n'a rien à déclarer, et l'afficher ferait une liste de cases à
 * cocher sans objet où les vraies échéances se perdraient.
 */
export function periodesADeclarer(
  encaissements: readonly { readonly encaisseeLe: string; readonly montant: number }[],
  periodicite: Periodicite,
  declarees: readonly Mois[],
  aujourdhui: string
): readonly PeriodeADeclarer[] {
  const parPeriode = new Map<string, { mois: Set<string>; total: number }>();

  for (const e of encaissements) {
    const m = e.encaisseeLe.slice(0, 7);
    if (m.length !== 7) continue;
    const cle = clePeriode(m, periodicite);
    const entree = parPeriode.get(cle) ?? { mois: new Set<string>(), total: 0 };
    entree.mois.add(m);
    entree.total += e.montant;
    parPeriode.set(cle, entree);
  }

  const dejaDeclares = new Set<string>(declarees);
  const moisCourant = aujourdhui.slice(0, 7);

  return [...parPeriode.entries()]
    .map(([id, { mois, total }]) => {
      // Tous les mois de la période, pas seulement ceux qui portent une
      // recette : déclarer un trimestre le déclare en entier, y compris le
      // mois creux — sinon il resterait « à provisionner » pour l'éternité.
      const couverts = moisDeLaPeriode(id, periodicite);
      return {
        id,
        libelle: libelleDe(id, periodicite),
        mois: couverts,
        encaisse: euros(total),
        declaree: couverts.every((m) => dejaDeclares.has(m)),
        close: (couverts[couverts.length - 1] as string) < moisCourant,
        _tri: [...mois].sort()[0] ?? id
      };
    })
    // La plus récente en tête : c'est celle qu'on vient déclarer.
    .sort((a, b) => b.id.localeCompare(a.id))
    .map(({ _tri, ...p }) => p);
}

function clePeriode(mois: string, periodicite: Periodicite): string {
  if (periodicite === 'mensuel') return mois;
  const annee = mois.slice(0, 4);
  const trimestre = Math.floor((Number(mois.slice(5, 7)) - 1) / 3) + 1;
  return `${annee}-T${trimestre}`;
}

function moisDeLaPeriode(id: string, periodicite: Periodicite): readonly Mois[] {
  if (periodicite === 'mensuel') return [id as Mois];
  const annee = id.slice(0, 4);
  const trimestre = Number(id.slice(6));
  const premier = (trimestre - 1) * 3 + 1;
  return [0, 1, 2].map((d) => `${annee}-${String(premier + d).padStart(2, '0')}` as Mois);
}

function libelleDe(id: string, periodicite: Periodicite): string {
  if (periodicite === 'mensuel') {
    const m = MOIS_LISIBLES[Number(id.slice(5, 7)) - 1] ?? id;
    return `${m} ${id.slice(0, 4)}`;
  }
  return `${id.slice(5)} ${id.slice(0, 4)}`;
}
