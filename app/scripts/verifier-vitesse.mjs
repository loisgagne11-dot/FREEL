/**
 * Vérification de la VITESSE, sur un volume réaliste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ON MESURAIT DES OCTETS, PAS DU TEMPS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le budget de performance contrôle le poids téléchargé, et il le fait bien :
 * 297 Ko au premier rendu contre 1 873 Ko pour l'ancienne version. Mais un
 * fichier léger peut mettre trois secondes à s'afficher — le poids ne dit rien
 * du temps de calcul.
 *
 * Or ce projet a fait un choix qui se paie au rendu : AUCUNE valeur dérivée
 * n'est stockée. Tout est recalculé depuis les faits à chaque lecture, ce qui
 * rend la divergence impossible — c'est l'invariant n°5, et il n'est pas
 * négociable. Reste que sur trois ans d'historique, « recalculer tout » n'est
 * plus gratuit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SUR DU VOLUME, PAS SUR UN COMPTE VIDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Mesurer sur un compte vide ne prouverait rien : c'est précisément le cas où
 * tout est rapide. Le jeu d'essai porte donc trois ans d'activité, avec des
 * ordres de grandeur réalistes pour un indépendant — plusieurs centaines de
 * recettes, autant de mouvements bancaires, un planning complet.
 *
 * Le seuil est volontairement large : il ne s'agit pas d'optimiser au
 * millième, mais d'attraper le jour où un écran passe de 200 ms à 3 secondes.
 * Une régression de cet ordre ne se voit pas autrement — elle s'installe, et
 * on finit par croire que « l'application est lente », sans savoir depuis
 * quand ni à cause de quoi.
 *
 * Usage : node scripts/verifier-vitesse.mjs
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

/**
 * Le plafond, par écran, en millisecondes.
 *
 * 600 ms entre la navigation et le titre visible : au-delà, l'utilisateur
 * perçoit une attente. Le chiffre est un garde-fou, pas un objectif — les
 * mesures réelles doivent rester bien en dessous, et c'est l'écart qui donne
 * la marge.
 */
const PLAFOND_MS = 600;

/** Combien de fois mesurer. La médiane écarte le coup de chaud isolé. */
const PASSAGES = 5;

const ECRANS = ['pilote', 'argent', 'activite', 'facture', 'achats', 'outils', 'config'];

/* ── Le jeu d'essai : trois ans d'activité ────────────────────────────────
   Aucune donnée réelle. Les identités sont synthétiques, les montants tirés
   d'une suite déterministe : un jeu qui change à chaque passage rendrait les
   mesures incomparables d'une exécution à l'autre. */

const ANNEES = [2024, 2025, 2026];

function faitsVolumineux() {
  const clients = Array.from({ length: 8 }, (_, i) => ({
    id: `c${i}`, nom: `Client de démonstration ${i + 1}`,
    adresse: `${i + 1} rue Exemple`, siret: '', email: '',
    delaiPaiementJours: 30 + (i % 3) * 15, pays: 'FR', tvaIntracom: ''
  }));

  const missions = Array.from({ length: 6 }, (_, i) => ({
    id: `m${i}`,
    clientId: `c${i % clients.length}`,
    clientNom: `Client de démonstration ${(i % clients.length) + 1}`,
    description: `Mission de démonstration ${i + 1}`,
    tjm: 450 + i * 25,
    debut: `${ANNEES[i % 3]}-01-01`,
    fin: `${ANNEES[i % 3]}-12-31`,
    statut: i < 4 ? 'active' : 'terminee',
    entites: [{
      id: `m${i}-co1`, nom: `Client final ${i + 1}`, couleur: '',
      adresse: '', contact: '', email: '', telephone: '',
      rythmes: [{
        du: `${ANNEES[i % 3]}-01-01`, au: `${ANNEES[i % 3]}-12-31`,
        parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 0.5 }, tjm: null
      }],
      ajustements: {}
    }]
  }));

  // ~432 recettes : 12 par mois sur 36 mois.
  const recettes = [];
  for (const annee of ANNEES) {
    for (let mois = 1; mois <= 12; mois += 1) {
      for (let n = 0; n < 12; n += 1) {
        const jour = String(1 + ((n * 2) % 27)).padStart(2, '0');
        const mm = String(mois).padStart(2, '0');
        const encaissee = !(annee === 2026 && mois >= 7 && n % 3 === 0);
        recettes.push({
          id: `r-${annee}-${mm}-${n}`,
          clientNom: `Client de démonstration ${(n % clients.length) + 1}`,
          libelle: 'Prestation',
          montant: 900 + ((annee + mois + n) % 7) * 150,
          emiseLe: `${annee}-${mm}-${jour}`,
          encaisseeLe: encaissee ? `${annee}-${mm}-${jour}` : null,
          modeReglement: encaissee ? 'virement' : null,
          numero: `${annee}-${String(mois * 12 + n).padStart(3, '0')}`
        });
      }
    }
  }

  // ~360 dépenses et ~720 mouvements bancaires.
  const depenses = [];
  const mouvementsBancaires = [];
  for (const annee of ANNEES) {
    for (let mois = 1; mois <= 12; mois += 1) {
      const mm = String(mois).padStart(2, '0');
      for (let n = 0; n < 10; n += 1) {
        const jour = String(1 + ((n * 3) % 27)).padStart(2, '0');
        depenses.push({
          id: `d-${annee}-${mm}-${n}`,
          libelle: `Dépense ${n + 1}`, fournisseur: `Fournisseur ${n % 5}`,
          provenance: 'france',
          montantTtc: 40 + ((n + mois) % 9) * 30,
          tauxTva: 0.2, payeeLe: `${annee}-${mm}-${jour}`,
          justificatifId: null, rapprochement: 'en_attente'
        });
        mouvementsBancaires.push({
          id: `mv-d-${annee}-${mm}-${n}`, date: `${annee}-${mm}-${jour}`,
          libelle: `PRLV FOURNISSEUR ${n % 5}`,
          montant: -(40 + ((n + mois) % 9) * 30),
          rapprocheAvec: null, sansContrepartie: null
        });
        mouvementsBancaires.push({
          id: `mv-c-${annee}-${mm}-${n}`, date: `${annee}-${mm}-${jour}`,
          libelle: 'VIR RECU CLIENT',
          montant: 900 + ((annee + mois + n) % 7) * 150,
          rapprocheAvec: null, sansContrepartie: null
        });
      }
    }
  }

  // Un congé par mois, et une échéance par trimestre.
  const conges = [];
  const echeances = [];
  for (const annee of ANNEES) {
    for (let mois = 1; mois <= 12; mois += 1) {
      const mm = String(mois).padStart(2, '0');
      conges.push({ date: `${annee}-${mm}-15`, quotite: 1 });
      if (mois % 3 === 0) {
        echeances.push({
          id: `e-${annee}-${mm}`, nature: 'urssaf', montant: 2400,
          echeanceLe: `${annee}-${mm}-05`,
          payeeLe: annee < 2026 ? `${annee}-${mm}-05` : null,
          montantPaye: null
        });
      }
    }
  }

  return {
    version: 6,
    entreprise: {
      nom: 'Entreprise de démonstration', siret: '', debutActivite: '2024-01-01',
      typeActivite: 'BNC', acre: false, versementLiberatoire: false,
      tvaDepuis: null, tvaIntracom: '', iban: '', bic: '',
      adresse: '1 rue Exemple', codePostal: '75001', ville: 'Paris', codeApe: '',
      email: '', telephone: '', urssafPeriodicite: 'trimestriel', onboardingFait: true
    },
    clients, missions, recettes, depenses, conges, mouvementsBancaires,
    periodesUrssafAjoutees: [],
    soldeInitial: 12000, reserve: 3000, besoinMensuel: 2200,
    periodesDeclarees: [], echeances, configImpotBrute: {}
  };
}

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
  return new Promise((ok) => {
    serveur.listen(0, '127.0.0.1', () => ok({ serveur, port: serveur.address().port }));
  });
}

const echecs = [];
const constate = (ok, message) => {
  console.log(`  ${ok ? '✅' : '❌'} ${message}`);
  if (!ok) echecs.push(message);
};

const mediane = (valeurs) => {
  const triees = [...valeurs].sort((a, b) => a - b);
  return triees[Math.floor(triees.length / 2)];
};

const { serveur, port } = await servir();
const base = `http://127.0.0.1:${port}/`;

const BIN = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navigateur = await chromium.launch(existsSync(BIN) ? { executablePath: BIN } : {});

const FAITS = faitsVolumineux();
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
await contexte.addInitScript((faits) => {
  window.localStorage.setItem('freel.faits.v1', JSON.stringify(faits));
}, FAITS);

const page = await contexte.newPage();

console.log('\n⏱  Vitesse d’affichage sur trois ans d’activité');
console.log(`   ${FAITS.recettes.length} recettes · ${FAITS.depenses.length} dépenses · `
  + `${FAITS.mouvementsBancaires.length} mouvements · ${FAITS.missions.length} missions`);
console.log(`   Médiane de ${PASSAGES} passages, plafond ${PLAFOND_MS} ms\n`);

for (const ecran of ECRANS) {
  const temps = [];

  for (let i = 0; i < PASSAGES; i += 1) {
    // Rechargement complet à chaque passage : rester sur la même page
    // mesurerait un rendu déjà chaud, c'est-à-dire pas grand-chose.
    await page.goto(base, { waitUntil: 'networkidle' });

    const debut = Date.now();
    await page.evaluate((hash) => { window.location.hash = hash; }, `#/${ecran}`);
    try {
      await page.waitForSelector('h1:visible', { timeout: PLAFOND_MS * 8 });
    } catch {
      temps.push(Number.POSITIVE_INFINITY);
      continue;
    }
    temps.push(Date.now() - debut);
  }

  const m = mediane(temps);
  const lisible = Number.isFinite(m) ? `${m} ms` : 'jamais affiché';
  constate(m <= PLAFOND_MS, `#/${ecran} — ${lisible}`);
}

await navigateur.close();
serveur.close();

console.log('\n════════════════════════════════════════════════════');
if (echecs.length > 0) {
  console.log(`❌ ${echecs.length} écran(s) au-delà de ${PLAFOND_MS} ms :`);
  for (const e of echecs) console.log(`   · ${e}`);
  console.log('\n   Avant d’élever le plafond : chercher le sélecteur qui recalcule');
  console.log('   tout à chaque rendu. Mémoïser est permis — STOCKER le résultat');
  console.log('   ne l’est pas (invariant n°5, aucune valeur dérivée persistée).');
  console.log('════════════════════════════════════════════════════');
  process.exit(1);
}
console.log('✅ vitesse : tous les écrans sous le plafond, sur volume réel');
console.log('════════════════════════════════════════════════════');
