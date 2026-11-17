import type { DateISO } from '../types';

/**
 * Le calendrier `.ics` des obligations : un fichier à importer dans son
 * agenda, au format iCalendar (RFC 5545, septembre 2009 —
 * https://www.rfc-editor.org/rfc/rfc5545.txt, relue le 17/11/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN FICHIER, PAS UN ABONNEMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Sans serveur, rien ne s'« abonne » : l'agenda importe le fichier tel qu'il
 * est ce jour-là, et ne le relira pas. Une obligation ajoutée ensuite n'y
 * entrera qu'au prochain import — l'écran le dit. Les identifiants sont
 * stables pour qu'un second import REMPLACE les événements au lieu de les
 * doubler.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI SORT EST ÉCRIT PAR UN TIERS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un libellé de pièce, une description, sont saisis — et un fichier importé
 * peut les avoir fabriqués. Une virgule, un point-virgule, un saut de ligne
 * non échappés ouvriraient une propriété nouvelle dans l'agenda de
 * l'utilisateur. Tout texte passe par `echapper` (§ 3.3.11), toute ligne par
 * `plier` (§ 3.1). Un agenda se synchronise chez un tiers : aucun nom de
 * client n'y entre, et c'est l'appelant qui choisit les textes.
 */

export interface EvenementIcs {
  /** Stable d'un import à l'autre, sans donnée personnelle ni nom de domaine réel. */
  readonly uid: string;
  /** Journée entière. */
  readonly date: DateISO;
  readonly titre: string;
  readonly description: string;
  /** Combien de jours avant, l'agenda prévient ; `null` : aucune alarme. */
  readonly rappelJours: number | null;
}

/**
 * Échappe une valeur TEXT (§ 3.3.11) : la barre oblique inverse, le
 * point-virgule et la virgule se préfixent ; tout saut de ligne devient
 * `\n` ; les autres caractères de contrôle, que TEXT n'admet pas, sont
 * retirés. Le deux-points ne s'échappe PAS : la norme l'interdit, et un
 * `\:` s'afficherait tel quel.
 */
export function echapper(texte: string): string {
  return texte
    .replace(/\\/gu, '\\\\')
    .replace(/;/gu, '\\;')
    .replace(/,/gu, '\\,')
    .replace(/\r\n|\r|\n/gu, '\\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/gu, '');
}

/** Combien d'octets UTF-8 un point de code occupe. */
const octets = (pointDeCode: number): number =>
  (pointDeCode < 0x80 ? 1 : pointDeCode < 0x800 ? 2 : pointDeCode < 0x10000 ? 3 : 4);

/** La longueur maximale d'une ligne, en octets, saut de ligne exclu (§ 3.1). */
export const OCTETS_PAR_LIGNE = 75;

/**
 * Plie une ligne de contenu en lignes de 75 OCTETS au plus : chaque suite
 * commence par une espace, qui compte dans les 75. La mesure est en octets,
 * pas en caractères — un « é » en fait deux, un émoji quatre —, et l'on ne
 * coupe jamais à l'intérieur d'une séquence UTF-8 : la note du § 3.1 cite
 * cette coupure comme l'erreur des implémentations naïves, et l'agenda
 * afficherait un caractère de remplacement.
 */
export function plier(ligne: string): string {
  const morceaux: string[] = [];
  let courant = '';
  let taille = 0;
  let limite = OCTETS_PAR_LIGNE;
  for (const caractere of ligne) {
    const n = octets(caractere.codePointAt(0) ?? 0);
    if (taille + n > limite) {
      morceaux.push(courant);
      courant = '';
      taille = 0;
      limite = OCTETS_PAR_LIGNE - 1; // l'espace de pliage
    }
    courant += caractere;
    taille += n;
  }
  morceaux.push(courant);
  return morceaux.join('\r\n ');
}

/** `20261117T090000Z` : DTSTAMP est en UTC, toujours (§ 3.8.7.2). */
function horodatageUtc(instant: Date): string {
  return instant.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}/u, '');
}

const dateIcs = (d: DateISO): string => d.replace(/-/gu, '');

/** Le lendemain : DTEND d'une journée entière est EXCLUSIF (§ 3.6.1). */
function lendemain(d: DateISO): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return dateIcs(t.toISOString().slice(0, 10) as DateISO);
}

/**
 * Le fichier, lignes terminées par CRLF (§ 3.1). `maintenant` date la
 * production (DTSTAMP) : le même jour, deux exports donnent le même fichier
 * à la seconde près.
 */
export function calendrierIcs(evenements: readonly EvenementIcs[], maintenant: Date): string {
  const tampon = horodatageUtc(maintenant);
  const lignes: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FREEL//Obligations//FR',
    'CALSCALE:GREGORIAN'
  ];
  for (const e of evenements) {
    lignes.push(
      'BEGIN:VEVENT',
      `UID:${echapper(e.uid)}`,
      `DTSTAMP:${tampon}`,
      `DTSTART;VALUE=DATE:${dateIcs(e.date)}`,
      `DTEND;VALUE=DATE:${lendemain(e.date)}`,
      `SUMMARY:${echapper(e.titre)}`,
      `DESCRIPTION:${echapper(e.description)}`,
      // Une échéance n'occupe pas la journée : l'agenda ne doit pas la
      // compter comme une indisponibilité.
      'TRANSP:TRANSPARENT'
    );
    if (e.rappelJours !== null) {
      lignes.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${echapper(e.titre)}`,
        `TRIGGER:-P${Math.max(0, Math.round(e.rappelJours))}D`,
        'END:VALARM'
      );
    }
    lignes.push('END:VEVENT');
  }
  lignes.push('END:VCALENDAR');
  return lignes.map(plier).join('\r\n') + '\r\n';
}
