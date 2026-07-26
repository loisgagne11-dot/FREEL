# Audit de refonte — Freel V1.11

**Date** : 26 juillet 2026
**Objet** : recréer les 6 écrans du handoff design `design_handoff_freel_v1.11` dans une stack cible responsive PC + mobile, à partir de la base de code existante.
**Méthode** : orchestration de 6 agents spécialisés. Aucun code produit à ce stade.

Rapports détaillés dans [`docs/audit/`](./audit/) :

| # | Rapport | Périmètre |
|---|---|---|
| 01 | [`01-vision.md`](./audit/01-vision.md) | Vision, modèle de données, règles de calcul |
| 02 | [`02-inventaire-existant.md`](./audit/02-inventaire-existant.md) | Cartographie du monolithe existant |
| 03 | [`03-design-system.md`](./audit/03-design-system.md) | 53 tokens, 4 palettes, 8 media queries, shell |
| 04 | [`04-audit-cablage.md`](./audit/04-audit-cablage.md) | Analyse d'écart existant → cible |
| 05 | [`05-spec-ecrans.md`](./audit/05-spec-ecrans.md) | Spécification d'implémentation des 6 écrans |
| 06 | [`06-critique-comptable.md`](./audit/06-critique-comptable.md) | Revue de conformité micro-BNC |
| 07 | [`07-critique-technique.md`](./audit/07-critique-technique.md) | Revue d'architecture |

---

## Le constat qui commande tous les autres

Trois agents, partis de trois angles différents, ont convergé sur un même point sans se concerter :

- L'**expert-comptable** constate que l'app **affiche des affirmations fausses** : « Barèmes 2026 à jour · vérifiés le 11 juil. 2026 » alors que la couche système déclare `bareme:'2025'` ; « TVA déductible 760 € » alors que l'utilisateur est en franchise en base et n'a droit à rien ; bascule TVA à 37 500 € présentée comme une « obligation légale » alors que ce n'est pas le seuil qui déclenche l'assujettissement immédiat.
- Le **Reconcepteur d'écrans** découvre que les coquilles HTML d'**Outils et Config ne chargent ni `freel-etat.js` ni `freel-depenses.js`** — ces deux écrans ne sont branchés à **aucun** store, alors que Config prétend « piloter tous les calculs de l'app ».
- L'**architecte** mesure **1 825 objets `style:{}` et 2 796 appels `el()`**, et des constantes numériques dispersées dans la couche de présentation.

Ces trois observations sont le même fait vu de trois côtés : **l'affichage n'est pas dérivé de l'état.** Chaque écran réaffirme des nombres qu'il détient en propre. C'est pour cela que le taux de cotisations URSSAF existe en quatre valeurs concurrentes, que Config est un panneau de réglages qui ne règle rien, et que l'app peut certifier une conformité qu'elle ne vérifie pas.

**La conséquence est un risque de conformité, mais la cause est architecturale.** Une refonte qui traiterait les nombres faux un par un dans l'UI les reproduirait. Une refonte qui installe une source unique de vérité les élimine par construction. C'est ce qui justifie l'ordre de marche proposé en partie 5 : le noyau de calcul avant tout écran.

---

## 1. Synthèse de la vision lue

### Ce que Freel est

Le poste de pilotage d'un indépendant en **micro-BNC français**. L'app répond à quatre questions, dans cet ordre de priorité :

1. **Combien puis-je me verser sans me mettre en danger ?**
2. Que dois-je à l'URSSAF et au fisc, et quand ?
3. Où en suis-je de mes seuils (plafond micro, seuils de TVA) ?
4. Ma comptabilité tient-elle ? (justificatifs, rapprochement bancaire, livre des recettes)

**Six écrans** : Pilote · Activité & congés · Argent · Achats · Outils · Config.

### L'architecture voulue

Une **source unique de vérité**, avec séparation stricte entre **faits saisis** et **valeurs dérivées**. Deux stores : `freel-etat.js` (financier) et `freel-depenses.js` (dépenses et rapprochement). Le dérivé n'est jamais stocké.

Le cœur du calcul :

```
dispo()    = solde − provisions()
versable() = max(0, dispo() − reserve)
```

Et l'invariant de conformité central, correctement câblé dans `freel-depenses.js:117-121` : **la TVA n'est récupérable que si `piece === true`**. Pas de justificatif, pas de récupération. C'est la bonne règle, et c'est la meilleure idée du modèle.

### La couche transverse

- **4 palettes commutables** (`data-theme` : `sombre` / `nuit` / `clair` / `calme`), appliquées avant le premier rendu pour éviter le flash. 53 tokens, dont 41 rethémés.
- **Couche « indicateurs système »** : 4 pastilles (Cloud, Documents, Qonto, Palette).
- **Alertes à deux niveaux** : badge par onglet, puis panneau « À traiter » filtré par écran — et non filtré sur Pilote, qui montre tout.
- **Motif « texte replié derrière un i »** : tout texte d'explication de plus de 70 caractères passe derrière un bouton `.info`.

### Le responsive, tel qu'exigé

| Régime | Comportement |
|---|---|
| **Portrait ≤ 760 px** | Dock flottant en pilule centrée en bas, `backdrop-filter: blur(16px)`, rayon 100 px. **Seul l'onglet actif porte son libellé** (six onglets dans 340 px). Barre du haut sur un rang. Tableaux larges à défilement horizontal dans leur carte. Config en grille 2 colonnes (236 px au lieu de ~700). |
| **Intermédiaire** | 1150 px : « Exporter » se réduit à son icône. 1320 px : les libellés des pastilles système disparaissent. |
| **Desktop** | Rail latéral 212 px, grille 12 colonnes, panneau latéral 580 px. |

**Exigence vérifiable** : aucun débordement horizontal de page à 390 px, sur les six écrans.

### Le statut réel du bundle

Le handoff le dit lui-même : **« Ce n'est pas du code de production à copier tel quel. »** Les écrans JSX sont transpilés par Babel dans le navigateur — les prototypes chargent **4 327 910 octets de JS** (React dev + Babel standalone à 2,99 Mo) avant la première ligne d'application. Les données de démo (`FACTS`, `seedExpenses`, `seedBank`, `FLOW`, `CA`, `CAP`, `allTodos()`) sont à remplacer, et `TODAY = 2026-06-10` est figé.

### Ce que la cible ne tranche pas

Six décisions produit restent ouvertes, et **quatre d'entre elles portent sur des nombres opposables** (détaillées en partie 4.1) : le taux URSSAF canonique, le facteur `× 1,56`, la sémantique de `provisions()`, l'emplacement de la réserve. S'y ajoutent le sort de la section « Propositions Claude Code » (roadmap interne laissée dans le proto ?) et deux blocs de code mort dans la cible elle-même (`Charges()` dans Activité, `tpl-time`/`tpl-real` dans Pilote).

---

## 2. Écrans : complétude existant vs cible

### 2.1 La topologie change

L'existant a six écrans, la cible en a six — **mais pas les mêmes**. Ce n'est pas un reskin, c'est une redistribution.

| Écran CIBLE | Porté aujourd'hui par | Nature du travail |
|---|---|---|
| **Pilote** | Cockpit (`renderCockpit:23124`, hero `:16092`, indicateurs `:15163`) | Recâblage + assemblage neuf |
| **Activité & congés** | Activité (`renderActivite:23219`) + calendrier congés en **modale** (`showMonthCongesModal:10679`) | Remonter le calendrier en composant de page ; rapatrier occupation et DSO depuis Cockpit |
| **Argent** | Trésorerie (`renderTresorerie:21798`) **+** Finances (`renderFinances:18081`) | Fusion propre de deux écrans entiers — correspondance quasi 1:1 avec les sous-onglets `tres`/`perf` |
| **Achats** | **Aucun écran dédié** — réparti entre Trésorerie (import bancaire `:10197`, rapprochement `:10381`) et une modale du FAB (`showChargeModal:10016`) | Extraction et création d'écran |
| **Outils** | Dispersé : simulateurs IR/CFE **dans Config** (`:8692`, `:8855`), CRA en modale FAB (`:12671`) | Les 3 simulateurs doivent **sortir** de Config |
| **Config** | Config (4 sous-onglets) **+** une partie de Compte | Les simulateurs sortent, le contenu de Compte entre |
| *(sans destination)* | **Compte** (`renderCompte:23253`) | L'écran **disparaît** de la nav à 6 onglets — à retirer, pas à reskiner |

Un seul écran cible (**Argent**) correspond à une fusion propre. Les cinq autres impliquent une redistribution fine de fonctions venant de 3 à 4 écrans existants différents.

### 2.2 Complétude

| Écran cible | Complétude | Déjà là | Manque | Verdict |
|---|---|---|---|---|
| **Pilote** | ~35 % | Chiffres clés, alertes seuils (`computeAlerts:6129`), timeline | Carte « Décisions du jour » sur requête réelle, curseur réserve unifié, feuilles latérales | À recâbler |
| **Activité & congés** | ~55 % | Missions, factures, occupation (`tauxOccupation:6510`), DSO par client | Calendrier **intégré en page** — la fonction candidate `renderCongesCalendar:15597` est du **code mort**, jamais appelée | À recâbler |
| **Argent** | ~60 % | Solde, mouvements, provisions, échéancier `CHARGE_TYPES`, graphe CA Prévu/Réalisé/Encaissé avec toggle Mensuel/Cumulé | Enveloppes de provision au sens cible, modales de déclaration conformes, taux canonique unique | À recâbler *(le plus complet)* |
| **Achats** | ~40 % | 14 catégories de dépense, saisie montant/TVA/récurrence, rapprochement automatique | **Justificatif**, champ fournisseur, état de rapprochement explicite stocké | À recâbler **+ compléter** |
| **Outils** | ~45 % | Les 3 calculs (IR par tranches `:4134`, CFE `:8928`, CRA PDF) existent et fonctionnent | Regroupement en 3 sous-onglets, cohérence des taux | À recâbler |
| **Config** | ~50 % *(65 % avec Compte)* | Régime fiscal, ACRE, livre des recettes (`:3603`), export FEC (`:3643`), sync Supabase | Section Réserve & versements, bandeau fraîcheur barème, fusion avec Compte | À recâbler |

**Aucun écran n'est à créer de zéro.** Chacun a un socle de calcul ou d'UI réel. Le travail dominant est la redistribution et le complément.

### 2.3 Ce qui existe déjà et qu'il ne faut pas recréer

Trois éléments que l'audit a identifiés comme des faux manques :

- Le **graphe CA réalisé vs encaissé** existe (`mainChart` dans Finances/Évolution, `:18121-18134`) — à **relocaliser** vers Argent > Performance, pas à écrire.
- Le mécanisme d'**onglets de section** est vivant et fonctionnel (`ACTIVITE_TAB`, `FINANCES_TAB`, `CONFIG_TAB`) — socle à harmoniser visuellement.
- Le **calendrier mensuel** de `showMonthCongesModal:10679` est un vrai calendrier avec pastilles par jour et bascule activité/congés — mal exposé (en modale), pas absent.

---

## 3. Fonctions manquantes

### 3.1 Bloquant — sans elles, l'app n'est pas fonctionnelle ou pas conforme

| Fonction | Écran | Pourquoi | Effort |
|---|---|---|---|
| **Justificatif de dépense** (fichier réel) + invariant « pas de TVA sans pièce » | Achats | Déduction sans preuve = risque en contrôle. C'est un invariant explicite de la cible, et le champ n'existe pas dans l'existant (0 occurrence, 2 formulations testées) | M |
| **Arbitrage du taux URSSAF + réserve unifiée** pilotant `versable()` | Pilote | La promesse centrale de l'app. Câbler par-dessus des formules contradictoires reproduirait le bug historique 3 010 €/3 180 € | S *(surtout décision produit)* |
| **Requête réelle derrière `allTodos()`** | Pilote | Sans elle, l'écran qui est la raison d'être du redesign affiche une carte factice. Aujourd'hui : des constantes du shell | M |
| **État de rapprochement explicite et stocké** (`matched`/`pending`/`nobank`) | Achats | `reconcileTransactions:10381` réconcilie par candidats mais ne pose aucun état persistant, consultable ni corrigeable. « Chaque opération est rapprochée » n'est donc pas vérifiable | M |
| **Livre des recettes conforme** — `paidAt` + `modeReglement`, journal en ajout seul | Argent/Config | *Ajouté par l'expert-comptable :* c'est la **seule obligation comptable du régime**, et elle est bâclée (voir 4.2 R2) | M |
| **Migration des données `freel_v50_*`** | Transverse | *Élevé en bloquant :* sans elle, tout utilisateur existant perd ses données — **dont son livre des recettes et ses pièces**, à conservation obligatoire | M |

### 3.2 Recommandé

Cycle de statut d'échéance enrichi (à déclarer → déclarée → payée, daté) · sysbar unifiée à 4 pastilles *(aujourd'hui 4 icônes hétérogènes, `:1867-1870`, dont 2 hors périmètre cible : centre de notifications et mode confidentialité)* · emplacement réel des documents *(0 intégration : ni Drive, ni OneDrive, ni Dropbox, ni coffre)* · bandeau fraîcheur du barème *(`LEGAL_BY_YEAR` contient déjà 2025/2026, rien ne l'expose)* · 4 palettes `data-theme` *(existant = binaire, un seul variant `light` trouvé)* · détection de conflit de synchro *(aujourd'hui `upsert(onConflict:'user_id')` = dernier écrit gagne, silencieusement)* · autoliquidation TVA sur achats hors de France · deux seuils de TVA avec règle N-1/N-2 · devis et acomptes · relances d'impayés.

### 3.3 Confort — reskin pur, aucune capacité bloquée

Dock en pilule *(la barre fixe pleine largeur `.bottom-nav` assure déjà le rôle)* · sheet latéral *(les modales centrées assurent déjà le détail)* · motif `.info`/`.explain` · `.tblscroll` dédié *(`overflow-x:auto` déjà posé au cas par cas)*.

### 3.4 États non gérés

| État | Aujourd'hui |
|---|---|
| Vide | **Partiel** — nombreux messages ad hoc (« Aucune charge », « Aucune mission ce mois ») et une classe `.empty-state`, mais pas de motif systématisé |
| Chargement | **Partiel** — un seul texte, spécifique au chargement de la lib Supabase |
| Erreur | **Partiel** — toasts éphémères, aucun état d'erreur persistant en carte |
| Hors-ligne | **Non** — le badge « Hors ligne » reflète l'absence d'utilisateur connecté, pas le réseau. **0 occurrence de `navigator.onLine`** |
| Barème périmé | **Non** — et le bandeau affirme le contraire (4.2 R4) |
| Conflit de synchro | **Non** — écrasement silencieux |
| Permissions refusées | **Non** |

---

## 4. Critique experte — double compétence croisée

### 4.1 Verdict comptable : trésorerie juste, fiscalité fausse

L'ossature est celle d'un comptable : comptabilité de trésorerie, seuils calculés sur les encaissements, TVA conditionnée au justificatif. **Mais tous les nombres opposables sont erronés.**

#### Le taux URSSAF : aucune des quatre valeurs n'est bonne

| Valeur | Ce qu'elle est réellement |
|---|---|
| **21,2 %** | Taux **micro-BIC services**, plein — pas un taux BNC |
| **24,6 %** | Taux BNC plein **2025** — millésime périmé |
| **10,6 %** | ACRE sur le BNC d'**avant juillet 2024** |
| **11,6 %** | ≈ ACRE sur le taux du **S2 2024** |

Le taux à retenir pour un micro-BNC libéral non réglementé en 2026 serait **26,1 %** (trajectoire 21,1 → 23,1 → 24,6 → 26,1). **Confiance moyenne-haute : à confirmer sur `urssaf.fr` avant implémentation.** Et l'ACRE de la persona de démo (début 01/02/2025) est **éteinte depuis le T1 2026** — le trimestre affiché est à taux plein.

**Écart chiffré** : −390 €/trimestre, soit **−3 636 €/an**. Jusqu'à **−11 500 €/an** si l'utilisateur se fie au 10,6 %.

#### Le facteur `× 1,56` n'a aucun fondement légal

`cotisIR() = base × tauxIR × 1,56`. Le versement libératoire micro-BNC est un **plat de 2,2 % des recettes brutes**. Origines possibles du 1,56 : `1/0,66 = 1,515` (dégrossissement d'abattement — opération inverse et hors sujet), `1/0,64 = 1,5625` (colle au chiffre mais ne correspond à aucun abattement du régime), ou un calage sur maquette. **Sur-provision de +56 %, soit +914 €/an.**

Pire, deux anomalies s'ajoutent : l'app **cumule** versement libératoire (`cotisIR`) **et** acompte de prélèvement à la source (échéance `ir` 620 € au 15/05) — **ces deux régimes sont exclusifs**, +720 €/trimestre immobilisés à tort. Et `prelevT2` **omet** le VL, sous-annonçant le débit réel de 566 € (−25 %).

#### Les trois risques de conformité majeurs

- **R1 — Sous-provisionnement social.** Taux BIC appliqué à un BNC, présenté comme un taux ACRE alors que l'ACRE est éteinte, sur un millésime périmé. Jusqu'à 11 500 € de dette non provisionnée.
- **R2 — Livre des recettes non conforme.** Ni date d'encaissement ni mode de règlement dans le modèle ; `toggleFacture` dé-encaisse **sans laisser de trace** ; et **trois totaux différents pour les mêmes recettes** (15 760 € / total des factures / 32 400 €). Conséquence : rejet du registre en contrôle, reconstitution des recettes par l'administration, majoration de 40 % en cas de manquement délibéré.
- **R3 — Autoliquidation de la TVA ignorée.** Un micro en franchise qui achète des services à un prestataire étranger est **redevable de la TVA française**, doit la déclarer par CA3 et la payer **sans pouvoir la déduire**. La démo contient Adobe (Irlande) et GitHub (US). La Config affiche un n° de TVA intracom sans jamais l'utiliser. Symétriquement, la **DES** manque sur les ventes de services à des professionnels de l'UE.

#### Une échéance externe non négociable

**Réception obligatoire des factures électroniques au 1er septembre 2026 — dans cinq semaines.** Couverture actuelle : zéro. C'est le seul élément de cet audit dont la date ne dépend pas du plan de charge.

#### Les trois manques métier les plus criants

**Devis et acomptes** — absents de l'existant *et* de la cible, alors que c'est le cœur du cycle commercial (et l'acompte encaissé est une recette du jour). **Relances d'impayés** avec pénalités et indemnité forfaitaire de 40 €. **Surveillance du seuil majoré de TVA en cours d'année** : sans le « reste facturable avant franchissement », l'utilisateur qui dépasse doit la TVA sur des factures déjà émises sans elle — **~1 667 € à sortir de sa poche pour 10 000 € facturés trop tard**.

### 4.2 Verdict technique : réécrire l'UI et l'état, porter le noyau fiscal sous test

La recommandation est argumentée par la mesure, pas par préférence : **1 825 objets `style:{}` et 2 796 appels `el()`**. Appliquer les 53 tokens des 4 palettes exigerait de rouvrir ~1 900 sites de style. **Modulariser coûte donc plus cher que réécrire, pour un résultat qui n'est même pas la cible.**

Modalité retenue : **coexistence au niveau du déploiement**, ancienne app figée en lecture seule sous un chemin dédié.

#### Stack recommandée

| Couche | Choix | Justification |
|---|---|---|
| Framework | **React 19** | Cible déjà exprimée en JSX |
| Langage | **TypeScript strict** | Décisif ici, pas par principe : types nominaux Euro/Ratio/Pourcentage, unions de statuts, barème typé par millésime. On manipule des règles fiscales |
| Build | **Vite** | Supprime Babel navigateur |
| Style | **CSS natif** — tokens en variables + CSS Modules | Tailwind **écarté** : les 53 tokens et 4 palettes sont déjà un système cohérent |
| État | **Zustand**, 3 stores, **dérivé jamais stocké** | Respecte l'invariant faits/dérivé de la cible |
| Validation | Zod/Valibot **à la frontière de persistance** | Les données viennent de `localStorage`, donc d'une source non fiable |
| Tests | Vitest + Testing Library + Playwright | |
| Persistance | `localStorage` derrière un **dépôt versionné** ; **IndexedDB** pour les justificatifs | Les fichiers n'ont rien à faire en `localStorage` |
| Graphes / PDF | **SVG maison** au lieu de Chart.js ; jsPDF **différé** | Voir perf ci-dessous |

#### Performance — ce qui est mesuré

- **jsPDF + Chart.js = 627 856 octets, soit 34 % du fichier** — bloquants et **non cachables**, servis avec `no-store` dans le `<head>`.
- Prototypes : **4,3 Mo de JS** avant la première ligne d'application.

#### Responsive — un bug vérifié qui résume le problème

`adaptMobileGrids()` : **élargir la fenêtre au-delà de 600 px ne restaure jamais les grilles.** C'est la conséquence directe du responsive recalculé en JS via `window.innerWidth` — et la démonstration qu'il faut le sortir entièrement du JS.

Pour tenir la promesse « PC et mobile » de façon **vérifiable et non déclarative** : mobile-first en couches `min-width`, container queries, mise en page **hors du JS**, matrice Playwright avec **assertion automatisée de zéro-débordement à 390 px**. Plus les points d'exécution mobile trop souvent oubliés : retirer `user-scalable=no`, ajouter `viewport-fit=cover` pour la safe-area iOS sous un dock flottant, `dvh` pour le clavier virtuel, cibles tactiles à 44 px (le `.info` de la cible est à 18 px).

#### Les tests sont un anti-pattern à nommer

`smoke-test.js` annonce « 47 passés, 0 échoués ». En réalité il **avale l'exception de son seul bloc comportemental** et fait un `eval()` **sur jsPDF, pas sur l'application**. Un vert non informatif est plus dangereux qu'une absence de tests : il autorise à avancer. La perte silencieuse d'un export légal ou d'une numérotation de facture ne serait détectée par rien.

#### Sécurité

Clé Supabase anon **en clair** · données financières en `localStorage` non chiffré · pas d'export/suppression RGPD · et sur l'agrégation bancaire DSP2 : elle impose un **agrégateur agréé** et **un composant serveur** — ce n'est pas une intégration front, c'est un changement de nature de l'application.

### 4.3 Les points où les deux experts se contredisent — arbitrage

C'est ici que le croisement produit plus que la somme des deux revues.

| Sujet | Comptable | Technique | Arbitrage |
|---|---|---|---|
| **Export FEC** | À **abandonner** (#25) : le FEC n'est pas une obligation en micro-BNC ; réallouer l'effort vers l'export du livre des recettes | Harnais différentiel sur le FEC = **critique (légal)** | **Le comptable a raison sur le droit**, la prudence technique reste fondée sur l'usage. Donc : garder le FEC en non-régression tant qu'on ne sait pas si un utilisateur s'en sert, **ne rien y investir**, et porter l'effort sur le livre des recettes. Ne pas le traiter comme une obligation légale dans les priorités. |
| **Migration des données** | P2, impact « moyen » (#17) | **P0, critique** (#6) | **P0.** Le comptable se contredit lui-même : son R12 qualifie la perte de « livre des recettes et justificatifs — c'est-à-dire ses pièces comptables », à conservation obligatoire. C'est donc un risque de conformité, pas un confort. |
| **Gel des fonctions nouvelles** | Veut devis, acomptes, relances en P1 | **Interdit toute fonction nouvelle avant le jalon 6**, exception faite des justificatifs | **Gel maintenu**, avec une frontière nette : corriger une affirmation fausse déjà affichée (seuils de TVA, TVA déductible en franchise, bandeau de barème) n'est **pas** une fonction nouvelle — c'est une correction. Devis et acomptes sont de vraies fonctions : après bascule. |
| **Harnais différentiel** | Le livre des recettes actuel est **non conforme** | Exige des sorties **identiques** à l'ancienne app | **Contradiction réelle à outiller.** Un harnais qui exige l'identité échouerait précisément là où l'on corrige. Il doit donc classer chaque écart en *régression* ou *correction intentionnelle*, cette dernière adossée à une décision datée du registre. Sans cette distinction, le harnais bloque la conformité au lieu de la protéger. |

### 4.4 Ce sur quoi les deux convergent — donc le plus solide

**Le barème doit être une donnée datée et versionnée, appliquée par période déclarative — jamais des constantes dans le code.** Le comptable y arrive par le droit : rouvrir un trimestre 2024 en 2026 avec le barème de 2026 réécrirait l'historique déclaré. L'architecte y arrive par la testabilité : un noyau fiscal pur, sans DOM, avec des jeux de référence par millésime. Même conclusion, deux chemins indépendants. **C'est la décision d'architecture la plus sûre de tout cet audit.**

Convergence secondaire : les périodes codées en dur (`y:2026`, `TODAY='2026-06-10'`). Le comptable en mesure l'effet — **au 1er janvier 2027, les dépenses tombent à 0 et l'autonomie bondit de 5,3 à 9,3 mois sans cause réelle.**

---

## 5. Priorisation

Effort : **S** ≤ 2 jours · **M** ≤ 2 semaines · **L** > 2 semaines, pour une personne assistée par IA.

### P0 — rien de fiable ne peut être construit avant

| # | Action | Effort | Pourquoi en premier |
|---|---|---|---|
| 1 | **Arbitrer et consigner** les 4 ambiguïtés numériques dans un registre de décisions daté : taux URSSAF canonique, sort du `× 1,56`, sémantique de `provisions()`, emplacement unique de la réserve | S | Coder une formule avant d'avoir arbitré son taux, c'est fabriquer la contradiction suivante |
| 2 | **Réparer le harnais de tests** : échec sur exception, garde-fou de compte d'assertions, tester l'application et non jsPDF | S | Tant que le vert ne signifie rien, tous les chantiers avancent sans filet |
| 3 | **Socle technique** : build, TypeScript strict, lint à frontières, CI | M | Parallélisable avec 1 et 2 |
| 4 | **Noyau fiscal pur, typé, testé, versionné par millésime**, avec jeux de référence par année | L | Un écran câblé sur un domaine non testé transforme une erreur de calcul en erreur d'affichage introuvable |
| 5 | **Harnais différentiel** ancienne/nouvelle app — classant chaque écart en régression ou correction intentionnelle (voir 4.3) | M | Sans lui, la perte d'un export légal ne se découvre qu'au contrôle |
| 6 | **Migration `freel_v50_*`** : rapport à blanc, instantané exporté, idempotence, invariant d'absence de perte | M | Point de rupture n°1 pour les utilisateurs en production |
| 7 | **Corrections gratuites de conformité** : `provisions() = sortiesAVenir()`, suppression du `× 1,56`, chaîne TVA conditionnée au régime, retrait de la mention « obligation légale » à 37 500 € | S | Effort minime, corrige des affirmations fausses affichées. `provisions()` seule rend +620 € de versable et l'autonomie juste (5,3 → 6,6 mois) |
| 8 | **Avertissement facturation électronique** (réception au 01/09/2026) | S | **Cinq semaines.** Seule échéance de cet audit qui ne dépend pas du plan de charge |

### P1 — le premier écran livrable et la promesse responsive

Tokens et 4 palettes, échelle d'espacement manquante, correction des 4 couleurs jamais rethémées (**M**) · primitives d'UI avec accessibilité intégrée — `role="dialog"`, piège de focus, sémantique d'onglets, région live, cible 44 px (**L**) · routage réel, suppression de la détection par `document.title` (**S**) · **responsive mobile-first, mise en page entièrement hors du JS** (**M**) · matrice Playwright avec assertion zéro-débordement à 390 px (**M**) · `viewport-fit=cover`, `dvh`, retrait de `user-scalable=no` (**S**) · sélecteur `todos` et alertes à 2 niveaux (**M**) · **écran Pilote câblé sur sélecteurs réels, zéro littéral numérique** (**M**) · livre des recettes conforme (**M**) · deux seuils de TVA et règle N-1/N-2 (**M**) · échéancier aux vraies dates, déclaration à zéro incluse (**M**) · réserve unifiée `max(plancher, pct × dispo)` après provisions, un seul writer (**S**).

### P2 — couverture fonctionnelle complète

Les 5 écrans restants (**L**) · justificatifs sur IndexedDB avec empreinte et horodatage (**M**) · autoliquidation TVA et DES (**M**) · cycle d'échéance enrichi (**M**) · suppression de Chart.js, jsPDF différé, retrait des méta anti-cache (**M**) · synchro v2 versionnée avec UI de conflit (**L**) · gel de l'ancienne app en lecture seule puis suppression du code mort (**S**) · périodes dérivées de l'horloge (**S**).

### P3 — peut attendre sans léser personne

Devis, acomptes, relances d'impayés, avoirs · PWA réelle · coffre chiffré · agrégation bancaire par agrégateur agréé (**et son composant serveur**) · comparateur micro-BNC vs déclaration contrôlée · écran de préparation 2042-C-PRO · multi-activité BNC/BIC.

### Séquentiel — non négociable

- **1 avant 4** — arbitrer avant de coder.
- **4 avant tout écran** — le domaine avant l'affichage.
- **5 avant la bascule** — le filet avant le saut.
- **6 avant tout écran en écriture** — sinon deux vérités coexistent.
- **Tokens avant primitives** — des primitives sur tokens provisoires seront à refaire.

### Parallélisable — le principal levier de compression

Deux fils indépendants dès le jalon fiscal : **(a)** domaine et tests fiscaux, **(b)** tokens, primitives d'UI et matrice visuelle. Ils ne touchent pas les mêmes fichiers et n'ont pas la même nature de vérification. Les migrations sont parallélisables au domaine dès que **les types** sont figés — les types précèdent les formules.

### Deux pièges de calendrier

1. **L'effet « second système. »** L'audit identifie des fonctions absentes des deux côtés et beaucoup d'enrichissements souhaitables. Chaque exception accordée repousse la bascule, et **une réécriture qui ne bascule jamais est un échec**, quelle que soit la qualité du code. Seule exception admise : les justificatifs, qui sont un invariant de conformité de la cible et non un confort.
2. **La double maintenance.** Entre la coquille et la bascule, toute correction en production doit être portée deux fois. Geler l'ancienne app **explicitement** dès que la nouvelle coquille tient, sauf correctif de sécurité ou de calcul erroné. Un gel non décidé devient une double maintenance de fait — le mode d'échec le plus fréquent des coexistences.

---

## 6. Ce qui doit être décidé avant d'écrire la première ligne

Six décisions, dont quatre portent sur des nombres opposables. Aucune n'est technique : ce sont des choix produit et métier.

1. **Le taux de cotisations URSSAF canonique** — et la vérification à la source. Un seul taux, servi par le store, appliqué par période déclarative.
2. **Le sort du `× 1,56`** — et le choix du régime d'imposition comme **discriminant de calcul** : versement libératoire ⇒ ligne 2,2 % et **aucun** acompte PAS ; barème ⇒ acomptes PAS et **aucune** ligne VL.
3. **La sémantique de `provisions()`** — toutes les échéances, ou seulement celles à venir. Le commentaire du code dit aujourd'hui l'inverse de ce que fait le code.
4. **Où vit la réserve** — trois implémentations concurrentes existent (montant absolu sur Pilote, curseur % dans Argent > Performance, pourcentage dans Config).
5. **Le sort de la section « Propositions Claude Code »** de Pilote — roadmap interne laissée dans le prototype, ou fonctionnalité produit ?
6. **Le maintien ou l'abandon de l'export FEC** — hors obligation en micro-BNC, mais peut-être utilisé.

Ces décisions sont peu coûteuses à prendre et très coûteuses à différer : chacune est un endroit où l'app affirme aujourd'hui deux choses à la fois.
