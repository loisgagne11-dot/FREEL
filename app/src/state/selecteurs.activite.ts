/**
 * Sélecteurs de l'écran Activité.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE À PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `selecteurs.ts` était un module unique. Le Pilote y puisant `etatPilote`,
 * l'empaqueteur emportait le fichier ENTIER dans le lot de premier rendu —
 * y compris le plan de charge, la dépendance client et les délais de
 * paiement, qui n'appartiennent qu'à un écran chargé à la demande.
 *
 * Le budget de premier rendu l'a signalé en dépassant. Relever le seuil
 * aurait masqué la cause : ces sélecteurs vivent donc à côté de l'écran qui
 * les emploie, et ne pèsent plus sur l'ouverture de l'application.
 */

import type { Jour, ZoneFeries } from '../domain/calculs/activite';
import { joursFeries } from '../domain/calculs/activite';
import type { Creneau, JourPlanifie, Lieu } from '../domain/calculs/planning';
import {
  CRENEAUX, craDuMois, creneauxOccupes, jourDeSemaine, planifier
} from '../domain/calculs/planning';

/** Les deux jours que le rythme ne remplit jamais de lui-même. */
const JOURS_DE_REPOS = new Set(['sam', 'dim']);
import { type PrevisionDuMois, previsionDuMois } from '../domain/calculs/prevision';
import type { Cra } from '../domain/calculs/planning';
import {
  calendrierDuMois, chargeDuMois, joursDuMois, planDeCharge
} from '../domain/calculs/activite';
import type { ChargeDuMois, PlanDeCharge, SourceCharge } from '../domain/calculs/activite';
import { delaisParClient, type DelaiClient } from '../domain/calculs/activite';
import type { DateISO, Euros, Mois, Resolution } from '../domain/types';
import { euros } from '../domain/types';
import type { ClientOperationnel, Faits, Mission } from './schema';
import {
  dateDuJour, periodesUrssafEffectives, regimeDe, sousAcreLe
} from './selecteurs';
import { tauxCotisations } from '../domain/bareme/urssaf';
import { tauxImpotEtContributions } from '../domain/bareme';
import { type TjmEffectif, tjmEffectif, tjmNet } from '../domain/calculs/tjm';

/**
 * Tarif journalier par nom de client.
 *
 * Une mission active l'emporte sur une mission terminée : c'est le tarif en
 * vigueur qui convertit une recette récente en jours, pas celui d'un contrat
 * clos il y a deux ans.
 */
export function tarifsParClient(faits: Faits): ReadonlyMap<string, Euros> {
  const tarifs = new Map<string, Euros>();
  for (const m of [...faits.missions].sort(prioriteMission)) {
    const nom = m.clientNom;
    if (nom === '' || m.tjm <= 0) continue;
    if (!tarifs.has(nom)) tarifs.set(nom, m.tjm);
  }
  return tarifs;
}

/** Les missions actives d'abord, puis les terminées, puis les prospects. */
function prioriteMission(a: Mission, b: Mission): number {
  const rang = (m: Mission) => (m.statut === 'active' ? 0 : m.statut === 'terminee' ? 1 : 2);
  return rang(a) - rang(b);
}

/** Une mission accompagnée de ce qu'elle a produit. */
export interface LigneMission {
  readonly mission: Mission;
  readonly facture: Euros;
  readonly encaisse: Euros;
  readonly resteARentrer: Euros;
  /**
   * Combien de missions se partagent ces montants.
   *
   * `1` quand ils sont bien ceux de cette mission seule. Au-delà, ce sont ceux
   * du CLIENT, et l'écran doit le dire : une facture ne porte pas le nom de la
   * mission qui l'a produite, et deux missions d'un même client actives en même
   * temps ne peuvent pas être départagées.
   */
  readonly missionsQuiPartagent: number;
}

export interface EtatActivite {
  readonly mois: Mois;
  readonly calendrier: readonly Jour[];
  readonly plan: PlanDeCharge;
  /**
   * D'où viennent les jours travaillés du plan de charge.
   *
   * L'écran doit pouvoir dire s'il montre une mesure ou une estimation : une
   * occupation lue sur le planning est un fait, la même déduite d'un montant
   * divisé par un tarif n'en est pas un.
   */
  readonly sourceCharge: SourceCharge;
  /** Recettes du mois dont le tarif est inconnu : la mesure est partielle. */
  readonly recettesSansTarif: number;
  readonly missions: readonly LigneMission[];
  readonly delais: readonly DelaiClient[];
  /** Jours de congé posés sur l'année du mois affiché. */
  readonly congesDeLAnnee: number;
  /** Chiffre d'affaires encaissé sur le mois affiché. */
  readonly caDuMois: Euros;
  /**
   * Poids de chaque client dans le chiffre d'affaires encaissé de l'ANNÉE.
   *
   * Sur l'année et non sur le mois : un client peut ne rien régler en août
   * sans que la dépendance ait bougé. Mesurée sur un seul mois, la
   * concentration sauterait d'un client à l'autre au gré des règlements et
   * n'apprendrait rien.
   */
  readonly poidsClients: readonly PoidsClient[];
}

export interface PoidsClient {
  readonly nom: string;
  readonly montant: Euros;
  /** Part du chiffre d'affaires encaissé de l'année, entre 0 et 1. */
  readonly part: number;
}

/**
 * Le poids de chaque client, du plus lourd au plus léger.
 *
 * La concentration est un risque, pas une statistique : perdre un client qui
 * pèse 60 % du chiffre d'affaires ne se rattrape pas en un trimestre. C'est
 * une des rares choses qu'une application de comptabilité peut voir venir, à
 * condition de la mesurer.
 */
function poidsParClient(faits: Faits, annee: number): readonly PoidsClient[] {
  const prefixe = String(annee);
  const parClient = new Map<string, number>();

  for (const r of faits.recettes) {
    if (r.encaisseeLe === null || !r.encaisseeLe.startsWith(prefixe)) continue;
    const nom = r.clientNom.trim() === '' ? 'Sans client' : r.clientNom;
    parClient.set(nom, (parClient.get(nom) ?? 0) + r.montant);
  }

  const total = [...parClient.values()].reduce((s, m) => s + m, 0);
  if (total <= 0) return [];

  return [...parClient.entries()]
    .map(([nom, montant]) => ({ nom, montant: euros(montant), part: montant / total }))
    .sort((a, b) => b.montant - a.montant);
}

/**
 * L'état de l'écran Activité, pour un mois donné.
 *
 * Le mois est un paramètre et non une constante : l'ancienne application
 * recalculait tout sur « le mois courant » lu à l'affichage, si bien que
 * consulter un mois passé était impossible sans changer l'horloge du poste.
 */
export function etatActivite(
  faits: Faits,
  m: Mois,
  maintenant: Date = new Date()
): EtatActivite {
  const charge = chargeDuMoisPlanifiee(faits, m)
    ?? chargeDuMois(faits.recettes, tarifsParClient(faits), m);
  const annee = m.slice(0, 4);

  return {
    mois: m,
    calendrier: calendrierDuMois(m, faits.conges),
    plan: planDeCharge(m, faits.conges, charge.jours),
    sourceCharge: charge.source,
    recettesSansTarif: charge.recettesSansTarif,
    missions: lignesDeMission(faits),
    delais: delaisParClient(faits.recettes, dateDuJour(maintenant)),
    caDuMois: euros(
      faits.recettes
        .filter((r) => r.encaisseeLe !== null && r.encaisseeLe.startsWith(m))
        .reduce<number>((s, r) => s + r.montant, 0)
    ),
    poidsClients: poidsParClient(faits, Number(m.slice(0, 4))),
    // Somme des QUOTITÉS : deux demi-journées valent un jour, et compter les
    // entrées en donnerait deux.
    congesDeLAnnee: faits.conges
      .filter((c) => c.date.startsWith(annee))
      .reduce((s, c) => s + c.quotite, 0)
  };
}

/**
 * Les journées travaillées du mois, prises sur le planning.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN FAIT PLUTÔT QU'UNE DIVISION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'occupation divisait jusqu'ici le montant facturé par le tarif journalier.
 * Le dénominateur était juste — jours ouvrés réels, fériés calculés, congés
 * déduits — mais le numérateur était une estimation, et elle se trompait dès
 * que la facturation ne suivait pas le travail : un mois facturé au trimestre
 * affichait 0 % d'occupation alors qu'on l'avait travaillé entièrement.
 *
 * Le planning donne les journées directement, ajustements compris. On les
 * prend là. `null` quand aucun rythme n'a été saisi — c'est le seul cas où la
 * division par le tarif garde un sens, et l'écran dit alors d'où vient son
 * chiffre.
 */
function chargeDuMoisPlanifiee(faits: Faits, m: Mois): ChargeDuMois | null {
  const jours = previsionDuMoisParMission(faits, m)
    .reduce((s, p) => s + p.prevision.joursRetenus, 0);

  return jours > 0 ? { jours, source: 'planning', recettesSansTarif: 0 } : null;
}

/** La facture tombe-t-elle dans la fenêtre de la mission ? */
function dansLaFenetre(mission: Mission, date: DateISO): boolean {
  if (mission.debut !== null && date < mission.debut) return false;
  if (mission.fin !== null && date > mission.fin) return false;
  return true;
}

/**
 * Ce que chaque mission a produit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX FAÇONS DE SE TROMPER, ET CELLE QU'ON ÉVITE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une facture ne porte pas le nom de la mission qui l'a produite : le modèle
 * ne relie que le CLIENT. Le rattachement précédent donnait donc l'intégralité
 * du chiffre d'affaires du client à la PREMIÈRE de ses missions, et zéro aux
 * suivantes — un écran qui affichait « 0 € » en face d'une mission qui
 * facturait, sans rien dire de l'approximation.
 *
 * Le rattachement se fait maintenant par client ET par FENÊTRE DE DATES.
 * Deux missions successives chez le même client — le cas courant — se
 * séparent alors correctement, chacune prenant les factures émises pendant
 * qu'elle courait. Il ne reste d'ambiguïté que pour deux missions d'un même
 * client actives EN MÊME TEMPS : là, aucune date ne peut trancher, et
 * `missionsQuiPartagent` le dit plutôt que de choisir au hasard.
 *
 * Les brouillons sont exclus : sans date d'émission, une facture n'a pas été
 * envoyée, et un devis en attente n'est pas du chiffre d'affaires.
 */
function lignesDeMission(faits: Faits): readonly LigneMission[] {
  const missions = [...faits.missions].sort(prioriteMission);

  return missions.map((mission) => {
    const siennes = faits.recettes.filter((r) =>
      r.clientNom === mission.clientNom
      && r.emiseLe !== null
      && dansLaFenetre(mission, r.emiseLe)
    );

    // Les missions du même client dont la fenêtre couvre au moins une de ces
    // factures — celle-ci comprise. Au-delà de une, le montant est celui du
    // client et l'écran l'annonce.
    const missionsQuiPartagent = missions.filter((autre) =>
      autre.clientNom === mission.clientNom
      && siennes.some((r) => r.emiseLe !== null && dansLaFenetre(autre, r.emiseLe))
    ).length;

    const facture = siennes.reduce<number>((s, r) => s + r.montant, 0);
    const encaisse = siennes
      .filter((r) => r.encaisseeLe !== null)
      .reduce<number>((s, r) => s + r.montant, 0);

    return {
      mission,
      facture: euros(facture),
      encaisse: euros(encaisse),
      resteARentrer: euros(facture - encaisse),
      missionsQuiPartagent: Math.max(1, missionsQuiPartagent)
    };
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Planning de la semaine
   ───────────────────────────────────────────────────────────────────────── */

export interface JourDeLaSemaine {
  readonly date: DateISO;
  readonly ferie: boolean;
  readonly weekEnd: boolean;
  readonly conge: number;
  /** Ce que le rythme prévoit, toutes missions confondues. */
  readonly prevu: number;
  /** Ce qui compte : ajustements pris en compte. */
  readonly retenu: number;
  /**
   * Le détail par client opérationnel : qui occupe la journée.
   *
   * Une mission ordinaire n'en a qu'un, et le libellé rendu est alors celui de
   * la mission — on ne fait pas apparaître un vocabulaire que le cas simple
   * n'exige pas. Dès qu'il y en a deux, le nom de chacun s'affiche : c'est la
   * question qu'on se pose en regardant la semaine.
   */
  readonly parMission: readonly LigneDuJour[];
  /**
   * Les deux moitiés de la journée, et qui les occupe.
   *
   * Le dessin organise la journée par CRÉNEAU — une ligne « matin », une ligne
   * « après-midi » — là où `parMission` l'organise par client. Les deux vues
   * du même jour sont utiles : `parMission` répond à « combien chez qui »,
   * `creneaux` à « où j'étais mercredi matin ». Les dériver ici, d'une seule
   * source, évite que deux composants les recalculent différemment.
   */
  readonly creneaux: readonly CreneauDuJour[];
}

export interface LigneDuJour {
  readonly missionId: string;
  readonly entiteId: string;
  readonly libelle: string;
  /** Le nom du client opérationnel seul, tel que le dessin l'affiche en gras. */
  readonly nom: string;
  /** Ce qu'on fait pour lui — la description de la mission, sous le nom. */
  readonly description: string;
  /** Teinte du client opérationnel, vide si aucune n'a été choisie. */
  readonly couleur: string;
  readonly prevu: number;
  readonly retenu: number;
  readonly ajuste: boolean;
  readonly lieu: Lieu | null;
}

export interface CreneauDuJour {
  readonly creneau: Creneau;
  /**
   * Qui occupe ce créneau. Vide : personne.
   *
   * Une LISTE et non un occupant unique. Deux donneurs d'ordre peuvent
   * revendiquer la même matinée — deux rythmes qui prévoient tous deux le
   * lundi. Le dessin n'en montre qu'un parce que son jeu d'exemple n'a jamais
   * le cas ; n'en garder qu'un ici ferait DISPARAÎTRE du travail déclaré, en
   * silence, et le CRA ne s'en apercevrait pas.
   */
  readonly occupants: readonly OccupantDeCreneau[];
}

export interface OccupantDeCreneau extends LigneDuJour {
  /**
   * `saisi` : la position vient d'un ajustement. `reparti` : de la convention.
   *
   * Le lieu ne s'affiche que sur un créneau `saisi` : sur une journée d'avant
   * le schéma 14, il n'y en a pas, et en dessiner un serait l'inventer.
   */
  readonly sur: 'saisi' | 'reparti';
}

/** Le planning d'une période quelconque : une semaine, un mois. */
export interface PlanningPeriode {
  readonly jours: readonly JourDeLaSemaine[];
  readonly totalPrevu: number;
  readonly totalRetenu: number;
}

export interface PlanningSemaine extends PlanningPeriode {
  /** Lundi de la semaine observée. */
  readonly lundi: DateISO;
}

/** Le lundi de la semaine qui contient cette date. */
export function lundiDeLaSemaine(date: DateISO): DateISO {
  const d = new Date(`${date}T00:00:00Z`);
  // `getUTCDay()` rend 0 le dimanche : on recule de 6 jours dans ce cas, pas
  // d'un seul, sinon la semaine du dimanche commencerait le lendemain.
  const recul = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - recul);
  return d.toISOString().slice(0, 10) as DateISO;
}

/**
 * Le planning d'une semaine, mission par mission.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA SEMAINE EST LA MAILLE DE LA CORRECTION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le rythme remplit le mois d'un coup ; ce qu'on corrige, on le corrige à la
 * semaine, parce que c'est l'horizon dont on se souvient. Un écran mensuel
 * oblige à retrouver le bon jour dans une grille de trente-et-un — et une
 * correction qu'on renonce à faire est un CRA faux.
 *
 * Les congés sont personnels, pas propres à une mission : ils s'appliquent à
 * toutes. Un jour de congé posé pendant deux missions ne se travaille pas
 * deux fois.
 */
export function planningDeLaSemaine(
  faits: Faits,
  dansLaSemaine: DateISO,
  zone: ZoneFeries = 'general'
): PlanningSemaine {
  const lundi = lundiDeLaSemaine(dansLaSemaine);
  const dates: DateISO[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(`${lundi}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10) as DateISO);
  }
  return { lundi, ...planningDesDates(faits, dates, zone) };
}

/**
 * Le planning d'un MOIS, exactement comme celui d'une semaine.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX VUES, UN SEUL CALCUL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La vue mois et la vue semaine sont deux onglets du MÊME écran, et l'on passe
 * de l'une à l'autre d'un clic. Deux calculs concurrents ne se contrediraient
 * pas en théorie — ils se contrediraient dans six mois, sur un cas que l'un
 * traiterait et l'autre pas, et l'écart se lirait sur deux dessins du même jour
 * à un clic d'intervalle. C'est l'invariant n°4, et c'est exactement la
 * situation où il coûte le plus cher.
 *
 * Le mois est donc la même fonction, appliquée à un autre lot de dates.
 */
export function planningDuMois(
  faits: Faits, m: Mois, zone: ZoneFeries = 'general'
): PlanningPeriode {
  const annee = Number(m.slice(0, 4));
  const numero = Number(m.slice(5, 7));
  // Le 0 du mois SUIVANT est le dernier jour de celui-ci : la seule façon de
  // compter 28, 29, 30 ou 31 sans table ni règle bissextile écrite à la main.
  const dernier = new Date(Date.UTC(annee, numero, 0)).getUTCDate();
  const dates: DateISO[] = [];
  for (let j = 1; j <= dernier; j += 1) {
    dates.push(`${m}-${String(j).padStart(2, '0')}` as DateISO);
  }
  return planningDesDates(faits, dates, zone);
}

function planningDesDates(
  faits: Faits, dates: readonly DateISO[], zone: ZoneFeries
): PlanningPeriode {
  // Les fériés peuvent tomber sur deux années quand la semaine est à cheval
  // sur le 31 décembre.
  const annees = new Set(dates.map((d) => Number(d.slice(0, 4))));
  const feries = new Set<string>();
  for (const a of annees) for (const f of joursFeries(a, zone)) feries.add(f);

  const conges: Record<string, number> = {};
  for (const c of faits.conges) conges[c.date] = c.quotite;

  const actives = faits.missions.filter((m) => m.statut === 'active' || m.statut === 'terminee');

  // Une ligne PAR CLIENT OPÉRATIONNEL, pas par mission : chacun a son rythme,
  // et c'est ce qui permet « lundi-mardi chez l'un, mercredi-jeudi chez
  // l'autre » sans avoir à trancher, jour par jour, à qui revient la journée.
  const parEntiteEtDate = actives.flatMap((m) => m.entites.map((e) => ({
    mission: m,
    entite: e,
    planning: planifier(dates, {
      rythmes: e.rythmes, ajustements: e.ajustements, feries, conges
    })
  })));

  const jours = dates.map((date, i) => {
    const detail = parEntiteEtDate
      .map(({ mission, entite, planning }) => {
        const j = planning[i] as JourPlanifie;
        return {
          missionId: mission.id,
          entiteId: entite.id,
          libelle: libelleDeLaLigne(mission, entite),
          // Le nom du client opérationnel s'il en porte un, celui du client de
          // la mission sinon. Une entité sans nom n'est pas une anomalie : le
          // cas ordinaire — une mission, un donneur d'ordre — n'a jamais eu à
          // le saisir.
          nom: entite.nom !== '' ? entite.nom : mission.clientNom,
          description: mission.description,
          couleur: entite.couleur,
          prevu: j.prevu,
          retenu: j.retenu,
          ajuste: j.ajuste,
          lieu: j.lieu,
          creneaux: j.creneaux
        };
      })
      // Une mission qui ne prévoit rien ce jour-là n'a pas à encombrer la
      // case : le vide se lit mieux qu'une ligne à zéro.
      .filter((d) => d.prevu > 0 || d.retenu > 0 || d.ajuste);

    /*
     * La journée retournée par créneau.
     *
     * Chaque ligne dit quels créneaux elle occupe — les siens s'ils ont été
     * saisis, ceux de la convention sinon — et on range le résultat par
     * créneau. Une ligne à zéro n'occupe rien : `creneauxOccupes` le dit, et
     * c'est ce qui laisse la case vide au lieu d'y poser un client absent.
     */
    const creneaux: CreneauDuJour[] = CRENEAUX.map((creneau) => ({
      creneau,
      occupants: detail.flatMap((d) => {
        const occupe = creneauxOccupes(d.retenu, d.creneaux)
          .find((o) => o.creneau === creneau);
        if (occupe === undefined) return [];
        const { creneaux: _positions, ...ligne } = d;
        return [{ ...ligne, sur: occupe.sur }];
      })
    }));

    return {
      date,
      ferie: feries.has(date),
      /*
       * LE SAMEDI EST UN SAMEDI, MISSION OU PAS.
       *
       * Cette ligne lisait le `weekEnd` du planning de la PREMIÈRE entité, et
       * retombait sur `false` quand il n'y en avait aucune. Un compte sans
       * mission active — un début d'activité, un mois entre deux contrats —
       * comptait donc les trente jours du mois comme ouvrés : l'occupation
       * tombait d'un tiers, et le seul écran qui aurait pu le signaler était
       * précisément celui qui se trompait.
       *
       * Le jour de la semaine ne dépend d'aucune mission. Il se lit sur la date.
       */
      weekEnd: JOURS_DE_REPOS.has(jourDeSemaine(date)),
      conge: conges[date] ?? 0,
      prevu: detail.reduce((s, d) => s + d.prevu, 0),
      retenu: detail.reduce((s, d) => s + d.retenu, 0),
      parMission: detail.map(({ creneaux: _positions, ...ligne }) => ligne),
      creneaux
    };
  });

  return {
    jours,
    totalPrevu: jours.reduce((s, j) => s + j.prevu, 0),
    totalRetenu: jours.reduce((s, j) => s + j.retenu, 0)
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Compte rendu d'activité
   ───────────────────────────────────────────────────────────────────────── */

export interface CraDeMission {
  readonly missionId: string;
  readonly entiteId: string;
  readonly libelle: string;
  /** Le client qui SIGNE le compte rendu : le client opérationnel. */
  readonly clientNom: string;
  readonly cra: Cra;
}

/**
 * Les CRA du mois, un par CLIENT OPÉRATIONNEL.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN CRA PAR CLIENT QUI SIGNE, JAMAIS UN SEUL POUR TOUT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le compte rendu d'activité se remet AU CLIENT, qui le signe. Fusionner
 * deux clients dans un document unique exposerait à l'un ce que l'autre
 * achète — et un client qui découvre le volume qu'on consacre à son
 * concurrent ne le prend jamais bien.
 *
 * La maille est donc le client opérationnel et non la mission : deux donneurs
 * d'ordre derrière une même agence signent chacun le leur. Une mission
 * ordinaire n'a qu'un client opérationnel, et rend donc exactement un CRA —
 * le comportement d'avant, sans que rien n'ait à changer à l'écran.
 *
 * Les clients sans aucun jour travaillé sont écartés : un CRA vide n'est pas
 * un livrable, c'est un document qu'on envoie par erreur.
 */
export function craDuMoisParMission(
  faits: Faits,
  m: Mois,
  zone: ZoneFeries = 'general'
): readonly CraDeMission[] {
  const dates = joursDuMois(m);
  const annee = Number(m.slice(0, 4));
  const feries = new Set<string>(joursFeries(annee, zone));

  const conges: Record<string, number> = {};
  for (const c of faits.conges) conges[c.date] = c.quotite;

  return faits.missions
    .filter((mission) => mission.statut === 'active' || mission.statut === 'terminee')
    .flatMap((mission) => mission.entites.map((entite) => ({
      missionId: mission.id,
      entiteId: entite.id,
      libelle: libelleDeLaLigne(mission, entite),
      // Le nom porté sur le document est celui du client opérationnel quand il
      // est renseigné : c'est lui qui signe. À défaut, celui qui facture.
      clientNom: entite.nom !== '' ? entite.nom : mission.clientNom,
      cra: craDuMois(
        m,
        planifier(dates, {
          rythmes: entite.rythmes, ajustements: entite.ajustements, feries, conges
        }),
        entite.rythmes,
        mission.tjm
      )
    })))
    .filter((x) => x.cra.totalJours > 0);
}

/** La prévision d'une mission sur un mois, prête à afficher. */
export interface PrevisionDeMission {
  readonly missionId: string;
  readonly entiteId: string;
  readonly libelle: string;
  readonly prevision: PrevisionDuMois;
}

/**
 * Ce que chaque mission devrait rapporter ce mois-ci, et ce qu'elle rapporte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MÊME SOURCE QUE LE CRA, DÉLIBÉRÉMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le planning est calculé ici comme il l'est pour le CRA — mêmes rythmes,
 * mêmes ajustements, mêmes fériés, mêmes congés. En produire une seconde
 * version garantirait que les deux finissent par diverger, et le projet a déjà
 * payé ce prix : l'ancienne application avait trois sources pour une même
 * journée, et rien n'indiquait laquelle faisait foi.
 *
 * Contrairement au CRA, les missions SANS journée retenue sont conservées : une
 * mission qui devait rapporter et n'a rien rapporté est précisément
 * l'information qu'on cherche. Le CRA, lui, ne liste que ce qui se facture.
 */
export function previsionDuMoisParMission(
  faits: Faits,
  m: Mois,
  zone: ZoneFeries = 'general'
): readonly PrevisionDeMission[] {
  const dates = joursDuMois(m);
  const feries = new Set<string>(joursFeries(Number(m.slice(0, 4)), zone));

  const conges: Record<string, number> = {};
  for (const c of faits.conges) conges[c.date] = c.quotite;

  return faits.missions
    .filter((mission) => mission.statut === 'active' || mission.statut === 'terminee')
    .flatMap((mission) => mission.entites.map((entite) => ({
      missionId: mission.id,
      entiteId: entite.id,
      libelle: libelleDeLaLigne(mission, entite),
      prevision: previsionDuMois(
        m,
        planifier(dates, {
          rythmes: entite.rythmes, ajustements: entite.ajustements, feries, conges
        }),
        entite.rythmes,
        mission.tjm
      )
    })))
    .filter((x) => x.prevision.joursPrevus > 0 || x.prevision.joursRetenus > 0);
}

/**
 * Comment nommer une ligne de planning ou un CRA.
 *
 * Un seul client opérationnel : le nom de la mission suffit, et introduire le
 * nom de l'entité ferait apparaître un vocabulaire dont le cas simple n'a pas
 * besoin. Plusieurs : c'est justement la distinction qu'on cherche, et le nom
 * de la mission seul rendrait deux lignes indiscernables.
 */
function libelleDeLaLigne(mission: Mission, entite: ClientOperationnel): string {
  const nomMission = mission.description !== '' ? mission.description : mission.clientNom;
  if (mission.entites.length <= 1) return nomMission;
  return entite.nom !== '' ? `${nomMission} — ${entite.nom}` : nomMission;
}

/* ─────────────────────────────────────────────────────────────────────────
   Ce qu'une mission rapporte, face à ce qu'elle coûte en temps
   ───────────────────────────────────────────────────────────────────────── */

/** Une mission, avec son rapport ET sa charge — les deux, côte à côte. */
export interface RapportDeMission {
  readonly missionId: string;
  readonly entiteId: string;
  readonly libelle: string;
  /** Journées retenues sur l'année, ajustements compris. */
  readonly jours: number;
  /** Ce que ces journées valent, au tarif en vigueur à chaque date. */
  readonly produit: Euros;
  /**
   * Ce que la mission rapporte par journée effectivement passée dessus.
   *
   * `null` sans journée : diviser par zéro donnerait l'infini, et afficher
   * zéro laisserait croire à une mission qui ne rapporte rien alors qu'elle
   * n'a simplement pas encore commencé.
   */
  readonly parJour: Euros | null;
  /** Part de l'année de travail que cette mission consomme, entre 0 et 1. */
  readonly partDuTemps: number;
}

/**
 * Ce que chaque mission rapporte, face à ce qu'elle prend de temps.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PERSONNE N'A JAMAIS MIS LES DEUX FACE À FACE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Quelle mission me rapporte quoi et me prend combien de charge de temps » :
 * la question était posée telle quelle, et aucune des deux sources ne pouvait
 * y répondre. L'ancienne application avait le rapport (chiffre d'affaires par
 * client) ET la charge (jours par mission) — dans deux écrans différents,
 * jamais croisés. La maquette montre les jours par client sans le chiffre
 * d'affaires en face.
 *
 * La matière n'existait pas non plus : il a fallu que la prévision valorise
 * chaque journée du planning au tarif de sa date pour que « ce que cette
 * mission rapporte » cesse d'être une approximation par client.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN TABLEAU TRIÉ, PAS UN GRAPHE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * On compare ici des RATIOS — des euros par jour — et non des proportions. Un
 * camembert répond à « quelle part du gâteau », ce qui n'est pas la question :
 * une mission qui pèse 15 % du chiffre d'affaires en consommant 40 % du temps
 * est un problème que sa part ne montre pas. Le tri par euro-jour met la
 * réponse en première ligne.
 *
 * Le montant est celui du travail PRODUIT, et non de l'encaissé : l'encaissé
 * ne se rattache qu'au client, jamais à la mission, et deux missions
 * simultanées d'un même client ne peuvent pas se le partager. Produire le
 * chiffre depuis le planning est la seule façon d'en avoir un qui soit
 * vraiment celui de la mission.
 */
export function rapportParMission(
  faits: Faits,
  annee: number,
  zone: ZoneFeries = 'general'
): readonly RapportDeMission[] {
  const cumul = new Map<string, { ligne: Omit<RapportDeMission, 'parJour' | 'partDuTemps'> }>();

  for (let m = 1; m <= 12; m++) {
    const mois = `${annee}-${String(m).padStart(2, '0')}` as Mois;
    for (const p of previsionDuMoisParMission(faits, mois, zone)) {
      const cle = `${p.missionId}/${p.entiteId}`;
      const acc = cumul.get(cle)?.ligne ?? {
        missionId: p.missionId, entiteId: p.entiteId, libelle: p.libelle,
        jours: 0, produit: euros(0)
      };
      cumul.set(cle, {
        ligne: {
          ...acc,
          jours: acc.jours + p.prevision.joursRetenus,
          produit: euros(acc.produit + p.prevision.montantRetenu)
        }
      });
    }
  }

  const lignes = [...cumul.values()].map((c) => c.ligne).filter((l) => l.jours > 0);
  const joursTotaux = lignes.reduce((s, l) => s + l.jours, 0);

  return lignes
    .map((l) => ({
      ...l,
      parJour: l.jours > 0 ? euros(Math.round(l.produit / l.jours)) : null,
      partDuTemps: joursTotaux > 0 ? l.jours / joursTotaux : 0
    }))
    // Du meilleur euro-jour au moins bon : c'est la décision commerciale que
    // l'outil peut éclairer, et elle doit être en première ligne.
    .sort((a, b) => (b.parJour ?? 0) - (a.parJour ?? 0));
}

/* ─────────────────────────────────────────────────────────────────────────
   Ce qu'une journée rapporte, et ce qu'il en reste
   ───────────────────────────────────────────────────────────────────────── */

/** Le tarif de la journée, brut puis net de charges. */
export interface TarifDeLaJournee {
  readonly effectif: TjmEffectif;
  /**
   * Ce qu'il reste d'une journée facturée, cotisations et impôt déduits.
   *
   * Une `Resolution` : le barème peut ne pas couvrir la période, et un « ce qui
   * vous reste par jour » calculé sur un taux supposé serait précisément le
   * chiffre sur lequel on décide d'accepter une mission.
   */
  readonly net: Resolution<Euros>;
}

/**
 * Le taux total de charges d'un mois : cotisations sociales, plus impôt et
 * contributions.
 *
 * Les deux sont des `Resolution` et se combinent en une seule : si l'une des
 * deux refuse, le total refuse. Additionner un taux connu à un taux inconnu
 * traité comme zéro donnerait un net trop élevé — l'erreur qui rassure.
 */
/**
 * Le taux de cotisations SOCIALES d'un mois, ACRE comprise.
 *
 * Extrait de `tauxDeChargesAu` parce que deux questions différentes s'y
 * posaient : « ce qui me reste par jour » veut le total, « combien de
 * cotisations sur l'année » veut la part sociale SEULE, pour la nommer à part
 * de l'impôt. Refaire l'appel au barème ailleurs aurait donné deux lectures de
 * l'ACRE, dont l'une aurait fini par oublier la date de fin.
 */
export function tauxCotisationsAu(faits: Faits, m: Mois): Resolution<number> {
  return tauxCotisations(
    m, faits.entreprise.typeActivite, sousAcreLe(faits)(m), periodesUrssafEffectives(faits)
  );
}

export function tauxDeChargesAu(faits: Faits, m: Mois): Resolution<number> {
  const type = faits.entreprise.typeActivite;
  const cotis = tauxCotisationsAu(faits, m);
  if (cotis.statut === 'refuse') return cotis;

  const impot = tauxImpotEtContributions(regimeDe(faits), m, type);
  if (impot.statut === 'refuse') return impot;

  const somme = cotis.valeur + impot.valeur;

  // Le total est une hypothèse dès que l'un des deux en est une : c'est le
  // moins engageant des deux qui gouverne.
  return cotis.statut === 'hypothese'
    ? { ...cotis, valeur: somme }
    : impot.statut === 'hypothese'
      ? { ...impot, valeur: somme }
      : { statut: 'publie', valeur: somme, source: cotis.source, verifieLe: cotis.verifieLe };
}

/**
 * Ce qu'une journée rapporte réellement sur l'année, et ce qu'il en reste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX INDICATEURS QUI AVAIENT DISPARU SANS MOTIF
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application portait `tjmEffectif` et `tjmNet` ; ils ont disparu
 * dans la reprise, et l'inventaire fonctionnel les donnait pour « présents »
 * alors qu'ils n'existaient nulle part.
 *
 * Ils méritent d'exister tous les deux. Le premier dit si les jours non
 * facturés, les remises et les forfaits rognent le tarif affiché. Le second
 * dit ce qu'il reste après cotisations et impôt — l'écart que tout indépendant
 * sous-estime, et celui qu'il faut avoir en tête pour dire oui à une mission.
 *
 * Le tarif affiché est valorisé depuis le PLANNING, le tarif effectif depuis
 * les factures ÉMISES, et les deux se divisent par les mêmes journées : c'est
 * la seule façon que l'écart soit lisible.
 */
export function tarifDeLaJournee(
  faits: Faits,
  annee: number,
  zone: ZoneFeries = 'general'
): TarifDeLaJournee {
  const lignes = rapportParMission(faits, annee, zone);
  const jours = lignes.reduce((s, l) => s + l.jours, 0);
  const produit = euros(lignes.reduce((s, l) => s + l.produit, 0));

  const prefixe = String(annee);
  const facture = euros(faits.recettes
    .filter((r) => r.emiseLe !== null && r.emiseLe.startsWith(prefixe))
    .reduce<number>((s, r) => s + r.montant, 0));

  const effectif = tjmEffectif({ jours, produit, facture });

  // Le taux se résout au DERNIER mois de l'année considérée qui soit couvert
  // par le barème : c'est celui en vigueur pour ce qu'on facturera ensuite, et
  // c'est la question que pose « ce qui me reste par jour ».
  const taux = tauxDeChargesAu(faits, `${annee}-12` as Mois);

  return {
    effectif,
    net: effectif.effectif === null
      ? { statut: 'refuse', motif: 'aucune journée travaillée cette année' }
      : tjmNet(effectif.effectif, taux)
  };
}
