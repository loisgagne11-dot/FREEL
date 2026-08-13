# Freel — Critique technique et recommandation d'architecture

**Revue** : architecture, maintenabilité, performance, expérience développeur.
**Contexte assumé** : un développeur unique assisté par IA, hébergement statique gratuit, données financières locales, exigence responsive haute fidélité PC + mobile.

**Sources lues intégralement** : `01-vision.md`, `02-inventaire-existant.md`, `03-design-system.md`, `04-audit-cablage.md`. `05-spec-ecrans.md` **n'existe pas au moment de cette revue** (répertoire vérifié) — la revue ne s'appuie donc sur aucune spec d'écran détaillée ; là où elle en aurait eu besoin, elle le signale.

**Convention de fiabilité** : `[V]` = vérifié par mesure ou lecture directe pendant cette revue (chiffre reproductible) · `[R]` = repris d'un rapport amont sans revérification · `[H]` = hypothèse ou estimation d'architecte, à assumer comme telle.

---

## 1. Verdict général

1. Le monolithe est un **succès fonctionnel et une impasse architecturale** : la richesse métier (URSSAF, IR, CFE, TVA, FEC, numérotation légale) est réelle et rare ; le véhicule qui la porte est condamné.
2. Chiffre décisif `[V]` : **1 825 objets `style: {…}` et 2 796 appels `el(…)`** dans le JS. Le design system cible (53 tokens, 4 palettes) **ne peut pas** être appliqué en touchant la CSS — la mise en forme vit dans le JS.
3. Le responsive n'est pas déclaratif mais impératif : `adaptMobileGrids()` réécrit `gridTemplateColumns` en inline après chaque rendu, et **ne restaure jamais** au retour vers le desktop `[V]`. La promesse « PC et mobile » est aujourd'hui fausse dans un sens de redimensionnement.
4. Le bundle de design n'est **pas** une implémentation : **4,13 Mo de JS** (React dev + Babel standalone) par page, transpilés dans le navigateur `[V]`.
5. Pire, les prototypes mentent sur leurs propres chiffres : « Micro-BNC 69 % » codé en dur là où le store donne 42 % `[R]`. Ce sont des maquettes de présentation, pas une source de vérité de calcul.
6. Le filet de tests est un **faux vert documenté** : le bloc qui teste les calculs est enveloppé d'un `catch` qui refuse explicitement de compter l'échec, et le `eval()` porte sur le **premier** `<script>` du fichier, c'est-à-dire jsPDF `[V]`. La CI n'a jamais testé un calcul.
7. Le risque n°1 n'est ni le design ni le framework : c'est la **migration des données** et le fait que la cible elle-même embarque quatre taux URSSAF concurrents `[R]`.
8. 34 % du fichier livré est constitué de deux bibliothèques (jsPDF 409 Ko, Chart.js 204 Ko) chargées bloquantes à chaque visite `[V]` — et le `<head>` interdit explicitement la mise en cache `[V]`.
9. Verdict : **réécrire la couche UI, porter le noyau fiscal sous test, migrer une seule fois, et cesser d'appeler « filet » la suite de tests actuelle.**
10. Ce chantier est tenable par une personne seule — à condition de ne pas construire une usine (§3) et de livrer écran par écran (§11).

---

## 2. La décision structurante : réécrire ou faire évoluer ?

### 2.0 Reformuler la question

« Réécrire ou faire évoluer » est mal posé. Le vrai arbitrage est : **quel artefact conserve-t-on ?** L'inventaire des actifs est asymétrique :

| Actif | Valeur | Réutilisable ? |
|---|---|---|
| Connaissance fiscale (`LEGAL_BY_YEAR` 2025/2026, `calculateIR`, tranches, plafonds, ACRE, CFE) | **Très élevée** — c'est le produit | Oui, par **portage** (relecture + typage + tests), pas par copie |
| Exports légaux (FEC 18 colonnes, livre des recettes, numérotation continue) | **Très élevée** — obligation légale | Oui, par portage avec harnais différentiel |
| Parseurs OFX/CSV + heuristique de rapprochement | Élevée | Oui, quasi tel quel (fonctions pures) |
| Générateurs PDF (facture, CRA) | Moyenne | Logique oui, appels jsPDF à recâbler |
| ~60 fonctions `render*()`, 2 796 `el()`, 1 825 styles inline | **Nulle pour la cible** | Non — la cible change la topologie des 6 écrans |
| État global (6 `var`, `COMPUTED` mémoïsé) | **Négative** — `COMPUTED` stocke du dérivé, exactement ce que la cible interdit | Non |
| Suite de tests | **Négative** (faux vert) | Non — à réécrire |

Le code jetable et le code précieux ne sont pas mélangés à 50/50 : la partie précieuse est un noyau de calcul minoritaire en volume, majoritaire en valeur. Toute stratégie qui traite le fichier comme un bloc indivisible se trompe.

### 2.1 Option (a) — Modulariser progressivement le monolithe

**Principe** : découper `index.html` en modules ES, extraire la CSS, garder le rendu impératif, appliquer le nouveau design par retouches.

- **Coût** : élevé et mal placé. Extraire des modules d'un fichier sans build **exige d'abord d'introduire un build** — donc on paie l'outillage de la réécriture sans en récolter les bénéfices. Puis il faut refactorer ~22 000 lignes de code impératif dont la majeure partie sera de toute façon jetée par le nouveau design.
- **Risque** : faible à court terme (rien ne casse), **élevé cumulé**. Sans typage ni tests réels, chaque refactor est aveugle ; le rapport 02 documente déjà des cycles de duplication/nettoyage partiels (« V83 : renderFacturesContent supprimé ici (doublon) ») `[R]`, preuve empirique que cette base résiste au refactor.
- **Délai avant premier écran livrable** : très court (jours) — mais l'écran livré **n'est pas l'écran cible**. On livre vite quelque chose dont personne ne veut.
- **Réversibilité** : excellente.
- **Point d'arrêt fatal** : les 1 825 styles inline `[V]`. Appliquer 53 tokens sur 4 palettes suppose de rouvrir ~1 900 sites de style un par un. Ce n'est pas une modularisation, c'est une réécriture déguisée, effectuée dans les pires conditions (sans types, sans composants, sans tests).

**Verdict : à écarter.** C'est le choix qui paraît prudent et qui coûte le plus cher.

### 2.2 Option (b) — Réécriture complète, page blanche

**Principe** : nouveau dépôt, nouvelle stack, on reconstruit les 6 écrans puis on bascule.

- **Coût** : le plus élevé en apparence, mais le seul qui achète réellement la cible.
- **Risque** : concentré sur trois points précis — perte silencieuse d'un export légal (FEC, numérotation), perte de données utilisateur à la bascule, et le classique « second system effect » (on profite de la réécriture pour ajouter des fonctions, et rien ne sort).
- **Délai avant premier écran livrable** : long si l'on s'interdit de livrer avant l'exhaustivité. C'est là que 80 % des réécritures meurent.
- **Réversibilité** : bonne **tant que l'ancienne app reste déployée**. Nulle après une bascule sans instantané des données.

**Verdict : bon fond, mauvaise mise en scène.** Le contenu de (b) est juste ; sa forme « big bang » est le risque.

### 2.3 Option (c) — Hybride incrémental avec coexistence

**Principe** : les deux applications cohabitent sur la même origine, l'ancienne figée sous un chemin dédié, la nouvelle construite écran par écran, avec une bascule explicite et une migration une seule fois.

- **Coût** : celui de (b) plus une petite dette de coexistence (un chemin de déploiement supplémentaire, un instantané de données).
- **Risque** : le plus bas des trois — **à une condition non négociable** : jamais deux écrivains sur les mêmes données. La coexistence doit être **au niveau du déploiement** (deux bundles statiques indépendants sur la même origine), pas au niveau du runtime. Pas d'iframe, pas de pont JS, pas de store partagé.
- **Délai avant premier écran livrable** : moyen (le noyau fiscal doit précéder) mais **chaque jalon est démontrable** (§11).
- **Réversibilité** : excellente jusqu'à la bascule, puis garantie par un export d'instantané pré-migration conservé côté utilisateur.

**Attention au piège spécifique de la coexistence sur `localStorage`** : les deux schémas (`freel_v50_*` et les stores cible) vivent dans le même espace de noms d'origine. Si l'utilisateur ouvre l'ancienne app après migration, elle écrira dans ses anciennes clés et divergera silencieusement. La règle : la migration est **unidirectionnelle et terminale** — après elle, l'ancienne app doit être **en lecture seule** (écriture désactivée par un drapeau) ou retirée. Ce détail vaut plus que le choix du framework.

### 2.4 Tranche

> **Recommandation : option (c), avec le contenu de (b).**
> **Réécriture complète de la couche présentation et de la couche état** ; **portage sous test du noyau de calcul** ; **coexistence au niveau du déploiement** le temps de livrer les 6 écrans ; **une seule migration de données, précédée d'un instantané exportable et d'un rapport à blanc.**

Trois interdits qui font partie de la recommandation, au même titre que le choix de stack :

1. **Aucune ligne des ~60 fonctions `render*()` ne survit.** Elles sont lues comme documentation du comportement, jamais copiées.
2. **Aucun chiffre issu des `.jsx` prototypes ne survit.** Les prototypes sont une spécification de balisage, de tokens et de libellés (le rapport 01 §5 fixe un vocabulaire imposé à reprendre littéralement) — jamais de valeurs.
3. **Aucun écran n'est écrit avant que le noyau fiscal ne soit typé et testé.** L'ordre inverse est le mécanisme exact qui a produit quatre taux URSSAF concurrents.

---

## 3. Recommandation de stack

Principe directeur : **le minimum d'outils qui rende le maximum de choses impossibles.** Chaque brique doit soit supprimer une classe entière de bugs, soit supprimer du travail manuel. Une brique qui n'apporte qu'un confort est refusée.

| Dimension | Retenu | Pourquoi (1–2 phrases) | Écarté |
|---|---|---|---|
| **Framework** | **React 19** | Les 5 prototypes sur 6 sont déjà du JSX React 18 `[V]` : le portage est mécanique et non une traduction, et c'est l'écosystème sur lequel l'assistance IA est la plus fiable — argument décisif pour un développeur seul. | **Svelte / Vue / Solid** : gains réels mais nuls ici, et transcription complète des prototypes. **Next.js / Remix** : runtime serveur inutile sur un hébergement statique, et facture d'hébergement à terme. **Rester en vanilla** : c'est précisément ce qui a produit 2 796 `el()`. |
| **Repli si le budget de poids casse** | **Preact + compat** | Même API, ~10× plus petit ; on ne l'adopte que si le budget §6 est manqué, pas par principe. | — |
| **Langage** | **TypeScript, strict, non négociable** | Voir §3.1 : c'est ici que se joue la fiabilité fiscale. | JS + JSDoc : la moitié du bénéfice pour la même discipline. |
| **Build** | **Vite** | Sortie 100 % statique compatible GitHub Pages, découpage de code automatique, gestion du chemin de base, démarrage instantané ; zéro configuration exotique. | **Webpack** (complexité sans contrepartie), **Parcel** (écosystème plus mince), **esbuild seul** (pas d'ergonomie de dev), **Babel-in-browser** (mesuré : 3,0 Mo, §6). |
| **Style** | **CSS natif : couche de tokens en variables CSS + CSS Modules par composant** | Le design system **est déjà** un système de variables CSS avec bascule par `data-theme` (4 palettes) : le porter 1:1 coûte presque rien et reste lisible face au handoff. Les Modules donnent l'isolation qui manque et suppriment le piège de l'ordre de chargement (rapport 03 §7.3). | **Tailwind** : ré-encoder 53 tokens en configuration, puis des valeurs arbitraires partout (le handoff n'a **aucune** échelle d'espacement `[R]`) — on paierait la traduction sans gagner la fidélité. **styled-components / emotion** : coût runtime et retour du style-dans-le-JS, la maladie qu'on soigne. **vanilla-extract** : alternative défendable si l'on veut des tokens typés à la compilation ; écarté pour garder la correspondance visuelle directe avec les fichiers du handoff. |
| **Échelle d'espacement** | **À créer** (elle n'existe pas) | Le handoff utilise 2→30 px ad hoc sans token `[R]` : il faut décider une échelle une fois (par ex. 4-6-8-12-16-20-24-32) et **interdire les px bruts par lint**, sinon la dérive recommence. | — |
| **État** | **Deux stores miroirs de la cible (`etat`, `depenses`) + un troisième `reglages`** via **Zustand** | Abonnement par sélecteur (une modification de tranche ne re-rend pas 6 écrans), persistance en middleware, ~1 Ko, pas de provider. Le 3ᵉ store est imposé par les faits : le rapport 01 §7.7 liste des champs Config sans domicile (seuil de sécurité, IBAN de virement, périodicité, délais de paiement). | **Redux Toolkit** (cérémonial pour une personne), **TanStack Query** (aucun serveur aujourd'hui — à ajouter le jour de la synchro, pas avant), **Context seul** (re-rendus globaux). Alternative acceptable sans dépendance : store maison + `useSyncExternalStore`. |
| **Règle d'état** | **Le dérivé n'est jamais stocké** | C'est la règle qui a corrigé le bug historique 3 010 €/3 180 € `[R]`. Un dérivé est un sélecteur pur appelant le domaine ; l'existant fait l'inverse (`COMPUTED` mémoïse et stocke `[V]`). | — |
| **Validation de données** | **Zod ou Valibot, à la frontière de persistance uniquement** | TypeScript ne protège pas de ce qui arrive de `localStorage`, d'un import JSON ou du cloud : c'est exactement là que le schéma doit être vérifié à l'exécution. Valibot si le poids compte. | Validation ad hoc (l'existant : contrôle de taille 5 Mo mais structure vérifiée à la main `[R]`). |
| **Tests** | **Vitest** (domaine) + **Testing Library** (écrans, mince) + **Playwright** (bout en bout, matrice de tailles, captures) | Vitest partage la configuration de Vite (zéro duplication) ; Playwright est le seul moyen de rendre la promesse responsive **vérifiable** et non déclarative (§7). | **Jest** (configuration en double), **Cypress** (plus lourd que nécessaire ici). |
| **Graphiques** | **SVG et CSS écrits à la main** | Le design dessine déjà ses graphiques sans bibliothèque : barres en `div` (`.bars .col`), anneau/donut en cercle, courbe de trésorerie en `.plot` SVG `[R]`. Chart.js pèse 204 Ko mesurés `[V]` pour un service que la cible n'utilise pas. | **Chart.js** (poids, canvas non thémable par variables CSS, donc incompatible avec 4 palettes sans code de pont), **Recharts** (lourd), **D3 complet** (inutile). |
| **PDF** | **Feuille d'impression en voie principale, jsPDF en morceau différé** | Le code actuel construit déjà un document HTML complet pour l'impression de facture `[R]` : une CSS d'impression donne une meilleure typographie pour 0 Ko. jsPDF (409 Ko `[V]`) devient un import dynamique au clic, jamais dans le chargement initial. | jsPDF embarqué (état actuel). |
| **Persistance** | **`localStorage` derrière une interface de dépôt, schéma versionné, migrations explicites** ; **IndexedDB dès les justificatifs** | Le local-first est un atout produit réel, mais il faut une frontière : un seul module sait où les octets vivent. `localStorage` ne peut pas héberger des pièces jointes (quota ~5–10 Mo, chaînes seulement) : les justificatifs imposent IndexedDB. | Écriture directe dispersée (aujourd'hui : 38 appels `localStorage.` répartis `[V]`). |
| **Migration** | **Unidirectionnelle, idempotente, rapport à blanc, instantané pré-migration exporté** | C'est le risque n°1 identifié : elle doit être un livrable testé avec des jeux de données réels, pas un effet de bord du premier chargement. | Migration implicite au démarrage. |
| **Synchro** | **Supabase conservé, mais versionné** (version monotone + identifiant d'appareil, refus d'écriture si le serveur est plus récent, UI de conflit) | L'`upsert` actuel est un dernier-écrit-gagne silencieux `[R]` : deux appareils se détruisent sans un mot. | Blob non versionné (état actuel). Un vrai backend maison : hors budget d'une personne seule. |
| **Qualité** | **Biome** (ou ESLint + Prettier) + **règle de frontières de dépendance** | Un binaire unique et rapide convient mieux à un développeur seul ; la règle de frontières est ce qui empêche l'UI de réimporter du calcul (§4). | — |
| **PWA** | **Manifeste réel + service worker (plus tard)** | Correction factuelle : un manifeste **existe** aujourd'hui sous forme d'URI `data:` avec icônes base64 (`index.html:14` `[V]`), mais **aucun service worker** (0 occurrence `[V]`) — donc aucun hors-ligne, et un manifeste `data:` n'est pas un chemin d'installabilité fiable `[H]`. À traiter comme un jalon tardif, pas comme un acquis. | — |

### 3.1 Pourquoi TypeScript est décisif ici, et pas un confort

Ce n'est pas une préférence de goût. Le domaine manipule des grandeurs qui se ressemblent et ne se comportent pas pareil, et les rapports amont documentent déjà les collisions :

- **Euro contre ratio contre pourcentage.** `tva` d'une dépense est un **montant**, pas un taux `[R]` ; `tauxUrssaf` est un ratio ; `seuilBNCpct` est un pourcentage entier. Des types nominaux (`Euro`, `Ratio`, `Pourcentage`) rendent `montant * pourcentage` impossible à compiler. Sans eux, ce bug est invisible en revue et faux de 100×.
- **Homonymes sémantiques.** `caEncaisse` (fait annuel, base légale des seuils) contre `encaisse()` (dérivé mensuel) : deux notions, un même mot, aucune relation `[R]`. Deux types distincts les empêchent de se substituer.
- **Statuts en chaînes libres.** `'paid' | 'wait' | 'late'`, `'matched' | 'pending' | 'nobank'`, `FSTAT` à 4 valeurs. En unions discriminées, le compilateur exige l'exhaustivité : le jour où le cycle d'échéance s'enrichit (« à déclarer → déclarée → payée », demandé par la cible `[R]`), **tous** les sites à mettre à jour apparaissent, au lieu d'un `else` silencieux.
- **Barème comme donnée typée.** Un millésime est un enregistrement figé avec sa période de validité. Typé, il devient impossible d'appeler un calcul sans préciser sur quel barème — ce qui est précisément ce que l'existant fait mal (lecture d'un global) et ce que la cible fait mal aussi (0,212 en dur dans une formule, ignorant le fait `tauxUrssaf` déclaré à 0,246 `[R]`).
- **Argument d'assistance IA.** Un développeur seul assisté par IA génère beaucoup de code qu'il ne relit pas ligne à ligne. Le typage strict est le seul relecteur qui ne fatigue pas. Sur des règles fiscales, l'absence de typage transforme l'assistance en amplificateur d'erreur.

Sans TypeScript, la seule barrière restante est la revue humaine d'un développeur unique sur un domaine à quatre taux contradictoires. Ce n'est pas une barrière.

---

## 4. Architecture cible proposée

### 4.1 Les quatre couches et le sens des dépendances

- **`domaine/`** — TypeScript pur. Zéro DOM, zéro React, zéro `localStorage`, zéro `Date.now()` implicite (le temps est un paramètre). N'importe **rien** des trois autres couches.
- **`etat/`** — stores et sélecteurs. Détient les **faits**, expose les **dérivés** en appelant le domaine. Un seul écrivain par store.
- **`ui/`** — primitives du design system, puis écrans. Ne connaît que des sélecteurs et des types du domaine. **Ne contient aucun littéral numérique métier.**
- **`infra/`** — tout ce qui touche le monde extérieur : dépôt de persistance, migrations, adaptateur de synchro, parseurs bancaires, PDF, exports légaux, chiffrement. Importe les types du domaine, jamais l'inverse.

Sens autorisé : `ui → etat → domaine` et `infra → domaine`. Toute autre flèche est un défaut. Ce n'est pas une convention orale : **c'est une règle de lint qui casse la CI** (restriction d'imports par répertoire). Sans mise en application mécanique, la frontière tient trois semaines.

### 4.2 Arborescence

- `src/`
  - `domaine/`
    - `types/` — grandeurs nominales (`Euro`, `Ratio`, `Pourcentage`, `AnneeFiscale`), `Periode`, unions de statuts, identifiants typés
    - `bareme/` — **un module par millésime** (`2025`, `2026`, …), un registre, un résolveur par date d'effet, les métadonnées de fraîcheur (source, date de vérification)
    - `fiscal/` — `urssaf`, `ir` (barème et libératoire), `cfe`, `tva` (franchise, seuils, majoré), `abattement`, `seuils`, `acre`
    - `tresorerie/` — `provisions`, `dispo`, `versable`, `burn`, `autonomie`
    - `factures/` — numérotation continue, statuts, DSO, échéances
    - `depenses/` — invariants de rapprochement, TVA récupérable, appariement
    - `calendrier/` — jours ouvrés, fériés, congés, occupation, CRA
    - `formats/` — `eur`, `eurR`, `keur`, `r10` (règles d'arrondi et espace insécable : non négociables `[R]`)
    - `decisions/` — le registre des arbitrages (§5.4), en données commentées, pas en prose éparse
  - `etat/`
    - `etat.store` (faits financiers) · `depenses.store` · `reglages.store`
    - `selecteurs/` — dont **`todos`**, source unique des badges de nav et du panneau « à traiter »
  - `ui/`
    - `tokens/` — les 53 tokens, 4 palettes, l'échelle d'espacement créée, la couche de reset
    - `primitives/` — `Card`, `Kpi`, `Chip`, `Badge`, `Table` (avec son propre conteneur de défilement), `Sheet`, `Subtabs`, `Pillars`, `Rail`, `Dock`, `SysBar`, `InfoDisclosure`, `Toast`, `Field`
    - `graphiques/` — `Bars`, `Donut`, `Plot`, `Timeline` en SVG/CSS
    - `ecrans/` — `pilote/`, `activite/`, `argent/`, `achats/`, `outils/`, `config/`
  - `infra/`
    - `stockage/` — dépôt, schéma, `migrations/` (une par transition de version)
    - `fichiers/` — justificatifs en IndexedDB
    - `synchro/` — adaptateur Supabase, versionnement, résolution de conflit
    - `banque/` — port unique, deux implémentations : import de fichier (OFX/CSV) et agrégateur agréé (plus tard)
    - `documents/` — exports FEC, livre des recettes, export RGPD, PDF différé
    - `crypto/` — coffre optionnel
  - `routes/` — une route par écran
- `tests/`
  - `domaine/` — dont `golden/<millesime>/` (jeux de référence figés par année)
  - `migrations/` — jeux de données réels avant/après
  - `differentiel/` — comparaison sortie ancienne app / nouvelle app (FEC, livre, numérotation)
  - `e2e/` — parcours + matrice de tailles + captures de référence
- `fixtures/` — les données de démo, **extraites des prototypes**, utilisées par les tests et par un mode démo explicite

### 4.3 Isolation du noyau de calcul fiscal — la frontière la plus importante du projet

Quatre exigences, dans cet ordre :

1. **Testable sans DOM.** Toute fonction du domaine est pure : entrées explicites, sortie déterministe, aucun accès à un global, aucune lecture d'horloge implicite. Conséquence pratique : les tests fiscaux tournent en millisecondes, donc ils tournent à chaque sauvegarde, donc ils sont réellement exécutés. C'est le seul mécanisme qui empêche la dérive.
2. **Le barème est une donnée, pas du code.** Chaque millésime est un enregistrement figé, avec période d'effet, source de référence et date de vérification. **Aucun calcul ne lit un barème global** : il le reçoit en paramètre. Trois bénéfices immédiats : on peut calculer une déclaration 2025 en 2027 sans mentir ; les jeux de référence par année ne peuvent pas dériver quand on ajoute 2027 ; et le bandeau « fraîcheur du barème » exigé par la cible `[R]` devient une lecture de métadonnée, pas un texte codé en dur.
3. **Aucune constante fiscale hors du barème.** L'existant et la cible partagent le même défaut : des taux inscrits dans des formules (`× 0.212`, `× 0.022`, `× 0.66`, le mystérieux `× 1.56`) et des simulateurs qui recalculent leur propre abattement au lieu de lire le store `[R]`. Règle mécanique : **un littéral numérique dans `fiscal/` ou dans `ui/` fait échouer le lint** ; les seuls nombres autorisés vivent dans `bareme/`.
4. **Chaque ambiguïté arbitrée est nommée et tracée.** Le module `decisions/` porte, pour chaque point tranché (taux URSSAF retenu, sort du facteur `× 1.56`, sémantique de `provisions()` vis-à-vis des échéances déjà payées, mécanisme de réserve retenu, calcul ou saisie de `late`), la décision, sa justification et la date. Un test lie chaque décision à au moins un cas de référence. Sans cela, la même contradiction réapparaîtra dans six mois sous une autre forme.

**Interdit structurant** : le domaine ne connaît pas la notion d'écran. Si une fonction de `domaine/` a besoin de savoir « on est sur Pilote », la frontière est déjà cassée.

---

## 5. Séparation des responsabilités — critique des deux côtés

### 5.1 Côté existant : quatre responsabilités dans une seule fonction

Les ~60 fonctions `render*()` font simultanément le calcul, la lecture d'état, la mise en forme et la construction du DOM. Éléments vérifiés :

- **Affichage et calcul liés.** `compute()` est appelée 70 fois `[V]` et le dispatcher `render()` commence par `invalidateCompute()` `[V]` : afficher **déclenche** le calcul. On ne peut donc pas tester un calcul sans monter un écran — ce qui est exactement pourquoi la suite de tests a fini par faire du `eval()` sur le fichier entier, et par échouer.
- **Dérivé stocké.** `COMPUTED` est une variable globale contenant le résultat mémoïsé `[V]`. C'est la faute que l'architecture cible existe pour interdire.
- **Style dans la logique.** 1 825 objets de style dans le JS, 114 attributs `style=` dans des chaînes `[V]`. Nuance honnête : le JS utilise déjà 1 454 fois `var(--token)` `[V]` — le travail de tokenisation des **couleurs** est largement fait ; il reste 250 valeurs hexadécimales en dur (38 distinctes) `[V]`, et surtout **toute la géométrie** (espacements, rayons, colonnes) est en px codés dans le JS. C'est la géométrie, pas la couleur, qui rend le reskin impraticable.
- **Décision de mise en page dans le rendu.** `adaptMobileGrids()` interroge `#app [style]` — donc chaque nœud stylé — après chaque rendu, et réécrit les colonnes selon `window.innerWidth` `[V]`. La mise en page est une conséquence du JS, pas de la CSS.
- **Sécurité au point de concaténation.** `escapeHTML()` doit être appelée correctement sur 48 sites `innerHTML` `[V]`. Un rendu par composants supprime cette classe entière de défauts par construction : ce n'est plus une discipline, c'est une propriété.
- **Routage et état d'UI mélangés au métier.** `VIEW`, `ACTIVITE_TAB`, `FINANCES_TAB`, `CONFIG_TAB`, `COMPTE_TAB`, `TRESORERIE_TAB` sont des `var` globales au même niveau que `COMPANY` et `TREASURY` `[R]`, dont deux sont mortes. L'état de navigation doit vivre dans les routes ; l'état de sous-onglet dans le composant ou l'URL ; ni l'un ni l'autre dans le magasin financier.

### 5.2 Côté cible : la même maladie, mieux habillée

C'est le point que la revue veut souligner sans complaisance : **le bundle de design n'est pas plus propre que l'existant, il est seulement plus récent.** Les prototypes mélangent présentation, calcul et données de démo, et le font de façon **plus dangereuse** parce que la trahison est silencieuse :

- **Chiffres de démo en dur contredisant le store.** Le résumé plié de la carte « Seuils » affiche `« Micro-BNC 69 % (53 600 / 77 700 €) »` alors que le store donnerait 42 % `[R]`. Une maquette qui affiche un mauvais chiffre est une maquette ; un composant livré qui affiche un mauvais chiffre est un bug fiscal.
- **Modale entièrement fictive.** `DeclarationUrssaf` code `CA = 17 200` et un taux de 11,6 % étiqueté « taux ACRE », là où la formule canonique du store applique 21,2 % `[R]`. Deux écrans, deux vérités, sur la déclaration sociale.
- **Calcul réimplémenté hors du store.** Le simulateur d'impôt recalcule son propre abattement (`CA × 0,66`) et son propre taux libératoire (0,022) au lieu de lire l'état `[R]`. C'est la genèse mécanique du bug 3 010 €/3 180 €, reproduite dans le prototype censé l'avoir corrigé.
- **Enveloppes mi-store mi-démo.** La cible d'une enveloppe vient du store, le montant déjà provisionné est une constante de démo `[R]`. Un composant à demi câblé est plus dangereux qu'un composant non câblé : il a l'air de fonctionner.
- **Dépendances globales avalées.** Le shell lit `window.FreelEtat` / `window.FreelDepenses` sous `try/catch` qui retombe silencieusement sur des valeurs de maquette `[R]`. Un portage naïf « fonctionne » avec des données vides, sans qu'aucune erreur ne remonte. À proscrire absolument : **une source de données absente doit être une erreur bruyante**, jamais une valeur de repli.
- **Responsabilités transverses par chirurgie du DOM.** Le shell devine quel écran est affiché par une regex sur `document.title`, apparie les badges de nav par **préfixe du texte visible** du lien, relie un « i » à son explication par proximité de nœuds frères, reparente le bouton flottant selon `window.innerWidth`, et rejoue tout cela via un `MutationObserver` `[R]`. Ce n'est pas portable — et le rapport 03 §5 en donne déjà la traduction composant par composant. À suivre à la lettre.
- **Cascade dépendante de l'ordre de chargement.** `v1.11.css` réécrit silencieusement `freel.css`, au point que `--r`/`--r-sm` ne sont pas redéfinis en thème clair et héritent du thème sombre `[R]`. Dans la cible, **chaque token a une source unique** ; la superposition de deux feuilles où la dernière gagne est un mécanisme à supprimer, pas à reproduire.

### 5.3 Ce que les prototypes doivent devenir

| Ce que le prototype contient | Statut à l'implémentation |
|---|---|
| Balisage, structure de cartes, ordre des sections | **Spécification** — à suivre |
| Tokens, palettes, media queries, classes | **Spécification** — à porter, en corrigeant les pièges du rapport 03 §7 |
| Libellés exacts (rapport 01 §5, vocabulaire imposé) | **Spécification contraignante** — à reprendre littéralement |
| Tout nombre, tout taux, tout montant, toute liste de démo | **À supprimer** — remplacé par un sélecteur, ou déplacé dans `fixtures/` |
| Heuristiques de shell (titre, préfixe, frères, reparentage) | **À supprimer** — remplacé par des composants et un routage réels |

Deux règles mécaniques suffisent à tenir ça : **aucun littéral numérique dans `ui/`** et **aucun accès à `window.*` depuis un composant**. Toutes deux se vérifient par lint, donc en CI.

### 5.4 Le préalable non technique

Quatre décisions produit doivent être prises **avant** la première ligne de domaine : le taux URSSAF canonique parmi 21,2 / 24,6 / 11,6 / 10,6 %, le sort du facteur `× 1.56` dans `cotisIR()`, la sémantique de `provisions()` (inclut-elle les échéances déjà payées, au risque de soustraire deux fois le même argent de `dispo()` ?), et le mécanisme de réserve retenu (montant absolu du curseur Pilote contre pourcentage de Config) `[R]`. Ce ne sont pas des détails d'implémentation : ce sont les quatre endroits où l'application peut mentir à son utilisateur sur ce qu'il doit à l'URSSAF. Aucun choix de stack ne compense une ambiguïté ici.

---

## 6. Performance

### 6.1 Ce qui est mesuré aujourd'hui

| Élément | Mesure `[V]` | Commentaire |
|---|---|---|
| `index.html` total | **1 862 539 octets** | Document unique : aucun découpage possible |
| Même fichier compressé (gzip) | **478 688 octets** (~467 Ko) | Ce que le réseau transporte réellement |
| jsPDF embarqué (l. 18–392) | **419 290 octets** (409 Ko) | Dans le `<head>`, **bloquant**, analysé avant tout affichage |
| Chart.js embarqué (l. 393–408) | **208 566 octets** (204 Ko) | Idem |
| **Total bibliothèques** | **627 856 octets = 34 % du fichier** | Payé à chaque visite, y compris par un utilisateur qui n'exporte aucun PDF et n'ouvre aucun graphique |
| JS applicatif (l. 1937–24049) | **1 127 184 octets** (1 101 Ko) | Analysé intégralement avant le premier rendu |
| CSS (l. 439–1834) | **87 643 octets** (86 Ko) | |
| Politique de cache | `no-cache, no-store, must-revalidate` + `Pragma` + `Expires: 0` dans le `<head>` | **Le navigateur reçoit l'ordre de ne jamais mettre en cache** : ~467 Ko retéléchargés à chaque session, indéfiniment |
| Appels `compute()` | **70** | Recalcul complet invalidé à chaque `render()` |
| Cycle de rendu | `container.replaceChildren()` puis parcours de `#app [style]` | Destruction/reconstruction totale de l'écran à chaque changement d'état |

### 6.2 Le coût de Babel dans le navigateur (prototypes)

| Ressource chargée par page de prototype | Poids réel mesuré `[V]` |
|---|---|
| `react@18.3.1` UMD **development** | 109 931 octets |
| `react-dom@18.3.1` UMD **development** | 1 080 227 octets |
| `@babel/standalone@7.29.0` | **3 137 752 octets** |
| **Total avant la moindre ligne d'application** | **4 327 910 octets — 4,13 Mo** |
| Puis, transpilés **à chaud à chaque chargement** | `argent-app.jsx` 46 Ko, `activite-app.jsx` 36 Ko, `achats-app.jsx` 32 Ko, `config-app.jsx` 20 Ko, `outils-app.jsx` 18 Ko |

Trois conséquences, dont une souvent oubliée. **Le poids** : 4,13 Mo, soit 2,3× le monolithe déjà jugé obèse. **Le temps processeur** : Babel standalone doit être analysé, exécuté, puis compiler du JSX sur le fil d'exécution principal, avant tout affichage — sur un mobile milieu de gamme, cela se compte en secondes `[H]`. **La sécurité** : la transpilation à chaud exige `unsafe-eval`, ce qui interdit toute politique de sécurité de contenu stricte (§9).

Compilé et minifié en production, React + ReactDOM représente environ 45 Ko compressés `[H, estimation d'après les tailles publiées]` — un rapport d'environ 30× sur le seul socle. C'est l'argument technique le plus simple du dossier : **la compilation n'est pas un raffinement d'ingénierie, c'est la différence entre une application et une maquette.**

### 6.3 Les autres coûts identifiés

- **`backdrop-filter`.** 3 occurrences aujourd'hui `[V]`, mais la cible l'emploie simultanément sur la barre supérieure, le bouton flottant, le dock mobile et le voile de la feuille latérale `[R]` — jusqu'à quatre surfaces floutées superposables. Chaque couche floutée impose une passe de composition hors écran sur son arrière-plan ; les empiler est la cause classique de saccade au défilement sur Android d'entrée de gamme. **Recommandation : une seule surface floutée en permanence (le dock), repli opaque ailleurs, sous `@supports`, et désactivation sous `prefers-reduced-transparency`.**
- **Rendus inutiles.** Aujourd'hui : 100 % de l'écran reconstruit pour tout changement `[V]`. Demain, le piège symétrique est un store monolithique dont chaque écriture re-rend les 6 écrans. D'où l'exigence d'abonnements par sélecteur (§3) — c'est le seul choix de stack motivé par la performance et non par le confort.
- **Sélecteur `:has()` en garde-fou de débordement.** Fonctionnel, mais c'est une heuristique CSS pour compenser l'absence de composant : la bonne réponse est un composant `Table` qui **possède** son conteneur de défilement `[R]`.
- **Absence de `prefers-reduced-motion`** : 0 occurrence `[V]`. À corriger d'emblée, c'est gratuit.

### 6.4 Budget de performance cible (à faire échouer la CI)

Cible de référence : mobile milieu de gamme, 4G, **première visite**.

| Indicateur | Budget | Vérification |
|---|---|---|
| JS de la route initiale (socle + shell + Pilote), compressé | **≤ 130 Ko** | Limite de taille par morceau, échec de build |
| CSS totale, compressée | **≤ 40 Ko** | Idem |
| Chaque écran secondaire (morceau différé), compressé | **≤ 40 Ko** | Idem |
| jsPDF, exports FEC, parseurs bancaires, graphiques lourds | **0 Ko au chargement initial** | Import dynamique, vérifié par analyse du graphe de morceaux |
| LCP | **≤ 2,0 s** mobile/4G (≤ 1,5 s en filaire) | Lighthouse CI sur Pilote et Argent |
| INP | **≤ 150 ms** (marge sous le seuil « bon » de 200 ms) | Lighthouse CI + mesure manuelle sur le curseur de réserve, l'interaction la plus sensible |
| CLS | **≤ 0,05** | Lighthouse CI |
| Transfert en visite répétée | **≤ 15 Ko** | Actifs hachés immuables + **suppression des méta anti-cache** |

Actions concrètes, par ordre de rendement : supprimer les méta anti-cache et adopter des actifs hachés immuables (gain massif, effort minuscule) · supprimer Chart.js (−204 Ko) · différer jsPDF (−409 Ko du chemin critique) · découper par route · compiler au lieu de transpiler à chaud (−4,1 Mo par rapport au prototype) · abonnements par sélecteur · virtualisation **uniquement** au-delà de ~200 lignes (registre des achats, mouvements bancaires) — pas avant, la complexité ne se justifie pas.

---

## 7. Responsive et qualité d'exécution

### 7.1 Mobile-first, contre le handoff

Le handoff est écrit **desktop-first** : 8 media queries `max-width`, un palier 720 px redondant avec 760 px, et une réécriture du rail mobile par ordre de chargement `[R]`. Porter cette cascade telle quelle, c'est importer le piège n°3 du rapport 03 dans une base neuve.

**Recommandation : réexprimer les trois régimes en couches additives `min-width`.** Base = téléphone (colonne unique, dock) ; `≥ 761px` = rail latéral 212 px + grille 12 colonnes ; `≥ 1081px` = spans complets ; `≥ 1151px` et `≥ 1321px` = enrichissement progressif des libellés de la barre supérieure. Résultat visuel identique, **une seule source par règle**, et plus aucun `!important`.

**Breakpoints à retenir** : **760/761** (le seul vraiment structurel : dock ↔ rail), **1080/1081** (bascule de grille, KPI 4→2), **1150** et **1320** (masquage progressif de libellés).
**À supprimer** : **720 px** (redondance vérifiée avec 760 `[R]`) et **900 px** — les protections anti-débordement qu'il porte (`min-width: 0` sur les enfants de grille, conteneur de défilement des tableaux) ne sont pas des règles de taille d'écran mais des **propriétés permanentes** des primitives `Card` et `Table`.
**À ajouter** : des **container queries** pour les cartes qui apparaissent tantôt en tiers de largeur, tantôt en pleine largeur. C'est le plus gros gain de maintenabilité disponible par rapport au handoff : une carte s'adapte à la place qu'on lui donne, et non à la taille de la fenêtre — donc on n'invente plus de breakpoint global à chaque nouvelle disposition. Zéro `@container` aujourd'hui `[V]`.

### 7.2 Ce qui doit passer du JS au CSS

**Règle absolue : aucun code JS ne lit la largeur du viewport pour décider d'une mise en page.**

| À supprimer | Remplacement |
|---|---|
| `adaptMobileGrids()` — réécriture inline des colonnes de grille `[V]` | Media/container queries sur les primitives de grille |
| Bug vérifié du même mécanisme : sortie anticipée si `innerWidth > 600` et **narrowing uniquement**, écouteur `resize` qui ne déclenche que le chemin d'étrécissement `[V]` — élargir la fenêtre au-delà de 600 px ne restaure rien jusqu'au prochain rendu complet | Disparaît par construction : la CSS est bidirectionnelle |
| `placeFab()` — reparentage d'un nœud entre `body` et la barre supérieure selon la largeur `[R]` | Deux emplacements rendus, un seul visible par media query — ou un seul emplacement |
| Toute branche `window.innerWidth` dans une fonction de rendu (6 occurrences `[V]`) | CSS. Si un comportement non graphique en dépend réellement, `matchMedia` avec abonnement — jamais un écouteur `resize` |

### 7.3 Cible tactile

- **Minimum 44 × 44 px de zone d'appui** pour tout élément interactif (recommandation historique iOS ; le minimum normatif WCAG 2.2 SC 2.5.8 est 24 × 24 — viser 44 et non le plancher). Le handoff échoue sur deux composants : la pastille `.info` à **18 × 18 px** et la pastille de statut mobile à **9 × 9 px** `[R]`.
- **Méthode** : agrandir la **zone d'appui** sans toucher au visuel (remplissage ou pseudo-élément transparent). Le point de 9 px reste un point de 9 px à l'œil et devient une cible de 44 px au doigt.
- **Faire porter la contrainte par les primitives**, pas par les écrans : un minimum global sur `Button`, `IconButton`, `NavItem`, `Chip`, `InfoDisclosure` est vérifiable une fois pour toutes (§7.6).
- **Correction d'accessibilité immédiate** : le viewport actuel porte `maximum-scale=1.0, user-scalable=no` `[V]` — le zoom par pincement est interdit, ce qui contrevient à WCAG 1.4.4. À retirer. Corollaire : les champs de saisie doivent être à **au moins 16 px**, sinon Safari iOS zoomera de lui-même une fois `user-scalable` rétabli.

### 7.4 Safe-area iOS et dock flottant

- Déclarer **`viewport-fit=cover`**, sans quoi `env(safe-area-inset-*)` vaut 0 et tout le travail de marge de sécurité est inopérant. À vérifier explicitement : le viewport actuel ne le porte pas `[V]`.
- Le dock se positionne à **son décalage propre + `env(safe-area-inset-bottom)`** (le handoff le fait déjà, à 13 px + inset `[R]`) ; la page réserve un **remplissage bas égal à hauteur du dock + inset**, sinon la dernière ligne de chaque écran est inatteignable — défaut classique et invisible en test desktop.
- **`100dvh` / `100svh` plutôt que `100vh`** pour les feuilles plein écran : sur Safari iOS, `100vh` ignore la barre d'outils escamotable et coupe le bas du contenu (le bouton de validation, typiquement). Zéro occurrence de `dvh`/`svh` aujourd'hui `[V]`.
- **Tester en mode autonome (installé)**, pas seulement dans l'onglet : les insets et la hauteur disponible diffèrent. Et tester sur un appareil à encoche réel — l'émulation ne reproduit pas fidèlement les insets `[H]`.

### 7.5 Clavier virtuel

Le défaut à anticiper : sur iOS, focaliser un champ situé dans un conteneur `position: fixed` fait défiler le **viewport visuel** sans déplacer la couche fixe — le champ se retrouve sous le clavier, et l'utilisateur ne peut ni le voir ni atteindre le bouton de validation.

- **Ne pas placer de formulaire dans une surface fixe sur mobile.** Le handoff fait déjà le bon choix : la feuille latérale devient plein écran à défilement normal sous 760 px `[R]`. Le conserver.
- **Masquer le dock flottant tant qu'un champ a le focus** — sinon il recouvre le champ ou le bouton d'action.
- **Réserver l'espace à partir du signal réel** (viewport visuel / API de clavier virtuel) plutôt que de deviner une hauteur.
- **Amener le champ focalisé dans la vue après stabilisation du clavier**, pas au moment du focus (sinon le calcul se fait avant l'apparition du clavier et se trompe).
- **Déclarer le bon mode de saisie** : clavier décimal pour les montants, avec un analyseur **tolérant à la virgule** — l'utilisateur français saisit `1 234,56`. Un montant mal analysé est un bug fiscal, pas un détail d'UX.

### 7.6 Rendre la promesse vérifiable, pas déclarative

Matrice de tailles minimale, en automatisé sur chaque PR : **320** (contrainte extrême), **360 × 800** (Android d'entrée de gamme), **390 × 844** (iPhone courant), **768 × 1024**, **1280 × 800**, **1440 × 900**.

Assertions, pour chaque écran :

1. **Zéro débordement horizontal à 390 px** — et c'est mesurable, pas déclarable : la largeur de défilement de l'élément racine doit être **inférieure ou égale** à sa largeur cliente. Cette assertion unique attrape la quasi-totalité des régressions responsive.
2. **Aucun élément dont la boîte englobante dépasse la largeur du viewport**, sauf ceux explicitement placés dans un conteneur à défilement horizontal (tableaux, barres d'onglets) — la liste des exceptions est une donnée du test, donc une décision consciente.
3. **Toute cible interactive ≥ 44 × 44** de zone d'appui, avec liste d'exceptions documentée et versionnée.
4. **Le dock ne recouvre aucun élément interactif** de la dernière ligne de contenu.
5. **Contraste calculé sur les paires de tokens, pour les 4 palettes** — priorité aux 4 couleurs jamais rethémées identifiées par le rapport 03 (`--c-ir`, `--c-cfe`, `--slate`, `--blue-soft`) `[R]`, qui sont des mines par construction : elles ne changent pas quand le fond passe du sombre au clair.

**Captures de référence** : 6 écrans × 2 tailles × 4 palettes = 48 images. C'est peu coûteux et c'est précisément ce qui attrape les régressions de cascade et de thème que l'œil d'un développeur seul ne verra pas. À exécuter sur chaque PR ; à re-valider explicitement lors d'un changement de design intentionnel.

---

## 8. Qualité, tests, CI

### 8.1 L'anti-pattern à nommer : les tests faussement verts

Nommons-le : **verdissement par exception avalée** (*green-washed test suite*). Vérifié dans `tests/smoke-test.js` `[V]` :

- L'intégralité du bloc « Exécution JS (calculs purs) » — les 12 seules assertions qui testent un comportement — est dans un `try` dont le `catch` **affiche un avertissement et ne touche pas au compteur d'échecs**, avec un commentaire qui l'assume : « Ne pas compter comme échec ». La suite sort en code 0.
- Le mécanisme est un `eval()` sur un `<script>` extrait par expression régulière **non gourmande** : il capture donc le **premier** script du document, c'est-à-dire **jsPDF**, jamais le code applicatif. Même sans l'exception avalée, ce bloc n'aurait jamais testé Freel.
- Le reste de la suite assérte `html.includes('function compute()')` — la **présence d'une chaîne de caractères** comme substitut à un comportement. La CI répète cette vérification en `grep -q` `[V]`.

Trois règles pour que cela ne se reproduise pas, applicables à toute stack :

1. **Aucun `catch` dans un test qui ne se termine pas par un échec.** Une erreur inattendue est un échec, jamais un avertissement.
2. **Garde-fou de compte d'assertions** : chaque suite déclare un nombre minimum d'assertions exécutées ; en dessous, elle échoue. C'est la seule protection contre « le test n'a pas tourné » — le mode de défaillance le plus insidieux, parce qu'il est indiscernable du succès.
3. **Aucune assertion sur le texte source.** On teste des fonctions importées, jamais la présence d'une déclaration. Corollaire : supprimer les vérifications `grep -q 'function compute()'` de la CI, qui encodent la forme du monolithe et échoueront sans signification après la réécriture.

### 8.2 Ordre de priorité des tests — le noyau fiscal avant l'UI

1. **Barème et fiscal (priorité absolue, couverture visée 100 % par millésime).** Jeux de référence figés par année : IR par tranche avec les valeurs **frontières** (11 497 / 29 315 / 83 823 / 180 294) et le quotient familial ; URSSAF/CFP/libératoire sur le taux **arbitré** ; abattement 34 % ; plafond micro-BNC et seuils de franchise TVA (dont majoré) ; fenêtre ACRE ; tranches CFE. Plus des propriétés : monotonie (un CA supérieur ne peut pas produire un impôt inférieur), et conformité de format (arrondi à 10 €, espace insécable, virgule décimale — non négociables `[R]`).
2. **Invariants de dérivation.** `dispo = solde − provisions`, `versable = max(0, dispo − reserve)`, et surtout **un test qui épingle la sémantique décidée de `provisions()`** — avec ou sans les échéances déjà payées. Sans ce test, l'ambiguïté peut basculer silencieusement au premier refactor, et l'utilisateur se croira 2 000 € plus pauvre ou plus riche qu'il n'est.
3. **Migrations (le risque n°1).** Pour chaque transition de version : un jeu de données réel (dont un vrai bundle `freel_v50_*` avec `COMPANY/MISSIONS/CLIENTS/TREASURY/IR_CONFIG`), une sortie attendue, un test d'**idempotence** (migrer deux fois = migrer une fois) et un invariant d'**absence de perte** : tout montant source est soit projeté, soit **explicitement listé comme abandonné** dans le rapport de migration. « Abandonné silencieusement » n'est pas une option.
4. **Harnais différentiel contre l'ancienne application.** Pour le FEC, le livre des recettes et la numérotation de factures — obligations légales — comparer les sorties ancienne/nouvelle sur les mêmes entrées, idéalement octet pour octet. C'est le vrai filet de sécurité de la réécriture, et il est peu coûteux parce que ces fonctions sont déjà pures.
5. **Numérotation de facture** : continuité (aucun trou, aucun doublon), réservation, réparation. Contrainte légale, donc test dédié.
6. **Invariants dépenses** : aucune TVA récupérable sans pièce jointe ; un compte non synchronisé n'est jamais rapproché `[R]`.
7. **Puis l'UI, mince** : un test par écran pour les états **vide / chargement / erreur** — que ni l'existant ni la cible ne spécifient (§lacune documentaire commune aux deux rapports) — et la matrice visuelle du §7.6.

Note sur la couverture : imposer un plancher élevé **sur `domaine/` uniquement** (par ex. 90 % de lignes, 100 % sur `bareme/`). Un objectif de couverture global n'incite qu'à tester des composants triviaux pour faire du chiffre.

### 8.3 Garde-fous en CI

Un seul workflow de PR, un workflow de déploiement déclenché après lui :

| Garde-fou | Casse la CI ? |
|---|---|
| Vérification de types (mode strict) | Oui |
| Lint, dont **frontières de dépendance** (`ui` ne peut pas importer `infra`, `domaine` n'importe rien) et **aucun littéral numérique dans `ui/`** | Oui |
| Tests du domaine + plancher de couverture sur `domaine/` | Oui |
| **Garde-fou de compte d'assertions** | Oui |
| Tests de migration + idempotence | Oui |
| Harnais différentiel FEC / livre / numérotation | Oui |
| Budget de taille par morceau | Oui |
| Matrice Playwright + assertion zéro-débordement | Oui |
| Comparaison de captures (48 images) | Oui, avec re-validation explicite en cas de changement voulu |
| Audit d'accessibilité automatisé sur les 6 écrans | Oui |
| Budget Lighthouse sur Pilote et Argent | Avertissement d'abord, bloquant ensuite |
| Détection de secrets **par forme de clé** (clé de service, jeton) | Oui — l'heuristique actuelle `grep 'password.*='` `[V]` ne détecte pas ce qui compte |

À supprimer de la CI actuelle : les vérifications structurelles par `grep -q` de noms de fonctions, et l'avertissement de taille à 2 Mo (remplacé par un vrai budget par morceau).

---

## 9. Sécurité et données personnelles

### 9.1 Données financières en stockage local

`localStorage` est lisible par tout script de l'origine et par quiconque a accès à la machine. Le contenu est du **régalien personnel** : SIRET, IBAN, noms de clients, historique complet de revenus. Au sens du RGPD, l'utilisateur est **responsable de traitement** des données de ses clients — pas seulement sujet de ses propres données. 38 accès directs à `localStorage` aujourd'hui, sans chiffrement `[V]`.

- **Garder le local-first** : c'est un avantage de confidentialité réel et un argument produit (« vos comptes ne quittent pas votre machine »). Ne pas le sacrifier.
- **Une seule porte** : tout accès passe par le dépôt de persistance. 38 sites dispersés, c'est 38 endroits où un schéma peut diverger, ou une donnée fuiter dans un export.
- **Pièces jointes en IndexedDB** dès les justificatifs : `localStorage` ne stocke que des chaînes, avec un quota de l'ordre de 5–10 Mo — inutilisable pour dix ans de factures d'achat.

### 9.2 Coffre chiffré : recommandé, mais avec ses conditions

Proposition : **chiffrement optionnel**, clé dérivée d'une phrase de passe par une fonction résistante à la mémoire (Argon2id ; à défaut PBKDF2 à très haut nombre d'itérations si l'on reste strictement sur les primitives natives du navigateur), chiffrement authentifié par enregistrement via l'API de cryptographie du navigateur, clé en mémoire pour la durée de la session seulement.

Deux avertissements à écrire noir sur blanc dans le produit, sans quoi la fonction fait plus de mal que de bien :

1. Un coffre côté navigateur **ne protège pas** d'un appareil compromis ni d'une extension malveillante : il protège d'un accès opportuniste au disque, d'une sauvegarde de profil, et rend inexploitable un blob volé côté cloud. C'est déjà beaucoup, ce n'est pas tout.
2. **Une phrase de passe oubliée = données irrécupérables.** Le chiffrement transforme « j'ai vidé mon navigateur » d'un ennui en une perte définitive. Donc : jamais activé par défaut, jamais silencieusement, et **toujours couplé à une sauvegarde exportée obligatoire** au moment de l'activation.

### 9.3 Clé Supabase en clair

Ce n'est **pas** une vulnérabilité en soi : la clé anonyme est conçue pour être publique. La vraie question est ailleurs, et elle n'est **pas vérifiable depuis le dépôt** `[H — à contrôler dans la console Supabase]` : **les politiques RLS restreignent-elles effectivement chaque ligne de `user_data` à son propriétaire ?** Si non, la clé publique donne accès aux données de tous les utilisateurs, et c'est critique.

Actions : confirmer les politiques RLS ligne par ligne · **ne jamais** livrer une clé de service au client, et le vérifier en CI par forme de clé · déplacer l'URL et la clé anonyme vers des variables de build — non pour le secret, mais pour que recette et production ne partagent pas le même projet.

### 9.4 Synchro : le défaut le plus coûteux à long terme

`upsert` avec résolution par `user_id` = **dernier écrit gagne, en silence** `[R]`. Deux appareils synchronisés se détruisent mutuellement sans un mot, et c'est la seule catégorie de bug capable d'effacer une comptabilité entière.

Correctif minimal viable : une **version monotone** et un identifiant d'appareil dans le blob ; refus d'écriture si la version serveur est plus récente que celle lue ; file d'attente hors ligne ; **UI de conflit réelle**. Et note d'architecture : si le coffre chiffré arrive, chiffrer le blob **côté client** avant envoi — le fournisseur ne détient alors que de l'opaque, ce qui simplifie radicalement la posture RGPD (le sous-traitant n'a pas accès aux données).

### 9.5 RGPD, concrètement

| Exigence | État `[R]` | À faire |
|---|---|---|
| Portabilité (export) | Existe (JSON, FEC, livre) | Reprendre, **et tester** que l'export est complet (pièces jointes incluses) |
| Effacement | Existe (double confirmation) | Réimplémenter **et tester** : local + blob cloud + pièces jointes. Un effacement partiel non détecté est une non-conformité |
| **Nuance de rétention** | Absente | L'obligation comptable de conservation (10 ans) coexiste avec le droit à l'effacement. « Tout supprimer » doit **avertir** que des pièces légalement requises vont disparaître, et proposer l'export préalable. Le double `confirm` actuel ne traite pas ce point |
| Information / sous-traitants | Partielle (politique dépliable) | Nommer les sous-traitants réels et leur région : Supabase, fournisseur de stockage documentaire, agrégateur bancaire. Chaque intégration en ajoute un |
| Absence de télémétrie | Aucun traçage — **bon défaut** | Le conserver. Si mesure un jour : opt-in, sans cookie, sans identifiant persistant |
| Politique de sécurité de contenu | Inexistante (tout est inline par construction) `[V]` | Après compilation, une CSP stricte (ni inline, ni `eval`) devient possible et bon marché. Limite honnête : GitHub Pages ne permet pas d'en-têtes HTTP — une CSP en balise méta est plus faible mais réelle. Un hébergeur statique gratuit avec contrôle des en-têtes est ici un vrai gain, à budget identique `[H]` |

### 9.6 Agrégation bancaire DSP2 : ce que cela implique réellement

À dire clairement, parce que c'est régulièrement sous-estimé :

- **Le scraping est exclu.** Se connecter à l'interface web d'une banque, ou demander à l'utilisateur ses identifiants bancaires, est à la fois une violation des conditions de la banque et, depuis DSP2, **une activité réglementée exercée sans agrément**. Ce n'est pas un risque technique, c'est un risque juridique.
- **L'accès aux comptes suppose un agrément** de prestataire de services d'information sur les comptes (agrément DSP2 délivré par l'ACPR en France), avec consentement sous authentification forte et **renouvellement du consentement tous les 90 jours**, et des limites strictes de réutilisation des données.
- **La seule voie réaliste pour un développeur seul** est de passer par un agrégateur agréé (type Powens/ex-Budget Insight, Bridge, Tink, ou un fournisseur d'accès aux données de compte bancaire), ou par l'API propre de la banque de l'utilisateur — la persona étant client Qonto `[R]`, cette piste est plausible et plus simple.
- **Conséquence d'architecture à assumer maintenant** : un agrégateur exige un composant serveur pour détenir les secrets client et recevoir les notifications. **Le jour où l'agrégation arrive, la propriété « pas de backend » disparaît**, avec son coût d'hébergement, sa surface d'attaque et sa responsabilité de sous-traitance. Ce n'est pas une raison de renoncer, c'est une raison de le planifier tard et explicitement.
- **Conséquence économique** : les agrégateurs facturent généralement par compte connecté et par mois `[H]` — cela change le modèle économique du produit, pas seulement son architecture.
- **Donc** : conserver l'import OFX/CSV manuel comme **chemin permanent et de premier rang** — c'est aussi le chemin qui préserve la confidentialité, et le message actuel de l'application (« aucune donnée n'est envoyée sur Internet, le rapprochement se fait localement » `[R]`) est un argument produit qu'il serait dommage de perdre. Concevoir un **port bancaire unique** avec deux implémentations interchangeables : fichier, et agrégateur.

---

## 10. Améliorations classées impact / effort

Effort : **S** ≤ 2 jours · **M** ≤ 2 semaines · **L** > 2 semaines (pour une personne assistée par IA `[H]`).

| # | Amélioration | Impact | Effort | Priorité | Dépendances |
|---|---|---|---|---|---|
| 1 | Arbitrer les 4 ambiguïtés fiscales (taux URSSAF, `× 1.56`, sémantique `provisions()`, mécanisme de réserve) et les consigner dans un registre de décisions | **Critique** | S | **P0** | — (décision produit) |
| 2 | Réparer l'anti-pattern de tests faussement verts (échec sur exception, garde-fou de compte d'assertions, suppression des assertions sur le texte source) | Fort | S | **P0** | — |
| 3 | Socle technique : build, TypeScript strict, lint avec frontières, CI à garde-fous | Fort | M | **P0** | — (parallélisable avec 1, 2) |
| 4 | Extraire, typer et tester le noyau fiscal, **versionné par millésime**, avec jeux de référence par année | **Critique** | L | **P0** | 1, 3 |
| 5 | Harnais différentiel ancienne/nouvelle app sur FEC, livre des recettes, numérotation | **Critique** (légal) | M | **P0** | 4 |
| 6 | Migration `freel_v50_*` → nouveau schéma : rapport à blanc, instantané exporté, idempotence, invariant d'absence de perte | **Critique** | M | **P0** | 4 |
| 7 | Porter la couche de tokens (53 tokens, 4 palettes), **créer l'échelle d'espacement manquante**, corriger les 4 couleurs jamais rethémées | Fort | M | **P1** | 3 |
| 8 | Primitives d'UI avec accessibilité intégrée (sémantique de dialogue, sémantique d'onglets, piège de focus, région live, cible 44 px) | Fort | L | **P1** | 7 |
| 9 | Routage réel, une route par écran ; suppression de la détection par `document.title` | Fort | S | **P1** | 3 |
| 10 | Responsive mobile-first : couches `min-width`, container queries, **sortie totale de la mise en page hors du JS** | **Critique** (promesse produit) | M | **P1** | 7, 8 |
| 11 | Matrice Playwright + assertion zéro-débordement à 390 px + 48 captures de référence | Fort | M | **P1** | 10 |
| 12 | Retirer `user-scalable=no`, ajouter `viewport-fit=cover`, `dvh`, `prefers-reduced-motion`, agrandir les cibles tactiles | Fort (a11y) | S | **P1** | 8 |
| 13 | Sélecteur `todos` + système d'alerte à 2 niveaux (badges de nav + panneau « à traiter ») | Fort | M | **P1** | 4 |
| 14 | Écran **Pilote** câblé sur sélecteurs réels, zéro littéral numérique | **Critique** | M | **P1** | 4, 8, 13 |
| 15 | Supprimer Chart.js au profit de SVG/CSS ; différer jsPDF ; feuille d'impression pour facture et CRA ; supprimer les méta anti-cache | Fort (perf) | M | **P2** | 8 |
| 16 | Les 5 écrans restants (Argent, Achats, Activité, Outils, Config) | Fort | L | **P2** | 14 |
| 17 | Justificatifs : stockage IndexedDB, invariant « pas de TVA sans pièce », métadonnées de rétention | Fort (conformité) | M | **P2** | 6, 16 (Achats) |
| 18 | Synchro v2 : blob versionné, refus d'écrasement, UI de conflit | Fort (perte de données) | L | **P2** | 6 |
| 19 | Figer l'ancienne application en lecture seule sous un chemin dédié, puis supprimer le code mort | Moyen | S | **P2** | 14 |
| 20 | PWA réelle : fichier de manifeste + service worker + coquille hors ligne | Moyen | M | **P3** | 3, 15 |
| 21 | Coffre chiffré optionnel + parcours de sauvegarde obligatoire | Moyen | L | **P3** | 18 |
| 22 | Agrégation bancaire via agrégateur agréé (**et le composant serveur qu'elle impose**) | Moyen (confort) | L | **P3** | 17, 18 |
| 23 | Cycle d'échéance enrichi (à déclarer → déclarée → payée, date par étape) | Moyen | M | **P2** | 4, 16 (Argent) |

Lecture rapide : **P0 = on ne peut rien construire de fiable sans** ; **P1 = le premier écran livrable et sa promesse responsive** ; **P2 = la couverture fonctionnelle complète** ; **P3 = ce qui peut attendre sans que personne ne soit lésé.**

---

## 11. Plan de mise en œuvre

Principe : **chaque jalon livre quelque chose de démontrable**, y compris les jalons d'infrastructure. Un jalon dont la démonstration est « la CI est verte » est acceptable **à condition** que le vert signifie quelque chose (c'est tout l'objet du jalon 0). Durées `[H]`, une personne assistée par IA.

**Jalon 0 — « Vérité et filet » (1–2 semaines).**
Registre des décisions fiscales arbitrées (#1) · harnais de tests réparé (#2) · dépôt neuf avec build, types, lint à frontières, CI (#3).
*Démonstration* : un document qui fixe le taux URSSAF canonique et la sémantique de `provisions()`, et une CI qui **échoue pour la bonne raison** — la preuve tangible que le vert redevient informatif.

**Jalon 1 — « Noyau fiscal » (2–3 semaines).**
Couche domaine, barèmes 2025/2026 en données, jeux de référence par millésime (#4), harnais différentiel contre l'ancienne app (#5).
*Démonstration* : un rapport de test comparant, pour les mêmes entrées, les chiffres de la nouvelle base et ceux de l'application en production — FEC et livre des recettes inclus. C'est le véritable filet de sécurité de toute la réécriture ; rien ne devrait commencer avant.

**Jalon 2 — « Migration et coquille » (1–2 semaines).**
Dépôt de persistance, migration avec rapport à blanc et instantané (#6) · tokens, palettes, échelle d'espacement (#7) · rail/dock, barre supérieure, routage (#9) · matrice de tailles opérationnelle (#11).
*Démonstration* : l'application s'ouvre sur les **données réelles migrées** de l'utilisateur, écrans encore vides, à 390 px et 1440 px, dans les 4 palettes, sans débordement horizontal — assertion automatisée, pas capture d'écran de complaisance.

**Jalon 3 — « Pilote » (2–3 semaines).**
Primitives d'UI (#8) · sélecteur `todos` et alertes à 2 niveaux (#13) · écran Pilote complet (#14) · corrections tactiles et safe-area (#12).
*Démonstration* : la décision du jour — « combien je peux me verser, et qu'est-ce qui coince » — sur données réelles, **côte à côte avec l'ancien Cockpit**, chiffres identiques ou écarts expliqués par une décision du jalon 0. C'est ici que le projet devient crédible pour son propre utilisateur.

**Jalon 4 — « Argent et Achats » (3–4 semaines).**
Les deux écrans les plus denses en données (#16 partiel) · justificatifs et IndexedDB (#17) · cycle d'échéance enrichi (#23) · suppression de Chart.js et différé de jsPDF (#15).
*Démonstration* : un registre d'achats avec pièces jointes réelles et un rapprochement bancaire dont l'état est **explicite et corrigeable** — le trou de conformité identifié par l'audit d'écart, comblé.

**Jalon 5 — « Activité, Outils, Config » (3–4 semaines).**
Les trois écrans restants (#16) · exports légaux revérifiés par le harnais différentiel · redistribution finale (simulateurs hors de Config, absorption de l'ancien écran Compte).
*Démonstration* : les 6 écrans, les 4 palettes, la matrice complète, et un export FEC identique à celui de l'ancienne application.

**Jalon 6 — « Bascule » (≈ 1 semaine).**
Nouvelle application à la racine, ancienne figée **en lecture seule** sous un chemin dédié (#19), migration unidirectionnelle, sauvegarde communiquée à l'utilisateur.
*Démonstration* : un utilisateur existant ouvre l'URL habituelle, retrouve ses données, et dispose d'un export d'instantané antérieur à la migration.

**Jalon 7+ — « Durcissement » (au fil de l'eau).**
PWA réelle (#20) · synchro versionnée avec UI de conflit (#18) · coffre chiffré (#21) · agrégation bancaire agréée (#22, avec le composant serveur qu'elle impose).

### Parallélisable / séquentiel

**Parallélisable — le principal levier de compression du calendrier :**
- **Deux fils indépendants dès le jalon 1** : (a) domaine + tests fiscaux, (b) tokens + primitives d'UI + matrice visuelle. Ils ne touchent pas les mêmes fichiers, n'ont pas la même nature de vérification, et se prêtent bien à deux sessions d'assistance IA distinctes. C'est le gain d'ordonnancement le plus important disponible pour un développeur seul.
- L'écriture des migrations (#6) est parallélisable au domaine dès que les **types** sont figés — les types précèdent les formules.
- La matrice responsive (#11) se construit contre la coquille vide et gagne en valeur à chaque écran ajouté.
- Le durcissement du jalon 7 est parallélisable aux jalons 4–5, à ne lancer que si les écrans ne sont pas en retard.

**Séquentiel, non négociable :**
- **#1 avant #4** : coder une formule avant d'avoir arbitré son taux, c'est fabriquer la contradiction suivante.
- **#4 avant tout écran** : un écran câblé sur un domaine non testé transforme une erreur de calcul en erreur d'affichage introuvable.
- **#5 avant la bascule** : sans harnais différentiel, la perte d'un export légal ne se découvre qu'au contrôle fiscal.
- **#6 avant tout écran en écriture** : un écran qui écrit dans un schéma non migré crée deux vérités.
- **#7 avant #8** : des primitives construites sur des tokens provisoires seront à refaire.

### Deux pièges de calendrier à surveiller

1. **L'effet « second système ».** Le rapport d'écart identifie déjà des fonctions absentes des deux côtés (devis, justificatifs) et des enrichissements souhaitables. **Interdire toute fonction nouvelle avant le jalon 6**, à la seule exception des justificatifs — qui sont un invariant de conformité de la cible, pas un ajout de confort. Chaque exception accordée repousse la bascule, et une réécriture qui ne bascule jamais est un échec, quelle que soit la qualité du code produit.
2. **La double maintenance.** Entre les jalons 2 et 6, toute correction en production doit être portée deux fois. Donc : **geler l'ancienne application dès le jalon 2**, sauf correctif de sécurité ou de calcul erroné. Un gel non décidé explicitement devient une double maintenance de fait, et c'est le mode d'échec le plus fréquent des coexistences.

---

## Annexe — Mesures effectuées pendant cette revue

Toutes reproductibles sur `/home/user/FREEL` à HEAD, ou sur le bundle de design.

| Mesure | Valeur |
|---|---|
| `index.html` — taille | 1 862 539 octets |
| `index.html` — compressé (gzip) | 478 688 octets |
| jsPDF embarqué (l. 18–392) | 419 290 octets |
| Chart.js embarqué (l. 393–408) | 208 566 octets |
| CSS (l. 439–1834) | 87 643 octets |
| JS applicatif (l. 1937–24049) | 1 127 184 octets |
| Appels `el(` | 2 796 |
| Objets `style: {` dans le JS | 1 825 |
| Attributs `style="` dans des chaînes | 114 |
| `var(--token)` dans la zone JS | 1 454 |
| Valeurs hexadécimales en dur dans la zone JS | 250 (38 distinctes) |
| Sites `innerHTML` | 48 |
| Appels `localStorage.` | 38 |
| Appels `compute()` | 70 |
| Branches `window.innerWidth` | 6 |
| `backdrop-filter` | 3 |
| Écouteurs `resize` | 1 |
| `@container` · `prefers-reduced-motion` · `100dvh`/`svh` · `serviceWorker` | 0 · 0 · 0 · 0 |
| Variantes `data-theme` | 1 (`light`) — la cible en exige 4 |
| Manifeste PWA | Présent, en URI `data:` avec icônes base64 (`index.html:14`) ; aucun service worker |
| Viewport | `maximum-scale=1.0, user-scalable=no`, sans `viewport-fit=cover` |
| Méta de cache | `no-cache, no-store, must-revalidate` + `Pragma` + `Expires: 0` |
| Prototypes — `react@18.3.1` UMD dev | 109 931 octets |
| Prototypes — `react-dom@18.3.1` UMD dev | 1 080 227 octets |
| Prototypes — `@babel/standalone@7.29.0` | 3 137 752 octets |
| **Prototypes — total JS avant application** | **4 327 910 octets (4,13 Mo)** |
| Prototypes utilisant React + Babel | 5 fichiers HTML sur 6 écrans |

*Fin du rapport.*
