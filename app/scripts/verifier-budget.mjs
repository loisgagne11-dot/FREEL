/**
 * Budget de performance, vérifié poste par poste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SCRIPT REMPLACE UN SEUIL UNIQUE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le projet s'était donné un plafond de 250 Ko sur le paquet d'entrée. La
 * mesure a montré ce que ce chiffre recouvrait vraiment : 192 Ko de React et
 * 55 Ko de code applicatif. Le seuil surveillait donc surtout une dépendance
 * qui ne bouge pas, et laissait le code du projet grossir sans que personne
 * s'en aperçoive — jusqu'au jour où l'ensemble frôle la limite d'un coup.
 *
 * Séparer les deux change deux choses :
 *
 *  1. **La mesure devient informative.** 55 Ko de code applicatif est un
 *     chiffre sur lequel on peut agir ; 248 Ko d'un mélange ne l'est pas.
 *  2. **Le cache du navigateur travaille.** React ne change pas d'un
 *     déploiement à l'autre. Dans un paquet unique, modifier une ligne
 *     invalidait 248 Ko ; séparé, elle n'en invalide que 55.
 *
 * Le total réellement téléchargé au premier rendu reste vérifié : c'est lui
 * que l'utilisateur attend, et le découpage ne le réduit pas.
 */

import { readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ASSETS = new URL('../dist/assets/', import.meta.url).pathname;

/**
 * Les budgets, et ce que chacun protège.
 *
 * Ils sont volontairement proches des valeurs constatées : un budget confortable
 * ne signale rien tant qu'il n'est pas trop tard. Celui du code applicatif laisse
 * la place d'un écran supplémentaire, pas de trois.
 */
const BUDGETS = [
  {
    nom: 'code applicatif (entrée)',
    motif: 'ce qui est réécrit à chaque déploiement — le seul poste sur lequel on agit',
    correspond: (f) => f.startsWith('index-') && f.endsWith('.js'),
    maxKo: 80
  },
  {
    nom: 'bibliothèques (vendor)',
    motif: 'React et Zustand ; une hausse ici signale une dépendance ajoutée',
    correspond: (f) => f.startsWith('vendor-') && f.endsWith('.js'),
    maxKo: 200
  },
  {
    nom: 'écran différé le plus lourd',
    motif: 'un écran n’est téléchargé qu’à l’ouverture ; au-delà, l’attente se voit',
    correspond: (f) =>
      f.endsWith('.js') && !f.startsWith('index-') && !f.startsWith('vendor-'),
    agregation: 'max',
    maxKo: 40
  },
  {
    nom: 'premier rendu (entrée + vendor + CSS d’entrée)',
    motif: 'ce que l’utilisateur attend avant de voir quoi que ce soit',
    correspond: (f) =>
      (f.startsWith('index-') || f.startsWith('vendor-')) &&
      (f.endsWith('.js') || f.endsWith('.css')),
    maxKo: 280
  }
];

const echecs = [];
const ko = (octets) => Math.round((octets / 1024) * 100) / 100;

const fichiers = await readdir(ASSETS);
const tailles = new Map();
for (const f of fichiers) {
  const chemin = join(ASSETS, f);
  const info = await stat(chemin);
  if (!info.isFile()) continue;
  tailles.set(f, { brut: info.size, gzip: gzipSync(await readFile(chemin)).length });
}

console.log('\n📦 Budget de performance\n');

for (const budget of BUDGETS) {
  const concernes = [...tailles.entries()].filter(([f]) => budget.correspond(f));
  if (concernes.length === 0) {
    echecs.push(`${budget.nom} : aucun fichier ne correspond — le build a changé de forme.`);
    continue;
  }

  const total = budget.agregation === 'max'
    ? Math.max(...concernes.map(([, t]) => t.brut))
    : concernes.reduce((s, [, t]) => s + t.brut, 0);
  const gzip = budget.agregation === 'max'
    ? (concernes.find(([, t]) => t.brut === total)?.[1].gzip ?? 0)
    : concernes.reduce((s, [, t]) => s + t.gzip, 0);

  const conforme = ko(total) <= budget.maxKo;
  const marque = conforme ? '✅' : '❌';
  console.log(
    `  ${marque} ${budget.nom} — ${ko(total)} Ko (${ko(gzip)} Ko gzippé), `
    + `budget ${budget.maxKo} Ko`
  );
  console.log(`     ${budget.motif}`);
  if (!conforme) {
    echecs.push(`${budget.nom} : ${ko(total)} Ko dépasse le budget de ${budget.maxKo} Ko.`);
  }
}

console.log(`\n${'═'.repeat(52)}`);
if (echecs.length === 0) {
  console.log('✅ budget de performance : conforme');
} else {
  console.log(`❌ ${echecs.length} dépassement(s) :`);
  echecs.forEach((e) => console.log(`   · ${e}`));
  console.log(
    '\n   Avant de relever un budget : vérifier qu’un écran n’a pas été tiré\n'
    + '   dans l’entrée par un import partagé. C’est la cause la plus fréquente,\n'
    + '   et relever le plafond la masquerait.'
  );
}
console.log('═'.repeat(52));
process.exit(echecs.length > 0 ? 1 : 0);
