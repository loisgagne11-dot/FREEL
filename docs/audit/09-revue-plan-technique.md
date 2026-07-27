# Revue du plan de refonte — second avis d'architecte

**Objet** : `docs/PLAN-REFONTE.md` (27 juillet 2026)
**Auteur de la revue** : même architecte que `07-critique-technique.md`
**Convention** : `[V]` = vérifié par lecture directe du code pendant cette revue, avec citation `index.html:ligne` · `[R]` = repris d'un rapport amont · `[H]` = jugement d'architecte assumé comme tel.

Toutes les lectures de code de cette revue ont été faites par sondages ciblés (`Grep`, `Read` avec offset) — le fichier n'a pas été lu intégralement.

---

## 1. Verdict sur le plan

1. **L'ossature est juste.** Les 6 décisions D1–D6 sont les bonnes, l'ordre non négociable (barème → domaine → migration → écrans) est correct, et l'exigence « chaque jalon est démontrable » est le seul garde-fou qui empêche une réécriture de ne jamais sortir. Sur le fond, je signe.
2. **La section 3 « Recyclage — mesuré, pas estimé » est le point faible, et ce n'est pas un détail de forme.** Le critère retenu (« 0 référence DOM dans le corps ») mesure la mauvaise chose. Il compte l'absence de `document.` et conclut à la portabilité, alors que le vrai obstacle de ce code est la **lecture de globales mutables** : les 9 fonctions annoncées lisent entre 2 et 5 globales chacune `[V]`. Aucune n'est pure.
3. **Une des 9 « fonctions » n'existe pas** : `tauxOccupation:6510` est une **ligne d'affectation à l'intérieur de `compute()`**, pas une fonction (`index.html:6510` `[V]`, aucune occurrence de `function tauxOccupation` dans le fichier `[V]`). C'est la preuve que la mesure a été faite sur des numéros de ligne, pas sur des corps de fonction.
4. **Le gain de « 2–3 semaines » est surévalué d'un facteur 2 à 3.** Mon chiffre : **4 à 7 jours**, et il porte sur la *connaissance* (règles, seuils, décalages de calendrier), pas sur du code transféré.
5. **Le calendrier est sous-estimé d'environ 40 %** : 13–14 semaines annoncées, **18–20 semaines** réalistes. Le jalon le plus faux est **J4** (3 sem → 4,5), pour une raison absente du plan : 9 graphiques Chart.js et 2 générateurs PDF à réécrire `[V]`.
6. **La coexistence est décrite comme une règle (« une seule des deux écrit ») sans mécanisme.** Une règle sans mise en application mécanique ne tient pas, et ici l'écrivain fantôme n'est pas `localStorage` : c'est la **synchro Supabase de l'ancienne app**, en dernier-écrit-gagne `[R]`.
7. **Trois absents graves** : la vérification RLS Supabase, la migration du **blob cloud** (le plan ne migre que `freel_v50_*`), et tout budget de performance.
8. Le plan est **pertinent**. Il est **optimisable** : on peut voir un écran réel en semaine 2 au lieu de 3, sans casser un seul interdit.

---

## 2. Réalisme des estimations

| Jalon | Estimé | Mon estimation | Écart | Pourquoi |
|---|---|---|---|---|
| **J0 — Vérité et filet** | 1 sem | **1,5–2 sem** | **+0,5 à 1** | Le plan met dans J0 « réparation du harnais » mais laisse le **harnais différentiel** en J1. Or comparer ancien/nouveau exige d'abord un *exécuteur du monolithe* : charger le script applicatif (l. 1937–24049) dans un VM Node avec bouchons `document`/`window`/`localStorage`. Deux pièges vérifiés : la regex naïve capture jsPDF, premier `<script>` du document `[R, §8.1]`, et `LEGAL` est un IIFE évalué au chargement (`index.html:2710`) `[V]`. C'est 3 à 5 jours à lui seul, et c'est la fondation de tout J1. Ajouter la confirmation externe du taux (dépendance hors de votre contrôle). |
| **J1 — Noyau fiscal** | 2 sem | **3,5 sem** | **+1,5** | Le portage annoncé est en réalité une **réécriture paramétrée** pour 6 des 9 fonctions (§3). S'y ajoute le harnais différentiel si J0 ne l'a pas préparé, et la reprise des barèmes : `LEGAL_BY_YEAR` ne contient que 2025 et 2026 `[V]`, `getLegal()` **retombe silencieusement sur 2026** pour toute autre année (`index.html:2679`) `[V]` — donc la promesse D1 « rouvrir un trimestre 2024 en 2026 utilise le barème 2024 » est aujourd'hui **fausse** et le résolveur est à réécrire, pas à porter. |
| **J2 — Migration et coquille** | 1–2 sem | **2 sem** | **+0,5** | Correct **si** le fil (b) a réellement livré les tokens pendant J1. Mais le plan ne budgète ni l'**idempotence**, ni le **rapport à blanc**, ni l'invariant d'absence de perte, ni la migration du **blob Supabase** (`{c,m,cl,t,ir}`) `[R, 04 §7]` — trois livrables que mon rapport classait P0. |
| **J3 — Pilote** | 2 sem | **2,5 sem** | **+0,5** | Les primitives accessibles (dialogue, onglets, piège de focus, région live, cible 44 px) sont un chantier `L` dans mon rapport (#8), pas `M`. `allTodos()` n'est pas un portage de `computeAlerts` : voir §3. |
| **J4 — Argent et Achats** | 3 sem | **4,5 sem** | **+1,5 — le plus sous-estimé** | Trois coûts absents du plan : (a) **9 instanciations `new Chart(`** à remplacer par du SVG écrit à la main `[V]`, jamais mentionnées dans aucun jalon ; (b) **27 sites jsPDF** `[V]` dont l'export CRA (~470 lignes `[R, 04 §7]`) à refaire en feuille d'impression ; (c) Achats exige de la **nouvelle infrastructure** (IndexedDB + invariant « pas de TVA sans pièce ») et non un recâblage — 04 le classe BLOQUANT, effort `M`, sur un socle à 40 % `[R]`. Argent est par ailleurs la fusion des deux écrans déjà les plus denses `[R, 04 §2]`. |
| **J5 — Activité, Outils, Config** | 3 sem | **3,5 sem** | **+0,5** | Plausible : les 3 simulateurs existent (#04 : Outils ~45 %), le calendrier existe en modale (`10679`) et une vue page est du code mort (`15597`) `[R]`. Mais « journal en ajout seul » est une **structure de données neuve**, pas une conformité de champ. |
| **J6 — Bascule** | 1 sem | **1,5 sem** | **+0,5** | La bascule inclut le gel technique de `/legacy/` (§4), la migration du blob cloud, et la réécriture de `validate.yml` : la CI actuelle exige littéralement `grep -q 'function compute()'` et `grep -q 'function render()'` sur `index.html` à la racine (`.github/workflows/validate.yml:49-50`) `[V]` — elle **échouera mécaniquement** dès que l'ancien fichier descend sous `/legacy/`. |
| **Total** | **13–14 sem** | **18–20 sem** | **+40 %** | — |

### Le désaccord de méthode sur le parallélisme

Le plan présente le fil (a)/(b) comme « le principal levier de compression du calendrier ». **Pour un propriétaire seul, c'est faux — et c'est le point où le calendrier ment le plus.** Le parallélisme supprime les *attentes* (le fil UI n'attend pas que le barème soit arbitré), il n'augmente pas la capacité. Deux sessions d'IA ne dédoublent pas le relecteur, et sur du code fiscal **la relecture est le goulot**, pas la frappe. Par ailleurs les tokens apparaissent deux fois (fil (b) dès J1, puis contenu de J2) et les primitives deux fois (fil (b), puis J3) : les durées additionnées comptent partiellement deux fois le même travail. Conclusion : 13–14 semaines est un **plancher sans imprévu**, pas une estimation. Je le dirais ainsi dans le plan, honnêtement.

---

## 3. Le recyclage à l'épreuve du code

**Section la plus importante de cette revue.** J'ai lu les 9 corps annoncés. Verdict global : **le critère « 0 référence DOM » est un mauvais test, et il a produit une conclusion fausse.**

### 3.1 Table de vérité

| Fonction | Lignes réelles (`index.html`) | Globales lues | Couplage transitif | Sort réel |
|---|---|---|---|---|
| `parseOFX` | **21** (10265–10285) | **aucune** `[V]` | aucun `[V]` | ✅ **Portable tel quel** — pure, une regex sur une chaîne |
| `parseCSV` | **53** (10287–10339) | **aucune** `[V]` | `parseCSVLine`, `parseFlexibleDate`, `parseAmount` (10341–10377) — **toutes pures** `[V]` | ✅ **Portable tel quel** (avec les 3 aides, ~90 lignes au total) |
| `calculateIR` | **52** (4134–4185) | `TODAY` (4135), `COMPANY.typeActivite` (4137) `[V]` | `getIRConfig` (5714) — **écrit dans la globale `IR_CONFIG` à la lecture** `[V]` ; `getLegalAbattement`, `getLegalIRBrackets` → `getLegal` → `LEGAL_BY_YEAR` `[V]` | ⚠️ **À refactorer.** L'arithmétique par tranches (~30 lignes) est bonne et se reprend. Le reste est à re-signer : `(revenuBrut, bareme, configFoyer)`. Effet de bord vérifié : appeler `calculateIR(x, 2030)` **crée** `IR_CONFIG['2030']` depuis `COMPANY` — une fonction de calcul qui mute l'état persisté. |
| `computeCFEEstimate` | **45** (8928–8972) | `TODAY`, `COMPANY.debut`, `COMPANY.cfeTaux`, **`MISSIONS`** (parcours profond mission→factures) `[V]` | aucun appel, mais **table de tranches CFE en dur dans le corps** (8951–8959), **dupliquée** dans `renderCFEResult` (8978–8986) `[V]` | ⚠️ **À refactorer.** Les 7 tranches + les taux 3 %/1 % sont de la **donnée de barème**, à extraire vers `bareme/` (D1 l'exige). Le corps doit recevoir `(caN2, bareme, tauxCommunal)` ; le calcul du CA N-2 sort du domaine fiscal. |
| `reconcileTransactions` | **84** (10381–10464) — **le test a regardé 60 lignes, le corps en fait 84** `[V]` | `MISSIONS`, `TREASURY.mouvements`, `TREASURY.paidCharges` (via `isPaid`), `LEGAL.cfp`, + `TODAY`/`COMPANY` par transitivité `[V]` | **9 fonctions** : `getPaymentDate`, `localISO`, `isPaid`, `getUrssafDebitMonth`, `getUrssafRate` → `getAcreInfo` → `getLegalUrssaf` → `getLegal`, `ym`, **`fmtMonthShort`** (`toLocaleDateString('fr-FR')` — de la **présentation** dans le domaine) `[V]` | ❌ **À réécrire.** Seule la fonction de score (`scoreCandidate`, 10438–10443, **6 lignes**) est portable telle quelle. Les 78 autres lignes construisent des candidats à partir du **schéma de données actuel** — que la refonte remplace. Réécrire contre le nouveau schéma coûte moins que porter. |
| `getNextInvoiceNumber` | **7** (3168–3174) | `COMPANY.invoiceGlobalCounter` `[V]` | **appelle `saveAll()`** (`index.html:3172`) → écriture `localStorage` débouncée à 50 ms (`5631`) `[V]` ; `formatInvoiceNumber` lit `COMPANY.invoiceFormat` et `TODAY` (3140–3142) `[V]` ; la famille inclut `repairInvoiceNumbers` (3181, **renumérote toutes les factures** avec `console.log`) `[V]` | ❌ **À réécrire.** Ce n'est pas un calcul, c'est une **allocation de compteur persistée** — une opération de dépôt (`infra/`), avec réservation et transaction. « 0 référence DOM » ici est vrai et **totalement trompeur** : la fonction écrit sur disque. |
| `computeAlerts` | **88** (6129–6216) — **corps > 60 lignes** `[V]` | `COMPANY`, `TODAY`, **`PERIOD`** (6153 — état de **filtre d'UI** qui pilote un seuil légal !), `MISSIONS`, `LEGAL.plafondBNC`, `LEGAL.seuilTVA` `[V]` | `getAcreInfo`, `getUrssafRate`, `getEffectivePaymentMonth`, `ym`, `EUR`, `PCT`, `fmtLong`, `fmtMonthLongFromDate` `[V]` ; **et son paramètre `data` est produit par `compute()`** (6219–6556, **338 lignes**) — elle lit `data.lateCount`, `data.provisionsAbsolues`, `data.salaireReco`, `data.provByType` `[V]` | ❌ **À réécrire.** Elle **mute** son paramètre et produit des **chaînes de présentation** (emoji, « Relance tes clients! », « Pense à provisionner ») : c'est un constructeur de vue, pas du domaine. Ce qui se recycle est la **liste des 8 règles de seuil**, en spécification. `allTodos()` est un travail neuf. |
| `tauxOccupation` | **1 ligne** (6510) | — | — | 🚫 **N'existe pas.** `data.tauxOccupation = joursOuvrablesTotal > 0 ? data.joursReal / joursOuvrablesTotal : 0` — une affectation au milieu de `compute()`, dépendante de `data.workedDays[m].ouvrables` construit par tout le pipeline amont `[V]`. Rien à porter : une division. |
| `exportLivreRecettes` | **37** (3603–3639) | `TODAY` `[V]` | `getInvoiceRegistry` (3537) → **`COMPANY.invoiceRegistry`** `[V]` ; `toast()` ×2, `Blob`, `document.createElement`, `URL.createObjectURL` `[V]` | ⚠️ **À refactorer** — le plan a raison ici, c'est le cas le mieux diagnostiqué. Le sérialiseur CSV (3616–3631, **~16 lignes** : en-têtes, BOM `﻿`, `;`, échappement des guillemets) se reprend tel quel. Le déclenchement du téléchargement est de l'`infra/`. |
| `LEGAL_BY_YEAR` | 2587–2675 | — | `getLegal` (2679) | ⚠️ **La forme se reprend, le contenu est à revérifier.** Vérifié : seules 2025 et 2026 existent ; `getLegal` retombe sur **2026** pour toute autre année, silencieusement `[V]`. BNC 2026 = **0,256** (25,6 %) `[V]` — soit une **cinquième** valeur concurrente face aux 4 du bundle de design et aux 26,1 % proposés par l'expert. Les plafonds 2026 (83 600 €) portent le commentaire « projet LFI 2026 » `[V]` : des valeurs **prévisionnelles** étiquetées « Taux vérifiés urssaf.fr mars 2026 ». Pas de période d'effet, pas de source par champ, pas de date de vérification par millésime. |
| `CHARGE_TYPES` | 2767–2775 | — | — | ✅ **Portable** (7 entrées ; libellés, icônes, pénalités). Note : contient des **couleurs hex en dur** (`#ef4444`…) `[V]` — à retokeniser pour 4 palettes. |
| `CHARGE_CATEGORIES` | 9999 | — | — | ✅ **Portable** en donnée (14 catégories → 10 cibles = un mappage à décider, pas du code). |

### 3.2 Deux bugs latents que le portage « tel quel » importerait

À citer parce qu'ils invalident l'idée de copier ces fonctions :

- **`LEGAL` est figé au chargement et toujours BNC.** `var LEGAL = (function(){ … var type = (typeof COMPANY !== 'undefined' && COMPANY.typeActivite) || 'BNC'; … })()` à `index.html:2710-2733` `[V]`, alors que `var COMPANY = {…}` est déclaré à `index.html:2801` `[V]`, **après**. Par hoisting, `COMPANY` vaut `undefined` au moment de l'IIFE, donc `typeof COMPANY !== 'undefined'` est **faux** et `type` vaut **toujours `'BNC'`**. Conséquence : tout code lisant `LEGAL.urssaf`, `LEGAL.plafondBNC`, `LEGAL.seuilTVA` — dont **`computeAlerts`** (6168–6169) et **`reconcileTransactions`** (`LEGAL.cfp`, 10431) — utilise les valeurs BNC quel que soit le type d'activité configuré `[V]`. C'est exactement la classe de faute que D1 doit éliminer, et elle est *dans* les fonctions données comme portables.
- **Un filtre d'UI pilote un seuil légal.** `computeAlerts` calcule le CA de contrôle du plafond micro sur `PERIOD.year` (`index.html:6153`), où `PERIOD` est l'état du sélecteur de période (`index.html:2563`) `[V]`. Changer le filtre d'affichage change l'alerte de dépassement de plafond. Interdit structurant de mon rapport (§4.3) : « le domaine ne connaît pas la notion d'écran ». Ici il connaît le sélecteur.

### 3.3 Mon chiffre de gain réel

Décompte de ce qui se transfère **littéralement**, en lignes :

| Catégorie | Lignes | Contenu |
|---|---|---|
| Vraiment portable tel quel | **~140** | `parseOFX` (21) + `parseCSV` et ses 3 aides (~90) + `scoreCandidate` (6) + sérialiseur CSV du livre (16) |
| Portable après re-signature | **~80** | boucle de tranches IR (~30), calcul CFE hors table (~15), `getAcreInfo` (~20, 4 trimestres civils — logique juste), décalage de mois de débit URSSAF (~15) |
| Donnée reprenable | **~110** | `LEGAL_BY_YEAR` (forme), `CHARGE_TYPES`, `CHARGE_CATEGORIES`, table CFE |
| **Total transférable** | **~330 lignes sur ~22 100 de JS applicatif** | soit **1,5 %** |

**Gain réel : 4 à 7 jours** `[H, mais assis sur le décompte ci-dessus]`, dont l'essentiel n'est pas du code mais de la **connaissance extraite** : les 4 trimestres civils d'ACRE, le décalage encaissement→prélèvement URSSAF, la règle de date de paiement, les 7 tranches CFE, les 8 règles de seuil de `computeAlerts`, les 9 colonnes du livre des recettes, les 4 formats de numérotation. Ce corpus vaut cher — comme **spécification testable**, pas comme fichier à copier.

**Et le gain a une composante négative** qu'il faut inscrire au bilan : le portage naïf importerait le repli silencieux sur 2026, le `LEGAL` toujours-BNC, l'écriture-à-la-lecture de `IR_CONFIG`, `PERIOD` dans un seuil légal, et une table CFE dupliquée. Ce sont cinq bugs, dans les fonctions décrites comme prêtes.

**Verdict tranché : le recyclage de code est un mirage à 2–3 semaines ; le recyclage de connaissance est réel et vaut une semaine.** Corriger la section 3 du plan — annoncer « 9 fonctions portées » puis découvrir qu'il faut les réécrire est exactement le mécanisme qui fait glisser un calendrier de 40 %. Mieux vaut écrire dans le plan : *« 2 fonctions portées telles quelles, 4 re-signées, 3 réécrites depuis leur spécification extraite, 1 inexistante. »* C'est moins vendeur et c'est tenable.

### 3.4 Le corollaire positif, souvent manqué

Le harnais différentiel devient **plus** nécessaire, pas moins : puisqu'on réécrit au lieu de porter, la comparaison chiffre-à-chiffre contre l'app en production est la **seule** preuve que la connaissance a bien traversé. Le plan a raison de l'exiger ; il a tort de le placer après le portage. Il doit le précéder.

---

## 4. La coexistence des deux versions

### 4.1 Le risque, précisément

Le plan écrit : « Une seule règle : **une seule des deux écrit les données**. » C'est le bon principe et ce n'est pas un mécanisme. Quatre canaux d'écriture existent, tous vérifiés :

1. **`localStorage`, même origine.** `STORAGE_PREFIX = 'freel_v50_'` (`index.html:5588`) `[V]`, bundle `freel_v50_bundle` écrit par `saveAll()`/`_saveAllImmediate` (`5631`, `5619`) — **débouncé à 50 ms**, donc une écriture peut partir *après* l'action de l'utilisateur `[V]`. Plus les clés annexes `freel_ts`, `freel_theme`, `freel_goal_ca`, `freel_notif_read`, `freel_supabase`, `freel_collapse_*`, `freel_app_version` `[V]`. 38 accès `localStorage.` répartis `[V, rapport 07]`.
2. **La synchro Supabase de l'ancienne app — le vrai danger, et le plan ne le voit pas.** L'ancienne app pousse le blob complet `{c,m,cl,t,ir}` en `upsert(onConflict:'user_id')` = dernier-écrit-gagne silencieux `[R, 04 §4]`, et lit ses identifiants dans `localStorage['freel_supabase']` (`index.html:2006`) `[V]` — donc **la même origine lui donne les mêmes identifiants**. Rendre `/legacy/` en lecture seule sur `localStorage` **ne suffit pas** : elle peut encore écraser le nuage, que la nouvelle version relira ensuite. Un « legacy en lecture seule » qui garde sa synchro n'est pas en lecture seule.
3. **Le garde de version qui recharge la page.** `index.html:1942-1949` : si `localStorage['freel_app_version'] !== APP_VERSION`, la page **réécrit la clé et fait `location.reload()`** `[V]`. Si la nouvelle version réutilise cette clé avec une autre valeur, chaque onglet forcera le rechargement de l'autre à son prochain chargement — une tempête de rechargements, avec perte de saisie en cours.
4. **Deux onglets ouverts.** Scénario concret : onglet A = nouvelle version (schéma migré), onglet B = `/legacy/`. B a chargé `COMPANY/MISSIONS/CLIENTS/TREASURY` en mémoire **avant** la migration. L'utilisateur clique n'importe quoi dans B qui déclenche `saveAll()` → 50 ms plus tard, `freel_v50_bundle` est réécrit avec l'état **d'avant**. Si un jour la migration se rejoue (réinstallation, nouveau navigateur, restauration), elle réimporte cet état périmé. Silencieusement.

### 4.2 Le mécanisme concret, à mettre en place à J2 et non à J6

Cinq mesures, par ordre d'efficacité. Aucune ne demande de toucher aux 24 051 lignes.

1. **Neutraliser l'écriture par substitution du stockage, pas par un drapeau.** `/legacy/index.html` reçoit **un script préfixé, avant tout le reste**, qui remplace `window.localStorage` par un mandataire en mémoire, initialisé une fois par lecture du vrai stockage. À partir de là, **aucun** chemin d'exécution du monolithe ne peut écrire — y compris ceux qu'on aurait oubliés. L'app continue de fonctionner normalement pour la durée de la session ; ses écritures tombent dans le vide. C'est supérieur à « désactiver `saveAll` » parce que ça ne dépend pas de l'exhaustivité de l'inventaire des 38 sites.
2. **Couper la synchro de `/legacy/` à la racine.** Même script préfixé : supprimer `freel_supabase` de la vue mandataire (donc pas d'identifiants → pas de client) **et** neutraliser le point d'entrée réseau. Côté serveur, la protection définitive : la nouvelle version écrit dans une **autre table ou une autre colonne** que celle que l'ancienne connaît. L'`upsert` de l'ancienne ne peut alors plus détruire le nouveau, quoi qu'il arrive.
3. **Espace de noms strictement disjoint.** La nouvelle version n'utilise **aucune** clé `freel_*` existante — surtout pas `freel_app_version`, `freel_ts`, `freel_theme`. Elle **lit** les clés héritées pendant la migration et ne les **écrit jamais**. Corollaire : ne pas reprendre le garde de rechargement par version sur une clé partagée.
4. **Marqueur de migration terminal + empreinte.** Une clé sentinelle (date de migration + empreinte du bundle source). Au démarrage, si la sentinelle existe : ne pas remigrer. Si l'empreinte du bundle hérité a changé depuis, **avertir bruyamment** au lieu de réimporter — c'est l'unique filet si quelqu'un a écrit dans l'ancien schéma malgré tout.
5. **Faire de la règle une propriété testée.** Un test Playwright qui charge `/legacy/`, exécute 5 actions mutantes (créer une facture, marquer payé, régler le curseur, changer le thème, importer un CSV) puis affirme : `localStorage` **inchangé octet pour octet**, et **zéro** requête réseau sortante. Ce test dans la CI est ce qui transforme « une seule des deux écrit » d'une intention en une garantie. Sans lui, la règle tiendra jusqu'au premier oubli.

**Et une mesure de produit, gratuite** : un bandeau permanent, non fermable, en haut de `/legacy/` — « Version archivée, gelée le JJ/MM/AAAA · lecture seule · vos modifications ici ne seront pas conservées ». La confusion de l'utilisateur devant deux apps qui se ressemblent est un risque au moins égal au risque technique.

### 4.3 Un point de calendrier lié

Le plan place la coexistence en J6 mais ne dit **jamais quand l'ancienne app est gelée**. Mon rapport précédent recommandait le gel dès J2 (§« double maintenance »). Or le plan prévoit, « hors séquence », **une modification de l'app actuelle** (l'avertissement facturation électronique). C'est acceptable — à condition de la déclarer explicitement comme **la dernière modification de l'ancienne version**, et de figer immédiatement après. Un gel non daté devient une double maintenance de fait ; c'est le mode d'échec le plus fréquent des coexistences.

---

## 5. Manques

Vérifié point par point contre mon rapport `07`. Présents : harnais différentiel (J1 ✅), instantané avant écriture (J2 ✅), primitives accessibles (J3 ✅), sortie de la mise en page hors du JS (§5 ✅), `viewport-fit`/`dvh`/`user-scalable`/44 px (§5 ✅), assertion zéro-débordement en CI (§5 ✅), interdiction des fonctions nouvelles avant bascule (✅). C'est déjà beaucoup, et le plan est plus dense que la moyenne des plans de refonte. Manquent :

| # | Manque | Gravité | Où l'insérer |
|---|---|---|---|
| 1 | **Vérification des politiques RLS Supabase.** Absente du plan. Ce n'est pas la clé anonyme en clair qui compte (elle est publique par conception) mais la question : chaque ligne de `user_data` est-elle restreinte à son propriétaire ? Si non, la clé publique expose **tous** les utilisateurs `[R, 07 §9.3]`. Coût : une heure. Impact : critique. | **Critique** | **J0**, aujourd'hui |
| 2 | **Migration du blob cloud.** Le plan migre `freel_v50_*` et ignore la table Supabase, au format `{c,m,cl,t,ir}` `[R, 04 §7]`. Un compte déjà synchronisé casse à la bascule, ou pire : le nuage périmé écrase le local migré. | **Critique** | **J2** avec la migration locale |
| 3 | **Idempotence, rapport à blanc, invariant d'absence de perte.** J2 dit « instantané exporté avant écriture » — nécessaire, insuffisant. Migrer deux fois doit égaler migrer une fois ; tout montant source doit être **projeté ou explicitement listé comme abandonné**. Le mot « idempotente » n'apparaît pas dans le plan. | **Critique** | **J2** |
| 4 | **Suppression de Chart.js et différé de jsPDF.** Absents de tous les jalons, alors que ce sont **9 `new Chart(`** et **27 sites jsPDF** `[V]` à recâbler ou remplacer — dont l'export CRA. Ce n'est pas une optimisation : c'est du travail obligatoire non budgété (voir J4). | **Fort (calendrier)** | **J1 fil (b)** pour les 4 primitives SVG ; **J4** pour l'impression |
| 5 | **Aucun budget de performance.** Le plan rend le responsive vérifiable et laisse la performance déclarative. Mon rapport fixait ≤ 130 Ko de JS initial, LCP ≤ 2 s, 0 Ko de jsPDF au chargement, et le **retrait des méta anti-cache** (gain massif, effort minuscule — l'app s'interdit aujourd'hui explicitement le cache `[V, 07]`). Rien de tout cela. | **Fort** | **J0** (limites de taille par morceau, dès le socle) |
| 6 | **Audit d'accessibilité automatisé + contraste sur les 4 palettes.** J3 dit « primitives accessibles » sans mécanisme de vérification. Les 4 couleurs jamais rethémées (`--c-ir`, `--c-cfe`, `--slate`, `--blue-soft` `[R, 03 §1]`) sont des mines par construction : elles ne bougent pas quand le fond passe du sombre au clair. Manquent aussi les **48 captures de référence** (6 écrans × 2 tailles × 4 palettes). | **Fort** | **J2** (contraste, dès les tokens) et **J3** (audit a11y en CI) |
| 7 | **Synchro versionnée (dernier-écrit-gagne).** Absente du plan, y compris de « après bascule ». C'est la seule classe de bug capable d'effacer une comptabilité entière `[R, 07 §9.4]` — **et elle est aggravée par la coexistence** (§4.1). Au minimum : version monotone + identifiant d'appareil, refus d'écriture si le serveur est plus récent. | **Fort** | **J6** au plus tard, idéalement J2 |
| 8 | **États vide / chargement / erreur.** Ni l'existant ni la cible ne les spécifient `[R, 04 §5]` ; le plan ne les mentionne pas. Ils se découvriront écran par écran, c'est-à-dire au pire moment. | Moyen | **J3**, comme motif de primitive |
| 9 | **Nettoyage de la CI héritée.** `validate.yml:49-52` exige `grep -q 'function compute()'`, `'function render()'`, `'function escapeHTML('` sur `index.html` `[V]` : ces gardes échoueront à la bascule et n'ont plus de sens après. J0 dit « réparation du harnais » sans nommer leur retrait. | Moyen | **J0** |
| 10 | **Chiffrement / coffre optionnel, PWA réelle.** Légitimement hors des 6 jalons (P3 dans mon rapport). Mais un plan qui ne dit pas *je diffère sciemment* laisse croire à un oubli. Une ligne « J7+ : durcissement » suffirait. | Faible (forme) | mention explicite |
| 11 | **Le taux 2026 : cinq valeurs, pas quatre.** Le plan dit « aucune des quatre valeurs présentes dans le bundle de design n'est correcte » ; il ignore que le monolithe en porte une cinquième, **0,256** (`index.html:2637`) `[V]`, et que les plafonds 2026 y sont des valeurs de **projet de loi** étiquetées « vérifiées » `[V]`. D1 doit trancher sur 5 candidats et exiger une source **par champ**, pas par millésime. | **Fort (fiscal)** | **J0** |

---

## 6. Optimisations

| Proposition | Gain | Risque |
|---|---|---|
| **A. Un écran réel en semaine 2 au lieu de 3, sans casser un interdit.** Construire la coquille (tokens + rail/dock + routage) en **lecture seule sur l'ancien schéma**, via un adaptateur qui lit `freel_v50_bundle` et le projette en mémoire. On affiche les vrais chiffres de l'utilisateur (calculés par le domaine au fur et à mesure qu'il arrive) sans **aucune** écriture. Les 4 interdits sont respectés : rien n'écrit avant la migration, et le domaine précède toujours l'affichage des nombres. | Preuve visible à S2 ; et surtout le **mappage de migration est validé à l'œil sur données réelles** des semaines avant de devenir terminal — le risque n°1 se dégonfle plus tôt. | Tentation de livrer un écran à demi câblé (« il a l'air de fonctionner » — le défaut exact des prototypes). À contenir par un drapeau de build qui rend l'écriture **impossible**, pas désactivée, et par le mandataire de stockage du §4.2 (même outil, deux usages). |
| **B. Sortir le taux 2026 du chemin critique.** D1 exige un barème daté ; alors typer chaque millésime avec `source`, `dateVerification` et un statut `confirmé | prévisionnel`, et **démarrer J1** avec 25,6 % marqué prévisionnel. Un test échoue si un millésime utilisé en production reste `prévisionnel` au-delà d'une date ; le bandeau « fraîcheur du barème » que la cible réclame déjà devient la lecture de cette métadonnée. | J0 ne peut plus caler en attendant `urssaf.fr`. Et l'app cesse de mentir sur ce qu'elle sait (le défaut vérifié aujourd'hui : « projet LFI 2026 » étiqueté « vérifié »). | Aucun, si le statut est **visible dans l'UI**. Sinon on institutionnalise l'approximation. |
| **C. Déplacer le harnais différentiel de J1 vers J0.** Construire l'« exécuteur du monolithe » (VM Node, script applicatif l. 1937–24049 explicitement sélectionné, bouchons `document`/`window`/`localStorage`, globales semées) **avant** d'écrire une ligne de domaine. Il sert doublement : c'est aussi la réparation du faux vert (#2 de mon rapport). | 3 à 5 jours retirés du chemin critique de J1, et chaque fonction réécrite est comparée **dès sa naissance**, pas à la fin. C'est le meilleur rendement du plan. | Deux pièges vérifiés : la sélection naïve du `<script>` attrape jsPDF `[R]`, et `LEGAL` est un IIFE évalué au chargement qui lit `COMPANY` avant son initialisation (`2710` vs `2801`) `[V]`. Prévoir une demi-journée pour ces deux-là. |
| **D. Reclasser la section 3 : 2 portées, 4 re-signées, 3 réécrites, 1 inexistante.** Et transformer les 6 non-portables en **fiches de spécification** rédigées en J0 (règles, seuils, décalages) qui alimentent directement les jeux de référence. | Supprime la principale illusion de calendrier. Le travail d'extraction n'est pas perdu : c'est exactement l'entrée des tests dorés. | Effet moral (« on recycle moins que prévu »). Préférable à la découverte en semaine 5. |
| **E. Écrire les 4 primitives graphiques (Bars, Donut, Plot, Timeline) dans le fil (b) dès J1–J2.** Ce sont du SVG pur, zéro dépendance au domaine, donc parfaitement parallélisables — au lieu de les découvrir dans J4 en même temps que les deux écrans les plus denses. | Retire ~1 semaine du jalon le plus chargé et le plus risqué. Les 9 `new Chart(` `[V]` cessent d'être une surprise. | Risque de sur-généraliser une primitive avant de connaître ses trois usages réels. Se limiter à ce que le design dessine `[R, 03]`. |
| **F. Inverser Outils et Achats.** Outils (3 simulateurs, calcul pur, aucune infrastructure neuve, socle à ~45 % `[R]`) est **l'écran le moins cher qui prouve le noyau**. Achats est le **seul** qui exige de l'infrastructure neuve (IndexedDB, justificatifs). Ordre proposé : Pilote → Outils → Argent → Activité/Config → **Achats**. | La preuve arrive tôt et bon marché ; le risque d'infrastructure est isolé en dernier, où un dérapage ne bloque plus rien d'autre. | Les justificatifs sont classés BLOQUANT `[R, 04 §3]` — mais ils ne bloquent que la **bascule**, pas les écrans. Donc les faire en dernier avant J6 est légitime, à condition de ne pas basculer sans eux. |
| **G. Cesser d'appeler le fil (a)/(b) un « levier de compression ».** Le renommer « levier de dé-blocage » et ne pas en déduire de réduction de durée pour une personne seule. | Un calendrier honnête, donc tenable, donc respecté. | Le total annoncé monte. C'est le but. |

---

## 7. Ce que je changerais dans le plan

Même contenu, même ordre non négociable, trois différences : le harnais avant le domaine, la coquille en lecture seule avant la migration, l'infrastructure neuve en dernier.

| Jalon | Contenu | Démonstration | Durée |
|---|---|---|---|
| **J0 — Vérité, filet, exécuteur** (élargi) | Registre D1–D6 · **RLS Supabase vérifiée** · barème typé avec `source`/`dateVerification`/statut, **5 candidats de taux tranchés** · **exécuteur du monolithe + harnais différentiel opérationnel** · socle build/TS strict/lint à frontières/CI, **budgets de taille**, retrait des gardes `grep -q` · **6 fiches de spécification** extraites des fonctions non portables | Une CI qui échoue pour la bonne raison **et** un rapport comparant deux fonctions de l'ancienne app à leur future signature | **2 sem** |
| **J1 — Noyau fiscal** · fil (b) tokens + 4 primitives SVG | Domaine pur, barèmes versionnés (D1), D2, D3 · 2 fonctions portées, 4 re-signées, 3 réécrites · chaque sortie comparée à l'ancienne **au fil de l'écriture** | Rapport différentiel : chaque écart est une régression ou une correction décidée en J0 | **3 sem** |
| **J1bis — Coquille en lecture seule** *(nouveau, en recouvrement du fil (b))* | Rail/dock/routage/4 palettes · adaptateur **lecture seule** sur `freel_v50_bundle` · écriture **impossible** par construction | **Pilote affiche vos vrais chiffres en semaine 2**, à 390 et 1440 px, 4 palettes, zéro débordement — sans avoir rien écrit | **inclus** |
| **J2 — Migration** | Dépôt de persistance · migration **idempotente**, rapport à blanc, instantané, invariant d'absence de perte · **migration du blob cloud** · **gel daté de l'ancienne app** · contraste vérifié sur les 4 palettes | Migrer deux fois donne le même résultat qu'une fois ; l'inventaire de ce qui est abandonné est explicite | **2 sem** |
| **J3 — Pilote** | Primitives accessibles + audit a11y en CI · `allTodos()` **écrit** (pas porté) sur les 8 règles extraites en J0 · réserve unifiée (D4) · états vide/chargement/erreur · 48 captures | Côte à côte avec l'ancien Cockpit, écarts tous expliqués par une décision de J0 | **2,5 sem** |
| **J4 — Outils** *(remonté)* | Les 3 simulateurs sur le domaine, zéro nombre en dur · feuille d'impression pour facture et CRA, **jsPDF différé ou supprimé** | L'écran le moins cher qui prouve que le noyau tient sur des données réelles | **1 sem** |
| **J5 — Argent** | L'écran le plus dense · deux seuils de TVA · cycle d'échéance enrichi · **Chart.js supprimé** (les 4 primitives SVG existent depuis J1) | Échéancier et provisions corrects sur données réelles | **2,5 sem** |
| **J6 — Activité et Config** | Calendrier en page · livre des recettes conforme (`paidAt`, `modeReglement`, journal en ajout seul) · D5 · absorption de Compte | Les 6 écrans moins un, les 4 palettes, la matrice complète | **2,5 sem** |
| **J7 — Achats** *(descendu)* | IndexedDB, justificatifs, invariant « pas de TVA sans pièce », état de rapprochement explicite et corrigeable | Un registre d'achats avec pièces réelles ; le trou de conformité comblé | **2 sem** |
| **J8 — Bascule** | Racine de `main` · `/legacy/` **techniquement** en lecture seule (mandataire de stockage + synchro coupée + test Playwright de non-écriture) · bandeau d'archive · synchro versionnée · CI héritée retirée | Vous ouvrez l'URL habituelle, vos données sont là, et un test prouve que l'ancienne app ne peut plus rien écrire | **1,5 sem** |
| **Total** | | | **19 sem** |

**Ce que je ne changerais pas** : les 4 interdits séquentiels (D1 avant tout calcul, domaine avant écrans, migration avant écriture, tokens avant primitives), l'interdiction de toute fonction nouvelle avant la bascule, l'exigence que chaque jalon soit démontrable, et le refus de porter la couche de rendu. Sur ces cinq points le plan est meilleur que la plupart des plans de refonte que j'ai revus, et ce sont eux qui décideront si le chantier bascule ou s'enlise.

**La phrase que je changerais en premier**, parce qu'elle porte le plus grand écart entre ce qui est annoncé et ce qui est vrai :

> ~~« Vérification faite sur les fonctions candidates : 9 sur 10 ne contiennent aucune référence au DOM dans leur corps. »~~
> → « Vérification faite : l'absence de DOM ne prédit pas la portabilité. 2 fonctions sur 10 sont pures ; les autres lisent de 2 à 5 globales mutables, une écrit sur disque, une n'existe pas. Ce qui se recycle est la connaissance fiscale, en spécification testable : **une semaine de gain, pas trois**. »

---

*Fin de la revue. Aucun fichier du dépôt n'a été modifié en dehors de ce rapport.*
