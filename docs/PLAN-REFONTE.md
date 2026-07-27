# Plan de refonte Freel V1.11 — vision du résultat et plan d'action

**Date** : 27 juillet 2026 · **Statut** : à valider avant toute ligne de code.
Prérequis : [`AUDIT-REDESIGN-V1.11.md`](./AUDIT-REDESIGN-V1.11.md).

---

## 1. Décisions arbitrées

Les six points bloquants de l'audit sont tranchés. Ce registre est la référence : toute formule du code doit pouvoir se justifier par une ligne ci-dessous.

| # | Décision | Conséquence technique |
|---|---|---|
| **D1** | **Un barème daté, centralisé, appliqué par période.** Une seule source de vérité ; toute modification se propage partout. | Les taux deviennent des **données versionnées par millésime**, jamais des constantes. Le calcul reçoit la période et résout le barème applicable. Rouvrir un trimestre 2024 en 2026 utilise le barème 2024. Les 4 valeurs concurrentes du taux URSSAF disparaissent : une seule est servie. |
| **D2** | **Le facteur `× 1,56` est supprimé** (sans fondement identifié). | `cotisIR()` est réécrit sur le régime réel. Le régime d'imposition devient un **discriminant** : versement libératoire ⇒ ligne 2,2 % et **aucun** acompte PAS ; barème ⇒ acomptes PAS et **aucune** ligne VL. Supprime le cumul actuel des deux. |
| **D3** | **`provisions()` = ce qu'il reste à payer** (TVA, URSSAF, CFE, impôt). | `provisions() = sortiesAVenir()` — les échéances déjà payées sont **exclues** : elles ont quitté le compte, elles ne sont plus dues. Corrige le double décompte sur `dispo()`. Effet : +620 € de versable, autonomie 5,3 → 6,6 mois. |
| **D4** | **La réserve suit le nouveau design** : montant absolu, réglé au curseur sur Pilote. | Une seule source dans le store, un seul writer. Le curseur % d'Argent > Performance et le pourcentage de Config sont **supprimés**, pas convertis. |
| **D5** | **La section « Propositions Claude Code » est retirée.** | Brief de conception, pas une fonctionnalité. |
| **D6** | **L'export FEC est retiré du périmètre.** | Le FEC n'est pas une obligation en micro-BNC. L'effort va à l'**export du livre des recettes**, qui est la seule obligation comptable du régime. Le code reste disponible sur `backup/v1-monolithe-pre-refonte` si le besoin réapparaît. |

**Une vérification reste ouverte, et elle est bloquante pour D1** : le taux de cotisations sociales micro-BNC 2026. L'expert propose **26,1 %** (trajectoire 21,1 → 23,1 → 24,6 → 26,1) avec une confiance moyenne-haute. À confirmer sur `urssaf.fr` avant la première implémentation du calcul. Aucune des quatre valeurs présentes dans le bundle de design n'est correcte.

---

## 2. Vision du résultat

### Ce que vous aurez

Une application **React + TypeScript** compilée, servie en statique, qui rend les **6 écrans du design V1.11** en haute fidélité : Pilote · Activité & congés · Argent · Achats · Outils · Config. Quatre palettes commutables. Rail latéral 212 px sur PC, dock flottant en pilule sur mobile.

**Le changement de fond n'est pas visuel.** Aujourd'hui chaque écran détient ses propres nombres, et c'est pourquoi l'app peut afficher « Barèmes 2026 à jour » en calculant avec ceux de 2025. Après refonte, **aucun écran ne contient de nombre** : tous lisent un noyau de calcul unique, testé, versionné par millésime. Un taux corrigé se propage partout, immédiatement — c'est exactement D1.

### Les deux versions coexistent

| Emplacement | Contenu |
|---|---|
| **`backup/v1-monolithe-pre-refonte`** | Sauvegarde intégrale de l'app actuelle. Déjà poussée. Intouchée. |
| **`main`** | La nouvelle version, à la racine. |
| **`main`, chemin `/legacy/`** | L'ancienne app, figée **en lecture seule**, accessible en parallèle. |

Le chemin `/legacy/` est ce qui vous permet d'avoir réellement « les deux » en service : la branche de sauvegarde protège le code, `/legacy/` garde l'app utilisable pendant que vous prenez confiance dans la nouvelle. Une seule règle : **une seule des deux écrit les données**, sinon deux vérités coexistent.

### Ce que vous ne verrez pas tout de suite

Devis, acomptes, relances d'impayés : de vraies fonctions nouvelles, absentes de l'existant **et** du design. Après bascule. Les ajouter avant, c'est ne jamais basculer.

---

## 3. Recyclage — mesuré, pas estimé

Vérification faite sur les fonctions candidates : **9 sur 10 ne contiennent aucune référence au DOM** dans leur corps.

| Fonction | Ligne | Réf. DOM | Sort |
|---|---|---|---|
| `calculateIR` (IR par tranches) | 4134 | 0 | **Portée** au domaine |
| `computeCFEEstimate` | 8928 | 0 | **Portée** |
| `parseOFX` | 10265 | 0 | **Portée** |
| `parseCSV` | 10287 | 0 | **Portée** |
| `reconcileTransactions` | 10381 | 0 | **Portée** |
| `getNextInvoiceNumber` + famille numérotation | 3168 | 0 | **Portée** (continuité légalement contrainte) |
| `computeAlerts` | 6129 | 0 | **Portée**, devient la base de `allTodos()` |
| `tauxOccupation` | 6510 | 0 | **Portée** |
| `exportFEC` | 3643 | 0 | Abandonné (D6) |
| `exportLivreRecettes` | 3603 | 3 | **Portée après découplage** — la logique est bonne, la sortie est mêlée à l'UI |

S'y ajoutent des **données** directement réutilisables : `LEGAL_BY_YEAR` (contient déjà 2025 et 2026 — le squelette de D1 existe), `CHARGE_TYPES`, `CHARGE_CATEGORIES` (14 catégories, proches des 10 de la cible).

**Ce qui n'est pas recyclable** : la couche de rendu. 1 825 objets `style:{}` et 2 796 appels `el()`. Appliquer les 53 tokens exigerait de rouvrir ~1 900 sites de style — plus cher que réécrire, pour un résultat qui n'est pas la cible.

**Le partage est donc net : on recycle le calcul, on jette le rendu.** Gain estimé à 2–3 semaines sur le noyau fiscal, la partie la plus délicate à écrire et à vérifier. Chaque fonction portée arrive avec ses tests, et son résultat est comparé à celui de l'app actuelle avant d'être accepté.

---

## 4. Plan d'action

Chaque jalon livre quelque chose de démontrable. Durées pour une personne assistée par IA.

| Jalon | Contenu | Démonstration | Durée |
|---|---|---|---|
| **J0 — Vérité et filet** | Registre D1–D6 figé · taux 2026 confirmé à la source · réparation du harnais de tests (il retourne vert quoi qu'il arrive) · build, TypeScript strict, lint, CI | Une CI qui **échoue pour la bonne raison** | 1 sem |
| **J1 — Noyau fiscal** | Domaine pur sans DOM · barèmes 2025/2026 en données versionnées (D1) · portage des 9 fonctions recyclées · D2 et D3 appliqués · harnais différentiel contre l'app actuelle | Un rapport comparant, à entrées égales, les chiffres actuels et les nouveaux — chaque écart soit une **régression**, soit une **correction décidée** en J0 | 2 sem |
| **J2 — Migration et coquille** | Migration `freel_v50_*` → nouveau schéma, avec instantané exporté avant écriture · 53 tokens et 4 palettes · rail et dock · routage réel | L'app s'ouvre sur **vos données réelles migrées**, écrans vides, à 390 px et 1440 px, dans les 4 palettes, sans débordement horizontal — assertion automatisée | 1–2 sem |
| **J3 — Pilote** | Primitives d'UI accessibles · `allTodos()` réel sur `computeAlerts` · écran Pilote, zéro nombre en dur · réserve unifiée (D4) | « Combien je peux me verser, et qu'est-ce qui coince » sur données réelles, **côte à côte avec l'ancien Cockpit** | 2 sem |
| **J4 — Argent et Achats** | Les deux écrans les plus denses · justificatifs sur IndexedDB avec l'invariant « pas de TVA sans pièce » · état de rapprochement explicite · deux seuils de TVA | Un registre d'achats avec pièces réelles et un rapprochement **corrigeable** | 3 sem |
| **J5 — Activité, Outils, Config** | Les trois écrans restants · livre des recettes conforme (`paidAt`, `modeReglement`, journal en ajout seul) · D5 appliqué | Les 6 écrans, les 4 palettes, la matrice de tailles complète | 3 sem |
| **J6 — Bascule** | Nouvelle version à la racine de `main` · ancienne figée en lecture seule sous `/legacy/` · sauvegarde communiquée | Vous ouvrez l'URL habituelle, vous retrouvez vos données, et l'ancienne app reste consultable | 1 sem |

**Total : 13–14 semaines**, dont 3 avant le premier écran visible. C'est l'ordre qui coûte le moins cher : un écran câblé sur un calcul non testé transforme une erreur de calcul en bug d'affichage introuvable.

### Hors séquence, à traiter tout de suite

**Facturation électronique : réception obligatoire au 1er septembre 2026** — dans cinq semaines. Un avertissement daté dans l'app actuelle, effort faible. C'est la seule échéance qui ne dépend pas de ce calendrier.

### Non négociable

- **D1 avant tout calcul** — coder une formule avant d'avoir arbitré son taux fabrique la contradiction suivante.
- **J1 avant tout écran** — le domaine avant l'affichage.
- **Migration avant tout écran en écriture** — sinon deux vérités.
- **Tokens avant primitives** — des primitives sur tokens provisoires seront à refaire.

### Parallélisable

Deux fils indépendants dès J1 : **(a)** domaine et tests fiscaux, **(b)** tokens, primitives d'UI, matrice visuelle. Fichiers disjoints, natures de vérification différentes. C'est le principal levier de compression du calendrier.

### Le piège à surveiller

Toute fonction nouvelle acceptée avant J6 repousse la bascule. Seule exception : les justificatifs, qui sont un invariant de conformité du design, pas un confort. Une réécriture qui ne bascule jamais est un échec, quelle que soit la qualité du code.

---

## 5. Responsive — vérifiable, pas déclaratif

Un bug mesuré dans l'existant résume le travail : `adaptMobileGrids()` — **élargir la fenêtre au-delà de 600 px ne restaure jamais les grilles.** Conséquence directe de la mise en page recalculée en JS via `window.innerWidth`.

Donc : **mise en page entièrement hors du JS**, en CSS mobile-first. Plus les points d'exécution mobile habituellement oubliés : `viewport-fit=cover` pour la safe-area iOS sous le dock flottant, `dvh` pour le clavier virtuel, retrait de `user-scalable=no`, cibles tactiles à 44 px (le `.info` du design est à 18 px).

Garantie automatisée : matrice Playwright avec **assertion de zéro débordement horizontal à 390 px** sur les 6 écrans, exécutée en CI. Pas une capture d'écran de complaisance.
