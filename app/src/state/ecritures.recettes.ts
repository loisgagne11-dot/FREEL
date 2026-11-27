import type { DateISO, Euros, Mois } from '../domain/types';
import type { ModeReglement } from '../domain/calculs/livreRecettes';
import { ecritureDAnnulation, prochainNumero } from '../domain/calculs/ecritureRecette';
import { numeroDejaPris } from '../domain/calculs/emission';
import type { Faits, Recette } from './schema';
import { ecrireFaits, useFaits } from './store';
import { dateDuJour } from './selecteurs';

/**
 * Les écritures du livre des recettes : émettre, envoyer, encaisser, relancer,
 * annuler, supprimer un brouillon, joindre une pièce — et enregistrer une
 * facture émise dans un autre logiciel.
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

type SaisieRecette = Omit<Recette, 'id' | 'numero'> & { readonly numero?: string };

const nouvelId = (): string =>
  `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Le numéro d'une recette : celui fourni, sinon le suivant de l'année — sauf
 * pour un BROUILLON, qui n'en reçoit pas.
 *
 * Un brouillon numéroté réservait son numéro : la facture émise entre-temps
 * passait au-dessus. Abandonné, le brouillon laissait un trou au registre ;
 * émis plus tard, il portait un numéro plus petit qu'une facture antérieure,
 * et la chronologie que la numérotation doit montrer était rompue. Le numéro
 * naît à l'émission, dans l'ordre des émissions (lot 29).
 */
function numeroDe(saisie: SaisieRecette, autres: readonly Recette[]): string {
  const fourni = saisie.numero?.trim() ?? '';
  if (fourni !== '' || (saisie.emiseLe === null && saisie.encaisseeLe === null)) return fourni;
  const annee = Number((saisie.emiseLe ?? saisie.encaisseeLe ?? '').slice(0, 4)) || new Date().getFullYear();
  return prochainNumero(autres, annee);
}

/**
 * Ajoute une recette. Le numéro est attribué ici s'il n'est pas fourni : la
 * continuité de la numérotation est une exigence du registre, pas une
 * commodité d'affichage. Un brouillon n'en reçoit pas : voir `numeroDe`.
 */
export function ajouterRecette(saisie: SaisieRecette): string {
  const actuel = faitsCourants();
  const id = nouvelId();
  const recette: Recette = { ...saisie, id, numero: numeroDe(saisie, actuel.recettes) };
  ecrireFaits(avecRecettes(actuel, [...actuel.recettes, recette]));
  return id;
}

/** Ce qu'on recopie d'une facture émise dans un autre logiciel. */
export interface SaisieFactureEmise {
  readonly clientNom: string;
  readonly libelle: string;
  readonly montant: Euros;
  readonly tvaCollectee: Euros;
  /** Le numéro que l'autre logiciel lui a donné — jamais un numéro de FREEL. */
  readonly numero: string;
  readonly emiseLe: DateISO;
  /** `null` : pas encore partie. */
  readonly envoyeeLe: DateISO | null;
  readonly echeanceLe: DateISO;
  /** Le mois de prestation qu'elle couvre, ou `null` s'il n'est pas dit. */
  readonly moisFacture: Mois | null;
}

const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Enregistre une facture ÉMISE AILLEURS — Tiime ou un autre logiciel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN FAIT RECOPIÉ, PAS UNE FACTURE PRODUITE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le numéro est celui de l'autre logiciel, et il est EXIGÉ : sans lui, le
 * livre des recettes ne renverrait à aucune pièce. Aucun numéro de FREEL n'est
 * consommé — `numeroDe` n'est pas appelé —, sans quoi la suite de FREEL
 * avancerait d'un cran à chaque facture de Tiime et le jour où l'on revient à
 * FREEL, sa numérotation aurait des trous qu'aucune facture n'explique.
 *
 * Le numéro est unique parmi les recettes : deux écritures pour une pièce,
 * c'est un chiffre d'affaires compté deux fois. Les dates se tiennent : une
 * facture déjà émise n'a pas de date à venir, elle ne part pas avant
 * d'exister, et elle n'est pas due avant d'être émise.
 *
 * Rend l'identifiant de la recette — la pièce jointe s'y rattache ensuite —,
 * ou le motif du refus. Rien n'est écrit en cas de refus.
 */
export function enregistrerFactureEmise(
  saisie: SaisieFactureEmise, aujourdhui: DateISO = dateDuJour()
): { readonly id: string } | { readonly motif: string } {
  const actuel = faitsCourants();
  const numero = saisie.numero.trim();
  if (numero === '') {
    return { motif: 'Indique le numéro que ton logiciel a donné à la facture : le livre des recettes doit renvoyer à elle.' };
  }
  if (numeroDejaPris(numero, actuel.recettes)) {
    return { motif: `Le numéro ${numero} est déjà au livre : une pièce, une écriture.` };
  }
  if (saisie.clientNom.trim() === '') return { motif: 'Indique le client à qui la facture est adressée.' };
  if (!Number.isFinite(saisie.montant) || saisie.montant <= 0) {
    return { motif: 'Indique le montant hors taxes de la facture.' };
  }
  if (!FORME_DATE.test(saisie.emiseLe)) return { motif: 'Indique la date d’émission de la facture.' };
  if (saisie.emiseLe > aujourdhui) {
    return { motif: 'Cette facture est déjà émise : sa date d’émission ne peut pas être à venir.' };
  }
  if (saisie.envoyeeLe !== null && (!FORME_DATE.test(saisie.envoyeeLe)
    || saisie.envoyeeLe < saisie.emiseLe || saisie.envoyeeLe > aujourdhui)) {
    return { motif: 'La date d’envoi tombe entre l’émission et aujourd’hui : une facture ne part ni avant d’exister, ni demain.' };
  }
  if (!FORME_DATE.test(saisie.echeanceLe) || saisie.echeanceLe < saisie.emiseLe) {
    return { motif: 'L’échéance ne peut pas précéder l’émission.' };
  }
  const recette: Recette = {
    id: nouvelId(),
    clientNom: saisie.clientNom.trim(),
    libelle: saisie.libelle,
    montant: saisie.montant,
    tvaCollectee: saisie.tvaCollectee,
    numero,
    emiseLe: saisie.emiseLe,
    envoyeeLe: saisie.envoyeeLe,
    echeanceLe: saisie.echeanceLe,
    encaisseeLe: null,
    modeReglement: null,
    relancesLe: [],
    justificatifId: null,
    // Le document est celui de l'autre logiciel : FREEL n'en garde pas les
    // lignes, et ne prétendra pas le rééditer.
    lignes: null,
    emisePar: 'externe',
    moisFacture: saisie.moisFacture
  };
  ecrireFaits(avecRecettes(actuel, [...actuel.recettes, recette]));
  return { id: recette.id };
}

/** Ce qu'un brouillon garde de la rédaction : tout, sauf la date et le numéro. */
export type SaisieBrouillon = Pick<Recette, 'clientNom' | 'libelle' | 'montant' | 'tvaCollectee' | 'lignes' | 'referenceCommande'>;

/**
 * Enregistre la rédaction en BROUILLON — crée-le (`id` nul) ou remplace-le.
 *
 * Pas de numéro, pas de date d'émission : rien n'est sorti. Rend l'id du
 * brouillon, ou un motif quand l'id désigne une facture déjà émise — la
 * réécrire changerait un document qu'un client a peut-être déjà reçu.
 */
export function enregistrerBrouillon(
  id: string | null, saisie: SaisieBrouillon
): { readonly id: string } | { readonly motif: string } {
  const actuel = faitsCourants();
  const brouillon = { ...saisie, emiseLe: null, encaisseeLe: null, modeReglement: null, numero: '' };
  if (id === null) {
    const nouveau: Recette = { ...brouillon, id: nouvelId() };
    ecrireFaits(avecRecettes(actuel, [...actuel.recettes, nouveau]));
    return { id: nouveau.id };
  }
  const existant = actuel.recettes.find((r) => r.id === id);
  if (existant === undefined) return { motif: 'Ce brouillon n’existe plus : il a été supprimé entre-temps.' };
  if (existant.emiseLe !== null) return { motif: 'Cette facture a déjà été émise : elle ne redevient pas un brouillon.' };
  ecrireFaits(avecRecettes(actuel, actuel.recettes.map((r) => (r.id === id ? { ...r, ...brouillon } : r))));
  return { id };
}

/**
 * Émet un brouillon enregistré, SOUS SON IDENTIFIANT.
 *
 * Ajouter une recette émise puis supprimer le brouillon aurait perdu ce qui
 * lui est déjà rattaché — la pièce jointe — et, entre les deux écritures,
 * compté la facture deux fois. Le numéro est attribué maintenant : c'est
 * l'émission qui le fait naître.
 */
export function emettreBrouillon(id: string, saisie: SaisieRecette): string | null {
  const actuel = faitsCourants();
  const existant = actuel.recettes.find((r) => r.id === id);
  if (existant === undefined) return 'Ce brouillon n’existe plus : il a été supprimé entre-temps.';
  if (existant.emiseLe !== null) return 'Ce brouillon a déjà été émis.';
  const autres = actuel.recettes.filter((r) => r.id !== id);
  const emise: Recette = { ...existant, ...saisie, id, numero: numeroDe(saisie, autres) };
  ecrireFaits(avecRecettes(actuel, actuel.recettes.map((r) => (r.id === id ? emise : r))));
  return null;
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
  // Une facture annulée par un avoir ne rapporte plus rien : l'encaisser
  // porterait au livre un chiffre d'affaires que l'avoir a déjà effacé, et le
  // rapprochement bancaire peut très bien la proposer pour un virement du
  // même montant. Même refus pour l'écriture d'annulation elle-même.
  if (typeof recette.annuleEcriture === 'string'
    || actuel.recettes.some((r) => r.annuleEcriture === id)) {
    return 'Cette facture est annulée par un avoir : il n’y a plus rien à '
      + 'encaisser.';
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
  const jour = aujourdhui ?? dateDuJour();
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
