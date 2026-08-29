import type { ZoneFeries } from '../domain/calculs/activite';
import { joursDuMois, joursFeries } from '../domain/calculs/activite';
import type { JourPlanifie } from '../domain/calculs/planning';
import { planifier } from '../domain/calculs/planning';
import type { JourTravaille } from '../domain/calculs/cra';
import type { DateISO, Mois } from '../domain/types';
import type { Faits } from './schema';

/**
 * Ce que le compte rendu d'activité lit dans les faits.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN MODULE À PART DE `selecteurs.activite`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le générateur de CRA vit sur l'écran Outils, chargé à la demande. Puiser
 * dans `selecteurs.activite` y aurait emporté le plan de charge, la
 * dépendance client et les délais de paiement — trois blocs dont Outils n'a
 * que faire. Le motif est celui qui a fait naître `selecteurs.activite`
 * lui-même : un module unique fait voyager ce qu'on n'a pas demandé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CRA NE SE SAISIT TOUJOURS PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une seule chose se saisit dans le générateur : la phrase de tâches
 * accomplies, qui n'est déductible d'aucun fait. Les jours, eux, viennent du
 * rythme et des ajustements du planning — corriger une journée là-bas met le
 * document à jour ici, et l'inverse n'existe pas.
 */

/** Le destinataire possible d'un CRA : un client opérationnel qui a travaillé. */
export interface DestinataireCra {
  /** L'identifiant du client opérationnel — la clé des notes hebdomadaires. */
  readonly id: string;
  readonly nom: string;
  readonly jours: number;
}

/**
 * Les journées travaillées d'un mois, une par client opérationnel et par date.
 *
 * Les missions `prospect` et `perdue` sont écartées comme partout ailleurs :
 * elles n'ont produit aucune journée, et une mission perdue qui remonterait
 * dans un CRA le rendrait incontestablement faux.
 */
export function journeesDuMois(
  faits: Faits, m: Mois, zone: ZoneFeries = 'general'
): readonly JourTravaille[] {
  const dates = joursDuMois(m);
  const annee = Number(m.slice(0, 4));
  const feries = new Set<string>(joursFeries(annee, zone));

  const conges: Record<string, number> = {};
  for (const c of faits.conges) conges[c.date] = c.quotite;

  return faits.missions
    .filter((mission) => mission.statut === 'active' || mission.statut === 'terminee')
    .flatMap((mission) => mission.entites.flatMap((entite) => {
      const planning = planifier(dates, {
        rythmes: entite.rythmes, ajustements: entite.ajustements, feries, conges
      });
      // Le nom porté sur le document est celui du client opérationnel : c'est
      // lui qui signe. À défaut, celui qui facture — une mission ordinaire n'a
      // jamais eu à saisir de client opérationnel.
      const client = entite.nom !== '' ? entite.nom : mission.clientNom;
      return planning
        .filter((j: JourPlanifie) => j.retenu > 0)
        .map((j: JourPlanifie) => ({
          date: j.date as DateISO,
          client,
          quotite: j.retenu,
          lieu: j.lieu
        }));
    }));
}

/**
 * Les destinataires possibles pour le mois, du plus occupé au moins occupé.
 *
 * La maille est le client opérationnel et non la mission : deux donneurs
 * d'ordre derrière une même agence signent chacun le leur. Le compte de jours
 * accompagne le nom parce qu'il tranche le cas courant sans avoir à ouvrir le
 * document — « Studio Lumen, 12 j » se choisit d'un coup d'œil.
 */
export function destinatairesDuMois(
  faits: Faits, m: Mois, zone: ZoneFeries = 'general'
): readonly DestinataireCra[] {
  const par = new Map<string, number>();
  for (const j of journeesDuMois(faits, m, zone)) {
    par.set(j.client, (par.get(j.client) ?? 0) + j.quotite);
  }
  return [...par.entries()]
    .map(([nom, jours]) => ({ id: nom, nom, jours }))
    .sort((a, b) => b.jours - a.jours || a.nom.localeCompare(b.nom, 'fr'));
}
