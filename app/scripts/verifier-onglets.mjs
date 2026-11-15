/**
 * Deux onglets, une session expirée (lot 59, constat S9).
 *
 * Dans un vrai navigateur, deux onglets de l'application construite s'ouvrent
 * en même temps sur l'écran Compte, avec une session expirée. Le faux serveur
 * d'authentification n'accepte qu'UNE fois un jeton de renouvellement, comme
 * Supabase. Avant ce lot, les deux renouvelaient ensemble, le second était
 * refusé et effaçait la session neuve du premier : les deux se retrouvaient
 * déconnectés.
 *
 * Deux passes : avec l'API de verrous du navigateur, puis sans elle, comme un
 * navigateur ancien. Dans les deux, aucun onglet ne finit déconnecté et la
 * session neuve reste. Le verrou ne suffit pas à lui seul : Chromium rend
 * parfois le verrou avant que la session écrite par l'autre onglet soit
 * lisible (3 passages sur 10, mesuré) — le second onglet, refusé, doit alors
 * ADOPTER la session neuve au lieu de l'effacer (`reprendreSession`).
 *
 * Usage : npm run build && node scripts/verifier-onglets.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const CHROMIUM_FOURNI = '/opt/pw-browsers/chromium';
const PROJET = 'https://essai-onglets.supabase.co';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml'
};

function servir(racine) {
  const serveur = createServer(async (rq, rp) => {
    let chemin = decodeURIComponent((rq.url ?? '/').split('?')[0] ?? '/');
    if (chemin.endsWith('/')) chemin += 'index.html';
    const rel = normalize(chemin).replace(/^([/\\])+/, '');
    try {
      const c = await readFile(join(racine, rel));
      rp.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream' }).end(c);
    } catch {
      rp.writeHead(404).end();
    }
  });
  return new Promise((r) => serveur.listen(0, '127.0.0.1', () => r({ serveur, port: serveur.address().port })));
}

const echecs = [];
const constate = (ok, message, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${message}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs.push(message);
};

/** Ce que l'appareil porte au départ : un projet relié, une session expirée. */
const DEPART = {
  'freel.config.supabase.v1': JSON.stringify({ url: PROJET, cleAnon: 'cle-publique-factice' }),
  'freel.session.supabase.v1': JSON.stringify({
    jeton: 'jeton-1', jetonRafraichissement: 'renouv-1', expireLe: 1000,
    utilisateurId: '00000000-0000-0000-0000-000000000001', email: 'demo@exemple.test'
  })
};

async function deuxOnglets(base, navigateur, { sansVerrou }) {
  const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
  const consommes = new Set();
  let renouvellements = 0;
  let acceptes = 0;
  let suivant = 1;
  await contexte.route(`${PROJET}/**`, async (route) => {
    const url = route.request().url();
    const entetes = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { ...entetes, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }
    if (url.includes('/auth/v1/token')) {
      renouvellements++;
      // Le serveur répond lentement : le second onglet a le temps de partir.
      await new Promise((r) => setTimeout(r, 400));
      const { refresh_token: jeton } = JSON.parse(route.request().postData() ?? '{}');
      if (consommes.has(jeton)) {
        return route.fulfill({ status: 400, headers: entetes, body: JSON.stringify({ error_description: 'Invalid Refresh Token: Already Used' }) });
      }
      consommes.add(jeton);
      acceptes++;
      suivant++;
      return route.fulfill({
        status: 200, headers: entetes, body: JSON.stringify({
          access_token: `jeton-${suivant}`, refresh_token: `renouv-${suivant}`, expires_in: 3600,
          user: { id: '00000000-0000-0000-0000-000000000001', email: 'demo@exemple.test' }
        })
      });
    }
    return route.fulfill({ status: 200, headers: entetes, body: '[]' });
  });

  // L'état de départ, posé une fois par une page d'amorce.
  const amorce = await contexte.newPage();
  await amorce.goto(`${base}#/`);
  await amorce.evaluate((d) => { for (const [c, v] of Object.entries(d)) localStorage.setItem(c, v); }, DEPART);
  await amorce.close();

  if (sansVerrou) {
    await contexte.addInitScript(() => { Object.defineProperty(navigator, 'locks', { value: undefined }); });
  }
  const [a, b] = await Promise.all([contexte.newPage(), contexte.newPage()]);
  await Promise.all([a.goto(`${base}#/config/compte`), b.goto(`${base}#/config/compte`)]);
  await Promise.all([a.waitForTimeout(2500), b.waitForTimeout(2500)]);

  const connecte = async (p) => (await p.getByRole('button', { name: 'Se déconnecter', exact: true }).count()) > 0;
  const resultat = {
    renouvellements,
    acceptes,
    connectes: [await connecte(a), await connecte(b)],
    conservee: await a.evaluate(() => JSON.parse(localStorage.getItem('freel.session.supabase.v1') ?? 'null')?.jetonRafraichissement ?? null)
  };
  await contexte.close();
  return resultat;
}

const { serveur, port } = await servir(DIST);
const base = `http://127.0.0.1:${port}/`;
const navigateur = await chromium.launch(existsSync(CHROMIUM_FOURNI) ? { executablePath: CHROMIUM_FOURNI } : {});

try {
  console.log('\n🔐 Deux onglets, une session expirée — verrou du navigateur');
  const avec = await deuxOnglets(base, navigateur, { sansVerrou: false });
  constate(avec.acceptes === 1, 'un seul renouvellement accepté', `${avec.acceptes} accepté(s) sur ${avec.renouvellements} demande(s)`);
  constate(avec.connectes.every(Boolean), 'les deux onglets restent connectés', JSON.stringify(avec.connectes));
  constate(avec.conservee === 'renouv-2', 'la session neuve est conservée', String(avec.conservee));

  console.log('\n🔐 Même essai sans verrou (navigateur ancien)');
  const sans = await deuxOnglets(base, navigateur, { sansVerrou: true });
  constate(sans.connectes.every(Boolean), 'les deux onglets restent connectés : le refusé adopte la session neuve', JSON.stringify(sans.connectes));
  constate(sans.conservee === 'renouv-2', 'le refus du second n’efface pas la session du premier', String(sans.conservee));
} finally {
  await navigateur.close();
  serveur.close();
}

console.log('');
if (echecs.length > 0) {
  console.log(`❌ onglets : ${echecs.length} contrôle(s) en échec`);
  process.exit(1);
}
console.log('✅ onglets : une session renouvelée une fois, aucun onglet ne déconnecte l’autre');
