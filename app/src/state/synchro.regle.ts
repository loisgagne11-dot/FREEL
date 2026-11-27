/**
 * La règle de la synchronisation automatique (lot 42) — une fonction pure.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE BESOIN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Relié sur son téléphone et son ordinateur, le propriétaire devait
 * « Enregistrer » sur l'un puis « Charger » sur l'autre. Il veut que ses
 * appareils montrent la même chose sans y penser (validé le 22/11). Pas de
 * temps réel (audit produit, F9) : un seul utilisateur, et un appareil resté
 * ouvert se met à jour quand on y revient.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE COMPTEUR TRANCHE, PAS L'HORLOGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'appareil retient la VERSION du compte vue à sa dernière synchronisation
 * (`base`). Le compte a changé ailleurs si sa version a dépassé la base ; cet
 * appareil a changé si ses faits ne sont plus ceux de ce moment-là
 * (`synchro.empreinte`). Les deux à la fois : personne ne peut savoir lequel
 * garder — deux horloges qui divergent de quelques minutes désigneraient le
 * mauvais gagnant — donc FREEL DEMANDE. Aucune fusion silencieuse : réunir
 * deux jeux d'écritures comptables demande de savoir, ligne à ligne, laquelle
 * fait foi, et le deviner produirait un registre que personne n'a validé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TANT QUE L'APPAREIL N'A JAMAIS SYNCHRONISÉ, RIEN D'AUTOMATIQUE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Sans base, rien ne dit de quel côté on a changé : la première liaison reste
 * le parcours de l'écran Compte (appareil vide, rempli, démonstration — et
 * leurs confirmations). Envoyer « au cas où » ce qu'on trouve ici est
 * exactement le geste qui effaçait un compte depuis un appareil neuf.
 */
import type { Faits } from './schema';
import type { InstantaneDistant } from '../infra/supabase';
import { motifRefusExterieur } from './schema.exterieur';
import { canonique } from './synchro.empreinte';
import { estLeJeuDeDemonstration } from '../domain/calculs/demonstration';

/**
 * Ce qu'il y a sur cet appareil, du point de vue de la synchronisation.
 *
 * `vide` et `demonstration` ne sont pas des données qu'on aurait du mal à
 * perdre, et ce sont les deux cas où un envoi automatique ferait le plus de
 * mal : le vide effacerait le compte (« Repartir de zéro » promet de ne pas y
 * toucher), la démonstration le remplirait de factures fictives.
 */
export type NatureLocale = 'donnees' | 'vide' | 'demonstration';

export interface Constat {
  /** La version du compte vue à la dernière synchronisation ; `null` : jamais synchronisé. */
  readonly base: { readonly version: number } | null;
  /** Le compte tel qu'il vient d'être lu ; `null` : il n'a aucune ligne. */
  readonly distant: InstantaneDistant | null;
  /** Les faits d'ici ne sont plus ceux de la dernière synchronisation. */
  readonly modifie: boolean;
  readonly local: NatureLocale;
  /** Les faits d'ici sont, à l'ordre des clés près, ceux du compte. */
  readonly identiques: boolean;
  /** Le schéma que cette version de l'application sait lire. */
  readonly schemaConnu: number;
}

export type Decision =
  | {
    readonly action: 'rien';
    readonly pourquoi: 'jamais-synchronise' | 'a-jour' | 'demonstration';
  }
  /** Les deux côtés portent déjà la même chose : on retient la version, sans rien écrire. */
  | { readonly action: 'aligner' }
  /** Le compte a changé ailleurs, pas cet appareil : on adopte le compte. */
  | { readonly action: 'prendre' }
  /** Cet appareil a changé, pas le compte : on envoie, à la version de la base. */
  | { readonly action: 'envoyer' }
  /** Une personne doit trancher : FREEL ne choisit pas entre deux états qui ont chacun du sens. */
  | { readonly action: 'a-choisir'; readonly pourquoi: 'les-deux-ont-change' | 'appareil-vide' }
  /** Le compte a été écrit par une version plus récente : ni le lire, ni l'écraser. */
  | { readonly action: 'refuser'; readonly schema: number }
  /** Le compte n'est plus celui qu'on a vu : on le dit, on n'envoie rien. */
  | {
    readonly action: 'anomalie';
    readonly pourquoi: 'compte-efface' | 'version-anterieure' | 'compte-illisible';
  };

/**
 * Le schéma d'un état du compte : le plus grand de la colonne et du bloc.
 *
 * Les deux peuvent diverger — un client fautif, une restauration à la main.
 * Le plus grand décide : sous-estimer le schéma, c'est accepter de raboter ce
 * qu'une version plus récente a écrit.
 */
export function schemaDuCompte(distant: InstantaneDistant): number {
  const brut = distant.faits as { version?: unknown } | null;
  const versionFaits = typeof brut?.version === 'number' ? brut.version : 0;
  return Math.max(distant.schema, versionFaits);
}

const LISTES = ['clients', 'missions', 'recettes', 'depenses'] as const;

/** Un bloc, d'ici ou du compte, porte-t-il quelque chose : une liste non vide, ou un nom ? */
function porteQuelqueChose(brut: unknown): boolean {
  if (typeof brut !== 'object' || brut === null) return false;
  const o = brut as Record<string, unknown>;
  if (LISTES.some((cle) => Array.isArray(o[cle]) && (o[cle] as unknown[]).length > 0)) return true;
  const entreprise = o['entreprise'] as { nom?: unknown } | null | undefined;
  return typeof entreprise?.nom === 'string' && entreprise.nom.trim() !== '';
}

export function natureLocale(faits: Faits): NatureLocale {
  if (!porteQuelqueChose(faits)) return 'vide';
  return estLeJeuDeDemonstration(faits.entreprise) ? 'demonstration' : 'donnees';
}

/** Les faits d'ici et ceux du compte, comparés à l'ordre des clés près (`jsonb` les range). */
export function memesFaits(faits: Faits, distant: InstantaneDistant | null): boolean {
  return distant !== null && canonique(faits) === canonique(distant.faits);
}

export function deciderSynchro(c: Constat): Decision {
  if (c.base === null) return { action: 'rien', pourquoi: 'jamais-synchronise' };

  // Effacé ailleurs — « Effacer la copie de cette version » depuis un autre
  // appareil. Renvoyer d'ici défairait un effacement demandé (droit à
  // l'effacement) sans que personne l'ait voulu.
  if (c.distant === null) return { action: 'anomalie', pourquoi: 'compte-efface' };

  // Avant tout le reste : un compte écrit par une version plus récente ne se
  // lit pas ici, et l'écraser effacerait ce que cette version ne connaît pas
  // (invariant n°5). Même sans modification locale — l'adopter serait le raboter.
  const schema = schemaDuCompte(c.distant);
  if (schema > c.schemaConnu) return { action: 'refuser', schema };

  // Le serveur n'accepte que n → n + 1 : une version qui RECULE veut dire que
  // le compte a été effacé puis recréé, ou restauré à la main. Ce n'est plus
  // la suite de ce que cet appareil a vu ; envoyer par-dessus serait parier.
  if (c.distant.version < c.base.version) return { action: 'anomalie', pourquoi: 'version-anterieure' };

  if (motifRefusExterieur(c.distant.faits) !== null) return { action: 'anomalie', pourquoi: 'compte-illisible' };

  // Une réponse perdue après un envoi réussi, ou le même geste fait des deux
  // côtés : le compte a avancé, cet appareil aussi, et ils disent la même
  // chose. Ce n'est pas un conflit — le présenter comme tel ferait choisir
  // entre deux états identiques.
  if (c.identiques) {
    return c.distant.version === c.base.version && !c.modifie
      ? { action: 'rien', pourquoi: 'a-jour' }
      : { action: 'aligner' };
  }

  // La démonstration ne part pas, et ne se remplace pas toute seule : on la
  // charge pour regarder ou pour MONTRER l'application — y faire apparaître
  // les vrais chiffres au retour sur l'onglet serait la pire des surprises.
  // « Charger le compte sur cet appareil » la remplace, sur demande.
  if (c.modifie && c.local === 'demonstration') return { action: 'rien', pourquoi: 'demonstration' };

  const aBouge = c.distant.version > c.base.version;
  if (!c.modifie) return aBouge ? { action: 'prendre' } : { action: 'rien', pourquoi: 'a-jour' };
  if (aBouge) return { action: 'a-choisir', pourquoi: 'les-deux-ont-change' };

  // Le compte n'a pas bougé, cet appareil a été VIDÉ : « Repartir de zéro »
  // promet de ne pas toucher au compte. L'envoyer l'effacerait — le serveur
  // l'accepterait, la version est la bonne ; c'est l'intention qui se demande.
  if (c.local === 'vide' && porteQuelqueChose(c.distant.faits)) {
    return { action: 'a-choisir', pourquoi: 'appareil-vide' };
  }
  return { action: 'envoyer' };
}
