/**
 * Capture les maquettes de la direction visuelle en images.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SCRIPT EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `docs/design/direction/` porte les maquettes validées par le propriétaire le
 * 13/11 : ce sont elles, et plus le handoff, que le contrôle visuel compare à
 * l'application. Une maquette en HTML se LIT ; ce qu'on compare, c'est une
 * image. Les captures sont donc versionnées, et regénérées ici pour ne jamais
 * dériver du fichier dont elles sont tirées — une capture retouchée à la main
 * cesserait de dire la vérité sur la maquette.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SEUL THÈME PAR DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Quatre thèmes fois chaque écran pèseraient plusieurs mégaoctets dans le
 * dépôt pour montrer quatre fois la même mise en page. Le thème « calme » —
 * le préféré du propriétaire — est versionné pour chaque écran, et la planche
 * de référence l'est aussi en « nuit », pour qu'un thème sombre reste sous les
 * yeux. Les autres se produisent à la demande : `--mode=tous`.
 *
 * Les polices des maquettes viennent d'un CDN : sans réseau, la capture se
 * fait en police système et ne vaut rien. Le script le dit au lieu de produire
 * une image fausse en silence.
 *
 * Usage : node scripts/capturer-direction.mjs [--mode=calme|nuit|sombre|clair|tous]
 */

import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DOSSIER = resolve(import.meta.dirname, '../../docs/design/direction');
const SORTIE = join(DOSSIER, 'captures');
const MODES = ['calme', 'nuit', 'sombre', 'clair'];
// Le navigateur fourni par le bac à sable, quand il existe : la version de
// Playwright du projet n'y trouve pas le sien (même repli que verifier-bascule).
const CHROMIUM_FOURNI = '/opt/pw-browsers/chromium';

const demande = (process.argv.find((a) => a.startsWith('--mode=')) ?? '').slice('--mode='.length);
if (demande !== '' && demande !== 'tous' && !MODES.includes(demande)) {
  console.error(`Mode inconnu : « ${demande} ». Attendu : ${MODES.join(', ')} ou tous.`);
  process.exit(1);
}

/** Les modes à produire pour une maquette donnée. */
function modesPour(nom) {
  if (demande === 'tous') return MODES;
  if (demande !== '') return [demande];
  return nom === 'planche' ? ['calme', 'nuit'] : ['calme'];
}

const maquettes = readdirSync(DOSSIER).filter((f) => f.endsWith('.html')).sort();
const navigateur = await chromium.launch(existsSync(CHROMIUM_FOURNI) ? { executablePath: CHROMIUM_FOURNI } : {});
let fautes = 0;

for (const fichier of maquettes) {
  const nom = fichier.replace(/\.html$/, '');
  for (const mode of modesPour(nom)) {
    // Fenêtre large : c'est la maquette qui fixe sa propre taille, et c'est
    // elle seule qui est photographiée, pas la fenêtre.
    const page = await navigateur.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(`file://${join(DOSSIER, fichier)}?mode=${mode}`);
    await page.waitForTimeout(1500);

    const police = await page.evaluate(() => document.fonts.check('16px "Hanken Grotesk"'));
    const debords = await page.evaluate(() => [...document.querySelectorAll('.e-card')]
      .filter((c) => c.scrollWidth > c.clientWidth + 1).length);
    if (!police) {
      console.error(`  ✗ ${nom} (${mode}) : police non chargée — capture non écrite.`);
      fautes += 1;
    } else {
      await page.locator('.ec').first().screenshot({ path: join(SORTIE, `${nom}-${mode}.png`) });
      // La taille est dite : c'est elle qu'on reporte sur la planche du canevas,
      // et une maquette qui grandit sans qu'on le voie cache ce qu'on a ajouté.
      const boite = await page.locator('.ec').first().boundingBox();
      const taille = boite === null ? '' : ` (${Math.round(boite.width)} × ${Math.round(boite.height)})`;
      console.log(`  ${debords === 0 ? '✓' : '✗'} ${nom}-${mode}.png${taille}${debords === 0 ? '' : ` — ${debords} carte(s) qui débordent`}`);
      fautes += debords === 0 ? 0 : 1;
    }
    await page.close();
  }
}

await navigateur.close();
process.exit(fautes === 0 ? 0 : 1);
