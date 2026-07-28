/**
 * Vérification de bout en bout de la migration.
 *
 * C'est la démonstration attendue du jalon J2 : l'application s'ouvre sur les
 * données réelles de l'utilisateur, reprises de l'ancienne version, sans perte
 * et sans double décompte. Les tests unitaires vérifient la fonction de
 * migration ; ce script vérifie la chaîne complète, dans un vrai navigateur,
 * avec un vrai localStorage.
 *
 * Ce qui est contrôlé :
 *   1. les données de l'ancien format sont reprises et affichées ;
 *   2. l'instantané d'avant-migration est bien écrit ;
 *   3. les clés de l'ancienne application ne sont PAS supprimées ;
 *   4. un rechargement ne duplique rien (idempotence) ;
 *   5. les provisions reflètent le volet 2 — la dette née à l'encaissement.
 *
 * Usage : node scripts/verifier-migration-bout-en-bout.mjs
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const RACINE = new URL('../dist/', import.meta.url).pathname;
const CHROMIUM_FOURNI = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

/**
 * Données au format de l'ancienne application. Volontairement synthétiques :
 * aucune donnée personnelle réelle dans le dépôt (invariant n°6).
 *
 * Le solde de 20 000 € et la recette encaissée de 10 000 € sont choisis pour
 * que le volet 2 des provisions soit visible : la période n'étant pas
 * déclarée, la charge doit être provisionnée.
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
    factures: [
      { id: 'F1', numero: '2026-001', montant: 10000, date: '2026-06-30', datePaiement: '2026-07-10', modeReglement: 'virement' },
      { id: 'F2', numero: '2026-002', montant: 4000, date: '2026-07-31', payee: false }
    ]
  }],
  cl: [{ id: 'CLI1', nom: 'ClientTest', adresse: '', siret: '', email: '', delaiPaiement: 30 }],
  t: { soldeInitial: 20000, salaireEstime: 2500, reserveCompte: 1500, mouvements: [], paidCharges: {}, conges: {} },
  ir: {},
  _ts: Date.now()
};

function servir() {
  const serveur = createServer(async (rq, rp) => {
    const chemin = (rq.url ?? '/').split('?')[0];
    const rel = chemin === '/' ? 'index.html' : normalize(chemin).replace(/^([/\\])+/, '');
    try {
      const c = await readFile(join(RACINE, rel));
      rp.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream' });
      rp.end(c);
    } catch {
      rp.writeHead(404).end('introuvable');
    }
  });
  return new Promise((r) => serveur.listen(0, '127.0.0.1', () => r({ serveur, port: serveur.address().port })));
}

const echecs = [];
const constate = (ok, message, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${message}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs.push(message);
};

const { serveur, port } = await servir();
const base = `http://127.0.0.1:${port}/`;
const navigateur = await chromium.launch(
  existsSync(CHROMIUM_FOURNI) ? { executablePath: CHROMIUM_FOURNI } : {}
);

const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
// Les données de l'ancienne version sont posées AVANT le premier chargement,
// exactement comme elles le seraient chez un utilisateur existant.
await contexte.addInitScript((bundle) => {
  window.localStorage.setItem('freel_v50_bundle', JSON.stringify(bundle));
  window.localStorage.setItem('freel_ts', String(Date.now()));
  window.localStorage.setItem('freel_theme', 'sombre');
}, BUNDLE_LEGACY);

const page = await contexte.newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 120)));

console.log('\n📦 Premier chargement, sur données de l\'ancienne version');
await page.goto(base, { waitUntil: 'networkidle' });

constate(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));

const apres = await page.evaluate(() => {
  const faits = JSON.parse(window.localStorage.getItem('freel.faits.v1') ?? 'null');
  return {
    faits,
    instantane: window.localStorage.getItem('freel.instantane.avant-migration.v1') !== null,
    legacyIntact: window.localStorage.getItem('freel_v50_bundle') !== null,
    texte: document.body.innerText
  };
});

constate(apres.faits !== null, 'les faits migrés sont écrits en stockage');
constate(apres.instantane, 'l\'instantané d\'avant-migration est archivé');
// Le legacy doit rester lisible : c'est la condition de sa cohabitation.
constate(apres.legacyIntact, 'les clés de l\'ancienne application ne sont pas supprimées');

if (apres.faits) {
  constate(apres.faits.soldeInitial === 20000, 'le solde initial est repris', `${apres.faits.soldeInitial}`);
  constate(apres.faits.reserve === 1500, 'la réserve est reprise (D4 : source unique)', `${apres.faits.reserve}`);
  constate(apres.faits.besoinMensuel === 2500, 'le besoin mensuel est repris', `${apres.faits.besoinMensuel}`);
  constate(apres.faits.recettes.length === 2, 'les deux factures deviennent des recettes', `${apres.faits.recettes.length}`);
  constate(apres.faits.clients.length === 1, 'le client est repris');
  constate(apres.faits.missions[0]?.clientId === 'CLI1', 'la mission est rattachée à son client');
}

console.log('\n💰 Affichage : les montants viennent des données, pas de constantes');
const affichage = await page.evaluate(() => {
  const texte = document.body.innerText;
  const nombres = [...texte.matchAll(/([\d  \s]+)\s*€/g)]
    .map((m) => Number(m[1].replace(/[  \s]/g, '')))
    .filter((n) => Number.isFinite(n));
  return { texte, nombres };
});

constate(affichage.nombres.includes(20000), 'le solde migré est affiché', '20 000 €');
constate(affichage.nombres.includes(1500), 'la réserve migrée est affichée', '1 500 €');

// Volet 2 : la recette de 10 000 € encaissée en juillet 2026, période non
// déclarée, doit être provisionnée. Au taux du 2ᵉ semestre 2026 (26,1 %) plus
// la CFP (0,2 %), cela fait 2 630 €.
const provisionAttendue = Math.round(10000 * (0.261 + 0.002));
constate(
  affichage.nombres.includes(provisionAttendue),
  'la charge sur recette encaissée est provisionnée (volet 2 de D3)',
  `${provisionAttendue} €`
);
// Et le versable en découle : 20 000 − 2 630 − 1 500 = 15 870.
const versableAttendu = 20000 - provisionAttendue - 1500;
constate(
  affichage.nombres.includes(versableAttendu),
  'le versable découle du solde, des provisions et de la réserve',
  `${versableAttendu} €`
);

console.log('\n🔁 Rechargement : rien ne doit être dupliqué');
await page.reload({ waitUntil: 'networkidle' });
const recharge = await page.evaluate(() => {
  const f = JSON.parse(window.localStorage.getItem('freel.faits.v1') ?? 'null');
  return { recettes: f?.recettes?.length ?? -1, clients: f?.clients?.length ?? -1 };
});
constate(recharge.recettes === 2, 'les recettes ne sont pas dupliquées', `${recharge.recettes}`);
constate(recharge.clients === 1, 'les clients ne sont pas dupliqués', `${recharge.clients}`);
constate(erreurs.length === 0, 'toujours aucune erreur de page après rechargement', erreurs.join(' | '));

await navigateur.close();
serveur.close();

console.log(`\n${'═'.repeat(52)}`);
if (echecs.length === 0) {
  console.log('✅ migration de bout en bout : conforme');
} else {
  console.log(`❌ ${echecs.length} échec(s) :`);
  echecs.forEach((e) => console.log(`   · ${e}`));
}
console.log('═'.repeat(52));
process.exit(echecs.length > 0 ? 1 : 0);
