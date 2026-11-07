/**
 * Pas de vouvoiement dans les chaînes affichées par `src/ui/`.
 *
 * LE DÉFAUT : la passe de tutoiement (31 fichiers) a été faite d'un coup et
 * relue à l'œil ; il en restait trois (« choisissez », « ajoutez-en »,
 * « modifiez … laissez »). Un `vous` ou un impératif en -ez ne se distinguent
 * par aucune expression régulière sur le fichier brut sans ramasser les
 * commentaires — qui parlent légitimement de « Veuillez renseigner ce champ »
 * pour l'écarter. On analyse donc l'arbre syntaxique : seuls les littéraux
 * de chaîne et le texte JSX comptent, jamais un commentaire.
 *
 * Hors périmètre à dessein : `src/domain/calculs/relance.ts`, dont les lettres
 * partent chez le client et vouvoient (voir CLAUDE.md).
 *
 * Usage : node scripts/verifier-tutoiement.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ts from 'typescript';

const RACINE = new URL('..', import.meta.url).pathname;

// Mots en -ez qui ne sont pas des formes de vouvoiement.
const MOTS_INNOCENTS = new Set(['chez', 'assez', 'nez', 'rez', 'lez']);

/**
 * Exceptions : { fichier, mot, raison }. Vide aujourd'hui. Un faux positif
 * légitime (citation, nom propre) s'ajoute ici avec sa raison, jamais en
 * affaiblissant l'expression.
 */
const EXCEPTIONS = [];

const MOTIF = /(?<![\p{L}\p{N}_-])(vous|vôtre|votre|vos|vôtres|[\p{L}]{2,}ez)(?![\p{L}\p{N}_])/giu;

async function* parcourir(dossier) {
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) yield* parcourir(chemin);
    else yield chemin;
  }
}

function litteraux(source, nom) {
  const sf = ts.createSourceFile(nom, source, ts.ScriptTarget.Latest, true, nom.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const trouves = [];
  const visiter = (n) => {
    if (
      ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)
    ) {
      // Les imports (`from 'x-ez'`) ne sont pas affichés.
      if (!(ts.isStringLiteral(n) && (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent)))) {
        trouves.push({ texte: n.text ?? '', ligne: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return trouves;
}

const fautes = [];
let lus = 0;
for await (const f of parcourir(join(RACINE, 'src/ui'))) {
  if (!/\.tsx?$/.test(f) || /\.test\.tsx?$/.test(f)) continue;
  lus++;
  const rel = relative(RACINE, f);
  for (const { texte, ligne } of litteraux(await readFile(f, 'utf8'), f)) {
    for (const [, mot] of texte.matchAll(MOTIF)) {
      if (MOTS_INNOCENTS.has(mot.toLowerCase())) continue;
      if (EXCEPTIONS.some((x) => x.fichier === rel && x.mot.toLowerCase() === mot.toLowerCase())) continue;
      fautes.push(`${rel}:${ligne} « ${mot} »`);
    }
  }
}

if (fautes.length > 0) {
  console.error('✗ Vouvoiement dans des chaînes affichées (l\'application tutoie) :\n' +
    fautes.map((f) => '  · ' + f).join('\n') +
    '\n  Passe la phrase au tutoiement (« Saisis », « Clique », « ton / ta / tes »). Si le mot est légitime, ajoute-le à EXCEPTIONS dans scripts/verifier-tutoiement.mjs avec sa raison.');
  process.exit(1);
}
console.log(`✓ Tutoiement : ${lus} fichiers de src/ui/, aucun vouvoiement dans les chaînes affichées.`);
