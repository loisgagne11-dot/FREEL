import type { DateISO } from '../domain/types';
import type { ModeReglement } from '../domain/calculs/livreRecettes';
import { ecritureDAnnulation, prochainNumero } from '../domain/calculs/ecritureRecette';
import type { Faits, Recette } from './schema';
import { ecrireFaits, useFaits } from './store';

/**
 * Les écritures du livre des recettes : émettre, envoyer, encaisser, relancer,
 * annuler, supprimer un brouillon, joindre une pièce.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLES SORTENT DU MAGASIN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Même motif que `ecritures.carnet`, un lot plus tard. Le filet d'erreur et la
 * validation des éléments de liste ont fait passer le code d'entrée à
 * 80,12 / 80 Ko. Aucune de ces sept écritures n'est déclenchable depuis le
 * Pilote : elles appartiennent au facturier, à la rédaction d'une facture et
 * au livre des recettes, trois écrans chargés à la demande. Elles emportaient
 * pourtant la numérotation et l'écriture d'annulation dans le premier rendu.
 *
 * Les gardes restent avec les écritures — un brouillon ne s'envoie pas, une
 * facture émise ne se supprime pas, une recette encaissée ne se réencaisse
 * pas. Elles lisent le même état (`useFaits.getState()`) et passent par la
 * même porte vers le disque (`ecrireFaits`) : pas de second magasin.
 */

const faitsCourants = (): Faits => useFaits.getState().faits;

const avecRecettes = (actuel: Faits, recettes: readonly Recette[]): Faits =>
  ({ ...actuel, recettes });

/**
 * Ajoute une recette. Le numéro est attribué ici s'il n'est pas fourni : la
 * continuité de la numérotation est une exigence du registre, pas une
 * commodité d'affichage.
 */
export function ajouterRecette(
  saisie: Omit<Recette, 'id' | 'numero'> & { readonly numero?: string }
): string {
  const actuel = faitsCourants();
  const id = `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const annee = Number((saisie.emiseLe ?? saisie.encaisseeLe ?? '')
    .slice(0, 4)) || new Date().getFullYear();
  const recette: Recette = {
    ...saisie,
    id,
    numero: saisie.numero?.trim() || prochainNumero(actuel.recettes, annee)
  };
  ecrireFaits(avecRecettes(actuel, [...actuel.recettes, recette]));
  return id;
}

/**
 * Passe une recette en encaissé.
 *
 * La date ET le mode de règlement sont exigés ensemble : ce sont deux mentions
 * obligatoires du livre des recettes, et l'ancienne application n'en portait
 * aucune. Rend le motif du refus, ou `null`.
 */
export function encaisserRecette(
  id: string,
  encaisseeLe: DateISO,
  modeReglement: ModeReglement
): string | null {
  const actuel = faitsCourants();
  const recette = actuel.recettes.find((r) => r.id === id);
  if (recette === undefined) return 'Recette introuvable.';
  if (recette.encaisseeLe !== null) {
    // Réencaisser reviendrait à modifier une écriture déjà portée au registre.
    // La correction passe par une annulation.
    return 'Cette recette est déjà encaissée. Pour la corriger, annule-la : '
      + 'le livre des recettes se tient en ajout seul.';
  }
  ecrireFaits(avecRecettes(actuel, actuel.recettes.map((r) =>
    (r.id === id ? { ...r, encaisseeLe, modeReglement } : r))));
  return null;
}

/**
 * Consigne qu'une facture a été relancée, à cette date.
 *
 * C'est un FAIT, au même titre qu'un encaissement : il commande le ton de la
 * relance suivante — rappel, puis ferme, puis mise en demeure — et répond à
 * « je l'ai relancé quand ? ». L'application n'envoie rien : elle rédige, et
 * consigne que tu as envoyé. Prétendre expédier sans savoir ni tracer ni
 * prouver l'envoi ne vaudrait rien le jour où il faudrait démontrer qu'on a
 * relancé.
 */
export function consignerRelance(id: string, le: DateISO): void {
  const actuel = faitsCourants();
  ecrireFaits(avecRecettes(actuel, actuel.recettes.map((r) => {
    if (r.id !== id) return r;
    const faites = r.relancesLe ?? [];
    // Deux relances le même jour sont une double frappe, pas deux démarches :
    // les compter ferait passer au ton suivant sans qu'un second message soit
    // parti.
    if (faites.includes(le)) return r;
    return { ...r, relancesLe: [...faites, le] };
  })));
}

/**
 * Consigne qu'une facture a été ENVOYÉE au client, à cette date.
 *
 * Émise n'est pas envoyée : le document peut exister, porter son numéro et sa
 * date, et dormir dans un dossier — le cas courant en fin de mois. Les
 * confondre fait relancer un client qui n'a jamais reçu la facture, et laisse
 * sans réponse à « je ne l'ai jamais reçue ». Une DATE et non un booléen : un
 * statut qu'aucune date ne prouve ne prouve rien. Rend le motif du refus, ou
 * `null`.
 */
export function marquerEnvoyee(id: string, le: DateISO): string | null {
  const actuel = faitsCourants();
  const recette = actuel.recettes.find((r) => r.id === id);
  if (recette === undefined) return 'Recette introuvable.';

  // Un brouillon n'a pas de document à envoyer : il n'a ni numéro définitif ni
  // date. L'envoyer d'abord et l'émettre ensuite mettrait la date d'envoi avant
  // la date de la facture.
  if (recette.emiseLe === null) {
    return 'Ce brouillon n’a pas encore été émis : émets-le d’abord, '
      + 'il prendra son numéro et sa date.';
  }
  if (le < recette.emiseLe) {
    return 'Une facture ne peut pas partir avant d’exister : la date d’envoi '
      + 'est antérieure à sa date d’émission.';
  }
  ecrireFaits(avecRecettes(actuel, actuel.recettes.map((r) =>
    (r.id === id ? { ...r, envoyeeLe: le } : r))));
  return null;
}

/**
 * Annule une recette ÉMISE par une écriture inverse.
 *
 * Rien n'est supprimé : les deux écritures restent visibles et leur somme est
 * nulle. Un registre qu'on peut réécrire ne prouve rien. Une facture émise mais
 * jamais encaissée s'annule elle aussi — c'est un avoir : l'écriture inverse
 * reste alors hors du livre (`encaisseeLe` à `null`), mais elle neutralise le
 * montant resté à rentrer.
 */
export function annulerRecette(id: string, aujourdhui?: DateISO): string | null {
  const actuel = faitsCourants();
  const origine = actuel.recettes.find((r) => r.id === id);
  if (origine === undefined) return 'Recette introuvable.';
  if (origine.emiseLe === null) {
    return 'Ce brouillon n’a jamais été émis : il se supprime, il n’y a rien '
      + 'à annuler.';
  }
  const jour = aujourdhui ?? (new Date().toISOString().slice(0, 10) as DateISO);
  const inverse = ecritureDAnnulation(origine, jour, `${origine.id}-annulation`);
  if (actuel.recettes.some((r) => r.id === inverse.id)) {
    return 'Cette recette a déjà été annulée.';
  }

  // Une facture jamais encaissée n'a pas d'écriture au livre : l'avoir n'en
  // crée donc pas non plus. Il neutralise le reste à rentrer, sans inscrire au
  // registre un encaissement qui n'a pas eu lieu.
  const ecriture = origine.encaisseeLe === null ? { ...inverse, encaisseeLe: null } : inverse;
  ecrireFaits(avecRecettes(actuel, [...actuel.recettes, ecriture]));
  return null;
}

/**
 * Supprime un BROUILLON — une recette jamais émise.
 *
 * Le critère est l'émission, pas l'encaissement : un numéro porté par une
 * facture sortie ne peut plus disparaître, sous peine de laisser un trou dans
 * la numérotation. Un brouillon n'a jamais circulé : le supprimer libère son
 * numéro, et c'est ce qu'il faut — le réserver créerait précisément le trou
 * qu'on cherche à éviter.
 */
export function supprimerBrouillon(id: string): string | null {
  const actuel = faitsCourants();
  const recette = actuel.recettes.find((r) => r.id === id);
  if (recette === undefined) return 'Recette introuvable.';
  if (recette.emiseLe !== null) {
    return 'Cette facture a été émise : son numéro est sorti, et la supprimer '
      + 'laisserait un trou dans la numérotation. Annule-la par un avoir.';
  }
  ecrireFaits(avecRecettes(actuel, actuel.recettes.filter((r) => r.id !== id)));
  return null;
}

/**
 * Rattache une pièce à une recette — ou la détache avec `null`.
 *
 * Une facture établie ailleurs, ou reprise de l'ancienne version, n'a aucun
 * autre moyen d'être jointe à son document d'origine ; l'audit comptable ne
 * reconnaît une pièce que si elle est effectivement conservée.
 */
export function attacherJustificatifRecette(id: string, justificatifId: string | null): void {
  const actuel = faitsCourants();
  ecrireFaits(avecRecettes(actuel, actuel.recettes.map((r) =>
    (r.id === id ? { ...r, justificatifId } : r))));
}
