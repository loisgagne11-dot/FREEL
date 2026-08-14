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
| « La couleur ne code qu'une donnée » (état) | ✅ | vert = sain, ambre = à faire, rouge = retard, bleu = info |
| **Couleur fixe par type de charge** — « une charge garde sa couleur partout » | ✅ | **Corrigé le 14/08.** Les jetons `--c-urssaf`, `--c-tva`, `--c-ir`, `--c-cfe` existaient dans les quatre palettes et n'étaient câblés **nulle part**. Un filet de 3 px sur chaque échéance, pas un aplat : la couleur identifie la **charge**, tandis que vert/ambre/rouge codent l'**état** — deux systèmes sur la même ligne et aucun ne se lit plus |

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
| Tableaux larges à défilement dans leur carte | ✅ | Activité, Config, Facturer — et **Outils depuis le 14/08**, dont le tableau des tranches à quatre colonnes avait été oublié. Argent et Achats n'ont pas de `<table>` |
| Config : liste des sections en grille 2 colonnes compacte | ✅ | **Résolu autrement, pas abandonné** : les sections sont des **onglets** défilants, plus compacts qu'une grille et cohérents avec Achats et Argent. Le classer en renoncement gonflait artificiellement la colonne des abandons |
| Aucun débordement horizontal | ✅ | 140 combinaisons |

### A5. Comportements transversaux

| Point du handoff | État | Constat |
|---|---|---|
| Feuilles latérales (piège de focus, Échap, voile) | ✅ | `Sheet` |
| Toasts | ✅ | `Toasts` |
| **Cartes pliables avec synthèse `data-fold`** | ⚠️ | `CartePliable` appliqué à **4 des 6 cartes** que `05-spec-ecrans.md` nomme : registre des achats, répartition du solde, enveloppes de provision, seuils, échéancier. Reste le **rapprochement bancaire** (`ReconCard`). Le compte de « huit » avancé plus tôt était faux — la spec en nomme six, plus une mention du composant lui-même |
| Sous-onglets `[data-tab]` | ✅ | `Onglets`, sémantique ARIA |
| Rail 212 px, grille 12 colonnes, panneau 580 px | ✅ | |

### A6. Changements propres à la V1.11

| Point du handoff | État | Constat |
|---|---|---|
| Argent : Trésorerie / Performance en **onglets de section** | ✅ | |
| Graphe CA : valeurs **au-dessus** des barres, en k€ | ✅ | `GrapheBarres` |
| **Activité : jours ouvrés de la période visible (semaine ou mois)** | ✅ | Fait le 14/08, puis **corrigé** : la première version comptait les congés parmi les ouvrés là où le mois les en retire — même mot, deux nombres, même écran. `decompterJours` rend désormais les deux (`ouvres`, `enConge`, `travaillables`) et un test vérifie l'accord avec le plan de charge |
| Outils : lignes de tranche insécables | ✅ | Corrigé le 14/08 : le `nowrap` invoqué portait sur la **liste de résultat**, pas sur le tableau des tranches. Celui-ci défile maintenant dans son conteneur |
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
| **Relancer une facture en retard** (`showSendInvoiceModal`) | ❌ **Reclassé le 14/08.** Le motif « pas d'envoi de courriel » répondait à la FORME, pas au besoin : cette fonction servait à relancer un impayé. Le besoin n'a aucun remplaçant — `selecteurs.ts` identifie même « précisément celle qu'il faut relancer », sans aucune action au bout | **À faire** |
| Envoi du document par courriel | La facture s'imprime ou s'enregistre en PDF, puis se joint à un courriel | 🚫 Un envoi depuis l'application supposerait un service d'expédition et l'archivage de ce qui a été envoyé. La relance, elle, n'en a pas besoin |
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


---

## Revue experte du 14/08 — verdict et suites

Ce plan a été soumis à l'agent `expert-plan` **avant** d'être poursuivi. Verdict :
**INSUFFISANT**. Il avait raison sur l'essentiel, et sur des points que la chaîne
de vérification ne pouvait pas voir.

### Ce qu'il a trouvé, et qui était vrai

| Constat | Vérifié | Suite |
|---|---|---|
| **Le second mécanisme structurant manquait.** L'annexe en nomme deux à conserver : le pli à synthèse **et** la couleur fixe par charge. Le plan n'avait vu que le premier | ✅ Les jetons existaient dans les 4 palettes, câblés dans **une seule** règle CSS | Câblé sur les échéances |
| **Trou de confidentialité dans le pli.** La synthèse rendait ses montants en chaîne, sans `data-montant` : carte repliée, le total TTC et la TVA s'affichaient **en clair** en mode confidentiel | ✅ Reproduit puis corrigé | Synthèse en nœuds `<Montant>`, **et** le vérificateur replie désormais les cartes avant sa passe — sans quoi il restait vert sur le trou |
| **Deux définitions de « jour ouvré » sur le même écran.** Le mois retire les congés, ma vue semaine les comptait | ✅ Reproduit | `decompterJours` dans le domaine rend les deux nombres sous deux noms, avec un test d'accord avec le plan de charge |
| **La preuve de « tranches insécables » ne portait pas** : le `nowrap` cité était sur la liste de résultat, pas sur le tableau à quatre colonnes | ✅ | Tableau mis en conteneur défilant |
| **Le pli est demandé sur huit cartes, une seule est faite** | ✅ | A5 repassé en ⚠️ — le point ne se ferme pas |
| **Config n'est pas un renoncement mais une résolution autrement** | ✅ | Reclassé ✅ |
| **Le motif de l'envoi par courriel répondait à la forme, pas au besoin** : la fonction servait à **relancer un impayé**, et ce besoin n'a aucun remplaçant | ✅ | Scindé : la relance passe en ❌ à faire, l'envoi reste écarté |

### Ce qu'il a ajouté et que le plan ignorait

Trois manques de l'annexe (« Ordres de marche » §4), qui n'appartenaient ni à
l'axe A — bâti sur le README — ni à l'axe B, bâti sur l'audit :

1. **Génération des dépenses récurrentes** — aucun modèle d'abonnement. C'est la
   saisie la plus répétitive de l'outil, et celle qu'on abandonne en premier.
   L'expert la classe devant tout le « plus tard » de B2.
2. **Conservation 10 ans visible.** La durée est au barème, aucun écran ne
   l'affiche. En renonçant à la pastille Documents — à raison — on a supprimé le
   seul endroit du handoff où cette obligation était posée.
3. **État « ignorée » au rapprochement**, et **création d'une dépense depuis une
   opération orpheline** : le relevé arrive avant la saisie, c'est le sens le
   plus fréquent et il n'est pas câblé.

Plus deux comportements : **clic sur un mois = composition** dans les graphes, et
**les sous-onglets qui remontent en haut** au changement.

### Sur le lot 3, qu'il a refusé en l'état

Son objection est fondée et change le lot :

- **« La » date de franchissement n'existe pas au singulier.** Franchise et seuil
  majoré ont des effets **opposés** : la franchise se perd au 1er janvier suivant
  (sous une règle N-1/N-2 que le barème ne calcule pas et documente comme non
  calculée) ; le seuil majoré assujettit **immédiatement**. Le coût décrit dans le
  plan — devoir la TVA sur des factures déjà émises — est celui du **seuil
  majoré seul**. `projectTVADate` visait 37 500 €, et `tva.ts` qualifie cette
  présentation de « juridiquement FAUX ». Écrire le lot sans nommer le seuil,
  c'est réintroduire l'erreur que le barème existe pour éviter.
- **Projeter par tendance sur l'encaissé est le plus mauvais estimateur
  disponible** : l'encaissement dépend de la date à laquelle le client paie. Il
  faut bâtir sur ce qui est **déjà facturé et non encaissé**, plus le délai
  **médian** constaté.
- **`Resolution<T>` ne convient pas** : ses variantes exigent `source` et
  `verifieLe`, la traçabilité d'une valeur de barème. Une projection statistique
  n'a pas de `verifieLe`, et lui donner ces insignes la ferait passer pour un
  fait publié.
- **L'année civile est une borne dure** — le CA de référence se remet à zéro au
  1er janvier —, et le chiffre qui doit rester dominant est le **reste en euros**,
  qui est un fait exact, pas la date, qui est un confort.

Le lot 3 est donc **suspendu** en l'état et à réécrire selon ces conditions.
