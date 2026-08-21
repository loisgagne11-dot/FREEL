/**
 * Capture NOS écrans, sous les mêmes noms que ceux du handoff.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX DOSSIERS DE CAPTURES ET PAS UN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `docs/design/captures/` dit ce que le design VEUT.
 * `docs/design/captures-app/` dit ce que l'application FAIT.
 *
 * Deux images côte à côte se comparent ; deux descriptions, non. Trois
 * décisions de conception ont été prises « d'après le handoff » en le lisant au
 * lieu de le regarder, et les trois étaient fausses — un donut pris pour une
 * barre, un graphe combiné pris pour deux, un découpage mensuel pris pour des
 * plages libres. Les tests étaient verts à chaque fois.
 *
 * Les deux dossiers emploient le MÊME nom de fichier pour le même écran :
 * c'est ce qui permet à `controleur-visuel` d'ouvrir la paire sans avoir à
 * deviner la correspondance.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE MÊME JEU DE DONNÉES DES DEUX CÔTÉS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `docs/design/jeu-de-demonstration.json` reprend les clients, missions,
 * factures et échéances du handoff. Sans lui, notre capture montrerait des
 * écrans vides et la comparaison ne dirait rien : un écran vide est conforme à
 * tout.
 *
 * L'horloge est figée au 10 juin 2026, date du handoff. Un « aujourd'hui » qui
 * bouge ferait bouger la moitié des chiffres d'une capture à l'autre, et on ne
 * saurait plus distinguer une régression d'un jour qui passe.
 *
 * Usage : node scripts/capturer-app.mjs [--theme=clair|sombre] [--ecran=argent]
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RACINE = resolve(import.meta.dirname, '../..');
const SORTIE = join(RACINE, 'docs/design/captures-app');
/* Le jeu vient de `app/public/`, d'où l'application elle-même le charge — et
   non d'une copie dans `docs/`. Le script pointait vers `docs/design/`, où
   rien ne se trouve : il levait avant d'ouvrir un navigateur, et personne ne
   l'a vu parce qu'aucune capture manquante ne fait échouer `npm run verifier`.
   Une seconde copie du jeu aurait de toute façon fini par diverger de celle
   que l'application sert. */
const JEU = JSON.parse(
  readFileSync(join(RACINE, 'app/public/jeu-de-demonstration.json'), 'utf8')
);
const PORT = 4174;

/** Le 10 juin 2026, comme le handoff. Voir l'en-tête. */
const AUJOURDHUI = '2026-06-10T09:00:00Z';

/**
 * Les vues, nommées comme celles du handoff.
 *
 * `ouvrir` est une suite de libellés à cliquer. Un nom qui n'existe pas encore
 * dans notre application est normal tant que le lot correspondant n'est pas
 * fait : le script le signale au lieu d'échouer, et la capture manquante est
 * elle-même l'information.
 */
const VUES = [
  { hash: '#/pilote', nom: 'pilote' },
  /* Le handoff nomme « plan de charge » sa VUE SEMAINE : c'est sur elle que
     l'écran s'ouvre là-bas. Chez nous l'écran s'ouvre encore sur le mois, parce
     que c'est le mois qui porte la pose des congés — la fusion des deux cartes
     est le lot C3. En attendant, on clique pour aller chercher la vue que la
     référence montre, plutôt que de comparer deux écrans différents. */
  { hash: '#/activite', nom: 'activite-plan-de-charge', ouvrir: ['Semaine'] },
  { hash: '#/activite', nom: 'activite-mois', ouvrir: ['Mois'] },
  { hash: '#/activite', nom: 'activite-missions', ouvrir: ['Missions'] },
  { hash: '#/activite', nom: 'activite-factures', ouvrir: ['Factures'] },
  { hash: '#/activite', nom: 'activite-clients', ouvrir: ['Clients'] },
  { hash: '#/argent', nom: 'argent-tresorerie' },
  { hash: '#/argent', nom: 'argent-performance', ouvrir: ['Performance'] },
  { hash: '#/achats', nom: 'achats' },
  { hash: '#/outils', nom: 'outils-impot' },
  { hash: '#/config', nom: 'config-profil' }
];

const argument = (nom) =>
  (process.argv.find((a) => a.startsWith(`--${nom}=`)) ?? '').split('=')[1];

const themeDemande = argument('theme');
const THEMES = themeDemande === 'clair' ? ['clair']
  : themeDemande === 'sombre' ? ['sombre'] : ['clair', 'sombre'];
const ecranDemande = argument('ecran');
const vues = ecranDemande ? VUES.filter((v) => v.nom.includes(ecranDemande)) : VUES;

if (vues.length === 0) {
  console.error(`Aucune vue ne correspond à « ${ecranDemande} ».`);
  process.exit(1);
}

/* La capture porte sur le BUILD, pas sur le serveur de développement : c'est
   la version que verra l'utilisateur, chargement différé des écrans compris.
   Un écran qui ne s'affiche qu'en développement est un écran cassé. */
console.log('Construction…');
await new Promise((resoudre, rejeter) => {
  const build = spawn('npm', ['run', 'build'], { cwd: join(RACINE, 'app'), stdio: 'inherit' });
  build.on('exit', (code) => (code === 0 ? resoudre() : rejeter(new Error(`build : ${code}`))));
});

const apercu = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: join(RACINE, 'app'), stdio: 'ignore' });

const base = `http://127.0.0.1:${PORT}/`;
// On attend que le serveur réponde plutôt que de dormir une durée choisie au
// hasard : trop courte elle rend le script instable, trop longue elle le rend
// pénible, et aucune des deux n'est juste sur toutes les machines.
for (let essai = 0; essai < 60; essai += 1) {
  try {
    const r = await fetch(base);
    if (r.ok) break;
  } catch { /* pas encore prêt */ }
  await new Promise((r) => setTimeout(r, 500));
}

mkdirSync(SORTIE, { recursive: true });

const navigateur = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const manquees = [];
let capturees = 0;

for (const theme of THEMES) {
  const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 960 } });
  await contexte.addInitScript(
    ({ palette, faits, cle, maintenant }) => {
      window.localStorage.setItem('freel-v111-theme', palette);
      window.localStorage.setItem(cle, JSON.stringify(faits));
      /* L'horloge est figée AVANT tout script de la page : `Date.now()` et
         `new Date()` sans argument rendent la date du handoff. Sans cela, la
         moitié des chiffres — retards, échéances à venir, allure sur l'année —
         changerait d'un jour à l'autre, et une capture différente ne voudrait
         plus rien dire. */
      const fixe = new Date(maintenant).getTime();
      const Vraie = Date;
      // eslint-disable-next-line no-global-assign
      window.Date = class extends Vraie {
        constructor(...args) {
          if (args.length === 0) super(fixe); else super(...args);
        }
        static now() { return fixe; }
      };
    },
    { palette: theme, faits: JEU, cle: 'freel.faits.v1', maintenant: AUJOURDHUI }
  );

  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));

  for (const vue of vues) {
    erreurs.length = 0;
    await page.goto(base + vue.hash, { waitUntil: 'networkidle' });
    // Les écrans sont chargés à la demande : on attend le titre, sinon on
    // capturerait l'écran d'attente. `h1:visible` parce qu'un changement de
    // hash laisse le précédent monté en `display: none` pendant la suspension.
    await page.waitForSelector('h1:visible', { timeout: 15000 }).catch(() => {});

    let ouverte = true;
    for (const libelle of vue.ouvrir ?? []) {
      const cible = page.getByRole('tab', { name: new RegExp(`^${libelle}`) }).first();
      const secours = page.getByRole('button', { name: new RegExp(`^${libelle}`) }).first();
      const choisie = await cible.count() > 0 ? cible : secours;
      if (await choisie.count() === 0) { ouverte = false; break; }
      await choisie.click({ timeout: 5000 }).catch(() => { ouverte = false; });
      await page.waitForTimeout(500);
    }

    if (!ouverte) {
      manquees.push(`${theme}-${vue.nom} (libellé « ${(vue.ouvrir ?? []).join(' › ')} » introuvable)`);
      continue;
    }

    await page.screenshot({ path: join(SORTIE, `${theme}-${vue.nom}.png`), fullPage: true });
    capturees += 1;
    if (erreurs.length > 0) {
      manquees.push(`${theme}-${vue.nom} capturé MAIS erreur JS : ${erreurs[0]}`);
    }
  }

  await contexte.close();
}

await navigateur.close();
apercu.kill();

writeFileSync(join(SORTIE, 'INDEX.md'),
  '# Captures de l’application\n\n'
  + 'Générées par `app/scripts/capturer-app.mjs` sur\n'
  + '`docs/design/jeu-de-demonstration.json`, horloge figée au 10 juin 2026.\n\n'
  + 'Chaque fichier a un homonyme dans `docs/design/captures/` : c’est la paire\n'
  + 'que `controleur-visuel` compare. Une capture absente ici et présente là\n'
  + 'signifie que l’écran n’est pas encore fait — c’est une information, pas une\n'
  + 'panne.\n\n'
  + '**Ne pas retoucher à la main.**\n\n'
  + '| Capture | Écran |\n|---|---|\n'
  + VUES.map((v) => `| \`${v.nom}\` | ${v.hash}${v.ouvrir ? ` › ${v.ouvrir.join(' › ')}` : ''} |`).join('\n')
  + '\n');

console.log(`\n${capturees} captures dans ${SORTIE}`);
if (manquees.length > 0) {
  console.log('À signaler :');
  for (const m of manquees) console.log(`  · ${m}`);
}
