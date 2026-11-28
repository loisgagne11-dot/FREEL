import type { DateISO, Mois } from '../domain/types';
import type { AjustementJour } from '../domain/calculs/planning';
import type { PeriodeBareme } from '../domain/bareme/urssaf';
import { validerAjout } from '../domain/bareme/urssaf.ajout';
import type { Faits, Mission } from './schema';
import { ecrireFaits, useFaits } from './store';
import { periodesUrssafEffectives } from './selecteurs';
import {
  type Application, type Changements, type Geste,
  aucunChangement, annulerChangements, appliquerPinceau
} from './pinceau';

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
 * Pose un geste du planning — un clic, un glissé, un raccourci, ou ce que
 * l'éditeur d'une demi-journée enregistre — et rend ce qu'il a changé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE SEULE ÉCRITURE PAR GESTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle remplace `poserAjustement`, que l'écran appelait une fois par mission
 * touchée, puis `poserPlageDeConges` pour le congé : trois écritures pour une
 * seule intention, chacune persistée et chacune vue comme une modification
 * par la synchronisation (lot 42). Un glissé sur deux semaines en aurait fait
 * trente — et « Annuler » n'aurait su lesquelles défaire ensemble. La règle
 * elle-même vit dans `state/pinceau`, pure.
 *
 * Rien n'a changé : on n'écrit pas. Persister pour rien ferait remonter une
 * version sur le compte, et un autre appareil croirait à une modification.
 */
export function poserAuPinceau(geste: Geste): Application {
  const application = appliquerPinceau(faitsCourants(), geste);
  if (!aucunChangement(application.changements)) ecrireFaits(application.faits);
  return application;
}

/**
 * Défait un geste, en une écriture : seules les journées qui portent encore
 * ce qu'il a posé sont rétablies (voir `annulerChangements`). Rend leur nombre,
 * pour que l'écran dise si quelque chose a pu être défait.
 */
export function annulerAuPinceau(changements: Changements): number {
  const { faits, rendus } = annulerChangements(faitsCourants(), changements);
  if (rendus > 0) ecrireFaits(faits);
  return rendus;
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
  // La table de la caisse, et non celle de la SSI : un affilié Cipav qui
  // corrige une période de sa caisse serait jugé sur des bornes qui ne sont
  // pas les siennes.
  const refus = validerAjout(periodesUrssafEffectives(actuel), periode);
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
