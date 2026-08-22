/**
 * Conservation des justificatifs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI INDEXEDDB, ET POURQUOI UNE EMPREINTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les pièces sont des fichiers : factures en PDF, photos de tickets. Elles ne
 * peuvent pas vivre dans `localStorage`, limité à quelques mégaoctets et à des
 * chaînes de caractères — l'ancienne application y stockait déjà tout et
 * frôlait le quota. IndexedDB accepte les binaires et n'a pas cette limite.
 *
 * Chaque pièce porte une **empreinte SHA-256** et un **horodatage**. L'audit
 * comptable classait les pièces de l'ancienne version comme « sans valeur
 * probante » : un booléen `piece: true`, aucun fichier, aucune trace. Une
 * copie numérique n'a de valeur en contrôle que si l'on peut montrer qu'elle
 * n'a pas été modifiée depuis son dépôt — c'est ce que l'empreinte établit.
 *
 * Le module ne SUPPRIME jamais une pièce liée à un fait encore existant (voir
 * `motifRefusSuppression` plus bas). Les durées de conservation se comptent en
 * années, et une suppression accidentelle détruit un document que la loi
 * oblige à conserver.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE PIÈCE SE RATTACHE À UN « FAIT », PAS À UNE DÉPENSE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ce module a longtemps posé `depenseId` sans alternative : une facture de
 * vente établie hors de l'application — ou reprise de l'ancienne version —
 * n'avait donc aucun moyen d'être jointe à sa recette. Le manque n'était pas
 * un oubli d'écran, il était dans la FORME des métadonnées elles-mêmes.
 *
 * `fait` remplace `depenseId` par une **nature et un identifiant**, plutôt que
 * par deux champs optionnels (`depenseId?`, `recetteId?`). Deux champs
 * optionnels permettraient les deux à la fois, ou aucun des deux — un état
 * qu'aucune pièce ne doit pouvoir atteindre, puisqu'elle rattache exactement
 * un document. Une union discriminée rend cet état IMPOSSIBLE à représenter,
 * plutôt que simplement improbable et laissé à la discipline de qui écrit.
 */

/** La nature du fait auquel une pièce peut se rattacher. */
export type NatureFait = 'depense' | 'recette';

/** Le fait précis auquel une pièce se rattache. */
export interface RattachementFait {
  readonly nature: NatureFait;
  readonly id: string;
}

/** Métadonnées d'une pièce conservée. Sans le binaire, pour être listables. */
export interface MetaJustificatif {
  readonly id: string;
  readonly nomFichier: string;
  readonly typeMime: string;
  readonly taille: number;
  /** Empreinte SHA-256, en hexadécimal. Établit la non-altération. */
  readonly empreinte: string;
  /** Horodatage du dépôt, en ISO. */
  readonly deposeLe: string;
  /** Le fait — dépense ou recette — que cette pièce justifie. */
  readonly fait: RattachementFait;
}

export interface Justificatif extends MetaJustificatif {
  readonly contenu: Blob;
}

/**
 * Interface de stockage, pour que la logique reste testable sans navigateur.
 * L'implémentation IndexedDB est en bas de ce fichier.
 */
export interface StockageJustificatifs {
  deposer(j: Justificatif): Promise<void>;
  lire(id: string): Promise<Justificatif | null>;
  lister(): Promise<readonly MetaJustificatif[]>;
  supprimer(id: string): Promise<void>;
}

/** Calcule l'empreinte SHA-256 d'un binaire, en hexadécimal. */
export async function empreinteDe(contenu: Blob): Promise<string> {
  const octets = await contenu.arrayBuffer();
  const condensat = await crypto.subtle.digest('SHA-256', octets);
  return [...new Uint8Array(condensat)]
    .map((o) => o.toString(16).padStart(2, '0'))
    .join('');
}

export type ResultatDepot =
  | { readonly statut: 'depose'; readonly meta: MetaJustificatif }
  | { readonly statut: 'refuse'; readonly motif: string };

/**
 * Taille maximale d'une pièce.
 *
 * 12 Mo laisse passer une photo de ticket prise au téléphone sans compression,
 * et arrête un fichier manifestement hors sujet. Refuser en amont vaut mieux
 * que remplir le quota du navigateur et faire échouer les dépôts suivants,
 * y compris ceux qui comptent.
 */
export const TAILLE_MAX_OCTETS = 12 * 1024 * 1024;

/**
 * Types acceptés.
 *
 * On accepte large — PDF et images —, parce qu'un justificatif refusé pour un
 * motif technique finit par ne pas être conservé du tout, ce qui est le pire
 * résultat possible.
 */
export const TYPES_ACCEPTES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'
] as const;

export function typeAccepte(typeMime: string): boolean {
  return (TYPES_ACCEPTES as readonly string[]).includes(typeMime);
}

/**
 * Dépose une pièce, après contrôles.
 *
 * Le contrôle précède l'écriture, et l'empreinte est calculée sur le contenu
 * effectivement stocké — pas sur ce qu'on croit avoir reçu. Le calcul est le
 * même pour une pièce de dépense et une pièce de recette : l'empreinte ne
 * connaît pas la nature du fait, elle ne connaît que des octets.
 */
export async function deposerJustificatif(
  stockage: StockageJustificatifs,
  fichier: { nom: string; typeMime: string; contenu: Blob },
  fait: RattachementFait,
  maintenant: Date = new Date()
): Promise<ResultatDepot> {
  if (fichier.contenu.size === 0) {
    return { statut: 'refuse', motif: 'Le fichier est vide.' };
  }
  if (fichier.contenu.size > TAILLE_MAX_OCTETS) {
    const mo = Math.round(fichier.contenu.size / (1024 * 1024));
    return {
      statut: 'refuse',
      motif: `Fichier trop volumineux (${mo} Mo, maximum `
        + `${TAILLE_MAX_OCTETS / (1024 * 1024)} Mo).`
    };
  }
  if (!typeAccepte(fichier.typeMime)) {
    return {
      statut: 'refuse',
      motif: `Format non accepté (${fichier.typeMime}). Formats acceptés : PDF, JPEG, PNG, HEIC, WebP.`
    };
  }

  const empreinte = await empreinteDe(fichier.contenu);
  const meta: MetaJustificatif = {
    // L'empreinte fait partie de l'identifiant : déposer deux fois le même
    // fichier sur le même fait ne crée pas deux pièces. La nature entre dans
    // l'identifiant pour la même raison qui a motivé l'union discriminée
    // ci-dessus : une dépense et une recette créées côte à côte pourraient en
    // théorie porter le même identifiant applicatif, et fusionner leurs
    // pièces serait alors une collision silencieuse.
    id: `${fait.nature}-${fait.id}-${empreinte.slice(0, 16)}`,
    nomFichier: fichier.nom,
    typeMime: fichier.typeMime,
    taille: fichier.contenu.size,
    empreinte,
    deposeLe: maintenant.toISOString(),
    fait
  };

  await stockage.deposer({ ...meta, contenu: fichier.contenu });
  return { statut: 'depose', meta };
}

/**
 * Vérifie qu'une pièce n'a pas été altérée depuis son dépôt.
 *
 * C'est ce contrôle qui donne sa valeur à l'empreinte : la stocker sans jamais
 * la recalculer n'apporterait rien.
 */
export async function verifierIntegrite(
  stockage: StockageJustificatifs,
  id: string
): Promise<{ readonly intacte: boolean; readonly motif: string | null }> {
  const j = await stockage.lire(id);
  if (j === null) return { intacte: false, motif: 'Pièce introuvable.' };
  const actuelle = await empreinteDe(j.contenu);
  return actuelle === j.empreinte
    ? { intacte: true, motif: null }
    : { intacte: false, motif: 'L’empreinte ne correspond plus : la pièce a été modifiée.' };
}

/**
 * Un minimum des faits courants : de quoi savoir si le document qu'une pièce
 * justifie existe encore.
 *
 * Volontairement réduit à des identifiants, et pas un import de `state/schema`
 * : ce module reste utilisable sans le magasin, comme `empreinteDe` l'est déjà
 * sans navigateur.
 */
export interface FaitsConnus {
  readonly depenses: readonly { readonly id: string }[];
  readonly recettes: readonly { readonly id: string }[];
}

/**
 * Pourquoi cette pièce ne peut PAS être supprimée, ou `null` si elle le peut.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE REFUS PORTE SUR LE FAIT, PAS SUR LA NATURE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Refusé si et seulement si le fait rattaché — dépense OU recette — existe
 * ENCORE dans les faits courants. Ce n'est pas la présence d'un rattachement
 * en soi qui bloque : une pièce dont le fait a depuis disparu redevient
 * orpheline, et rien n'oblige à la garder indéfiniment. C'est cette
 * distinction qui a longtemps manqué : avant ce lot, la seule dépense pouvait
 * bloquer une suppression — une facture de vente échappait totalement au
 * contrôle, alors qu'elle est soumise au même délai de conservation légal
 * (voir `ANNEES_CONSERVATION`, `domain/bareme/recettes.ts`).
 */
export function motifRefusSuppression(
  meta: MetaJustificatif,
  faits: FaitsConnus
): string | null {
  const existeEncore = meta.fait.nature === 'depense'
    ? faits.depenses.some((d) => d.id === meta.fait.id)
    : faits.recettes.some((r) => r.id === meta.fait.id);
  if (!existeEncore) return null;

  const nature = meta.fait.nature === 'depense' ? 'dépense' : 'recette';
  return `Cette pièce est rattachée à une ${nature} qui existe encore : elle ne `
    + 'peut pas être supprimée tant que ce document existe. Détache-la d’abord '
    + 'si tu veux t’en défaire.';
}

/**
 * Supprime une pièce, si rien ne l'en empêche.
 *
 * Rend le motif du refus, ou `null` si la suppression a eu lieu — le même
 * contrat que les actions de refus du magasin (`supprimerDepense`,
 * `supprimerBrouillon`…). Une pièce déjà absente n'est pas un échec : il n'y a
 * simplement plus rien à protéger.
 */
export async function supprimerJustificatif(
  stockage: StockageJustificatifs,
  id: string,
  faits: FaitsConnus
): Promise<string | null> {
  const meta = await stockage.lire(id);
  if (meta === null) return null;
  const motif = motifRefusSuppression(meta, faits);
  if (motif !== null) return motif;
  await stockage.supprimer(id);
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────
   Implémentation IndexedDB
   ───────────────────────────────────────────────────────────────────────── */

const NOM_BASE = 'freel-justificatifs';
const NOM_MAGASIN = 'pieces';
/**
 * Version du magasin IndexedDB.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE VERSIONNAGE N'EST PAS CELUI DE `Faits`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les métadonnées des pièces ne vivent PAS dans `Faits` : elles ont leur
 * propre base, et IndexedDB porte son propre mécanisme de version — un nombre
 * qui déclenche `onupgradeneeded` à l'ouverture, plutôt qu'un champ `version`
 * relu et validé comme `motifRefusFaits` le fait pour les faits. On ne peut
 * donc pas réutiliser `completerFaits` ici : la migration se place dans
 * `onupgradeneeded`, au moment précis où le navigateur constate que la base
 * ouverte est d'une version antérieure à celle-ci.
 *
 * v1 → v2 : une pièce ne portait que `depenseId`. Elle rattachait forcément
 * une dépense, puisque les recettes n'avaient pas cette porte — migrer, c'est
 * donc nommer ce qui était implicite, pas inventer une information. La
 * conversion elle-même est `migrerMeta` ci-dessous : une fonction PURE,
 * testable sans IndexedDB, appliquée à chaque enregistrement par le curseur
 * de migration. La descendre au niveau de l'enregistrement et non du magasin
 * dans son ensemble est la même règle que pour `Faits` (invariant n°5) : une
 * migration descend jusqu'où les champs ont bougé.
 */
const VERSION_BASE = 2;

/** Une pièce telle qu'enregistrée avant que le rattachement se généralise. */
interface MetaJustificatifV1 {
  readonly id: string;
  readonly nomFichier: string;
  readonly typeMime: string;
  readonly taille: number;
  readonly empreinte: string;
  readonly deposeLe: string;
  readonly depenseId: string;
}

/**
 * Met une métadonnée de pièce au format courant.
 *
 * Exportée pour être testée directement : c'est elle qui porte toute la
 * logique de conversion, `onupgradeneeded` ne fait que l'appliquer à chaque
 * enregistrement via un curseur — voir le commentaire de `VERSION_BASE`.
 *
 * Idempotente : appliquée à une pièce déjà au format courant, elle la rend
 * telle quelle. C'est ce qui permet de la rappeler sans condition depuis le
 * curseur de migration.
 */
export function migrerMeta(
  brut: MetaJustificatifV1 | MetaJustificatif
): MetaJustificatif {
  if ('fait' in brut) return brut;
  const { depenseId, ...reste } = brut;
  return { ...reste, fait: { nature: 'depense', id: depenseId } };
}

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(NOM_BASE, VERSION_BASE);
    requete.onupgradeneeded = (evenement) => {
      const base = requete.result;
      const magasin = base.objectStoreNames.contains(NOM_MAGASIN)
        ? requete.transaction!.objectStore(NOM_MAGASIN)
        : base.createObjectStore(NOM_MAGASIN, { keyPath: 'id' });

      // L'index portait sur `depenseId`, qui n'existe plus dans le format
      // courant : le remplacer par un index sur `fait.id`, qui sert les deux
      // natures. IndexedDB sait indexer un chemin imbriqué directement.
      if (magasin.indexNames.contains('depenseId')) magasin.deleteIndex('depenseId');
      if (!magasin.indexNames.contains('fait.id')) {
        magasin.createIndex('fait.id', 'fait.id', { unique: false });
      }

      // Ancienne version détectée : convertit chaque enregistrement en place.
      if (evenement.oldVersion > 0 && evenement.oldVersion < 2) {
        magasin.openCursor().onsuccess = (ev) => {
          const curseur = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (curseur === null) return;
          const valeur = curseur.value as MetaJustificatifV1 | Justificatif;
          if (!('fait' in valeur)) curseur.update(migrerMeta(valeur));
          curseur.continue();
        };
      }
    };
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error ?? new Error('Ouverture impossible.'));
  });
}

function promesseDe<T>(requete: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error ?? new Error('Opération impossible.'));
  });
}

export function stockageIndexedDB(): StockageJustificatifs {
  return {
    async deposer(j) {
      const base = await ouvrir();
      const transaction = base.transaction(NOM_MAGASIN, 'readwrite');
      await promesseDe(transaction.objectStore(NOM_MAGASIN).put(j));
      base.close();
    },
    async lire(id) {
      const base = await ouvrir();
      const transaction = base.transaction(NOM_MAGASIN, 'readonly');
      const j = await promesseDe<Justificatif | undefined>(
        transaction.objectStore(NOM_MAGASIN).get(id)
      );
      base.close();
      return j ?? null;
    },
    async lister() {
      const base = await ouvrir();
      const transaction = base.transaction(NOM_MAGASIN, 'readonly');
      const tout = await promesseDe<Justificatif[]>(
        transaction.objectStore(NOM_MAGASIN).getAll()
      );
      base.close();
      // Le binaire est retiré : lister ne doit pas charger tous les fichiers
      // en mémoire.
      return tout.map(({ contenu: _contenu, ...meta }) => meta);
    },
    async supprimer(id) {
      const base = await ouvrir();
      const transaction = base.transaction(NOM_MAGASIN, 'readwrite');
      await promesseDe(transaction.objectStore(NOM_MAGASIN).delete(id));
      base.close();
    }
  };
}

/** Implémentation en mémoire, pour les tests et le mode sans persistance. */
export function stockageMemoireJustificatifs(): StockageJustificatifs & {
  readonly contenu: Map<string, Justificatif>;
} {
  const contenu = new Map<string, Justificatif>();
  return {
    contenu,
    deposer: async (j) => { contenu.set(j.id, j); },
    lire: async (id) => contenu.get(id) ?? null,
    lister: async () => [...contenu.values()].map(({ contenu: _c, ...meta }) => meta),
    supprimer: async (id) => { contenu.delete(id); }
  };
}
