/**
 * Aucun composant de `src/ui/components/` sans importeur.
 *
 * LE DÉFAUT : `GrapheBarres` est resté, avec son CSS et ses tests, après que
 * `GrapheEvolution` l'a remplacé. Ses tests passaient, donc tout était vert :
 * un composant que seuls ses propres tests importent est du code mort qui
 * s'entretient tout seul. Les tests ne comptent donc pas comme importeurs.
 *
 * Limite : on cherche l'import par le nom de fichier. Un composant chargé par
 * un chemin construit dynamiquement échapperait au contrôle — le projet n'en
 * a pas, et en introduire un justifierait une exception explicite ici.
 *
 * Usage : node scripts/verifier-code-mort.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';

const RACINE = new URL('..', import.meta.url).pathname;
const COMPOSANTS = join(RACINE, 'src/ui/components');

/** Fichiers volontairement sans importeur : { fichier, raison }. */
const EXCEPTIONS = [];

async function* parcourir(dossier) {
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) yield* parcourir(chemin);
    else yield chemin;
  }
}

const sources = [];
for await (const f of parcourir(join(RACINE, 'src'))) {
  if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) sources.push([f, await readFile(f, 'utf8')]);
}

const morts = [];
let verifies = 0;
for await (const f of parcourir(COMPOSANTS)) {
  if (!/\.tsx$/.test(f) || /\.test\.tsx$/.test(f)) continue;
  const rel = relative(RACINE, f);
  if (EXCEPTIONS.some((x) => x.fichier === rel)) continue;
  verifies++;
  const nom = basename(f).replace(/\.tsx$/, '');
  const echappe = nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const importe = new RegExp(`['"][^'"\\n]*/${echappe}(\\.tsx?)?['"]`);
  if (!sources.some(([g, texte]) => g !== f && importe.test(texte))) morts.push(rel);
}

if (morts.length > 0) {
  console.error('✗ Composants que personne n\'importe (hors tests) :\n' + morts.map((m) => '  · ' + m).join('\n') +
    '\n  Supprime le composant, son .module.css et ses tests — ou branche-le. Si l\'absence d\'importeur est voulue, ajoute-le à EXCEPTIONS avec sa raison.');
  process.exit(1);
}
console.log(`✓ Code mort : ${verifies} composants, tous importés par du code hors tests.`);
