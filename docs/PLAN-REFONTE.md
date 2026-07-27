# Plan de refonte Freel V1.11 — vision du résultat et plan d'action

**Date** : 27 juillet 2026 · **Révision 2** — corrigée après revue par les deux experts.
Prérequis : [`AUDIT-REDESIGN-V1.11.md`](./AUDIT-REDESIGN-V1.11.md) · Revues : [`08-revue-plan-comptable.md`](./audit/08-revue-plan-comptable.md) · [`09-revue-plan-technique.md`](./audit/09-revue-plan-technique.md)

> **Ce que la révision 2 corrige.** La révision 1 annonçait 13–14 semaines et un gain de recyclage de 2–3 semaines : les deux étaient faux. Elle promettait aussi « +620 € de versable » sur la correction D3, alors que D3 était incomplète. Les chiffres ci-dessous sont ceux des revues, vérifiés dans le code.

---

## 1. Décisions arbitrées

| # | Décision | Conséquence technique |
|---|---|---|
| **D1** | **Un barème daté, centralisé, appliqué par période.** Une seule source ; toute modification se propage partout. | Taux, **seuils** et **ACRE** deviennent des données versionnées. Le calcul reçoit la période et résout le barème applicable. Structure **par intervalle de dates**, pas par année : un taux a déjà changé en cours d'année (juillet 2024). |
| **D2** | **Le facteur `× 1,56` est supprimé.** | Le régime devient un **discriminant** : versement libératoire ⇒ ligne 2,2 % intégrée au prélèvement URSSAF unique, **aucun** acompte PAS. Barème ⇒ **l'acompte PAS est un fait saisi**, pas un calcul : c'est un montant notifié par la DGFiP. Inclut la CFP, oubliée en révision 1. |
| **D3** | **`provisions()` = ce qu'il reste à payer** (TVA, URSSAF, CFE, impôt), en **deux volets**. | **Volet 1** : échéances émises non encore payées — les payées sont exclues. **Volet 2** *(ajouté par la revue)* : charges à provisionner sur les **recettes déjà encaissées mais pas encore déclarées**. La dette sociale naît à l'encaissement, pas à l'émission de l'échéance. Exige un fait **« période déclarée »** qui n'existe nulle part aujourd'hui. |
| **D4** | **La réserve suit le nouveau design** : montant absolu, curseur Pilote. | Une seule source, un seul writer. Le curseur % d'Argent > Performance et le pourcentage de Config sont **supprimés**. |
| **D5** | **La section « Propositions Claude Code » est retirée.** | Brief de conception, pas une fonctionnalité. |
| **D6** | **L'export FEC est retiré du périmètre.** | Pas une obligation en micro-BNC. L'effort va au **« dossier de contrôle »** : registre des recettes **+ pièces jointes**, pas un PDF de tableau — c'est à cette condition que D6 est défendable. Le code FEC reste sur `backup/v1-monolithe-pre-refonte`. |

**Aucun gain de versable n'est promis.** Le volet 2 de D3 joue en sens inverse du volet 1 et pèse plus lourd en fin de trimestre.

### Bloquant avant la première ligne de calcul

Le taux de cotisations micro-BNC 2026 a **cinq** candidats, pas quatre : le monolithe en porte un cinquième, `0,256` (`index.html:2637`), avec des plafonds étiquetés « projet LFI 2026 » mais présentés comme « vérifiés ». L'expert propose **26,1 %**, confiance moyenne-haute. **À confirmer sur `urssaf.fr`.**

### Deux bugs qui invalident D1 aujourd'hui

Trouvés pendant la revue, à ne pas importer :

- `getLegal()` **retombe silencieusement sur 2026** quand l'année demandée est absente. Un calcul sur 2024 utilise donc le barème 2026 — D1 est déjà fausse dans l'existant.
- `LEGAL` est un IIFE qui lit `COMPANY` (`index.html:2710`) **avant sa déclaration** (`:2801`) : le régime est **toujours BNC**, quel que soit le type d'activité.

---

## 2. Vision du résultat

Une application **React + TypeScript** compilée, servie en statique, rendant les **6 écrans du design V1.11** en haute fidélité : Pilote · Activité & congés · Argent · Achats · Outils · Config. Quatre palettes. Rail 212 px sur PC, dock flottant en pilule sur mobile.

**Le changement de fond n'est pas visuel.** Aujourd'hui chaque écran détient ses propres nombres — c'est pourquoi l'app affiche « Barèmes 2026 à jour » en calculant avec ceux de 2025. Après refonte, **aucun écran ne contient de nombre** : tous lisent un noyau unique, testé, versionné. Un taux corrigé se propage partout.

### Les deux versions coexistent

| Emplacement | Contenu |
|---|---|
| `backup/v1-monolithe-pre-refonte` | Sauvegarde intégrale, déjà poussée, intouchée |
| `main` racine | La nouvelle version |
| `main`, `/legacy/` | L'ancienne app, **neutralisée en écriture**, consultable |

### Ce que vous ne verrez pas tout de suite

Devis, acomptes, relances : de vraies fonctions nouvelles, absentes de l'existant **et** du design. Après bascule.

---

## 3. Recyclage — le mirage corrigé

**La révision 1 se trompait.** Le test « 0 référence DOM sur 60 lignes » mesurait la mauvaise chose : il ignorait les variables globales, le couplage transitif, et la longueur réelle des fonctions. Vérification faite dans le code :

| Fonction annoncée portable | Réalité vérifiée |
|---|---|
| `tauxOccupation:6510` | **N'est pas une fonction** — une affectation dans `compute()`. Aucune occurrence de `function tauxOccupation` |
| `getNextInvoiceNumber:3172` | **Appelle `saveAll()`** — elle écrit sur disque. 0 DOM, mais pas pure |
| `reconcileTransactions` | **84 lignes** (fenêtre de test trop courte), lit 4 globales, dépend de 9 fonctions dont une de formatage `fr-FR`. Seul `scoreCandidate` (6 lignes) est portable |
| `computeAlerts` | **88 lignes**, produit des chaînes avec emoji, et lit `PERIOD.year` — un **filtre d'UI qui pilote un seuil légal** |
| `calculateIR` | **Mute `IR_CONFIG`** via `getIRConfig` |

**Transférable littéralement : ~330 lignes sur 22 100, soit 1,5 %.**
**Gain réel : 4 à 7 jours, pas 2–3 semaines.** Et il porte sur la **connaissance extraite** — les formules, les catégories, la structure des barèmes — pas sur du code à copier. Un portage naïf importerait 5 bugs, dont les deux ci-dessus.

Ce qui reste vraiment réutilisable, ce sont les **données** : `LEGAL_BY_YEAR`, `CHARGE_TYPES`, `CHARGE_CATEGORIES` (14 catégories) — à condition de les re-vérifier, pas de les recopier.

**La couche de rendu n'est pas recyclable** : 1 825 objets `style:{}`, 2 796 appels `el()`.

### Travail obligatoire non budgété en révision 1

**9 appels `new Chart(`** à réécrire en SVG et **27 sites jsPDF**, dont l'export CRA. Ce n'est pas de l'optimisation, c'est du périmètre.

---

## 4. Plan d'action

| Jalon | Contenu | Démonstration | Durée |
|---|---|---|---|
| **J0 — Vérité et filet** | Registre D1–D6 · taux 2026 confirmé à la source · **retrait des 4 affirmations fausses du legacy** · **mémo de calcul manuel** pour les déclarations du chantier · **les 2 seuils de TVA** (remontés de J4) · réparation du faux vert · **harnais différentiel + exécuteur du monolithe** (remontés de J1) · build, TS strict, lint, CI | Une CI qui **échoue pour la bonne raison**, et une app actuelle qui n'affirme plus rien de faux | 2 sem |
| **J1 — Noyau fiscal** | Domaine pur · barèmes par intervalle de dates, ACRE incluse (D1) · D2 et **les deux volets de D3** · fait « période déclarée » · extraction des ~330 lignes utiles | Rapport comparant, à entrées égales, chiffres actuels et nouveaux — chaque écart soit **régression**, soit **correction décidée** | 3 sem |
| **J2 — Coquille lisible + migration** | **Coquille en lecture seule sur l'ancien schéma** *(optimisation retenue)* · migration idempotente avec instantané exporté · migration du **blob cloud** · tokens et 4 palettes · rail et dock · routage | Un écran réel avec **vos vrais chiffres en semaine 2**, à 390 px et 1440 px, sans débordement — assertion automatisée | 2–3 sem |
| **J3 — Pilote + Outils** | Primitives d'UI accessibles · `allTodos()` · Pilote, zéro nombre en dur · réserve unifiée (D4) · **Outils remonté** : l'écran le moins cher prouve le noyau tôt · **comparateur VL avant le 30/09** | « Combien je peux me verser » sur données réelles, côte à côte avec l'ancien Cockpit | 3 sem |
| **J4 — Argent** | L'écran le plus dense · cycle d'échéance enrichi · **9 graphes Chart.js → SVG** · jsPDF différé | Trésorerie et performance sur le noyau testé | 3 sem |
| **J5 — Achats + Activité + Config** | Justificatifs sur IndexedDB, invariant « pas de TVA sans pièce » · rapprochement explicite · **autoliquidation TVA et CA3** · livre des recettes conforme et dossier de contrôle (D6) · D5 | Les 6 écrans, les 4 palettes, la matrice complète | 4–5 sem |
| **J6 — Bascule** | Nouvelle version à la racine · legacy **neutralisée en écriture** sous `/legacy/` · **après le 31/10** | Vous ouvrez l'URL habituelle, vous retrouvez vos données | 1–2 sem |

**Total réaliste : 18–20 semaines**, non 13–14. Le parallélisme « fil domaine / fil UI » **n'est pas un levier de compression pour une personne seule** : il supprime des attentes, il n'ajoute pas de capacité. La révision 1 comptait les tokens deux fois.

### Calendrier vs obligations réelles

| Échéance | Date | Traitement |
|---|---|---|
| Déclaration trimestrielle | 31/07 | Mémo de calcul manuel, J0 |
| **Réception des factures électroniques** | **01/09/2026** | Avertissement daté dans le legacy, **hors séquence, tout de suite** |
| **Franchissement projeté du seuil majoré de TVA** | ~début/mi-sept. | Les 2 seuils remontés en J0. Il manque ~8 850 € d'encaissements, soit un mois de facturation |
| Option au versement libératoire | 30/09 | Comparateur en J3, avant la date |
| Déclaration trimestrielle | 31/10 | Mémo J0 ; bascule J6 décalée après |

### Non négociable

D1 avant tout calcul · J1 avant tout écran · migration avant tout écran en écriture · tokens avant primitives.

---

## 5. Coexistence — le vrai risque n'est pas celui annoncé

Le danger n'est pas `localStorage` : c'est **la synchro Supabase du legacy**. Elle fait un upsert « dernier écrit gagne » et lit ses identifiants dans la même origine — un legacy « en lecture seule » qui garde sa synchro **écrase le nuage**.

Neutralisation, en quatre points :

1. Un **script préfixé** remplaçant `window.localStorage` par un mandataire en mémoire — aucun des 38 sites d'écriture ne peut plus écrire, y compris ceux qu'on oublierait.
2. **Synchro coupée** dans le legacy.
3. Nouvelle version sur une **autre table** (ou colonne) Supabase, et **espace de noms de clés disjoint** — surtout pas `freel_app_version`, qui déclenche un `location.reload()`.
4. Un **test Playwright prouvant zéro écriture et zéro requête** depuis `/legacy/`.

**Manque de sécurité à traiter en J0** : les règles RLS Supabase sont absentes. Une heure de travail, impact critique.

---

## 6. Responsive — vérifiable, pas déclaratif

`adaptMobileGrids()` : **élargir la fenêtre au-delà de 600 px ne restaure jamais les grilles.** Conséquence de la mise en page recalculée en JS.

Donc : **mise en page entièrement hors du JS**, CSS mobile-first. Plus `viewport-fit=cover` (safe-area iOS sous le dock), `dvh` (clavier virtuel), retrait de `user-scalable=no`, cibles tactiles à 44 px — le `.info` du design est à 18 px.

Garantie : matrice Playwright avec **assertion de zéro débordement horizontal à 390 px** sur les 6 écrans, en CI. Plus un **audit de contraste sur les 4 palettes** — 4 couleurs du design ne sont jamais rethémées.
