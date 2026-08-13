# Handoff — Freel · poste de pilotage du freelance (build 5)

## Overview

Freel est l'outil de pilotage d'un indépendant en micro-BNC (France) : savoir **combien il peut se
verser aujourd'hui sans se mettre en danger**, ce qu'il doit à l'URSSAF / au fisc, où il en est de ses
seuils, et si sa comptabilité est en règle (justificatifs, rapprochement bancaire, livre des recettes).

Le prototype couvre 6 écrans, un store financier partagé, un store de dépenses partagé, un système de
cartes pliables, et une mise en page responsive (desktop rail + barre d'onglets mobile).

---

## About the design files

Les fichiers de ce bundle sont des **références de design écrites en HTML/CSS/JS** : des prototypes qui
montrent l'apparence et le comportement voulus. **Ce n'est pas du code de production à copier tel quel.**

La tâche est de **recréer ces écrans dans l'environnement du codebase cible** (React, Vue, Svelte,
SwiftUI, natif…) avec ses patterns et ses bibliothèques établies. Si aucun environnement n'existe
encore, choisir la stack la plus adaptée et y implémenter les designs.

Ce qui doit être repris **fidèlement** : la hiérarchie de l'information, les tokens de couleur, les
règles de calcul, le vocabulaire de l'interface (les libellés sont réfléchis — « ton solde n'est pas
tout à toi », « versable », « dus »), et l'architecture à source unique de vérité.

Ce qui doit être **remplacé** : les données de démonstration (`FACTS`, `seedExpenses`, `seedBank`,
`FLOW`, `CA`, `CAP`) — voir « Ordres de marche » en bas.

## Fidelity

**Haute fidélité (hifi).** Couleurs, typographie, espacements, états et micro-interactions sont
définitifs. À recréer au pixel avec les composants du codebase cible. Les seules parties simulées
sont listées dans « Limites du prototype ».

---

## Architecture : deux stores, une seule vérité

C'est le point le plus important du handoff. **Aucun montant n'est écrit en dur dans une page.**
Toute page lit un store, et le store distingue strictement :

- **FAITS** — ce qui est saisi ou lu sur les comptes (solde, factures, échéances, CA encaissé, taux, seuils légaux).
- **DÉRIVÉ** — tout le reste, **recalculé à la demande, jamais stocké en double** (disponible, versable, provisions, %, autonomie…).

Cette séparation existe parce que la version précédente affichait 3 010 € de provisions à un endroit et
3 180 € à un autre. Le codebase cible doit reproduire la règle, pas seulement les écrans.

### `freel-etat.js` — état financier (`window.FreelEtat`)

**Faits**

| clé | valeur démo | sens |
|---|---|---|
| `solde` | 8 120 | solde du compte pro |
| `reserve` | 2 470 | matelas de sécurité (curseur sur Pilote) |
| `factures[]` | 4 entrées | `{num, client, amt, state:'paid'|'wait'|'late', date, dueDays?}` |
| `echeances[]` | 4 entrées | `{id, lab, amt, state:'paid'|'wait', due, kind:'urssaf'|'ir'|'cfe'}` |
| `caRealise` | 59 400 | facturé à date |
| `caEncaisse` | 32 400 | encaissé à date — **base des seuils** |
| `caProjection` | 74 200 | projection fin d'année |
| `baseUrssafT2` | 7 970 | assiette du trimestre (recettes encaissées avril→juin) |
| `encaisseMois` | {avril, mai, juin} | encaissé par mois du trimestre |
| `seuilBNC` / `seuilTVA` | 77 700 / 37 500 | plafonds légaux 2026 |
| `tauxUrssaf` / `tauxCFP` / `tauxIR` | .246 / .002 / .022 | taux |
| `tva` | `'franchise'` | `'franchise'` \| `'assujetti'` |

**Dérivé (les formules à reporter à l'identique)**

```
encaisse()      = Σ factures[state==='paid'].amt
attente()       = Σ factures[state!=='paid'].amt
sortiesTotal()  = Σ echeances.amt
provisions()    = sortiesTotal()          // tout ce qui reste à couvrir sur l'exercice
dispo()         = solde − provisions()
versable()      = max(0, dispo() − reserve)
remuMois()      = max(0, encaisse() − sortiesTotal())
seuilTVApct()   = caEncaisse / seuilTVA × 100
seuilBNCpct()   = caEncaisse / seuilBNC × 100
margeTVA()      = max(0, seuilTVA − caEncaisse)
cotisUrssaf()   = baseUrssafT2 × 0.212    // 21,2 % — taux ACRE
cotisCFP()      = baseUrssafT2 × tauxCFP
cotisIR()       = baseUrssafT2 × tauxIR × 1.56   // IR libératoire BNC
prelevT2()      = cotisUrssaf() + cotisCFP()
depenses()      = FreelDepenses.summary({kind:'year',y},'tous').ttc
tvaDeductible() = FreelDepenses.summary({kind:'year',y},'tous').recov
recurrentMensuel() = Σ depenses[rec && mois courant].ttc
burnMensuel()   = recurrentMensuel() + provisions()/6
autonomie()     = dispo() / burnMensuel()        // en mois, 1 décimale
```

**API** — `subscribe(fn)` (re-render), `set(k,v)`, `toggleFacture(num)`, `toggleEcheance(id)`,
`reset()`, `values()`, `bindAll(root)`, formats `eur()` / `eurR()` (arrondi à 10 €) / `keur()`.
Persistance : `localStorage['freel-etat-v1']`, fusionnée avec les faits par défaut pour qu'un état
enregistré par une version antérieure ne fasse pas disparaître un fait ajouté depuis.

**Binder déclaratif** — un des mécanismes à conserver dans l'esprit : tout élément
`<span data-fx="dispo">` reçoit la valeur formatée depuis `values()`, à chaque `persist()`.
Dans un framework réactif, c'est simplement un sélecteur/computed — mais **aucun composant ne doit
recalculer sa propre version d'un montant**.
Clés notables : `solde reserve provisions dispo versable remuMois encaisse attente sortiesTotal
sortiesPayees sortiesAVenir urssaf ir cfe cfp caRealise caEncaisse caProjection seuilTVA seuilBNC
seuilTVApct seuilBNCpct margeTVA depenses tvaDeductible baseUrssaf cotisUrssaf cotisCFP cotisIR
prelevT2 encAvril encMai encJuin autonomie` + une clé par facture (`fac024`, `facCli024`).

### `freel-depenses.js` — dépenses & banque (`window.FreelDepenses`)

Modèle d'une dépense :
```
{ id, date:'YYYY-MM-DD', four, cat, ttc, tva,
  piece:bool,          // justificatif joint
  rec:bool,            // charge récurrente
  acct:'pro'|'old'|'perso',
  recon:'matched'|'pending'|'nobank',
  bankId:string|null }
```

`recon` est **explicite, jamais deviné** :
- `matched` — reliée à une opération du compte.
- `pending` — saisie, aucune opération bancaire associée (pas encore tombée, ou à relier).
- `nobank` — compte non synchronisé (ancien compte, perso) : aucun rapprochement n'est attendu.

Comptes : `pro` (Qonto, `sync:true`), `old` (BNP, `sync:false`, `closed:true`), `perso` (avance, `sync:false`).
Catégories : Logiciels, Hébergement, Matériel, Déplacement, Coworking, Assurance RC Pro, Honoraires,
Formation, Télécom, Autre.

**API** — `all()` (tri date desc), `bank()`, `byId()`, `account(id)`, `filter(period, acct)`,
`summary(period, acct)`, `periodLabel(p)`, `add(input)`, `attachPiece(id)`, `link(expId,bankId)`,
`markNoBank(id)`, `closeBank(id)`, `findMatch(exp)`, `pendingList()`, `openBank()`, `subscribe`, `reset`.

Période : `{kind:'month'|'quarter'|'year'|'all', y, m?, q?}` — la même forme partout (registre Achats
comme dossier de déclaration TVA).

`summary()` retourne `{n, ttc, tva, recov, blocked, missing, pending, items}` :
- `recov` = TVA récupérable (**pièce jointe uniquement**)
- `blocked` = TVA perdue faute de justificatif
- `missing` = nombre de dépenses sans pièce

**Auto-rapprochement à la saisie** (`add()` → `{exp, match}`) : si le compte est synchronisé,
`findMatch()` cherche une opération sortante non traitée, **montant à ±0,50 € et date à ±6 jours**.
Trouvée → on propose de relier. Sinon → `recon:'pending'` (« on attend l'opération »). Compte non
synchronisé → `recon:'nobank'` directement.

---

## Screens / Views

Navigation partagée : rail vertical fixe à gauche (desktop), **barre d'onglets fixe en bas**
(≤ 760 px). Ordre : Pilote · Activité & congés · Argent · Achats · Outils · Config, puis un pied de
rail « Livre des recettes » + avatar utilisateur.

### 1. Pilote — Le Flux · `Pilote - Le Flux.html` + `pilote-flux.js` + `pilote-quickacts.js`
**But** — la décision du jour, en un écran. « Combien je peux me verser, et qu'est-ce qui coince. »
- Bandeau de flux à 3 colonnes KPI **cliquables** (chaque colonne ouvre sa feuille de détail) :
  **Cash** (solde) → **Disponible** (`dispo`) → **Rémunération** (`remuMois`, + bouton « Verser sur
  mon compte »).
- Curseur de réserve (matelas) qui écrit `reserve` dans le store → `versable` bouge en direct.
- Cartes : santé/décisions suggérées, seuils micro-BNC & franchise TVA avec leviers, échéancier
  « À déclarer », factures du mois avec retards.
- Réglages de maquette derrière une **icône engrenage** (a libéré 85 px de hauteur utile).
- Les feuilles de détail sont des `<template>` dans le HTML, ouvertes par `FreelSheet.open()`.

### 2. Activité & congés — Plan de charge · `Activité - Plan de charge.html` + `activite-app.jsx`
**But** — missions, calendrier, congés, CRA.
Calendrier mensuel fusionné avec les congés ; chaque journée saisie porte **mission · durée (¼ → 1 j) ·
tâche**, ce qui permet de sortir le CRA sans ressaisie. Occupation du mois (ex. 18,5 j facturés / 22
ouvrés), occupation par mission, synthèse hebdo.

### 3. Argent — Trésorerie & Performance · `Argent - ….html` + `argent-app.jsx`
**But** — la vérité longue durée. Deux sous-onglets (`tres` / `perf`).
- **Trésorerie** : « Ton solde n'est pas tout à toi » (donut solde = réserve + versable + dus) ·
  **Enveloppes de provision** (échéance et montant traités à poids égal, jauge de 4 px en pied de
  carte — pas de remplissage traversant) · Seuils · Échéancier & obligations 2026 avec légende de
  couleur par charge · Évolution du compte (entrées / sorties / solde, clic sur un mois = composition).
- **Performance** : CA réalisé vs encaissé par mois (clic = composition), capacité de versement par
  mois (barre = capacité, plein = versé), rendement, dépendance client.
- Modales : `FlowModal` (composition d'un mois), `DeclarationUrssaf`, `TvaModal` (le dossier de
  déclaration tire dépenses + justificatifs du store **à la demande**, pour la période choisie).

### 4. Achats — Justificatifs & Banque · `Achats - ….html` + `achats-app.jsx`
**But** — la conformité : chaque dépense déductible a sa pièce, chaque opération est rapprochée.
- **Barre de période + compte** : Mois / Trimestre / Année / Tout, flèches ‹ › pour naviguer,
  sélecteur de compte (tous / pro / ancien / perso). Le registre affiche **n'importe quelle période**.
- **Registre des achats** — lignes : date, fournisseur, catégorie, TTC, TVA, drapeau pièce, drapeau
  rapprochement. Clic = détail + dépôt de justificatif.
- **Rapprochement bancaire — les deux sens** : opérations bancaires sans dépense (créer + joindre) et
  dépenses sans opération (relier, ou marquer « pas de banque »).
- **Nouvelle dépense** : point d'entrée unique. Fournisseur + montant requis ; TVA calculée mais
  débrayable ; case récurrente ; dépôt de pièce dans le formulaire. À l'enregistrement, auto-rapproche
  ou passe en attente.
- Synthèse de carte pliée : `n achats · X € TTC · TVA déductible Y € · Z pièce(s) manquante(s)`.

### 5. Outils — Simulateurs · `Outils - Simulateurs.html` + `outils-app.jsx`
IR (barème vs libératoire, foyer + PER), CFE, banque, CRA imprimable.

### 6. Config · `Config.html` + `config-app.jsx`
7 sections : règles, livre des recettes (`#livre`), exports CSV / FEC / JSON, TVA intracom + adresse
(CFE), fraîcheur des barèmes, compte / appareils.

---

## Interactions & Behavior

**Cartes pliables** (`freel-fold.js`) — mécanisme transversal, à conserver.
Clic sur `.card-h` → bascule `.folded`. Pliée, la carte n'affiche que son en-tête **plus la synthèse
portée par l'attribut `data-fold`** : replier ne fait donc jamais perdre l'information, elle se
condense en une phrase. Identité de la carte = le texte de son `.lbl`. Persisté **par page** dans
`localStorage['freel-fold:<nom-de-fichier>']`. Les clics sur `button, a, input, select, label, .act`
dans l'en-tête ne plient pas. Un `MutationObserver` réapplique l'état aux cartes rendues après coup
(React).

**Feuilles latérales** (`FreelSheet.open(titre, html)`) — panneau glissant depuis la droite +
voile ; clic voile ou ✕ pour fermer. Sert à tous les détails de KPI.

**Toasts** (`FreelToast(msg, kind)`) — confirmation légère ; `kind:'warn'` pour la validation.

**Icônes** — jetons `$ICO_nom$` remplacés au boot par des SVG inline (`FREEL_ICONS`) ; dans les
fichiers React, composant `<Ic d={I.nom}/>` (paths 24×24, stroke 2, linecap/linejoin round).

**Responsive** — desktop : rail + grille 12 colonnes (`.s12 .s8 .s7 .s4`). ≤ 760 px : **1 colonne**,
rail remplacé par une barre d'onglets fixe en bas (il disparaissait purement et simplement avant),
titres réduits, tableaux qui passent en listes.

**Sous-onglets** — `[data-tab]` / `[data-pane]`, remonte en haut de page au changement.

---

## State Management

- `FreelEtat` — état financier, persisté, `subscribe` → re-render. **Un seul writer** : `set()` et les
  `toggle*`.
- `FreelDepenses` — dépenses + opérations bancaires, persisté, `subscribe`.
- État de pliage — par page, `localStorage`.
- État local des écrans (onglet actif, période choisie, modale ouverte, curseurs de simulateur) :
  local au composant, **jamais** persisté dans les stores.

Dans le codebase cible : deux stores (Zustand / Pinia / Redux slice / observable), sélecteurs dérivés
pour tout le reste, et aucun composant qui garde une copie d'un montant.

---

## Design Tokens

Tous dans `freel.css` (`:root`). Thème sombre verdâtre.

**Fonds & lignes**
`--bg:#0b0e0c` · `--panel:#131711` · `--panel-2:#181d16` · `--panel-3:#1e241b` ·
`--line:rgba(190,210,190,.09)` · `--line-2:rgba(190,210,190,.16)`

**Texte**
`--text:#e9ede8` · `--muted:#838d82` · `--muted-2:#5e655d`

**Sémantique**
`--green:#54cf91` (+ `--green-deep:#1c5e40`, `--green-glow:rgba(84,207,145,.13)`) ·
`--amber:#e3b35f` (+ `--amber-soft:rgba(227,179,95,.13)`) ·
`--red:#e2715f` (+ `--red-soft:rgba(226,113,95,.12)`) ·
`--blue:#6fb6e0` (+ `--blue-soft:rgba(111,182,224,.13)`)

**Couleur fixe par type de charge** — identité réutilisée partout (jauge, pastille de calendrier,
légende, enveloppe). Une charge garde toujours sa couleur, d'un écran à l'autre :

| charge | trait | fond |
|---|---|---|
| URSSAF | `--c-urssaf` = `--amber` | `--c-urssaf-bg` |
| TVA | `--c-tva` = `--blue` | `--c-tva-bg` |
| IR | `--c-ir` = `#b79ae4` | `--c-ir-bg` = `rgba(183,154,228,.14)` |
| CFE | `--c-cfe` = `#d9926a` | `--c-cfe-bg` = `rgba(217,146,106,.14)` |

**Neutre agrégat** — `--slate:#7c8794` / `--slate-soft:rgba(124,135,148,.14)` : pour les montants
« dus / mis de côté », qui sont une somme et non une charge. Ne jamais leur donner une couleur de charge.

**Rayon** `--r:16px` (cartes) ; 12–14 px pour les tuiles, 9 px pour les champs, 20 px pour les pastilles.

**Typographie**
- Texte : **Hanken Grotesk** 400/500/600/700/800.
- Chiffres, dates, codes : **JetBrains Mono** (`--mono`) 400/500/700 — *tous* les montants sont en mono.
- Échelle : h1 50 px / -.03em / 800 · h2 26 px / -.02em / 700 · KPI 34–44 px mono · corps 13,5–15 px ·
  légende 12–12,5 px · `.lbl` et kickers 10,5–12 px mono, `letter-spacing:.05–.16em`, uppercase.

**Formats FR, non négociables** — espace insécable avant `€`, séparateur de milliers espace
(`toLocaleString('fr-FR')`), virgule décimale. Montants « au rythme » arrondis à 10 € (`eurR`), gros
agrégats en k€ (`keur`).

**Animation** — `@keyframes btp` : pulsation d'anneau vert sur les boutons d'action
(`box-shadow 0 → 5px`, vert à .5 → 0 d'opacité).

---

## Assets

Aucun binaire. Icônes = SVG inline (stroke, 24×24, `stroke-width:2`). Polices = Google Fonts
(Hanken Grotesk, JetBrains Mono). `image-slot.js` fournit les emplacements de dépôt de justificatif
(drag & drop, persisté) — à remplacer par le vrai composant d'upload du codebase.

---

## Limites du prototype

Présent et manipulable à l'écran, mais simulé :
- **Import bancaire** — la zone de dépôt CSV/OFX existe, le parsing n'est pas branché.
- **Sync cloud** — l'écran compte / appareils existe, sans backend.
- **Envoi d'e-mails** (relances, CRA) — le flux est montré, l'envoi est un toast.

Ce sont des branchements techniques, pas des trous dans le design.

---

## Ordres de marche — corréler avec le code existant

À faire dans cet ordre.

**1. Cartographier avant d'écrire.** Pour chaque écran du codebase, lister les montants affichés et
dire pour chacun : c'est un **fait** (il vient d'une saisie ou de la banque) ou un **dérivé** (il se
recalcule). Tout dérivé qui est aujourd'hui stocké en base ou recopié dans un composant est un bug en
attente. C'est exactement l'incohérence que ce prototype a corrigée.

**2. Créer les deux stores d'abord, les écrans ensuite.** Porter `freel-etat.js` et
`freel-depenses.js` en respectant la frontière faits / dérivé et les formules ci-dessus. Les tests
unitaires portent sur les dérivés — ce sont eux qui rendent l'app juste.

**3. Éliminer les valeurs en dur restantes.** Le prototype lui-même en garde, volontairement, dans
les jeux de démonstration ; elles doivent toutes disparaître au profit du store :
- `argent-app.jsx` → `FLOW` (12 mois d'entrées/sorties en dur, `let solde=8120` en tête de
  `flowRows()`), `CA`, `CAP`, `ENVS` (montants provisionnés / dus par enveloppe), la synthèse de la
  carte Seuils (`"Micro-BNC 69 % (53 600 / 77 700 €)"` — doit venir de `seuilBNCpct()`), et
  `DeclarationUrssaf` (`CA=17200`, taux 11,6 % et 2,2 % en dur, liste `ENC` figée → doivent venir de
  `baseUrssafT2`, `cotisUrssaf()`, `cotisIR()`, et de la liste réelle des encaissements).
- Les libellés de mois / dates de démonstration (juin 2026) : le prototype est figé au **10/06/2026**.
  Remplacer par une horloge injectable — et laisser cette horloge injectable, sinon les tests de
  seuils et d'échéances ne sont pas reproductibles.
- Les synthèses `data-fold` écrites en dur dans le HTML : elles doivent se composer à partir du store,
  comme le fait déjà Achats.

**4. Combler les trous fonctionnels.** Absents du prototype, nécessaires en production :
- **Génération automatique des dépenses récurrentes.** Aujourd'hui `seedExpenses()` déroule 6 mois
  d'abonnements à la main (Adobe, OVHcloud, WeWork, AXA). Il faut un modèle d'abonnement
  (fournisseur, catégorie, montant, jour du mois, TVA, compte) qui **engendre** les occurrences, gère
  les changements de prix, la résiliation, et ne double pas une occurrence déjà rapprochée.
- **Store des factures pour la TVA collectée.** `FreelEtat.factures` porte un montant global sans
  ventilation HT / TVA : dès le passage en assujetti, la TVA collectée n'est pas calculable. Il faut
  des lignes de facture (HT, taux, TVA, TTC) et un basculement `franchise → assujetti` daté, qui
  change le comportement de l'app à partir de cette date sans réécrire le passé.
- **Rattachement réel des justificatifs** : stockage de fichier, empreinte, et **conservation 10 ans**
  (obligation légale FR) — avec la date de conservation minimale visible.
- **Rapprochement bancaire réel** : `findMatch()` (±0,50 € / ±6 j) est une bonne heuristique de
  départ, mais il faut l'idempotence sur les imports répétés, la gestion des doublons, et un état
  « ignorée » explicite.
- **Statut par obligation** — `state:'paid'|'wait'` est trop pauvre. Le cycle réel est
  *à déclarer → déclarée → payée*, avec sa date pour chaque étape. La carte Conformité en dépend.

**5. Ne pas perdre le vocabulaire.** Les libellés du prototype sont le fruit d'itérations avec
l'utilisateur : « Ton solde n'est pas tout à toi », « versable », « dus », « à déclarer », « pas de
banque », « pièce manquante ». Les reprendre littéralement. Ce sont eux qui rendent l'outil
compréhensible sans formation comptable.

**6. Garder les deux mécanismes structurants** : le pliage avec synthèse `data-fold` (replier ne perd
jamais l'information) et la couleur fixe par type de charge (une charge garde sa couleur partout).

---

## Files

Tous dans `app/` de ce bundle.

**Partagé**
| fichier | rôle |
|---|---|
| `freel-etat.js` | store financier — faits + dérivés + binder `data-fx` |
| `freel-depenses.js` | store dépenses & opérations bancaires |
| `freel.js` | icônes, `FreelSheet`, `FreelToast`, `FreelForms`, sous-onglets |
| `freel-fold.js` | pliage des cartes + synthèse `data-fold` |
| `freel-docs.js` | notes de documentation embarquées |
| `freel.css` | tokens, grille, cartes, responsive |
| `image-slot.js` | emplacement de dépôt d'image (justificatifs) |

**Écrans**
| écran | HTML | logique |
|---|---|---|
| Pilote | `Pilote - Le Flux.html` | `pilote-flux.js`, `pilote-quickacts.js` |
| Activité | `Activité - Plan de charge.html` | `activite-app.jsx` |
| Argent | `Argent - Trésorerie & Performance.html` | `argent-app.jsx` |
| Achats | `Achats - Justificatifs & Banque.html` | `achats-app.jsx` |
| Outils | `Outils - Simulateurs.html` | `outils-app.jsx` |
| Config | `Config.html` | `config-app.jsx` |

**Ordre de chargement** (important) : `freel-depenses.js` → `freel-etat.js` (il lit le store dépenses)
→ `freel.js` → script de page → `freel-docs.js` → `freel-fold.js`.

**Références** — `docs/Refonte - Inventaire & Organisation.html` (52 éléments inventoriés, statut
conservé / fusionné / approfondi) et `docs/Refonte - Couverture fonctionnelle.html` (33 fonctions du
code d'origine, chacune recasée) : à consulter pour vérifier qu'une fonction de l'app existante a bien
sa place dans la nouvelle organisation.

**Ouvrir** — `app/Pilote - Le Flux.html` directement dans un navigateur, sans serveur.
Réinitialiser les données : `FreelEtat.reset()` et `FreelDepenses.reset()` en console.
