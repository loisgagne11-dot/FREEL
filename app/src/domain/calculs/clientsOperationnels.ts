import type { DateISO, Mois } from '../types';
import type { AjustementJour, Quotite, Rythme } from './planning';
import { planifier } from './planification';
import { type FaitsDuClient, finDuClient, plageActive } from './clientsOperationnels.lecture';

export { type FaitsDuClient, arretDuClient, finDuClient } from './clientsOperationnels.lecture';

/**
 * Arrêter un client opérationnel, et savoir qu'il l'est.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ARRÊTER, C'EST BORNER SES FAITS — RIEN DE STOCKÉ EN PLUS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une mission passée par une agence peut perdre l'un de ses clients finaux en
 * cours de route : le donneur d'ordre B s'arrête fin mars, A continue. Ce qui
 * remplit le planning de B, ce sont ses plages de rythme et ses corrections
 * datées ; l'arrêter, c'est donc borner les unes et retirer les autres après
 * le jour dit. Il n'y a ni champ « arrêté le », ni statut : la date se lit sur
 * les faits (`finDuClient`), et un champ à côté finirait par contredire les
 * plages qu'il prétend résumer — c'est l'invariant n° 2.
 *
 * La fin de la MISSION n'y entre pas : les plages ne la suivent pas — le
 * formulaire découpe le rythme au mois, et une mission prolongée ne rallonge
 * pas d'elle-même les plages déjà saisies. Lire l'arrêt sur `mission.fin`
 * donnerait pour arrêté un client qui travaille encore.
 *
 * Ce module est chargé à la demande, avec le formulaire de mission. La
 * lecture de l'arrêt, seule dont l'écran Activité ait besoin, vit à part dans
 * `clientsOperationnels.lecture` — voir pourquoi là-bas.
 */

/** Ce que l'arrêt a changé, pour pouvoir le dire avant de l'écrire. */
export interface BilanDeLArret {
  /** Plages qui couraient au-delà du jour dit, désormais closes ce jour-là. */
  readonly plagesBornees: number;
  /** Plages qui commençaient après le jour dit : elles n'ont plus d'objet. */
  readonly plagesRetirees: number;
  /** Corrections datées après le jour dit, zéros compris. */
  readonly correctionsRetirees: number;
  /** Ce que ces corrections déclaraient de travail, en jours. */
  readonly joursCorriges: Quotite;
}

export type ResultatArret<E extends FaitsDuClient> =
  | { readonly entite: E; readonly bilan: BilanDeLArret }
  | { readonly refus: string };

/** Le premier jour où le client a quelque chose, ou `null`. */
function debutDuClient(e: FaitsDuClient): DateISO | null {
  const dates = [
    ...e.rythmes.filter(plageActive).map((r) => r.du),
    ...Object.entries(e.ajustements).filter(([, a]) => a.quotite > 0).map(([d]) => d as DateISO)
  ];
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b));
}

/**
 * Arrête un client opérationnel au jour dit : il garde ce jour-là, perd la suite.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES ZÉROS PARTENT AUSSI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une correction à zéro après l'arrêt ne compte rien aujourd'hui. Elle n'est
 * pas inoffensive pour autant : si l'arrêt est un jour levé — une plage
 * rallongée —, elle effacerait en silence une journée que personne n'a
 * annulée. Elle est donc retirée, et comptée, comme les autres.
 *
 * Deux refus. Arrêter avant le premier jour du client, c'est le retirer de la
 * mission, avec ce qu'il a déjà travaillé : ce n'est pas le même geste, et le
 * confondre effacerait des journées faites. Arrêter un client qui n'a rien
 * après le jour dit ne changerait rien, et l'écrire ferait croire le
 * contraire.
 */
export function arreterClient<E extends FaitsDuClient>(entite: E, le: DateISO): ResultatArret<E> {
  const debut = debutDuClient(entite);
  if (debut !== null && le < debut) {
    return {
      refus: 'Ce client n’a encore rien travaillé à cette date : l’arrêter avant son '
        + 'premier jour reviendrait à le retirer de la mission. C’est « Retirer » qu’il faut.'
    };
  }

  let plagesBornees = 0;
  let plagesRetirees = 0;
  const rythmes: Rythme[] = [];
  for (const r of entite.rythmes) {
    if (r.du > le) { plagesRetirees += 1; continue; }
    if (r.au > le) { plagesBornees += 1; rythmes.push({ ...r, au: le }); continue; }
    rythmes.push(r);
  }

  let correctionsRetirees = 0;
  let joursCorriges = 0;
  const ajustements: Record<string, AjustementJour> = {};
  for (const [date, pose] of Object.entries(entite.ajustements)) {
    if (date > le) {
      correctionsRetirees += 1;
      joursCorriges += pose.quotite;
      continue;
    }
    ajustements[date] = pose;
  }

  if (plagesBornees + plagesRetirees + correctionsRetirees === 0) {
    return { refus: 'Rien n’est prévu pour ce client après cette date : il n’y a rien à arrêter.' };
  }

  return {
    entite: { ...entite, rythmes, ajustements },
    bilan: { plagesBornees, plagesRetirees, correctionsRetirees, joursCorriges }
  };
}

/** Les dates du lendemain de `apres` jusqu'à `jusquA` compris. */
function datesApres(apres: DateISO, jusquA: DateISO): readonly DateISO[] {
  const dates: DateISO[] = [];
  const d = new Date(`${apres}T00:00:00Z`);
  for (;;) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10) as DateISO;
    if (iso > jusquA) return dates;
    dates.push(iso);
  }
}

interface Contexte {
  readonly feries: ReadonlySet<string>;
  readonly conges: Readonly<Record<string, Quotite>>;
}

/**
 * Les journées qu'un arrêt au jour dit ferait cesser de compter, jusqu'à une
 * date donnée — corrections comprises, fériés et congés déduits.
 *
 * Par `planifier`, et non par un décompte des plages : c'est lui qui remplit
 * le planning, le CRA et la facture, et le chiffre annoncé avant l'arrêt doit
 * être exactement celui qui disparaîtra de ces trois-là.
 */
export function joursPerdusApres(
  entite: FaitsDuClient,
  le: DateISO,
  jusquA: DateISO,
  feries: Contexte['feries'],
  conges: Contexte['conges']
): Quotite {
  return planifier(datesApres(le, jusquA), {
    rythmes: entite.rythmes, ajustements: entite.ajustements, feries, conges
  }).reduce((s, j) => s + j.retenu, 0);
}

/** Ce qu'une écriture du livre porte et que l'avertissement d'un arrêt lit. */
export interface FactureDuLivre {
  readonly id: string;
  readonly numero: string;
  readonly clientNom: string;
  readonly emiseLe: DateISO | null;
  readonly annuleEcriture?: string | null;
}

/** Une facture déjà émise sur un mois dont l'arrêt retire des jours. */
export interface FactureTouchee {
  readonly numero: string;
  readonly mois: Mois;
}

/**
 * Les factures déjà émises, à l'un des payeurs, sur un mois où l'arrêt au jour
 * dit retire des jours — du lendemain jusqu'à la fin connue du client.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ARRÊT NE RÉÉCRIT PAS UNE FACTURE PARTIE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Arrêter un client le 13 mai retire ses jours du 14 au 31 du brouillon de mai.
 * Si la facture de mai est déjà partie, elle les porte encore : elle a un
 * numéro, le client l'a reçue, seul un avoir la corrige. Le dire avant l'arrêt
 * évite de découvrir l'écart au rapprochement — ou de croire la facture
 * corrigée par le geste.
 *
 * « La facture d'un mois » est celle ÉMISE ce mois-là, au payeur : la règle du
 * brouillon, qui la met en regard du planning du même mois. Une écriture
 * d'annulation n'en est pas une ; une facture déjà annulée non plus — elle ne
 * porte plus rien qu'un avoir aurait à corriger.
 */
export function facturesTouchees(
  livre: readonly FactureDuLivre[],
  payeurs: ReadonlySet<string>,
  le: DateISO,
  jusquA: DateISO
): readonly FactureTouchee[] {
  if (jusquA <= le) return [];
  const lendemain = new Date(`${le}T00:00:00Z`);
  lendemain.setUTCDate(lendemain.getUTCDate() + 1);
  const premier = lendemain.toISOString().slice(0, 7);
  const dernier = jusquA.slice(0, 7);
  const annulees = new Set(livre.flatMap((r) =>
    (typeof r.annuleEcriture === 'string' ? [r.annuleEcriture] : [])));
  return livre
    .flatMap((r): FactureTouchee[] => {
      if (r.emiseLe === null || typeof r.annuleEcriture === 'string' || annulees.has(r.id)) return [];
      const mois = r.emiseLe.slice(0, 7);
      if (!payeurs.has(r.clientNom) || mois < premier || mois > dernier) return [];
      return [{ numero: r.numero, mois: mois as Mois }];
    })
    .sort((a, b) => a.mois.localeCompare(b.mois) || a.numero.localeCompare(b.numero));
}

/** Ce que retirer un client de la mission emporterait avec lui. */
export interface BilanDuRetrait {
  /** Journées retenues jusqu'à aujourd'hui inclus : du travail fait. */
  readonly joursPasses: Quotite;
  /** Corrections posées à la main, toutes dates confondues. */
  readonly corrections: number;
  /** Journées que le planning prévoit encore après aujourd'hui. */
  readonly joursAVenir: Quotite;
}

/**
 * Ce que retirer un client ferait disparaître, passé et avenir séparés.
 *
 * Les deux ne pèsent pas pareil : retirer un client qui a déjà travaillé efface
 * des journées qu'un CRA a peut-être déjà portées, et c'est à dire avant le
 * geste ; retirer ce qui reste à venir ne fait que vider une prévision. Les
 * journées à venir sont les RETENUES — un jour de repos déjà posé à zéro n'est
 * pas prévu.
 */
export function bilanDuRetrait(
  entite: FaitsDuClient,
  aujourdhui: DateISO,
  feries: Contexte['feries'],
  conges: Contexte['conges']
): BilanDuRetrait {
  const debut = debutDuClient(entite);
  const fin = finDuClient(entite);
  const corrections = Object.keys(entite.ajustements).length;
  if (debut === null || fin === null) return { joursPasses: 0, corrections, joursAVenir: 0 };

  const veille = new Date(`${debut}T00:00:00Z`);
  veille.setUTCDate(veille.getUTCDate() - 1);
  const planning = planifier(datesApres(veille.toISOString().slice(0, 10) as DateISO, fin), {
    rythmes: entite.rythmes, ajustements: entite.ajustements, feries, conges
  });
  let joursPasses = 0;
  let joursAVenir = 0;
  for (const j of planning) {
    if (j.date <= aujourdhui) joursPasses += j.retenu;
    else joursAVenir += j.retenu;
  }
  return { joursPasses, corrections, joursAVenir };
}
