# Handoff — Freel V1.11 (build 10)

## Overview

Freel est le poste de pilotage d'un indépendant en micro-BNC (France) : combien il peut se verser sans se mettre en danger, ce qu'il doit à l'URSSAF et au fisc, où il en est de ses seuils, si sa comptabilité tient (justificatifs, rapprochement bancaire, livre des recettes).

Six écrans : **Pilote**, **Activité & congés**, **Argent**, **Achats**, **Outils**, **Config**.

Ce bundle est la version **V1.11 / build 10**. Elle ajoute, par-dessus la V1.1 : quatre palettes commutables, une couche « indicateurs système » commune aux six écrans, un système d'alertes à deux niveaux, un dock de navigation mobile, un motif « texte replié derrière un i », et une passe complète de densité en portrait.

## About the design files

Les fichiers de ce bundle sont des **références de design écrites en HTML/CSS/JS** : des prototypes qui montrent l'apparence et le comportement voulus. **Ce n'est pas du code de production à copier tel quel.**

La tâche est de **recréer ces écrans dans l'environnement du codebase cible** (React, Vue, Svelte, SwiftUI, natif…) avec ses patterns et bibliothèques établis. Si aucun environnement n'existe encore, choisir la stack la plus adaptée et y implémenter les designs.

À reprendre fidèlement : la hiérarchie de l'information, les tokens, les règles de calcul, le vocabulaire (les libellés sont réfléchis), l'architecture à source unique de vérité.
À remplacer : les données de démonstration (`FACTS`, `seedExpenses`, `seedBank`, `FLOW`, `CA`, `CAP`, et les compteurs `allTodos()` du shell).

**L'annexe `annexe-architecture-build5.md` documente en détail les deux stores (`freel-etat.js`, `freel-depenses.js`), les règles de calcul, les écrans et le vocabulaire.** Elle reste valable — ce README ne décrit que ce que la V1.11 ajoute ou change.

## Fidelity

**Haute fidélité.** Couleurs, typographie, espacements, états et micro-interactions sont définitifs, sur les quatre palettes et dans les deux orientations.

---

## 1. Quatre palettes commutables

`app/v1.11.css` définit toute la matière en variables CSS, commutées par l'attribut `data-theme` sur `<html>` :

| `data-theme` | nom UI | intention |
|---|---|---|
| `sombre` (défaut) | Sombre | contrastes chauds, économe en batterie |
| `nuit` | Calme sombre | sauge/argile en version nuit, cartes nettement plus claires que le fond |
| `clair` | Clair | fond blanc, lecture longue durée |
| `calme` | Calme | sauge/argile, fond chaud, plus de personnalité |

Le choix est persisté dans `localStorage['freel-v111-theme']` et appliqué **avant le premier rendu** par un script inline en `<head>` de chaque page (évite le flash) :

```html
<script>try{document.documentElement.setAttribute('data-theme',localStorage.getItem('freel-v111-theme')||'sombre')}catch(e){document.documentElement.setAttribute('data-theme','sombre')}</script>
```

### Tokens (identiques dans les 4 palettes, seules les valeurs changent)

Surfaces : `--bg`, `--bg-tint` (halo radial du fond), `--panel`, `--panel-2`, `--panel-3`, `--card-a`/`--card-b` (dégradé de carte), `--rail-a`/`--rail-b`, `--top-a`/`--top-b` (barre du haut), `--dock` (fond translucide du dock mobile), `--scrim`.
Traits : `--line`, `--line-2`, `--tint-1`/`--tint-2`/`--tint-3` (survols et zébrures).
Texte : `--text`, `--muted`, `--muted-2` (tous ≥ 4,5:1 sur leur fond).
Couleurs de statut : `--green`, `--green-lite`, `--green-deep`, `--green-glow`, `--green-line`, `--amber`, `--amber-soft`, `--amber-line`, `--red`, `--red-soft`, `--red-line`, `--blue`, `--sable`, `--on-accent` (texte sur aplat vert).
Formes : `--r` (20–22 px), `--r-sm`, `--sh-1`, `--sh-2`, `--sh-3`, `--sh-sheet`.

Valeurs exactes : `app/v1.11.css`, quatre blocs en tête de fichier. **La couleur ne code qu'une donnée** — vert = fait/sain, ambre = en attente/à faire, rouge = en retard, bleu = information.

---

## 2. Couche « indicateurs système » (`app/v1.11-shell.js`)

Un seul script, chargé après le rendu de chaque page, qui injecte des éléments communs. Il ne fait **aucun calcul métier** : il lit les stores quand ils existent.

### 2.1 Pastilles de la barre du haut

Groupe `.sysbar` inséré dans `.topbar`, quatre pastilles, chacune ouvre un panneau latéral :

1. **Cloud** (icône nuage) — dernière synchro, appareils, chiffrement, emplacement courant, bouton « Resynchroniser ».
2. **Documents** (icône dossier, ou cadenas si coffre chiffré) — sélecteur d'emplacement : cet appareil, Google Drive, OneDrive, Dropbox, coffre chiffré Freel. Le libellé de la pastille = l'emplacement actif. Persisté dans `localStorage['freel-v111-sys'].drive`.
3. **Qonto** (icône portefeuille) — compte pro en lecture seule, mandat DSP2, opérations non traitées.
4. **Palette** (trois pastilles de couleur) — sélecteur des 4 palettes.

Sous 1320 px les libellés disparaissent, seules les icônes restent.

### 2.2 Alertes à deux niveaux

**Niveau 1 — badge par onglet.** Dans le rail, chaque onglet porte le nombre de sujets qui le concernent (`.navbadge`, pastille ambre) : Achats 5, Activité 1, Argent 1, Outils 1 quand le barème est périmé. En portrait le badge passe en coin de l'icône.

**Niveau 2 — indicateur « à traiter ».** Une pastille (`.todofab`) qui ne montre **que les sujets de l'onglet courant** ; sur **Pilote**, poste de pilotage, elle montre tout. Au clic : panneau « À traiter · <onglet> » listant chaque sujet (quantité, intitulé, contexte) avec son action : lien vers l'écran qui règle, ou action immédiate (« Actualiser » applique le barème et la ligne disparaît).

Placement : **dans la barre du haut** en desktop (classe `.inbar`, en tête du groupe de pastilles — jamais au-dessus d'un contrôle) ; **flottante** au-dessus du dock en portrait.

Source des sujets : `allTodos()` dans le shell — 3 opérations à relier, 1 dépense en attente, 1 justificatif manquant (Achats), 1 facture en retard (Activité), URSSAF T2 à provisionner (Argent), barème à appliquer (Outils). **À remplacer par une vraie requête** ; garder la structure `{tab, n, t, s, cta, href|act}`.

### 2.3 Barème / fraîcheur des valeurs

Millésime appliqué, date de vérification, sources (`urssaf.fr`, `impots.gouv.fr`, loi de finances), et le diff des valeurs qui changent (plafond micro-BNC, taux de cotisations, fin ACRE). L'action « Actualiser » bascule le millésime. Ce sujet **ne s'affiche plus en bandeau dans les écrans** : il vit dans la liste « à traiter » et dans le badge de l'onglet Outils.

### 2.4 Panneau latéral de repli

Les cinq écrans React ne chargent pas `freel.js` : le shell embarque son propre panneau (`scrim` + `aside.sheet` + `.sheet-h`/`.sheet-b`, fermeture par ✕, clic sur le voile, Échap) et route tout par `openSheet()` / `closeSheet()`, qui délèguent à `window.FreelSheet` quand il existe.

---

## 3. Motif « texte replié derrière un i »

Tout texte d'explication de plus de 70 caractères est remplacé par un bouton `.info` (petit « i » cerclé, 18 px) ; le texte devient un bloc `.explain` masqué.

- **survol** → le texte apparaît ;
- **clic** → il se fige (classe `pin`), re-clic → relâché ;
- deux placements : le « i » se pose **dans le titre** (`h1` de `.greet`, `.sect-h` de Config) ou **à la place du paragraphe** (notes de carte : `.pay-note`, note TVA, aides de champ `.help`, `p.muted` en carte).

Le shell applique le motif automatiquement (`collapse()`), et un `MutationObserver` le réapplique après chaque rendu React.

---

## 4. Responsive

### Portrait (≤ 760 px)

- **Dock flottant** (reprise de la V1.2) : le rail devient une pilule centrée en bas, `--dock` translucide + `backdrop-filter: blur(16px)`, rayon 100 px, défilement horizontal. **Seul l'onglet actif porte son libellé**, les autres sont en icône seule (six onglets dans 340 px). Actif = inversion (`background: var(--text)`, `color: var(--bg)`).
- **Barre du haut** compactée sur un rang : mois + flèches de période, pastilles, actions.
- **Un seul rang de filtres** dans Achats (période + comptes), défilement horizontal ; le libellé de période a été retiré du sélecteur — il vit en haut à gauche, encadré par ses flèches ‹ ›.
- **Flux du mois (Pilote)** : les trois colonnes (Entrées / Sorties / Rémunération) côte à côte, réduites au libellé + montant + sous-ligne ; bouton « Voir le détail » qui déplie les listes, où le statut n'est plus qu'un **point coloré** de 9 px.
- **Config** : la liste des sections passe en grille 2 colonnes compacte, sans sous-titre ni chevron (236 px au lieu de ~700).
- **Tableaux** larges : défilement horizontal dans leur carte (`.tblscroll`, `min-width` sur la table) au lieu de colonnes écrasées.
- Sous-onglets et piliers défilent au lieu de déborder ; aucun débordement horizontal de page (vérifié à 390 px sur les six écrans).
- La section « Six modules à construire » de Pilote (brief de conception, pas de l'app) est masquée en portrait.

### Paysage / desktop

Rail latéral 212 px, barre du haut sur un rang jusqu'à 1150 px (au-delà « Exporter » se réduit à son icône), grille 12 colonnes, panneau latéral 580 px.

---

## 5. Autres changements de la V1.11

- **Argent** : Trésorerie / Performance lus comme des **onglets de section** (libellé actif contrasté, inactif estompé, filet vert sous l'actif, séparateur sous la rangée) au lieu de deux cartes indistinctes.
- **Graphe CA réalisé vs encaissé** : valeurs **au-dessus** des barres, réalisé et encaissé tous deux libellés en **k€**.
- **Activité** : le calendrier affiche le nombre de **jours ouvrés** de la période visible (semaine ou mois).
- **Outils** : les lignes de tranche d'impôt sont insécables (libellé + plage sur une ligne, barre en dessous) — elles se cassaient caractère par caractère dans une colonne étroite.
- **Achats** : les trois pastilles d'état en double dans la barre (banque, drive, trombone) sont supprimées, la `.sysbar` les remplace.
- **Sauvegarde** : la pastille dédiée disparaît (redondante avec le cloud) ; la conservation des pièces est décrite dans le panneau Documents.

---

## 6. Fichiers

```
app/
  Pilote - Le Flux.html            écran 1 — HTML statique + pilote-flux.js / pilote-quickacts.js
  Activité - Plan de charge.html   écran 2 — React/JSX (activite-app.jsx)
  Argent - Trésorerie & ….html     écran 3 — React/JSX (argent-app.jsx)
  Achats - Justificatifs & ….html  écran 4 — React/JSX (achats-app.jsx)
  Outils - Simulateurs.html        écran 5 — React/JSX (outils-app.jsx)
  Config.html                      écran 6 — React/JSX (config-app.jsx)

  freel.css                        base V1.1 (structure, grille, composants)
  v1.11.css                        ⬅ V1.11 : les 4 palettes + toute la matière + responsive
  v1.11-shell.js                   ⬅ V1.11 : pastilles système, alertes, panneau de repli, motif « i »

  freel-etat.js                    store financier (faits / dérivé) — voir annexe
  freel-depenses.js                store dépenses & rapprochement — voir annexe
  freel-docs.js, freel-fold.js, freel.js, image-slot.js   utilitaires V1.1
INDEX.html                         sommaire des écrans et des versions
annexe-architecture-build5.md       architecture, stores, écrans, vocabulaire (build 5, toujours valable)
```

Ordre de chargement d'une page : `freel.css` → `v1.11.css` → script inline de palette → (React + Babel pour les écrans JSX) → stores → app de l'écran → `freel-fold.js` → `v1.11-shell.js`.

---

## 7. Limites du prototype

- Données de démonstration figées (juin 2026, `TODAY = 2026-06-10`).
- Les compteurs de « à traiter » sont des constantes du shell, pas une requête.
- Pas de backend : synchro, relevé bancaire, dépôt Drive et sauvegarde sont simulés par des toasts.
- Persistance limitée à `localStorage` (palette, emplacement des documents, millésime du barème, plan de charge).
- Les écrans JSX sont transpilés par Babel dans le navigateur : à recréer en composants compilés dans le codebase cible.
