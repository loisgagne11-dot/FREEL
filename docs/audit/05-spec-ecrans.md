# Freel — Spécification d'implémentation des 6 écrans (build 5 / v1.11)

Sources lues intégralement pour ce rapport : `Pilote - Le Flux.html`, `pilote-flux.js`, `pilote-quickacts.js`, `activite-app.jsx`, `argent-app.jsx`, `achats-app.jsx`, `outils-app.jsx`, `config-app.jsx`, plus les 5 coquilles HTML des écrans 2-6 (survolées : elles ne contiennent que les balises `<link>`/`<script>` de chargement, un `<style>` propre à la page, et `<div id="root">` — aucune logique). Pour comprendre les mécanismes transverses invoqués par les écrans (`FreelSheet`, `FreelToast`, `FreelForms`, `FreelDocs`, le pliage de carte), extraits ciblés de `freel.js` et `freel-docs.js` (ni l'un ni l'autre n'étaient dans le périmètre exclu). N'ont pas été relus ici (périmètre d'un autre agent) : `v1.11.css`, `freel.css`, `v1.11-shell.js`, `annexe-architecture-build5.md`, `freel-etat.js`, `freel-depenses.js`. Le modèle de données et les formules canoniques cités dans ce rapport proviennent de `01-vision.md` ; ce rapport ne les re-dérive pas, il les applique écran par écran.

Convention de ce rapport : `ET.xxx` = accès à `window.FreelEtat` (store financier), `DEP.xxx` = accès à `window.FreelDepenses` (store dépenses/banque). Les noms de composants proposés sont des noms de rôle, à choisir librement par l'équipe d'implémentation — ils ne préjugent d'aucune techno.

---

## 1. Pilote — Le Flux

Fichiers : `Pilote - Le Flux.html` (structure + 11 `<template>` de détail) + `pilote-flux.js` (rendu du flux, bascule de statuts, décisions, brief) + `pilote-quickacts.js` (barre d'actions personnalisable).

### Rôle
« Combien je peux me verser, et qu'est-ce qui coince » — la décision du jour, en un coup d'œil.

### Arborescence des composants
- **PageShell**
  - **RailNav** `[réutilisable]` — logo, 6 liens de navigation (Pilote actif), pied de rail (« Livre des recettes », bloc identité « Atelier L. · Micro-BNC · ACRE », tag de build)
  - **Topbar** `[réutilisable]`
    - Navigateur de mois (« ‹ Juin 2026 › ») — ici mois seul, pas de trimestre/année comme Achats
    - Indicateur de synchro (icône cloud + pulse)
    - Sélecteur d'année
    - Bouton réglages de maquette (engrenage) → **TweakBar** (annotations fonctions, toggle « Propositions Claude Code », teinte d'accent) — outil de prototypage, **à exclure du produit final**
    - Bouton confidentialité (œil) → doit démasquer/masquer tous les éléments `.blurnum` (comportement câblé hors du périmètre lu ici, cf. `03-design-system.md`)
    - Recherche (⌘K, placeholder) — masquée `<1180px`
    - **FabMenu** `[réutilisable]` « Exporter » (CRA, factures PDF, livre CSV, FEC, JSON)
    - **FabMenu** `[réutilisable]` « Nouveau » (Mission, Facture, Encaissement, Charge, Salaire, Congés)
  - **Greet** — titre « Bonjour Loïs — quatre décisions t'attendent. », sous-titre, tag « Solde compte · {solde} »
  - **QuickActsBar** (`pilote-quickacts.js`, propre à cet écran) — chips d'actions personnalisables + bouton « + » ouvrant un menu catégorisé (Documents / Saisir / Aller à) ; ajout/retrait persistés dans `localStorage['freel-quickacts']`, **indépendant des deux stores métier**
  - **FluxCard** — carte « le flux du mois »
    - **FluxHeader** (tag « le flux du mois · juin 2026 », indice « clique un statut pour le mettre à jour »)
    - **Flux3Columns**
      - **FluxColonneEntrees** (« Entrées ») — gros chiffre `encaisse`, sous-texte `attente`, liste de **FactureLigne** togglables (une par facture)
      - **FluxColonneSorties** (« Sorties ») — gros chiffre `sortiesTotal`, sous-texte payé/à venir, liste de **EcheanceLigne** togglables (une par échéance)
      - **FluxColonneRemuneration** (« Rémunération ») — gros chiffre `remuMois`, note « hors provision » + lien vers Argent, bouton **BoutonVerser** (« Verser sur mon compte »)
    - Bascule « Voir le détail » / « Masquer le détail » (`.fluxfold`) — bascule une classe `.fluxopen` sur la carte ; **aucun contenu supplémentaire n'est présent dans le balisage lu** derrière cette bascule (voir Écarts)
  - **SanteBarCard** (carte « Santé société ») — score `78/100`, 3 indicateurs (Provisions couvertes / Factures · 1 retard / Déclarations à jour), **RunwayChip** (« 4,2 mois d'autonomie ») ; carte entière cliquable → détail
  - **DecisionsDuJourCard**
    - En-tête avec badge compteur (« X à traiter »)
    - Flux de 6 **DecisionItem** (icône, titre, description, ligne « levier », bouton d'action) : déclarer URSSAF T2 (avertissement), relancer facture #024 (urgent), provisionner URSSAF (avertissement), dépendance client Studio Lumen 58 % (avertissement), seuil TVA 86 % (neutre), CRA de mai prêt (positif)
  - **PropsSection** (« Propositions Claude Code ») — 6 cartes de modules futurs à cocher + génération d'un brief texte copiable. **Section de démonstration/roadmap destinée aux concepteurs, pas une fonctionnalité utilisateur final** — décision produit à prendre : la garder en interne (flag/route dev) ou la retirer du build production
  - **DetailSheet** (`FreelSheet`, service transverse) — panneau latéral ouvert par les 11 gabarits `<template>` : `tpl-time`, `tpl-real`, `tpl-cash`, `tpl-dispo`, `tpl-pay`, `tpl-sante`, `tpl-relance`, `tpl-prov`, `tpl-tva`, `tpl-dep`, `tpl-decl`

### Données consommées

| Champ / dérivé | Source | Format d'affichage |
|---|---|---|
| `solde` | `ET.solde` (fait) | `eur` — tag d'en-tête |
| `encaisse()` | `ET.encaisse()` (dérivé) | `eur` — colonne Entrées |
| `attente()` | `ET.attente()` (dérivé) | `eur` — sous-texte Entrées |
| `sortiesTotal()` | `ET.sortiesTotal()` (dérivé) | `eur` — colonne Sorties |
| `sortiesPayees()` / `sortiesAVenir()` | `ET.sortiesPayees()/sortiesAVenir()` (dérivés) | `eur` — sous-texte Sorties |
| `remuMois()` | `ET.remuMois()` (dérivé) — **recalculé une 2ᵉ fois côté DOM**, voir Écarts | `eur` — colonne Rémunération |
| `dispo()` | `ET.dispo()` (dérivé) | `eur` — sheet « Disponible » |
| `reserve` | `ET.reserve` (fait, réglé par curseur — **le curseur de réserve du Pilote n'apparaît pas dans le HTML lu**, voir Écarts) | `eur` |
| `versable()` | `ET.versable()` (dérivé) | `eur` — sheet « Tu peux te verser » |
| `provisions()` | `ET.provisions()` (dérivé) | `eur` — sheet Disponible/Santé |
| `urssaf/ir/cfe/cfp` | `ET.ech('urssaf'\|'ir'\|'cfe'\|'cfp').amt` (faits) | `eur` |
| `baseUrssaf` (= `baseUrssafT2`) | `ET.baseUrssafT2` (fait) | `eur` — sheet décl. URSSAF |
| `encAvril/encMai/encJuin` | `ET.encaisseMois.{avril,mai,juin}` (fait) | `eur` |
| `cotisUrssaf()/cotisCFP()/cotisIR()` | dérivés (voir formules §3.1 de `01-vision.md`) | `eur` |
| `caEncaisse` / `seuilTVA` / `margeTVA()` / `seuilTVApct()` | faits/dérivés | `eur` / `%` |
| `autonomie()` | dérivé | `X,X` mois (virgule FR) |
| Factures (`num, client, amt, state`) | `ET.factures[]` (fait) | ligne + `st-pill` statut |
| Échéances (`id, lab, amt, state`) | `ET.echeances[]` (fait) | ligne + `st-pill` statut |
| Score santé 78/100, 3 sous-scores (28/30, 20/35, 30/35) | **valeurs en dur dans le HTML**, aucune fonction `calculateHealthScore()` trouvée dans les stores lus | entier /100 |
| DSO réel 42 j vs 30 j contractuels | **en dur** (tpl-cash, tpl-sante) | jours |
| Répartition client (58 %/31 %/11 %, tpl-dep) | **en dur** | `%` |
| Occupation du mois 84 % (18,5j/22j), missions (tpl-time) | **en dur**, dupliqué depuis Activité | `%`, jours |

### Interactions

| Élément | Action utilisateur | Effet | Écrit dans le store |
|---|---|---|---|
| Ligne facture (`.fit` colonne Entrées) | clic | `toggleFit()` → `E.toggleFacture(num)`, re-rend la colonne, toast confirmant le nouveau statut | **oui** (`toggleFacture`) |
| Ligne échéance (`.fit` colonne Sorties) | clic | `toggleFit()` → `E.toggleEcheance(id)`, re-rend, toast | **oui** (`toggleEcheance`) |
| En-tête de colonne (Entrées/Sorties/Rémunération) | clic | ouvre `DetailSheet` avec le gabarit associé (`tpl-cash`/`tpl-dispo`/`tpl-pay`) | non |
| Carte Santé | clic | ouvre `tpl-sante` | non |
| Bouton « Verser sur mon compte » / « Verser maintenant » (sheet) | clic | ouvre `FreelForms.salaire` (montant pré-rempli = `versable()`) | non (ouvre un formulaire, l'enregistrement réel du versement n'est pas branché à un mutateur de store observé) |
| Bouton « Voir les chiffres » (decDecl) | clic | ouvre `tpl-decl` | non |
| Bouton « Relancer » (decRelance) | clic | `markDone('relance', …)` : grise la carte, décrémente le badge, toast, ferme la sheet si ouverte | non (pas d'écriture dans `ET`/`DEP`, l'action est un état local `done{}` volatile — perdu au rechargement) |
| Bouton « Provisionner » (decProv) | clic | `markDone('prov', …)` — même mécanique | non |
| Bouton « Voir » (decDep) | clic | ouvre `tpl-dep`, bouton interne « C'est noté » → `markDone('dep', …)` | non |
| Bouton « Voir » (decTva) | clic | ouvre `tpl-tva` | non |
| Bouton « Envoyer » (decCra) | clic | `markDone('cra', …)` | non |
| Badge « X à traiter » | — | recalculé sur 4 des 6 décisions seulement (`relance,prov,dep,decl` — `cra` et `tva` n'y contribuent jamais) ; devient « tout est traité » (chip vert) quand les 4 sont faites | non |
| Chips d'actions rapides + bouton « + » | clic sur un chip / ajout-retrait | exécute l'action déléguée (mêmes `data-new`/`data-export` que la topbar) ; ajout/retrait persistés | non (persistance `localStorage['freel-quickacts']`, hors des 2 stores) |
| Bouton engrenage (réglages maquette) | clic | ouvre/ferme la `TweakBar` | non — **outil de prototypage, pas un réglage produit** |
| Cases à cocher des propositions Claude Code | clic | sélection visuelle + compteur « X retenu(s) » | non |
| « Copier le brief Claude Code » | clic | construit un texte Markdown et le copie dans le presse-papiers | non |

### Comportement responsive
Comportement global du rail/dock (seuil 760px, zéro débordement à 390px) : voir `03-design-system.md`, non re-dérivé ici.
Ruptures propres à cet écran, observées dans le `<style>` de `Pilote - Le Flux.html` :
- `≤1180px` : la barre de recherche et l'indicateur « Synchronisé » disparaissent de la topbar (gain de place).
- `≤1080px` : la grille de simulateur « Et si ? » (`.simgrid`, 4 colonnes) passe à 2 colonnes ; la grille des propositions Claude Code (`.propgrid`, 3 colonnes) passe à 2.
- `≤900px` : les 3 colonnes du Flux (`flux3`) s'empilent verticalement en 1 colonne ; la séparation verticale entre colonnes devient une bordure horizontale.
- `≤720px` : la grille des propositions Claude Code repasse à 1 colonne.
- Le conteneur `.fluxscroll`/`.fluxviz` (visualisation « rivière », si utilisée ailleurs dans le build) prévoit un `overflow-x:auto` avec `min-width:640px` — indique qu'une variante graphique du flux existe ou a existé, distincte des 3 colonnes actuellement affichées (voir Écarts).

### États
- **Décisions du jour — état vide** : *défini* — quand les 4 décisions actionnables sont traitées, le badge passe de `warn` « X à traiter » à `ok` « tout est traité ».
- **Chargement** : non défini par le prototype — à concevoir (aucun état de chargement observé dans `pilote-flux.js`, tout est synchrone depuis `localStorage`). Proposition : squelette de la FluxCard + des KPI pendant l'hydratation initiale du store.
- **Erreur** : non défini par le prototype — à concevoir. Proposition : si le store ne peut être lu (JSON corrompu), retomber sur les valeurs par défaut de `FACTS` et afficher un bandeau discret « données de secours utilisées ».
- **Alerte** : partiellement défini — sévérité par item de décision (`warn`/`urgent`/`good`/neutre), badge de compteur, mais **aucun style de décisions n'est piloté par le seuil « alerte à 85 % » configuré dans Config** (`decTva` affiche 86 % en dur avec la classe `warn`, sans lien avec le réglage) : à câbler.

### Écarts et ambiguïtés
- **Deux gabarits orphelins** : `tpl-time` (occupation du mois, missions, TJM) et `tpl-real` (CA réalisé par mission) sont définis en fin de fichier (lignes 520-537) mais **aucun élément visible n'ouvre `data-sheet="tpl-time"` ou `data-sheet="tpl-real"`** — seuls `tpl-cash`, `tpl-dispo`, `tpl-pay`, `tpl-sante`, `tpl-decl`, `tpl-relance`, `tpl-dep`, `tpl-tva` sont réellement déclenchés. Vestige probable d'une version antérieure du Flux à 5 colonnes (un fichier `Flux - 5 pistes.html` existe dans le même dossier, hors périmètre de lecture) — à trancher : les rebrancher ou les supprimer.
- **Recalcul dupliqué de `remuMois()`** : `pilote-flux.js:37-54` (fonctions `tally()`/`recompute()`) additionne les `data-amt`/`data-state` du DOM pour reconstituer `payMain = max(0, entrées payées − sorties totales)` **au lieu d'appeler `E.remuMois()`, `E.encaisse()`, `E.sortiesTotal()` directement** après chaque bascule. La formule est aujourd'hui identique à celle du store, mais c'est exactement le schéma qui a produit l'incohérence 3 010 €/3 180 € citée par l'annexe. À l'implémentation compilée : supprimer ce recalcul DOM et relire les getters du store après chaque `toggle*`.
- **Bouton « Voir le détail » sans contenu observé** : la bascule `.fluxfold`/`.fluxopen` (ligne 376) ne révèle aucun bloc supplémentaire dans le balisage lu — son effet visuel dépend peut-être uniquement de CSS non lu (`v1.11.css`) ; à vérifier auprès de l'agent design-system, sinon fonctionnalité incomplète.
- **Score santé et sous-scores 100 % en dur** : `78/100`, `28/30`, `20/35`, `30/35` ne correspondent à aucune fonction dans les stores lus (`calculateHealthScore()` est citée en commentaire (`<span class="fn">`) mais n'existe dans aucun fichier consulté) — à concevoir entièrement en production.
- **« Réserve matelas gardée » se règle « sur le Pilote » (texte de `tpl-pay`) mais aucun curseur de réserve n'apparaît dans le balisage HTML lu** de cet écran — contredit `01-vision.md §4.1` qui mentionne un curseur. Soit le curseur est généré dynamiquement par `pilote-flux.js` (non trouvé dans le fichier lu), soit il a été retiré de cette itération sans mise à jour du texte des sheets. **Décision requise avant implémentation** : où vit réellement le curseur de réserve (voir aussi Écart transverse Config/Argent ci-dessous).
- **`decRelance` avance une date de rupture de trésorerie (« solde passe sous 5 000 € le 22 juin ») entièrement en dur** — aucune fonction de projection n'existe dans les stores ; le module roadmap « Prévision probabiliste » proposé plus bas dans la même page promet justement de construire ce calcul — signal que cette phrase est un mock délibéré d'une fonctionnalité pas encore implémentée.
- **Propositions Claude Code** : section entière à statut ambigu — utile en contexte de conception, mais sa présence dans un écran de production destiné à l'utilisateur final de Freel est probablement non désirée. Décision produit à prendre.

---

## 2. Activité & congés — Plan de charge

Fichier : `activite-app.jsx`. **N'inclut ni `freel-etat.js` ni `freel-depenses.js`** dans sa coquille HTML au moment du calendrier/missions/factures — en réalité si (le shell charge les deux scripts), mais aucune donnée de cet écran ne les lit : tout le modèle (`sched`, missions, factures, clients) est **local à cet écran**, propre et indépendant des deux stores.

### Rôle
Missions, calendrier, congés, CRA — « où en est mon occupation, et que dois-je facturer/déclarer ».

### Arborescence des composants
- **PageShell** (RailNav `[réutilisable]`, Topbar `[réutilisable]` avec FabMenu Exporter/Nouveau `[réutilisable]`)
- **Greet** — titre « Ton plan de charge », tag « {jours travaillés} j travaillés · {occ}% occupé »
- **SubTabs** (`plan` / `missions` / `factures` / `clients`) — 4 onglets, dont 3 portent un compteur (`cnt`)
- **Onglet Plan de charge** (`PlanDeCharge`)
  - **CalCard**
    - En-tête : titre vue (Semaine/Mois), sous-titre, compteur « X j ouvrés »
    - **WeekNav** (semaine seulement) — précédent/suivant
    - **ViewSwitch** (Semaine/Mois)
    - **WeekView** — grille 7 jours × 2 créneaux (matin/après-midi), chaque **Slot** cliquable (libre/mission/congé/indispo), icône de lieu (télétravail/site/mixte)
    - **MonthView** — grille calendaire complète, chaque case = 2 mini-créneaux compacts + icône lieu
    - **Legend** — 1 entrée par client + congé + télétravail/sur site
  - **IndicatorColumn** (`icol`)
    - **IndicatorCard** (« Le mois en chiffres ») — jours travaillés, CA généré, occupation (barre + %), répartition par client (barre segmentée + légende), % télétravail
    - **CraCard** — pitch + bouton « Générer le CRA · juin » → `FreelDocs.cra()`
    - **IntelCard** (« Ce que Freel remarque ») — 3 à 5 **IntelNote** générées par `buildIntel()` : demi-journées libres, niveau d'occupation, dépendance client, congés déduits
- **SlotEditor** (modale) — ouverte au clic sur un créneau ou une case du mois : segments Matin/Après-midi/Journée, type (Travail/Congé/Indispo/Libre), si Travail : client (chips), mission (select dépendant du client), lieu (3 boutons)
- **Onglet Missions** (`Missions`) — table `[réutilisable pattern DataTable]` : filtres (Toutes/Actives/Prospect/Perdues avec compteurs), colonnes client+mission / statut / avancement / CA mission / actions (modifier via `FreelDocs.mission()`, facturer)
- **Onglet Factures** (`Factures`) — table : 6 lignes démo, colonnes n°/client/période/montant HT/encaissé/statut/action ; bandeau « encaisser » → `FreelDocs.encaissement()`
- **Onglet Clients** (`Clients`) — 3 **ClientCard** : CA, % du CA, DSO réel vs contractuel (coloré si dépassement), note qualitative
- **Composant orphelin `Charges()`** — défini dans le fichier mais **jamais monté** (aucun onglet ne pointe dessus), voir Écarts

### Données consommées

| Champ / dérivé | Source | Format d'affichage |
|---|---|---|
| `sched` (planning du mois, clé `YYYY-MM-DD` → `{am,pm}`) | `localStorage['freel_activite_v2']`, seedé par `seed()` si absent — **store propre à l'écran, pas `ET`/`DEP`** | grille de créneaux |
| `worked`, `conge`, `ouvres`, `occ` (%), `homePct` (%) | dérivés locaux `computeMonth(sched)` | entier `j` / `%` |
| `ca` (= `worked × TJM`, `TJM=520` en dur) | dérivé local | `X.toLocaleString('fr-FR') €` (pas d'arrondi à 10 €, ni `eur`/`eurR` du store) |
| Répartition par client (`byClient`) | dérivé local | barre segmentée + `X j` par client |
| Missions (statut, avancement, CA) | **tableau `rows` en dur** dans `Missions()`, aucun store | texte / `chip2` / `X j / Y j` / `X XXX €` |
| Factures (n°, client, période, montant, encaissé, statut) | **tableau `rows` en dur** dans `Factures()` — **redondant avec `ET.factures[]` mais non synchronisé** (voir Écarts) | table |
| Clients (CA, % CA, DSO réel/contractuel, note) | **tableau `data` en dur** dans `Clients()` | `X XXX €`, `%`, `X j` |
| `TJM` | constante en dur `520` (aucun fait `tjm` dans `ET`) | `€` |
| `CL` (référentiel 4 clients : nom, couleur, missions) | constante en dur dans le fichier | — |

### Interactions

| Élément | Action utilisateur | Effet | Écrit dans le store |
|---|---|---|---|
| Créneau (matin/après-midi) en vue Semaine | clic | ouvre `SlotEditor` pré-rempli sur ce créneau | non (ouvre seulement) |
| Case du mois en vue Mois | clic | ouvre `SlotEditor` sur la journée entière (`which:'day'`) | non |
| `SlotEditor` → segment (Matin/Après-midi/Journée) | clic | change quel(s) créneau(x) seront affectés à l'enregistrement | non |
| `SlotEditor` → type (Travail/Congé/Indispo/Libre) | clic | affiche/masque les champs client/mission/lieu | non |
| `SlotEditor` → « Enregistrer » | clic | `applySlot()` met à jour `sched` en state React, toast de confirmation, ferme la modale | **oui, mais dans le store local `sched` (localStorage `freel_activite_v2`), pas dans `ET`** |
| Onglets Semaine/Mois | clic | change la vue du calendrier | non |
| Navigation semaine (‹ ›) | clic | change la semaine affichée (`wk`) | non |
| Bouton « Générer le CRA · juin » | clic | ouvre `FreelDocs.cra()` (éditeur complet, hors périmètre) | non (le CRA n'écrit dans aucun store lu ici) |
| Arrivée avec `#conge` dans l'URL | navigation | ouvre directement `SlotEditor` forcé sur `type:'conge'`, jour du jour courant — **point d'entrée utilisé par le chip « Poser des congés » du Pilote** | non |
| Filtres de statut (Missions) | clic | filtre visuellement la table (aucun état de filtre actif observé dans le code lu au-delà de l'affichage — à vérifier : le clic ne semble pas relié à un `onClick`, voir Écarts) | non |
| Bouton « Nouvelle mission »/« Nouvelle facture » | clic | `data-new="mission"`/`"facture"` — délégué au mécanisme global `FreelForms` (pas de handler React local observé) | non |
| Icône crayon (ligne Missions) | clic | ouvre `FreelDocs.mission({client, nom})` pré-rempli | non |
| Bouton « Encaisser » (Factures) | clic | ouvre `FreelDocs.encaissement()` | non |

### Comportement responsive
Rail/dock global : voir `03-design-system.md`.
Ruptures propres à cet écran (`<style>` de la coquille) :
- `≤1080px` : `planwrap` (grille calendrier + colonne d'indicateurs) passe de 2 colonnes à 1 — la colonne d'indicateurs (Le mois en chiffres / CRA / Ce que Freel remarque) descend sous le calendrier.
- `≤900px` : les cartes `span6/span4/span8` (utilisées par l'onglet Clients, 3 cartes en `span4`) repassent en pleine largeur (`span12`), empilées.
- **Non spécifié dans les fichiers lus** : le comportement de la grille `WeekView` (7 colonnes fixes) et `MonthView` (7 colonnes fixes) en portrait ≤760px — aucune règle de repli (scroll horizontal ? jours empilés ? vue jour unique ?) n'apparaît dans le `<style>` de la coquille ni dans le JSX. À concevoir explicitement — c'est l'élément le plus à risque de débordement horizontal à 390px sur tout le produit.

### États
- Non défini par le prototype pour l'ensemble de l'écran (aucun état vide/chargement/erreur dans le JSX — tous les tableaux `rows`/`data` sont non vides en dur). À concevoir :
  - **Vide** : mois sans aucune saisie → calendrier entièrement en « libre », indicateurs à 0 %, IntelCard n'affiche alors que la note « demi-journées libres » (mécanique déjà présente puisqu'elle compte les créneaux vides — mais avec `free = tous les créneaux`, jamais testé à l'extrême).
  - **Chargement** : à concevoir (hydratation du planning + des missions/factures/clients depuis leur futur store réel).
  - **Erreur** : à concevoir (échec de sauvegarde du planning en `localStorage`, ex. quota dépassé).

### Écarts et ambiguïtés
- **`Charges()` est du code mort** : la fonction est définie (lignes 654-688, cartes « Charges récurrentes » et « Ce mois ») mais **aucun onglet ne la monte** — la liste `SubTabs` ne contient que `plan/missions/factures/clients`. Soit un 5ᵉ onglet « Charges » a été retiré sans nettoyer le code, soit son contenu a été déplacé vers Achats (probable, vu le chevauchement conceptuel avec le registre des achats) et l'agent a oublié de supprimer la fonction. À trancher avant implémentation : recréer l'onglet, ou supprimer définitivement ce composant.
- **Factures dupliquées et désynchronisées entre écrans** : la table `Factures()` de cet écran contient 6 lignes en dur, distinctes du tableau `ET.factures[]` (4 entrées) lu par Pilote/Argent. Les deux listes ne peuvent pas diverger dans le prototype (aucune des deux ne modifie l'autre) mais représentent la même notion métier (factures émises) avec deux sources différentes — à unifier sur `ET.factures[]` (probablement étendu) en production.
- **CA généré (`worked × TJM`) n'utilise pas les fonctions de formatage du store** (`eur`/`eurR` de `ET`) — il utilise `toLocaleString('fr-FR')+' €'` local, sans l'arrondi à 10 € appliqué ailleurs aux montants « au rythme ». Incohérence de règle d'arrondi à corriger.
- **Filtres de statut Missions (`Toutes/Actives/Prospect/Perdues`) semblent décoratifs** : le composant `Missions()` définit `<span className="filt on">…</span>` sans état React ni `onClick` associé dans le fichier lu — à vérifier/compléter, sinon ils n'ont aucun effet.
- **Aucun lien vers le store financier** : les CA de mission (« CA mission » dans Missions, « montant HT » dans Factures) ne se retrouvent dans aucun dérivé de `ET` (`caRealise`, `caEncaisse`) de façon vérifiable — l'implémentation devra décider si Activité *alimente* `ET` (les missions génèrent les factures qui alimentent `caRealise`) ou si les deux restent indépendants, ce qui semble contraire à l'esprit « source unique » de l'annexe.

---

## 3. Argent — Trésorerie & Performance

Fichier : `argent-app.jsx`. Charge bien `freel-etat.js` et `freel-depenses.js` (confirmé dans la coquille HTML).

### Rôle
La vérité longue durée : « ce que j'ai là, pour de vrai » (Trésorerie) et « ce que mon activité génère » (Performance).

### Arborescence des composants
- **PageShell** (RailNav `[réutilisable]`, Topbar `[réutilisable]` avec FabMenu Exporter/Nouveau `[réutilisable]`)
- **Greet** — titre « Ton argent », tag « Provisions · 100% couvertes » (**en dur**, voir Écarts)
- **PillarSwitch** — 2 gros boutons Trésorerie / Performance, chacun affichant un chiffre-clé en aperçu (`{eur(DISPO)}` **constante locale en dur**, `{ET.keur(ET.caRealise)}` — incohérence de source entre les deux boutons, voir Écarts)
- **Onglet Trésorerie** (`Tresorerie`)
  - **KpiRow** `[réutilisable]` (4 `KpiTile`) : Solde du compte, Disponible, À encaisser, Autonomie
  - **FluxChart** (« Évolution du compte ») — courbe de solde (7 mois, SVG), barres entrées/sorties par mois, ligne de seuil 5 000 €, clic sur un mois → **FlowModal**
  - **FoldableCard** `[réutilisable]` « Ton solde n'est pas tout à toi » — **DonutSolde** (répartition conique versable/réserve/provisions) + légende interactive (survol = surbrillance) + phrase de synthèse
  - **FoldableCard** « Enveloppes de provision — combien est mis de côté » — 4 **EnvelopeTile** (URSSAF, Impôt revenu, TVA à venir, Réserve matelas), jauge de remplissage en pied de carte, clic → **DrillModal** (détail `PROV_DETAIL`) ou **TvaModal** (pour l'enveloppe TVA)
  - **FoldableCard** « Seuils — où j'en suis » — 2 **Gauge** (plafond micro-BNC, franchise TVA), résumé plié **en dur** (voir Écarts)
  - **FoldableCard** « Échéancier & obligations 2026 » — **TimelineEcheancier** (bande annotée, légende couleur par type de charge, 6 **EcheanceMarker** avec infobulle), clic → ouvre le détail pertinent (URSSAF → `DeclarationUrssaf`, TVA → `TvaModal`, sinon toast)
- **Onglet Performance** (`Performance`)
  - **KpiRow** (4 tuiles) : CA réalisé 2026, CA encaissé, À encaisser, Résultat projeté (`~46 k€`, **en dur**)
  - **BarChart** « CA réalisé vs encaissé » (6 mois, barres jumelées, clic sur un mois → change la sélection) + **CompositionPanel** (détail du mois sélectionné : lignes réalisé / lignes encaissé / écart)
  - **VersementCard** (« Tu peux te verser ») — curseur % réserve (0-80 %, pas 5), calcul local `versable = round(DISPO×(1-pct/100)/10)×10`, bouton « Enregistrer le versement »
  - **CapaciteBarChart** (« Capacité de versement par mois ») — 9 mois (barre = capacité, remplissage = versé), 3 mois marqués `proj` (projetés)
- **Modales** (`ModalDialog` `[réutilisable]`) : **FlowModal** (composition d'un mois du flux), **DeclarationUrssaf** (chiffres de démo pour la déclaration trimestrielle), **TvaModal** (dossier TVA réel, lit `DEP.summary()`), **DrillModal** (détail d'une enveloppe de provision, table `tbl3`)

### Données consommées

| Champ / dérivé | Source | Format d'affichage |
|---|---|---|
| `ET.solde` | fait | `eur` — KPI + donut |
| `ET.dispo()` | dérivé | `eur` — KPI + pillar Trésorerie (mais le bouton pilier utilise `DISPO` **en dur**, voir Écarts) |
| `ET.attente()` | dérivé | `eur` — KPI « À encaisser » (2 onglets) |
| `ET.autonomie()` | dérivé | `X,X mois` (remplacement du point par une virgule) |
| `ET.versable()`, `ET.reserve`, `ET.provisions()` | dérivé + fait + dérivé | `eur` — répartition du donut (`REPART`) |
| `ET.seuilBNCpct()`, `ET.seuilTVApct()`, `ET.caEncaisse`, `ET.seuilBNC`, `ET.seuilTVA`, `ET.caProjection` | dérivés/faits | `%`, `eur` — cartes Seuils |
| `ET.ech('urssaf'\|'ir').amt` | faits | `eur` — cibles des enveloppes (`ENVS[].tgt`) |
| Montant déjà provisionné par enveloppe (`ENVS[].amt` : 1980/380/200/1200) | **constantes en dur**, sauf l'enveloppe `urssaf` qui reprend `ET.ech('urssaf').amt` (100 % « couvert » par construction) | `eur` |
| `ET.keur(ET.caRealise)` | dérivé | `k€` — aperçu pilier Performance |
| `CA[]` (CA mensuel réalisé/encaissé, 6 mois, k€) | **constante en dur**, aucune fonction du store ne fournit d'historique mensuel | `X,X k€` |
| `COMPO{}` (composition détaillée par mois) | **constante en dur** | lignes `eur` |
| `CAP[]` (capacité de versement mensuelle + % versé) | **constante en dur** | `X,Xk` / barre `%` |
| `FLOW[]` (entrées/sorties détaillées, 7 mois) | **constante en dur**, base du calcul de `flowRows()` (solde cumulé depuis `8120` en dur) | `eur`/`k€`, courbe SVG |
| `FISCAL[]`/`FSTAT` (échéancier 2026, statuts `payee/adecl/watch/todo`) | **constante en dur** | libellé + couleur par type |
| `TVA_COLLECTEE`/`TVA_DEDUCTIBLE` (démo « une fois assujetti ») | **constantes en dur** | `eur` |
| `DEP.summary(period,'tous')` (dans `TvaModal`) | dérivé réel du store dépenses | `eur`, liste de dépenses avec `piece`/`recon` |
| `SOLDE=8120`, `DISPO=4940` | **constantes locales en dur**, dupliquent `ET.solde`/`ET.dispo()` | `eur` |

### Interactions

| Élément | Action utilisateur | Effet | Écrit dans le store |
|---|---|---|---|
| Bouton pilier Trésorerie/Performance | clic | change `tab`, affiche l'onglet correspondant | non |
| Légende du donut (survol) | survol souris | surbrillance de la part correspondante (`hot` state) | non |
| Enveloppe de provision (clic) | clic | ouvre `DrillModal` (`PROV_DETAIL[id]`), sauf `tva` → ouvre `TvaModal` | non |
| Marqueur de l'échéancier | clic | selon `kind` : `urssaf`→`DeclarationUrssaf`, `tva`→`TvaModal`, sinon toast informatif | non |
| Mois du `FluxChart` | clic | ouvre `FlowModal` avec le détail entrées/sorties de ce mois | non |
| Mois du `BarChart` Performance | clic | change `sel`, met à jour `CompositionPanel` | non |
| Curseur réserve % (Performance → « Tu peux te verser ») | glisser | recalcule localement `versable` (formule locale, pas `ET.versable()`) | non — **aucune écriture dans `ET.reserve`**, voir Écarts |
| Bouton « Enregistrer le versement » | clic | toast de confirmation uniquement | non (aucun mutateur de solde/versement identifié dans les stores lus) |
| `DeclarationUrssaf` → « Déclarer sur autoentrepreneur.urssaf.fr » | clic | ouvre un nouvel onglet externe | non |
| `TvaModal` → sélecteur de trimestre/année | clic | change la période, relit `DEP.summary(p,'tous')` | non |
| `TvaModal` → « Justificatifs (ZIP) » / « Voir les pièces » | clic | toast (ZIP) / navigation vers Achats | non |
| `TvaModal` → « Préparer la télédéclaration » | clic | toast + ferme la modale | non |
| Menu Export → « Détail des provisions » | clic | ouvre `DrillModal` (`urssaf` par défaut) | non |

### Comportement responsive
Rail/dock global : voir `03-design-system.md`.
Ruptures propres à cet écran :
- `≤900px` : `KpiRow` (`.kpis2`, 4 tuiles) passe de 4 à 2 colonnes (sur les deux onglets).
- `≤1000px` : toutes les cellules de grille `s8/s7/s5/s6/s4` repassent en pleine largeur (`span12`) et s'empilent — concerne `FluxChart`, le donut, les enveloppes, les seuils, l'échéancier (Trésorerie) et le `BarChart`/`CompositionPanel`/`VersementCard`/`CapaciteBarChart` (Performance).
- `≤720px` : la grille `seuils2` (2 jauges côte à côte) passe à 1 colonne, empilée avec un espacement augmenté (`gap:20px`).

### États
- Non défini par le prototype pour l'essentiel — à concevoir :
  - **Vide** : `TvaModal` définit un cas réel — « Aucune dépense avec TVA sur cette période » quand `s.items.filter(e=>e.tva>0).length===0`. C'est le seul état vide observé sur cet écran ; à généraliser aux autres cartes (ex. échéancier sans obligation sur la période, enveloppes toutes à 0).
  - **Chargement** : non défini — à concevoir.
  - **Erreur** : non défini — à concevoir.
  - **Alerte** : la classe CSS `.risk` sur une enveloppe (`e.st` non vide) et les couleurs `FSTAT` constituent une alerte visuelle déjà modélisée ; mais rien ne relie ce niveau au seuil « 85 % » configurable dans Config (voir Pilote, même écart).

### Écarts et ambiguïtés
- **Résumé plié en dur et faux** : la carte « Seuils » affiche, repliée, `"Micro-BNC 69 % (53 600 / 77 700 €) · franchise TVA 86 % — bascule estimée sept."` (ligne 281) — avec `ET.caEncaisse=32 400`, le vrai pourcentage BNC est 42 %, pas 69 %, et la base (53 600 €) ne correspond à aucun fait du store. Confirmé et déjà signalé par `01-vision.md` (zone d'ombre n°12) — à corriger en calculant ce résumé depuis `ET.seuilBNCpct()`/`ET.seuilTVApct()` réels, pas un texte figé.
- **`SOLDE`/`DISPO` locaux vs `ET.solde`/`ET.dispo()`** : le composant `App` (ligne 45) déclare `const SOLDE=8120, DISPO=4940` et les utilise pour le bouton pilier Trésorerie (`eur(DISPO)`, ligne 196) et pour tout l'onglet Performance (`versable`, `KpiRow`), alors que l'onglet Trésorerie lui-même lit `ET.solde`/`ET.dispo()` (lignes 229-230). Les deux valeurs coïncident aujourd'hui par construction des données de démo, mais ce sont **deux sources distinctes pour la même notion** — exactement le schéma que l'annexe demande d'éliminer. À l'implémentation : supprimer les constantes locales, tout lire depuis `ET`.
- **Troisième mécanisme de « réserve »** : le curseur % de la carte « Tu peux te verser » (Performance, ligne 332-405) calcule `versable = round(DISPO×(1-pct/100)/10)×10` **sans jamais écrire dans `ET.reserve`** ni le lire — un troisième calcul de réserve, distinct à la fois du fait `ET.reserve` (montant absolu, Pilote) et du curseur % de Config (`keep/vers`, voir écran 6). **Trois implémentations concurrentes de la même idée** (réserve en montant sur Pilote, réserve en % sur Argent-Performance, réserve en % sur Config) à unifier avant de coder quoi que ce soit — décision produit bloquante.
- **Taux de cotisation URSSAF, une 3ᵉ et 4ᵉ variante sur ce seul écran** : `PROV_DETAIL.urssaf` affiche « Cotisations (10,6 %) » (ligne 90) alors que `DeclarationUrssaf` affiche « 11,6 % · taux ACRE » (ligne 512, 533) — ni l'un ni l'autre ne correspond aux 21,2 % canoniques de `ET.cotisUrssaf()` affichés sur Pilote. Cet écran contient donc, à lui seul, 2 des 4 valeurs concurrentes déjà cataloguées par `01-vision.md` §3.4/§7.1. Confirme qu'une décision d'arbitrage unique est nécessaire avant toute implémentation de calcul de cotisations.
- **CA mensuel, composition, capacité de versement et flux détaillé mensuel (`CA`, `COMPO`, `CAP`, `FLOW`) sont 4 jeux de données entièrement en dur**, sans équivalent dans `FreelEtat` (qui n'expose que des agrégats annuels `caRealise/caEncaisse/caProjection`, pas d'historique mensuel). Il manque un modèle de données « CA et flux par mois » pour rendre ces 4 visualisations réellement dynamiques — évolution de store à prévoir avant que Performance et le graphe de trésorerie soient autre chose qu'une démo figée.
- **« Provisions · 100% couvertes » (tag d'en-tête)** : chiffre en dur, alors que l'enveloppe `ir` affiche elle-même un statut `warn` (couverture partielle) — contradiction interne à l'écran, à corriger en dérivant ce tag de l'état réel des enveloppes.
- **Cartes « rendement » et « dépendance client »** annoncées par l'annexe pour l'onglet Performance : **confirmé absentes de cet écran** après lecture intégrale. La carte de rendement (intérêts du compte pro) est en réalité dans **Outils → Compte pro & banque** (« Rendement du compte pro ») ; la dépendance client apparaît dans **Pilote** (décision `decDep`) et dans **Activité → Clients** (répartition %/DSO). Zone d'ombre n°10 de `01-vision.md` résolue par cette lecture complète : ce ne sont pas des cartes manquantes, mais des cartes mal placées par l'annexe dans sa description d'Argent.

---

## 4. Achats — Justificatifs & Banque

Fichier : `achats-app.jsx`. Store principal : `DEP` (`FreelDepenses`).

### Rôle
La conformité : chaque dépense déductible a sa pièce, chaque opération bancaire est rapprochée.

### Arborescence des composants
- **PageShell** (RailNav `[réutilisable]`, Topbar `[réutilisable]` simplifiée — pas de sélecteur de mois natif, remplacé par **PeriodBar**)
- **Greet** — titre « Achats & justificatifs » + bouton info, tag d'alerte (« X justificatif(s) manquant(s) » ou « Tout est justifié ✓ »)
- **PeriodBar** (propre à cet écran, mais contrat de données réutilisé ailleurs — voir Composants transverses)
  - **PeriodSegment** — Mois / Trimestre / Année / Tout, avec navigation ‹ › (masquée sur « Tout »)
  - **AccountSegment** — Tous / pro / old / perso (depuis `DEP.ACCOUNTS`)
- **KpiRow** `[réutilisable]` (4 `KpiTile`, 2 avec variante `alert`) : Dépenses de la période, TVA déductible, À rapprocher, Justificatifs manquants
- **ReconCard** (« Rapprochement bancaire ») `[FoldableCard]`
  - Section « Opérations du compte sans dépense associée » — une **BankOpRow** par opération (`DEP.openBank()`), bouton contextuel selon `kind` (facture/achat/new)
  - Section « Dépenses saisies en attente de leur opération bancaire » — une **PendingExpenseRow** par dépense (`DEP.pendingList()`)
  - État vide : « Chaque opération du compte est reliée à une facture ou à une dépense justifiée. ✓ »
- **RegistreCard** (« Registre des achats — {période} ») `[FoldableCard]`
  - **DataTable** (`atbl`) — colonnes Date/Fournisseur/TTC/dont TVA/Justificatif/Rapprochement/Compte, une **AchatRow** cliquable par dépense
  - Ligne de total (`tfoot`)
  - Bandeau dépenses récurrentes (si `recTotal>0`)
  - Bandeau « handoff TVA » vers Argent
- **Modales** (`ModalDialog` `[réutilisable]`) : **NewDepense** (formulaire de saisie), **AchatModal** (détail + confirmation de pièce), **FromBank** (créer/relier depuis une opération bancaire), **LinkModal** (relier une dépense en attente)

### Données consommées

| Champ / dérivé | Source | Format d'affichage |
|---|---|---|
| `DEP.filter(period,acct)` → liste de dépenses | dérivé réel | table |
| `DEP.summary(period,acct)` → `{n, ttc, tva, recov, blocked, missing, pending}` | dérivé réel | `eur2` (2 décimales) pour TTC/TVA, entiers pour compteurs |
| `DEP.openBank()` / `DEP.pendingList()` | dérivés réels | listes de rapprochement |
| `DEP.periodLabel(period)` | dérivé réel | libellé de période (ex. « Juin 2026 ») |
| `DEP.account(acct)` / `DEP.ACCOUNTS` | faits | badge court (`ac.short`), libellé complet |
| `DEP.CATS` (10 catégories) | fait (référentiel) | select |
| `a.piece` (bool) | fait | pastille « pièce jointe » / « à joindre » |
| `a.recon` (`matched/pending/nobank`) | fait, jamais deviné | pastille `RECON[recon]` |
| `DEP.findMatch(e)` | dérivé réel | texte de suggestion dans `PendingExpenseRow` |
| Montant TVA calculé à la saisie (`ttc/1.2×0.2`) | calcul local dans `NewDepense`/`FromBank`, débrayable par toggle | `eur2` |

### Interactions

| Élément | Action utilisateur | Effet | Écrit dans le store |
|---|---|---|---|
| Segment de période (Mois/Trimestre/Année/Tout) | clic | réinitialise `period` sur la valeur canonique du type choisi (ex. Trimestre → T2 2026) | non |
| Flèches ‹ › | clic | fait avancer/reculer `period` d'une unité (mois, trimestre ou année) | non |
| Segment de compte | clic | filtre `acct` | non |
| Ligne du registre | clic | ouvre `AchatModal` | non |
| Opération bancaire, bouton « Associer » (facture) | clic | `DEP.closeBank(id)` + toast | **oui** |
| Opération bancaire, bouton « Relier »/« Créer la dépense » | clic | ouvre `FromBank` | non |
| `FromBank` → candidat compatible, « Relier » | clic | `DEP.link(expId,bankId)` + toast + ferme | **oui** |
| `FromBank` → « Créer & rapprocher » | clic | `DEP.add()` puis `DEP.link()` + toast + ferme | **oui (double écriture)** |
| Dépense en attente, « Relier » | clic | ouvre `LinkModal` | non |
| Dépense en attente, « Hors compte » | clic | `DEP.markNoBank(id)` + toast | **oui** |
| `LinkModal` → opération candidate, « Relier » | clic | `DEP.link(expId,bankId)` + toast + ferme | **oui** |
| `LinkModal` → « Payée hors compte synchronisé » | clic | `DEP.markNoBank(expId)` + toast + ferme | **oui** |
| `NewDepense` → champs (date, montant, fournisseur, catégorie, compte, TVA on/off, récurrente, pièce) | saisie | calcule la TVA en direct si toggle actif ; affiche une note contextuelle selon la synchro du compte choisi | non (jusqu'à l'enregistrement) |
| `NewDepense` → « Enregistrer la dépense » | clic | valide (fournisseur + montant requis, sinon toast d'avertissement et **aucune écriture**) puis `DEP.add()`, et `DEP.link()` si un rapprochement a été trouvé automatiquement | **oui** |
| `AchatModal` → « Relier à une opération » / « Payé hors compte » | clic | ouvre `LinkModal` / `DEP.markNoBank(id)` | non / **oui** |
| `AchatModal` → « Confirmer le justificatif » | clic | `DEP.attachPiece(id)` + toast + ferme | **oui** |
| Menu Export → « Justificatifs (ZIP) » / « Journal des achats (CSV) » | clic | toast uniquement — **aucune génération de fichier réelle** | non |
| Menu Nouveau → « Importer une facture (Drive) » | clic | toast uniquement — **non implémenté** | non |
| Paramètre URL `?new=depense` | navigation | ouvre `NewDepense` automatiquement à l'arrivée (point d'entrée utilisé par les chips Pilote « Ajouter une dépense »/« Déposer un justificatif ») | non |

### Comportement responsive
Rail/dock global : voir `03-design-system.md`.
Ruptures propres à cet écran :
- `≤900px` : `KpiRow` (4 tuiles) passe à 2 colonnes.
- `≤1000px` : les cellules `s8/s7/s5/s4` repassent en pleine largeur.
- Le tableau du registre est déjà enveloppé dans un conteneur `.tblscroll` dédié (`overflow-x` anticipé dans le JSX lui-même, ligne 153) — bon signal pour éviter le débordement horizontal à 390px, à confirmer avec les styles réels (`03-design-system.md`).
- Sur la topbar, le libellé des boutons Export/Nouveau est déjà encapsulé dans un `<span className="lbl-t">` séparé du texte constant — suggère que le libellé texte peut être masqué en dessous d'un certain seuil pour ne garder que l'icône (mécanisme à confirmer avec le design-system).

### États
- **Vide** : *défini* à deux endroits — table du registre (« Aucune dépense sur cette période. ») et `LinkModal` (« Aucune opération non rapprochée sur le compte… »), plus le message de succès du `ReconCard` quand tout est rapproché.
- **Erreur / validation** : *défini* — `NewDepense.save()` bloque l'enregistrement et affiche un toast d'avertissement (« Fournisseur et montant sont requis ») si les champs obligatoires manquent.
- **Chargement** : non défini par le prototype — à concevoir (toutes les données sont lues de façon synchrone depuis `localStorage`).
- **Alerte** : *défini* — variante `.alert` sur les `KpiTile` « À rapprocher » et « Justificatifs manquants » dès que leur valeur est > 0 ; pastille « pièce manquante » par ligne.

### Écarts et ambiguïtés
- **Message de confirmation en dur mentionnant la « facture #023 »** (`ReconCard`, bouton « Associer », ligne 269 : `FreelToast('Facture #023 rapprochée → encaissée le 04/06','ok')`) — ce texte est indépendant de l'opération réellement cliquée (`b.who`, `b.raw`) : si l'utilisateur associe une opération concernant une autre facture, le toast affichera quand même « #023 ». À corriger : générer le message à partir de l'opération réelle.
- **Aucune génération réelle de fichier** pour les exports « Justificatifs (ZIP) » et « Journal des achats (CSV) » de cet écran (contrairement à Config → Livre des recettes, qui génère un vrai CSV téléchargeable via `download()`) — à harmoniser : soit tous les exports produisent un fichier réel, soit c'est un renvoi cohérent vers un futur module d'export commun.
- **`recTotal` (dépenses récurrentes de la période) est calculé sur la liste déjà filtrée `list`**, donc dépend de la période/compte sélectionné — logique, mais le libellé (« recréées automatiquement chaque mois ») laisse entendre un mécanisme de génération automatique des dépenses récurrentes qui **n'existe dans aucun store lu** (`DEP` n'expose pas de fonction de génération récurrente) — cohérent avec la lacune n°13 déjà listée par `01-vision.md`.

---

## 5. Outils — Simulateurs

Fichier : `outils-app.jsx`. **Confirmé : la coquille HTML de cet écran ne charge ni `freel-etat.js` ni `freel-depenses.js`** — Outils est un module entièrement autonome, zéro donnée du store partagé n'y entre ni n'en sort.

### Rôle
Calculs fiscaux, rendement du compte pro, rapprochement bancaire (démo), CRA — « tout est recalculé en direct » à partir de champs saisis librement par l'utilisateur, pas du store.

### Arborescence des composants
- **PageShell** (RailNav `[réutilisable]`, Topbar `[réutilisable]` très simplifiée — titre de page, recherche, pas de FabMenu Export/Nouveau)
- **SubTabs** (`impot` / `compte` / `cra`)
- **Onglet Impôt & CFE** (`ImpotCFE`)
  - **CalculateurImpot** — champs CA annuel encaissé HT, parts fiscales, autres revenus du foyer, versement PER déductible ; phrase explicative de la base imposable ; **CompareCard** (2 options « Micro au barème » vs « Micro au libératoire (2,2%) », tag « avantageux » sur la gagnante) ; bandeau conditionnel d'économie d'impôt PER
  - **TranchesCard** (« Impôt du foyer par tranche ») — une **TrancheRow** par tranche du barème avec barre de remplissage, encart résultat « Impôt total du foyer »
  - **CfeCard** (« Simulateur CFE ») — champs base minimum communale + taux, barème de référence (`CFE_SCALE`, 6 lignes), encart résultat, badge « exonéré année 1 »
- **Onglet Compte pro & banque** (`ComptePro`)
  - **RendementCard** (« Rendement du compte pro ») — champs solde moyen placé + taux annuel brut, résultats intérêts/mois et sur 12 mois
  - **ImportBancaireCard** — zone de dépôt (CSV/OFX, maquette), liste de 3 **MatchRow** de démo avec bouton « Valider » sur les lignes en attente (`st==='q'`)
- **Onglet CRA** (`CRA`)
  - **LaunchCard** — pitch + bouton « Ouvrir le générateur de CRA » → `FreelDocs.cra()`
  - **RecentsCard** — 3 **CraRecentItem** (mois/client, statut, bouton « Rouvrir »)

### Données consommées

| Champ / dérivé | Source | Format d'affichage |
|---|---|---|
| CA annuel encaissé HT (défaut `'53 600'`) | **saisie utilisateur**, valeur par défaut en dur, **sans lien avec `ET.caEncaisse` (32 400) ni `ET.caRealise` (59 400)** | `eur`, texte libre parsé par `num()` |
| Parts fiscales / autres revenus / PER | saisie utilisateur, défauts en dur (`'1'`, `'0'`, `'0'`) | texte libre |
| `microBase = CA×0.66` | calcul local (abattement 34 % **redéfini localement**, pas lu depuis Config) | `eur` |
| `lib = CA×0.022` | calcul local (taux 2,2 % **redéfini en dur**, cohérent avec `ET.tauxIR` mais indépendant) | `eur` |
| Barème IR (`BR`, 5 tranches 2026) | **constante locale**, aucune lecture de Config | `%`, `eur` par tranche |
| Base CFE (défaut `'560'`), taux communal (défaut `'26,5 %'`) | saisie utilisateur | `eur`, calcul `round(base×taux/100)` |
| `CFE_SCALE` (barème de référence par tranche de CA) | **constante en dur**, absente de tout store | table texte |
| Solde moyen placé (défaut `'8 120'` — coïncide avec `ET.solde` mais non lié), taux annuel (défaut `'3,0 %'`) | saisie utilisateur | `eur` |
| Lignes de rapprochement bancaire (3 lignes démo) | **état local React**, non lié à `DEP` | texte + montant |
| CRA récents (3 lignes) | **constante en dur** | texte |

### Interactions

| Élément | Action utilisateur | Effet | Écrit dans le store |
|---|---|---|---|
| Onglets Impôt&CFE / Compte pro / CRA | clic | change `tab` | non |
| Champs du calculateur d'impôt | saisie | recalcul en direct (`useMemo`) de la comparaison barème/libératoire et des tranches | non |
| Champs CFE | saisie | recalcul en direct du montant CFE estimé | non |
| Champs rendement (solde, taux) | saisie | recalcul en direct des intérêts mensuels/annuels | non |
| Zone de dépôt de relevé | clic | toast « Import CSV/OFX — maquette » — **non implémenté** | non |
| Bouton « Valider » (ligne de rapprochement en attente) | clic | passe la ligne locale à l'état `ok`, réécrit son libellé, toast — **état local volatile, perdu au rechargement, ne touche pas `DEP`** | non |
| « Ouvrir le générateur de CRA » / « Rouvrir » | clic | ouvre `FreelDocs.cra()` | non |

### Comportement responsive
Rail/dock global : voir `03-design-system.md`.
Ruptures propres à cet écran :
- `≤1000px` : toutes les cellules `s7/s5/s6/s4/s8` repassent en pleine largeur (`span12`) et s'empilent — concerne les 3 cartes de l'onglet Impôt & CFE et les 2 cartes de l'onglet Compte pro & banque.
- `≤720px` : la comparaison barème vs libératoire (`.compare`, 2 blocs côte à côte) passe à 1 colonne empilée.

### États
- Non défini par le prototype — à concevoir intégralement :
  - **Erreur de saisie silencieuse** : la fonction `num()` (ligne 33) coerce toute entrée non numérique à `0` sans aucun retour visuel à l'utilisateur (pas de bordure rouge, pas de message) — un champ mal rempli (ex. « abc ») produit silencieusement des résultats à 0 € sans que l'utilisateur comprenne pourquoi. À corriger en priorité : c'est un vrai risque de confusion (l'utilisateur peut croire que son CA est nul).
  - **Vide/chargement** : sans objet dans ce prototype (aucune donnée externe chargée) — restera pertinent seulement si Outils est un jour connecté au store (voir Écarts).

### Écarts et ambiguïtés
- **Écran totalement déconnecté des deux stores** — confirmé au niveau de la coquille HTML elle-même (`Outils - Simulateurs.html` ne charge ni `freel-etat.js` ni `freel-depenses.js`), pas seulement au niveau du JSX. Cohérent avec sa vocation de « simulateur » (l'utilisateur doit pouvoir tester des hypothèses hors de sa situation réelle), mais cela signifie que **toutes les valeurs par défaut affichées (CA 53 600 €, solde 8 120 €, abattement 34 %, taux ACRE implicite dans le calcul du libératoire à 2,2 %) sont des doublons codés en dur** de faits qui existent par ailleurs dans `ET`/Config. Décision produit à prendre : Outils doit-il pré-remplir ses champs depuis les faits réels de l'utilisateur (CA encaissé actuel, abattement configuré) tout en restant éditable pour la simulation, ou rester un bac à sable totalement indépendant comme aujourd'hui ?
- **Le taux d'abattement (34 %) et le taux du versement libératoire (2,2 %) sont recalculés en dur dans ce fichier** (`microBase=CA*0.66`, `lib=CA*0.022`) plutôt que lus depuis les paramètres fiscaux de Config — si Config devient un jour éditable (l'utilisateur change son abattement ou son taux), ce simulateur ne le refléterait pas sans modification.
- **`CFE_SCALE` (barème par tranche de CA N-2) n'existe dans aucun store** — seul un montant plat `echeances[id='cfe'].amt=410` existe dans `ET`. Il manque un modèle de données pour le barème CFE complet si on veut que la CFE affichée sur Pilote/Argent (410 €) soit cohérente avec ce que ce simulateur calculerait à partir des vraies règles (base × taux communal).
- **Rapprochement bancaire de démo (`ComptePro`) fait doublon avec le rapprochement réel de l'écran Achats** (`ReconCard`) — deux mécanismes de « rapprochement » distincts et non reliés dans le même produit : celui d'Outils est un jouet (3 lignes fixes, aucune écriture), celui d'Achats est le vrai (`DEP.link`/`markNoBank`). À trancher : Outils doit-il pointer vers Achats plutôt que dupliquer un mini-rapprochement fictif ?

---

## 6. Config

Fichier : `config-app.jsx`. **Confirmé : la coquille HTML de cet écran ne charge ni `freel-etat.js` ni `freel-depenses.js`** — comme Outils, Config est totalement déconnecté des deux stores métier, alors que c'est justement l'écran censé piloter leurs paramètres.

### Rôle
Réglages du régime fiscal, du barème, de la réserve, de la facturation, et exports légaux — « c'est ce qui pilote tous les calculs de l'app » (texte d'intro de l'écran lui-même).

### Arborescence des composants
- **PageShell** (RailNav `[réutilisable]`, Topbar `[réutilisable]` minimale — titre, recherche, bouton « Enregistrer » global)
- **Greet** — titre « Configuration »
- **CfgShell** — disposition à 2 colonnes : **CfgList** (7 entrées de menu, icône + titre + sous-titre + chevron) / **CfgPanel** (contenu de la section active)
- 7 sections, chacune un composant dédié, montées une à la fois selon la sélection :
  1. **Profil** — nom commercial, nom & prénom, SIRET, code APE, n° TVA intracom, adresse du siège, régime (select Micro-BNC/Micro-BIC vente/services), date de début d'activité, **Toggle** ACRE, **Toggle** versement libératoire
  2. **Fiscal** — bandeau « Barèmes 2026 à jour » + bouton « Mettre à jour », champs abattement forfaitaire/taux cotisations ACRE/impôt libératoire/CFP/plafond micro-BNC/seuil franchise TVA, **Periodicite** (Mensuel/Trimestriel, segmenté), **Toggle** mise à jour auto des barèmes, **Toggle** alerte seuils 85 %, **TvaOption** (bascule franchise/assujetti, persistée `localStorage['freel_tva']`)
  3. **Reserve** — curseur % réserve matelas (0-80, pas 5) avec aperçu live (« versable » / « réserve »), champ seuil de sécurité trésorerie, champ jour de versement préféré, champ IBAN compte perso de virement, **Toggle** provisionnement automatique, **Toggle** rappel de versement
  4. **Factu** — préfixe de numérotation, prochain numéro, délai de paiement par défaut (select), pénalités de retard, IBAN d'encaissement, mention légale art. 293 B CGI, **Toggle** logo sur factures
  5. **Livre** (`#livre`) — table du livre des recettes (4 lignes démo), total encaissé, bouton « Exporter CSV » (génération réelle de fichier)
  6. **Cloud** — carte de compte connecté, **Toggle** synchro temps réel, ligne « appareils connectés », ligne « dernière sauvegarde », 2 blocs stockage (Google Drive connecté, OneDrive non connecté)
  7. **Data** — Export FEC (génération réelle), Livre CSV (génération réelle), Sauvegarde JSON (génération réelle), **Toggle** synchro bancaire (off par défaut), bloc « Effacer toutes les données » (RGPD)
- Composants transverses internes à cet écran : **SaveBar** (bouton Enregistrer + note « dernière modif »), **Field** (label + input/select + aide), **Toggle** (interrupteur + libellé + description)

### Données consommées

| Champ / dérivé | Source | Format d'affichage |
|---|---|---|
| Tous les champs (SIRET, adresse, taux, plafonds, IBAN, etc.) | **valeurs en dur** passées en `value=` à `<Field>`, aucune lecture de `ET`/`DEP` (les scripts ne sont même pas chargés) | texte / `%` / `eur` |
| Curseur réserve (`Reserve`) — `DISPO` | **constante locale en dur `4940`** (ligne 181), dupliquant `ET.dispo()` sans jamais le lire | `eur` |
| `keep = round(DISPO×pct/100/10)×10`, `vers = DISPO−keep` | calcul purement local | `eur` |
| Toggle TVA (`TvaOption`) | lit/écrit **réellement** `localStorage['freel_tva']` — seul champ de cet écran qui persiste au-delà du rendu, et le seul lu ailleurs (Argent : `tvaState()`) | `'franchise'`/`'assujetti'` |
| Livre des recettes (`LIVRE`, 4 lignes) | **constante en dur**, indépendante de `ET.factures[]` | table + `eur` |
| Export CSV/FEC/JSON | génère un vrai fichier téléchargeable à partir de `LIVRE` (fonction `download()`, lignes 31-38) — **le seul export réellement fonctionnel de toute l'app** parmi les 6 écrans lus | fichier `.csv`/`.txt`/`.json` |

### Interactions

| Élément | Action utilisateur | Effet | Écrit dans le store |
|---|---|---|---|
| Entrée de la liste de sections | clic | change `sec`, affiche le panneau correspondant | non |
| Arrivée avec `#livre` dans l'URL | navigation | ouvre directement la section Livre des recettes (point d'entrée du lien rail « Livre des recettes ») | non |
| N'importe quel `<Field>`/`<Toggle>` | saisie/clic | état local du composant uniquement (`useState` isolé par champ) — **aucune persistance, aucune écriture dans un store, recalcul d'aucun autre écran** | non |
| Curseur réserve % | glisser | recalcule localement `keep`/`vers` à partir de `DISPO` (constante figée) | non |
| Toggle TVA | clic | écrit dans `localStorage['freel_tva']`, toast, ce qui **est** relu par Argent (`tvaState()`) au prochain rendu de cet écran | **oui, mais hors des 2 stores documentés — 3ᵉ mécanisme de persistance** |
| Bouton « Mettre à jour » (barèmes) | clic | toast de confirmation uniquement — **aucune vérification réelle** | non |
| Bouton « Enregistrer » (topbar et chaque `SaveBar`) | clic | toast « Réglages enregistrés »/« Enregistré » uniquement — **aucune écriture réelle constatée** | non |
| Livre → « Exporter CSV » | clic | génère et télécharge un vrai fichier CSV depuis `LIVRE` | non (lecture seule de la constante) |
| Data → « Générer » (FEC) / « Télécharger » (CSV) / « Sauvegarder » (JSON) | clic | génère et télécharge un vrai fichier | non |
| Data → « Supprimer » (RGPD) | clic | toast d'avertissement uniquement — **suppression réelle non implémentée**, cohérent avec un garde-fou volontaire en maquette | non |

### Comportement responsive
Rail/dock global : voir `03-design-system.md`.
Ruptures propres à cet écran :
- `≤880px` : `cfg-shell` (liste de sections + panneau, grille 2 colonnes `282px 1fr`) passe à 1 colonne — la liste de sections se retrouve au-dessus du panneau de contenu au lieu d'à côté.
- `≤600px` : les rangées de champs à 2 colonnes (`.frow`, utilisées dans Profil/Fiscal/Factu) passent à 1 colonne.

### États
- Non défini par le prototype — à concevoir intégralement :
  - **Enregistrement** : aucune distinction visuelle entre « modifié, non enregistré » et « enregistré » — le bouton « Enregistrer » déclenche toujours le même toast de succès, sans jamais pouvoir échouer. À concevoir : état « modifications non enregistrées », confirmation de sortie de section si changements en attente, état d'erreur de sauvegarde.
  - **Vide** : sans objet pour la plupart des sections (formulaires toujours pré-remplis) ; pertinent pour Livre des recettes si aucune facture payée n'existe encore (« Registre vide, sera généré à ton premier encaissement ») — à concevoir.
  - **Chargement** : à concevoir (chargement des réglages réels au montage).

### Écarts et ambiguïtés — le plus important de toute la spec
- **Config ne lit ni n'écrit dans `FreelEtat`/`FreelDepenses`.** C'est vérifié au niveau de la coquille HTML (aucun `<script src="freel-etat.js">` ni `freel-depenses.js`), pas seulement une supposition à partir du JSX. Concrètement : changer l'abattement, les taux de cotisation, les plafonds, ou le curseur de réserve sur cet écran **n'a aujourd'hui strictement aucun effet ailleurs dans l'app** — alors que le texte d'intro de l'écran affirme l'inverse (« c'est ce qui pilote tous les calculs de l'app »). C'est l'écart le plus critique de toute la maquette pour la mise en production : Config doit devenir la source d'écriture des faits aujourd'hui figés en dur dans `ET.FACTS` (`tauxUrssaf`, `tauxCFP`, `tauxIR`, `seuilBNC`, `seuilTVA`) et `ET.reserve`, ce qui suppose de faire évoluer `FreelEtat` d'un objet de faits fixes vers un objet de faits éditables persistés.
- **Troisième mécanisme de réserve, avec sa propre constante `DISPO=4940` en dur** (ligne 181) — un 3ᵉ endroit (après Pilote et Argent-Performance) qui réimplémente indépendamment la même idée de « garder X % en réserve ». Voir l'écart transverse dédié plus bas — décision produit bloquante avant tout câblage réel.
- **Seul le toggle TVA persiste réellement** (`localStorage['freel_tva']`) et **seul lui est relu par un autre écran** (Argent). Tous les autres réglages de Config (y compris ceux qui semblent critiques : ACRE, versement libératoire, périodicité des cotisations) sont des `useState` locaux qui disparaissent à la navigation — la persistance de la TVA est donc une exception isolée, pas le début d'un vrai mécanisme de réglages, et ne doit pas être prise comme modèle à dupliquer tel quel (un `localStorage` par réglage ne passera pas à l'échelle).
- **Champs sans aucun équivalent dans les 2 stores documentés** (déjà listés par `01-vision.md §7.7`, confirmés ici avec leur emplacement exact dans le JSX) : seuil de sécurité trésorerie (`Reserve`, ligne 198), IBAN de virement perso (`Reserve`, ligne 199 — pourtant censé être utilisé par le bouton « Verser » du Pilote selon son aide), délai de paiement par défaut et pénalités de retard (`Factu`), périodicité des cotisations (`Periodicite`, censée « piloter l'échéancier À déclarer du Pilote » alors que `ET.echeances[]` est une liste statique sans aucune logique générative observée). Un magasin de réglages complémentaire à `FreelEtat`/`FreelDepenses` est nécessaire — décision d'architecture à prendre avant de commencer à coder cet écran pour de vrai.
- **« Vérifiés le 11 juil. 2026 »** (bandeau barèmes) est postérieur à `TODAY = 2026-06-10` figé pour toute la maquette — incohérence de date déjà repérée par `01-vision.md` (millésime du barème) ; confirmé ici mot pour mot dans le JSX (ligne 156).

---

## Composants transverses

| Composant / service | Où observé | Contrat (entrée → sortie) |
|---|---|---|
| **RailNav** | Les 6 écrans, à l'identique (6 liens + pied de rail) | Entrée : quel écran est actif (pour l'état `on`). Sortie : navigation (changement de page/route). Aucune donnée métier. |
| **Topbar** (+ **FabMenu** Export/Nouveau) | Les 6 écrans, avec des variantes (Pilote : mois+année+réglages+confidentialité ; Achats : période complète au lieu du mois ; Outils/Config : très allégée, sans FabMenu) | Entrée : liste d'items par menu (Export : documents disponibles ; Nouveau : types de saisie). Sortie : événement `export(type)` ou `new(type)`, aujourd'hui câblé par délégation d'attributs `data-export`/`data-new` interceptés par un écouteur global (`freel.js`), pas par des gestionnaires React locaux — à décider explicitement en implémentation compilée (délégation globale conservée, ou callback explicite par composant). |
| **FoldableCard** (mécanique `data-fold`) | Pilote (Santé), Argent (5 cartes), Achats (2 cartes) | Entrée : le nœud DOM de la carte + une chaîne de résumé calculée à partir des données réelles de la carte. Sortie : bascule d'un état plié/déplié persisté par écran dans `localStorage['freel-fold:<nom-de-page>']`, indexé sur le texte du libellé de la carte (`.card-h .lbl`) — donc **le libellé de la carte est aussi sa clé de persistance** : le renommer casse la mémorisation de l'utilisateur. Les clics sur `button, a, input, select, label, .act` à l'intérieur de l'en-tête ne déclenchent jamais le pliage. |
| **KpiRow / KpiTile** | Argent (2 onglets), Achats | Entrée : libellé, valeur formatée, sous-texte, variante de couleur optionnelle (`alert`). Sortie : aucune (affichage seul). |
| **StatusPill** (famille à unifier) | `st-pill` (Pilote), `chip2` (Activité, Argent), `rflag`/`miniflag` (Achats), `tst`/`FSTAT` (Argent échéancier) | 4 implémentations CSS distinctes pour le même besoin conceptuel (statut coloré + libellé court). Contrat cible : un statut (`ok/warn/bad/neutre/info`) + un libellé → un badge visuel cohérent sur les 6 écrans. À unifier en un seul composant avant l'implémentation, sinon 4 divergences de style se propageront. |
| **ModalDialog** (`mscrim`/`mcard`) | Argent (4 modales), Achats (4 modales) | Entrée : titre, contenu, callback de fermeture. Sortie : fermeture (clic sur le fond, sur ✕, ou action interne qui ferme explicitement). Fermeture au clavier (Échap) non observée dans les modales React (seulement dans `FreelSheet`, voir ci-dessous) — à harmoniser. |
| **DetailSheet** (service `FreelSheet`, `freel.js`) | Pilote (11 gabarits), architecturalement disponible pour tout écran | Entrée : titre + fragment HTML. Sortie : ouverture d'un panneau latéral ; **réinjecte automatiquement les valeurs `[data-fx]` du store à chaque ouverture** (`FreelEtat.bindAll(bodyEl)`), donc tout gabarit de sheet reste synchronisé avec le store même si son HTML est statique. Ferme sur clic du fond, sur ✕, ou touche Échap. |
| **ToastNotification** (service `FreelToast`, `freel.js`) | Les 6 écrans, systématiquement | Entrée : message + variante (`ok` par défaut, `warn`). Sortie : notification éphémère (auto-disparition ~2,6 s). Aucune action de rappel (pas de « annuler »). |
| **QuickEntryForm** (service `FreelForms`, `freel.js`) | Déclenché depuis les menus « Nouveau » de Pilote/Activité/Argent/Achats (attributs `data-new`) | Entrée : type de formulaire (`salaire, charge, facture, mission, conge, encaissement, devis`), avec valeurs par défaut **déjà store-aware** pour certains champs (ex. le formulaire « salaire » pré-remplit le montant avec `ET.versable()` et affiche `ET.dispo()` en pied de formulaire). Sortie observée : aujourd'hui **aucune écriture confirmée dans `ET`/`DEP`** au clic sur le bouton d'action de ces formulaires courts (à la différence des formulaires longs de `FreelDocs`) — à vérifier/compléter en implémentation, c'est un angle mort transverse à toute la maquette. |
| **DocumentGenerator** (service `FreelDocs`, `freel-docs.js`) | Pilote (quickacts), Activité (CRA, Missions, Factures), Argent, Outils (CRA) | Entrée : type de document (`facture, cra, mission, encaissement`) + pré-remplissage optionnel. Sortie : éditeur complet en overlay avec aperçu live, export PDF/impression. Service beaucoup plus riche que `FreelForms` (édition ligne à ligne, calculs d'échéancier) — les deux mécanismes coexistent pour des besoins différents (saisie rapide vs document formel), à conserver distincts en implémentation. |
| **Convention de couleur par type de charge** | Pilote, Argent (enveloppes, échéancier), Config (mentions de taux) | URSSAF = ambre, TVA = bleu, IR = violet, CFE = orange ; agrégats neutres (dus/provisions) = `--slate`, jamais une couleur de charge. Contrat à respecter par tout nouveau composant affichant une charge. |
| **Contrat de période** `{kind:'month'|'quarter'|'year'|'all', y, m?, q?}` | Achats (`PeriodBar` complète), Argent (`TvaModal`, sélecteur trimestre/année simplifié) | Même forme de données consommée par `DEP.filter()`/`DEP.summary()`/`DEP.periodLabel()` des deux côtés, mais **deux widgets différents** pour la piloter (barre complète à 4 modes + compte, chips trimestre seuls) — à unifier en un seul sélecteur de période si le produit veut une expérience cohérente. |
| **DataTable** (`tbl`, `tbl2`, `tbl3`, `atbl`) | Activité (Missions/Factures), Achats (Registre), Argent (détail provision), Config (Livre) | 4 implémentations distinctes du même besoin (en-tête, lignes, colonne numérique alignée à droite, ligne de total). Candidat naturel à un composant unique avant l'implémentation. |

## Ordre d'implémentation conseillé

1. **Socle transverse d'abord, avant tout écran** : compiler les deux stores (`FreelEtat`, `FreelDepenses`) tels quels dans le langage cible (en tranchant au passage les ambiguïtés de `01-vision.md` §7 — taux URSSAF, facteur ×1,56, sémantique de `provisions()`), puis les composants transverses qui apparaissent sur les 6 écrans : `RailNav`, `Topbar`/`FabMenu`, `FoldableCard`, `ModalDialog`, `StatusPill` (unifié), `ToastNotification`. Construire un écran avant d'avoir ce socle revient à devoir tout reprendre.
2. **Pilote** en premier parmi les 6 écrans. C'est la surface de données la plus simple (ne lit que `FreelEtat`, jamais `FreelDepenses` directement), il fixe le vocabulaire et les valeurs canoniques (`dispo`, `versable`, `remuMois`, `provisions`) que les 4 autres écrans financiers ne font que ré-afficher, et il exerce tôt les deux seuls mutateurs de `FreelEtat` (`toggleFacture`/`toggleEcheance`) ainsi que `FreelSheet`. Le construire en premier oblige à trancher tôt l'ambiguïté du curseur de réserve manquant et le recalcul dupliqué de `remuMois()`.
3. **Argent** ensuite. Partage presque toute la surface `FreelEtat` de Pilote, ajoute la première vraie lecture de `FreelDepenses` (`TvaModal`) et concentre à lui seul la majorité des décisions produit bloquantes (taux URSSAF x2 supplémentaires, 3ᵉ mécanisme de réserve, résumé de seuils faux en dur) — mieux vaut les instruire une fois que Pilote a déjà fixé les valeurs de référence, pour ne pas les re-découvrir à moitié implémentées.
4. **Achats** en parallèle ou juste après Argent. Introduit `FreelDepenses` comme store principal en écriture (`add/attachPiece/link/markNoBank`) — un vertical assez autonome (aucune dépendance vers Activité/Outils/Config) dont la complétude conditionne les vraies données de `TvaModal` (Argent) et de `depenses()`/`tvaDeductible()` (Pilote, dérivés qui lisent `FreelDepenses.summary()`).
5. **Activité** en quatrième. Introduit un modèle de données entièrement nouveau (planning, missions, factures, clients), aujourd'hui totalement disjoint des deux stores existants — le chantier le plus large en volume de nouveau domaine métier (génération de CRA, facturation depuis les missions), à mener une fois que les fondations financières sont stables pour éviter de devoir les retoucher sous pression.
6. **Outils** en cinquième. Aucune dépendance de store aujourd'hui (confirmé par les inclusions de script absentes) : peut être fait à tout moment sans bloquer personne, mais n'a de sens à connecter aux vraies données (CA réel, abattement réel) qu'une fois Config existant — le faire juste avant Config évite de re-câbler ses champs deux fois.
7. **Config** en dernier. C'est l'écran qui cristallise la plus grosse dette d'architecture (aucune lecture ni écriture des 2 stores aujourd'hui, alors qu'il prétend piloter tous les calculs) et qui dépend directement des arbitrages produits laissés en suspens par Pilote/Argent (réserve en montant ou en %, quel taux URSSAF canonique, où vivent les nouveaux réglages sans équivalent de store). Le construire en dernier permet de le brancher une seule fois, sur un modèle de réglages déjà stabilisé par les écrans précédents, plutôt que de deviner sa forme en premier.
