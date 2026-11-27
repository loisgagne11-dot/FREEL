/**
 * Où en est cet appareil par rapport au compte — la pastille de l'écran Compte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DÉRIVÉ DE CE QU'ON VOIT DES DEUX CÔTÉS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'état se lit en comparant les faits de cet appareil à ceux que le compte
 * vient de rendre. C'est l'état d'un appareil qui n'a JAMAIS synchronisé
 * (première liaison) : rien ne dit alors lequel des deux côtés est le plus
 * récent. L'heure écrite par l'autre appareil ne tranche pas — deux horloges
 * qui divergent de quelques minutes désigneraient le mauvais gagnant (voir
 * `InstantaneDistant`). L'état est « diffère », et c'est l'utilisateur qui
 * choisit le sens. « À envoyer » et « à recevoir » ne se disent que quand
 * l'un des deux côtés n'a rien.
 *
 * Une fois synchronisé, l'appareil retient la version du compte qu'il a vue
 * (`infra/synchro.appareil`, lot 42) : c'est ce compteur, pas une horloge, qui
 * dit ensuite de quel côté on a changé — voir `state/synchro.regle`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DÉMONSTRATION NE COMPTE PAS COMME DES DONNÉES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un appareil qui montre le jeu de démonstration n'a rien à envoyer : dire
 * « à envoyer » pousserait à écraser le compte avec des factures fictives —
 * le scénario même que `estLeJeuDeDemonstration` existe pour arrêter.
 */
import type { Faits } from './schema';
import type { InstantaneDistant } from '../infra/supabase';
import { motifRefusExterieur } from './schema.exterieur';
import { completerFaits } from './schema.migrations';
import { estLeJeuDeDemonstration } from '../domain/calculs/demonstration';
import { canonique } from './synchro.empreinte';

export type EtatSynchro =
  /** Les deux côtés portent exactement les mêmes faits. */
  | 'a-jour'
  /** Le compte n'a rien de cette version ; cet appareil, si. */
  | 'a-envoyer'
  /** Cet appareil n'a rien (ou la démonstration) ; le compte, si. */
  | 'a-recevoir'
  /** Ni l'un ni l'autre n'a de données. */
  | 'rien'
  /** Les deux ont des données, différentes : le sens se choisit. */
  | 'differe'
  /** Le compte n'a pas pu être lu. */
  | 'inconnu'
  /** Le compte a été écrit par une version plus récente, ou il est abîmé. */
  | 'illisible';

/** Ce que le sélecteur sait du compte : lu, vide (`null`), ou pas lu. */
export type CompteLu = InstantaneDistant | null | 'inconnu';

/** Des données qu'on aurait du mal à perdre : ni rien, ni la démonstration. */
function aDesDonnees(f: Faits): boolean {
  return f.clients.length + f.missions.length + f.recettes.length + f.depenses.length > 0
    && !estLeJeuDeDemonstration(f.entreprise);
}

export function etatDeSynchronisation(local: Faits, compte: CompteLu): EtatSynchro {
  if (compte === 'inconnu') return 'inconnu';
  const ici = aDesDonnees(local);
  if (compte === null) return ici ? 'a-envoyer' : 'rien';
  if (motifRefusExterieur(compte.faits) !== null) return 'illisible';
  // Comparés tels qu'ils ont été écrits : `completerFaits` comblerait des champs
  // que l'envoi n'a jamais portés, et un compte à jour se lirait « diffère ».
  if (canonique(JSON.parse(JSON.stringify(local))) === canonique(compte.faits)) return 'a-jour';
  const laBas = aDesDonnees(completerFaits(compte.faits));
  if (ici && laBas) return 'differe';
  if (laBas) return 'a-recevoir';
  return ici ? 'a-envoyer' : 'rien';
}
