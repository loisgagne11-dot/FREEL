# Inventaire de l'existant — FREEL (branche `claude/orchestration-redesign-screens-0ee3sz`)

Dépôt : `/home/user/FREEL` — HEAD `c506409` (2026-05-30). `index.html` : **1 862 539 octets (≈1,86 Mo), 24 051 lignes**.

---

## 1. Architecture réelle

FREEL est un **monolithe mono-fichier** : une seule page `index.html` contenant HTML, CSS et JS inline, sans build, sans bundler, sans dépendances npm. Découpage interne réel (vérifié par grep sur les balises) :

| Zone | Lignes | Contenu |
|---|---|---|
| `<head>` méta | 1-17 | meta tags, viewport, PWA-like meta (mais pas de manifest réel, voir §8) |
| `<script>` jsPDF vendorisé | 18-392 | jsPDF 4.0 collé en dur (minifié) |
| `<script>` Chart.js vendorisé | 393-408 | Chart.js 4.4 collé en dur |
| `<script>` loader Supabase | 411-438 | chargement dynamique CDN avec 3 fallbacks (jsdelivr, unpkg, cdnjs) |
| `<style>` CSS | 439-1834 | **1 395 lignes** de CSS, variables, thèmes, `@media` |
| `<body>` markup statique | 1836-1936 | header, nav, bottom-nav, coquilles de modales, onboarding |
| `<script>` application | 1937-24049 | **≈22 112 lignes** — toute la logique métier, état, rendu, événements |
| Template facture HTML inline | 13147-13192 | chaîne JS générant un `<html>` complet pour l'impression facture |
| Fin | 24049-24051 | fermetures |

**Fonctions déclarées** : 422 occurrences de `function \w+(` (top-niveau + fonctions imbriquées), soit un des plus gros fichiers JS-inline que j'aie mesurés.

**Outillage** :
- Pas de build (`package.json` absent), pas de linter, pas de framework — vanilla JS pur, IIFE et `var` partout.
- CI : deux workflows GitHub Actions.
  - `.github/workflows/deploy.yml` : déploie tel quel sur GitHub Pages (checkout → upload → deploy), aucune étape de build.
  - `.github/workflows/validate.yml` : vérifie la taille du fichier (warning si >2 Mo), grep anti-`eval()`/anti-`document.write()`, grep anti-secrets `.env`, vérifie la présence de fonctions critiques par `grep -q`, puis lance `node tests/smoke-test.js`.
- Tests : `tests/smoke-test.js`, 47 assertions. **Fait important vérifié en l'exécutant réellement** (`node tests/smoke-test.js`) : la section "Exécution JS (calculs purs)" — censée tester `escapeHTML`, `luhnCheck`, `EUR`, `PCT`, `safeNum`, `validateInput` — plante silencieusement (`⚠️ Erreur exécution JS: Identifier 'results' has already been declared`) et l'erreur est avalée par un `catch` qui ne compte pas d'échec. Le script affiche "47 passés, 0 échoués" mais **les 12 assertions de calcul réel ne s'exécutent jamais** ; seuls les tests structurels (`html.includes(...)`, grep de constantes) sont réellement significatifs. La CI donne donc un faux sentiment de couverture fonctionnelle.
- `_archive/legacy-v72.html` (1,27 Mo) est conservé comme référence de l'ancienne version ; `_archive/CAHIER-DES-CHARGES-STATUS.md` (daté 2026-02-24, "V74") décrit une nav à **4 onglets** (Cockpit, Activité, Finances, Config) alors que le code actuel (`index.html:1871-1877`) a **6 onglets** (Cockpit, Activité, Trésorerie, Finances, Config, Compte) — ce document d'archive est donc obsolète par rapport au code réel et ne doit pas servir de source de vérité pour l'audit d'écart.

---

## 2. Écrans / vues existants

Navigation principale définie `index.html:1871-1877` (desktop, `role="tablist"`) et dupliquée `index.html:1884-1891` (bottom-nav mobile, cachée >600px via `index.html:1492`). Dispatch central dans `render()` à `index.html:23602-23620`.

| Écran (`data-view`) | Fonction de rendu | Sous-onglets | Contenu | État apparent |
|---|---|---|---|---|
| **Cockpit** | `renderCockpit()` `index.html:23124` | aucun | Hero cash/salaire/autonomie (`renderDashboardHero` `16092`), indicateurs santé (`renderHealthIndicators` `15163`), timeline jalons/actions (`renderActionsAndMilestones` `16783`), widgets clients/objectif | Complet, dense |
| **Activité** | `renderActivite()` `index.html:23219` | Missions / Factures (`ACTIVITE_TAB`) | Missions (`renderMissionsContent` `19101`), Factures (`renderFacturesContent` `19814`) | Complet |
| **Trésorerie** | `renderTresorerie()` `index.html:21798` | `TRESORERIE_TAB='flux'` déclaré `1962` mais **jamais lu ailleurs** — le sous-onglet "provisions" annoncé en commentaire n'existe plus dans le code (cf. `18104`: "Conformité supprimé") | Solde, mouvements, import relevé bancaire/rapprochement (`showBankImportModal` `10197`) | Complet mais sous-onglet vestigial (dead state) |
| **Finances (Analyse)** | `renderFinances()` `index.html:18081` | Évolution / Performance (`FINANCES_TAB`) | Graphiques CA/Trésorerie (`drawMainChart` `20486`, `drawSoldeChart` `20663`), donut répartition, comparaison N-1 | Complet |
| **Config** | `renderConfig()` `index.html:23246` → alias vers `renderParams()` `20427` → `renderAdmin()` `22228` | Entreprise / Infos / Données / Cloud (`CONFIG_TAB`, 4 valeurs testées `22265,22536,22695,22830`) | Régime fiscal, simulateurs IR/CFE, Livre des recettes, exports, sync Supabase | Complet |
| **Compte** | `renderCompte()` `index.html:23253` | Profil / Préférences / Sécurité & Données (`COMPTE_TAB`) | `renderCompteProfil` `23302`, `renderComptePreferences` `23407`, `renderCompteSecurite` `23511` (RGPD : export, suppression) | Complet, mais recoupe partiellement Config (redondance fonctionnelle probable Config↔Compte à vérifier lors de l'audit d'écart) |

**Vues mortes / fantômes** (déclarées, jamais appelées par le dispatcher ni ailleurs — vérifié par grep du nom en tant que mot entier) :
- `renderDashboard()` `index.html:20431` — jamais invoquée.
- `renderMissions()` `index.html:21399` et `renderMissionsView()` `index.html:18075` (qui l'appelle) — chaîne orpheline.
- `renderFactures()` `index.html:21554` — jamais invoquée.
- `renderTresorerieContent()` `index.html:20069` — jamais invoquée (à ne pas confondre avec `renderTresorerie()` `21798`, qui elle est la vraie vue).

---

## 3. Fonctions par domaine

Regroupement des ~422 déclarations (échantillon représentatif, la liste complète est dans le fichier) :

- **DOM/UI générique** : `el()` `2928`, `$`/`$$` (aliases `querySelector`), `toast()` `2983`/`showToast()` `5477`, `openModal/closeModal/closeAllModals` `5382-5402`, `showModal()` `5496`, `createInput/createSelect/createTextarea` `5554-5591`, `KPI()` `3046`, `Card()` `3110`, `makeCollapsible()` `2935`.
- **Formatage** : `EUR()` `2990`, `EURK()` `2996`, `PCT()` `3008`, `fmtMonth*`, `fmtDate/fmtLong/fmtShort` (`3012-3017`, `14253`), `localISO/ym/parseYM` `3009-3011`.
- **Fiscal / légal** : `getLegal*()` `2678-2698`, `getAcreInfo()` `4094`, `getUrssafRate()` `4117`, `calculateIR()` `4134`, `getIRForYear/getIRConfig` `4190`/`5714`, `showCFESimulator/computeCFEEstimate/renderCFEResult` `8855-8974`, `LEGAL_BY_YEAR` (données 2025/2026) `2587`.
- **Calcul central** : `compute()` `6219` (fonction pivot, appelée par presque tous les renders), `computeIndicators()` `5998`, `computeAlerts()` `6129`, `computeProjections()` `6558`.
- **Missions/Jours travaillés** : `buildMission()` `5255`, `getJoursPrevusPourMois()` `4963`, `getScheduledDaysForMonth()` `5065`, `showMissionModal()` `9072`, `showDaysEditor()` `9794`.
- **Factures** : `getNextInvoiceNumber/reserveInvoiceNumber/repairInvoiceNumbers` `3168-3181`, `registerInvoice()` `3511`, `showFactureModal()` `11405`, `generateInvoiceHTMLContent()` `12375`, `generateAndDownloadPDF()` `12474`.
- **Trésorerie/Rapprochement** : `parseOFX/parseCSV/reconcileTransactions` `10265-10438`, `showBankImportModal()` `10197`.
- **Exports comptables** : `exportLivreRecettes()` `3603`, `exportFEC()` `3643` (export FEC réel), `exportLivreRecettesPDF()` `3728`, `exportJSON/importJSON` `15799/15822`.
- **Auth/Cloud (Supabase)** : `initSupabase()` `2032`, `signIn/signUp/signOut` `2352/2287/2382`, `syncToCloud/loadFromCloud` `2492/2538`, `_subscribeRealtime/_unsubscribeRealtime` `2507/2531`.
- **Persistance locale** : `saveAll()` `5631`, `loadAll()` `5648`, `cleanupLocalStorage()` `5591`.
- **Validation/sécurité** : `escapeHTML()` `2978`, `validateInput()` `5887`, `luhnCheck()` `5939`, `ibanMod97Check()` `5950`, `safeNum()` `5968`.
- **Rendu de pages/widgets** : ~60 fonctions `render*()` (cf. §2).

**Doublons et code mort identifiés** (au-delà de ceux du §2, tous vérifiés par recherche du nom en tant que mot entier dans tout le fichier) :
- `renderDashboard()` `20431`, `renderFactures()` `21554`, `renderTresorerieContent()` `20069`, `renderMissionsView()` `18075`+`renderMissions()` `21399` : **définies mais jamais appelées** — code mort pur, plusieurs centaines de lignes cumulées.
- Commentaire explicite de doublon supprimé : `index.html:23243` "*V83: renderFacturesContent supprimé ici (doublon) — la version avec filtres par statut est définie plus haut (l.13658)*" — traces d'un nettoyage partiel, signe que la duplication est un problème récurrent et déjà rencontré par les sessions précédentes.
- `TRESORERIE_TAB` (`1962`) et le sous-état `CHARGES_TAB` (`14853`) : variables déclarées avec commentaires décrivant des sous-onglets qui ne sont plus branchés à un rendu conditionnel actif — état mort.
- Le fichier contient un changelog interne sous forme de commentaires géants en fin de script (à partir de `23837`, "CHANGELOG FREEL V56", "V50 Clean Slate"...) — utile pour comprendre l'historique mais aussi révélateur d'une base gérée par accrétion de patches versionnés (V50 → V56 → ... → V83), sans suppression systématique du code obsolète.

---

## 4. Couche données et persistance

Aucun store structuré (pas de Redux/signals) : **état global en variables `var` de haut niveau**, toutes déclarées entre `index.html:1938` et `index.html:23644` :

- `COMPANY` `2801` (entreprise, régime fiscal, ACRE, IBAN...), `MISSIONS` `2826` (array), `CLIENTS` `2839` (array), `TREASURY` `2842` (solde, mouvements, charges, rendements), `IR_CONFIG` `2855`, `COMPUTED` `2856` (résultat mémoïsé de `compute()`).
- Variables de navigation/UI : `VIEW` `1960`, `ACTIVITE_TAB` `1961`, `FINANCES_TAB` `18079`, `CONFIG_TAB` `1964`, `COMPTE_TAB` `1965`, `TRESORERIE_TAB` `1962`.
- Constantes métier : `LEGAL_BY_YEAR` `2587`, `CHARGE_TYPES` `2767`, `CHARGE_CATEGORIES` `9999`.

**Persistance** : `localStorage` exclusivement côté client, sous préfixe versionné `STORAGE_PREFIX = 'freel_v50_'` (`5588`) — un seul objet `bundle` sérialisé en JSON contenant `{c: COMPANY, m: MISSIONS, cl: CLIENTS, t: TREASURY, ir: IR_CONFIG, _ts}` (`saveAll()` `5631`, `loadAll()` `5648`). Clés annexes séparées : `freel_theme`, `freel_goal_ca`, `freel_notif_read`, `freel_supabase` (credentials cloud), `freel_ts` (timestamp sync), `freel_collapse_*` (état UI plié/déplié), `freel_app_version`.

Il n'existe **aucun schéma de données formalisé** (pas de TypeScript, pas de JSON Schema) — la forme des objets est reconstituée par lecture du code (`buildMission()` `5255` normalise partiellement). Import JSON validé côté taille (5 Mo max, `MAX_IMPORT_SIZE` `2746`) mais la validation de structure reste ad hoc.

---

## 5. Réseau / backend

**Non, il n'y a pas de backend applicatif propre.** L'app est 100% front-end statique servie par GitHub Pages (`deploy.yml`).

Le seul réseau sortant est un usage **optionnel** de Supabase (BaaS tiers) :
- Chargement dynamique de la lib via CDN avec repli en cascade sur 3 sources (`index.html:413-416`: jsdelivr → unpkg → cdnjs) — pas de `fetch()`/`XMLHttpRequest`/`axios` custom ailleurs dans le code (0 occurrence trouvée).
- `SUPABASE_URL` et `SUPABASE_ANON_KEY` **codés en clair** dans le fichier (`index.html:1993-1994`), avec possibilité pour l'utilisateur de les écraser par les siens en Config > Cloud.
- Une seule table distante `user_data`, utilisée pour stocker un blob JSON complet (`supabaseClient.from('user_data')` — `2426`, `2466`, `2541`, `23065`) : ce n'est pas une API métier, c'est un mécanisme de sync "un blob par utilisateur" (get/put), plus `auth` (signup/signin/signout, `2329/2361/2384`) et un canal realtime (`_subscribeRealtime` `2507`).
- Aucun endpoint HTTP propre, aucune fonction serverless, aucun `google.script.run`, aucune trace de Google Apps Script ou Firebase.

Conclusion : c'est une **app locale-first avec sync cloud optionnelle et non structurée** (un seul blob, pas de modèle relationnel côté serveur).

---

## 6. Couverture métier comptable

| Notion | Présent ? | Où |
|---|---|---|
| URSSAF (taux BNC/BIC) | ✅ | `LEGAL_BY_YEAR` `index.html:2587-2671`, `getUrssafRate()` `4117` |
| Cotisations / CFP | ✅ | `LEGAL_BY_YEAR.cfp` (0.2%), calcul dans `compute()` `6219` |
| Abattement (micro-BNC/BIC) | ✅ | `LEGAL_BY_YEAR` abattements par régime `2599-2607` |
| Micro-entreprise (plafonds CA) | ✅ | `plafonds.BNC/BIC_vente/BIC_service` `2619-2621`, `2662-2664` |
| BNC / BIC vente / BIC service | ✅ | typologie complète, distincte par taux et plafond |
| TVA (franchise, seuils) | ✅ | `seuilService/seuilVente(+Majore)` `2626-2629`, `2668-2671`, `isTVAApplicable()` `4129`, `projectTVADate()` `14454` |
| Seuils / plafonds | ✅ | multiples (TVA, CA micro) |
| ACRE | ✅ | `getAcreInfo()` `4094`, taux réduits `acre:` dans chaque régime |
| Impôt (IR) | ✅ | `calculateIR()` `4134`, tranches `getLegalIRBrackets()` `2694`, simulateur `showIRDetail()` `8692` |
| Prélèvement libératoire | ✅ | `prelevementLiberatoire` (COMPANY), taux dans `LEGAL_BY_YEAR` |
| CFE | ✅ | `showCFESimulator()` `8855`, `computeCFEEstimate()` `8928` |
| Provisions (charges à provisionner) | ✅ | concept central, `getAbsoluteProvisions()` `4688`, `showProvisionsDetail()` `8046` |
| Trésorerie | ✅ | vue dédiée, `getBalanceAtStartOfPeriod()` `4359`, mouvements |
| Facture (émission, registre, numérotation) | ✅ | très développé : `registerInvoice()` `3511`, `validateInvoiceNumbering()` `3550`, génération PDF |
| **Devis** | ❌ **Absent** | Aucune fonction/modal de devis. Les 8 occurrences brutes du mot repérées en sondage initial sont des faux positifs (`Montantdevise`/`Idevise`, champs de l'export FEC `3714`) — pas de fonctionnalité devis réelle. |
| Dépense / charge | ✅ | `CHARGE_TYPES` `2767`, `showChargeModal()` `10016`, `getAllChargesForType()` `4819` |
| **Justificatif de dépense** (upload/photo/pièce jointe) | ❌ **Absent** | 0 occurrence de "justificatif", "upload", "photo", "pièce jointe", "scanner", "note de frais" dans tout le fichier — aucune gestion de preuve d'achat |
| Rapprochement bancaire | ✅ | `reconcileTransactions()` `10381`, `parseOFX/parseCSV` `10265-10287`, import relevé `showBankImportModal()` `10197` |
| Congés | ✅ | `renderCongesCalendar()` `15597`, `showMonthCongesModal()` `10679` |
| Jours ouvrés / fériés | ✅ | `daysBiz()` `4049`, `frenchHolidays()` `4035`, `daysBizInRange()` `4062` |

**Bilan** : couverture fiscale/comptable très riche et à jour (taux 2025/2026 vérifiés selon `SPRINT-PLAN.md`), mais **deux trous fonctionnels francs** pour un audit d'écart : pas de devis (le cycle commercial commence directement à la mission/facture), pas de justificatif de dépense (aucune preuve d'achat rattachable à une charge — un point souvent attendu dans un outil de gestion freelance/comptable).

---

## 7. CSS, thèmes, responsive

- CSS dans un unique bloc `<style>` `index.html:439-1834` (1 395 lignes), pas de préprocesseur, pas de méthodologie de nommage (BEM partiel informel).
- **Variables CSS** : 44 déclarations `--xxx:` — un jeu de tokens dans `:root` (`439-465`: fonds, textes, accent, success/warning/danger/info/provision + glows, rayons) et un jeu miroir dans `[data-theme="light"]` (`466-487`). Thème géré par attribut `data-theme` sur `<html>`, piloté par `toggleTheme()`/`initTheme()` (`15868`, `15880`) et persistant via `localStorage('freel_theme')`.
- **`@media`** : 15 occurrences au total — 14 dans la feuille de style principale, 1 dans le template JS de facture imprimable (`13150`). Breakpoints utilisés : `768px`, `600px` (bascule majeure nav desktop → bottom-nav mobile, `1492`), `480px`, `360px`, `min-width:601px` (position du FAB, `1503`), plus une règle `@media print` (`1828`).
- **Dock mobile** : `bottom-nav` (`index.html:1884-1891`, style `1491-1496`) actif uniquement `<600px`, 6 onglets, `position: fixed; bottom:0`, `env(safe-area-inset-bottom)` géré (`1816`).
- **Grilles** : `display: grid`/`grid-template-columns` utilisés (le total combiné avec d'autres motifs CSS donne 47 occurrences dans le fichier), principalement pour les grilles de KPI (`.kpi-grid`) et les blocs trésorerie, avec recalcul JS de colonnes selon la largeur d'écran (`isMobileTreso = window.innerWidth <= 480`, `21815`) — donc une partie du responsive est **gérée en JS au rendu**, pas uniquement en CSS, ce qui complique un futur reskin (le nombre de colonnes est parfois câblé dans le JS de rendu plutôt que dans la CSS grid).
- **PWA/offline** : le `README.md` annonce "PWA installable" et "Mode hors-ligne", mais **aucun `manifest.json` ni service worker n'existe dans le dépôt** (recherche exhaustive : 0 fichier, 0 référence à `serviceWorker`/`CACHE_NAME` dans `index.html`). C'est une promesse documentaire non tenue par le code actuel.
- Accessibilité : présence réelle de `role="tablist"/"tab"`, `aria-selected`, `aria-label`, `:focus-visible`, skip-link (confirmé par les tests smoke et par grep direct) — un vrai effort a été fait (Sprint 3 du `SPRINT-PLAN.md`), au-delà de la moyenne pour ce type de projet.

---

## 8. Dette et risques

1. **Monolithe de 24 051 lignes / 1,86 Mo en un seul fichier HTML** : toute modification de design implique de naviguer dans un fichier unique sans modularité, sans imports, sans typage. Un reskin large (cible du prochain audit) touchera CSS (1 395 lignes) et probablement une bonne partie des ~60 fonctions `render*()` qui construisent le DOM à la main via `el()` — pas de composants réutilisables au sens moderne.
2. **Tests silencieusement inefficaces** : vérifié en exécutant réellement `tests/smoke-test.js` — la portion qui devrait tester les fonctions de calcul (`escapeHTML`, `luhnCheck`, `EUR`, `PCT`, `safeNum`, `validateInput`) échoue à l'exécution (`Identifier 'results' has already been declared`) et l'erreur est absorbée par un `catch` qui ne fait pas échouer le test global. Le CI affiche "47 passés, 0 échoués" en continu sans jamais avoir vérifié la logique de calcul — **faux sentiment de sécurité** pour toute refonte qui toucherait ces fonctions.
3. **Credentials Supabase en clair dans le code source** (`index.html:1993-1994`) — anon key committée ; acceptable pour une clé anonyme Supabase (protégée par RLS côté serveur, en théorie) mais à vérifier lors de l'audit sécurité, et gênant pour un reskin qui republierait le fichier sans y penser.
4. **Code mort non négligeable** : au moins 5 fonctions de rendu de page entières jamais appelées (`renderDashboard`, `renderMissions`, `renderMissionsView`, `renderFactures`, `renderTresorerieContent`), plus des sous-onglets d'état mort (`TRESORERIE_TAB`). Ce sont des candidats sûrs à la suppression, mais aussi un risque de confusion pendant l'audit d'écart si on les confond avec les vraies vues actives (noms très proches : `renderTresorerie` vivant vs `renderTresorerieContent` mort).
5. **Documentation d'archive obsolète** : `_archive/CAHIER-DES-CHARGES-STATUS.md` décrit une nav à 4 onglets alors que le code en a 6 — ne pas utiliser cette archive comme référence de l'état actuel sans revérification.
6. **Écart doc/code sur le PWA** : README annonce PWA + offline, aucun manifest/service worker n'existe — à clarifier si la cible de design suppose un vrai comportement PWA.
7. **Responsive partiellement piloté en JS** (recalcul de colonnes de grille selon `window.innerWidth` dans les fonctions de rendu plutôt qu'en CSS pur) — un reskin responsive devra auditer chaque fonction `render*()` individuellement, pas seulement la feuille de style.
8. **Absence de devis et de justificatifs de dépense** (§6) — si la cible de design suppose ces flux (souvent attendus dans un outil de gestion freelance), ce sont des fonctionnalités entières à construire, pas de simples ajustements visuels.
9. **Architecture organique par accrétion de versions** (changelog interne en commentaires "V50", "V56"... jusqu'à "V83" alors que `APP_VERSION = 80` en dur `index.html:1938` — les deux compteurs ont divergé) : la base a grandi par patches successifs sans refactor, ce qui explique la duplication récurrente déjà signalée par les auteurs eux-mêmes en commentaire (`23243`).
