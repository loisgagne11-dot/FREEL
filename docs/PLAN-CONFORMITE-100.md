# Plan de conformité — les deux axes, et ce qui manque pour y coller

**Date :** 14/08/2026
**Objet :** poser les indicateurs de vérification sur **deux axes distincts**, en
faire l'inventaire vérifié, et fermer les écarts.

---

## Pourquoi deux axes, et pas un

Jusqu'ici les vérifications répondaient à une seule question : « est-ce que ça
marche ». C'est insuffisant, parce que le projet a **deux objectifs qui peuvent
être tenus séparément** :

| Axe | Objectif | Source normative |
|---|---|---|
| **A — Design** | L'application ressemble et se comporte comme le dossier `freel` le décrit | `docs/design/handoff-v1.11/README.md` + `annexe-architecture-build5.md` + `05-spec-ecrans.md` |
| **B — Fonctions** | Le besoin que servait chaque fonction de l'ancienne application est couvert, **adapté au nouveau design** | `docs/AUDIT-ANCIENNE-VS-NOUVELLE.md` + les notes du handoff sur les fonctions ajoutées ou changées en V1.11 |

Un écran peut être parfaitement conforme au design et ne rien faire. Une
fonction peut être juste et introuvable. **Les deux axes se vérifient
séparément, et un manque sur l'un ne se compense pas par l'autre.**

Précision sur l'axe B, qui n'est pas « recopier l'ancienne » : la cible est de
**couvrir le besoin**. Une fonction remplacée par mieux est couverte. Une
fonction disparue sans remplacement ne l'est pas. Et quand le handoff note
lui-même qu'une fonction est **ajoutée ou changée** en V1.11, c'est sa version
qui fait foi, pas celle de l'ancienne application.

---

## Axe A — Design : inventaire vérifié

Statut relevé dans le code, pas supposé. `✅` conforme · `⚠️` partiel ·
`❌` absent · `🚫` écarté avec motif.

### A1. Matière et palettes

| Point du handoff | État | Constat |
|---|---|---|
| 4 palettes commutables, valeurs de `v1.11.css` | ✅ | `styles/tokens.css`, vérifié sur 140 combinaisons |
| Palette appliquée **avant le premier rendu**, sans flash | ✅ | Script inline, assertion sur chaque combinaison |
| Tokens : surfaces, traits, texte, statuts, formes | ✅ | Aucune couleur en dur dans les modules CSS |
| « La couleur ne code qu'une donnée » | ✅ | vert = sain, ambre = à faire, rouge = retard, bleu = info |

### A2. Couche « indicateurs système »

| Point du handoff | État | Constat |
|---|---|---|
| Pastille **Palette** | ✅ | `PastillesSysteme` |
| Pastille **Cloud** | ✅ | Faite le 14/08, trois états dont la session expirée |
| Pastille **Documents** | 🚫 | Aucune intégration (Drive, OneDrive, Dropbox, coffre). Une pastille qui n'ouvre rien apprend que les pastilles ne servent à rien |
| Pastille **Qonto** | 🚫 | Aucune connexion DSP2. L'import CSV couvre le besoin |
| Alertes **niveau 1** — badge par onglet | ✅ | `RailNav`, compteurs issus de la même requête que la liste |
| Alertes **niveau 2** — indicateur « à traiter » | ✅ | `IndicateurATraiter`, sujets de l'onglet courant, tout sur Pilote |
| Placement : barre du haut en desktop, flottant en portrait | ✅ | Vérifié dans la fenêtre sur 140 combinaisons |
| Fraîcheur du barème dans « à traiter », plus en bandeau | ✅ | |

### A3. Motif « texte replié derrière un i »

| Point du handoff | État | Constat |
|---|---|---|
| Bouton `i` de 18 px, texte replié | ✅ | Composant `Info`, cible tactile 44 px |
| Deux placements : dans le titre, ou à la place du paragraphe | ✅ | |

### A4. Responsive — portrait ≤ 760 px

| Point du handoff | État | Constat |
|---|---|---|
| Dock flottant en pilule, défilement horizontal | ✅ | Vérifié sur `position` |
| Seul l'onglet actif porte son libellé | ✅ | Assertion dédiée |
| **Flux du mois : 3 colonnes côte à côte** | ✅ | Fait le 14/08. Le détail sort des colonnes plutôt que de perdre ses montants |
| Un seul rang de filtres, défilant (Achats) | ✅ | `BarrePeriode` |
| Tableaux larges à défilement dans leur carte | ⚠️ | Activité, Config et Facturer l'ont. Argent et Achats n'ont pas de `<table>` — le besoin ne se pose pas |
| Config : liste des sections en grille 2 colonnes compacte | 🚫 | Résolu autrement : les sections sont des **onglets** défilants, pas une liste. Plus compact encore, et cohérent avec Achats et Argent |
| Aucun débordement horizontal | ✅ | 140 combinaisons |

### A5. Comportements transversaux

| Point du handoff | État | Constat |
|---|---|---|
| Feuilles latérales (piège de focus, Échap, voile) | ✅ | `Sheet` |
| Toasts | ✅ | `Toasts` |
| **Cartes pliables avec synthèse `data-fold`** | ❌ | **Absent.** Le handoff le qualifie de « mécanisme transversal, **à conserver** » |
| Sous-onglets `[data-tab]` | ✅ | `Onglets`, sémantique ARIA |
| Rail 212 px, grille 12 colonnes, panneau 580 px | ✅ | |

### A6. Changements propres à la V1.11

| Point du handoff | État | Constat |
|---|---|---|
| Argent : Trésorerie / Performance en **onglets de section** | ✅ | |
| Graphe CA : valeurs **au-dessus** des barres, en k€ | ✅ | `GrapheBarres` |
| **Activité : jours ouvrés de la période visible (semaine ou mois)** | ⚠️ | Le mois l'a. **La semaine ne l'a pas** |
| Outils : lignes de tranche insécables | ✅ | `white-space: nowrap` sur les valeurs |
| Achats : pastilles d'état en double supprimées | ✅ | |
| Sauvegarde : pastille dédiée supprimée | ✅ | |

---

## Axe B — Fonctions : ce qui reste découvert

Reprise de `AUDIT-ANCIENNE-VS-NOUVELLE.md`, à jour au 14/08.

### B1. Couvert depuis l'audit

Échéances · clients opérationnels par mission · rythme de travail · versement de
rémunération · restauration de sauvegarde · CFE et 1447-C · clés SIRET et IBAN ·
adresse et coordonnées bancaires · plage de congés et demi-journées.

### B2. Découvert, par risque décroissant

| Fonction | Ce que ça coûte | Décision |
|---|---|---|
| `projectTVADate` — **date de franchissement du seuil** | Franchir sans le voir, c'est devoir la TVA sur des factures déjà émises sans elle. Le pourcentage s'affiche, la date probable non | **À faire** |
| `editMovement`, `deleteMovement` | Un mouvement importé ne se corrige pas à la main ; il faut réimporter | À faire |
| `parseOFX` | Certaines banques n'exportent que ce format | Plus tard |
| `setGoalCA`, `renderGoalWidget` | Aucun objectif de chiffre d'affaires | Plus tard |
| `getCompareData`, `computeTrend` | Aucune comparaison à la période précédente | Plus tard |
| `showOnboarding` | On arrive sur un Pilote vide | Plus tard |
| `createSearchOverlay`, `initKeyboardShortcuts` | Pas de recherche ni de raccourcis | Plus tard |
| `_subscribeRealtime` | Recharger pour voir un autre appareil | Plus tard |
| `showSendInvoiceModal`, `showCRAPreviewWithSend` | Pas d'envoi par courriel — impression seulement | 🚫 Suppose un service d'envoi ; hors périmètre d'une application sans backend |
| `calculerRendementMensuel` | Suivi de placements | 🚫 Hors du métier micro-BNC |
| `repairInvoiceNumbers`, `swapInvoiceNumbers` | Réparer une numérotation | 🚫 Réécrire un numéro émis est ce qu'un contrôle cherche. Les trous sont **signalés**, pas réparés |
| Export FEC | | 🚫 Décision D6 : le FEC ne concerne pas la micro |
| Score de santé sur 100 | | 🚫 Ses valeurs étaient codées en dur ; il ne mesurait rien |

---

## Ce que ce plan exécute

Trois lots, du plus structurant au plus ponctuel.

### Lot 1 — Cartes pliables à synthèse (axe A, A5)

Le seul point du handoff explicitement marqué « à conserver » et absent.

Sa règle, qui le distingue d'un accordéon : **repliée, la carte affiche son
en-tête plus sa synthèse.** Replier ne fait jamais perdre l'information, elle se
condense. Un accordéon ordinaire oblige à déplier pour savoir s'il faut déplier.

- Composant `CartePliable` : `id` stable, état conservé par écran dans
  `localStorage`, jamais dans le magasin — une préférence d'affichage n'est pas
  un fait comptable et n'a rien à faire dans la sauvegarde ni au compte distant.
- Les commandes d'en-tête vivent **hors** du bouton de pli : une zone cliquable
  qui en contient d'autres est un piège à la souris comme au lecteur d'écran.
- Appliqué au registre des achats, dont le handoff écrit la synthèse mot pour
  mot : `n achats · X € TTC · TVA déductible Y € · Z pièce(s) manquante(s)`.

### Lot 2 — Jours ouvrés en vue semaine (axe A, A6)

Le mois l'affiche, la semaine non. Cinq n'est pas toujours la réponse : une
semaine avec un férié en compte quatre, et un taux d'occupation lu sans le
savoir est faux d'un cinquième.

Les congés posés ne sont **pas** retirés du compte : ce sont des jours ouvrés
qu'on a choisi de ne pas travailler. Les soustraire afficherait 100 %
d'occupation à quelqu'un en vacances.

### Lot 3 — Date de franchissement du seuil de TVA (axe B, B2)

Le plus coûteux des manques restants. Le pourcentage du seuil s'affiche déjà ;
la **date probable** de franchissement, non.

Ce que ça change : franchir la franchise en base sans l'avoir vu venir, c'est
devoir la TVA sur des factures déjà émises **sans l'avoir facturée** — elle sort
alors de sa propre poche.

Contrainte de fond : c'est une **projection**, donc une hypothèse. Elle doit se
présenter comme telle et non comme une date acquise, et refuser de se prononcer
quand l'historique est trop court pour qu'une tendance veuille dire quelque
chose.

---

## Comment ce plan est contrôlé

Trois agents, définis dans `.claude/agents/` :

| Agent | Quand | Rôle |
|---|---|---|
| `expert-plan` | **Avant** exécution | Juge si le plan répond aux deux axes, cherche ce que le plan ne voit pas, refuse ce qui est faux sur le fond comptable |
| `executant` | Pendant | Réalise un lot, entièrement, et rend compte de ce qu'il n'a **pas** pu faire |
| `controleur-adherence` | **Après** exécution | Vérifie point par point, preuve à l'appui, que l'annoncé a été livré. Mesure, ne croit pas |

Le contrôleur existe contre une famille de défaut que ce projet connaît : des
actions écrites, testées et injoignables ; une assertion conditionnelle qui ne
s'exécutait jamais ; un vérificateur qui mesurait « le premier `<nav>` de la
page ». Tous passaient au vert.
