// Module ZIP pur : API standard du navigateur uniquement (Blob, TextEncoder,
// DataView). Il existe parce que les justificatifs vivent dans IndexedDB et ne
// figurent dans aucune sauvegarde JSON : sans archive, perdre le navigateur
// c'est perdre les pièces.
//
// Choix : méthode 0 (« stockée »). Les PDF et les photos sont déjà compressés ;
// une compression maison coûterait de la mémoire et du code pour quelques
// pourcents, et sans API de compression synchrone portable on garderait en
// mémoire des tampons que l'on veut précisément éviter.

export interface EntreeZip {
  readonly nom: string;
  readonly contenu: Blob;
  readonly date: Date;
}

/** Erreur lisible par l'utilisateur : `message` est une phrase en français. */
export class ErreurArchive extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurArchive';
  }
}

export interface EntreeLue {
  readonly nom: string;
  readonly taille: number;
  readonly date: Date;
  /** Le contenu ; vérifie le CRC-32 et lève ErreurArchive s'il ne correspond pas. */
  lire(): Promise<Blob>;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_FIN = 0x06054b50;
const TAILLE_LOCAL = 30;
const TAILLE_CENTRAL = 46;
const TAILLE_FIN = 22;
// Le commentaire de fin d'annuaire tient sur 16 bits : la signature ne peut
// pas se trouver plus loin que cela avant la fin du fichier.
const FENETRE_FIN = 0xffff + TAILLE_FIN;
const MAX_OCTETS = 0xffffffff;
const MAX_ENTREES = 0xffff;
// Bit 11 : noms en UTF-8. Sans lui, « Café » serait lu en CP437 par les
// outils et afficherait « CafÃ© ».
const DRAPEAU_UTF8 = 0x0800;
const DRAPEAU_CHIFFRE = 0x0001;

// ── CRC-32 ──────────────────────────────────────────────────────────────

const TABLE_CRC: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 standard ; `crc` permet de chaîner plusieurs morceaux. */
export function crc32(octets: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < octets.length; i++) {
    c = TABLE_CRC[(c ^ octets[i]!) & 0xff]! ^ (c >>> 8);
  }
  return ~c >>> 0;
}

// ── Noms ────────────────────────────────────────────────────────────────

/** Refuse les chemins qui sortiraient du dossier de restauration (« zip slip »). */
function nomInterdit(nom: string): boolean {
  if (nom === '' || nom.startsWith('/') || nom.includes('\\') || nom.includes('\0')) return true;
  return nom.split('/').some(segment => segment === '..');
}

function refuserNom(nom: string): never {
  throw new ErreurArchive(
    `Le nom « ${nom} » n’est pas admis dans une archive : il doit être non vide, relatif et ne pas remonter d’un dossier.`
  );
}

// ── Date DOS ────────────────────────────────────────────────────────────

function versDos(d: Date): { heure: number; jour: number } {
  // Le format DOS commence en 1980 et s'arrête en 2107 : en dehors, on borne
  // plutôt que de déborder sur les bits voisins.
  const annee = Math.min(2107, Math.max(1980, d.getFullYear()));
  const brut = annee === d.getFullYear();
  const mois = brut ? d.getMonth() + 1 : annee === 1980 ? 1 : 12;
  const jour = brut ? d.getDate() : annee === 1980 ? 1 : 31;
  const h = brut ? d.getHours() : 0;
  const mn = brut ? d.getMinutes() : 0;
  const s = brut ? d.getSeconds() : 0;
  return {
    heure: (h << 11) | (mn << 5) | (s >> 1),
    jour: ((annee - 1980) << 9) | (mois << 5) | jour
  };
}

function depuisDos(heure: number, jour: number): Date {
  return new Date(
    ((jour >> 9) & 0x7f) + 1980,
    Math.max(0, ((jour >> 5) & 0x0f) - 1),
    Math.max(1, jour & 0x1f),
    (heure >> 11) & 0x1f,
    (heure >> 5) & 0x3f,
    (heure & 0x1f) * 2
  );
}

// ── Écriture ────────────────────────────────────────────────────────────

interface Fiche {
  readonly nomOctets: Uint8Array;
  readonly crc: number;
  readonly taille: number;
  readonly heure: number;
  readonly jour: number;
  readonly decalage: number;
}

const TROP_GROS =
  'L’archive dépasserait 4 Go ou 65 535 fichiers, ce que ce format ne sait pas porter : exporte tes pièces en plusieurs fois.';

/**
 * Écrit une archive ZIP « stockée ». Les entrées sont lues une à une pour le
 * CRC ; le Blob d'origine (et non son tampon) est placé dans le résultat, pour
 * que la mémoire ne porte jamais toutes les pièces à la fois.
 */
export async function ecrireZip(
  entrees: Iterable<EntreeZip> | AsyncIterable<EntreeZip>
): Promise<Blob> {
  const encodeur = new TextEncoder();
  const morceaux: BlobPart[] = [];
  const fiches: Fiche[] = [];
  const vus = new Set<string>();
  let position = 0;

  for await (const entree of entrees) {
    if (nomInterdit(entree.nom)) refuserNom(entree.nom);
    // Deux entrées de même nom : à la restauration, la seconde écraserait la
    // première en silence.
    if (vus.has(entree.nom)) {
      throw new ErreurArchive(`Le nom « ${entree.nom} » apparaît deux fois dans l’archive.`);
    }
    vus.add(entree.nom);
    if (fiches.length >= MAX_ENTREES) throw new ErreurArchive(TROP_GROS);

    const nomOctets = encodeur.encode(entree.nom);
    if (nomOctets.length > 0xffff) refuserNom(entree.nom);
    const taille = entree.contenu.size;
    const crc = crc32(new Uint8Array(await entree.contenu.arrayBuffer()));
    const { heure, jour } = versDos(entree.date);

    const entete = new Uint8Array(TAILLE_LOCAL + nomOctets.length);
    const v = new DataView(entete.buffer);
    v.setUint32(0, SIG_LOCAL, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, DRAPEAU_UTF8, true);
    v.setUint16(8, 0, true);
    v.setUint16(10, heure, true);
    v.setUint16(12, jour, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, taille, true);
    v.setUint32(22, taille, true);
    v.setUint16(26, nomOctets.length, true);
    v.setUint16(28, 0, true);
    entete.set(nomOctets, TAILLE_LOCAL);

    fiches.push({ nomOctets, crc, taille, heure, jour, decalage: position });
    position += entete.length + taille;
    if (position > MAX_OCTETS) throw new ErreurArchive(TROP_GROS);
    morceaux.push(entete, entree.contenu);
  }

  const debutAnnuaire = position;
  for (const f of fiches) {
    const c = new Uint8Array(TAILLE_CENTRAL + f.nomOctets.length);
    const v = new DataView(c.buffer);
    v.setUint32(0, SIG_CENTRAL, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint16(8, DRAPEAU_UTF8, true);
    v.setUint16(10, 0, true);
    v.setUint16(12, f.heure, true);
    v.setUint16(14, f.jour, true);
    v.setUint32(16, f.crc, true);
    v.setUint32(20, f.taille, true);
    v.setUint32(24, f.taille, true);
    v.setUint16(28, f.nomOctets.length, true);
    // extra, commentaire, disque, attributs internes et externes : 0 (déjà).
    v.setUint32(42, f.decalage, true);
    c.set(f.nomOctets, TAILLE_CENTRAL);
    morceaux.push(c);
    position += c.length;
  }
  if (position + TAILLE_FIN > MAX_OCTETS) throw new ErreurArchive(TROP_GROS);

  const fin = new Uint8Array(TAILLE_FIN);
  const vf = new DataView(fin.buffer);
  vf.setUint32(0, SIG_FIN, true);
  vf.setUint16(8, fiches.length, true);
  vf.setUint16(10, fiches.length, true);
  vf.setUint32(12, position - debutAnnuaire, true);
  vf.setUint32(16, debutAnnuaire, true);
  morceaux.push(fin);

  return new Blob(morceaux, { type: 'application/zip' });
}

// ── Lecture ─────────────────────────────────────────────────────────────

const NON_ZIP = 'Ce fichier n’est pas une archive ZIP lisible (ou elle est tronquée).';
const COMPRESSEE =
  'Cette archive est compressée : seules celles produites par l’application se relisent ici.';

async function octets(blob: Blob, debut: number, fin: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(debut, fin).arrayBuffer());
}

function vue(o: Uint8Array): DataView {
  return new DataView(o.buffer, o.byteOffset, o.byteLength);
}

/**
 * Sans le bit 11, la norme impose CP437. On le lit comme latin1 : les lettres
 * ASCII sont identiques et les accents divergent, mais les archives sans bit 11
 * ne viennent pas de l'application, qui le lève toujours. Une table CP437
 * complète n'achèterait rien ici.
 */
function decoderNom(o: Uint8Array, utf8: boolean): string {
  if (utf8) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(o);
    } catch {
      throw new ErreurArchive(NON_ZIP);
    }
  }
  let s = '';
  for (const b of o) s += String.fromCharCode(b);
  return s;
}

export async function lireZip(archive: Blob): Promise<readonly EntreeLue[]> {
  if (archive.size < TAILLE_FIN) throw new ErreurArchive(NON_ZIP);

  const debutFenetre = Math.max(0, archive.size - FENETRE_FIN);
  const fenetre = await octets(archive, debutFenetre, archive.size);
  const vf = vue(fenetre);
  let posFin = -1;
  for (let i = fenetre.length - TAILLE_FIN; i >= 0; i--) {
    // La longueur du commentaire doit retomber exactement sur la fin du
    // fichier : une signature perdue dans un commentaire ne passe pas.
    if (vf.getUint32(i, true) === SIG_FIN &&
        i + TAILLE_FIN + vf.getUint16(i + 20, true) === fenetre.length) {
      posFin = i;
      break;
    }
  }
  if (posFin < 0) throw new ErreurArchive(NON_ZIP);

  const disque = vf.getUint16(posFin + 4, true);
  const disqueAnnuaire = vf.getUint16(posFin + 6, true);
  const surDisque = vf.getUint16(posFin + 8, true);
  const total = vf.getUint16(posFin + 10, true);
  const tailleAnnuaire = vf.getUint32(posFin + 12, true);
  const debutAnnuaire = vf.getUint32(posFin + 16, true);
  if (disque !== 0 || disqueAnnuaire !== 0 || surDisque !== total) {
    throw new ErreurArchive('Cette archive est découpée en plusieurs volumes : réunis-la en un seul fichier avant de l’importer.');
  }
  if (total === 0xffff || tailleAnnuaire === MAX_OCTETS || debutAnnuaire === MAX_OCTETS) {
    throw new ErreurArchive('Cette archive utilise l’extension ZIP64, que cette application ne sait pas relire.');
  }
  if (debutAnnuaire + tailleAnnuaire > archive.size) throw new ErreurArchive(NON_ZIP);

  const annuaire = await octets(archive, debutAnnuaire, debutAnnuaire + tailleAnnuaire);
  const va = vue(annuaire);
  const entrees: EntreeLue[] = [];
  let p = 0;
  for (let n = 0; n < total; n++) {
    if (p + TAILLE_CENTRAL > annuaire.length || va.getUint32(p, true) !== SIG_CENTRAL) {
      throw new ErreurArchive(NON_ZIP);
    }
    const drapeaux = va.getUint16(p + 8, true);
    const methode = va.getUint16(p + 10, true);
    const heure = va.getUint16(p + 12, true);
    const jour = va.getUint16(p + 14, true);
    const crc = va.getUint32(p + 16, true);
    const tailleComp = va.getUint32(p + 20, true);
    const taille = va.getUint32(p + 24, true);
    const lNom = va.getUint16(p + 28, true);
    const lExtra = va.getUint16(p + 30, true);
    const lCom = va.getUint16(p + 32, true);
    const decalage = va.getUint32(p + 42, true);
    if (p + TAILLE_CENTRAL + lNom + lExtra + lCom > annuaire.length) throw new ErreurArchive(NON_ZIP);

    if (drapeaux & DRAPEAU_CHIFFRE) {
      throw new ErreurArchive('Cette archive est chiffrée : elle ne peut pas être relue ici.');
    }
    if (methode !== 0) throw new ErreurArchive(COMPRESSEE);
    if (tailleComp !== taille) throw new ErreurArchive(NON_ZIP);

    const nom = decoderNom(
      annuaire.subarray(p + TAILLE_CENTRAL, p + TAILLE_CENTRAL + lNom),
      (drapeaux & DRAPEAU_UTF8) !== 0
    );
    // Refus plutôt qu'oubli : une archive qui tente de sortir du dossier est
    // suspecte en entier, on n'en restaure pas « le reste ».
    if (nomInterdit(nom)) refuserNom(nom);

    entrees.push({
      nom,
      taille,
      date: depuisDos(heure, jour),
      async lire() {
        // L'en-tête local peut porter un champ extra de longueur différente de
        // celui de l'annuaire : les prendre dans l'annuaire décalerait les données.
        if (decalage + TAILLE_LOCAL > archive.size) throw new ErreurArchive(NON_ZIP);
        const loc = await octets(archive, decalage, decalage + TAILLE_LOCAL);
        const vl = vue(loc);
        if (vl.getUint32(0, true) !== SIG_LOCAL) throw new ErreurArchive(NON_ZIP);
        const debut = decalage + TAILLE_LOCAL + vl.getUint16(26, true) + vl.getUint16(28, true);
        if (debut + taille > archive.size) throw new ErreurArchive(NON_ZIP);
        const contenu = archive.slice(debut, debut + taille);
        if (crc32(new Uint8Array(await contenu.arrayBuffer())) !== crc) {
          throw new ErreurArchive(`Le fichier « ${nom} » est altéré : son contenu ne correspond plus à son empreinte.`);
        }
        return contenu;
      }
    });
    p += TAILLE_CENTRAL + lNom + lExtra + lCom;
  }
  return entrees;
}

// ── Noms de fichiers ────────────────────────────────────────────────────

const RESERVES_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const LONGUEUR_MAX = 120;

/** Rend un libellé utilisable comme nom de fichier sur Windows, macOS et Linux. */
export function nomDeFichierSur(libelle: string): string {
  let nom = libelle
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows supprime en silence points et espaces de fin : le fichier
    // enregistré n'aurait plus le nom attendu.
    .replace(/[. ]+$/, '');

  const caracteres = Array.from(nom);
  if (caracteres.length > LONGUEUR_MAX) {
    const point = nom.lastIndexOf('.');
    const ext = point > 0 && nom.length - point <= 10 ? nom.slice(point) : '';
    const racine = Array.from(nom.slice(0, ext ? point : nom.length))
      .slice(0, LONGUEUR_MAX - Array.from(ext).length)
      .join('')
      .replace(/[. ]+$/, '');
    nom = racine + ext;
  }

  if (nom === '') return 'sans-nom';
  // « CON.txt » est réservé aussi : Windows ne regarde que ce qui précède le premier point.
  if (RESERVES_WINDOWS.test(nom.split('.')[0]!.trim())) nom = `_${nom}`;
  return nom;
}
