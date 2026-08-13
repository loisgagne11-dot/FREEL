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

import type { Jour } from '../domain/calculs/activite';
import { calendrierDuMois, chargeDuMois, planDeCharge } from '../domain/calculs/activite';
import type { PlanDeCharge } from '../domain/calculs/activite';
import { delaisParClient, type DelaiClient } from '../domain/calculs/activite';
import type { Euros, Mois } from '../domain/types';
import { euros } from '../domain/types';
import type { Faits, Mission } from './schema';
import { dateDuJour } from './selecteurs';

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
}

export interface EtatActivite {
  readonly mois: Mois;
  readonly calendrier: readonly Jour[];
  readonly plan: PlanDeCharge;
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
  const tarifs = tarifsParClient(faits);
  const charge = chargeDuMois(faits.recettes, tarifs, m);
  const annee = m.slice(0, 4);

  return {
    mois: m,
    calendrier: calendrierDuMois(m, faits.conges),
    plan: planDeCharge(m, faits.conges, charge.jours),
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
 * Ce que chaque mission a produit.
 *
 * Le rattachement se fait par nom de client, l'ancien modèle ne portant pas de
 * lien entre une facture et la mission qui l'a produite. Un client à plusieurs
 * missions voit donc son chiffre d'affaires porté par la première d'entre
 * elles : c'est une approximation, et l'écran ne la présente pas autrement.
 */
function lignesDeMission(faits: Faits): readonly LigneMission[] {
  const dejaCompte = new Set<string>();
  return [...faits.missions].sort(prioriteMission).map((mission) => {
    const premiere = !dejaCompte.has(mission.clientNom);
    dejaCompte.add(mission.clientNom);
    const recettes = premiere
      ? faits.recettes.filter((r) => r.clientNom === mission.clientNom)
      : [];

    const facture = recettes.reduce<number>((s, r) => s + r.montant, 0);
    const encaisse = recettes
      .filter((r) => r.encaisseeLe !== null)
      .reduce<number>((s, r) => s + r.montant, 0);

    return {
      mission,
      facture: euros(facture),
      encaisse: euros(encaisse),
      resteARentrer: euros(facture - encaisse)
    };
  });
}
