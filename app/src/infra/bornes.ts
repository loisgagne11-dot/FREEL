/**
 * Les tailles au-delà desquelles un fichier est refusé AVANT d'être lu
 * (lot 59, constat S8).
 *
 * Sans borne, un relevé de 100 000 lignes s'importait : le dossier passait
 * les 4 Mo que le compte accepte, puis le quota du navigateur, et les saisies
 * suivantes cessaient d'être enregistrées — loin de leur cause. Un fichier
 * choisi par erreur (une vidéo nommée `.json`) se chargeait en mémoire en
 * entier avant d'être refusé. Le refus se dit maintenant d'après la taille
 * annoncée par le navigateur, sans ouvrir le fichier.
 *
 * Ce module est à part pour que l'écran d'import n'ait pas à tirer le client
 * du compte (`supabase.ts`) pour connaître une constante.
 */

/**
 * La taille maximale d'un dossier, en octets de son texte JSON.
 *
 * Le plan disait « dix fois le jeu d'essai » : 185 Ko. Mesuré sur ce jeu,
 * élément par élément (une opération bancaire ≈ 200 octets, une dépense ≈
 * 260, une facture ≈ 360), un compte chargé — 40 opérations bancaires par
 * mois, 150 dépenses et 24 factures par an — pèse ≈ 150 Ko PAR AN. La borne
 * du plan aurait refusé sa synchronisation au bout d'un an, sans que rien ne
 * soit anormal. Dix ans d'une telle activité font ≈ 1,5 Mo ; la borne est
 * à plus du double. Ce qu'elle arrête : un envoi qui n'est plus un dossier
 * — une boucle, un fichier collé par erreur, un abus.
 */
export const TAILLE_MAX_FAITS = 4_000_000;

/**
 * Au-delà, un montant en euros ne se compte plus au centime près : les
 * flottants perdent l'unité à 2^53, soit ≈ 90 000 milliards de centimes.
 * Ce qui arrive de l'extérieur — un fichier, un relevé, un compte — et le
 * dépasse est refusé (lot 59) : 1e300 € faisait déborder la première somme.
 */
export const MONTANT_MAX = Number.MAX_SAFE_INTEGER / 100;

/**
 * Une sauvegarde JSON, ou les faits d'une archive : le même dossier, que
 * l'export écrit indenté — l'indentation double à peu près le texte. Au-delà,
 * ce n'est plus un dossier que le compte accepterait.
 */
export const TAILLE_MAX_SAUVEGARDE = 2 * TAILLE_MAX_FAITS;

/**
 * Un relevé bancaire CSV. Une opération y tient en 60 à 150 octets : dix ans
 * d'un compte à 40 opérations par mois font moins d'un mégaoctet.
 */
export const TAILLE_MAX_RELEVE = 5_000_000;

/**
 * Les opérations d'un même relevé. Dix ans à 40 opérations par mois en font
 * 4 800 ; à 10 000, le dossier reste loin de `TAILLE_MAX_FAITS` (≈ 200 octets
 * par opération enregistrée).
 */
export const OPERATIONS_MAX_RELEVE = 10_000;

/** En mégaoctets décimaux : la borne du compte s'écrit en millions d'octets. */
const enMo = (octets: number): string =>
  `${(octets / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;

/** Le motif du refus, ou `null` : `quoi` complète « Ce … ». */
export function motifTropVolumineux(taille: number, max: number, quoi: string): string | null {
  return taille > max
    ? `Ce ${quoi} pèse ${enMo(taille)}, au-delà des ${enMo(max)} acceptés : il n’a pas été ouvert. `
      + 'Vérifie que c’est bien le bon fichier.'
    : null;
}
