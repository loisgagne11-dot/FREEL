/**
 * Vérification du rattrapage d'un `index.html` périmé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA PANNE QU'ON REPRODUIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les fichiers construits portent une empreinte dans leur nom, et le
 * déploiement supprime les anciens. Un navigateur qui a gardé en cache
 * l'`index.html` précédent réclame donc un script qui n'existe plus. La
 * requête échoue, React ne monte jamais, et l'utilisateur voit une page noire
 * — sans message, sans rien à faire d'autre que deviner qu'il faut vider son
 * cache. C'est arrivé le 12/08, après un déploiement.
 *
 * Le rattrapage vit dans `index.html` : sur échec de chargement d'un script,
 * la page est redemandée avec un paramètre neuf, ce qui force un `index.html`
 * frais. Écrire ce filet sans le tendre ne prouverait rien — d'où ce
 * vérificateur, qui sert réellement un `index.html` périmé.
 *
 * Ce qui est vérifié :
 *   1. un index périmé aboutit malgré tout à une application montée ;
 *   2. la barre d'adresse est nettoyée du paramètre de rattrapage ;
 *   3. une panne DURABLE ne boucle pas — deux requêtes de page, pas trente.
 *
 * Usage : node scripts/verifier-index-perime.mjs
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const RACINE = new URL('../dist/', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json'
};

const echecs = [];
const constate = (ok, message) => {
  console.log(`  ${ok ? '✅' : '❌'} ${message}`);
  if (!ok) echecs.push(message);
};

const indexReel = await readFile(join(RACINE, 'index.html'), 'utf8');

/** Le nom du module d'entrée, tel que l'index construit le référence. */
const entree = /src="\.\/assets\/(index-[^"]+\.js)"/.exec(indexReel)?.[1];
if (entree === undefined) {
  console.log('❌ module d’entrée introuvable dans dist/index.html — build absent ?');
  process.exit(1);
}

/**
 * Sert le site en simulant un `index.html` périmé.
 *
 * `perimeJusqua` compte les pages servies avec l'ancienne référence. Au-delà,
 * le serveur rend l'index réel : c'est ce que fait un vrai serveur une fois le
 * cache du navigateur contourné.
 */
function servir({ perimeJusqua }) {
  let pagesServies = 0;
  const ancienNom = 'index-PERIME000.js';

  const serveur = createServer(async (requete, reponse) => {
    const url = new URL(requete.url ?? '/', 'http://localhost');
    const relatif = url.pathname === '/' ? 'index.html' : normalize(url.pathname).replace(/^([/\\])+/, '');

    if (relatif === 'index.html') {
      pagesServies += 1;
      const perime = pagesServies <= perimeJusqua;
      const corps = perime ? indexReel.replace(entree, ancienNom) : indexReel;
      reponse.writeHead(200, { 'Content-Type': TYPES['.html'] });
      reponse.end(corps);
      return;
    }
    // Le fichier périmé n'existe plus : c'est tout le propos.
    if (relatif.endsWith(ancienNom)) {
      reponse.writeHead(404).end('supprimé au déploiement');
      return;
    }
    try {
      const contenu = await readFile(join(RACINE, relatif));
      reponse.writeHead(200, { 'Content-Type': TYPES[extname(relatif)] ?? 'application/octet-stream' });
      reponse.end(contenu);
    } catch {
      reponse.writeHead(404).end('introuvable');
    }
  });

  return new Promise((resoudre) => {
    serveur.listen(0, '127.0.0.1', () => resoudre({
      serveur,
      port: serveur.address().port,
      pages: () => pagesServies
    }));
  });
}

const BIN = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navigateur = await chromium.launch(existsSync(BIN) ? { executablePath: BIN } : {});

/* ── 1. Un index périmé se rattrape ────────────────────────────────────── */

console.log('\n🔁 index.html périmé, une seule fois (le cas réel du 12/08)');
{
  const { serveur, port, pages } = await servir({ perimeJusqua: 1 });
  const page = await navigateur.newPage();
  await page.goto(`http://127.0.0.1:${port}/#/pilote`);

  let monte = true;
  try {
    await page.waitForSelector('h1', { timeout: 10000 });
  } catch {
    monte = false;
  }

  constate(monte, 'l’application finit par se monter malgré l’index périmé');
  constate(pages() === 2, `la page est redemandée une fois, pas plus (${pages()} requêtes)`);
  constate(
    !page.url().includes('freel-recharge'),
    `le paramètre de rattrapage est retiré de l’adresse (${page.url().split('/').pop()})`
  );
  // Le fragment porte l'écran courant : le perdre renverrait l'utilisateur
  // ailleurs que là où il était.
  constate(page.url().endsWith('#/pilote'), 'l’écran demandé est conservé');

  await page.close();
  serveur.close();
}

/* ── 2. Une panne durable ne boucle pas ────────────────────────────────── */

console.log('\n🛑 panne durable : le rattrapage ne doit pas tourner en rond');
{
  const { serveur, port, pages } = await servir({ perimeJusqua: Number.POSITIVE_INFINITY });
  const page = await navigateur.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  // Largement de quoi voir une boucle s'installer si elle existait.
  await page.waitForTimeout(3000);

  constate(
    pages() <= 2,
    `au plus une seconde tentative, puis arrêt (${pages()} requêtes de page)`
  );

  await page.close();
  serveur.close();
}

await navigateur.close();

console.log(`\n${'═'.repeat(52)}`);
if (echecs.length === 0) {
  console.log('✅ rattrapage d’un index.html périmé : conforme');
} else {
  console.log(`❌ ${echecs.length} échec(s) :`);
  echecs.forEach((e) => console.log(`   · ${e}`));
}
console.log('═'.repeat(52));
process.exit(echecs.length > 0 ? 1 : 0);
