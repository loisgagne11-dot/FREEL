/**
 * Sélecteurs de l'écran Argent : déclaration européenne de services, et livre
 * des recettes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ces deux états ne servent qu'à l'écran Argent, qui est chargé à la demande.
 * Tant qu'ils vivaient dans `selecteurs.ts` — importé par le Pilote, donc par
 * le paquet d'entrée — le regroupeur les y plaçait avec tout ce qu'ils tirent
 * derrière eux : `calculs/des` et `calculs/livreRecettes`, soit deux modules
 * que personne ne lit avant d'ouvrir Argent.
 *
 * C'est le cas de figure que le vérificateur de budget nomme explicitement :
 * « un écran tiré dans l'entrée par un import partagé ». Le remède est de
 * séparer, jamais de relever le plafond.
 *
 * `preneursDeServices` reste dans `selecteurs.ts` : la requête « à traiter »
 * s'en sert pour dater les DES en retard, et elle, tourne au premier rendu.
 */

import type { DateISO, Euros, Mois } from '../domain/types';
import {
  type EcartConformite, type TotalLivre,
  ecrituresDuLivre, totaliser, verifierConformite
} from '../domain/calculs/livreRecettes';
import {
  type DeclarationDes, type DeclarationEnRetard,
  amendeEncourue, declarationDuMois, declarationsEnRetard, moisDeposes
} from '../domain/calculs/des';
import { dateDuJour } from './selecteurs';
import { facturesAEncaisser } from './selecteurs.pipeline';
import { preneursDeServices } from './selecteurs.aTraiter';
import type { Faits, Recette } from './schema';

/* ─────────────────────────────────────────────────────────────────────────
   Déclaration européenne de services
   ───────────────────────────────────────────────────────────────────────── */

export interface EtatDes {
  readonly moisAffiche: Mois;
  readonly declaration: DeclarationDes;
  readonly retards: readonly DeclarationEnRetard[];
  readonly amendeEncourue: Euros;
  /**
   * `true` quand l'entreprise n'a pas de numéro de TVA intracommunautaire.
   *
   * Il en faut un pour déposer une DES, y compris en franchise en base. Sans
   * lui, l'écran doit dire qu'il faut le demander plutôt que d'afficher une
   * déclaration qu'on ne pourra pas transmettre.
   */
  readonly sansNumeroIntracom: boolean;
  /**
   * Le dépôt de la DES du mois affiché : `null` tant qu'elle n'est pas
   * marquée déposée ; sinon le jour du dépôt, lui-même `null` quand il n'a pas
   * été saisi — déposée, à une date non enregistrée.
   */
  readonly depot: { readonly le: DateISO | null } | null;
  /**
   * Le mois affiché est-il terminé ? Une DES ne se dépose qu'à partir du
   * premier jour du mois qui suit (calendrier de la douane) : la marquer
   * déposée d'avance éteindrait un retard qui n'a pas encore commencé.
   */
  readonly deposable: boolean;
}

export function etatDes(
  faits: Faits,
  m: Mois,
  maintenant: Date = new Date()
): EtatDes {
  const preneurs = preneursDeServices(faits);
  const jour = dateDuJour(maintenant);
  const retards = declarationsEnRetard(
    faits.recettes, preneurs, jour, moisDeposes(faits.periodesDeclarees)
  );
  const depot = faits.periodesDeclarees.find((p) => p.nature === 'des' && p.periode === m);

  return {
    moisAffiche: m,
    declaration: declarationDuMois(faits.recettes, preneurs, m),
    retards,
    amendeEncourue: amendeEncourue(retards),
    sansNumeroIntracom: faits.entreprise.tvaIntracom.trim() === '',
    depot: depot === undefined ? null : { le: depot.declareeLe },
    deposable: m < jour.slice(0, 7)
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Livre des recettes
   ───────────────────────────────────────────────────────────────────────── */

export interface EtatLivre {
  readonly ecritures: readonly Recette[];
  readonly total: TotalLivre;
  readonly ecarts: readonly EcartConformite[];
  /** Écarts rattachés à une écriture, pour les afficher sur la ligne. */
  readonly ecartsParEcriture: ReadonlyMap<string, readonly EcartConformite[]>;
  /** Factures émises et non encaissées : elles n'entrent pas encore au livre. */
  readonly enAttente: readonly RecetteEnAttente[];
}

/**
 * Une facture émise, en attente de règlement.
 *
 * `enRetard` est calculé ICI, pas dans l'écran : c'est une règle — l'échéance
 * dépend du délai convenu avec le client, qui se lit dans le carnet. Un écran
 * qui la recalculerait à sa façon finirait par en donner une autre lecture.
 */
export interface RecetteEnAttente extends Recette {
  readonly echeanceLe: DateISO | null;
  readonly enRetard: boolean;
}

/**
 * L'état du livre des recettes.
 *
 * Le registre ne contient QUE des encaissements : une facture émise et non
 * réglée n'y figure pas, et l'y faire figurer serait déclarer une recette qui
 * n'a pas eu lieu. Elle est rendue à part, pour rester visible sans être
 * comptée.
 */
export function etatLivre(faits: Faits): EtatLivre {
  const ecarts = verifierConformite(faits.recettes);
  const parEcriture = new Map<string, EcartConformite[]>();
  for (const ecart of ecarts) {
    if (ecart.ecritureId === null) continue;
    const liste = parEcriture.get(ecart.ecritureId);
    if (liste) liste.push(ecart); else parEcriture.set(ecart.ecritureId, [ecart]);
  }

  return {
    ecritures: ecrituresDuLivre(faits.recettes) as readonly Recette[],
    total: totaliser(faits.recettes),
    ecarts,
    ecartsParEcriture: parEcriture,
    enAttente: recettesEnAttente(faits)
  };
}

/**
 * Les factures émises et non réglées, avec leur échéance.
 *
 * Le délai vient du carnet ; à défaut de client rattaché, on retient le délai
 * légal supplétif plutôt que zéro — une facture ne devient pas exigible le
 * jour de son émission, et l'afficher « en retard » dès le premier jour
 * apprendrait à ignorer l'étiquette.
 */
function recettesEnAttente(
  faits: Faits,
  maintenant: Date = new Date()
): readonly RecetteEnAttente[] {
  /* La liste vient de `facturesAEncaisser`, comme le flux du Pilote et le
     panneau qui pointe un règlement. Recalculée ici, elle gardait une facture
     annulée par un avoir — et son écriture d'annulation, au montant négatif —
     parmi les factures « en attente » du registre. */
  return facturesAEncaisser(faits, dateDuJour(maintenant))
    .map(({ recette, echeanceLe, statut }) => ({ ...recette, echeanceLe, enRetard: statut === 'en_retard' }))
    .sort((a, b) => (b.emiseLe as DateISO).localeCompare(a.emiseLe as DateISO));
}
