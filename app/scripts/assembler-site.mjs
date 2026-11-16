/**
 * Assemble le site publié : la bascule.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LE SITE DEVIENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   /            la nouvelle application (app/dist)
 *   /legacy/     l'ancienne, EN LECTURE SEULE
 *   /v2/         redirige vers /, en gardant l'écran demandé (#/argent…)
 *
 * Jusqu'au lot 24, l'ancienne vivait à la racine et la nouvelle sous /v2/ :
 * on ouvrait par habitude celle qu'on ne devait plus remplir, et les deux
 * divergeaient. Une seule version écrit désormais.
 *
 * `index.html` reste à la racine du DÉPÔT, inchangé : c'est la référence
 * fonctionnelle de l'ancienne application, et la règle du projet interdit de
 * la toucher. La lecture seule est posée sur la COPIE publiée, ici.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LA LECTURE SEULE, ET PAS LA SUPPRESSION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application reste le seul endroit où relire ses anciens écrans
 * pendant qu'on vérifie la reprise mission par mission. Mais une saisie faite
 * là-bas ne parviendrait jamais à la nouvelle — elle serait perdue en
 * silence, ou pire, poussée vers le compte et reprise par-dessus des données
 * plus récentes. Elle se consulte donc, et n'écrit plus rien : ni dans le
 * stockage du navigateur, ni vers le compte.
 *
 * Même origine (loisgagne11-dot.github.io), même stockage : la nouvelle
 * version, à la racine, continue de lire les données de l'ancienne pour la
 * reprise. C'est pour cela que l'ancienne ne doit plus les modifier.
 *
 * Usage : node scripts/assembler-site.mjs <dossier de sortie>
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Le garde posé en tête de l'ancienne application.
 *
 * Il s'exécute avant tout autre script de la page : une bibliothèque qui
 * capture `fetch` ou `localStorage` à son chargement capture donc la version
 * gardée.
 *
 * - Stockage : `localStorage` est remplacé par un mandataire dont les
 *   écritures (`setItem`, `removeItem`, `clear`, affectation directe) ne font
 *   rien. Les lectures passent. Remplacer `setItem` sur le prototype ne
 *   suffisait pas : `localStorage.cle = …` ne passe pas par lui.
 * - Réseau : seules les lectures (GET, HEAD, OPTIONS) partent. Une écriture
 *   vers le compte échoue comme une coupure réseau, que l'ancienne
 *   application sait déjà afficher.
 * - Un bandeau dit, en haut de chaque écran, que rien n'est enregistré, et
 *   mène à la nouvelle version.
 * - Cadre (lot 58) : affichée dans un cadre par une autre page, elle s'arrête
 *   et reste vide, comme la nouvelle. Lecture seule ou non, ses boutons
 *   d'export et de navigation restaient cliquables sous un calque tiers.
 */
export const GARDE_LECTURE_SEULE = `<script data-freel-lecture-seule>
(function () {
  'use strict';
  if (window.top !== window.self) {
    window.stop();
    document.documentElement.replaceChildren();
    throw new Error('Freel refuse de s’afficher dans un cadre.');
  }
  var LECTURE = /^(GET|HEAD|OPTIONS)$/i;
  var ECRITURES = { setItem: 1, removeItem: 1, clear: 1 };
  try {
    var reel = window.localStorage;
    var garde = new Proxy(reel, {
      get: function (cible, nom) {
        if (Object.prototype.hasOwnProperty.call(ECRITURES, nom)) return function () {};
        var valeur = Reflect.get(cible, nom);
        return typeof valeur === 'function' ? valeur.bind(cible) : valeur;
      },
      set: function () { return true; },
      deleteProperty: function () { return true; },
      defineProperty: function () { return true; }
    });
    // Seconde ligne, pour un navigateur qui refuserait de redéfinir
    // \`window.localStorage\` : les écritures du prototype deviennent sans effet
    // sur ce stockage-là.
    var proto = Storage.prototype;
    Object.keys(ECRITURES).forEach(function (nom) {
      var original = proto[nom];
      proto[nom] = function () { if (this === reel) return; return original.apply(this, arguments); };
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: false, enumerable: true, get: function () { return garde; }
    });
  } catch (e) { /* stockage indisponible, ou déjà gardé par le prototype */ }

  var fetchReel = window.fetch;
  if (typeof fetchReel === 'function') {
    window.fetch = function (entree, init) {
      var methode = (init && init.method) || (entree && typeof entree === 'object' && entree.method) || 'GET';
      if (!LECTURE.test(methode)) {
        return Promise.reject(new TypeError('Ancienne version en lecture seule : rien n’est envoyé au compte.'));
      }
      return fetchReel.apply(this, arguments);
    };
  }
  var ouvrir = XMLHttpRequest.prototype.open;
  var envoyer = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (methode) {
    this.__freelEcriture = !LECTURE.test(String(methode));
    return ouvrir.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__freelEcriture) {
      var requete = this;
      setTimeout(function () { requete.dispatchEvent(new ProgressEvent('error')); }, 0);
      return;
    }
    return envoyer.apply(this, arguments);
  };
  if (navigator.sendBeacon) navigator.sendBeacon = function () { return false; };

  function bandeau() {
    if (document.getElementById('freel-lecture-seule')) return;
    var b = document.createElement('div');
    b.id = 'freel-lecture-seule';
    b.setAttribute('role', 'note');
    b.style.cssText = 'position:sticky;top:0;z-index:2147483647;display:flex;flex-wrap:wrap;gap:6px 12px;'
      + 'align-items:center;justify-content:center;padding:8px 16px;background:#7c2d12;color:#fff;'
      + 'font:600 13px/1.4 system-ui,sans-serif;text-align:center';
    b.appendChild(document.createTextNode('Ancienne version, en lecture seule : rien n’y est enregistré.'));
    var lien = document.createElement('a');
    lien.href = '../';
    lien.textContent = 'Ouvrir la nouvelle version';
    lien.style.cssText = 'color:#fff;text-decoration:underline';
    b.appendChild(lien);
    document.body.insertBefore(b, document.body.firstChild);
    // Collé SOUS l'en-tête fixe de l'ancienne application, qui réserve sa
    // hauteur par la marge du corps : collé à 0, le bandeau passait par-dessus
    // ses boutons de navigation dès qu'on faisait défiler.
    var caler = function () { b.style.top = getComputedStyle(document.body).paddingTop; };
    caler();
    window.addEventListener('resize', caler);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bandeau);
  else bandeau();
})();
</script>`;

/**
 * Les trois balises qui interdisaient au navigateur de garder l'ancienne
 * version en cache. Elles servaient à pousser chaque mise à jour sans
 * attendre ; une version figée n'a plus de mise à jour à pousser, et les
 * garder rechargerait 1,8 Mo à chaque consultation.
 */
const ANTI_CACHE = [
  /\s*<meta http-equiv="Cache-Control"[^>]*>/i,
  /\s*<meta http-equiv="Pragma"[^>]*>/i,
  /\s*<meta http-equiv="Expires"[^>]*>/i
];

/*
 * ─────────────────────────────────────────────────────────────────────────
 * LA COPIE PUBLIÉE EST BRIDÉE (lot 58, constat S1)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne version vit sur la MÊME origine que la nouvelle : elle lit ce
 * que la nouvelle stocke — jetons de session, faits, pièces. Elle chargeait
 * le client Supabase depuis trois CDN, en version flottante (`@2`) et sans
 * empreinte : qui corrompait l'un d'eux exécutait son code ici, avec accès à
 * tout. Le troisième répondait 404 depuis des mois.
 *
 * L'original ne change pas (règle du dépôt) : tout se pose sur la copie.
 *   - Une seule source, épinglée, avec son empreinte : un fichier modifié est
 *     refusé par le navigateur. Le fichier vient de npm tel quel (jsDelivr ne
 *     le reminifie pas), son empreinte est donc stable.
 *   - Une politique de contenu : scripts de l'origine et des deux FICHIERS
 *     qu'elle charge (chemins exacts, pas des hôtes entiers) ; connexions
 *     vers Supabase seulement ; objets, base et formulaires fermés.
 *     `'unsafe-inline'` reste : l'ancienne version pose des `onclick` dans
 *     son HTML, et la priver de ses scripts en ligne l'éteindrait. Le
 *     projet Supabase est saisi à l'exécution : le nommer ici mettrait son
 *     adresse dans le dépôt, d'où le joker du domaine.
 *   - Aucun référent : l'adresse de la page ne part pas chez les tiers.
 */
export const SUPABASE_EPINGLE = {
  url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.47.12/dist/umd/supabase.min.js',
  integrite: 'sha384-AvvgxQvsvq3Z0cl73ZPiMA8faxkbYol1FE5ZYWzhS249M5K0Dm42BvVGzf9Zo06P'
};

/** Le visualiseur de PDF, déjà chargé par l'original avec son empreinte. */
const PDFOBJECT = 'https://cdnjs.cloudflare.com/ajax/libs/pdfobject/2.1.1/pdfobject.min.js';

export const POLITIQUE_ANCIENNE = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${SUPABASE_EPINGLE.url} ${PDFOBJECT}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  // Le manifeste de l'original est une adresse data: ; sans cette ligne,
  // chaque ouverture laisse une erreur en console.
  "manifest-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

const CHARGEUR_ORIGINAL = /var cdns = \[\s*'https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\/dist\/umd\/supabase\.min\.js',\s*'https:\/\/unpkg\.com[^']*',\s*'https:\/\/cdnjs\.cloudflare\.com[^']*'\s*\];/;

/** Remplace le chargeur aux trois sources flottantes par la source épinglée. */
export function epinglerSupabase(html) {
  if (!CHARGEUR_ORIGINAL.test(html) || !html.includes("s.crossOrigin = 'anonymous';")) {
    // L'original a changé : on s'arrête plutôt que de publier une copie dont
    // le chargeur ne serait plus bridé, sans que rien ne le dise.
    throw new Error('Chargeur Supabase de l’ancienne version introuvable : la copie ne peut pas être épinglée.');
  }
  return html
    .replace(CHARGEUR_ORIGINAL, `var cdns = ['${SUPABASE_EPINGLE.url}'];`)
    .replace("s.crossOrigin = 'anonymous';", `s.crossOrigin = 'anonymous'; s.integrity = '${SUPABASE_EPINGLE.integrite}';`);
}

/** La copie publiée de l'ancienne application : gardée, bridée, et sans anti-cache. */
export function ancienneEnLectureSeule(html) {
  let sortie = epinglerSupabase(html);
  for (const motif of ANTI_CACHE) sortie = sortie.replace(motif, '');
  const tete = sortie.match(/<head[^>]*>/i);
  if (tete === null || tete.index === undefined) {
    throw new Error('Ancienne application sans <head> : le garde ne peut pas passer avant ses scripts.');
  }
  const apres = tete.index + tete[0].length;
  // En TÊTE de <head> : une politique en <meta> ne vaut que pour ce qui la
  // suit, et le garde de lecture seule doit passer avant tout autre script.
  const bride = `<meta http-equiv="Content-Security-Policy" content="${POLITIQUE_ANCIENNE}">\n`
    + '<meta name="referrer" content="no-referrer">\n';
  return `${sortie.slice(0, apres)}\n${bride}${GARDE_LECTURE_SEULE}${sortie.slice(apres)}`;
}

/**
 * /v2/ : l'adresse qu'on a utilisée pendant toute la refonte, et qu'on a
 * peut-être en favori. Elle mène à la racine en gardant l'écran (#/argent),
 * que l'application ramène ensuite à son nom d'aujourd'hui (#/tresorerie).
 * `replace` plutôt qu'un lien : le bouton « précédent » ne doit pas ramener
 * sur une page qui renvoie aussitôt ailleurs.
 */
export const PAGE_V2 = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Freel</title>
<meta http-equiv="refresh" content="0; url=../">
<script>location.replace('../' + location.hash);</script>
</head>
<body>
<p>La nouvelle version a déménagé : <a href="../">ouvrir Freel</a>.</p>
</body>
</html>
`;

export function assembler(sortie) {
  const dist = join(DEPOT, 'app', 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    throw new Error('app/dist est vide : lancer « npm run build » avant d’assembler le site.');
  }
  rmSync(sortie, { recursive: true, force: true });
  mkdirSync(sortie, { recursive: true });
  cpSync(dist, sortie, { recursive: true });

  mkdirSync(join(sortie, 'legacy'), { recursive: true });
  const ancienne = readFileSync(join(DEPOT, 'index.html'), 'utf8');
  writeFileSync(join(sortie, 'legacy', 'index.html'), ancienneEnLectureSeule(ancienne));

  mkdirSync(join(sortie, 'v2'), { recursive: true });
  writeFileSync(join(sortie, 'v2', 'index.html'), PAGE_V2);

  // Sans lui, Jekyll ignorerait les fichiers qui commencent par un tiret bas.
  writeFileSync(join(sortie, '.nojekyll'), '');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sortie = resolve(process.argv[2] ?? '_site');
  assembler(sortie);
  console.log(`Site assemblé dans ${sortie} : nouvelle version à la racine, ancienne sous /legacy/ (lecture seule), /v2/ redirigé.`);
}
