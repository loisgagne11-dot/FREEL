/**
 * L'écriture canonique d'un bloc de faits, et son empreinte.
 *
 * Sortie de `selecteurs.synchro.ts` pour n'avoir qu'une source : la règle de
 * synchronisation automatique compare les mêmes faits de la même façon que
 * l'écran Compte. Deux comparaisons écrites séparément finiraient par ne pas
 * tomber d'accord — l'écran dirait « à jour » pendant que le moteur enverrait.
 *
 * Aucun import : la barre du haut n'en a pas besoin, mais le moteur et l'écran
 * Compte, si, et ce module ne doit rien tirer d'autre avec lui.
 */

/**
 * Une écriture canonique : clés triées, valeurs absentes omises.
 *
 * Le compte rend ses faits par une colonne `jsonb`, qui RANGE les clés à sa
 * façon : l'appareil qui vient d'envoyer relirait sinon « diffère » à la
 * seconde même où tout est à jour.
 */
export function canonique(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonique(x))).join(',')}]`;
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonique(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** cyrb53 : 53 bits, sans dépendance. Pas un secret — une étiquette de contenu. */
function cyrb53(texte: string, graine: number): number {
  let h1 = 0xdeadbeef ^ graine;
  let h2 = 0x41c6ce57 ^ graine;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * L'empreinte d'un bloc de faits : sa longueur canonique et deux hachages.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE EMPREINTE, ET PAS UN DRAPEAU « MODIFIÉ » POSÉ À L'ÉCRITURE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un drapeau posé par chaque écriture et levé après un envoi PERD des
 * modifications dès que deux onglets travaillent : l'onglet A envoie l'état
 * F1 ; pendant le trajet, l'onglet B enregistre F2 et pose le drapeau ; A
 * reçoit « envoyé » et le lève. F2 n'est plus « à envoyer » — et au prochain
 * changement venu d'un autre appareil, il serait remplacé sans un mot.
 *
 * « Modifié depuis la dernière synchronisation » se DÉDUIT donc du contenu :
 * l'empreinte de ce qu'il y a ici, comparée à celle de ce qui a été envoyé ou
 * reçu la dernière fois. Une adoption pose l'empreinte de ce qu'elle a
 * adopté : elle ne compte pas comme une modification, par construction. Et
 * une saisie défaite à la main n'a plus rien à envoyer.
 *
 * Une collision ferait passer une modification pour aucune : avec deux
 * hachages de 53 bits et la longueur, la probabilité est de l'ordre de 2⁻¹⁰⁶.
 */
export function empreinte(faits: unknown): string {
  const texte = canonique(faits);
  return `${texte.length.toString(36)}-${cyrb53(texte, 0).toString(36)}-${cyrb53(texte, 1).toString(36)}`;
}
