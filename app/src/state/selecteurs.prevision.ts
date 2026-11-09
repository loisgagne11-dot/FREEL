/**
 * La prévision d'une mission sur un mois — extraite de `selecteurs.activite`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE À PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La provision d'impôt lit le pipeline des encaissements attendus, donc cette
 * prévision, et elle entre au premier rendu par `etatPilote`. Importer
 * `selecteurs.activite` pour une seule fonction emportait l'écran Activité
 * entier dans le lot d'entrée (+15 Ko, budget de 80 Ko dépassé). Seule la
 * prévision a sa place ici ; le reste du planning reste chargé à la demande.
 */

import type { ZoneFeries } from '../domain/calculs/calendrier';
import { joursDuMois, joursFeries } from '../domain/calculs/calendrier';
import { planifier } from '../domain/calculs/planification';
import { type PrevisionDuMois, previsionDuMois } from '../domain/calculs/prevision';
import type { Mois } from '../domain/types';
import type { ClientOperationnel, Faits, Mission } from './schema';

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
export function libelleDeLaLigne(mission: Mission, entite: ClientOperationnel): string {
  const nomMission = mission.description !== '' ? mission.description : mission.clientNom;
  if (mission.entites.length <= 1) return nomMission;
  return entite.nom !== '' ? `${nomMission} — ${entite.nom}` : nomMission;
}
