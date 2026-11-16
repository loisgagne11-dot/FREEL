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
 *   4. le thème est appliqué avant le premier rendu (pas de flash) ;
 *   5. chaque contrôle de la barre du haut reste dans la fenêtre, et la
 *      synchronisation y est ÉCRITE au bureau (lot 51, décision 2).
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
  // Chaque section des Réglages arrive à la demande, APRÈS le titre de
  // l'écran : sans attendre son contenu, on mesurait un panneau vide. Seul
  // `#/config` (Profil) était visité, et l'adresse Légifrance des Paramètres
  // fiscaux élargissait la page à 609 px sur téléphone sans que rien ne le voie.
  { hash: '#/config/fiscal', nom: 'config-fiscal', attendre: 'text=Ajouter une période' },
  { hash: '#/config/reserve', nom: 'config-reserve', attendre: 'text=Part gardée à chaque versement' },
  { hash: '#/config/facturation', nom: 'config-facturation', attendre: 'text=Mentions portées' },
  { hash: '#/config/livre', nom: 'config-livre', attendre: 'text=Ouvrir le livre des recettes' },
  { hash: '#/config/compte', nom: 'config-compte', attendre: 'h2:has-text("Compte & synchronisation")' },
  { hash: '#/config/donnees', nom: 'config-donnees', attendre: 'text=Archive complète (ZIP)' },
  // Le thème et le masquage des montants y vivent depuis le lot 51 : quatre
  // cartes côte à côte au bureau, deux par deux au téléphone.
  { hash: '#/config/affichage', nom: 'config-affichage', attendre: 'text=Le thème choisi reste mémorisé' },
  // La liste des factures est un onglet d'Activité (formule A du rail) ; la
  // rédaction reste sous `#/facture/…`, et c'est l'un des écrans les plus denses.
  { hash: '#/activite/factures', nom: 'factures' },
  { hash: '#/facture/nouvelle', nom: 'facture-nouvelle' }
];

/**
 * Les entrées du rail : six, comme le handoff (décision n° 2, formule A).
 *
 * Ce n'est plus le nombre d'écrans : la liste des factures vit sous Activité,
 * et le pied du rail porte deux liens de plus (livre des recettes, carte de
 * l'utilisateur) qui ne sont pas des entrées — masqués sur téléphone, ils
 * tiraient la plus petite cible tactile à 0 px.
 */
const ENTREES_DU_RAIL = 6;

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
// Le lien stable, pas le dossier versionné : « chromium-1194 » a disparu de
// l'image le 13/11, et ce contrôle tombait avant d'avoir rien vérifié.
const CHROMIUM_FOURNI = '/opt/pw-browsers/chromium';
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
       * Elle faisait EXISTER la pastille « à traiter » de la barre du haut,
       * dont la position était contrôlée — un `backdrop-filter` l'avait
       * expédiée à −72 px sans que personne le voie. La pastille est partie au
       * lot 51 ; la facture fait toujours exister un compteur du rail, et une
       * année de plus dans les menus d'années — de quoi élargir ce qu'on
       * mesure, plutôt que de mesurer un écran vide.
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
    if (ecran.attendre) await page.waitForSelector(ecran.attendre, { state: 'visible', timeout: 10000 });
    // La barre du haut arrive à la demande, après l'écran : sans l'attendre, on
    // mesurerait une barre vide et le contrôle de ses boutons ne dirait rien.
    await page.waitForSelector('header[aria-label="Barre du haut"] [data-role="libelle-synchro"]',
      { state: 'attached', timeout: 10000 });

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
      const liens = nav ? [...nav.querySelectorAll('a[data-role="entree"]')] : [];
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
         * Les contrôles de la barre du haut sont-ils DANS la fenêtre ?
         *
         * Un débordement de la barre ne se voit pas forcément dans la largeur
         * du document : un contrôle poussé hors du bord, ou une barre qui ne
         * se replie pas, et « + Nouveau » devient inatteignable sans aucune
         * erreur. La pastille « à traiter » avait été envoyée à −72 px par un
         * `backdrop-filter` invisible. La barre ne porte plus de période ni
         * d'export (lot 51), mais elle ÉCRIT désormais la synchronisation au
         * bureau — « Session expirée » est plus long que l'ancien point.
         */
        controlesHorsFenetre: (() => {
          const barre = document.querySelector('header[aria-label="Barre du haut"]');
          if (!barre) return ['barre du haut introuvable'];
          return [...barre.querySelectorAll('a, button')]
            .filter((x) => x.getClientRects().length > 0)
            .filter((x) => {
              const r = x.getBoundingClientRect();
              return r.left < 0 || r.right > window.innerWidth + 1 || r.top < 0;
            })
            .map((x) => (x.getAttribute('aria-label') || x.textContent || x.tagName).trim().slice(0, 40));
        })(),
        nbControlesBarre: document.querySelectorAll('header[aria-label="Barre du haut"] a, header[aria-label="Barre du haut"] button').length,
        /* La synchronisation est-elle LISIBLE, et pas seulement présente dans
           l'arbre ? Le libellé passait en hors-écran sous 1 680 px. */
        synchroEcrite: (() => {
          const e = document.querySelector('header[aria-label="Barre du haut"] [data-role="libelle-synchro"]');
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return r.width > 20 && r.height > 0 && getComputedStyle(e).display !== 'none';
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
    constate(
      mesures.navPresente && mesures.nbLiens === ENTREES_DU_RAIL,
      `${prefixe} ${ENTREES_DU_RAIL} entrées de navigation (${mesures.nbLiens})`
    );
    constate(mesures.contenuPresent, `${prefixe} contenu principal présent et ciblable`);
    constate(
      mesures.nbControlesBarre >= 4 && mesures.controlesHorsFenetre.length === 0,
      `${prefixe} les ${mesures.nbControlesBarre} contrôles de la barre du haut restent dans la fenêtre`
        + (mesures.controlesHorsFenetre.length > 0 ? ` (hors : ${mesures.controlesHorsFenetre.join(', ')})` : '')
    );
    // Au bureau, la synchronisation se LIT (décision 2) ; au téléphone, c'est
    // une icône nommée — le libellé s'efface, le nom accessible reste.
    constate(
      mesures.synchroEcrite === !taille.portrait,
      `${prefixe} synchronisation ${taille.portrait ? 'en icône' : 'écrite'} (${mesures.synchroEcrite})`
    );

    if (taille.portrait) {
      constate(mesures.navPosition === 'fixed', `${prefixe} dock flottant en portrait`);
      // Exigence de la cible : six onglets dans ~340 px ne tiennent que si
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
        mesures.nbLibellesVisibles === ENTREES_DU_RAIL,
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
