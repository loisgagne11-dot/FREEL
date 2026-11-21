/**
 * Le carnet de commandes, lu sur les faits (lot 48) : l'onglet Missions
 * d'Activité, et lui seul.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES JOURS VIENNENT DU PLANNING, ET DE LUI SEUL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Jours faits », « jours à venir » et « jours signés par mois » se lisent sur
 * `planningsDuMois` — le planning dont sortent déjà le CRA, la prévision et la
 * facture du mois. Un second compte, même juste aujourd'hui, finirait par dire
 * 28,5 jours faits sur la liste des missions et 27 sur le compte rendu qu'on
 * envoie au client. Les règles (signée, préavis, reste, visibilité) sont dans
 * `calculs/carnetDeCommandes`.
 *
 * Chargé avec l'onglet, à la demande : l'entrée n'a pas la place (79,53 /
 * 80 Ko au début du lot), et rien ici ne sert au premier écran.
 */

import {
  type CarnetSigne, type EtatDeMission, type FinAnnoncee, type FinDeVisibilite,
  carnetSigne, courtJusquA, echeanceEnCours, estSignee, etatDeLaMission, finAnnoncee,
  finDeVisibilite, joursSignesDesMois, resteAProduire, travailAcheve
} from '../domain/calculs/carnetDeCommandes';
import { decalerMois } from '../domain/calculs/periode';
import { previsionDuMois } from '../domain/calculs/prevision';
import { type DateISO, type Euros, type Mois, type Resolution, euros, moisDe } from '../domain/types';
import type { Faits, Mission } from './schema';
import { dateDuJour } from './selecteurs';
import { type MoisEnChiffres, lignesDeMission, moisEnChiffres } from './selecteurs.activite';
import { planningsDuMois } from './selecteurs.prevision';

/** Une mission, et tout ce que la liste en dit. */
export interface LigneDuCarnet {
  readonly mission: Mission;
  readonly nom: string;
  /** Jours retenus au planning jusqu'à aujourd'hui inclus ; `null` pour un prospect ou une perdue. */
  readonly joursFaits: number | null;
  readonly joursCommandes: number | null;
  /** `null` hors d'une mission signée : il n'y a rien à produire. */
  readonly reste: Resolution<number> | null;
  readonly echeance: DateISO | null;
  readonly finAnnoncee: FinAnnoncee | null;
  readonly facture: Euros;
  readonly encaisse: Euros;
  readonly resteARentrer: Euros;
  /** Voir `LigneMission.missionsQuiPartagent` : au-delà de 1, montants du client. */
  readonly missionsQuiPartagent: number;
  readonly aFacturer: Euros;
  readonly etat: EtatDeMission;
}

export interface OccupationDuMois {
  readonly mois: Mois;
  readonly chiffres: MoisEnChiffres;
  /** L'occupation des douze derniers mois, celui-ci compris ; `null` quand un mois n'a aucun jour ouvrable. */
  readonly tendance: readonly (number | null)[];
}

export interface EtatDuCarnet {
  readonly aujourdhui: DateISO;
  readonly lignes: readonly LigneDuCarnet[];
  readonly carnet: CarnetSigne;
  readonly visibilite: FinDeVisibilite;
  /** Les douze mois à venir, celui-ci compris. */
  readonly mois: readonly Mois[];
  /** Les jours signés de chacun : `null` (« — ») au-delà de tout contrat. */
  readonly joursSignes: readonly (number | null)[];
  readonly occupation: OccupationDuMois;
}

/** Le nom d'une mission dans une liste — comme l'ancienne, le client à défaut. */
export const nomDeMission = (m: Mission): string =>
  m.description || m.clientNom || 'Mission sans description';

/** Au-delà, l'horizon ne s'allonge plus : un contrat jusqu'en 2099 ne doit pas planifier soixante-dix ans. */
const HORIZON_MAX_MOIS = 120;

interface JoursDeMission {
  faits: number;
  valeurFaite: number;
  aVenir: number;
  readonly parMois: Map<Mois, number>;
}

/** Le premier mois où une mission signée ou terminée a quelque chose au planning. */
function premierMoisDuPlanning(missions: readonly Mission[], plancher: Mois): Mois | null {
  let premier: string | null = null;
  for (const m of missions) {
    if (m.statut !== 'active' && m.statut !== 'terminee') continue;
    const dates = [
      ...(m.debut === null ? [] : [m.debut]),
      ...m.entites.flatMap((e) => [...e.rythmes.map((r) => r.du), ...Object.keys(e.ajustements)])
    ].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    for (const d of dates) if (premier === null || d < premier) premier = d;
  }
  if (premier === null) return null;
  const mois = premier.slice(0, 7) as Mois;
  return mois < plancher ? plancher : mois;
}

/**
 * Les jours de chaque mission, du premier mois de planning à l'horizon : faits
 * (jusqu'à aujourd'hui inclus), valorisés au tarif de leur date, à venir
 * (jusqu'à l'échéance), et par mois.
 *
 * Aujourd'hui compte parmi les jours faits : le planning le dit travaillé, et
 * le compter « à venir » le ferait disparaître du reste le soir venu.
 */
function joursDesMissions(
  faits: Faits, aujourdhui: DateISO, horizon: Mois
): ReadonlyMap<string, JoursDeMission> {
  const parMission = new Map<string, JoursDeMission>();
  const courant = moisDe(aujourdhui);
  const debut = premierMoisDuPlanning(faits.missions, decalerMois(courant, -HORIZON_MAX_MOIS * 2));
  if (debut === null) return parMission;
  const echeances = new Map(faits.missions.map((m) => [m.id, echeanceEnCours(m, aujourdhui)]));

  for (let m = debut; m <= horizon; m = decalerMois(m, 1)) {
    for (const { mission, entite, planning } of planningsDuMois(faits, m)) {
      const acc = parMission.get(mission.id)
        ?? { faits: 0, valeurFaite: 0, aVenir: 0, parMois: new Map<Mois, number>() };
      parMission.set(mission.id, acc);
      const echeance = echeances.get(mission.id) ?? null;
      const passes = planning.filter((j) => j.date <= aujourdhui);
      acc.faits += passes.reduce((s, j) => s + j.retenu, 0);
      acc.valeurFaite += previsionDuMois(m, passes, entite.rythmes, mission.tjm).montantRetenu;
      acc.aVenir += planning
        .filter((j) => j.date > aujourdhui && (echeance === null || j.date <= echeance))
        .reduce((s, j) => s + j.retenu, 0);
      acc.parMois.set(m, (acc.parMois.get(m) ?? 0) + planning.reduce((s, j) => s + j.retenu, 0));
    }
  }
  return parMission;
}

/** L'horizon du calcul : douze mois, ou la plus lointaine échéance signée. */
function horizonDu(faits: Faits, aujourdhui: DateISO): Mois {
  const courant = moisDe(aujourdhui);
  let horizon = decalerMois(courant, 11);
  const plafond = decalerMois(courant, HORIZON_MAX_MOIS);
  for (const m of faits.missions) {
    if (!estSignee(m)) continue;
    const e = echeanceEnCours(m, aujourdhui);
    if (e === null) continue;
    const mois = moisDe(e);
    if (mois > horizon) horizon = mois > plafond ? plafond : mois;
  }
  return horizon;
}

/**
 * L'état de l'onglet Missions, à la date du jour.
 *
 * Les douze mois commencent au mois COURANT : le carnet regarde devant, et le
 * mois qu'on vit est le premier qu'il faut remplir.
 */
export function etatDuCarnet(faits: Faits, maintenant: Date = new Date()): EtatDuCarnet {
  const aujourdhui = dateDuJour(maintenant);
  const courant = moisDe(aujourdhui);
  const jours = joursDesMissions(faits, aujourdhui, horizonDu(faits, aujourdhui));
  const produits = new Map(lignesDeMission(faits).map((l) => [l.mission.id, l]));

  const lignes = faits.missions.map((mission): LigneDuCarnet => {
    const j = jours.get(mission.id);
    const produit = produits.get(mission.id);
    const facture = produit?.facture ?? euros(0);
    const resteARentrer = produit?.resteARentrer ?? euros(0);
    const signee = estSignee(mission);
    const joursFaits = mission.statut === 'active' || mission.statut === 'terminee' ? j?.faits ?? 0 : null;
    /* Ce qui attend sa facture : le travail fait, valorisé comme le brouillon
       du mois, moins le facturé — sur une mission achevée seulement. */
    const aFacturer = signee && travailAcheve(mission, joursFaits ?? 0, aujourdhui)
      ? euros(Math.max(0, (j?.valeurFaite ?? 0) - facture))
      : euros(0);
    return {
      mission,
      nom: nomDeMission(mission),
      joursFaits,
      joursCommandes: mission.joursCommandes ?? null,
      reste: signee ? resteAProduire(mission, j?.faits ?? 0, j?.aVenir ?? 0, aujourdhui) : null,
      echeance: echeanceEnCours(mission, aujourdhui),
      finAnnoncee: finAnnoncee(mission, aujourdhui),
      facture,
      encaisse: produit?.encaisse ?? euros(0),
      resteARentrer,
      missionsQuiPartagent: produit?.missionsQuiPartagent ?? 1,
      aFacturer,
      etat: etatDeLaMission(mission, { aujourdhui, aFacturer, facture, resteARentrer })
    };
  });

  const mois = Array.from({ length: 12 }, (_, i) => decalerMois(courant, i));
  /* Toute mission au planning — signée, ou terminée dans le mois : ce sont
     les jours que l'occupation du même mois compte, et la rangée se lit en
     regard de la tuile. Un prospect n'a pas de planning (`planningsDuMois` ne
     le lit pas) : il n'y entre jamais. */
  const signesParMois = new Map<Mois, number>();
  for (const j of jours.values()) {
    for (const [mm, n] of j.parMois) signesParMois.set(mm, (signesParMois.get(mm) ?? 0) + n);
  }

  const tendance = Array.from({ length: 12 }, (_, i) =>
    moisEnChiffres(faits, decalerMois(courant, i - 11)).occupation);

  return {
    aujourdhui,
    lignes,
    carnet: carnetSigne(lignes.flatMap((l) => (l.reste === null ? [] : [{
      statut: l.mission.statut, nom: l.nom, tjm: l.mission.tjm, reste: l.reste
    }]))),
    visibilite: finDeVisibilite(faits.missions, aujourdhui),
    mois,
    joursSignes: joursSignesDesMois(mois, signesParMois, courtJusquA(faits.missions, aujourdhui)),
    occupation: { mois: courant, chiffres: moisEnChiffres(faits, courant), tendance }
  };
}
