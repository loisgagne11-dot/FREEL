/**
 * FREEL - Smoke Tests
 *
 * Usage: node tests/smoke-test.js
 * Requires: Node.js (pas de dépendances externes)
 *
 * RÈGLES DE CE HARNAIS — à ne pas contourner :
 *
 * 1. Une exception est un ÉCHEC. Jamais de catch qui avale l'erreur en
 *    la commentant « trop complexe à tester ». Un test vert doit
 *    signifier quelque chose, sinon il autorise à avancer à l'aveugle.
 * 2. Un plancher d'assertions est vérifié à la fin. Si un bloc entier
 *    cesse de s'exécuter, le compte chute et le harnais échoue — sans
 *    ce garde-fou, supprimer des tests fait « passer » la suite.
 * 3. Aucune donnée personnelle ici. Ni SIRET, ni IBAN, ni nom réels :
 *    ce fichier est public. Les valeurs de test sont synthétiques.
 * 4. On teste le COMPORTEMENT, pas le texte source. Une assertion sur
 *    `html.includes('standard: 0.246')` casse au premier changement de
 *    barème tout en ne prouvant rien sur le calcul.
 * 5. Le balayage de données personnelles du §4 porte sur TOUT le dépôt,
 *    donc aussi sur `app/`. Il est appelé par `npm run verifier` côté app
 *    (script `verifier:fuites`) : sans ce lien, écrire un nouvel écran ne
 *    déclenchait pas le garde-fou, et la fuite n'était vue qu'en CI.
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  ✅ ' + message);
  } else {
    failed++;
    console.log('  ❌ ' + message);
  }
}

function section(title) {
  console.log('\n📋 ' + title);
}

// Nombre minimum d'assertions attendues, calibré juste sous le compte
// réel (61) pour qu'un bloc entier qui cesse de s'exécuter fasse échouer
// la suite. À augmenter quand on ajoute des tests, JAMAIS à baisser pour
// faire passer la suite : une marge trop large rend ce garde-fou inutile.
const MIN_ASSERTIONS = 84;

// Valeurs de test synthétiques (surtout pas de données réelles).
const SIRET_VALIDE = '12345678901237';   // Luhn valide (vérifié)
const SIRET_INVALIDE = '12345678901234'; // Luhn invalide

// ===== 1. Charger le fichier HTML et extraire le JS =====
section('Chargement du fichier');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

assert(html.length > 0, 'index.html chargé (' + Math.round(html.length / 1024) + ' KB)');
assert(html.includes('<html'), 'Contient balise <html>');
assert(html.includes('</html>'), 'Contient balise </html>');

// ===== 2. Vérifier les fonctions critiques =====
section('Fonctions critiques présentes');

const criticalFunctions = [
  'function compute()',
  'function render()',
  'function escapeHTML(',
  'function saveAll()',
  'function loadAll()',
  'function buildMission(',
  'function EUR(',
  'function PCT(',
  'function toast(',
  'function showModal(',
  'function validateInput(',
  'function luhnCheck(',
  'function ibanMod97Check(',
  'function trapFocus('
];

criticalFunctions.forEach(function(fn) {
  assert(html.includes(fn), 'Fonction trouvée: ' + fn);
});

// ===== 3. Vérifier la présence des structures fiscales =====
section('Structures fiscales');

// Présence des structures seulement. Les VALEURS sont vérifiées plus bas
// par exécution réelle (§8) : une assertion sur le texte source casserait
// à chaque mise à jour de barème sans rien prouver sur le calcul.
assert(html.includes('LEGAL_BY_YEAR'), 'LEGAL_BY_YEAR défini');
assert(html.includes('CHARGE_TYPES'), 'CHARGE_TYPES défini');

// ===== 4. Vérifier l'absence de données personnelles =====
section('Absence de données personnelles');

// Régression déjà survenue : les valeurs par défaut de COMPANY ont
// contenu nom, SIRET, IBAN, BIC et TVA intracom réels, exposés à tout
// visiteur puisque ce fichier est servi publiquement.
const fuites = [
  [/\biban:\s*'FR\d/i, 'Pas d\'IBAN français en dur dans les défauts'],
  [/\bbic:\s*'[A-Z]{6}/, 'Pas de BIC en dur dans les défauts'],
  [/\bsiret:\s*'\d{9,}/, 'Pas de SIRET en dur dans les défauts'],
  [/tvaIntracom:\s*'FR\d/i, 'Pas de n° TVA intracom en dur dans les défauts']
];
fuites.forEach(function(f) {
  assert(!f[0].test(html), f[1]);
});
assert(/onboardingDone:\s*false/.test(html), 'onboardingDone par défaut à false (onboarding déclenché)');

// Le contrôle ci-dessus ne portait que sur `index.html`. Une copie d'archive
// du même fichier a longtemps gardé nom, SIRET, n° de TVA et ville en dur,
// sur un dépôt public, sans qu'aucun test ne la regarde. Le garde-fou balaie
// donc désormais TOUS les fichiers servis ou versionnés.
section('Absence de données personnelles — dépôt entier');

const fsMod = require('fs');
const pathMod = require('path');
const RACINE = pathMod.join(__dirname, '..');
const IGNORES = new Set(['node_modules', '.git', 'dist', 'captures', 'coverage']);
// `.jsx` a été ajouté le 13/08 : le handoff de design en contenait, et deux
// IBAN y sont passés inaperçus faute d'être lus. Une extension oubliée n'est
// pas une lacune de règle, c'est un angle mort complet.
const EXTENSIONS = ['.html', '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.css'];

function fichiersDuDepot(dossier) {
  const trouves = [];
  for (const entree of fsMod.readdirSync(dossier, { withFileTypes: true })) {
    if (IGNORES.has(entree.name)) continue;
    const chemin = pathMod.join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push.apply(trouves, fichiersDuDepot(chemin));
    else if (EXTENSIONS.indexOf(pathMod.extname(entree.name)) !== -1) trouves.push(chemin);
  }
  return trouves;
}

/**
 * Motifs interdits.
 *
 * Ils décrivent des FORMES de données personnelles, pas des valeurs :
 * inscrire la valeur réelle dans le test la republierait à l'endroit même
 * censé la faire disparaître.
 */
const MOTIFS_INTERDITS = [
  [/\bsiret:\s*['"]([0-9]{9,})/gi, 'SIRET en dur dans une valeur par défaut'],
  [/\biban:\s*['"](FR[0-9]{2}[0-9A-Z]{10,})/gi, 'IBAN français en dur'],
  [/tvaIntracom:\s*['"](FR[0-9]{2,})/gi, 'n° de TVA intracommunautaire en dur'],
  [/\b(RCS\s+[A-ZÉÈÀÂÎÔÛ]{4,})/g, 'ville de RCS en dur dans une mention légale'],
  // Un IBAN NU, quelle que soit sa forme syntaxique. La règle précédente ne
  // reconnaissait qu'une affectation `iban: 'FR…'` ; le handoff de design le
  // portait en attribut JSX (`value="FR76 …"`) et dans une chaîne d'option,
  // et il est passé. Une donnée bancaire ne devient pas inoffensive parce
  // qu'elle change de place dans la syntaxe.
  [/\b(FR[0-9]{2}(?:[ ]?[0-9A-Z]{4}){5,})/g, 'IBAN français en clair']
];

/**
 * Une valeur manifestement inventée.
 *
 * Les jeux d'essai de la migration DOIVENT porter des valeurs au bon format,
 * sinon ils ne testeraient pas grand-chose. Exclure les fichiers de test en
 * bloc serait pire : de vraies données pourraient s'y loger sans que rien ne
 * les voie. On reconnaît donc le factice à sa forme — que des zéros, une
 * séquence croissante, ou un seul chiffre répété.
 */
function estManifestementFactice(valeur) {
  const chiffres = String(valeur).replace(/[^0-9]/g, '');
  if (chiffres.length === 0) return false;
  if (/^0+$/.test(chiffres)) return true;
  if (/^(\d)\1+$/.test(chiffres)) return true;
  // Presque que des zéros, suivis d'un petit compteur : « 00000000000001 »,
  // « 00000000000002 »… C'est la forme que prennent des fixtures qui ont
  // besoin de deux identifiants DISTINCTS au bon format. Ne reconnaître que
  // la version tout-à-zéro était incohérent : deux valeurs qui ne diffèrent
  // que d'un chiffre étaient jugées, l'une factice, l'autre réelle.
  if (/^0{5,}[0-9]{1,4}$/.test(chiffres)) return true;
  // « 123456789 », « 12345678901237 » : les huit premiers chiffres se suivent.
  return /^0?123456789/.test(chiffres);
}

const fuitesTrouvees = [];
fichiersDuDepot(RACINE).forEach(function(chemin) {
  // Ce fichier décrit les motifs : il les contient par construction.
  if (chemin === __filename) return;
  const contenu = fsMod.readFileSync(chemin, 'utf8');
  MOTIFS_INTERDITS.forEach(function(motif) {
    const expression = new RegExp(motif[0].source, motif[0].flags);
    let trouve;
    while ((trouve = expression.exec(contenu)) !== null) {
      if (estManifestementFactice(trouve[1])) continue;
      fuitesTrouvees.push(pathMod.relative(RACINE, chemin) + ' — ' + motif[1]);
      break;
    }
  });
});

assert(
  fuitesTrouvees.length === 0,
  'Aucune donnée personnelle en dur dans le dépôt' +
    (fuitesTrouvees.length ? ' — trouvé : ' + fuitesTrouvees.join(' ; ') : '')
);

// ===== 5. Vérifier la sécurité =====
section('Sécurité');

assert(html.includes('function escapeHTML('), 'escapeHTML() défini');
const docWriteMatches = (html.match(/^\s*document\.write\(/gm) || []).length;
assert(docWriteMatches === 0, 'Pas de document.write() en code actif (' + docWriteMatches + ' trouvé)');

const errMessageInToast = (html.match(/showToast\([^)]*err\.message/g) || []).length;
const toastErrMessage = (html.match(/toast\([^)]*err\.message/g) || []).length;
assert(errMessageInToast === 0, 'Pas de err.message dans showToast (' + errMessageInToast + ' trouvé)');
assert(toastErrMessage === 0, 'Pas de err.message dans toast (' + toastErrMessage + ' trouvé)');

// ===== 6. Vérifier l'accessibilité =====
section('Accessibilité');

assert(html.includes("role: 'dialog'") || html.includes('role: "dialog"'), 'Modals: role=dialog (via JS)');
assert(html.includes("'aria-modal': 'true'") || html.includes('"aria-modal": "true"'), 'Modals: aria-modal (via JS)');
assert(html.includes('role="tablist"'), 'Navigation: role=tablist');
assert(html.includes('role="tab"'), 'Navigation: role=tab');
assert(html.includes('aria-label='), 'aria-label présents');
assert(html.includes(':focus-visible'), 'CSS :focus-visible');
assert(html.includes('skip-link'), 'Skip-to-content link');

// ===== 7. Vérifier le RGPD =====
section('RGPD');

assert(html.includes('RGPD'), 'Section RGPD présente');
assert(html.includes('SUPPRIMER'), 'Droit à l\'effacement (saisie SUPPRIMER)');
assert(html.includes('RGPD_PORTABILITE'), 'Export RGPD portabilité');
assert(html.includes('Politique de confidentialité'), 'Politique de confidentialité');

// ===== 8. Vérifier les validations =====
section('Validations');

assert(html.includes('function luhnCheck('), 'Validation SIRET Luhn');
assert(html.includes('function ibanMod97Check('), 'Validation IBAN mod97');
assert(html.includes('function safeNum('), 'safeNum() helper');
assert(html.includes('MAX_IMPORT_SIZE'), 'MAX_IMPORT_SIZE défini');

// ===== 9. Exécuter le JS applicatif et tester les calculs =====
section('Exécution JS (calculs purs)');

// Le bloc applicatif est celui qui contient compute(). Il ne s'agit PAS du
// premier <script> du fichier : celui-là est jsPDF vendorisé. Sélectionner
// le premier bloc évaluait 419 Ko de bibliothèque tierce au lieu de l'app,
// et l'exception était avalée — d'où une suite verte qui ne testait rien.
function extraireScriptApplicatif(source) {
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    if (m[1].includes('function compute()')) return m[1];
  }
  return null;
}

const appScript = extraireScriptApplicatif(html);
assert(appScript !== null, 'Bloc <script> applicatif localisé (celui qui contient compute())');

if (appScript) {
  const noop = function () {};
  const elementFactice = {
    style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: function () { return false; } },
    setAttribute: noop, removeAttribute: noop, getAttribute: function () { return null; },
    appendChild: noop, removeChild: noop, insertBefore: noop, addEventListener: noop,
    removeEventListener: noop, focus: noop, click: noop, remove: noop,
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    children: [], childNodes: [], innerHTML: '', textContent: '', value: ''
  };

  const contexte = {
    document: {
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      getElementById: function () { return null; },
      createElement: function () { return Object.assign({}, elementFactice); },
      createDocumentFragment: function () { return Object.assign({}, elementFactice); },
      body: Object.assign({}, elementFactice),
      head: Object.assign({}, elementFactice),
      documentElement: Object.assign({}, elementFactice),
      addEventListener: noop, removeEventListener: noop,
      title: 'test', cookie: ''
    },
    localStorage: { getItem: function () { return null; }, setItem: noop, removeItem: noop, clear: noop, key: noop, length: 0 },
    sessionStorage: { getItem: function () { return null; }, setItem: noop, removeItem: noop },
    navigator: { userAgent: 'node', onLine: true, language: 'fr-FR' },
    location: { href: '', hash: '', search: '', reload: noop, replace: noop },
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    alert: noop, confirm: function () { return false; }, prompt: function () { return null; },
    fetch: function () { return Promise.resolve({ json: function () { return Promise.resolve({}); } }); },
    URL: { createObjectURL: function () { return ''; }, revokeObjectURL: noop },
    Blob: function () {}, File: function () {}, FormData: function () {},
    FileReader: function () { this.readAsText = noop; this.readAsDataURL = noop; },
    HTMLElement: function () {}, Image: function () {},
    Chart: function () { this.destroy = noop; this.update = noop; },
    MutationObserver: function () { this.observe = noop; this.disconnect = noop; },
    ResizeObserver: function () { this.observe = noop; this.disconnect = noop; },
    matchMedia: function () { return { matches: false, addEventListener: noop, addListener: noop }; },
    getComputedStyle: function () { return { getPropertyValue: function () { return ''; } }; },
    jspdf: null, supabase: null, Supabase: null,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
    scrollTo: noop, open: function () { return null; }, print: noop,
    console: { log: noop, error: noop, warn: noop, info: noop, debug: noop }
  };
  contexte.window = contexte;
  contexte.self = contexte;
  contexte.globalThis = contexte;

  const vm = require('vm');
  const sandbox = vm.createContext(contexte);

  // Une exception ici EST un échec. Elle signifie que le code applicatif
  // ne s'évalue pas hors navigateur, donc qu'aucun calcul n'est vérifié.
  let evalOk = true;
  try {
    vm.runInContext(appScript, sandbox, { timeout: 30000 });
  } catch (e) {
    evalOk = false;
    assert(false, 'Le script applicatif s\'évalue sans exception — échec : ' + e.message);
  }

  if (evalOk) {
    assert(true, 'Le script applicatif s\'évalue sans exception');

    function verifie(libelle, fn) {
      let ok = false;
      try {
        ok = fn() === true;
      } catch (e) {
        assert(false, libelle + ' — exception : ' + e.message);
        return;
      }
      assert(ok, libelle);
    }

    verifie('escapeHTML() échappe le HTML', function () {
      return sandbox.escapeHTML('<script>alert("xss")</script>')
        === '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
    });
    verifie('luhnCheck() valide un SIRET correct', function () {
      return sandbox.luhnCheck(SIRET_VALIDE) === true;
    });
    verifie('luhnCheck() rejette un SIRET incorrect', function () {
      return sandbox.luhnCheck(SIRET_INVALIDE) === false;
    });
    verifie('EUR() formate en euros', function () {
      const r = sandbox.EUR(1000);
      return typeof r === 'string' && r.indexOf('€') >= 0;
    });
    verifie('PCT() formate en pourcentage', function () {
      return sandbox.PCT(0.246) === '24.6%';
    });
    verifie('safeNum() parse un nombre', function () {
      return sandbox.safeNum('123.45') === 123.45;
    });
    verifie('safeNum() retourne 0 pour NaN', function () {
      return sandbox.safeNum('abc') === 0;
    });
    verifie('safeNum() utilise le fallback', function () {
      return sandbox.safeNum('abc', 42) === 42;
    });
    verifie('validateInput() accepte un email valide', function () {
      return sandbox.validateInput('test@example.com', 'email').valid === true;
    });
    verifie('validateInput() rejette un email invalide', function () {
      return sandbox.validateInput('not-an-email', 'email').valid === false;
    });
    verifie('validateInput() accepte un téléphone français', function () {
      return sandbox.validateInput('0612345678', 'phone').valid === true;
    });
    verifie('validateInput() rejette un téléphone invalide', function () {
      return sandbox.validateInput('abc', 'phone').valid === false;
    });

    // Barème : vérifié par exécution, pas par texte source.
    section('Barème (par exécution)');

    verifie('LEGAL_BY_YEAR est un objet non vide', function () {
      const L = sandbox.LEGAL_BY_YEAR;
      return !!L && typeof L === 'object' && Object.keys(L).length > 0;
    });
    verifie('Le barème couvre 2025 et 2026', function () {
      const L = sandbox.LEGAL_BY_YEAR;
      return !!(L && L['2025'] && L['2026']);
    });
    verifie('Un taux de cotisations BNC est exposé et plausible (5 %–40 %)', function () {
      const L = sandbox.LEGAL_BY_YEAR;
      const j = JSON.stringify(L || {});
      const taux = (j.match(/0\.\d+/g) || []).map(Number).filter(function (t) {
        return t >= 0.05 && t <= 0.40;
      });
      return taux.length > 0;
    });

    // ===== Barème résolu par période =====
    // Le taux BNC a changé EN COURS D'ANNÉE au 1er juillet 2024 : une
    // résolution par année civile appliquerait 21,1 % à tout 2024, alors que
    // le second semestre est à 23,1 %. Ces assertions verrouillent la
    // résolution par mois.
    //
    // Une bascule à 26,1 % au 1er juillet 2026 avait aussi été inscrite ici.
    // Elle n'a jamais eu lieu : le décret n° 2025-943 du 8 septembre 2025 a
    // plafonné la dernière marche à 25,6 %. Les assertions qui l'attendaient
    // verrouillaient donc une erreur.
    section('Barème par période');

    const attendus = [
      ['2024-03', 0.211, '1er semestre 2024'],
      ['2024-06', 0.211, 'juin 2024, dernier mois du 1er semestre'],
      ['2024-07', 0.231, 'juillet 2024, bascule mi-année'],
      ['2024-12', 0.231, '2e semestre 2024'],
      ['2025-01', 0.246, '2025, taux unique'],
      ['2025-12', 0.246, 'décembre 2025'],
      ['2026-01', 0.256, 'janvier 2026'],
      ['2026-07', 0.256, 'juillet 2026 : pas de bascule, contrairement au calendrier initial'],
      ['2026-12', 0.256, 'décembre 2026'],
      ['2027-06', 0.256, '2027, période toujours ouverte']
    ];
    attendus.forEach(function (cas) {
      verifie('Taux BNC ' + cas[0] + ' = ' + (cas[1] * 100).toFixed(1) + '% (' + cas[2] + ')', function () {
        return sandbox.getUrssafRateAt(cas[0], 'BNC', false) === cas[1];
      });
    });

    verifie('Les deux semestres 2024 diffèrent (une table par année ne peut pas l\'exprimer)', function () {
      return sandbox.getUrssafRateAt('2024-06', 'BNC', false)
        !== sandbox.getUrssafRateAt('2024-07', 'BNC', false);
    });
    verifie('ACRE applique bien un abattement de 50 %', function () {
      return sandbox.getUrssafRateAt('2026-07', 'BNC', true) === 0.256 * 0.5;
    });
    verifie('Un mois antérieur à toute période connue ne renvoie pas de taux', function () {
      return sandbox.getUrssafRateAt('2019-01', 'BNC', false) === null;
    });
    verifie('Chaque période porte sa source et sa date de vérification', function () {
      return sandbox.URSSAF_PERIODS.every(function (p) {
        return !!p.source && /^\d{4}-\d{2}-\d{2}$/.test(p.verifieLe) && !!p.du;
      });
    });
    verifie('Les périodes sont contiguës et sans chevauchement', function () {
      const P = sandbox.URSSAF_PERIODS;
      for (let i = 0; i < P.length - 1; i++) {
        if (P[i].au === null) return false;          // seule la dernière est ouverte
        if (!(P[i].au < P[i + 1].du)) return false;  // pas de chevauchement
      }
      return P[P.length - 1].au === null;            // la dernière reste ouverte
    });

    // ===== Hypothèse de prévision =====
    // Un barème absent est autorisé en PRÉVISION, sur le dernier taux connu,
    // à condition que l'hypothèse soit explicite. Il doit être refusé sur un
    // chiffre qui engage.
    section('Hypothèse de prévision');

    verifie('Une période couverte n\'est pas une hypothèse', function () {
      const info = sandbox.getUrssafRateInfo('2026-07');
      return info.estHypothese === false && info.estRefuse === false;
    });
    verifie('Le futur reste couvert par la période ouverte (un taux court jusqu\'au suivant)', function () {
      const info = sandbox.getUrssafRateInfo('2031-03');
      return info.estRefuse === false && info.taux === 0.256;
    });
    verifie('Aucun libellé d\'hypothèse sur une période publiée', function () {
      return sandbox.getUrssafHypotheseLabel('2026-07') === null;
    });

    // Asymétrie du temps : on extrapole vers le futur, jamais vers le passé.
    // Le taux d'un mois écoulé est un fait publié, pas une prévision.
    verifie('Un mois antérieur au plus ancien barème est REFUSÉ, pas extrapolé', function () {
      const info = sandbox.getUrssafRateInfo('2019-01');
      return info.estRefuse === true && info.taux === null;
    });
    verifie('Le refus porte un motif lisible', function () {
      const m = sandbox.motifRefusUrssaf('2019-01');
      return typeof m === 'string' && m.indexOf('2019-01') >= 0 && m.indexOf('extrapol') >= 0;
    });
    verifie('Aucun motif de refus sur une période publiée', function () {
      return sandbox.motifRefusUrssaf('2026-07') === null;
    });
    verifie('peutEngagerSurUrssaf() autorise une période publiée', function () {
      return sandbox.peutEngagerSurUrssaf('2026-07') === true;
    });
    verifie('peutEngagerSurUrssaf() refuse une période sans barème', function () {
      return sandbox.peutEngagerSurUrssaf('2019-01') === false;
    });

    // ===== Régime d'activité =====
    // Bug corrigé : l'IIFE LEGAL lisait COMPANY avant sa déclaration, donc
    // le type retombait toujours sur BNC.
    section('Régime d\'activité');

    verifie('LEGAL.urssaf suit le type d\'activité configuré', function () {
      const avant = sandbox.LEGAL.urssaf;
      sandbox.COMPANY.typeActivite = 'BIC_vente';
      const apres = sandbox.LEGAL.urssaf;
      sandbox.COMPANY.typeActivite = 'BNC';
      const retabli = sandbox.LEGAL.urssaf;
      return avant !== apres && avant === retabli;
    });
    verifie('getUrssafRateAt distingue BNC et BIC_vente', function () {
      return sandbox.getUrssafRateAt('2026-07', 'BNC', false)
        !== sandbox.getUrssafRateAt('2026-07', 'BIC_vente', false);
    });
    // ===== Échéances réglementaires à date fixe =====
    section('Échéances réglementaires');

    verifie('La réception obligatoire des factures électroniques est suivie', function () {
      return sandbox.ECHEANCES_REGLEMENTAIRES.some(function (e) {
        return e.id === 'facturation-electronique-reception' && e.date === '2026-09-01';
      });
    });
    verifie('Chaque échéance porte une date, un préavis, un titre et un texte', function () {
      return sandbox.ECHEANCES_REGLEMENTAIRES.every(function (e) {
        return /^\d{4}-\d{2}-\d{2}$/.test(e.date) && typeof e.preavisJours === 'number'
          && !!e.titre && !!e.texte;
      });
    });
    verifie('Une échéance dans le préavis produit une alerte', function () {
      const data = { alerts: [] };
      sandbox.computeEcheancesReglementaires(data);
      return data.alerts.some(function (a) {
        return a.title.indexOf('Facturation électronique') >= 0;
      });
    });

    verifie('getLegal() ne retombe plus sur un 2026 codé en dur', function () {
      // Une année future doit résoudre vers la plus récente disponible,
      // et suivre automatiquement l'ajout d'une année ultérieure.
      const annees = Object.keys(sandbox.LEGAL_BY_YEAR).map(Number).sort();
      const derniere = annees[annees.length - 1];
      return sandbox.getLegal(derniere + 5) === sandbox.LEGAL_BY_YEAR[derniere];
    });
  }
}

// ===== Plancher d'assertions =====
// Garde-fou : sans lui, un bloc qui cesse de s'exécuter réduit
// silencieusement la couverture tout en laissant la suite au vert.
section('Intégrité du harnais');
assert(
  passed + failed >= MIN_ASSERTIONS,
  'Plancher d\'assertions atteint (' + (passed + failed) + ' ≥ ' + MIN_ASSERTIONS + ')'
);

// ===== Résultat =====
console.log('\n' + '═'.repeat(50));
console.log('📊 Résultats: ' + passed + ' passés, ' + failed + ' échoués');
console.log('═'.repeat(50));

process.exit(failed > 0 ? 1 : 0);
