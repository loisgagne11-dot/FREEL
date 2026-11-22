/**
 * Génère les icônes PNG de Freel depuis le dessin SVG validé le 22/11 (piste 1,
 * « le f »).
 *
 *   cd app && node scripts/generer-icones.mjs
 *
 * Le SVG fait foi : `public/favicon.svg`. Si le dessin change, on change ce
 * fichier et on relance ce script — on ne retouche jamais un PNG à la main, il
 * cesserait de dire la même chose que l'onglet.
 *
 * Deux variantes, et la différence n'est pas cosmétique :
 *   · tuile ARRONDIE, coins transparents (icônes « any », 192 et 512) : c'est
 *     ce que montrent un onglet, un lanceur de bureau ;
 *   · tuile PLEINE, sans arrondi (apple-touch-icon 180, « maskable » 512).
 *     iOS arrondit lui-même l'icône et peint en NOIR tout coin transparent :
 *     la tuile arrondie y aurait des écoinçons sombres. Android découpe
 *     l'icône masquable selon sa propre forme : des coins transparents y
 *     laisseraient voir le fond du lanceur. Le dessin tient déjà dans la zone
 *     sûre (cercle de rayon 40 % centré), d'où aucune mise à l'échelle.
 *
 * Rendu par le Chromium de Playwright déjà installé : le SVG est posé à la
 * taille exacte dans une page, puis capturé à l'échelle 1 sur fond transparent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const arrondie = readFileSync(join(publicDir, 'favicon.svg'), 'utf8').trim();
// La variante pleine se DÉDUIT de la source : deux fichiers à tenir à la main
// finiraient par ne plus porter le même dessin.
const pleine = arrondie.replace(' rx="22"', '');
if (pleine === arrondie) {
  throw new Error('favicon.svg ne porte plus rx="22" : la variante pleine ne peut pas être déduite.');
}

const sorties = [
  { fichier: 'icone-192.png', taille: 192, svg: arrondie },
  { fichier: 'icone-512.png', taille: 512, svg: arrondie },
  { fichier: 'icone-180.png', taille: 180, svg: pleine },
  { fichier: 'icone-masquable-512.png', taille: 512, svg: pleine }
];

// Le Chromium préinstallé, par son lien stable, comme verifier-responsive.mjs :
// le paquet Playwright du projet attend une autre version, qu'il n'y a pas lieu
// de télécharger.
const CHROMIUM_FOURNI = '/opt/pw-browsers/chromium';
const navigateur = await chromium.launch(existsSync(CHROMIUM_FOURNI) ? { executablePath: CHROMIUM_FOURNI } : {});
try {
  const page = await navigateur.newPage({ deviceScaleFactor: 1, viewport: { width: 600, height: 600 } });
  for (const { fichier, taille, svg } of sorties) {
    const dimensionne = svg.replace('<svg ', `<svg width="${taille}" height="${taille}" `);
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${dimensionne}</body></html>`
    );
    await page.screenshot({
      path: join(publicDir, fichier),
      clip: { x: 0, y: 0, width: taille, height: taille },
      omitBackground: true
    });
    console.log(`${fichier} (${taille}×${taille})`);
  }
} finally {
  await navigateur.close();
}
