/**
 * Lecture d'un relevé bancaire au format CSV.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EST PLUS LONG QU'IL N'EN A L'AIR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Il n'existe pas de format d'export bancaire. Chaque banque produit le sien,
 * et les différences ne sont pas cosmétiques :
 *
 *   · séparateur `;` chez la plupart des banques françaises, `,` ailleurs ;
 *   · montant signé sur une colonne, ou réparti sur deux colonnes Débit et
 *     Crédit — et alors le débit est tantôt positif, tantôt négatif ;
 *   · décimale à la virgule, milliers à l'espace insécable ou au point ;
 *   · dates en JJ/MM/AAAA, JJ-MM-AA ou AAAA-MM-JJ ;
 *   · encodage ISO-8859-1 chez plusieurs banques, encore aujourd'hui ;
 *   · lignes d'en-tête décoratives avant la vraie ligne de titres.
 *
 * Un import qui échoue sans dire pourquoi conduit à ressaisir un relevé à la
 * main, ou à renoncer au rapprochement. Ce module DIT donc ce qu'il a compris
 * — colonnes reconnues, format de date retenu, lignes ignorées et pourquoi —
 * pour que l'utilisateur puisse constater une erreur d'interprétation avant
 * qu'elle n'entre dans ses comptes.
 *
 * Rien n'est deviné en silence : une colonne non trouvée est un refus, pas
 * une valeur par défaut.
 */

import { type DateISO, type Euros, euros } from '../domain/types';

export interface LigneReleve {
  readonly date: DateISO;
  readonly libelle: string;
  /** Montant signé : négatif pour un débit, positif pour un crédit. */
  readonly montant: Euros;
}

export interface RapportLecture {
  readonly lignes: readonly LigneReleve[];
  /** Ce que la lecture a compris, à faire relire par l'utilisateur. */
  readonly interpretation: {
    readonly separateur: string;
    readonly colonneDate: string;
    readonly colonneLibelle: string;
    readonly colonneMontant: string;
    readonly formatDate: string;
  };
  /** Lignes écartées, avec leur numéro et le motif. */
  readonly ignorees: readonly { readonly ligne: number; readonly motif: string }[];
}

export type ResultatLecture =
  | { readonly statut: 'lu'; readonly rapport: RapportLecture }
  | { readonly statut: 'refuse'; readonly motif: string };

/* ── Découpage ─────────────────────────────────────────────────────────── */

/**
 * Le séparateur, déduit de la ligne de titres.
 *
 * On compte les occurrences plutôt que de tester un ordre de préférence : un
 * libellé contenant une virgule ferait choisir le mauvais séparateur si on se
 * contentait de « `,` d'abord ».
 */
export function detecterSeparateur(ligneTitres: string): string {
  const candidats = [';', ',', '\t', '|'];
  let meilleur = ';';
  let maximum = 0;
  for (const c of candidats) {
    const n = ligneTitres.split(c).length - 1;
    if (n > maximum) { maximum = n; meilleur = c; }
  }
  return meilleur;
}

/**
 * Découpe une ligne CSV en respectant les guillemets.
 *
 * Les libellés bancaires contiennent régulièrement le séparateur — « VIR SEPA
 * DUPONT, JEAN » — et un `split` naïf décalerait toutes les colonnes suivantes
 * sans que rien ne le signale.
 */
export function decouper(ligne: string, separateur: string): readonly string[] {
  const champs: string[] = [];
  let courant = '';
  let entreGuillemets = false;

  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      // Deux guillemets consécutifs à l'intérieur d'un champ en représentent un.
      if (entreGuillemets && ligne[i + 1] === '"') { courant += '"'; i++; }
      else entreGuillemets = !entreGuillemets;
      continue;
    }
    if (c === separateur && !entreGuillemets) { champs.push(courant); courant = ''; continue; }
    courant += c;
  }
  champs.push(courant);
  return champs.map((v) => v.trim());
}

/* ── Reconnaissance des colonnes ───────────────────────────────────────── */

const normaliser = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Intitulés reconnus, par rôle.
 *
 * La liste est volontairement large : un intitulé non reconnu bloque l'import
 * entier, et l'utilisateur n'a aucun moyen de le corriger depuis l'écran.
 */
const INTITULES = {
  date: ['date', 'date operation', "date d'operation", 'date de valeur', 'date valeur',
    'date comptable', 'operation date'],
  libelle: ['libelle', 'libelle operation', 'intitule', 'description', 'nature',
    'nature operation', 'motif', 'label', 'communication'],
  montant: ['montant', 'montant operation', 'amount', 'valeur', 'montant eur',
    'montant en euros'],
  debit: ['debit', 'debits', 'retrait', 'sortie'],
  credit: ['credit', 'credits', 'depot', 'entree']
} as const;

function trouverColonne(titres: readonly string[], candidats: readonly string[]): number {
  const normalises = titres.map(normaliser);
  // Correspondance exacte d'abord : « date » ne doit pas être capté par
  // « date de valeur » quand les deux colonnes existent.
  for (const candidat of candidats) {
    const i = normalises.indexOf(candidat);
    if (i !== -1) return i;
  }
  for (const candidat of candidats) {
    const i = normalises.findIndex((t) => t.includes(candidat));
    if (i !== -1) return i;
  }
  return -1;
}

/* ── Conversion des valeurs ────────────────────────────────────────────── */

/**
 * Un montant bancaire en nombre.
 *
 * Gère la virgule décimale, les espaces de milliers (y compris l'insécable et
 * l'insécable étroite), le point de milliers à la française, le symbole euro,
 * et les négatifs entre parenthèses. Rend `null` sur ce qu'il ne comprend pas
 * plutôt que zéro : un montant lu à zéro fausserait le solde en silence.
 */
export function lireMontant(brut: string): number | null {
  let texte = brut.replace(/[\s  €]/g, '').trim();
  if (texte === '') return null;

  let signe = 1;
  if (/^\(.*\)$/.test(texte)) { signe = -1; texte = texte.slice(1, -1); }
  if (texte.startsWith('-')) { signe = -1; texte = texte.slice(1); }
  else if (texte.startsWith('+')) texte = texte.slice(1);

  const virgule = texte.lastIndexOf(',');
  const point = texte.lastIndexOf('.');
  if (virgule !== -1 && point !== -1) {
    // Le séparateur décimal est le dernier des deux ; l'autre marque les
    // milliers. « 1.234,56 » et « 1,234.56 » se distinguent ainsi.
    texte = virgule > point
      ? texte.replace(/\./g, '').replace(',', '.')
      : texte.replace(/,/g, '');
  } else if (virgule !== -1) {
    texte = texte.replace(',', '.');
  } else if (point !== -1) {
    // Un point suivi de trois chiffres exactement, sans autre point, est
    // ambigu ; le traiter en milliers ferait lire 1.234 comme 1234 alors que
    // c'est souvent 1,234 €. On tranche en faveur du décimal, plus fréquent
    // dans les exports de montants.
    const apres = texte.length - point - 1;
    if (apres === 3 && /^\d{1,3}\.\d{3}$/.test(texte)) texte = texte.replace('.', '');
  }

  const valeur = Number.parseFloat(texte);
  return Number.isFinite(valeur) ? signe * valeur : null;
}

export type FormatDate = 'JJ/MM/AAAA' | 'AAAA-MM-JJ' | 'JJ-MM-AA';

/** Reconnaît le format d'une date, ou `null` si aucun ne correspond. */
export function formatDe(brut: string): FormatDate | null {
  const t = brut.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return 'AAAA-MM-JJ';
  if (/^\d{2}[/.]\d{2}[/.]\d{4}/.test(t)) return 'JJ/MM/AAAA';
  if (/^\d{2}[-/.]\d{2}[-/.]\d{2}$/.test(t)) return 'JJ-MM-AA';
  return null;
}

/**
 * Convertit une date selon le format retenu pour tout le fichier.
 *
 * Le format est décidé une fois et appliqué partout : le déduire ligne par
 * ligne ferait lire 03/04 comme le 3 avril sur une ligne et le 4 mars sur la
 * suivante, selon les valeurs rencontrées.
 */
export function lireDate(brut: string, format: FormatDate): DateISO | null {
  const t = brut.trim();
  if (format === 'AAAA-MM-JJ') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    return m === null ? null : validerDate(`${m[1]}-${m[2]}-${m[3]}`);
  }
  if (format === 'JJ/MM/AAAA') {
    const m = /^(\d{2})[/.](\d{2})[/.](\d{4})/.exec(t);
    return m === null ? null : validerDate(`${m[3]}-${m[2]}-${m[1]}`);
  }
  const m = /^(\d{2})[-/.](\d{2})[-/.](\d{2})$/.exec(t);
  if (m === null) return null;
  // Année sur deux chiffres : le siècle est choisi par la règle usuelle des
  // relevés bancaires, qui ne remontent pas au siècle dernier.
  const annee = Number(m[3]) <= 79 ? `20${m[3]}` : `19${m[3]}`;
  return validerDate(`${annee}-${m[2]}-${m[1]}`);
}

/** Rejette une date syntaxiquement correcte mais inexistante (31 février). */
function validerDate(iso: string): DateISO | null {
  const [a, m, j] = iso.split('-').map(Number);
  if (a === undefined || m === undefined || j === undefined) return null;
  const d = new Date(Date.UTC(a, m - 1, j));
  const correspond = d.getUTCFullYear() === a
    && d.getUTCMonth() === m - 1
    && d.getUTCDate() === j;
  return correspond ? iso as DateISO : null;
}

/* ── Lecture ───────────────────────────────────────────────────────────── */

/** Nombre de lignes examinées à la recherche de la ligne de titres. */
const LIGNES_ENTETE_TOLEREES = 12;

/**
 * Lit un relevé.
 *
 * La ligne de titres n'est pas supposée être la première : plusieurs banques
 * font précéder leurs exports d'un bloc d'identification du compte. On cherche
 * donc la première ligne qui porte à la fois une colonne de date et une
 * colonne de montant.
 */
export function lireReleve(contenu: string): ResultatLecture {
  const lignes = contenu.split(/\r?\n/);
  const limite = Math.min(LIGNES_ENTETE_TOLEREES, lignes.length);

  for (let i = 0; i < limite; i++) {
    const brute = lignes[i];
    if (brute === undefined || brute.trim() === '') continue;

    const separateur = detecterSeparateur(brute);
    const titres = decouper(brute, separateur);
    const iDate = trouverColonne(titres, INTITULES.date);
    const iMontant = trouverColonne(titres, INTITULES.montant);
    const iDebit = trouverColonne(titres, INTITULES.debit);
    const iCredit = trouverColonne(titres, INTITULES.credit);
    const iLibelle = trouverColonne(titres, INTITULES.libelle);

    const aUnMontant = iMontant !== -1 || (iDebit !== -1 && iCredit !== -1);
    if (iDate === -1 || !aUnMontant) continue;

    return lireCorps(lignes, i + 1, {
      separateur, titres, iDate, iLibelle, iMontant, iDebit, iCredit
    });
  }

  return {
    statut: 'refuse',
    motif: 'Aucune ligne de titres reconnue dans les douze premières lignes. '
      + 'Le fichier doit comporter une colonne de date et une colonne de montant '
      + '(ou deux colonnes Débit et Crédit).'
  };
}

interface Reperes {
  readonly separateur: string;
  readonly titres: readonly string[];
  readonly iDate: number;
  readonly iLibelle: number;
  readonly iMontant: number;
  readonly iDebit: number;
  readonly iCredit: number;
}

function lireCorps(
  lignes: readonly string[],
  depart: number,
  reperes: Reperes
): ResultatLecture {
  const { separateur, titres, iDate, iLibelle, iMontant, iDebit, iCredit } = reperes;

  // Le format de date est décidé sur la première ligne exploitable, puis
  // appliqué à tout le fichier.
  let format: FormatDate | null = null;
  for (let i = depart; i < lignes.length && format === null; i++) {
    const champs = decouper(lignes[i] ?? '', separateur);
    const brut = champs[iDate];
    if (brut !== undefined && brut !== '') format = formatDe(brut);
  }
  if (format === null) {
    return {
      statut: 'refuse',
      motif: 'Aucune date exploitable : formats acceptés JJ/MM/AAAA, AAAA-MM-JJ '
        + 'ou JJ-MM-AA.'
    };
  }

  const retenues: LigneReleve[] = [];
  const ignorees: { ligne: number; motif: string }[] = [];

  for (let i = depart; i < lignes.length; i++) {
    const brute = lignes[i];
    if (brute === undefined || brute.trim() === '') continue;

    const champs = decouper(brute, separateur);
    const date = lireDate(champs[iDate] ?? '', format);
    if (date === null) {
      ignorees.push({ ligne: i + 1, motif: `date illisible (« ${champs[iDate] ?? ''} »)` });
      continue;
    }

    const montant = montantDeLigne(champs, iMontant, iDebit, iCredit);
    if (montant === null) {
      ignorees.push({ ligne: i + 1, motif: 'montant illisible ou absent' });
      continue;
    }
    // Une opération à zéro n'a rien à rapprocher et fausserait les compteurs.
    if (montant === 0) {
      ignorees.push({ ligne: i + 1, motif: 'montant nul' });
      continue;
    }

    retenues.push({
      date,
      libelle: (iLibelle === -1 ? '' : champs[iLibelle] ?? '').trim(),
      montant: euros(montant)
    });
  }

  if (retenues.length === 0) {
    return {
      statut: 'refuse',
      motif: 'Aucune opération exploitable dans le fichier : '
        + `${ignorees.length} ligne(s) écartée(s).`
    };
  }

  return {
    statut: 'lu',
    rapport: {
      lignes: retenues,
      interpretation: {
        separateur: separateur === '\t' ? 'tabulation' : separateur,
        colonneDate: titres[iDate] ?? '',
        colonneLibelle: iLibelle === -1 ? '(aucune)' : titres[iLibelle] ?? '',
        colonneMontant: iMontant !== -1
          ? titres[iMontant] ?? ''
          : `${titres[iDebit] ?? ''} / ${titres[iCredit] ?? ''}`,
        formatDate: format
      },
      ignorees
    }
  };
}

/**
 * Le montant signé d'une ligne.
 *
 * Sur deux colonnes, le débit est rendu négatif quel que soit son signe
 * d'origine : certaines banques l'exportent positif, d'autres négatif, et
 * additionner les deux conventions donnerait un solde faux dans un cas sur
 * deux.
 */
function montantDeLigne(
  champs: readonly string[],
  iMontant: number,
  iDebit: number,
  iCredit: number
): number | null {
  if (iMontant !== -1) return lireMontant(champs[iMontant] ?? '');

  const debit = lireMontant(champs[iDebit] ?? '');
  const credit = lireMontant(champs[iCredit] ?? '');
  if (debit !== null && debit !== 0) return -Math.abs(debit);
  if (credit !== null && credit !== 0) return Math.abs(credit);
  return null;
}

/**
 * Décode un fichier en tenant compte des encodages bancaires.
 *
 * Plusieurs banques françaises exportent encore en ISO-8859-1. Décodé en
 * UTF-8, un tel fichier produit des caractères de remplacement (U+FFFD) dans
 * les libellés — « VIREMENT SOCI�T� ». On relit alors en latin-1, où les
 * mêmes octets ont un sens.
 */
export async function decoderFichier(fichier: Blob): Promise<string> {
  const octets = await fichier.arrayBuffer();
  const enUtf8 = new TextDecoder('utf-8').decode(octets);
  if (!enUtf8.includes('�')) return enUtf8;
  return new TextDecoder('iso-8859-1').decode(octets);
}
