import type { DateISO, Mois } from '../domain/types';
import type { AjustementJour } from '../domain/calculs/planning';
import {
  PERIODES_URSSAF, type PeriodeBareme, fusionnerPeriodes, validerAjout
} from '../domain/bareme/urssaf';
import type { Faits, Mission } from './schema';
import { ecrireFaits, useFaits } from './store';

/**
 * Les écritures d'Activité (missions, planning, congés, notes de CRA) et du
 * barème saisi dans Réglages.
 *
 * Même motif que les autres `ecritures.*` : aucune n'est déclenchable depuis
 * le Pilote, et le code d'entrée frôlait son plafond au lot 2 (79,95 / 80 Ko)
 * avant même le compteur unique et les libellés qui restaient à faire. Même
 * état, même porte vers le disque (`ecrireFaits`) : pas de second magasin.
 */

const faitsCourants = (): Faits => useFaits.getState().faits;

/* ── Missions ─────────────────────────────────────────────────────────── */

export function ajouterMission(saisie: Omit<Mission, 'id'>): string {
  const actuel = faitsCourants();
  const id = `mis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // Le client est rattaché par identifiant quand il existe au carnet, tout en
  // conservant son nom : c'est le nom qui porte le rattachement des recettes,
  // et le perdre couperait la mission de son chiffre d'affaires.
  const client = actuel.clients.find((c) => c.nom === saisie.clientNom.trim());
  const mission: Mission = {
    ...saisie, id, clientNom: saisie.clientNom.trim(), clientId: client?.id ?? null
  };
  ecrireFaits({ ...actuel, missions: [...actuel.missions, mission] });
  return id;
}

export function modifierMission(id: string, modification: Partial<Omit<Mission, 'id'>>): void {
  const actuel = faitsCourants();
  ecrireFaits({
    ...actuel,
    missions: actuel.missions.map((m) => (m.id === id ? { ...m, ...modification } : m))
  });
}

/* ── Planning ─────────────────────────────────────────────────────────── */

/**
 * Pose l'ajustement d'une journée, pour un client opérationnel.
 *
 * UN SEUL ÉCRIVAIN POUR UN SEUL CHAMP : `ajusterJour` l'a précédée, n'écrivait
 * qu'une quotité et FUSIONNAIT avec les créneaux posés — juste pour corriger
 * « 1 j » en « 0,5 j », faux pour un clic qui DÉPLACE la demi-journée du
 * matin vers l'après-midi. `poserAjustement` REMPLACE, et l'appelant lui donne
 * la journée entière. `null` EFFACE l'ajustement : la journée redevient ce que
 * le rythme prévoit, ce qui n'est pas « zéro ».
 */
export function poserAjustement(
  missionId: string, entiteId: string, date: DateISO, pose: AjustementJour | null
): void {
  const actuel = faitsCourants();
  const missions = actuel.missions.map((m) => {
    if (m.id !== missionId) return m;
    // L'ajustement vise UN client opérationnel : deux d'entre eux peuvent
    // travailler le même jour, et corriger l'un ne doit rien changer à l'autre.
    return {
      ...m,
      entites: m.entites.map((e) => {
        if (e.id !== entiteId) return e;
        const ajustements = { ...e.ajustements };
        if (pose === null) delete ajustements[date];
        else ajustements[date] = pose;
        return { ...e, ajustements };
      })
    };
  });
  ecrireFaits({ ...actuel, missions });
}

/**
 * Efface les ajustements posés sur une plage de dates, toutes missions et tous
 * clients opérationnels confondus : les journées redeviennent ce que le RYTHME
 * prévoit. Rend le nombre d'ajustements retirés, pour que l'écran le dise.
 */
export function retirerAjustements(dates: readonly DateISO[]): number {
  const actuel = faitsCourants();
  const cibles = new Set<string>(dates);
  let retires = 0;
  const missions = actuel.missions.map((m) => ({
    ...m,
    entites: m.entites.map((e) => {
      const ajustements: Record<string, AjustementJour> = {};
      for (const [date, pose] of Object.entries(e.ajustements)) {
        if (cibles.has(date)) { retires += 1; continue; }
        ajustements[date] = pose;
      }
      return { ...e, ajustements };
    })
  }));
  // Rien à retirer : on n'écrit pas. Persister pour rien ferait remonter une
  // version sur le compte distant, et un autre appareil croirait à une
  // modification.
  if (retires === 0) return 0;
  ecrireFaits({ ...actuel, missions });
  return retires;
}

/* ── Congés et notes de CRA ───────────────────────────────────────────── */

/**
 * Pose ou retire une plage de congés, sans jamais dupliquer une date déjà
 * posée. `quotite` vaut 1 par défaut ; la demi-journée existe parce qu'un
 * solde de congés qui compte 0,5 pour 1 est faux.
 */
export function poserPlageDeConges(jours: readonly DateISO[], pose: boolean, quotite = 1): void {
  const actuel = faitsCourants();
  const parDate = new Map(actuel.conges.map((c) => [c.date, c]));
  for (const j of jours) {
    if (pose) parDate.set(j, { date: j, quotite });
    else parDate.delete(j);
  }
  ecrireFaits({
    ...actuel,
    conges: [...parDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  });
}

/**
 * Écrit la phrase de tâches accomplies d'une semaine, sur un CRA. Une phrase
 * VIDE efface la note : une liste qui accumulerait des chaînes vides ferait
 * grossir le compte à chaque frappe corrigée.
 */
export function noterSemaineCra(semaine: DateISO, destinataire: string, texte: string): void {
  const actuel = faitsCourants();
  const propre = texte.trim();
  const autres = actuel.notesCra
    .filter((n) => !(n.semaine === semaine && n.destinataire === destinataire));
  // Rien n'a changé : on n'écrit pas, pour ne pas faire croire à l'autre
  // appareil à une modification qui n'a pas eu lieu.
  const avant = actuel.notesCra
    .find((n) => n.semaine === semaine && n.destinataire === destinataire);
  if ((avant?.texte ?? '') === propre) return;
  const notesCra = propre === ''
    ? autres
    : [...autres, { semaine, destinataire, texte: propre }]
      .sort((a, b) => a.semaine.localeCompare(b.semaine)
        || a.destinataire.localeCompare(b.destinataire, 'fr'));
  ecrireFaits({ ...actuel, notesCra });
}

/* ── Barème saisi ─────────────────────────────────────────────────────── */

/**
 * Ajoute une période de barème URSSAF. Rend le motif du refus, ou `null`. Le
 * contrôle vit dans le domaine (`validerAjout`) : un écran ne doit pas pouvoir
 * réécrire un barème passé, sous peine de faire diverger l'application des
 * déclarations déjà envoyées. Une saisie sur un début déjà ajouté le remplace.
 */
export function ajouterPeriodeUrssaf(periode: PeriodeBareme): string | null {
  const actuel = faitsCourants();
  const refus = validerAjout(fusionnerPeriodes(PERIODES_URSSAF, actuel.periodesUrssafAjoutees), periode);
  if (refus !== null) return refus;
  const ajoutees = [
    ...actuel.periodesUrssafAjoutees.filter((p) => p.du !== periode.du), periode
  ].sort((a, b) => a.du.localeCompare(b.du));
  ecrireFaits({ ...actuel, periodesUrssafAjoutees: ajoutees });
  return null;
}

export function retirerPeriodeUrssaf(du: Mois): void {
  const actuel = faitsCourants();
  ecrireFaits({
    ...actuel,
    periodesUrssafAjoutees: actuel.periodesUrssafAjoutees.filter((p) => p.du !== du)
  });
}
