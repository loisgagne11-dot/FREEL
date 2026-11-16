import type { DateISO } from '../../domain/types';
import { arretDuClient, type FaitsDuClient } from '../../domain/calculs/clientsOperationnels.lecture';

/**
 * Ce que la liste des missions et le formulaire disent d'une mission à
 * plusieurs clients — en un module sans React, chargé à la demande.
 *
 * La liste n'a besoin que de ces quelques lignes ; les loger dans le module des
 * gestes (arrêter, retirer, facturer) lui ferait télécharger la confirmation,
 * le calendrier des fériés et le brouillon pour écrire une phrase.
 */

/**
 * « 13 mars », « 1er juin » : le jour et le mois, sans l'année.
 *
 * C'est ainsi qu'on parle d'un arrêt dans une mission de quelques mois — la
 * maquette validée l'écrit ainsi. Le premier du mois s'écrit « 1er » : « 1 juin »
 * se lit comme une faute de frappe.
 */
export function jourEtMois(d: DateISO): string {
  const t = new Date(`${d}T00:00:00Z`);
  const mois = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(t);
  const jour = t.getUTCDate();
  return `${jour === 1 ? '1er' : String(jour)} ${mois}`;
}

/** Le jour suivant, en UTC pour ne pas dépendre du fuseau. */
export function lendemain(d: DateISO): DateISO {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10) as DateISO;
}

/**
 * Le nom sous lequel on désigne un client opérationnel.
 *
 * Le premier porte souvent le nom du payeur sans l'avoir saisi — le formulaire
 * le lui montre en exemple. Les suivants, sans nom, se désignent par leur rang :
 * une phrase « jusqu'au 13 mars, puis  » avec un trou ne se lit pas.
 */
export function nomDuClient(e: { readonly nom: string }, rang: number, payeur: string): string {
  const nom = e.nom.trim();
  if (nom !== '') return nom;
  if (rang === 0 && payeur.trim() !== '') return payeur.trim();
  return `Client ${rang + 1}`;
}

/**
 * « Pour Atelier Démo jusqu'au 13 mars, puis Studio Exemple » — ou `null` quand
 * aucun client de la mission n'est arrêté.
 *
 * Dérivée des faits à chaque lecture, comme l'arrêt lui-même (`arretDuClient`) :
 * un libellé enregistré à côté finirait par contredire les plages qu'il résume,
 * le jour où une plage est rallongée.
 */
export function suiteDesClients(
  mission: { readonly clientNom: string; readonly entites: readonly (FaitsDuClient & { readonly nom: string })[] }
): string | null {
  if (mission.entites.length < 2) return null;
  const clients = mission.entites.map((e, i) => ({
    nom: nomDuClient(e, i, mission.clientNom), arret: arretDuClient(mission, e)
  }));
  const arretes = clients
    .flatMap((c) => (c.arret === null ? [] : [{ nom: c.nom, arret: c.arret }]))
    .sort((a, b) => a.arret.localeCompare(b.arret));
  if (arretes.length === 0) return null;
  const suite = clients.filter((c) => c.arret === null).map((c) => c.nom);
  const avant = arretes.map((c) => `${c.nom} jusqu’au ${jourEtMois(c.arret)}`).join(', ');
  return suite.length === 0 ? `Pour ${avant}` : `Pour ${avant}, puis ${enumeration(suite)}`;
}

/** « A », « A et B », « A, B et C ». */
export function enumeration(noms: readonly string[]): string {
  if (noms.length <= 1) return noms.join('');
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1] as string}`;
}
