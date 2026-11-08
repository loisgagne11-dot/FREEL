/**
 * Archive ZIP des justificatifs.
 *
 * Les pièces vivent dans IndexedDB, dans un seul navigateur, et ni l'export
 * JSON ni la synchronisation ne les emportent : sans cette archive, un
 * navigateur réinitialisé emporte des documents à conservation légale.
 *
 * Choix structurants :
 * - une seule lecture par pièce. Le manifeste a besoin de l'état de chaque
 *   pièce, donc il est écrit EN DERNIER (l'ordre des entrées ZIP est libre),
 *   pendant l'unique passe ; relire chaque pièce deux fois doublerait les E/S
 *   sur des fichiers de plusieurs Mo ;
 * - une pièce altérée est incluse quand même : jeter un fichier parce qu'il
 *   a changé détruirait la seule copie qui reste, et l'état est dit dans le
 *   manifeste ;
 * - la restauration n'écrit que des pièces. Elle ne touche pas aux faits et ne
 *   supprime rien : elle ne peut donc que réparer.
 */

import { ErreurArchive, type EntreeLue, ecrireZip, lireZip, nomDeFichierSur } from './archive.zip';
import {
  type MetaJustificatif, type StockageJustificatifs, empreinteDe
} from './justificatifs';
import type { EntreeZip } from './archive.zip';
import type { Faits } from '../state/schema';
import { ANNEES_CONSERVATION } from '../domain/bareme/recettes';

// Ré-exportée : l'écran distingue les refus lisibles des pannes sans importer le module ZIP.
export { ErreurArchive };

export const FORMAT_ARCHIVE = 1;
export const CHEMIN_FAITS = 'freel-donnees.json';
export const CHEMIN_MANIFESTE = 'justificatifs/manifeste.json';
const CHEMIN_LISEZMOI = 'LISEZMOI.txt';

export type EtatPiece = 'intacte' | 'alteree' | 'illisible';

export interface PieceDuManifeste {
  readonly id: string;
  readonly nomFichier: string;
  readonly typeMime: string;
  readonly taille: number;
  readonly empreinte: string;
  readonly deposeLe: string;
  readonly fait: { readonly nature: 'depense' | 'recette'; readonly id: string };
  /** Chemin dans l'archive ; null si la pièce n'a pas pu être lue (illisible). */
  readonly chemin: string | null;
  readonly dateDuFait: string | null;
  readonly libelleDuFait: string | null;
  readonly etat: EtatPiece;
  /** Rattachée à aucun fait courant au moment de l'archive. */
  readonly orpheline: boolean;
}

export interface Manifeste {
  readonly format: typeof FORMAT_ARCHIVE;
  readonly application: 'FREEL';
  readonly produiteLe: string;
  readonly pieces: readonly PieceDuManifeste[];
}

export interface BilanArchive {
  readonly pieces: number;
  readonly alterees: number;
  readonly illisibles: number;
  readonly orphelines: number;
  readonly octets: number;
}

/** Même esprit que `nomSauvegarde` : lisible, daté, jamais de nom vide. */
export function nomDeLArchive(nomEntreprise: string, jour: string): string {
  const nom = nomEntreprise.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `freel-${nom === '' ? 'donnees' : nom.toLowerCase()}-archive-${jour}.zip`;
}

// ── Chemins ─────────────────────────────────────────────────────────────

const EXTENSIONS_PAR_TYPE: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp'
};

function extensionDe(meta: MetaJustificatif): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(meta.nomFichier);
  if (m) return m[1]!.toLowerCase();
  return EXTENSIONS_PAR_TYPE[meta.typeMime] ?? 'bin';
}

const FORMAT_EUROS = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2
});

// Les espaces insécables d'Intl survivent mal aux outils et aux copies de noms.
function montantLisible(montant: number): string {
  return FORMAT_EUROS.format(montant).replace(/[  ]/g, ' ');
}

interface FaitResolu {
  readonly date: string | null;
  readonly libelle: string;
  readonly montant: number;
}

function resoudreFait(faits: Faits, nature: 'depense' | 'recette', id: string): FaitResolu | null {
  if (nature === 'depense') {
    const d = faits.depenses.find((x) => x.id === id);
    return d ? { date: d.payeeLe, libelle: d.fournisseur, montant: d.montantTtc } : null;
  }
  const r = faits.recettes.find((x) => x.id === id);
  return r
    ? {
      date: r.emiseLe ?? r.encaisseeLe,
      libelle: `${r.numero} ${r.clientNom}`.trim(),
      montant: r.montant
    }
    : null;
}

/** Réserve un chemin libre ; sur collision, suffixe ` (2)`, ` (3)` avant l'extension. */
function cheminLibre(
  dossier: string, racine: string, ext: string, pris: Set<string>
): string {
  for (let n = 1; ; n++) {
    const suffixe = n === 1 ? '' : ` (${n})`;
    const nom = nomDeFichierSur(`${racine}${suffixe}.${ext}`);
    const chemin = `${dossier}${nom}`;
    // Insensible à la casse : sur Windows et macOS deux chemins ne différant
    // que par la casse s'écraseraient à l'extraction.
    if (!pris.has(chemin.toLowerCase())) {
      pris.add(chemin.toLowerCase());
      return chemin;
    }
  }
}

function cheminDe(
  meta: MetaJustificatif, fait: FaitResolu | null, pris: Set<string>
): string {
  const ext = extensionDe(meta);
  if (fait === null) {
    return cheminLibre(
      'justificatifs/sans-fait/',
      `${meta.deposeLe.slice(0, 10)} ${meta.nomFichier.replace(/\.[A-Za-z0-9]{1,8}$/, '')}`,
      ext, pris
    );
  }
  const annee = fait.date === null ? 'sans-date' : fait.date.slice(0, 4);
  const dossier = `justificatifs/${nomDeFichierSur(annee)}/`
    + `${meta.fait.nature === 'depense' ? 'depenses' : 'recettes'}/`;
  return cheminLibre(
    dossier, `${fait.date ?? 'sans-date'} ${fait.libelle} ${montantLisible(fait.montant)}`, ext, pris
  );
}

// ── LISEZMOI ────────────────────────────────────────────────────────────

// Les durées viennent du barème ; seule leur graphie est locale. Un chiffre
// inconnu reste en chiffres plutôt que de produire un mot faux.
const EN_LETTRES: Readonly<Record<number, string>> = { 5: 'cinq', 6: 'six', 10: 'dix' };
const enLettres = (n: number): string => EN_LETTRES[n] ?? String(n);

function lisezmoi(manifeste: Manifeste, bilan: BilanArchive): string {
  const noms = (pred: (p: PieceDuManifeste) => boolean): string =>
    manifeste.pieces.filter(pred).map((p) => `  - ${p.nomFichier}`).join('\n');
  const liste = (titre: string, n: number, pred: (p: PieceDuManifeste) => boolean): string =>
    n === 0 ? '' : `\n${titre} :\n${noms(pred)}\n`;
  return [
    'ARCHIVE DES JUSTIFICATIFS — FREEL',
    `Produite le ${manifeste.produiteLe}.`,
    '',
    'CONTENU',
    `- ${CHEMIN_FAITS} : les données de l’application (même contenu que la sauvegarde JSON).`,
    `- ${CHEMIN_MANIFESTE} : la liste des pièces, avec nom d’origine, empreinte, date de dépôt, fait rattaché et état.`,
    '- justificatifs/ : les pièces elles-mêmes.',
    '',
    'RANGEMENT',
    'justificatifs/<année du fait>/<depenses ou recettes>/<date> <fournisseur ou client> <montant>.<extension>',
    'L’année est celle de la dépense ou de la recette, pas celle du dépôt. Les pièces sans date sont sous « sans-date ».',
    'Les pièces rattachées à aucun fait existant sont sous justificatifs/sans-fait/, nommées d’après leur date de dépôt.',
    '',
    'EMPREINTE',
    'L’empreinte SHA-256 de chaque pièce, relevée à son dépôt, permet de vérifier que le fichier n’a pas changé depuis. Elle ne remplace ni l’original ni un archivage à valeur probante.',
    '',
    'CONSERVATION',
    `Pièces justificatives et livre des recettes se conservent au moins ${enLettres(ANNEES_CONSERVATION.valeur)} ans (livre des procédures fiscales, art. L102 B) ; ${enLettres(ANNEES_CONSERVATION.activiteCommerciale.valeur)} ans pour les documents comptables d’une activité commerciale (code de commerce, art. L123-22). Le délai court à partir du document ou de la dernière opération, pas de la date de dépôt dans l’application.`,
    '',
    'BILAN',
    `${bilan.pieces} pièce(s), dont ${bilan.alterees} altérée(s), ${bilan.illisibles} illisible(s), ${bilan.orphelines} orpheline(s).`,
    'Une pièce altérée a une empreinte qui ne correspond plus à celle du dépôt : elle est incluse, mais son contenu a changé.',
    'Une pièce illisible n’a pas pu être lue dans le stockage : elle n’est pas incluse.',
    liste('Pièces altérées', bilan.alterees, (p) => p.etat === 'alteree')
      + liste('Pièces illisibles', bilan.illisibles, (p) => p.etat === 'illisible')
      + liste('Pièces orphelines', bilan.orphelines, (p) => p.orpheline)
  ].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ── Construction ────────────────────────────────────────────────────────

export async function construireArchive(
  faits: Faits, stockage: StockageJustificatifs, maintenant: Date
): Promise<{ readonly archive: Blob; readonly bilan: BilanArchive; readonly manifeste: Manifeste }> {
  const metas = await stockage.lister();
  const pieces: PieceDuManifeste[] = [];
  const pris = new Set<string>([CHEMIN_FAITS, CHEMIN_MANIFESTE, CHEMIN_LISEZMOI].map((c) => c.toLowerCase()));
  let octets = 0;
  let manifeste: Manifeste | null = null;
  let bilan: BilanArchive | null = null;
  const encodeur = new TextEncoder();
  const texte = (nom: string, s: string): EntreeZip =>
    ({ nom, contenu: new Blob([encodeur.encode(s)]), date: maintenant });

  async function* entrees(): AsyncGenerator<EntreeZip> {
    yield texte(CHEMIN_FAITS, JSON.stringify(faits, null, 2));

    for (const meta of metas) {
      const fait = resoudreFait(faits, meta.fait.nature, meta.fait.id);
      const base = {
        id: meta.id, nomFichier: meta.nomFichier, typeMime: meta.typeMime,
        taille: meta.taille, empreinte: meta.empreinte, deposeLe: meta.deposeLe,
        fait: { nature: meta.fait.nature, id: meta.fait.id },
        dateDuFait: fait?.date ?? null,
        libelleDuFait: fait?.libelle ?? null,
        orpheline: fait === null
      };
      let contenu: Blob | null = null;
      try {
        contenu = (await stockage.lire(meta.id))?.contenu ?? null;
      } catch {
        contenu = null;
      }
      let etat: EtatPiece = 'illisible';
      if (contenu !== null) {
        try {
          etat = (await empreinteDe(contenu)) === meta.empreinte ? 'intacte' : 'alteree';
        } catch {
          contenu = null;
        }
      }
      if (contenu === null) {
        pieces.push({ ...base, chemin: null, etat: 'illisible' });
        continue;
      }
      const chemin = cheminDe(meta, fait, pris);
      pieces.push({ ...base, chemin, etat });
      octets += contenu.size;
      yield { nom: chemin, contenu, date: maintenant };
    }

    manifeste = {
      format: FORMAT_ARCHIVE, application: 'FREEL',
      produiteLe: maintenant.toISOString(), pieces
    };
    bilan = {
      pieces: pieces.length,
      alterees: pieces.filter((p) => p.etat === 'alteree').length,
      illisibles: pieces.filter((p) => p.etat === 'illisible').length,
      orphelines: pieces.filter((p) => p.orpheline).length,
      octets
    };
    yield texte(CHEMIN_MANIFESTE, JSON.stringify(manifeste, null, 2));
    yield texte(CHEMIN_LISEZMOI, lisezmoi(manifeste, bilan));
  }

  const archive = await ecrireZip(entrees());
  // Le générateur a nécessairement été mené à son terme par ecrireZip.
  return { archive, bilan: bilan!, manifeste: manifeste! };
}

// ── Lecture ─────────────────────────────────────────────────────────────

export interface ArchiveLue {
  readonly manifeste: Manifeste;
  /** Le bloc de faits, brut : sa validation appartient à `adopterFaitsDistants`. */
  readonly faits: unknown;
}

const PAS_UNE_ARCHIVE = 'Ce fichier ZIP n’est pas une archive de l’application.';
const TROP_RECENTE =
  'Cette archive vient d’une version plus récente de l’application : mets l’application à jour avant de la restaurer.';

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const estTexte = (v: unknown): v is string => typeof v === 'string';
const estTexteOuNul = (v: unknown): v is string | null => v === null || typeof v === 'string';

function pieceValide(p: unknown): p is PieceDuManifeste {
  if (!estObjet(p)) return false;
  const fait = p['fait'];
  return estTexte(p['id']) && estTexte(p['nomFichier']) && estTexte(p['typeMime'])
    && typeof p['taille'] === 'number' && Number.isFinite(p['taille'])
    && estTexte(p['empreinte']) && estTexte(p['deposeLe'])
    && estObjet(fait) && (fait['nature'] === 'depense' || fait['nature'] === 'recette')
    && estTexte(fait['id'])
    && estTexteOuNul(p['chemin']) && estTexteOuNul(p['dateDuFait'])
    && estTexteOuNul(p['libelleDuFait'])
    && (p['etat'] === 'intacte' || p['etat'] === 'alteree' || p['etat'] === 'illisible')
    && typeof p['orpheline'] === 'boolean';
}

async function jsonDe(entree: EntreeLue): Promise<unknown> {
  try {
    return JSON.parse(await (await entree.lire()).text());
  } catch (e) {
    if (e instanceof ErreurArchive) throw e;
    throw new ErreurArchive(`« ${entree.nom} » n’est pas un JSON valide.`);
  }
}

export async function lireArchive(
  fichier: Blob
): Promise<ArchiveLue & { readonly entrees: ReadonlyMap<string, EntreeLue> }> {
  const liste = await lireZip(fichier);
  const entrees = new Map(liste.map((e) => [e.nom, e] as const));
  const eManifeste = entrees.get(CHEMIN_MANIFESTE);
  const eFaits = entrees.get(CHEMIN_FAITS);
  if (!eManifeste || !eFaits) throw new ErreurArchive(PAS_UNE_ARCHIVE);

  const brut = await jsonDe(eManifeste);
  if (!estObjet(brut) || typeof brut['format'] !== 'number') {
    throw new ErreurArchive(PAS_UNE_ARCHIVE);
  }
  if (brut['format'] > FORMAT_ARCHIVE) throw new ErreurArchive(TROP_RECENTE);
  if (brut['format'] !== FORMAT_ARCHIVE || brut['application'] !== 'FREEL'
      || !estTexte(brut['produiteLe']) || !Array.isArray(brut['pieces'])
      || !brut['pieces'].every(pieceValide)) {
    throw new ErreurArchive(PAS_UNE_ARCHIVE);
  }
  const faits = await jsonDe(eFaits);
  return { manifeste: brut as unknown as Manifeste, faits, entrees };
}

/** Pièces présentes ici dont le fait n'existera plus après adoption de `faitsApres`. */
export function orphelinesApres(metas: readonly MetaJustificatif[], faitsApres: unknown): number {
  const ids = (cle: string): Set<string> => {
    const liste = estObjet(faitsApres) ? faitsApres[cle] : undefined;
    return new Set(
      Array.isArray(liste)
        ? liste.filter(estObjet).map((x) => x['id']).filter(estTexte)
        : []
    );
  };
  const depenses = ids('depenses');
  const recettes = ids('recettes');
  return metas.filter((m) =>
    !(m.fait.nature === 'depense' ? depenses : recettes).has(m.fait.id)).length;
}

// ── Restauration ────────────────────────────────────────────────────────

export interface BilanRestauration {
  readonly ajoutees: number;
  readonly dejaPresentes: number;
  readonly refusees: readonly { readonly nomFichier: string; readonly motif: string }[];
}

export async function restaurerPieces(
  archive: Awaited<ReturnType<typeof lireArchive>>, stockage: StockageJustificatifs
): Promise<BilanRestauration> {
  let ajoutees = 0;
  let dejaPresentes = 0;
  const refusees: { nomFichier: string; motif: string }[] = [];

  for (const p of archive.manifeste.pieces) {
    const refuser = (motif: string): void => { refusees.push({ nomFichier: p.nomFichier, motif }); };
    try {
      if (p.chemin === null) {
        refuser('pièce illisible au moment de l’archive : rien à restaurer.');
        continue;
      }
      const entree = archive.entrees.get(p.chemin);
      if (!entree) { refuser('absente de l’archive.'); continue; }
      const contenu = await entree.lire();
      if ((await empreinteDe(contenu)) !== p.empreinte) {
        // Couvre deux cas distincts : un fichier modifié depuis l'archive, et
        // une pièce déjà altérée dans le stockage au moment de l'archive.
        refuser(p.etat === 'alteree'
          ? 'modifiée depuis l’archive : elle était déjà altérée au moment de l’archive, son empreinte ne correspond plus à celle du dépôt.'
          : 'modifiée depuis l’archive : son empreinte ne correspond plus à celle du manifeste.');
        continue;
      }
      const existante = await stockage.lire(p.id);
      if (existante !== null) {
        if (existante.empreinte === p.empreinte) { dejaPresentes++; }
        else { refuser('une autre pièce porte déjà cet identifiant ; l’existante est conservée.'); }
        continue;
      }
      await stockage.deposer({
        id: p.id, nomFichier: p.nomFichier, typeMime: p.typeMime, taille: p.taille,
        empreinte: p.empreinte, deposeLe: p.deposeLe,
        fait: { nature: p.fait.nature, id: p.fait.id },
        contenu: new Blob([contenu], { type: p.typeMime })
      });
      ajoutees++;
    } catch (e) {
      refuser(e instanceof Error ? e.message : 'lecture impossible.');
    }
  }
  return { ajoutees, dejaPresentes, refusees };
}
