/**
 * Vérification de la bascule, dans un vrai navigateur, sur le site assemblé.
 *
 * Ce qui est contrôlé :
 *   1. ZÉRO ÉCRITURE depuis /legacy/ : l'ancienne application est chargée sur
 *      des données factices, on clique tout ce qui se clique (confirmations
 *      acceptées, « réinitialiser » compris), et ni le stockage du navigateur
 *      ni le réseau ne voient la moindre écriture ;
 *   2. le bandeau « lecture seule » est là, et mène à la nouvelle version ;
 *   3. la copie publiée a perdu ses balises anti-cache, et le garde passe
 *      AVANT tout autre script de la page ;
 *   4. /v2/#/argent mène à /#/argent — les favoris de la refonte survivent ;
 *   5. la nouvelle version, à la racine, reprend toujours les données de
 *      l'ancienne : même origine, même stockage.
 *
 * Le stockage est photographié depuis une page de la même origine qui n'est
 * PAS l'ancienne application (une 404 du serveur) : une photographie prise
 * par la page gardée serait lue à travers le garde, et ne prouverait rien.
 *
 * Usage : node scripts/verifier-bascule.mjs   (après « npm run build »)
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { assembler } from './assembler-site.mjs';

const CHROMIUM_FOURNI = '/opt/pw-browsers/chromium';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

/**
 * Données au format de l'ancienne application, factices (invariant n°6).
 * Même forme que celles du contrôle de migration de bout en bout.
 */
const BUNDLE_LEGACY = {
  c: {
    nom: 'Entreprise de test', siret: '', debut: '2023-01-02',
    typeActivite: 'BNC', acre: false, prelevementLiberatoire: false,
    tvaDepuis: '', tvaIntracom: '', iban: '', bic: '',
    adresse: '', codeApe: '', urssafPeriodicite: 'mensuel', onboardingDone: true
  },
  m: [{
    id: 'MIS1', client: 'ClientTest', description: 'Mission de test', tjm: 400,
    debut: '2026-01-05', fin: null, statut: 'active',
    factures: [{
      id: 'F1', numero: '2026-001', ht: 10000, ttc: 10000, jours: 25,
      mois: '2026-06', dateEnvoi: '2026-06-30', status: 'payée',
      datePaiementReel: '2026-07-10', modeReglement: 'virement'
    }]
  }],
  cl: [{
    id: 'CLI1', nom: 'ClientTest', adresse: '', siret: '', contact: '', notes: '',
    email: '', delaiPaiement: 30, jourPaiement: 15
  }],
  t: { soldeInitial: 20000, salaireEstime: 2500, reserveCompte: 1500, mouvements: [], paidCharges: {}, conges: {} },
  ir: {},
  _ts: 1767225600000
};

function servir(racine) {
  const serveur = createServer(async (rq, rp) => {
    let chemin = decodeURIComponent((rq.url ?? '/').split('?')[0] ?? '/');
    if (chemin.endsWith('/')) chemin += 'index.html';
    const rel = normalize(chemin).replace(/^([/\\])+/, '');
    try {
      const c = await readFile(join(racine, rel));
      rp.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream' });
      rp.end(c);
    } catch {
      rp.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end('<p>introuvable</p>');
    }
  });
  return new Promise((r) => serveur.listen(0, '127.0.0.1', () => r({ serveur, port: serveur.address().port })));
}

const echecs = [];
const constate = (ok, message, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${message}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs.push(message);
};

const site = await mkdtemp(join(tmpdir(), 'freel-site-'));
assembler(site);
const { serveur, port } = await servir(site);
const base = `http://127.0.0.1:${port}/`;
const navigateur = await chromium.launch(existsSync(CHROMIUM_FOURNI) ? { executablePath: CHROMIUM_FOURNI } : {});

try {
  /* ── 3. La copie publiée ─────────────────────────────────────────────── */
  console.log('\n📄 Copie publiée de l’ancienne application');
  const copie = readFileSync(join(site, 'legacy', 'index.html'), 'utf8');
  constate(!/http-equiv="(Cache-Control|Pragma|Expires)"/i.test(copie), 'les balises anti-cache sont retirées');
  const premierScript = copie.indexOf('<script');
  constate(
    premierScript !== -1 && copie.slice(premierScript, premierScript + 40).includes('data-freel-lecture-seule'),
    'le garde est le premier script de la page'
  );

  /* ── 1 et 2. Zéro écriture depuis /legacy/ ───────────────────────────── */
  console.log('\n🔒 Ancienne version sous /legacy/');
  const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
  const ecrituresReseau = [];
  await contexte.route('**/*', (route) => {
    const rq = route.request();
    if (!/^(GET|HEAD|OPTIONS)$/i.test(rq.method())) ecrituresReseau.push(`${rq.method()} ${rq.url()}`);
    // Hermétique : rien ne sort de la machine, lecture comprise.
    if (!rq.url().startsWith(base)) return route.abort();
    return route.continue();
  });
  const page = await contexte.newPage();
  page.on('dialog', (d) => { void d.accept().catch(() => {}); });

  const photographier = async () => {
    await page.goto(`${base}vide`, { waitUntil: 'domcontentloaded' });
    return page.evaluate(() => {
      const instantane = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const cle = window.localStorage.key(i);
        instantane[cle] = window.localStorage.getItem(cle);
      }
      return instantane;
    });
  };

  await page.goto(`${base}vide`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((bundle) => {
    window.localStorage.clear();
    window.localStorage.setItem('freel_v50_bundle', JSON.stringify(bundle));
    window.localStorage.setItem('freel_theme', 'sombre');
  }, BUNDLE_LEGACY);
  const avant = await photographier();

  const erreursPage = [];
  page.on('pageerror', (e) => erreursPage.push(String(e).slice(0, 120)));
  await page.goto(`${base}legacy/`, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const bandeau = page.locator('#freel-lecture-seule');
  constate(await bandeau.isVisible(), 'le bandeau « lecture seule » est visible');
  const lien = bandeau.locator('a');
  constate(
    (await lien.count()) === 1 && (await lien.getAttribute('href')) === '../',
    'le bandeau mène à la nouvelle version'
  );

  // Tout ce qui se clique, une fois : onglets, boutons d'enregistrement,
  // réinitialisation, avec les confirmations acceptées. Le pire cas d'un
  // utilisateur qui croirait encore saisir là.
  const cliquables = page.locator('button:visible, [onclick]:visible');
  const nombre = Math.min(await cliquables.count(), 120);
  let cliques = 0;
  for (let i = 0; i < nombre; i++) {
    try {
      await cliquables.nth(i).click({ timeout: 300, noWaitAfter: true });
      cliques++;
    } catch { /* masqué entre-temps, ou détaché : on passe */ }
    if (!page.url().startsWith(`${base}legacy/`)) {
      await page.goto(`${base}legacy/`, { waitUntil: 'load' });
    }
  }
  for (const champ of await page.locator('input:visible[type="text"], input:visible[type="number"]').all()) {
    await champ.fill('42').catch(() => {});
  }
  // Et les écritures directes, que le garde doit rendre sans effet : celles
  // du stockage, et celles qu'enverrait la synchronisation avec le compte
  // (une base de démonstration n'en déclenche aucune d'elle-même).
  await page.evaluate(async () => {
    window.localStorage.setItem('freel_v50_bundle', '{}');
    window.localStorage['freel_theme'] = 'clair';
    window.localStorage.removeItem('freel_theme');
    await fetch('/sonde-ecriture', { method: 'POST', body: '{}' }).catch(() => {});
    await fetch(new Request('/sonde-ecriture', { method: 'PATCH', body: '{}' })).catch(() => {});
    const xhr = new XMLHttpRequest();
    xhr.open('DELETE', '/sonde-ecriture');
    xhr.send();
    navigator.sendBeacon?.('/sonde-ecriture', '{}');
  });
  await page.waitForTimeout(300);
  console.log(`  · ${cliques} éléments cliqués`);

  const apres = await photographier();
  const changees = [...new Set([...Object.keys(avant), ...Object.keys(apres)])]
    .filter((cle) => avant[cle] !== apres[cle]);
  constate(changees.length === 0, 'aucune écriture dans le stockage du navigateur', changees.join(', '));
  constate(ecrituresReseau.length === 0, 'aucune écriture vers le réseau', ecrituresReseau.slice(0, 3).join(' | '));
  if (erreursPage.length > 0) console.log(`  · erreurs de page tolérées (écritures refusées) : ${erreursPage.length}`);
  await contexte.close();

  /* ── 4. /v2/ redirige ────────────────────────────────────────────────── */
  console.log('\n↪️  Ancienne adresse de la nouvelle version');
  const ctxV2 = await navigateur.newContext();
  const pV2 = await ctxV2.newPage();
  await pV2.goto(`${base}v2/#/argent`, { waitUntil: 'load' });
  await pV2.waitForURL(`${base}#/argent`, { timeout: 5000 }).catch(() => {});
  constate(pV2.url() === `${base}#/argent`, '/v2/#/argent mène à /#/argent', pV2.url());
  await ctxV2.close();

  /* ── 5. La reprise à la racine ───────────────────────────────────────── */
  console.log('\n📦 Nouvelle version à la racine, sur données de l’ancienne');
  const ctxRacine = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
  const pRacine = await ctxRacine.newPage();
  await pRacine.goto(`${base}vide`, { waitUntil: 'domcontentloaded' });
  await pRacine.evaluate((bundle) => {
    window.localStorage.setItem('freel_v50_bundle', JSON.stringify(bundle));
  }, BUNDLE_LEGACY);
  await pRacine.goto(base, { waitUntil: 'networkidle' });
  await pRacine.waitForFunction(() => window.localStorage.getItem('freel.faits.v1') !== null, null, { timeout: 10000 })
    .catch(() => {});
  const repris = await pRacine.evaluate(() => {
    const faits = JSON.parse(window.localStorage.getItem('freel.faits.v1') ?? 'null');
    return {
      clients: faits?.clients?.map((c) => c.nom) ?? [],
      legacyIntact: window.localStorage.getItem('freel_v50_bundle') !== null
    };
  });
  constate(repris.clients.includes('ClientTest'), 'la reprise lit les données de l’ancienne version', repris.clients.join(', '));
  constate(repris.legacyIntact, 'les données de l’ancienne version restent en place');
  await ctxRacine.close();
} finally {
  await navigateur.close();
  serveur.close();
  await rm(site, { recursive: true, force: true });
}

console.log('');
if (echecs.length > 0) {
  console.log(`❌ bascule : ${echecs.length} contrôle(s) en échec`);
  process.exit(1);
}
console.log('✅ bascule : ancienne version en lecture seule, nouvelle à la racine, reprise intacte');
