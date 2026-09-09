import type { DateISO, Mois } from '../types';
import type { Lieu, Quotite } from './planning';
import { lundiDeLaSemaine } from './planning';

/**
 * La synthèse hebdomadaire d'un compte rendu d'activité.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LA SEMAINE, ET NON LE JOUR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le CRA que nous rendions jusqu'ici était une liste de numéros de jours :
 * « 1 2 3 4 7 8 9 ½ 10 … ». C'est exact, et c'est illisible — un client qui
 * signe veut savoir combien de jours il paie et sur quoi, pas relire un
 * calendrier. Le dessin range donc par SEMAINE : le volume, sa répartition
 * entre télétravail et présence sur site, et la phrase qui dit ce qui a été
 * fait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE LIEU NE S'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `lieu` est facultatif dans le schéma : une journée saisie avant qu'il
 * existe, ou simplement jamais précisée, ne dit pas d'où elle a été
 * travaillée. Une colonne « télétravail » qui absorberait ces journées-là
 * ferait signer au client une répartition que personne n'a constatée — et une
 * mission facturée « sur site » qui ne l'a pas été se conteste.
 *
 * Elles vont donc dans une TROISIÈME colonne, `nonPrecise`, qui ne s'affiche
 * que lorsqu'elle porte quelque chose. C'est l'invariant n°3 appliqué à une
 * quotité : on s'abstient plutôt que de ranger au hasard.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUCUN MONTANT ICI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le module ne connaît ni TJM ni euros, et c'est délibéré : le compte rendu
 * d'activité est un suivi d'activité, la facture s'occupe des montants. La
 * carte que ce document remplace affichait le montant valorisé à côté du
 * total de jours — un CRA qui porte un prix se négocie au lieu de se signer.
 */

/** Une journée retenue, telle qu'elle sort du planning. */
export interface JourTravaille {
  readonly date: DateISO;
  /** Le client opérationnel : celui qui signe. */
  readonly client: string;
  readonly quotite: Quotite;
  readonly lieu: Lieu | null;
}

/** Le volume d'un client sur une période, ventilé par lieu. */
export interface VolumeClient {
  readonly client: string;
  readonly teletravail: Quotite;
  readonly surSite: Quotite;
  /** Les journées dont le lieu n'a jamais été renseigné. Voir l'en-tête. */
  readonly nonPrecise: Quotite;
  readonly total: Quotite;
}

export interface SemaineCra {
  /** Le lundi de la semaine. Clé stable des notes hebdomadaires. */
  readonly lundi: DateISO;
  /**
   * Le rang de la semaine DANS LE MOIS : « Semaine 1 », « Semaine 2 »…
   *
   * Compté sur le CALENDRIER, et non parmi les semaines retenues. Un mois qui
   * commence un mercredi et dont la première semaine n'a rien produit rendrait
   * sinon « Semaine 1 » pour ce qui est en réalité la deuxième — et le client
   * qui recoupe avec son propre calendrier ne s'y retrouve plus.
   */
  readonly rang: number;
  /** Première et dernière journée réellement travaillées de la semaine. */
  readonly premierJour: DateISO;
  readonly dernierJour: DateISO;
  readonly volumes: readonly VolumeClient[];
  readonly total: Quotite;
}

export interface SyntheseCra {
  readonly mois: Mois;
  readonly semaines: readonly SemaineCra[];
  /** Les totaux du mois, un par client. */
  readonly parClient: readonly VolumeClient[];
  readonly total: Quotite;
}

/** Combien de semaines séparent deux lundis, plus un : « Semaine 1 » est la sienne. */
function rangDansLeMois(premierLundi: DateISO, lundi: DateISO): number {
  const JOUR = 86_400_000;
  const ecart = Date.parse(`${lundi}T00:00:00Z`) - Date.parse(`${premierLundi}T00:00:00Z`);
  return 1 + Math.round(ecart / (7 * JOUR));
}

/** Cumule des journées dans un volume, par client. */
function cumuler(jours: readonly JourTravaille[]): readonly VolumeClient[] {
  const par = new Map<string, { teletravail: number; surSite: number; nonPrecise: number }>();
  for (const j of jours) {
    if (j.quotite <= 0) continue;
    const v = par.get(j.client) ?? { teletravail: 0, surSite: 0, nonPrecise: 0 };
    if (j.lieu === 'teletravail') v.teletravail += j.quotite;
    else if (j.lieu === 'sur_site') v.surSite += j.quotite;
    else v.nonPrecise += j.quotite;
    par.set(j.client, v);
  }
  // Ordre alphabétique : l'ordre d'apparition dans le mois ferait changer les
  // lignes de place d'un mois à l'autre, et un document qu'on relit tous les
  // mois doit se lire au même endroit.
  return [...par.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([client, v]) => ({
      client,
      teletravail: v.teletravail,
      surSite: v.surSite,
      nonPrecise: v.nonPrecise,
      total: v.teletravail + v.surSite + v.nonPrecise
    }));
}

/**
 * La synthèse d'un mois, semaine par semaine.
 *
 * Les semaines sans aucune journée travaillée sont ÉCARTÉES, mais le rang ne
 * se resserre pas : un mois où rien n'a été fait la deuxième semaine rend
 * « Semaine 1 » puis « Semaine 3 ». Renuméroter masquerait précisément ce que
 * le client a le droit de constater — qu'une semaine entière n'a rien produit.
 */
export function syntheseHebdomadaire(
  mois: Mois, jours: readonly JourTravaille[]
): SyntheseCra {
  const retenus = jours.filter((j) => j.quotite > 0 && j.date.startsWith(mois));

  const parLundi = new Map<string, JourTravaille[]>();
  for (const j of retenus) {
    const lundi = lundiDeLaSemaine(j.date);
    const liste = parLundi.get(lundi);
    if (liste === undefined) parLundi.set(lundi, [j]);
    else liste.push(j);
  }

  const lundis = [...parLundi.keys()].sort();
  const premierLundi = lundiDeLaSemaine(`${mois}-01` as DateISO);
  const semaines: SemaineCra[] = lundis.map((lundi) => {
    const dedans = parLundi.get(lundi) as JourTravaille[];
    const dates = dedans.map((j) => j.date).sort();
    const volumes = cumuler(dedans);
    return {
      lundi: lundi as DateISO,
      rang: rangDansLeMois(premierLundi, lundi as DateISO),
      premierJour: dates[0] as DateISO,
      dernierJour: dates[dates.length - 1] as DateISO,
      volumes,
      total: volumes.reduce((s, v) => s + v.total, 0)
    };
  });

  const parClient = cumuler(retenus);
  return {
    mois,
    semaines,
    parClient,
    total: parClient.reduce((s, v) => s + v.total, 0)
  };
}

/** La synthèse restreinte à un seul destinataire, ou rendue telle quelle. */
export function pourDestinataire(
  synthese: SyntheseCra, client: string | null
): SyntheseCra {
  if (client === null) return synthese;
  const semaines = synthese.semaines
    .map((s) => {
      const volumes = s.volumes.filter((v) => v.client === client);
      return { ...s, volumes, total: volumes.reduce((acc, v) => acc + v.total, 0) };
    })
    .filter((s) => s.total > 0);
  const parClient = synthese.parClient.filter((v) => v.client === client);
  return {
    mois: synthese.mois,
    semaines,
    parClient,
    total: parClient.reduce((s, v) => s + v.total, 0)
  };
}
