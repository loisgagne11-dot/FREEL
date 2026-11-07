/**
 * Aucun octet nul dans les sources.
 *
 * LE DÉFAUT : un éditeur ou un outil de remplacement peut glisser un `\0` dans un
 * fichier texte. Git le traite alors comme binaire (plus de diff lisible en
 * revue), certains outils tronquent à cet octet — et le fichier compile ou non
 * selon la machine. Rien d'autre dans la chaîne ne regarde les octets bruts.
 *
 * Usage : node scripts/verifier-octets-nuls.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const RACINE = new URL('..', import.meta.url).pathname;
const DOSSIERS = ['src', 'scripts'];
// Les fichiers binaires légitimes ne vivent pas dans ces dossiers ; si l'un
// arrive (police, image), l'ajouter ici avec sa raison plutôt qu'élargir.
const EXTENSIONS_BINAIRES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf']);

async function* parcourir(dossier) {
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) yield* parcourir(chemin);
    else yield chemin;
  }
}

const fautifs = [];
let lus = 0;
for (const d of DOSSIERS) {
  for await (const f of parcourir(join(RACINE, d))) {
    if (EXTENSIONS_BINAIRES.has(f.slice(f.lastIndexOf('.')).toLowerCase())) continue;
    lus++;
    const octets = await readFile(f);
    const i = octets.indexOf(0);
    if (i !== -1) fautifs.push(`${relative(RACINE, f)} (octet nul à la position ${i})`);
  }
}

if (fautifs.length > 0) {
  console.error('✗ Octet nul dans des fichiers texte :\n' + fautifs.map((f) => '  · ' + f).join('\n') +
    '\n  Supprime l\'octet (par exemple : tr -d \'\\000\' < fichier > propre && mv propre fichier) et relis le fichier.');
  process.exit(1);
}
console.log(`✓ Octets nuls : ${lus} fichiers de src/ et scripts/, aucun.`);
