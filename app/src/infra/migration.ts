/**
 * Migration des données de l'ancienne application vers le nouveau schéma.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EST TRAITÉ COMME UN LIVRABLE DE PREMIÈRE CLASSE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'audit a identifié la migration comme le risque n°1 du projet, et il n'est
 * pas de nature technique mais réglementaire : les données de l'utilisateur
 * comprennent son livre des recettes et ses justificatifs, c'est-à-dire des
 * pièces comptables à conservation obligatoire. Une migration qui perd des
 * données ne fait pas perdre du confort, elle fait perdre des documents que
 * la loi oblige à conserver.
 *
 * Trois garanties, dans cet ordre :
 *
 *  1. RAPPORT À BLANC. `analyser()` ne touche à rien et dit exactement ce
 *     qui serait migré, combien, et ce qui pose problème. On regarde avant
 *     d'agir.
 *  2. INSTANTANÉ AVANT ÉCRITURE. `migrer()` copie l'intégralité des clés de
 *     l'ancienne application dans une clé d'archive AVANT la moindre
 *     écriture. Si quoi que ce soit tourne mal, l'état d'origine est
 *     récupérable.
 *  3. IDEMPOTENCE. Relancer la migration sur des données déjà migrées ne
 *     duplique rien et n'écrase rien.
 *
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE FICHIER EST COUPÉ EN DEUX, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La CONVERSION de l'ancienne structure vit dans `migration.legacy.ts`. Ce
 * n'est pas un rangement : c'est du code qui ne s'exécute qu'une fois dans la
 * vie d'un utilisateur, et jamais pour qui n'a pas connu l'ancienne version —
 * or il pesait onze kilo-octets dans le paquet d'entrée, téléchargés par tout
 * le monde à chaque ouverture.
 *
 * Ce fichier-ci garde ce que le démarrage lit RÉELLEMENT à chaque fois : la
 * relecture du stockage courant, la détection de l'ancien, et l'instantané.
 * `migrer()` constate qu'il y a de l'ancien et rend `reprise-requise` ; le
 * magasin charge alors `migration.legacy.ts` à la demande.
 *
 * Les trois garanties ci-dessus sont inchangées : l'instantané est toujours
 * écrit avant la moindre conversion, et l'idempotence est vérifiée ici.
 *
 * Ce module ne SUPPRIME jamais les anciennes clés. Le legacy doit rester
 * lisible : c'est la condition pour qu'il puisse cohabiter en lecture seule.
 */

import {
  CLE_INSTANTANE_AVANT_MIGRATION, CLE_STOCKAGE,
  type Faits, completerFaits, faitsVides, motifRefusFaits
} from '../state/schema';

/** Préfixe de l'ancienne application. Ne jamais écrire dessus. */
export const PREFIXE_LEGACY = 'freel_v50_';
export const CLE_BUNDLE_LEGACY = `${PREFIXE_LEGACY}bundle`;
/** Clés annexes de l'ancienne application, sauvegardées dans l'instantané. */
export const CLES_ANNEXES_LEGACY = [
  'freel_ts', 'freel_theme', 'freel_goal_ca', 'freel_notif_read',
  'freel_supabase', 'freel_app_version'
] as const;

/** Interface minimale de stockage, pour que le module reste testable sans navigateur. */
export interface Stockage {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface Anomalie {
  readonly gravite: 'bloquante' | 'avertissement';
  readonly message: string;
}

export interface RapportMigration {
  readonly aDesDonneesLegacy: boolean;
  readonly dejaMigre: boolean;
  readonly comptes: {
    readonly clients: number;
    readonly missions: number;
    readonly recettes: number;
    readonly depenses: number;
    readonly periodesDeclarees: number;
  };
  readonly anomalies: readonly Anomalie[];
  /** Champs de l'ancienne structure qu'aucun champ du nouveau schéma n'accueille. */
  readonly champsNonRepris: readonly string[];
}

/** Copie toutes les clés de l'ancienne application, avant toute écriture. */
export function prendreInstantane(stockage: Stockage): Record<string, string> {
  const instantane: Record<string, string> = {};
  for (let i = 0; i < stockage.length; i++) {
    const cle = stockage.key(i);
    if (cle === null) continue;
    if (!cle.startsWith(PREFIXE_LEGACY) && !CLES_ANNEXES_LEGACY.includes(cle as never)) continue;
    const v = stockage.getItem(cle);
    if (v !== null) instantane[cle] = v;
  }
  return instantane;
}

export type ResultatMigration =
  | { readonly statut: 'migre'; readonly faits: Faits; readonly rapport: RapportMigration }
  | { readonly statut: 'deja-migre'; readonly faits: Faits }
  | { readonly statut: 'rien-a-migrer'; readonly faits: Faits }
  /**
   * De l'ancienne application est présent, et il faut le reprendre.
   *
   * La reprise elle-même vit dans `migration.legacy.ts`, chargé à la demande.
   * Voir l'en-tête de ce fichier : c'est du code qui ne sert qu'une fois, à
   * une minorité d'utilisateurs, et qu'on ne veut pas livrer à tous les autres
   * à chaque ouverture.
   */
  | { readonly statut: 'reprise-requise' }
  | { readonly statut: 'echec'; readonly motif: string };

/**
 * Y a-t-il des données de l'ancienne application ?
 *
 * Détection par PRÉSENCE DE CLÉ, sans analyser le contenu : c'est ce qui
 * permet de répondre sans charger le convertisseur. Une clé présente mais
 * illisible reste donc « présente » — et c'est voulu : la reprise, une fois
 * chargée, dira qu'elle est illisible, ce qui vaut mieux que de conclure ici
 * « rien à migrer » et d'effacer le problème.
 */
export function presenceLegacy(stockage: Stockage): boolean {
  if (stockage.getItem(CLE_BUNDLE_LEGACY) !== null) return true;
  // Format antérieur : une clé par entité.
  for (const suffixe of ['company', 'missions', 'clients', 'treasury', 'ir_config']) {
    if (stockage.getItem(PREFIXE_LEGACY + suffixe) !== null) return true;
  }
  return false;
}

/**
 * Migre, en prenant un instantané au préalable.
 *
 * Idempotent : si le nouveau stockage existe déjà, on le renvoie tel quel
 * sans rien réécrire. C'est ce qui évite qu'un rechargement de page ou un
 * second onglet ne duplique ou n'écrase des données.
 */
/**
 * Migre, en prenant un instantané au préalable.
 *
 * Idempotent : si le nouveau stockage existe déjà, on le renvoie tel quel
 * sans rien réécrire. C'est ce qui évite qu'un rechargement de page ou un
 * second onglet ne duplique ou n'écrase des données.
 *
 * Ne CONVERTIT pas : quand de l'ancien est présent, cette fonction le constate
 * et rend `reprise-requise`. La conversion vit dans `migration.legacy.ts`, que
 * l'appelant charge alors à la demande.
 */
export function migrer(stockage: Stockage): ResultatMigration {
  const existant = stockage.getItem(CLE_STOCKAGE);
  if (existant !== null) {
    try {
      // Passe par la MÊME validation que le compte distant. Un transtypage
      // laisserait entrer un bloc au schéma 1 — congés en simples chaînes —
      // qui viderait le calendrier sans lever d'erreur.
      const brut: unknown = JSON.parse(existant);
      const motif = motifRefusFaits(brut);
      if (motif !== null) return { statut: 'echec', motif };
      return { statut: 'deja-migre', faits: completerFaits(brut) };
    } catch {
      return {
        statut: 'echec',
        motif: 'Le stockage de la nouvelle version est illisible. Migration interrompue '
          + 'pour ne rien écraser. L\'instantané d\'origine reste disponible.'
      };
    }
  }

  if (!presenceLegacy(stockage)) return { statut: 'rien-a-migrer', faits: faitsVides() };
  return { statut: 'reprise-requise' };
}

/**
 * Archive l'intégralité des clés de l'ancienne application.
 *
 * Écrit AVANT toute conversion. Cet ordre n'est pas négociable : si l'écriture
 * des faits échoue ensuite (quota dépassé, par exemple), l'archive de l'état
 * d'origine existe déjà. Rend le motif d'échec, ou `null` si tout va bien.
 */
export function archiverAvantReprise(stockage: Stockage): string | null {
  try {
    if (stockage.getItem(CLE_INSTANTANE_AVANT_MIGRATION) === null) {
      stockage.setItem(
        CLE_INSTANTANE_AVANT_MIGRATION,
        JSON.stringify({ pris: new Date().toISOString(), cles: prendreInstantane(stockage) })
      );
    }
    return null;
  } catch {
    return 'Impossible d\'archiver l\'état d\'origine (stockage plein ?). Migration '
      + 'interrompue : on ne migre pas sans filet.';
  }
}

/** Implémentation de `Stockage` en mémoire, pour les tests et le mode lecture seule. */
export function stockageMemoire(initial: Record<string, string> = {}): Stockage & {
  readonly contenu: Record<string, string>;
} {
  const contenu: Record<string, string> = { ...initial };
  return {
    contenu,
    getItem: (cle) => (cle in contenu ? contenu[cle] as string : null),
    setItem: (cle, valeur) => { contenu[cle] = valeur; },
    key: (i) => Object.keys(contenu)[i] ?? null,
    get length() { return Object.keys(contenu).length; }
  };
}
