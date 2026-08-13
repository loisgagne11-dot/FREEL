# Freel V1.11 — Système de design & règles responsive (extraction factuelle)

Sources lues intégralement :
- `v1.11.css` (404 lignes) — abrégé **[V11.CSS]**
- `freel.css` (452 lignes) — abrégé **[FREEL.CSS]**
- `v1.11-shell.js` (378 lignes) — abrégé **[SHELL.JS]**

`v1.11.css` est chargé **après** `freel.css` (déclaré en tête de fichier, `V11.CSS:3`) et ne fait que surcharger des variables et quelques classes ; `freel.css` reste la base structurelle. Cette relation de cascade a des conséquences directes documentées en §7.

---

## 1. Tokens — table de vérité des 4 palettes

Les 4 palettes sont portées par `:root,[data-theme="sombre"]` (`V11.CSS:10-32`), `[data-theme="clair"]` (`V11.CSS:35-56`), `[data-theme="calme"]` (`V11.CSS:59-81`), `[data-theme="nuit"]` (`V11.CSS:84-106`).

**Piège d'héritage à noter avant la table** : le sélecteur du bloc sombre est `:root,[data-theme="sombre"]` — il s'applique donc à `:root` **quel que soit** l'attribut `data-theme` réellement posé sur `<html>`. `--r` et `--r-sm` ne sont **redéfinis** que dans les blocs sombre, calme et nuit ; le bloc clair ne les redéclare pas. Résultat : en thème `clair`, `--r`/`--r-sm` valent quand même `20px`/`13px` (hérités de la règle `:root`), pas une valeur "claire" dédiée. C'est un couplage caché entre deux thèmes qui ne serait pas reproductible tel quel dans un système à tokens strictement isolés par thème.

| Token | sombre (`V11.CSS:10-32`) | nuit (`V11.CSS:84-106`) | clair (`V11.CSS:35-56`) | calme (`V11.CSS:59-81`) |
|---|---|---|---|---|
| `--bg` | `#090c0a` | `#15170f` | `#f6f8f6` | `#f1efe6` |
| `--bg-tint` | `#121a14` | `#1f2318` | `#e7efe9` | `#e4e6d4` |
| `--panel` | `#111511` | `#212418` | `#ffffff` | `#fffdf7` |
| `--panel-2` | `#171c16` | `#262a1d` | `#ffffff` | `#fffdf7` |
| `--panel-3` | `#1d231b` | `#2f3325` | `#eef1ed` | `#ebe8d9` |
| `--line` | `rgba(196,214,196,.07)` | `rgba(226,231,201,.10)` | `rgba(28,40,33,.10)` | `rgba(38,40,31,.11)` |
| `--line-2` | `rgba(196,214,196,.13)` | `rgba(226,231,201,.19)` | `rgba(28,40,33,.18)` | `rgba(38,40,31,.19)` |
| `--tint-1` | `rgba(196,214,196,.025)` | `rgba(226,231,201,.035)` | `rgba(28,40,33,.028)` | `rgba(38,40,31,.03)` |
| `--tint-2` | `rgba(196,214,196,.045)` | `rgba(226,231,201,.06)` | `rgba(28,40,33,.045)` | `rgba(38,40,31,.05)` |
| `--tint-3` | `rgba(196,214,196,.07)` | `rgba(226,231,201,.10)` | `rgba(28,40,33,.08)` | `rgba(38,40,31,.09)` |
| `--text` | `#eef2ec` | `#eeeade` | `#18201c` | `#26281f` |
| `--muted` | `#8b9489` | `#a9ab95` | `#5c6862` | `#5f6153` |
| `--muted-2` | `#646b62` | `#8b8d78` | `#69736c` | `#75776a` |
| `--green` | `#5fd39a` | `#a3c489` | `#17845a` | `#6f8f61` |
| `--green-lite` | `#6fdca6` | `#b4d49b` | `#1d9668` | `#7d9b6f` |
| `--green-deep` (redéf. par v1.11) | `#1d6644` | `#3b4a2c` | `#d6ebe0` | `#e2eddb` |
| `--green-glow` | `rgba(95,211,154,.12)` | `rgba(163,196,137,.15)` | `rgba(23,132,90,.09)` | `rgba(125,155,111,.15)` |
| `--green-line` | `rgba(95,211,154,.28)` | `rgba(163,196,137,.38)` | `rgba(23,132,90,.3)` | `rgba(125,155,111,.42)` |
| `--amber` | `#e0b672` | `#dcb578` | `#8d6413` | `#8a6224` |
| `--amber-soft` | `rgba(224,182,114,.13)` | `rgba(220,181,120,.15)` | `rgba(196,152,44,.14)` | `#f3e4cd` (couleur plate, pas rgba) |
| `--amber-line` | `rgba(224,182,114,.28)` | `rgba(220,181,120,.34)` | `rgba(196,152,44,.4)` | `rgba(196,160,106,.55)` |
| `--red` | `#e2715f` | `#d18a72` | `#b13c28` | `#96432f` |
| `--red-soft` | `rgba(226,113,95,.14)` | `rgba(209,138,114,.16)` | `rgba(177,60,40,.10)` | `#f2ded8` (couleur plate) |
| `--red-line` | `rgba(226,113,95,.3)` | `rgba(209,138,114,.36)` | `rgba(177,60,40,.32)` | `rgba(192,112,92,.5)` |
| `--blue` | `#6fb6e0` | `#8fb2c6` | `#2b6ba6` | `#5f7f96` |
| `--sable` | `#cba86f` | `#cba87a` | `#a07c3a` | `#c4a06a` |
| `--on-accent` | `#04140c` | `#191c10` | `#ffffff` | `#ffffff` |
| `--rail-a` | `#121712` | `#1a1d13` | `#ffffff` | `#eae7db` |
| `--rail-b` | `#090c0a` | `#15170f` | `#f0f3f0` | `#e3e0d2` |
| `--top-a` | `rgba(9,12,10,.97)` | `rgba(21,23,15,.97)` | `rgba(255,255,255,.97)` | `rgba(241,239,230,.97)` |
| `--top-b` | `rgba(9,12,10,.82)` | `rgba(21,23,15,.82)` | `rgba(255,255,255,.85)` | `rgba(241,239,230,.84)` |
| `--scrim` | `rgba(4,6,4,.68)` | `rgba(10,12,6,.66)` | `rgba(20,30,25,.34)` | `rgba(38,40,31,.38)` |
| `--dock` | `rgba(23,28,22,.9)` | `rgba(40,44,30,.9)` | `rgba(255,255,255,.9)` | `rgba(255,253,247,.9)` |
| `--card-a` | `var(--panel-2)` | `#282c1e` | `#ffffff` | `#fffdf7` |
| `--card-b` | `var(--panel)` | `#232619` | `#ffffff` | `#fdfbf3` |
| `--r` | `20px` | `22px` | **hérité** (20px, via règle `:root` du bloc sombre — non redéfini) | `22px` |
| `--r-sm` | `13px` | `14px` | **hérité** (13px, idem) | `14px` |
| `--sh-1` | `0 1px 2px rgba(0,0,0,.4)` | `0 1px 2px rgba(0,0,0,.35)` | `0 1px 2px rgba(24,34,28,.06)` | `0 1px 2px rgba(38,40,31,.07)` |
| `--sh-2` | `0 2px 6px rgba(0,0,0,.32),0 22px 44px -24px rgba(0,0,0,.9)` | `0 1px 3px rgba(0,0,0,.3),0 18px 38px -22px rgba(0,0,0,.85)` | `0 1px 2px rgba(24,34,28,.05),0 10px 26px -18px rgba(24,34,28,.28)` | `0 1px 3px rgba(38,40,31,.06),0 12px 28px -20px rgba(38,40,31,.34)` |
| `--sh-3` | `0 4px 12px rgba(0,0,0,.38),0 34px 60px -26px rgba(0,0,0,.95)` | `0 3px 8px rgba(0,0,0,.36),0 30px 56px -24px rgba(0,0,0,.9)` | `0 2px 5px rgba(24,34,28,.07),0 20px 40px -20px rgba(24,34,28,.34)` | `0 3px 6px rgba(38,40,31,.08),0 22px 44px -22px rgba(38,40,31,.4)` |
| `--sh-sheet` | `-30px 0 90px rgba(0,0,0,.7)` | `-26px 0 80px rgba(0,0,0,.6)` | `-24px 0 70px rgba(24,34,28,.20)` | `-24px 0 70px rgba(38,40,31,.22)` |
| `color-scheme` | `dark` | `dark` | `light` | `light` |
| **Tokens fixes hérités de `freel.css` — jamais redéfinis par les 4 palettes v1.11 (identiques dans les 4)** | | | | |
| `--mono` (`FREEL.CSS:35`) | `"JetBrains Mono",ui-monospace,monospace` | idem | idem | idem |
| `--c-urssaf` (`FREEL.CSS:28`) | `var(--amber)` — **se re-thème automatiquement** (résolution live de la var) | idem | idem | idem |
| `--c-urssaf-bg` | `var(--amber-soft)` — idem, re-thémé | idem | idem | idem |
| `--c-tva` (`FREEL.CSS:29`) | `var(--blue)` — re-thémé | idem | idem | idem |
| `--c-tva-bg` | `var(--blue-soft)` — **valeur fixe** (voir ligne suivante), ne se re-thème pas | idem | idem | idem |
| `--c-ir` (`FREEL.CSS:30`) | `#b79ae4` (couleur en dur) | idem | idem | idem |
| `--c-ir-bg` | `rgba(183,154,228,.14)` | idem | idem | idem |
| `--c-cfe` (`FREEL.CSS:30`) | `#d9926a` | idem | idem | idem |
| `--c-cfe-bg` | `rgba(217,146,106,.14)` | idem | idem | idem |
| `--slate` (`FREEL.CSS:34`) | `#7c8794` | idem | idem | idem |
| `--slate-soft` | `rgba(124,135,148,.14)` | idem | idem | idem |
| `--blue-soft` (`FREEL.CSS:26`) | `rgba(111,182,224,.13)` | idem | idem | idem |

**Total : 41 tokens thémés (redéfinis dans les 4 palettes de `V11.CSS`) + 12 tokens fixes hérités de `freel.css` = 53 tokens de design recensés.**

Points d'attention pour la reprise :
- `--c-urssaf` et `--c-tva` *semblent* fixes mais se recolorent en réalité automatiquement (indirection `var()`), alors que `--c-ir`, `--c-cfe`, `--slate`, `--blue-soft` sont des couleurs en dur qui ne changeront **jamais** selon le thème — à auditer en contraste sur `clair`/`calme` avant portage (voir §7).
- `--amber-soft` et `--red-soft` passent d'une notation `rgba(...)` (sombre/nuit/clair) à une couleur plate opaque (`#f3e4cd`, `#f2ded8`) dans `calme` (`V11.CSS:67-68`) — non homogène entre thèmes mais sans conséquence visuelle si le fond derrière est toujours `--panel`/`--panel-2`.

---

## 2. Typographie et espacements

### Familles et graisses

| Élément | Valeur | Source |
|---|---|---|
| Police texte | `"Hanken Grotesk", system-ui, sans-serif` | `FREEL.CSS:41` (jamais redéfini par v1.11 → hérité partout) |
| Police mono (chiffres, montants) | `"JetBrains Mono", ui-monospace, monospace` (token `--mono`) | `FREEL.CSS:35`, utilisé par `.num`, `.big`, `.month b`(non — voir note), `.yearsel`, `.tl .when`, `.brk .bv`, `.donut .dc b`, etc. |
| Corps de texte, taille de base | `14px` (`FREEL.CSS:42`) → surchargé `14.5px` (`V11.CSS:108`) | — |
| Interlignage corps | `1.45` | `FREEL.CSS:43` (non retouché par v1.11 → hérité) |
| Lettrage corps | `-.005em` (ajouté par v1.11 seulement) | `V11.CSS:108` |
| Graisses observées | 500 (nav par défaut, label de champ), 600 (bouton, titre de page, `.greet h1`, `.lrow .ttl`), 650 (`.pick b`, `.todo .tt b`, `.todofab`), 700 (`.brand`, `.big` mono, `.bdg`), 800 (`.todofab b`) | `FREEL.CSS:57,59,84,102,240` ; `V11.CSS:240,263,281,288,200` |

### Échelle de tailles de police (valeurs relevées, du plus petit au plus grand)

| Taille | Usage | Source |
|---|---|---|
| 9px / 9.5px | libellés nav du dock mobile (icône seule, label masqué) | `V11.CSS:370` (`.fcol-t`), `FREEL.CSS:430` |
| 10px | `.tbl th` (v1.11) | `V11.CSS:172` |
| 10.5px | `.lbl` (v1.11), `.tbl th` (freel), `.navbadge` mobile | `V11.CSS:111,350`, `FREEL.CSS:258` |
| 11px | `.lbl` (freel), `.chip2` (v1.11), `.info` | `FREEL.CSS:47`, `V11.CSS:199,250` |
| 11.5px | `.chip2` (freel), `.greet .tag` (v1.11) | `FREEL.CSS:229`, `V11.CSS:148` |
| 12–12.5px | `.freshbar button`, `.pick span`, `.dec .d`, boutons `sm` | `V11.CSS:210,241`, `FREEL.CSS:192` |
| 13–13.5px | `.btn`, `.subtab`, `.greet p`, `.field label` | `FREEL.CSS:84,216,103,296` |
| 14–14.5px | `.nav`, `.lrow .ttl`, `.dec .t`, `.pick b` | `FREEL.CSS:59,240,191`, `V11.CSS:167,194,240` |
| 15.5–16.5px | `.pillars .pillar .pt b`, `.month b` (v1.11) | `V11.CSS:300,122` |
| 17px | `.month b` (freel), `.pagetitle` | `FREEL.CSS:75,80` |
| 20–27px | `.kpi .big` (25→27px v1.11), `.donut .dc b.eur` (23px), `.greet h1` mobile (20px) | `FREEL.CSS:225`, `V11.CSS:159` |
| 23–26px | `.brand` (22→23px), `.greet h1` (23→26px) | `FREEL.CSS:57,102`, `V11.CSS:115,146` |
| 30–46px | `.resultbox .rv` (30px), `.versable .big` (42→46px) | `FREEL.CSS:377,140`, `V11.CSS:161` |

### Lettrage (letter-spacing) — échelle observée

`-.045em` (`.brand` v1.11) · `-.035em`/`-.03em` (`.big`, `.greet h1`) · `-.02em` (`.pagetitle`, `.month b`, `.versable .big`) · `-.015em` (`.lrow .ttl`, `.dec .t`) · `-.01em` (`.pick b`) · `-.005em` (corps de texte) · `.02em` (`.greet .tag`) · `.03em` (`.chip2` v1.11) · `.04em` (`.lrow .rt .vl`) · `.06em`/`.09em` (`.tbl th`, `.lbl` freel) · `.1em`/`.11em` (`.tbl th`, `.lbl` v1.11) · `.12em` (`.sect`, v1.11 uniquement).

### Rayons (border-radius)

| Token/valeur | Usage | Source |
|---|---|---|
| `--r` (20/22px selon thème, voir §1) | `.card`, `.kpi` | `FREEL.CSS:107,224`, `V11.CSS:152,157` |
| `--r-sm` (13/14px) | défini mais **aucun consommateur trouvé** dans les 2 fichiers CSS lus (probable usage dans les `.jsx` non ouverts) | `V11.CSS:26,75,100` |
| 9–12px | boutons icône, champs, `.nav` | `FREEL.CSS:59,76,297` |
| 14–18px | `.bigfield`, `.dropzone`, `.resultbox`, `.cfg-item` (mobile 14px) | `FREEL.CSS:363,378,377`, `V11.CSS:219,220,223` |
| 20px / 100px (pilule) | `.chip2`, `.bdg`, `.navbadge`, `.subtabs`/`.subtab`, `.pick`, `.dec .act`, `.todofab`, `.freel-toast` | multiples, ex. `V11.CSS:178,199,200,262,237` |
| 50% (cercle) | `.ring`, `.donut`, points de statut (`.st`, `.st-pill`, `i` des sysbar) | `FREEL.CSS:144,265`, `V11.CSS:379` |

### Espacements

**Aucune variable CSS d'espacement n'est déclarée** (pas de `--space-*`/`--gap-*`) : tous les `gap`/`padding`/`margin` sont des valeurs px codées en dur par règle. Valeurs récurrentes observées : `2,3,4,5,6,7,8,9,10,11,12,13,14,16,18,20,22,24,26,30px` — une progression proche d'une échelle par paliers de ~2px sans être formalisée en token. À reconstituer/normaliser explicitement dans la stack cible (aucune échelle d'espacement n'existe à extraire telle quelle).

---

## 3. Inventaire des composants

Origine : **[F]** = défini dans `freel.css` (base V1.1), **[V]** = introduit ou redéfini par `v1.11.css`/`v1.11-shell.js`.

| Composant / classe | Origine | Rôle | Variantes | États |
|---|---|---|---|---|
| `.card` | F `FREEL.CSS:107` / V `V11.CSS:152` | Conteneur panneau de base | `.glow` (accent vert), `.clickable` (carte navigable), `.folded` (repli, piloté par `freel-fold.js`, hors périmètre lu), `body.show-fn .card` (mode annotation dev) | hover (`.clickable`: translateY, ombre `--sh-3`, bordure verte) ; pas de focus/disabled dédiés |
| `.kpi` | F `FREEL.CSS:224` / V `V11.CSS:157` | Tuile de statistique | barre d'accent verte `::before` (V uniquement) | aucun |
| `.chip2` | F `FREEL.CSS:229` / V `V11.CSS:199` | Étiquette de statut compacte | `.ok`/`.warn`/`.bad`/`.blue` (F, mapping direct vert/ambre/rouge/bleu) | aucun |
| `.bdg` | V uniquement `V11.CSS:200-204` | Badge de statut de facture | `.paid` (vert), `.sent` (ambre), `.late` (rouge), `.draft` (neutre) | aucun (label statique) |
| `.subtabs` / `.subtab` | F `FREEL.CSS:215-220` / V `V11.CSS:178-180` | Onglet de section (groupe pilule) | `.subtab.on` (actif) ; `.tabpane`/`.tabpane.on` (panneau associé) | hover (non-actif), actif ; **aucun rôle ARIA tab/tablist** |
| `.pillars` / `.pillar` | V uniquement `V11.CSS:293-301` | Sous-onglet "pilier" (Argent : Trésorerie/Performance) | `.pillar.on` (soulignement vert 2px) | hover (opacité .9 + fond tint), actif |
| `.tbl` | F `FREEL.CSS:257-262` / V `V11.CSS:171-175` | Tableau de données | `.tot` (ligne total) | hover ligne (tint de fond) |
| `.tblscroll` / `.atbl` / `.atbl-wrap` | V `V11.CSS:310-314` / F `FREEL.CSS:445` | Conteneur de défilement horizontal anti-débordement pour tableaux larges | `.atbl{min-width:660px}` | — |
| `.sheet` / `.sheet-h` / `.sheet-b` / `.scrim` | F `FREEL.CSS:313-329` / V `V11.CSS:226-234` | Panneau latéral (drawer) + fond assombri | largeur `min(560/580px,94vw)` | `.open` (scrim et sheet) ; mobile ≤760px : plein écran, sans bordure/radius |
| `.rail` | F `FREEL.CSS:52-56` / V (redéfinition mobile) `V11.CSS:339-351` | Navigation principale | Desktop = rail latéral 212px (F) ; portrait ≤760px = **barre d'onglets bas** selon F (`FREEL.CSS:428`) **mais réécrite en dock flottant pilule** par V (`V11.CSS:339-341`, prioritaire car chargé après) | `.nav.on` (actif) |
| `.dock` (habillage visuel du rail mobile) | V uniquement, via token `--dock` | Fond flou du rail flottant en portrait | — | — |
| `.topbar` | F `FREEL.CSS:69-73` / V `V11.CSS:121` | Barre supérieure sticky | — | — |
| `.btn` | F `FREEL.CSS:84-89` / V `V11.CSS:123-126` | Bouton | `.primary` (rempli vert), `.sm` (F, compact) | hover ; **pas de `:focus-visible` ni `:disabled` stylé** |
| `.ico-btn` / `.iconbtn` | F `FREEL.CSS:76,247` / V `V11.CSS:123,168` | Bouton icône seule | — | hover |
| `.field` (input/select) | F `FREEL.CSS:295-298` / V `V11.CSS:217-218` | Champ de saisie | — | `:focus` : F = bordure verte seule (pas d'anneau) ; V ajoute `box-shadow` anneau vert — **amélioration a11y de V sur F** |
| `.bigfield` | F `FREEL.CSS:363-367` / V `V11.CSS:219` | Champ de saisie mis en avant (simulateurs) | — | `:focus` (input interne, outline none) |
| `.dropzone` | F `FREEL.CSS:378-381` / V `V11.CSS:220-222` | Zone de dépôt de fichier | `.has` (fichier déposé, V) | hover |
| `.resultbox` | F `FREEL.CSS:376-377` / V `V11.CSS:223` | Encart de résultat de calcul | — | — |
| `.bars` / `.b` / `.col` / `.stk` / `.cabars` | F `FREEL.CSS:271-278` / V `V11.CSS:317-320` | Graphique en barres mensuel | `.col.cur` (période courante), `.col.proj` (hachures diagonales = projection, code visuel distinct des couleurs de statut), `.cabars` (variante CA : valeur au-dessus de la barre) | — |
| `.ring` / `.donut` | F `FREEL.CSS:143-148,264-269` / V `V11.CSS:322-324` (réassertion du fond du trou) | Anneau de santé / donut de répartition | `.donut.lg` (F) | — |
| `.plot` / `.ev` / `.tl` | F `FREEL.CSS:167-208` | Graphe de trésorerie (SVG) + timeline d'échéances | `.ev .pin.in/.out/.flag` (entrée/sortie/alerte), `.tl .mk.soon/.crit` (marqueur proche/critique) | — |
| **Calendrier** | non trouvé | Aucune classe `.cal`/`.calendar` dans les 2 CSS lus — absent de ce périmètre (probablement dans les `.jsx`/`freel-etat.js`, hors lecture demandée) | — | — |
| `.freel-toast` | F `FREEL.CSS:384-387` / V `V11.CSS:231` | Notification pilule bas d'écran | `.ok` (F) | `.show` (F) |
| `.info` / `.explain` / `.fluxfold` | V uniquement `V11.CSS:249-256,384` | Pastille "i" de repli d'explication longue | `.explain.pin` (épinglé au clic), `.explain.open` (visible), `.fluxfold` (pilule "voir le détail", mobile uniquement) | hover/`aria-expanded="true"` (survol/pin) |
| `.sysbar` | V uniquement `V11.CSS:130-142` | Barre de pastilles système (cloud/drive/banque/thème) | `.w` (ambre = attention), `.l` (rouge = retard), `.thm` (icône double-pastille couleur) | hover |
| `.navbadge` | V uniquement `V11.CSS:262,350` | Badge numérique sur item de nav | position différente en mobile (absolu sur icône) | — |
| `.todofab` / `.todo` | V uniquement `V11.CSS:263-290` | Bouton flottant/inline d'agrégat "à traiter" + ligne de la liste associée | `.todofab.ok` (tout traité, vert), `.todofab.inbar` (ancré dans la topbar desktop) | hover ; masquage du libellé `em` <1320px et <1150px |
| `.pick` | V uniquement `V11.CSS:237-247` | Ligne sélectionnable dans un panneau (choix de drive/thème) | `.pick.on` (sélectionné), `.swatches` (pastilles de couleur pour l'aperçu de thème) | hover |
| `.cfg-list` / `.cfg-item` | F `FREEL.CSS:284-293` / V (mobile) `V11.CSS:353-358` | Liste de navigation de la page Config | `.cfg-item.on` | hover ; mobile = grille 2 colonnes compacte, sous-titre et chevron masqués |
| `.freshbar` | V uniquement `V11.CSS:206-211` | Bandeau de fraîcheur des barèmes | `.ok` (à jour, vert) vs défaut (ambre = attente) | hover (bouton interne) |
| `.tweakbar` | F `FREEL.CSS:301-312` | Barre de réglages dev (blur confidentialité, annotations) | interrupteurs `input[type=checkbox]` stylés | `:checked` |
| `body.privacy` | F `FREEL.CSS:331-349` | Utilitaire transverse : floute les montants | — | `:hover` (démasque localement) |
| `.buildtag` | F `FREEL.CSS:4-7` | Pastille de build/dev avec pouls animé | — | animation continue |

---

## 4. Règles responsive — exhaustif

**8 media queries au total** (5 dans `V11.CSS`, 3 dans `FREEL.CSS`).

| # | Fichier:ligne | Breakpoint | Régime | Ce qui change |
|---|---|---|---|---|
| 1 | `V11.CSS:141` | `max-width:1320px` | Intermédiaire (label-hiding, indépendant du grid) | `.sysbar em{display:none}` (texte des pastilles système masqué), `.sysbar button{padding:7px 9px}` (resserré), forçage `.sysbar{display:inline-flex!important}` |
| 2 | `V11.CSS:269` | `max-width:1320px` | Intermédiaire | `.todofab.inbar em{display:none}` — le libellé "à traiter" du bouton ancré en topbar disparaît, ne laisse que le compteur |
| 3 | `V11.CSS:271-279` | `max-width:1150px` | Intermédiaire | Boutons secondaires de la topbar réduits à leur icône (`.lbl-t{display:none}`), paddings resserrés sur `.topbar`, `.sysbar button`, `.topbar .month .ico-btn`, `.todofab.inbar` |
| 4 | `V11.CSS:314` | `max-width:900px` | Intermédiaire | Anti-débordement : `.card:has(>table),.card:has(>.tbl2){overflow-x:auto}`, `.tbl2,.tbl{min-width:540px}`, et **remise à zéro `min-width:0`** sur `.grid>*,.grid12>*,.kpis>*,.kpis2>*,.card` (empêche l'éclatement de la grille par du contenu incompressible) |
| 5 | `V11.CSS:327-404` | `max-width:760px` | **Portrait** | Bloc majeur — voir détail ci-dessous |
| 6 | `FREEL.CSS:418-425` | `max-width:1080px` | Intermédiaire → bascule de grille | `.span3/4/5{grid-column:span 6}`, `.span6-9{grid-column:span 12}` (idem `.s3..s9`), `.kpis`/`.kpis2{grid-template-columns:repeat(2,1fr)}` |
| 7 | `FREEL.CSS:426-448` | `max-width:760px` | **Portrait** (règle de base, réécrite ensuite par #5) | `.rail` devient barre d'onglets **fixe en bas** (ligne, icône+micro-label) — *mais cette version est supplantée par `V11.CSS:339-351` qui la transforme en dock flottant pilule, car v1.11 charge après* ; `.app{display:block}` ; tous les `span*`/`s*` forcés à `span:12`; `.kpis`→2 col ; `.search{display:none}` ; `.greet` empilé ; `.atbl-wrap,.tblscroll{overflow-x:auto}` ; `.mcard{width:calc(100vw - 20px);max-height:88vh}` ; `.frow2` → 1 colonne |
| 8 | `FREEL.CSS:449-452` | `max-width:720px` | **Portrait, palier redondant** | Reforce `[class*=span]{grid-column:span 12!important}` (déjà fait à 760px — duplication/chevauchement fragile) et `.frow{grid-template-columns:1fr}` |

### Détail du bloc portrait `V11.CSS:327-404` (le régime le plus riche)

- Contenu : `.content{padding:12px 12px 20px}`, `.card{padding:15px 14px;border-radius:17px}`, `.greet h1{font-size:20px}`.
- Topbar : une seule ligne compacte (`padding:7px 12px`), `.sysbar{margin-left:auto}`.
- **Rail → dock flottant pilule** (`V11.CSS:340`) : centré (`left:50%;transform:translateX(-50%)`), position `bottom:calc(13px + env(safe-area-inset-bottom))`, `border-radius:100px`, fond `--dock` + `backdrop-filter:blur(16px)`, **défilement horizontal** (`overflow-x:auto;scrollbar-width:none`) si trop d'items. Item actif seul affiche son libellé (`font-size:0` par défaut, `13px` sur `.on`).
- `.navbadge` repositionné en absolu sur l'icône (`top:2px;left:26px`).
- Config (`.cfg-list`) : grille 2 colonnes de pastilles compactes, sous-titre/chevron masqués.
- Pilote : `#yearBtn`, `#twToggle`, `#blurToggle`, `.ico-btn` masqués dans la topbar (ne garde que l'essentiel) ; `#props` (section "modules à construire") **entièrement masquée** sur téléphone (brief de conception jugé hors périmètre mobile).
- Flux du mois : 3 colonnes forcées côte à côte (`.flux3{grid-template-columns:repeat(3,1fr)}`), détail repliable via `.fluxfold` (`.fcol .fitems{display:none}` sauf `.fluxopen`), statuts réduits à un point de couleur de 9px (`.st-pill`).
- Filtres/onglets/piliers : `.perbar`, `.pillars`, `.subtabs`, `.subtabs2`, `.quickacts` passent tous en **rangée unique à défilement horizontal**, scrollbar masquée (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`).
- `.sheet{width:100vw;border-left:none;border-radius:0}` — panneau latéral devient plein écran.

### Les 3 régimes en synthèse

| Régime | Bornes | Rail/nav | Grille | Topbar |
|---|---|---|---|---|
| Desktop | > 1150/1320px (aucune borne haute dédiée à la grille) | Rail latéral fixe 212px (`FREEL.CSS:53`) | 12 colonnes, spans variés (3 à 9) | Tous libellés visibles |
| Intermédiaire | 761px – 1320px, avec paliers à 1320/1150/1080/900px | Rail toujours latéral 212px (inchangé jusqu'à 760px) | Bascule à 1080px : spans 3-5→6, 6-9→12 ; kpis 4→2 col | Perte progressive des libellés (sysbar puis boutons secondaires) ; protection anti-débordement des tableaux à 900px |
| **Portrait** | ≤ 760px (écho redondant à 720px) | Dock flottant pilule (V) qui **remplace** la barre d'onglets bas de F | Tous les spans forcés à 12 (empilement total) | Une seule ligne compacte, recherche masquée, contrôles secondaires masqués |

### Garanties anti-débordement horizontal (liste exhaustive)

| Mécanisme | Où | Source |
|---|---|---|
| `.tblscroll{overflow-x:auto}` + `.atbl{min-width:660px}` | Tableaux larges, défilement plutôt que colonnes écrasées | `V11.CSS:311-312` |
| `.card:has(>table),.card:has(>.tbl2){overflow-x:auto}` + `min-width:540px` | Idem pour cartes contenant un tableau brut, dès 900px | `V11.CSS:314` |
| `.grid>*,.grid12>*,.kpis>*,.kpis2>*,.card{min-width:0}` | Neutralise le `min-width:auto` implicite des enfants de grille/flex (évite l'éclatement par contenu incompressible) | `V11.CSS:314` |
| `.atbl-wrap,.tblscroll{overflow-x:auto}` | Répété côté freel.css à 760px | `FREEL.CSS:445` |
| `.perbar`, `.pillars`, `.subtabs`, `.subtabs2`, `.quickacts` en `overflow-x:auto;flex-wrap:nowrap` + scrollbar masquée | Filtres/onglets qui défilent au lieu de se tasser/wrapper en portrait | `V11.CSS:386-402` |
| `.rail{overflow-x:auto;scrollbar-width:none}` | Dock mobile défile si trop d'items plutôt que de déborder | `V11.CSS:340-341` |
| `text-overflow:ellipsis` + `white-space:nowrap` | `.rail .nav .nl`, `.card .brk .bt span`, nombreux libellés/chiffres | `V11.CSS:261,306` ; `FREEL.CSS:431` |
| `max-width:40ch` + `text-wrap:balance` | `.greet h1` — qualité de retour à la ligne, pas anti-débordement strict | `FREEL.CSS:102` |

---

## 5. Comportements du shell (`v1.11-shell.js`)

Le script s'exécute une fois par page (IIFE), sur **chacun des 6 écrans HTML statiques**, et n'a aucune notion de composant : il mute le DOM existant a posteriori.

### `.sysbar` et ses panneaux

`mount()` (`SHELL.JS:273-282`) injecte une `<div class="sysbar" id="v11Sys">` dans `.topbar` (repérage par ancre : remplace `.synced` si présent, sinon s'insère avant `#yearBtn`, sinon après le `.grow`, sinon en fin de topbar). `render()` (`SHELL.JS:248-259`) y peuple **4 pastilles cliquables** via `chips()` (`SHELL.JS:239-247`) : `cloud`, `drive` (libellé = fournisseur actif), `bank`, `theme`. Chaque clic (`data-sys`) ouvre un panneau via `openSheet(TITLES[k], PANELS[k]())`.

Le registre `PANELS` (`SHELL.JS:101-166`) contient en réalité **6 constructeurs de panneau** : `cloud`, `drive`, `todo`, `theme`, `bank`, `bareme`. Les 4 premiers (hors `todo`/`bareme`) sont exposés directement comme pastilles de la sysbar ; `todo` est atteint via le bouton flottant `.todofab`/`.navbadge` (niveau 2 d'alerte, voir plus bas), et `bareme` est atteint soit via le bandeau `.freshbar` (`#v11Fresh`), soit via une ligne `data-todo="bareme"` de la liste todo elle-même.

| Panneau | Contenu | Source |
|---|---|---|
| `cloud` | État de synchro, appareils connectés, chiffrement, emplacement des documents | `SHELL.JS:102-112` |
| `drive` | Choix du fournisseur de stockage (local/Drive/OneDrive/Dropbox/coffre chiffré) | `SHELL.JS:113-124` |
| `todo` | Liste "à traiter" complète | `SHELL.JS:125-134` |
| `theme` | Sélecteur des 4 palettes avec aperçu de 3 couleurs | `SHELL.JS:135-142` |
| `bank` | État de la connexion bancaire (lecture seule), opérations non traitées | `SHELL.JS:143-154` |
| `bareme` | Fraîcheur du barème fiscal en vigueur, écarts si obsolète | `SHELL.JS:155-165` |

### Système d'alertes à 2 niveaux

- **Niveau 1 — `.navbadge`** : pastille passive posée sur chaque item de nav concerné. `countBy()` (`SHELL.JS:199-201`) agrège `allTodos()` par `tab` ; `badges()` (`SHELL.JS:202-213`) associe chaque total au lien de nav dont le libellé **commence par** ce nom de tab (`lbl.indexOf(k)===0`), puis injecte un `<b class="navbadge">`.
- **Niveau 2 — `.todofab`** : bouton agrégat, flottant en portrait ou ancré dans la topbar en desktop (`.inbar`, positionné par `placeFab()`, `SHELL.JS:214-221`, qui réécoute `resize` pour reparenter le nœud entre `document.body` et la topbar selon `window.innerWidth<=760`). `fab()` (`SHELL.JS:226-237`) affiche la somme des `n` (`.todofab.ok` + coche si rien à traiter) et ouvre le panneau `todo` au clic.

Les deux niveaux partagent la **même source de vérité** : `allTodos()` (`SHELL.JS:172-182`) — 5 entrées statiques codées en dur (Achats×3, Activité×1, Argent×1) + 1 entrée conditionnelle "barème à appliquer" si `SYS.bareme!==SYS.baremeDispo`. Forme de chaque entrée : `{tab, n, t, s, cta, href|act}` où `tab` = section propriétaire (chaîne comparée en préfixe au libellé de nav), `n` = poids numérique du badge, `t`/`s` = titre/sous-titre, `cta` = libellé du bouton, et **soit** `href` (rendu `<a>` de navigation) **soit** `act` (rendu `<button data-todo="clé">`, actuellement seule la clé `'bareme'` a un gestionnaire réel, `SHELL.JS:309-313`). `screenTab()` (`SHELL.JS:183-192`) détermine "sur quel écran suis-je" en **regex sur `document.title`** ; `todos()` (`SHELL.JS:194-198`) filtre `allTodos()` à la section courante, sauf sur "Pilote" qui voit tout.

### `openSheet()` / `closeSheet()`

`openSheet(title, html)` (`SHELL.JS:88-93`) délègue d'abord à `window.FreelSheet.open` s'il existe (fichier `freel.js`, non lu) ; sinon utilise un panneau singleton créé paresseusement par `ownSheet()` (`SHELL.JS:73-87`) : `.scrim` + `<aside class="sheet">` ajoutés une seule fois à `document.body`, fermeture câblée sur clic scrim, clic bouton `.sx`, et **`Escape`** au niveau `document`. L'ouverture visuelle est différée d'une frame (`requestAnimationFrame`) pour garantir que l'ajout de la classe `.open` déclenche bien la transition CSS plutôt que de "sauter" instantanément. `closeSheet()` (`SHELL.JS:94-97`) suit le même principe de délégation.

### `collapse()` — motif « i »

Deux passes de scan/mutation (`SHELL.JS:342-361`), rejouées à chaque `ensure()` :
1. Pour des paires (titre, sous-titre) fixes — `['h1','.greet p', …]` et `['.sect-h','.sect-sub', …]` — pose un bouton `.info` dans le titre s'il n'y est pas déjà, et marque le sous-titre `.explain`.
2. Pour une liste de sélecteurs de paragraphes explicatifs (`INLINE`, `SHELL.JS:341`), tout élément de texte ≥70 caractères sans contrôle interactif reçoit un `.info` inséré juste avant lui, et devient lui-même `.explain`.

L'affichage réel (survol / clic-épingle) est câblé au niveau `document` (délégation d'événements `mouseover`/`mouseout`/`click`) et retrouve dynamiquement la cible via `findExplain()` (`SHELL.JS:331-334`), qui remonte la chaîne `nextElementSibling` — un lien purement positionnel, sans `id`/`aria-controls`.

### Pourquoi un `MutationObserver`, et par quoi le remplacer

`watch()` (`SHELL.JS:368-374`) observe `#root`/`document.body` (`childList`+`subtree`), débounce via un flag + `requestAnimationFrame`, et relance `ensure()` (remonte la sysbar si absente, ré-enveloppe les libellés de nav, recalcule les badges, rafraîchit le fab, rejoue `collapse()`) après chaque lot de mutations. Un `loop()` de secours (`SHELL.JS:366-367`, jusqu'à 16 tentatives à 250ms) gère le tout premier montage si `.topbar` n'existe pas encore au `DOMContentLoaded`.

| Responsabilité du script | Remplacement idiomatique dans une stack à composants |
|---|---|
| `MutationObserver` + `loop()` de sondage — détecter "du nouveau contenu est apparu" | Le cycle de rendu du framework lui-même : un composant `SysBar`/`AlertBadge` s'abonne à un store/état et se re-rend à chaque changement ; plus besoin de surveiller le DOM depuis l'extérieur |
| `collapse()` — deviner par sélecteurs/longueur de texte quel paragraphe mérite un "i" | Auteur explicite : chaque écran rend directement un composant `InfoDisclosure`/`Collapsible` autour du texte concerné, au lieu d'une heuristique DOM générique |
| `openSheet()`/`closeSheet()` + nœud singleton + astuce `requestAnimationFrame` | Composant `Sheet` contrôlé (`open`/`onClose`), portail géré par le framework, transition d'entrée/sortie native au composant (ou lib d'animation), focus trap et fermeture Échap fournis par le hook du composant plutôt que par un listener global |
| `allTodos()` + `countBy()`/`badges()`/`fab()` — scanner puis injecter des badges dans des liens de nav repérés par préfixe de texte | Store/sélecteur réactif partagé, consommé à la fois par `<NavItem badge={…}>` et par le bouton flottant agrégé — plus de correspondance texte fragile |
| `wrapNavLabels()` — envelopper après coup les nœuds texte en `<span class="nl">` | Composant `NavItem` bien formé dès l'auteur (`<NavItem label="Achats" icon={…}/>`), pas de chirurgie DOM a posteriori |
| `screenTab()` — parser `document.title` par regex pour savoir "quel écran ?" | État de routage réel (paramètre de route / prop), pas un indice textuel fragile |
| `placeFab()` — reparenter un nœud unique entre `body`/topbar selon `window.innerWidth`, avec listener `resize` | CSS responsive (media/container queries) ou rendu conditionnel JSX — pas de réparentage impératif |
| `applyTheme()` — écrire `data-theme` + `localStorage` depuis une fermeture IIFE | Contexte de thème (provider + hook `useLocalStorage`) ; le mécanisme final (attribut `data-theme` + clé `localStorage`) reste pertinent et peut être conservé tel quel |

---

## 6. Accessibilité

| Aspect | Constat | Source |
|---|---|---|
| Contraste | Aucune mention/annonce de ratio WCAG dans le code ou les commentaires ; à vérifier empiriquement (ex. `--muted-2` sur `--panel-3` en sombre, textes ambre/rouge sur fonds "soft") | — |
| Focus visible — champs | `FREEL.CSS:298` : `outline:none;border-color:var(--green)` seul (signal couleur uniquement) → `V11.CSS:218` **améliore** en ajoutant `box-shadow:0 0 0 3px var(--green-glow)` (anneau visible) | `FREEL.CSS:298`, `V11.CSS:218` |
| Focus visible — boutons/nav/pastilles | Aucune règle `:focus`/`:focus-visible` dédiée pour `.btn`, `.ico-btn`, `.nav`, `.info`, `.sysbar button`, `.pick`, `.subtab`, `.iconbtn` → repose entièrement sur l'outline par défaut du navigateur (non supprimé globalement, mais non enrichi non plus) | — |
| Cibles tactiles | `.info` = 18×18px (`V11.CSS:250`) — nettement sous la cible minimale recommandée ; `.ico-btn`/`.iconbtn` = 30-32px ; `.st-pill` mobile = 9×9px (à vérifier si cliquable dans le balisage réel) | `V11.CSS:250`, `FREEL.CSS:76,247`, `V11.CSS:379` |
| ARIA présents | `aria-expanded` sur `.info` (`SHELL.JS:338`, togglé `SHELL.JS:316`) ; `aria-label="Fermer"` sur le bouton de fermeture du sheet (`SHELL.JS:77`) | `SHELL.JS:77,316,338` |
| ARIA absents | Pas de `role="dialog"`/`aria-modal` sur `.sheet` ; pas de `role="tablist"/"tab"/"tabpanel"` + `aria-selected` sur `.subtabs`/`.pillars` ; pas de `aria-live` sur `.freel-toast` ; pas de `aria-current`/`aria-selected` sur `.nav.on` ; pas de `aria-controls` reliant `.info` à son `.explain` (lien purement positionnel via `findExplain()`) | — |
| Clavier | `Escape` ferme le sheet (`SHELL.JS:84`) ; `.info` est un vrai `<button>` (focusable/activable nativement, `SHELL.JS:337`) ; `.pick`/`.dec .act`/`.todo .btn` sont des `<button>`/`<a>` réels (bon point) ; **pas de focus trap** dans le sheet ouvert, pas de retour de focus géré à la fermeture ; ordre de tabulation dépend de l'ordre d'insertion DOM du script (`insertBefore`/`appendChild`), à vérifier visuellement | `SHELL.JS:84` |

**Manques principaux à signaler** : absence de sémantique de dialogue/modal sur le sheet, absence de sémantique d'onglets sur `.subtabs`/`.pillars`, cible tactile `.info` sous les recommandations, pas d'anneau de focus personnalisé hors champs de formulaire, pas de région live pour le toast.

---

## 7. Pièges de réimplémentation

| # | Piège | Détail | Source |
|---|---|---|---|
| 1 | Dépendance à un DOM global / singleton | Le script suppose un seul `.topbar`, un seul `#v11Sys`/`#v11Todo`, mute des nœuds qu'il ne possède pas (reparente `.synced`, enveloppe des nœuds texte, associe un badge à un lien de nav **par préfixe de son texte visible**) — inapplicable tel quel dans un arbre de composants avec instances multiples | `SHELL.JS:204-213,260-272,214-221` |
| 2 | `document.title` comme signal de routage | `screenTab()` déduit l'écran courant par regex sur le titre HTML — casse silencieusement (retourne `''`) si le titre est renommé/traduit ; à remplacer par un état de route réel | `SHELL.JS:183-192` |
| 3 | Cascade dépendante de l'ordre de chargement | `v1.11.css` est chargé après `freel.css` et **réécrit silencieusement** des règles (ex. `.rail` à 760px : la version dock-flottant de v1.11 écrase la barre d'onglets bas de freel.css sans que rien ne le signale dans le code) ; le sélecteur combiné `:root,[data-theme="sombre"]` fait que `--r`/`--r-sm` ne sont pas redéfinis par le thème `clair` (voir §1) — aucun équivalent de "chargé après" n'existe dans un système de composants/CSS-in-JS : chaque token/composant doit avoir une source unique et explicite | `V11.CSS:339-351` vs `FREEL.CSS:428-433` ; `V11.CSS:10,35` |
| 4 | `backdrop-filter: blur()` en cascade | Utilisé sur `.topbar`, `.todofab`, le dock mobile et `.scrim` simultanément superposables (sheet ouvert + dock + topbar) — coût de rendu GPU, support inégal (anciens navigateurs/WebView Android), à tester en dégradation progressive | `V11.CSS:121,263,340`, `FREEL.CSS:314` |
| 5 | Sélecteur `:has()` | `.card:has(>table),.card:has(>.tbl2)` (support récent, à vérifier pour l'audience cible) — mais la correction naturelle en composants est de remplacer cette heuristique par une prop explicite (`<Card scrollable>`) plutôt que de porter le sélecteur | `V11.CSS:314` |
| 6 | Sélecteurs fragiles fondés sur le texte/la position | Badge de nav apparié par `textContent.indexOf(tab)===0` ; `.info`↔`.explain` apparié par proximité de nœuds frères (`findExplain()`) sans `id`/`aria-controls` — tout renommage ou changement d'ordre de balisage casse silencieusement le lien | `SHELL.JS:206-208,331-334` |
| 7 | Dépendances globales silencieuses | `counts()`/`eur()`/panneaux `bank`/`cloud` lisent `window.FreelDepenses`, `window.FreelEtat`, `window.FreelSheet`, `window.FreelToast` — tous enveloppés de `try/catch` qui masquent l'absence (défaut silencieux à `0`/valeur maquette) ; un portage naïf peut sembler fonctionner avec des données vides sans qu'aucune erreur ne remonte | `SHELL.JS:62-71,145` |
| 8 | Icônes construites par découpage de chaîne | `ic(k)` fabrique le SVG en **splittant le `d` sur le caractère littéral "M"** — convention d'auteur fragile, à ne pas reproduire ; remplacer par un vrai composant/sprite d'icônes | `SHELL.JS:49-53` |
| 9 | Tokens de couleur non réellement thémés | `--c-ir`, `--c-cfe`, `--slate`, `--blue-soft`, `--mono` sont des valeurs figées dans `freel.css` et ne changent **jamais** selon les 4 palettes (contrairement à `--c-urssaf`/`--c-tva` qui se recolorent via indirection `var()`) — à auditer en contraste sur `clair`/`calme` avant portage | `FREEL.CSS:26,28-35` |
| 10 | Astuce `requestAnimationFrame` pour forcer une transition CSS | `openSheet()` diffère l'ajout de `.open` d'une frame pour déclencher la transition — copier ce hack tel quel dans un framework à cycle de rendu déclaratif (React, etc.) peut provoquer du scintillement ou un double rendu ; utiliser les primitives d'entrée/sortie du framework à la place | `SHELL.JS:92` |

---

*Fin du rapport — 53 tokens recensés (41 thémés sur 4 palettes + 12 fixes hérités), 8 media queries exhaustivement listées.*
