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

### Barème des cotisations — tranché

Taux global de cotisations sociales, micro-BNC libéral non réglementé :

| Du | Au | Taux |
|---|---|---|
| 2024-01-01 | 2024-06-30 | **21,10 %** |
| 2024-07-01 | 2024-12-31 | **23,10 %** |
| 2025-01-01 | 2025-12-31 | **24,60 %** |
| 2026-01-01 | 2026-06-30 | **25,60 %** |
| 2026-07-01 | — | **26,10 %** |

**Ceci résout l'apparente contradiction des sources** : 25,60 % et 26,10 % ne sont pas deux valeurs concurrentes pour 2026, ce sont deux semestres. Les quatre valeurs du bundle de design (21,2 / 24,6 / 11,6 / 10,6 %) et la cinquième du monolithe (`0,256`, `index.html:2637`) sont chacune un instantané figé d'une période — voilà pourquoi elles divergent toutes. Le problème n'était pas une erreur de valeur, c'était l'absence de dimension temporelle. C'est l'argument central de D1.

Deux conséquences directes pour l'implémentation :

1. **La bascule tombe au 1er juillet.** Aucune période déclarative mensuelle ou trimestrielle ne chevauche donc un changement de taux — les frontières s'alignent. Simplification réelle.
2. **Mais tout agrégat annuel chevauche.** Le provisionnement doit appliquer le taux à la **date d'encaissement de chaque recette**, jamais un taux unique à l'année. Un `CA_2026 × taux` est faux par construction. Ceci se combine au volet 2 de D3 : la dette naît à l'encaissement, et le taux se lit à cette même date.

*Source : valeurs fournies par le propriétaire. `urssaf.fr` renvoie 503 sur ses 4 pages de barème. À recouper une fois avec un avis d'appel de cotisations réel — une erreur de taux coûte plusieurs milliers d'euros par an, c'est le seul chiffre du projet qui mérite une double vérification.*

**Reste à cadrer** : l'ACRE. Un changement au 1er juillet 2026 est probable (abattement passant de 50 % à 25 % des cotisations) mais non confirmé. L'ACRE du propriétaire est éteinte depuis le T1 2026 — sans effet sur les calculs courants, mais nécessaire pour recalculer un trimestre passé.

### D1 en détail — le mécanisme d'évolution des taux officiels

**Contrainte de départ : il n'existe aucune API officielle** pour les taux URSSAF, seuils de TVA, tranches d'IR ou grilles de CFE. `urssaf.fr` est du HTML dont la structure change, et qui répond 503 de façon aléatoire. Automatiser la récupération produirait une dépendance fragile qui casserait sans avertir — c'est-à-dire exactement le défaut qu'on cherche à supprimer.

**Le mécanisme retenu : le barème est une donnée éditable, pas du code.**

#### 1. Toute valeur officielle est une entrée datée

Aucune constante numérique nulle part. Chaque valeur porte :

| Champ | Rôle |
|---|---|
| `valeur` | Le nombre |
| `du` / `au` | Sa période de validité (`au` vide = toujours en vigueur) |
| `source` | L'URL ou le document d'où elle vient |
| `verifieLe` | La date à laquelle un humain l'a confirmée |

Les valeurs concernées : taux de cotisations, CFP, versement libératoire, abattement forfaitaire, plafonds micro, seuils de TVA (franchise et majoré), tranches d'IR, grille de base minimum CFE, taux et durée de l'ACRE.

#### 2. Le calcul résout le taux à la date, jamais à l'année

La fonction de calcul reçoit une **date** et demande au barème la valeur en vigueur ce jour-là. C'est ce qui rend impossible le bug actuel de `getLegal()`, qui retombe silencieusement sur 2026.

#### 3. Les anciennes valeurs ne sont jamais supprimées

Ajouter une période ne modifie pas les précédentes. Recalculer un trimestre 2024 en 2029 doit redonner le montant déclaré à l'époque. **Écraser un taux réécrirait l'historique fiscal** — c'est le mode de défaillance à interdire par construction.

#### 4. Un écran d'édition du barème, dans Config

Quand un taux change, vous ajoutez une période depuis l'app : valeur, date de début, source, date de vérification. Aucune mise à jour de l'application n'est nécessaire, aucun développeur non plus. C'est ce point qui rend le mécanisme durable : **le barème cesse d'être une dépendance envers celui qui a écrit le code.**

#### 5. Un rappel de fraîcheur, honnête

Un indicateur qui affiche l'état **réel** : millésime chargé, date de dernière vérification, et une alerte quand une période arrive à échéance ou qu'une valeur n'a pas été revue depuis plus de six mois. À l'opposé du bandeau actuel, qui affirme « Barèmes 2026 à jour · vérifiés le 11 juil. 2026 » alors que le système calcule avec ceux de 2025. **Une fausse assurance de conformité est plus dangereuse qu'une absence d'information.**

#### 6. Alerte d'échéance de barème, et blocage en sécurité fermée

Deux niveaux, distincts :

**Alerte** — dès qu'une période de validité arrive à son terme (`au` approchant) ou qu'une valeur en vigueur n'a pas été revérifiée depuis plus de six mois, un sujet apparaît dans « À traiter » : *« Nouveau taux à saisir — cotisations, à compter du 01/07/2026 »*, avec un lien direct vers l'écran d'édition du barème.

**Blocage — mais seulement là où un chiffre engage.** Le critère n'est pas « le barème est incomplet », c'est **« ce chiffre engage-t-il l'utilisateur ? »**. Deux régimes distincts :

| Nature du chiffre | Barème absent pour la période | Comportement |
|---|---|---|
| **Engageant** — déclaration URSSAF, montant à payer, échéance à honorer, export du livre des recettes ou dossier de contrôle, tout montant repris dans un formulaire officiel | **Bloqué.** Pas de repli, pas d'extrapolation, pas de valeur par défaut | « Barème manquant pour cette période » + l'action pour le saisir |
| **Prévisionnel** — projection de trésorerie, autonomie en mois, simulation, « combien je pourrai me verser », graphes d'évolution future | **Autorisé** | Calculé sur le **dernier taux connu**, affiché comme **hypothèse explicite** : mention visible du taux retenu et de sa date d'origine |
| **Saisie de faits** — recettes, dépenses, missions, congés | **Autorisé** | Aucune dépendance à un taux |
| **Consultation d'une période couverte** | — | **Autorisé** |
| **Export de sauvegarde** | — | **Toujours autorisé**, sans condition |

La distinction est celle du risque réel : se tromper d'un point de cotisation dans une **projection à six mois** n'a aucune conséquence, et bloquer l'écran priverait l'utilisateur de son outil de pilotage. Se tromper dans une **déclaration** coûte un redressement.

Deux règles pour que le prévisionnel reste honnête :

- L'hypothèse est **toujours visible**, jamais implicite. « Projection au taux de 26,10 % en vigueur depuis le 01/07/2026 » — l'utilisateur doit savoir sur quoi il regarde.
- Une prévision **ne devient jamais** un montant engageant par simple passage du temps. Quand la période arrive à échéance et que le barème n'a pas été mis à jour, l'alerte se déclenche et le chiffre bascule de « hypothèse » à « bloqué ».

Le principe reste la **sécurité fermée sur l'opposable** : sur un chiffre qui engage, l'app se tait plutôt que d'avancer une valeur. C'est l'inverse du comportement actuel, où `getLegal()` retombe silencieusement sur 2026 et où le bandeau affirme une conformité que rien ne vérifie. **Un montant absent se voit ; un montant faux se déclare.**

#### 7. Des tests figés par période

Un jeu de référence par période : pour telles entrées à telle date, tel résultat attendu. Ajouter un taux futur ne peut alors pas casser silencieusement le calcul d'un trimestre passé — le test échoue au lieu de laisser passer.

**Ce que ça donne concrètement.** Le passage de 25,60 % à 26,10 % au 1er juillet 2026 — celui qui a fait diverger toutes mes sources — devient une ligne ajoutée dans un écran, avec sa source et sa date. Rien à recompiler, rien à re-tester à la main, et les trimestres antérieurs restent exacts.

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
