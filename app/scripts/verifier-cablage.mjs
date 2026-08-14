/**
 * Inventaire du câblage : aucune action du magasin ne doit être injoignable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE SCRIPT REND IMPOSSIBLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `encaisserRecette` était écrite, commentée, couverte par des tests de magasin
 * qui passaient — et aucun écran ne l'appelait. On pouvait émettre une facture
 * et jamais enregistrer son règlement : le chiffre d'affaires encaissé restait
 * figé, et toute la chaîne en aval (provisions, disponible, versable) était
 * fausse par construction. Trois autres actions étaient dans le même cas.
 *
 * Aucun contrôle du projet ne pouvait le voir, et ce n'est pas un hasard :
 *
 *  · les tests unitaires appellent la fonction directement — c'est leur travail ;
 *  · le typage est satisfait : une action non appelée est du code valide ;
 *  · le vérificateur responsive charge les écrans mais ne clique nulle part ;
 *  · la couverture, si elle existait, compterait ces lignes comme couvertes.
 *
 * Le journal en a tiré une règle — « une action du magasin est une promesse
 * d'interface » — et une commande à lancer à la main. Une règle qu'on doit
 * penser à appliquer n'est pas une règle : c'est ce script.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL VÉRIFIE, ET CE QU'IL NE PEUT PAS VÉRIFIER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Il vérifie qu'un CHEMIN existe entre l'interface et chaque action. Il ne
 * vérifie pas que ce chemin soit atteignable par un utilisateur : un bouton
 * derrière une condition toujours fausse le satisferait. C'est le rôle des
 * tests d'écran, qui cliquent réellement.
 *
 * Il est donc un plancher, pas une preuve — mais un plancher qui aurait
 * attrapé les cinq occurrences connues à ce jour.
 *
 * Usage : node scripts/verifier-cablage.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const RACINE = new URL('../src/', import.meta.url).pathname;
const MAGASIN = join(RACINE, 'state/store.ts');

/**
 * Les fichiers susceptibles d'appeler une action, tests exclus.
 *
 * Tout `src/` sauf le magasin lui-même : une porte d'entrée n'est pas
 * forcément un écran — `initialiser` est appelée par `App.tsx`, qui est à la
 * racine et pas sous `ui/`. Restreindre à `ui/` l'aurait déclarée orpheline à
 * tort, et un faux positif dans un garde-fou est le plus sûr moyen qu'on cesse
 * de le lire.
 *
 * Les tests sont écartés : un test n'est pas une porte d'entrée. C'est
 * précisément l'illusion qu'on cherche à dissiper — les quatre actions mortes
 * du 13/08 étaient toutes couvertes par des tests de magasin qui passaient.
 */
async function fichiersAppelants(dossier) {
  const trouves = [];
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) {
      trouves.push(...await fichiersAppelants(chemin));
    } else if (
      /\.(ts|tsx)$/u.test(entree.name)
      && !/\.test\.tsx?$/u.test(entree.name)
      && chemin !== MAGASIN
    ) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

/**
 * Les actions déclarées par l'interface du magasin.
 *
 * On lit les `readonly nom: (…) => …` de la déclaration, pas les clés de
 * l'objet : la déclaration est le contrat, et c'est lui qui promet.
 */
function actionsDeclarees(source) {
  const actions = [];
  const motif = /^\s{2}readonly\s+([a-zA-Z][a-zA-Z0-9]*)\s*:\s*\(/gmu;
  let trouve;
  while ((trouve = motif.exec(source)) !== null) actions.push(trouve[1]);
  return actions;
}

const source = await readFile(MAGASIN, 'utf8');
const actions = actionsDeclarees(source);

if (actions.length === 0) {
  console.error('❌ Aucune action trouvée dans le magasin : le motif de lecture a dû changer.');
  process.exit(1);
}

const fichiers = await fichiersAppelants(RACINE);
const contenus = await Promise.all(fichiers.map((f) => readFile(f, 'utf8')));

const orphelines = [];
for (const action of actions) {
  const motif = new RegExp(`\\b${action}\\b`, 'u');
  if (!contenus.some((c) => motif.test(c))) orphelines.push(action);
}

console.log('\n🔌 Câblage des actions du magasin\n');
console.log(`   ${actions.length} actions déclarées · ${fichiers.length} fichiers lus\n`);

for (const action of actions) {
  if (!orphelines.includes(action)) console.log(`  ✅ ${action}`);
}
for (const action of orphelines) {
  console.log(`  ❌ ${action} — déclarée, jamais appelée depuis un écran`);
}

console.log(`\n${'═'.repeat(52)}`);
if (orphelines.length === 0) {
  console.log('✅ câblage : chaque action du magasin a une porte d’entrée');
  console.log('═'.repeat(52));
  process.exit(0);
}

console.log(`❌ ${orphelines.length} action(s) sans porte d’entrée :`);
for (const action of orphelines) console.log(`   · ${action}`);
console.log('');
console.log('   Une action du magasin est une promesse d’interface. Soit on câble');
console.log('   l’écran, soit on retire l’action — une troisième voie n’existe pas :');
console.log('   du code juste et inatteignable coûte le prix du code faux, sans');
console.log('   qu’aucun test ne le signale.');
console.log('═'.repeat(52));
process.exit(1);
