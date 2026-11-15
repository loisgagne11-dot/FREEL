/**
 * La session du compte : sa forme, sa clé, sa lecture.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EST SÉPARÉ DE `supabase.ts`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La barre du haut doit dire si le compte est relié — c'est le rôle de la
 * pastille Cloud. Elle n'a besoin, pour cela, que de LIRE une clé de stockage
 * et de comparer une date. Elle n'appelle aucun service.
 *
 * Or la barre du haut vit dans la coquille, donc dans le paquet d'entrée.
 * Importer `supabase.ts` depuis là aurait tiré dans ce paquet l'ensemble du
 * client distant — requêtes, tables, rafraîchissement de jeton, conversion du
 * format legacy — pour afficher une pastille de quinze pixels.
 *
 * Ces vingt lignes sont donc à part, et `supabase.ts` les réexporte : rien ne
 * change pour ce qui l'importait déjà.
 */

/** Interface minimale de stockage, pour rester testable sans navigateur. */
export interface StockageLocal {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
  removeItem(cle: string): void;
}

export interface Session {
  readonly jeton: string;
  readonly jetonRafraichissement: string;
  /** Horodatage d'expiration, en millisecondes. */
  readonly expireLe: number;
  readonly utilisateurId: string;
  readonly email: string;
}

/** Clé de conservation de la session. Distincte de celle des faits. */
export const CLE_SESSION = 'freel.session.supabase.v1' as const;

/**
 * La session conservée, ou `null` si elle manque ou ne se lit pas EN ENTIER.
 *
 * Seuls le jeton et l'utilisateur étaient contrôlés : une session sans
 * échéance lisible passait, et `sessionValide` comparait alors `undefined` à
 * l'heure — toujours faux, si bien qu'elle partait en renouvellement à chaque
 * ouverture, ou, avec une échéance en texte, valait pour toujours (lot 59, S9).
 */
export function lireSession(stockage: StockageLocal): Session | null {
  try {
    const brut = stockage.getItem(CLE_SESSION);
    if (brut === null) return null;
    const o = JSON.parse(brut) as Record<string, unknown>;
    const { jeton, jetonRafraichissement, expireLe, utilisateurId, email } = o;
    if (typeof jeton !== 'string' || jeton === '' || typeof utilisateurId !== 'string'
      || typeof jetonRafraichissement !== 'string' || typeof email !== 'string'
      || typeof expireLe !== 'number' || !Number.isFinite(expireLe) || expireLe <= 0) {
      return null;
    }
    return { jeton, jetonRafraichissement, expireLe, utilisateurId, email };
  } catch {
    return null;
  }
}

export function ecrireSession(stockage: StockageLocal, session: Session | null): void {
  try {
    if (session === null) stockage.removeItem(CLE_SESSION);
    else stockage.setItem(CLE_SESSION, JSON.stringify(session));
  } catch {
    // Stockage indisponible : la session vaudra pour l'onglet courant.
  }
}

/**
 * La session est-elle encore utilisable ?
 *
 * Une marge d'une minute évite de partir sur une requête avec un jeton qui
 * expirera pendant son trajet.
 */
export function sessionValide(session: Session, maintenant: number = Date.now()): boolean {
  const MARGE_MS = 60_000;
  return session.expireLe - MARGE_MS > maintenant;
}
