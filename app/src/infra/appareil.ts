/**
 * Effacer cet appareil (lot 59, constat S7).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE GESTE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Faits, pièces et session vivent en clair dans le navigateur. Se déconnecter
 * les y laissait, sans le dire ; « Repartir de zéro » les mettait de côté —
 * c'est sa raison d'être, on peut revenir en arrière —, donc ne les effaçait
 * pas. Un ordinateur prêté, un téléphone revendu : rien ne permettait d'en
 * retirer ses données, sinon vider le navigateur à la main, ce qui efface
 * aussi les autres sites.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EST EFFACÉ, ET COMMENT ON LE SAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Toutes les clés de stockage de Freel — elles commencent toutes par
 * « freel », celles de l'ancienne version comprises —, et la base des pièces.
 * PAS `localStorage.clear()` : l'adresse `…github.io` est partagée avec les
 * autres sites du même compte (constat S4), et leurs données ne sont pas les
 * nôtres. Le bilan se fait en RELISANT, comme l'effacement du compte : un
 * effacement qu'on suppose fait n'est pas un effacement prouvé.
 */
import { NOM_BASE } from './justificatifs';

/** Toutes les clés de Freel : `freel.`, `freel-` et `freel_` (ancienne version). */
const CLE_DE_FREEL = /^freel/i;

/** Ce qu'il faut du stockage du navigateur pour le parcourir. */
export interface StockageParcourable {
  readonly length: number;
  key(i: number): string | null;
  removeItem(cle: string): void;
}

/** Ce qu'il faut d'IndexedDB. */
export interface Bases {
  supprimer(nom: string): Promise<void>;
  /** Les bases présentes ; `null` si le navigateur ne sait pas les lister. */
  lister(): Promise<readonly string[] | null>;
}

export interface BilanAppareil {
  /** Les clés de Freel encore présentes après effacement : vide si tout est parti. */
  readonly clesRestantes: readonly string[];
  /** La base des pièces est-elle encore là ? `null` : le navigateur ne permet pas de relire. */
  readonly baseRestante: boolean | null;
}

function clesDeFreel(stockage: StockageParcourable): string[] {
  const cles: string[] = [];
  for (let i = 0; i < stockage.length; i++) {
    const cle = stockage.key(i);
    if (cle !== null && CLE_DE_FREEL.test(cle)) cles.push(cle);
  }
  return cles;
}

export async function effacerCetAppareil(
  stockage: StockageParcourable, bases: Bases
): Promise<BilanAppareil> {
  // La liste est prise AVANT de retirer : retirer en parcourant décale les
  // indices, et une clé sur deux survivait.
  for (const cle of clesDeFreel(stockage)) stockage.removeItem(cle);
  let baseRestante: boolean | null;
  try {
    await bases.supprimer(NOM_BASE);
    const presentes = await bases.lister();
    baseRestante = presentes === null ? null : presentes.includes(NOM_BASE);
  } catch {
    baseRestante = true;
  }
  return { clesRestantes: clesDeFreel(stockage), baseRestante };
}

/** Délai au-delà duquel une base tenue ouverte ailleurs est dite « restante ». */
const ATTENTE_MAX_MS = 5000;

/** IndexedDB du navigateur. */
export function basesDuNavigateur(): Bases {
  return {
    supprimer: (nom) => new Promise((resoudre, rejeter) => {
      const requete = indexedDB.deleteDatabase(nom);
      // Bloquée : une autre fenêtre la tient ouverte. Les pièces s'ouvrent et
      // se ferment à chaque geste, l'attente est donc courte — mais pas
      // infinie : passé le délai, le bilan dira que la base reste.
      const delai = setTimeout(() => rejeter(new Error('base tenue ouverte')), ATTENTE_MAX_MS);
      requete.onsuccess = () => { clearTimeout(delai); resoudre(); };
      requete.onerror = () => { clearTimeout(delai); rejeter(requete.error ?? new Error('suppression refusée')); };
    }),
    lister: async () => {
      if (typeof indexedDB.databases !== 'function') return null;
      return (await indexedDB.databases()).map((b) => b.name ?? '');
    }
  };
}
