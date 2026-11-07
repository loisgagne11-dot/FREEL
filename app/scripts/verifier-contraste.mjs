/**
 * Contraste des jetons de couleur, calculé sur les quatre palettes.
 *
 * LE DÉFAUT QUE CE SCRIPT REND IMPOSSIBLE
 * Le thème « calme » portait `--green` à 3,2:1 et `--muted-2` à 4,0:1 sur leurs
 * fonds : lisibles à l'œil du concepteur, pas à celui d'un utilisateur fatigué
 * ou sur un écran en plein jour. Les tests et le typage ne voient aucune
 * couleur ; seul un calcul sur les jetons peut le dire.
 *
 * SEUILS (WCAG 2.1)
 *  · 1.4.3 « Contraste (minimum) » : 4,5:1 pour le texte courant ;
 *  · 1.4.11 « Contraste des éléments non textuels » : 3:1 pour les composants
 *    graphiques et les grands textes.
 * `--muted-2` et les accents (`--green`, `--amber`, `--red`) servent ici à du
 * TEXTE de 11 à 13 px (indices, étiquettes, montants en alerte), pas seulement
 * à des aplats : c'est 1.4.3 qui s'applique, donc 4,5:1. Le seuil de 3:1 de
 * 1.4.11 aurait laissé passer exactement les deux valeurs relevées en calme.
 * Pour les ramener à 3:1, il faudrait d'abord prouver qu'un jeton n'est jamais
 * employé en petit corps — et rien ne le garantit.
 *
 * Usage : node scripts/verifier-contraste.mjs
 */
import { readFile } from 'node:fs/promises';

const FICHIER = new URL('../src/styles/tokens.css', import.meta.url);

const SEUIL_TEXTE = 4.5;
const JETONS = {
  '--text': SEUIL_TEXTE,
  '--muted': SEUIL_TEXTE,
  '--muted-2': SEUIL_TEXTE,
  '--green': SEUIL_TEXTE,
  '--amber': SEUIL_TEXTE,
  '--red': SEUIL_TEXTE,
};
const FONDS = ['--bg', '--panel', '--card-a'];

/** Une palette = un bloc dont le sélecteur porte `data-theme` (ou `:root` pour sombre). */
function lirePalettes(css) {
  const palettes = {};
  const blocs = css.matchAll(/([^{}]+)\{([^{}]*(?:\/\*[\s\S]*?\*\/[^{}]*)*)\}/g);
  for (const [, selecteur, corps] of blocs) {
    const nom = /data-theme="(\w+)"/.exec(selecteur)?.[1];
    if (!nom) continue;
    const jetons = {};
    for (const [, cle, valeur] of corps.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      jetons[cle] = valeur.trim();
    }
    palettes[nom] = jetons;
  }
  return palettes;
}

function resoudre(jetons, cle, profondeur = 0) {
  const v = jetons[cle];
  if (v === undefined) return undefined;
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref && profondeur < 5) return resoudre(jetons, ref[1], profondeur + 1);
  return v;
}

function rgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return undefined;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
}

function luminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const palettes = lirePalettes(await readFile(FICHIER, 'utf8'));
const attendues = ['sombre', 'nuit', 'clair', 'calme'];
const echecs = [];

for (const nom of attendues) {
  if (!palettes[nom]) {
    echecs.push(`palette « ${nom} » introuvable dans tokens.css : le contrôle ne peut pas la lire.`);
    continue;
  }
  for (const [jeton, seuil] of Object.entries(JETONS)) {
    for (const fond of FONDS) {
      const c = rgb(resoudre(palettes[nom], jeton));
      const f = rgb(resoudre(palettes[nom], fond));
      if (!c || !f) {
        // Une couleur non hexadécimale échapperait au calcul : mieux vaut refuser que se taire.
        echecs.push(`${nom} : ${jeton} ou ${fond} n'est pas une couleur #rrggbb lisible.`);
        continue;
      }
      const r = ratio(c, f);
      if (r < seuil) {
        echecs.push(`${nom} : ${jeton} sur ${fond} = ${r.toFixed(2)}:1 (minimum ${seuil}:1). Éclaircis ou assombris ${jeton} dans src/styles/tokens.css.`);
      }
    }
  }
}

if (echecs.length > 0) {
  console.error('✗ Contraste insuffisant :\n' + echecs.map((e) => '  · ' + e).join('\n'));
  process.exit(1);
}
console.log(`✓ Contraste : ${Object.keys(JETONS).length} jetons × ${FONDS.length} fonds × ${attendues.length} palettes, tous au-dessus du seuil.`);
