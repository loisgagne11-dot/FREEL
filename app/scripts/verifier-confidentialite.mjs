/**
 * Vérification du mode confidentialité.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN FLOU PARTIEL EST PIRE QU'AUCUN FLOU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le mode confidentialité floute les montants pour qu'on puisse partager son
 * écran. Si un seul montant y échappait, l'utilisateur se croirait couvert
 * sans l'être — et c'est la promesse elle-même qui deviendrait le danger.
 *
 * La complétude ne peut donc pas être AFFIRMÉE : elle se constate. Ce script
 * charge les sept écrans dans un navigateur réel, avec des données, cherche
 * tout texte qui ressemble à un montant, et vérifie que chacun est
 * effectivement flouté — en lisant le style CALCULÉ, pas le balisage.
 *
 * C'est le seul contrôle du projet dont l'échec révèle une fuite de données
 * plutôt qu'un défaut d'affichage.
 *
 * Usage : node scripts/verifier-confidentialite.mjs
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

const ECRANS = ['pilote', 'argent', 'outils', 'achats', 'activite', 'config', 'facture'];

/**
 * Des faits qui produisent des montants sur TOUS les écrans.
 *
 * Un écran vide n'affiche aucun montant, et passerait donc le contrôle sans
 * rien prouver. Les valeurs sont synthétiques — aucune donnée réelle n'entre
 * dans le dépôt.
 */
const FAITS = {
  version: 1,
  entreprise: {
    nom: 'Entreprise de démonstration', siret: '', debutActivite: '2024-01-01',
    typeActivite: 'BNC', acre: false, versementLiberatoire: false,
    tvaDepuis: null, tvaIntracom: '', iban: '', bic: '',
    adresse: '1 rue Exemple', codePostal: '75001', ville: 'Paris', codeApe: '',
    email: '', telephone: '', urssafPeriodicite: 'trimestriel', onboardingFait: true
  },
  clients: [{
    id: 'c1', nom: 'Client de démonstration', adresse: '2 rue Exemple', siret: '',
    email: '', delaiPaiementJours: 30, pays: 'FR', tvaIntracom: ''
  }],
  missions: [{
    id: 'm1', clientId: 'c1', clientNom: 'Client de démonstration',
    description: 'Mission de démonstration', tjm: 500,
    debut: '2026-01-01', fin: '2026-12-31', statut: 'active'
  }],
  recettes: [
    {
      id: 'r1', clientNom: 'Client de démonstration', libelle: 'Prestation',
      montant: 8400, emiseLe: '2026-08-01', encaisseeLe: '2026-08-05',
      modeReglement: 'virement', numero: '2026-001'
    },
    {
      id: 'r2', clientNom: 'Client de démonstration', libelle: 'Prestation',
      montant: 5250, emiseLe: '2026-06-01', encaisseeLe: null,
      modeReglement: null, numero: '2026-002'
    }
  ],
  depenses: [{
    id: 'd1', libelle: 'Abonnement logiciel', fournisseur: 'Fournisseur',
    montantTtc: 1200, tauxTva: 0.2, payeeLe: '2026-08-03',
    justificatifId: null, rapprochement: 'a_rapprocher', categorie: 'logiciel',
    provenance: 'france'
  }],
  conges: [], mouvementsBancaires: [], periodesUrssafAjoutees: [],
  soldeInitial: 24500, reserve: 3000, besoinMensuel: 2200,
  periodesDeclarees: [], configImpotBrute: {}
};

/**
 * Ce qui ressemble à un montant.
 *
 * Volontairement large : le symbole « € », ou un nombre à séparateur de
 * milliers. Un motif trop étroit laisserait passer précisément ce qu'on
 * cherche à trouver.
 */
const MOTIF_MONTANT = /(\d[\d  \s]*[,.]?\d*\s*€)|(\d{1,3}(?:[  \s]\d{3})+)/u;

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

const { serveur, port } = await servir();
const base = `http://127.0.0.1:${port}/`;
const BIN = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navigateur = await chromium.launch(existsSync(BIN) ? { executablePath: BIN } : {});

const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
await contexte.addInitScript(([faits, cle]) => {
  window.localStorage.setItem('freel.faits.v1', JSON.stringify(faits));
  window.localStorage.setItem(cle, 'oui');
}, [FAITS, 'freel.confidentialite.v1']);

const page = await contexte.newPage();

/**
 * Les exceptions non rattrapées de l'application.
 *
 * Sans ce relevé, un écran qui tombe se manifeste par une attente de titre qui
 * expire — un message qui décrit le symptôme et jamais la cause. Le coût a été
 * payé une fois : l'écran Activité tombait sur des missions au schéma 1, et le
 * script ne disait rien de plus que « timeout ».
 */
const plantages = [];
page.on('pageerror', (erreur) => { plantages.push(erreur.message); });

/**
 * Cherche les montants LISIBLES.
 *
 * On descend jusqu'aux éléments qui portent eux-mêmes le texte, puis on
 * remonte leurs ancêtres à la recherche d'un filtre de flou. Se contenter de
 * vérifier la présence de `data-montant` ne prouverait rien : l'attribut peut
 * être là sans que la règle CSS s'applique.
 */
async function montantsLisibles() {
  return page.evaluate((source) => {
    const motif = new RegExp(source, 'u');
    const exposes = [];

    for (const el of document.querySelectorAll('#contenu-principal *')) {
      // Seulement les éléments qui portent le texte, pas leurs conteneurs :
      // sinon chaque section remonterait le texte de tous ses enfants.
      const propre = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('');
      if (!motif.test(propre)) continue;
      if (el.closest('[aria-hidden="true"]') !== null) continue;

      let flou = false;
      for (let a = el; a !== null; a = a.parentElement) {
        const f = getComputedStyle(a).filter;
        if (f && f !== 'none' && f.includes('blur')) { flou = true; break; }
      }
      if (!flou) {
        exposes.push({
          texte: propre.trim().slice(0, 60),
          balise: el.tagName.toLowerCase(),
          marque: el.closest('[data-montant]') !== null
        });
      }
    }
    return exposes;
  }, MOTIF_MONTANT.source);
}

console.log('\n🔒 mode confidentialité actif — aucun montant ne doit rester lisible');
for (const ecran of ECRANS) {
  plantages.length = 0;
  await page.goto(`${base}#/${ecran}`, { waitUntil: 'networkidle' });
  // `h1:visible` : un changement de hash ne recharge pas le document, et
  // pendant la suspension du chunk suivant React garde l'écran précédent monté
  // en `display: none`. Attendre un `h1` quelconque, c'est attendre ce titre-là.
  let monte = true;
  try {
    await page.waitForSelector('h1:visible', { timeout: 10000 });
  } catch {
    monte = false;
  }
  await page.waitForTimeout(150);

  // Un écran qui ne se monte pas n'affiche aucun montant : il passerait le
  // contrôle en ne prouvant rien. On le compte donc comme un échec, en citant
  // l'exception plutôt que l'attente qui a expiré.
  if (!monte) {
    constate(false, `#/${ecran} — l’écran ne s’est pas monté`
      + (plantages.length > 0 ? ` : ${plantages[0]}` : ''));
    continue;
  }

  const exposes = await montantsLisibles();
  constate(
    exposes.length === 0,
    `#/${ecran} — aucun montant lisible`
      + (exposes.length > 0
        ? ` (${exposes.length} exposé(s) : ${exposes.slice(0, 4).map((e) => `« ${e.texte} »`).join(', ')})`
        : '')
  );
}

/* ── Le mode inactif ne doit rien flouter ──────────────────────────────── */

console.log('\n👁 mode inactif — les montants doivent redevenir lisibles');
{
  const propre = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
  await propre.addInitScript((faits) => {
    window.localStorage.setItem('freel.faits.v1', JSON.stringify(faits));
  }, FAITS);
  const p2 = await propre.newPage();
  await p2.goto(`${base}#/pilote`, { waitUntil: 'networkidle' });
  await p2.waitForSelector('h1', { timeout: 10000 });

  const flous = await p2.evaluate(() =>
    [...document.querySelectorAll('[data-montant]')]
      .filter((el) => getComputedStyle(el).filter.includes('blur')).length
  );
  const marques = await p2.evaluate(() => document.querySelectorAll('[data-montant]').length);

  constate(flous === 0, `aucun flou quand le mode est inactif (${flous})`);
  // Sans montant marqué, le contrôle précédent passerait pour de mauvaises
  // raisons : il n'aurait simplement rien à vérifier.
  constate(marques > 0, `des montants sont bien marqués sur le Pilote (${marques})`);

  await propre.close();
}

await navigateur.close();
serveur.close();

console.log(`\n${'═'.repeat(52)}`);
if (echecs.length === 0) {
  console.log('✅ confidentialité : aucun montant ne fuit');
} else {
  console.log(`❌ ${echecs.length} fuite(s) :`);
  echecs.forEach((e) => console.log(`   · ${e}`));
}
console.log('═'.repeat(52));
process.exit(echecs.length > 0 ? 1 : 0);
