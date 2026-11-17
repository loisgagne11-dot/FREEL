import type { DateISO, Euros, Mois } from '../types';
import { euros } from '../types';
import type { PeriodeDeclaree } from './declarations.declarees';
import { reporterAuJourOuvre } from './calendrier.ouvres';

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
    const le = declarees.find((p) => p.nature === 'urssaf' && p.periode === m)?.declareeLe ?? null;
    if (le === null) return null;
    if (derniere === null || le > derniere) derniere = le;
  }
  return derniere;
}

/** Un ordre stable des déclarations : par nature, puis par période. */
export const ordreDesDeclarees = (a: PeriodeDeclaree, b: PeriodeDeclaree): number =>
  a.nature.localeCompare(b.nature) || a.periode.localeCompare(b.periode);

/**
 * Les appels de cotisations qui règlent une période : ceux qui la portent
 * (`Echeance.periode`, schéma 25).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN LIEN STOCKÉ, PARCE QUE LE MOIS NE SUFFIT PLUS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Jusqu'au schéma 24, l'appel se rapprochait par le mois de la date limite :
 * la déclaration et le paiement se font ensemble, le mois qui suit la
 * période. C'était juste tant que la limite ne bougeait pas. Reportée au jour
 * ouvré, elle change de mois : la limite d'avril 2026 (dimanche 31 mai) passe
 * au lundi 1er juin, celle de mai tombe le 30 juin — et les deux périodes
 * revendiquaient les mêmes appels de juin, dont le « payée le » se lisait
 * deux fois. Celle du T4 2026 (dimanche 31 janvier 2027) passe en février,
 * et l'appel saisi au 31 janvier n'appartenait plus à personne.
 *
 * Un appel règle UNE période : c'est un fait de l'appel, posé quand la
 * déclaration le crée, et non une déduction de sa date.
 */
export function appelsDeLaPeriode<E extends { readonly nature: string; readonly periode?: string | null }>(
  periode: string, echeances: readonly E[]
): readonly E[] {
  return echeances.filter((e) => e.nature === 'urssaf' && e.periode === periode);
}

/**
 * L'identifiant de l'appel qu'une déclaration URSSAF crée : un par période.
 *
 * Il dit la provenance sans champ de plus au schéma. « Annuler la
 * déclaration » ne retire que CET appel — jamais un appel saisi à la main ou
 * rattaché par la migration, que l'utilisateur a recopié d'un vrai courrier —,
 * et déclarer de nouveau la même période le corrige au lieu d'en créer un
 * second, qui ferait compter la dette deux fois.
 */
export const idAppelDeDeclaration = (periode: string): string => `ech-declaration-urssaf-${periode}`;

/** Une période URSSAF, sans ce que les encaissements et les déclarations en disent. */
export type PeriodeUrssaf = Pick<PeriodeADeclarer, 'id' | 'libelle' | 'mois' | 'close' | 'limite'>;

/**
 * La période qui contient un mois, selon la périodicité : ce que le détail
 * d'une dette, qui raisonne au mois d'encaissement, doit déclarer. Un mois
 * d'un trimestre se déclare avec son trimestre — le déclarer seul laissait
 * une période déclarée aux deux tiers, que la règle lit « pas déclarée ».
 */
export function periodeDuMois(m: Mois, periodicite: Periodicite, aujourdhui: string): PeriodeUrssaf {
  const id = clePeriode(m, periodicite);
  const couverts = moisDeLaPeriode(id, periodicite);
  const dernier = couverts[couverts.length - 1] as Mois;
  return {
    id,
    libelle: libelleDe(id, periodicite),
    mois: couverts,
    close: dernier < aujourdhui.slice(0, 7),
    limite: dateLimiteDeclaration(dernier)
  };
}

/**
 * La période qu'un appel réglait sous la règle d'avant le schéma 25 : celle
 * dont la limite — dernier jour du mois suivant, sans report — tombait dans
 * le mois de l'appel. Ne sert qu'à la migration, pour poser le lien que
 * l'ancienne règle faisait à la lecture : rien de ce qu'on voyait ne change.
 *
 * `null` quand aucune période ne finissait le mois d'avant — un appel de mai
 * en trimestriel : l'ancienne règle ne le rattachait à rien, la migration non
 * plus.
 */
export function periodeSelonLeMoisDeLAppel(echeanceLe: string, periodicite: Periodicite): string | null {
  const total = Number(echeanceLe.slice(0, 4)) * 12 + (Number(echeanceLe.slice(5, 7)) - 1) - 1;
  if (!Number.isFinite(total)) return null;
  const precedent = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  if (periodicite === 'mensuel') return precedent;
  return (total % 12) % 3 === 2 ? clePeriode(precedent, 'trimestriel') : null;
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
   * période — 30 avril, 31 juillet, 31 octobre, 31 janvier en trimestriel —,
   * reportée au jour ouvré, sauf exception annoncée (voir
   * `dateLimiteDeclaration`). Avant elle, une période close est « à
   * déclarer » ; après, « en retard ».
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
 * Les échéances que l'Urssaf a fixées autrement que la règle, par DERNIER
 * mois de la période — un mois en mensuel, le dernier du trimestre sinon.
 * Une annonce ne vaut que pour l'échéance qu'elle nomme : elle s'écrit ici,
 * datée et sourcée, et ne devient jamais une règle.
 *
 *  · `2026-09` — septembre et T3 2026 : « L'échéance du samedi 31 octobre ne
 *    sera pas reportée au 2 novembre ». Le report l'aurait annoncée au lundi,
 *    et une déclaration du 1er novembre se serait lue à l'heure alors qu'elle
 *    était en retard. Actualité Urssaf du 27/10/2026, relevée le 17/11/2026 :
 *    https://www.autoentrepreneur.urssaf.fr/portail/accueil/sinformer-sur-le-statut/toutes-les-actualites/campagne-nationale-de-fiabilis-3.html
 *  · `2026-08` — août 2026, en mensuel : après la panne du 25/09 au
 *    19/10/2026, « aucune majoration de retard » pour la déclaration d'août si
 *    elle est faite en octobre 2026. La limite officielle restait le
 *    30 septembre ; celle qui décide d'une majoration — donc d'un « en
 *    retard » — est le 31 octobre. Sans elle, une déclaration faite le
 *    15 octobre, que l'Urssaf n'a pas sanctionnée, s'affichait en retard.
 *    Actualité Urssaf du 21/10/2026, relevée le 17/11/2026 :
 *    https://www.autoentrepreneur.urssaf.fr/portail/accueil/sinformer-sur-le-statut/toutes-les-actualites/resolution-des-difficultes-renco.html
 */
const ECHEANCES_ANNONCEES: Readonly<Record<string, DateISO>> = {
  '2026-09': '2026-10-31' as DateISO,
  '2026-08': '2026-10-31' as DateISO
};

/** Les échéances de `ECHEANCES_ANNONCEES` qui sont des TOLÉRANCES : la limite officielle reste due. */
const TOLERANCES = new Set<string>(['2026-08']);

/**
 * La limite officielle d'une période que l'Urssaf a tolérée au-delà, ou
 * `null` sans tolérance. Décision du propriétaire du 17/11 : la tolérance
 * s'affiche avec la date officielle, « tolérée jusqu'au 31 octobre » — la
 * date qui décide d'un retard reste celle de `dateLimiteDeclaration`.
 */
export function limiteOfficielleToleree(dernierMois: Mois): DateISO | null {
  if (!TOLERANCES.has(dernierMois)) return null;
  const annee = Number(dernierMois.slice(0, 4));
  const mois = Number(dernierMois.slice(5, 7));
  return reporterAuJourOuvre(new Date(Date.UTC(annee, mois + 1, 0)).toISOString().slice(0, 10) as DateISO);
}

/**
 * La date limite de déclaration d'une période qui finit avec `dernierMois` :
 * le dernier jour du mois qui suit, REPORTÉ au premier jour ouvré quand il
 * tombe un samedi, un dimanche ou un jour férié — sauf échéance annoncée
 * autrement (`ECHEANCES_ANNONCEES`). La SEULE règle de la limite URSSAF : le
 * Pilote, la requête « à traiter » et l'échéancier la lisent tous ici.
 *
 * Le report est la doctrine de l'Urssaf — « si la date d'exigibilité est un
 * samedi, un dimanche, ou un jour férié, la date d'exigibilité est reportée
 * au jour qui suit » (exemple donné : le 31/08/2025 reporté au 01/09/2025) ;
 * aucun article du code de la sécurité sociale n'a été trouvé qui le pose.
 * Relevée le 17/11/2026 :
 * https://www.autoentrepreneur.urssaf.fr/portail/accueil/une-question/toutes-les-fiches-pratiques/declarer-et-payer-mes-cotisation.html
 * Sans lui, le T4 2026 passait en retard le lundi 1er février 2027, jour où il
 * se déclare encore — la limite du dimanche 31 janvier ayant glissé.
 *
 * Le dernier jour se trouve par le jour zéro du mois d'après — le calendrier
 * fait le travail — et non par un « + 1 mois » sur une date, qui tombe à côté
 * dès qu'un mois a moins de jours que le précédent.
 */
export function dateLimiteDeclaration(dernierMois: Mois): DateISO {
  const annoncee = ECHEANCES_ANNONCEES[dernierMois];
  if (annoncee !== undefined) return annoncee;
  const annee = Number(dernierMois.slice(0, 4));
  const mois = Number(dernierMois.slice(5, 7)); // 1 à 12 ; l'index 0-based du mois d'après
  return reporterAuJourOuvre(new Date(Date.UTC(annee, mois + 1, 0)).toISOString().slice(0, 10) as DateISO);
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
