/**
 * Vérification responsive automatisée.
 *
 * Cette vérification existe parce que la promesse « PC et mobile » doit être
 * VÉRIFIABLE et non déclarative. L'ancienne version affirmait être responsive
 * tout en recalculant ses grilles en JavaScript, avec un bug jamais détecté :
 * élargir la fenêtre au-delà de 600 px ne les restaurait plus. Une capture
 * d'écran de complaisance n'aurait rien montré ; une assertion, oui.
 *
 * Ce qui est vérifié, sur chaque taille et chaque palette :
 *   1. aucun débordement horizontal de la page ;
 *   2. le rail est latéral en desktop et le dock flottant en portrait ;
 *   3. les cibles tactiles de navigation atteignent 44 px en portrait ;
 *   4. le thème est appliqué avant le premier rendu (pas de flash).
 *
 * Usage : node scripts/verifier-responsive.mjs [--captures]
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { mkdir } from 'node:fs/promises';

const RACINE = new URL('../dist/', import.meta.url).pathname;
const AVEC_CAPTURES = process.argv.includes('--captures');

const TAILLES = [
  { nom: 'mobile-390', largeur: 390, hauteur: 844, portrait: true },
  { nom: 'mobile-360', largeur: 360, hauteur: 740, portrait: true },
  { nom: 'tablette-760', largeur: 760, hauteur: 1024, portrait: true },
  { nom: 'desktop-1150', largeur: 1150, hauteur: 800, portrait: false },
  { nom: 'desktop-1440', largeur: 1440, hauteur: 900, portrait: false }
];

const PALETTES = ['sombre', 'nuit', 'clair', 'calme'];

/**
 * Les écrans réellement construits. Ne tester que l'accueil laissait les autres
 * hors contrôle : un débordement horizontal sur Argent, l'écran le plus dense,
 * n'aurait été vu par personne.
 */
const ECRANS = [
  { hash: '#/pilote', nom: 'pilote' },
  { hash: '#/argent', nom: 'argent' },
  { hash: '#/outils', nom: 'outils' },
  { hash: '#/achats', nom: 'achats' },
  { hash: '#/activite', nom: 'activite' },
  { hash: '#/config', nom: 'config' },
  { hash: '#/facture', nom: 'facture' }
];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

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
  return new Promise((resoudre) => {
    serveur.listen(0, '127.0.0.1', () => resoudre({ serveur, port: serveur.address().port }));
  });
}

const echecs = [];
const constate = (ok, message) => {
  console.log(`  ${ok ? '✅' : '❌'} ${message}`);
  if (!ok) echecs.push(message);
};

const { serveur, port } = await servir();
const base = `http://127.0.0.1:${port}/`;
// Chromium est préinstallé dans l'environnement, à une version qui ne
// correspond pas forcément à celle attendue par le paquet Playwright. On
// pointe explicitement le binaire fourni au lieu d'en télécharger un autre.
const CHROMIUM_FOURNI = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { existsSync } = await import('node:fs');
const navigateur = await chromium.launch(
  existsSync(CHROMIUM_FOURNI) ? { executablePath: CHROMIUM_FOURNI } : {}
);

if (AVEC_CAPTURES) await mkdir(new URL('../captures/', import.meta.url).pathname, { recursive: true });

for (const taille of TAILLES) {
  console.log(`\n📐 ${taille.nom} (${taille.largeur}×${taille.hauteur})`);
  for (const palette of PALETTES) {
    const contexte = await navigateur.newContext({
      viewport: { width: taille.largeur, height: taille.hauteur }
    });
    // Le thème est posé AVANT le chargement, pour vérifier que le script
    // inline de `index.html` l'applique sans flash.
    await contexte.addInitScript((p) => {
      window.localStorage.setItem('freel-v111-theme', p);

      /*
       * Une facture en retard, et rien d'autre.
       *
       * Elle ne sert qu'à faire EXISTER la pastille « à traiter » : sur un
       * stockage vierge il n'y a aucun sujet, la pastille disparaît — ce qui
       * est le comportement voulu — et l'assertion qui vérifie sa position ne
       * s'exécutait jamais. Un contrôle qui ne s'exécute pas ne protège de
       * rien : c'est ainsi qu'un `backdrop-filter` a pu l'expédier à −72 px
       * sans que ces 140 combinaisons s'en aperçoivent.
       *
       * Émise en 2020 : en retard quelle que soit la date à laquelle ce script
       * est relancé, sans horloge à figer.
       */
      window.localStorage.setItem('freel.faits.v1', JSON.stringify({
        version: 6,
        entreprise: {
          nom: 'Atelier de démonstration', siret: '', adresse: '', codePostal: '',
          ville: '', typeActivite: 'BNC', debutActivite: '2020-01-01',
          urssafPeriodicite: 'trimestriel', tvaDepuis: null, tvaIntracom: '',
          acre: false, versementLiberatoire: false
        },
        clients: [], missions: [], depenses: [], echeances: [],
        periodesDeclarees: [], mouvementsBancaires: [], conges: [],
        periodesUrssafSaisies: [], baremesImpot: [],
        soldeInitial: 0, reserve: 0, besoinMensuel: 0,
        recettes: [{
          id: 'r1', clientNom: 'Client de démonstration', libelle: 'Prestation',
          montant: 1000, emiseLe: '2020-01-15', encaisseeLe: null,
          modeReglement: null, numero: '2020-001'
        }]
      }));
    }, palette);

    const page = await contexte.newPage();

    for (const ecran of ECRANS) {
    await page.goto(base + ecran.hash, { waitUntil: 'networkidle' });
    // Les écrans autres que l'accueil sont chargés à la demande : on attend que
    // leur titre soit rendu, sinon on mesurerait l'écran d'attente.
    //
    // `h1:visible` et non `h1` : un changement de hash ne recharge pas le
    // document, et pendant la suspension du chunk suivant React laisse l'écran
    // précédent monté en `display: none`. Un `h1` tout court se satisfait de ce
    // titre fantôme, puis expire en l'attendant visible.
    await page.waitForSelector('h1:visible', { timeout: 10000 });

    const mesures = await page.evaluate(() => {
      // La navigation PRINCIPALE, désignée par son nom accessible.
      //
      // `document.querySelector('nav')` prenait le premier <nav> venu. Le
      // jour où le Pilote a reçu sa rangée d'actions rapides — un second
      // <nav>, légitime et nommé — le compte d'onglets est passé à douze et
      // le contrôle a échoué sur les quatre palettes. Il mesurait « le
      // premier nav de la page », pas « le rail de navigation ».
      const nav = document.querySelector('nav[aria-label="Navigation principale"]');
      const style = nav ? getComputedStyle(nav) : null;
      const liens = nav ? [...nav.querySelectorAll('a')] : [];
      const hauteurs = liens.map((a) => a.getBoundingClientRect().height);
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        largeurDocument: document.documentElement.scrollWidth,
        largeurFenetre: window.innerWidth,
        navPresente: nav !== null,
        navPosition: style?.position ?? null,
        nbLiens: liens.length,
        // On mesure le LIBELLÉ, pas le texte du lien : celui-ci contient
        // aussi le chiffre du badge, présent même quand le libellé est masqué.
        // `offsetParent === null` détecte un `display: none`, y compris posé
        // par une règle de média.
        nbLibellesVisibles: liens.filter(
          (a) => a.querySelector('[data-role="libelle"]')?.offsetParent != null
        ).length,
        libelleSurLActif: liens
          .filter((a) => a.querySelector('[data-role="libelle"]')?.offsetParent != null)
          .every((a) => a.getAttribute('aria-current') === 'page'),
        hauteurMiniLien: hauteurs.length > 0 ? Math.min(...hauteurs) : 0,
        contenuPresent: document.getElementById('contenu-principal') !== null,
        /*
         * La pastille « à traiter », si elle est là, est-elle DANS la fenêtre ?
         *
         * Elle flotte en `position: fixed`. Un ancêtre portant un `filter`,
         * un `transform` ou un `backdrop-filter` devient son bloc conteneur —
         * et elle part alors hors écran sans qu'aucune erreur ne soit levée.
         * C'est arrivé : douze pixels de flou invisibles sur la barre du haut
         * l'expédiaient à −72 px. On mesure, plutôt que de faire confiance.
         *
         * Rendu conditionnel : l'absence de sujet à traiter est un état
         * normal, et la pastille disparaît alors — ce que ce contrôle ne doit
         * pas confondre avec un échec.
         */
        pastilleDansLaFenetre: (() => {
          const b = [...document.querySelectorAll('button')]
            .find((x) => /à traiter/.test(x.textContent || ''));
          if (!b) return null;
          const r = b.getBoundingClientRect();
          return r.top >= 0 && r.left >= 0
            && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
        })(),
        couleurFond: getComputedStyle(document.body).backgroundColor
      };
    });

    const prefixe = `[${palette}/${ecran.nom}]`;
    constate(mesures.theme === palette, `${prefixe} thème appliqué avant le rendu`);
    // Le point dur : zéro débordement horizontal. Une tolérance de 1 px
    // absorbe les arrondis de rendu, pas une colonne trop large.
    constate(
      mesures.largeurDocument <= mesures.largeurFenetre + 1,
      `${prefixe} aucun débordement horizontal (${mesures.largeurDocument} ≤ ${mesures.largeurFenetre})`
    );
    constate(mesures.navPresente && mesures.nbLiens === 7, `${prefixe} 7 onglets de navigation`);
    constate(mesures.contenuPresent, `${prefixe} contenu principal présent et ciblable`);
    if (mesures.pastilleDansLaFenetre !== null) {
      constate(
        mesures.pastilleDansLaFenetre,
        `${prefixe} la pastille « à traiter » reste dans la fenêtre`
      );
    }

    if (taille.portrait) {
      constate(mesures.navPosition === 'fixed', `${prefixe} dock flottant en portrait`);
      // Exigence de la cible : sept onglets dans ~340 px ne tiennent que si
      // un seul porte son libellé. La règle vit en CSS ; sans assertion, une
      // refonte de la feuille la casserait sans que rien ne le signale.
      constate(
        mesures.nbLibellesVisibles === 1,
        `${prefixe} un seul libellé d'onglet en portrait (${mesures.nbLibellesVisibles})`
      );
      constate(
        mesures.libelleSurLActif,
        `${prefixe} le libellé visible est celui de l'onglet actif`
      );
      constate(
        mesures.hauteurMiniLien >= 44,
        `${prefixe} cibles tactiles ≥ 44 px (${Math.round(mesures.hauteurMiniLien)} px)`
      );
    } else {
      /*
       * CE QUE CETTE ASSERTION VEUT DIRE : un RAIL, pas un dock.
       *
       * Elle exigeait `static`, ce qui n'était qu'un proxy — en portrait le
       * dock est `fixed`, et `static` suffisait à l'en distinguer. Le rail est
       * passé en `sticky` pour qu'il garde son fond sur une page longue : en
       * `static` avec `height: 100dvh`, sa colonne perdait fond et bordure aux
       * deux tiers d'une page de trois mille six cents pixels.
       *
       * `sticky` reste dans le flux, occupe sa colonne et ne recouvre rien —
       * c'est bien un rail. Seul `fixed` en ferait un dock, et c'est cela que
       * l'assertion doit refuser.
       */
      constate(
        mesures.navPosition === 'static' || mesures.navPosition === 'sticky',
        `${prefixe} rail latéral en desktop (${mesures.navPosition})`
      );
      // En desktop la place existe : tous les onglets sont nommés. Un rail
      // d'icônes muettes obligerait à deviner.
      constate(
        mesures.nbLibellesVisibles === ECRANS.length,
        `${prefixe} tous les onglets nommés en desktop (${mesures.nbLibellesVisibles})`
      );
    }

    if (AVEC_CAPTURES) {
      await page.screenshot({
        path: new URL(`../captures/${taille.nom}-${palette}-${ecran.nom}.png`, import.meta.url).pathname
      });
    }
    }
    await contexte.close();
  }
}

await navigateur.close();
serveur.close();

console.log(`\n${'═'.repeat(52)}`);
if (echecs.length === 0) {
  console.log(
    `✅ ${TAILLES.length} tailles × ${PALETTES.length} palettes × ${ECRANS.length} écrans `
    + `= ${TAILLES.length * PALETTES.length * ECRANS.length} combinaisons : tout est conforme`
  );
} else {
  console.log(`❌ ${echecs.length} échec(s) :`);
  echecs.forEach((e) => console.log(`   · ${e}`));
}
console.log('═'.repeat(52));
process.exit(echecs.length > 0 ? 1 : 0);
