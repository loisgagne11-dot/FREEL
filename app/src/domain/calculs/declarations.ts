import type { DateISO, Euros, Mois } from '../types';
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

/**
 * Un mois déclaré, et le jour où il l'a été.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE DATE, PAS UNE CASE COCHÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Jusqu'au schéma 20, `periodesDeclarees` était une liste de mois nus : la
 * période était déclarée ou ne l'était pas. Le cycle réel d'une obligation est
 * « à déclarer → déclarée le … → payée le … », et la seule étape datée était
 * la dernière. Une déclaration faite le 2 août pour une limite au 31 juillet
 * se lisait donc « Déclarée », exactement comme une déclaration faite à
 * l'heure — le retard, qui coûte une majoration, n'avait aucune trace.
 *
 * `null` quand la date n'est pas connue : toute période cochée avant le
 * schéma 21. On ne pose ni la date limite ni le jour de la migration — aucune
 * des deux n'est le jour où la déclaration a été faite, et une date inventée
 * serait indiscernable d'une vraie. Elle se complète depuis l'échéancier.
 */
export interface PeriodeDeclaree {
  readonly mois: Mois;
  readonly declareeLe: DateISO | null;
}

/**
 * Les mois déclarés, sans leur date — ce que lisent les provisions et la
 * règle des périodes à déclarer, qui n'ont besoin que de savoir SI.
 */
export function moisDeclares(declarees: readonly PeriodeDeclaree[]): readonly Mois[] {
  return declarees.map((p) => p.mois);
}

/**
 * Le jour où une période a été déclarée, ou `null` s'il n'est pas connu.
 *
 * Un trimestre se déclare d'un geste : ses trois mois portent la même date.
 * S'ils en portaient plusieurs — un dossier modifié à la main —, la plus
 * tardive est retenue : la période n'était pas déclarée en entier avant elle.
 * Un seul mois sans date suffit à rendre `null` : on ne sait pas.
 */
export function dateDeDeclaration(
  mois: readonly Mois[], declarees: readonly PeriodeDeclaree[]
): DateISO | null {
  let derniere: DateISO | null = null;
  for (const m of mois) {
    const le = declarees.find((p) => p.mois === m)?.declareeLe ?? null;
    if (le === null) return null;
    if (derniere === null || le > derniere) derniere = le;
  }
  return derniere;
}

/**
 * Les appels de cotisations qui règlent une période : ceux dont l'échéance
 * tombe dans le mois de la date limite — la déclaration et le paiement se
 * font ensemble, le mois qui suit la période.
 *
 * Dérivé, et non un lien stocké : une échéance ne porte pas sa période, et
 * lui en ajouter une aurait fait deux vérités à tenir d'accord (sa date, sa
 * période). Le rapprochement par le mois est celui que l'URSSAF applique.
 */
export function appelsDeLaPeriode<E extends { readonly nature: string; readonly echeanceLe: string }>(
  limite: DateISO, echeances: readonly E[]
): readonly E[] {
  const moisLimite = limite.slice(0, 7);
  return echeances.filter((e) => e.nature === 'urssaf' && e.echeanceLe.startsWith(moisLimite));
}

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
  /**
   * La date limite de déclaration : le dernier jour du mois qui suit la
   * période — 30 avril, 31 juillet, 31 octobre, 31 janvier en trimestriel.
   * Avant elle, une période close est « à déclarer » ; après, « en retard ».
   */
  readonly limite: DateISO;
}

const MOIS_LISIBLES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

/**
 * Range les encaissements en périodes déclarables — la SEULE règle des
 * périodes à déclarer, pour le Pilote comme pour l'échéancier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX RÈGLES DU MÊME NOM, ET UN CUL-DE-SAC
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le Pilote comptait toute période close depuis le début d'activité,
 * déclarations à zéro comprises ; l'échéancier ne gardait que les périodes
 * portant un encaissement. Le Pilote annonçait « 4 périodes à déclarer », le
 * bouton « Déclarer » menait à l'échéancier, qui n'en montrait qu'une : les
 * trois autres ne pouvaient jamais être marquées, et l'alerte ne disparaissait
 * jamais.
 *
 * La règle retenue est celle du Pilote, parce qu'elle est celle de l'URSSAF :
 * une période close se déclare, même à zéro. Une période vide n'est donc
 * rendue que si elle est close et postérieure au début d'activité — une
 * période en cours sans recette n'a encore rien à dire.
 */
export function periodesADeclarer(
  encaissements: readonly { readonly encaisseeLe: string; readonly montant: number }[],
  periodicite: Periodicite,
  declarees: readonly Mois[],
  aujourdhui: string,
  debutActivite: Mois | null = null
): readonly PeriodeADeclarer[] {
  const parPeriode = new Map<string, { mois: Set<string>; total: number }>();
  const moisCourant = aujourdhui.slice(0, 7);

  // Les périodes closes depuis le début d'activité, vides comprises : la
  // déclaration à zéro est due.
  if (debutActivite !== null) {
    for (let m: string = debutActivite; m < moisCourant; m = moisSuivant(m)) {
      const cle = clePeriode(m, periodicite);
      const couverts = moisDeLaPeriode(cle, periodicite);
      if ((couverts[couverts.length - 1] as string) >= moisCourant) continue;
      if (!parPeriode.has(cle)) parPeriode.set(cle, { mois: new Set<string>(), total: 0 });
    }
  }

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
        limite: dateLimiteDeclaration(couverts[couverts.length - 1] as Mois),
        _tri: [...mois].sort()[0] ?? id
      };
    })
    // La plus récente en tête : c'est celle qu'on vient déclarer.
    .sort((a, b) => b.id.localeCompare(a.id))
    .map(({ _tri, ...p }) => p);
}

function moisSuivant(m: string): string {
  const total = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function clePeriode(mois: string, periodicite: Periodicite): string {
  if (periodicite === 'mensuel') return mois;
  const annee = mois.slice(0, 4);
  const trimestre = Math.floor((Number(mois.slice(5, 7)) - 1) / 3) + 1;
  return `${annee}-T${trimestre}`;
}

/**
 * Le dernier jour du mois qui suit `dernierMois`.
 *
 * Par le jour zéro du mois d'après — le calendrier fait le travail — et non
 * par un « + 1 mois » sur une date, qui tombe à côté dès qu'un mois a moins
 * de jours que le précédent (31 janvier + 1 mois n'existe pas).
 */
export function dateLimiteDeclaration(dernierMois: Mois): DateISO {
  const annee = Number(dernierMois.slice(0, 4));
  const mois = Number(dernierMois.slice(5, 7)); // 1 à 12 ; l'index 0-based du mois d'après
  return new Date(Date.UTC(annee, mois + 1, 0)).toISOString().slice(0, 10) as DateISO;
}

export function moisDeLaPeriode(id: string, periodicite: Periodicite): readonly Mois[] {
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
