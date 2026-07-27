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
const MIN_ASSERTIONS = 58;

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
