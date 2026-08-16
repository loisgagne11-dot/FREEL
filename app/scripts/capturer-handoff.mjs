/**
 * Capture le handoff de design en images.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SCRIPT EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le handoff produit avec Claude Design vit dans le dépôt sous forme de code
 * (`docs/design/handoff-v1.11/app/`). On peut le LIRE, ce qui donne les tokens,
 * les libellés et la structure — mais pas ce qu'un écran donne à voir : la
 * hiérarchie réelle, la forme des graphes, ce qui tient sur une ligne.
 *
 * Le résultat, `docs/design/captures/`, est la référence visuelle du projet.
 * Il est versionné pour qu'on puisse s'y référer sans relancer un navigateur,
 * et regénérable pour qu'il ne dérive jamais du handoff dont il est tiré.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EST SERVI, ET POURQUOI PAS EN `file://`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les écrans en JSX sont compilés dans le navigateur par Babel, qui va
 * chercher le `.jsx` en XHR. Sous `file://`, cette requête est bloquée par la
 * politique d'origine et l'écran reste vide — vide et sans erreur visible, ce
 * qui est le pire des cas. On sert donc le dossier en HTTP local.
 *
 * React, ReactDOM et Babel sont chargés depuis unpkg par les prototypes. Le
 * réseau du bac à sable ne les laisse pas passer depuis le navigateur : ils
 * sont téléchargés une fois dans un cache local et servis depuis là. Le dossier
 * de handoff n'est jamais modifié.
 *
 * Usage : node scripts/capturer-handoff.mjs [--theme=clair|sombre|les-deux]
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const RACINE = resolve(import.meta.dirname, '../..');
const HANDOFF = join(RACINE, 'docs/design/handoff-v1.11/app');
const SORTIE = join(RACINE, 'docs/design/captures');
const CACHE = join(RACINE, 'app/node_modules/.cache/handoff-cdn');
const PORT = 8788;

const DEPENDANCES = [
  ['react.js', 'https://unpkg.com/react@18.3.1/umd/react.development.js'],
  ['react-dom.js', 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js'],
  ['babel.js', 'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js']
];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css',
  '.js': 'application/javascript', '.jsx': 'text/babel', '.json': 'application/json'
};

/**
 * Les vues à capturer, par écran.
 *
 * `ouvrir` est une suite de libellés de boutons ou d'onglets à cliquer avant la
 * capture. Les panneaux et modales du handoff ne s'atteignent qu'ainsi, et ce
 * sont eux qui portent les écrans de saisie — la création de mission, la
 * facture, le CRA. S'en tenir aux pages d'accueil laisserait de côté la moitié
 * de la référence.
 */
const VUES = [
  { fichier: 'Pilote - Le Flux.html', nom: 'pilote' },
  { fichier: 'Pilote - Le Flux.html', nom: 'pilote-encaissements', ouvrir: ['Pointer un encaissement'] },
  { fichier: 'Pilote - Le Flux.html', nom: 'pilote-nouvelle-mission', ouvrir: ['Nouvelle mission'] },
  { fichier: 'Pilote - Le Flux.html', nom: 'pilote-depense', ouvrir: ['Ajouter une dépense'] },
  { fichier: 'Pilote - Le Flux.html', nom: 'pilote-nouvelle-facture', ouvrir: ['Nouvelle facture'] },
  { fichier: 'Pilote - Le Flux.html', nom: 'pilote-cra', ouvrir: ['Télécharger le CRA'] },
  { fichier: 'Activit#U00e9 - Plan de charge.html', nom: 'activite-plan-de-charge' },
  { fichier: 'Activit#U00e9 - Plan de charge.html', nom: 'activite-mois', ouvrir: ['Mois'] },
  { fichier: 'Activit#U00e9 - Plan de charge.html', nom: 'activite-missions', ouvrir: ['Missions'] },
  { fichier: 'Activit#U00e9 - Plan de charge.html', nom: 'activite-factures', ouvrir: ['Factures'] },
  { fichier: 'Activit#U00e9 - Plan de charge.html', nom: 'activite-clients', ouvrir: ['Clients'] },
  { fichier: 'Argent - Tr#U00e9sorerie & Performance.html', nom: 'argent-tresorerie' },
  { fichier: 'Argent - Tr#U00e9sorerie & Performance.html', nom: 'argent-performance', ouvrir: ['Performance'] },
  { fichier: 'Achats - Justificatifs & Banque.html', nom: 'achats' },
  { fichier: 'Outils - Simulateurs.html', nom: 'outils-impot' },
  { fichier: 'Outils - Simulateurs.html', nom: 'outils-banque', ouvrir: ['Compte pro & banque'] },
  { fichier: 'Outils - Simulateurs.html', nom: 'outils-cra', ouvrir: ['CRA'] },
  { fichier: 'Config.html', nom: 'config-profil' },
  { fichier: 'Config.html', nom: 'config-fiscal', ouvrir: ['Paramètres fiscaux'] },
  { fichier: 'Config.html', nom: 'config-reserve', ouvrir: ['Réserve & versements'] },
  { fichier: 'Config.html', nom: 'config-facturation', ouvrir: ['Facturation'] },
  { fichier: 'Config.html', nom: 'config-cloud', ouvrir: ['Compte & Cloud Sync'] },
  { fichier: 'Config.html', nom: 'config-donnees', ouvrir: ['Données & export'] },
  { fichier: 'Flux du mois - v6.html', nom: 'flux-du-mois' }
];

async function telecharger() {
  mkdirSync(CACHE, { recursive: true });
  for (const [nom, url] of DEPENDANCES) {
    const cible = join(CACHE, nom);
    if (existsSync(cible)) continue;
    const reponse = await fetch(url);
    if (!reponse.ok) throw new Error(`${url} : ${reponse.status}`);
    writeFileSync(cible, Buffer.from(await reponse.arrayBuffer()));
  }
}

function servir() {
  const serveur = createServer((requete, reponse) => {
    const chemin = join(HANDOFF, decodeURIComponent((requete.url ?? '/').split('?')[0]));
    if (!chemin.startsWith(HANDOFF) || !existsSync(chemin)) {
      reponse.writeHead(404);
      reponse.end('inconnu');
      return;
    }
    reponse.writeHead(200, { 'Content-Type': TYPES[extname(chemin)] ?? 'application/octet-stream' });
    reponse.end(readFileSync(chemin));
  });
  return new Promise((resoudre) => serveur.listen(PORT, () => resoudre(serveur)));
}

const themeDemande = (process.argv.find((a) => a.startsWith('--theme=')) ?? '').split('=')[1];
const THEMES = themeDemande === 'clair' ? ['clair']
  : themeDemande === 'sombre' ? ['sombre']
    : ['clair', 'sombre'];

const serveur = await servir();
await telecharger();

const navigateur = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 960 } });

await contexte.route('**://unpkg.com/**', (route) => {
  const url = route.request().url();
  const nom = url.includes('react-dom') ? 'react-dom.js'
    : url.includes('babel') ? 'babel.js'
      : url.includes('react') ? 'react.js' : null;
  if (nom === null) return route.abort();
  return route.fulfill({
    status: 200, contentType: 'application/javascript', body: readFileSync(join(CACHE, nom), 'utf8')
  });
});
// Les polices Google ne sortiront pas du bac à sable : on coupe la requête
// plutôt que d'attendre son échec. Le rendu retombe sur la pile système, ce
// qui change le dessin des lettres mais aucune mise en page.
await contexte.route('**://fonts.*/**', (r) => r.abort());

const inconnus = VUES.filter((v) => !existsSync(join(HANDOFF, v.fichier)));
if (inconnus.length > 0) {
  throw new Error(`Écrans absents du handoff : ${inconnus.map((v) => v.fichier).join(', ')}`);
}

mkdirSync(SORTIE, { recursive: true });
let capturees = 0;
const manquees = [];

for (const theme of THEMES) {
  for (const vue of VUES) {
    const page = await contexte.newPage();
    // Le thème est lu dans `localStorage` par un script en tête de page : il
    // doit y être AVANT la navigation, sinon la page s'ouvre dans l'autre.
    await page.addInitScript(
      (t) => {
        try {
          localStorage.setItem('freel-v111-theme', t);
          // Les actions rapides du Pilote sont personnalisables et n'affichent
          // par défaut que quatre pastilles sur quinze ; les autres se cachent
          // derrière un menu que Playwright n'ouvre pas de façon fiable. On
          // pose le catalogue entier : la capture montre alors toutes les
          // entrées, ce qui est justement ce qu'on veut documenter.
          localStorage.setItem('freel-quickacts', JSON.stringify([
            'fac-dl', 'cra-dl', 'activite', 'new-fac', 'mission', 'encaisse', 'charge'
          ]));
        } catch { /* un stockage indisponible ne doit pas empêcher la capture */ }
      },
      theme
    );
    await page.goto(`http://127.0.0.1:${PORT}/${encodeURIComponent(vue.fichier)}`,
      { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    let ouverte = true;
    for (const libelle of vue.ouvrir ?? []) {
      // Les onglets portent un compteur à côté de leur nom, et le même mot
      // apparaît souvent ailleurs dans la page. On cherche donc le nœud le
      // plus PROFOND qui porte exactement ce texte, et parmi eux le premier
      // visible : un ancêtre qui contient le mot n'est pas la cible.
      const cible = page.locator(`text="${libelle}"`).locator('visible=true').first();
      if (await cible.count() === 0) { ouverte = false; break; }
      await cible.click({ timeout: 5000 }).catch(() => { ouverte = false; });
      await page.waitForTimeout(700);
    }

    if (!ouverte) {
      manquees.push(`${theme}/${vue.nom}`);
      await page.close();
      continue;
    }

    await page.screenshot({ path: join(SORTIE, `${theme}-${vue.nom}.png`), fullPage: true });
    capturees += 1;
    await page.close();
  }
}

await navigateur.close();
serveur.close();

// Un index en clair, pour retrouver une capture sans ouvrir vingt fichiers.
writeFileSync(join(SORTIE, 'INDEX.md'),
  `# Captures du handoff de design\n\n`
  + `Générées par \`app/scripts/capturer-handoff.mjs\` depuis\n`
  + `\`docs/design/handoff-v1.11/app/\`. **Ne pas retoucher à la main** : elles\n`
  + `seraient écrasées à la prochaine génération, et cesseraient de dire la vérité\n`
  + `sur le handoff.\n\n`
  + `Deux thèmes, \`clair-*\` et \`sombre-*\`. Le handoff s'ouvre en sombre par\n`
  + `défaut ; l'application, elle, suit le réglage du système.\n\n`
  + `| Capture | Écran |\n|---|---|\n`
  + VUES.map((v) => `| \`${v.nom}\` | ${v.fichier.replace('#U00e9', 'é').replace('.html', '')}`
    + `${v.ouvrir ? ` — ${v.ouvrir.join(' › ')}` : ''} |`).join('\n')
  + '\n');

console.log(`${capturees} captures dans ${SORTIE}`);
if (manquees.length > 0) {
  console.log(`Non atteintes (libellé introuvable) : ${manquees.join(', ')}`);
}
