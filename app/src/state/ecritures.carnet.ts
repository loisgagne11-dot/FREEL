import type { DateISO, Euros } from '../domain/types';
import {
  nomAPropager, peutSupprimerClient, peutSupprimerMission, validerNomClient
} from '../domain/calculs/carnet';
import { importerMouvements } from '../domain/calculs/banque';
import type { Client, Faits } from './schema';
import { ecrireFaits, useFaits } from './store';

/**
 * Les écritures qui n'ont pas à peser sur le premier rendu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLES SORTENT DU MAGASIN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le magasin est un module unique, et il est chargé au premier rendu — le
 * Pilote en lit les faits. L'empaqueteur emporte donc TOUT ce que ses actions
 * importent, y compris les gardes du carnet (`validerNomClient`,
 * `peutSupprimerClient`…) et l'import de relevé bancaire. Or aucune de ces
 * cinq écritures n'est déclenchable depuis le Pilote : elles appartiennent à
 * Activité et au relevé, deux écrans chargés à la demande.
 *
 * Le budget du code d'entrée l'a signalé en dépassant, et l'invariant n°7 dit
 * d'extraire plutôt que de relever. C'est exactement le motif qui a fait
 * naître `selecteurs.activite` — un module unique fait voyager ce qu'on n'a
 * pas demandé — appliqué cette fois aux écritures.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA GARDE RESTE AVEC L'ÉCRITURE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * On aurait pu gagner les mêmes octets en déplaçant les contrôles dans les
 * écrans, et en laissant le magasin enregistrer ce qu'on lui donne. Ce serait
 * un mauvais échange : un second point d'entrée — un import, une restauration
 * de sauvegarde — passerait alors à côté du contrôle, et le carnet
 * accepterait deux clients homonymes, dont le nom sert justement de clé de
 * rattachement.
 *
 * Ces fonctions ne sont donc pas des « helpers d'écran » : ce sont les mêmes
 * écritures qu'avant, avec les mêmes gardes, lues depuis le même état. Elles
 * ont seulement changé de fichier — et donc de fragment.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN SEUL ÉTAT, ET UNE SEULE PORTE VERS LE DISQUE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Pas de second magasin : il y aurait deux copies des faits, qui
 * divergeraient à la première écriture. Elles lisent `useFaits.getState()` et
 * passent par `ecrireFaits`, la seule fonction qui pose un état ET le
 * persiste. C'est ce qui garantit qu'une écriture déplacée ici ne peut pas
 * oublier la persistance.
 */

/** L'état courant, sans passer par un composant React. */
const faitsCourants = (): Faits => useFaits.getState().faits;

/**
 * Ajoute un client. Rend le motif du refus, ou `null`.
 *
 * Le nom est contrôlé par le domaine : il sert de clé de rattachement, donc
 * il ne peut être ni vide ni homonyme d'un client existant.
 */
export function ajouterClient(saisie: Omit<Client, 'id'>): string | null {
  const actuel = faitsCourants();
  const refus = validerNomClient(saisie.nom, actuel.clients);
  if (refus !== null) return refus.message;

  const client: Client = {
    ...saisie,
    nom: saisie.nom.trim(),
    id: `cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  };
  ecrireFaits({ ...actuel, clients: [...actuel.clients, client] });
  return null;
}

/**
 * Modifie un client, en PROPAGEANT un éventuel renommage.
 *
 * Missions et recettes rattachées suivent, dans la même écriture. Sans cela,
 * renommer « Dupont » en « Dupont SARL » laisserait derrière lui des recettes
 * attachées à un nom que plus aucun client ne porte : elles sortiraient des
 * délais de paiement et de la déclaration européenne de services sans que
 * rien ne le signale.
 */
export function modifierClient(
  id: string, modification: Partial<Omit<Client, 'id'>>
): string | null {
  const actuel = faitsCourants();
  const existant = actuel.clients.find((c) => c.id === id);
  if (existant === undefined) return 'Client introuvable.';

  if (modification.nom !== undefined) {
    const refus = validerNomClient(modification.nom, actuel.clients, id);
    if (refus !== null) return refus.message;
  }

  const nouveauNom = modification.nom === undefined
    ? null
    : nomAPropager(existant.nom, modification.nom);

  const clients = actuel.clients.map((c) =>
    (c.id === id ? { ...c, ...modification, nom: nouveauNom ?? c.nom } : c));

  // La propagation est faite ici, dans la même écriture que la modification :
  // un renommage à moitié appliqué serait pire que pas de renommage du tout.
  ecrireFaits(nouveauNom === null
    ? { ...actuel, clients }
    : {
      ...actuel,
      clients,
      missions: actuel.missions.map((m) =>
        (m.clientNom === existant.nom ? { ...m, clientNom: nouveauNom, clientId: id } : m)),
      recettes: actuel.recettes.map((r) =>
        (r.clientNom === existant.nom ? { ...r, clientNom: nouveauNom } : r))
    });
  return null;
}

/** Supprime un client, si rien ne lui est rattaché. */
export function supprimerClient(id: string): string | null {
  const actuel = faitsCourants();
  const existant = actuel.clients.find((c) => c.id === id);
  if (existant === undefined) return 'Client introuvable.';

  const refus = peutSupprimerClient(existant.nom, actuel.missions, actuel.recettes);
  if (refus !== null) return refus.message;

  ecrireFaits({ ...actuel, clients: actuel.clients.filter((c) => c.id !== id) });
  return null;
}

/** Supprime une mission, si aucune recette de son client ne relève de sa période. */
export function supprimerMission(id: string): string | null {
  const actuel = faitsCourants();
  const existante = actuel.missions.find((m) => m.id === id);
  if (existante === undefined) return 'Mission introuvable.';

  const refus = peutSupprimerMission(existante, actuel.recettes);
  if (refus !== null) return refus.message;

  ecrireFaits({ ...actuel, missions: actuel.missions.filter((m) => m.id !== id) });
  return null;
}

/**
 * Ajoute les opérations d'un relevé.
 *
 * Idempotent : réimporter un relevé qui chevauche le précédent — le cas
 * ordinaire — n'ajoute que ce qui manque et ne double pas le solde. Rend le
 * nombre d'opérations ajoutées et le nombre déjà connues.
 */
export function importerReleve(
  lignes: readonly {
    readonly date: DateISO; readonly libelle: string; readonly montant: Euros;
  }[]
): { readonly ajoutes: number; readonly deja: number } {
  const actuel = faitsCourants();
  const resultat = importerMouvements(actuel.mouvementsBancaires, lignes);
  ecrireFaits({ ...actuel, mouvementsBancaires: resultat.mouvements });
  return { ajoutes: resultat.ajoutes, deja: resultat.deja };
}
