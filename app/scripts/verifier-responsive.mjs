/**
 * Vérification responsive automatisée.
 *
 * Cette vérification existe parce que la promesse « PC et mobile » doit être
 * VÉRIFIABLE et non déclarative. L'ancienne version affirmait être responsive
 * tout en recalculant ses grilles en JavaScript, avec un bug jamais détecté :
 * élargir la fenêtre au-delà de 600 px ne les restaurait plus. Une capture
 * d'écran de complaisance n'aurait rien montré ; une assertion, oui.
 *
 * Ce qui est vérifié, sur chaque taille et chaque palette :
 *   1. aucun débordement horizontal de la page ;
 *   2. le rail est latéral en desktop et le dock flottant en portrait ;
 *   3. les cibles tactiles de navigation atteignent 44 px en portrait ;
 *   4. le thème est appliqué avant le premier rendu (pas de flash).
 *
 * Usage : node scripts/verifier-responsive.mjs [--captures]
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { mkdir } from 'node:fs/promises';

const RACINE = new URL('../dist/', import.meta.url).pathname;
const AVEC_CAPTURES = process.argv.includes('--captures');

const TAILLES = [
  { nom: 'mobile-390', largeur: 390, hauteur: 844, portrait: true },
  { nom: 'mobile-360', largeur: 360, hauteur: 740, portrait: true },
  { nom: 'tablette-760', largeur: 760, hauteur: 1024, portrait: true },
  { nom: 'desktop-1150', largeur: 1150, hauteur: 800, portrait: false },
  { nom: 'desktop-1440', largeur: 1440, hauteur: 900, portrait: false }
];

const PALETTES = ['sombre', 'nuit', 'clair', 'calme'];

/**
 * Les écrans réellement construits. Ne tester que l'accueil laissait les autres
 * hors contrôle : un débordement horizontal sur Argent, l'écran le plus dense,
 * n'aurait été vu par personne.
 */
const ECRANS = [
  { hash: '#/pilote', nom: 'pilote' },
  { hash: '#/argent', nom: 'argent' },
  { hash: '#/outils', nom: 'outils' }
];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

function servir() {
  const serveur = createServer(async (requete, reponse) => {
    const chemin = (requete.url ?? '/').split('?')[0];
    const relatif = chemin === '/' ? 'index.html' : normalize(chemin).replace(/^([/\\])+/, '');
    try {
      const contenu = await readFile(join(RACINE, relatif));
      reponse.writeHead(200, { 'Content-Type': TYPES[extname(relatif)] ?? 'application/octet-stream' });
      reponse.end(contenu);
    } catch {
      reponse.writeHead(404).end('introuvable');
    }
  });
  return new Promise((resoudre) => {
    serveur.listen(0, '127.0.0.1', () => resoudre({ serveur, port: serveur.address().port }));
  });
}

const echecs = [];
const constate = (ok, message) => {
  console.log(`  ${ok ? '✅' : '❌'} ${message}`);
  if (!ok) echecs.push(message);
};

const { serveur, port } = await servir();
const base = `http://127.0.0.1:${port}/`;
// Chromium est préinstallé dans l'environnement, à une version qui ne
// correspond pas forcément à celle attendue par le paquet Playwright. On
// pointe explicitement le binaire fourni au lieu d'en télécharger un autre.
const CHROMIUM_FOURNI = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { existsSync } = await import('node:fs');
const navigateur = await chromium.launch(
  existsSync(CHROMIUM_FOURNI) ? { executablePath: CHROMIUM_FOURNI } : {}
);

if (AVEC_CAPTURES) await mkdir(new URL('../captures/', import.meta.url).pathname, { recursive: true });

for (const taille of TAILLES) {
  console.log(`\n📐 ${taille.nom} (${taille.largeur}×${taille.hauteur})`);
  for (const palette of PALETTES) {
    const contexte = await navigateur.newContext({
      viewport: { width: taille.largeur, height: taille.hauteur }
    });
    // Le thème est posé AVANT le chargement, pour vérifier que le script
    // inline de `index.html` l'applique sans flash.
    await contexte.addInitScript((p) => {
      window.localStorage.setItem('freel-v111-theme', p);
    }, palette);

    const page = await contexte.newPage();

    for (const ecran of ECRANS) {
    await page.goto(base + ecran.hash, { waitUntil: 'networkidle' });
    // Les écrans autres que l'accueil sont chargés à la demande : on attend que
    // leur titre soit rendu, sinon on mesurerait l'écran d'attente.
    await page.waitForSelector('h1', { timeout: 10000 });

    const mesures = await page.evaluate(() => {
      const nav = document.querySelector('nav');
      const style = nav ? getComputedStyle(nav) : null;
      const liens = [...document.querySelectorAll('nav a')];
      const hauteurs = liens.map((a) => a.getBoundingClientRect().height);
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        largeurDocument: document.documentElement.scrollWidth,
        largeurFenetre: window.innerWidth,
        navPresente: nav !== null,
        navPosition: style?.position ?? null,
        nbLiens: liens.length,
        hauteurMiniLien: hauteurs.length > 0 ? Math.min(...hauteurs) : 0,
        contenuPresent: document.getElementById('contenu-principal') !== null,
        couleurFond: getComputedStyle(document.body).backgroundColor
      };
    });

    const prefixe = `[${palette}/${ecran.nom}]`;
    constate(mesures.theme === palette, `${prefixe} thème appliqué avant le rendu`);
    // Le point dur : zéro débordement horizontal. Une tolérance de 1 px
    // absorbe les arrondis de rendu, pas une colonne trop large.
    constate(
      mesures.largeurDocument <= mesures.largeurFenetre + 1,
      `${prefixe} aucun débordement horizontal (${mesures.largeurDocument} ≤ ${mesures.largeurFenetre})`
    );
    constate(mesures.navPresente && mesures.nbLiens === 6, `${prefixe} 6 onglets de navigation`);
    constate(mesures.contenuPresent, `${prefixe} contenu principal présent et ciblable`);

    if (taille.portrait) {
      constate(mesures.navPosition === 'fixed', `${prefixe} dock flottant en portrait`);
      constate(
        mesures.hauteurMiniLien >= 44,
        `${prefixe} cibles tactiles ≥ 44 px (${Math.round(mesures.hauteurMiniLien)} px)`
      );
    } else {
      constate(mesures.navPosition === 'static', `${prefixe} rail latéral en desktop`);
    }

    if (AVEC_CAPTURES) {
      await page.screenshot({
        path: new URL(`../captures/${taille.nom}-${palette}-${ecran.nom}.png`, import.meta.url).pathname
      });
    }
    }
    await contexte.close();
  }
}

await navigateur.close();
serveur.close();

console.log(`\n${'═'.repeat(52)}`);
if (echecs.length === 0) {
  console.log(
    `✅ ${TAILLES.length} tailles × ${PALETTES.length} palettes × ${ECRANS.length} écrans `
    + `= ${TAILLES.length * PALETTES.length * ECRANS.length} combinaisons : tout est conforme`
  );
} else {
  console.log(`❌ ${echecs.length} échec(s) :`);
  echecs.forEach((e) => console.log(`   · ${e}`));
}
console.log('═'.repeat(52));
process.exit(echecs.length > 0 ? 1 : 0);
