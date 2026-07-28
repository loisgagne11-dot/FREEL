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
 * Le module ne SUPPRIME jamais une pièce liée à une dépense encore existante.
 * Les durées de conservation se comptent en années, et une suppression
 * accidentelle détruit un document que la loi oblige à conserver.
 */

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
  /** Dépense à laquelle la pièce se rattache. */
  readonly depenseId: string;
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
 * effectivement stocké — pas sur ce qu'on croit avoir reçu.
 */
export async function deposerJustificatif(
  stockage: StockageJustificatifs,
  fichier: { nom: string; typeMime: string; contenu: Blob },
  depenseId: string,
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
    // fichier sur la même dépense ne crée pas deux pièces.
    id: `${depenseId}-${empreinte.slice(0, 16)}`,
    nomFichier: fichier.nom,
    typeMime: fichier.typeMime,
    taille: fichier.contenu.size,
    empreinte,
    deposeLe: maintenant.toISOString(),
    depenseId
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

/* ─────────────────────────────────────────────────────────────────────────
   Implémentation IndexedDB
   ───────────────────────────────────────────────────────────────────────── */

const NOM_BASE = 'freel-justificatifs';
const NOM_MAGASIN = 'pieces';
const VERSION_BASE = 1;

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(NOM_BASE, VERSION_BASE);
    requete.onupgradeneeded = () => {
      const base = requete.result;
      if (!base.objectStoreNames.contains(NOM_MAGASIN)) {
        const magasin = base.createObjectStore(NOM_MAGASIN, { keyPath: 'id' });
        // Index sur la dépense : retrouver les pièces d'une dépense sans
        // parcourir tout le magasin.
        magasin.createIndex('depenseId', 'depenseId', { unique: false });
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
