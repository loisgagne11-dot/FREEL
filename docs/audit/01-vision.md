
# Freel — Spécification fonctionnelle & technique extraite du handoff (build 5 / v1.11)

Sources lues intégralement : `annexe-architecture-build5.md`, `app/freel-etat.js`, `app/freel-depenses.js`, `INDEX.html`.
Sources consultées ponctuellement pour vérifier/compléter des formules citées par l'annexe mais non détaillées dedans : `app/outils-app.jsx`, `app/argent-app.jsx`, `app/config-app.jsx`, `app/v1.11-shell.js`, `app/freel-fold.js`, `app/achats-app.jsx`, `app/activite-app.jsx`, `app/Pilote - Le Flux.html` (extraits ciblés, pas lecture intégrale — voir §7).

---

## 1. Vision fonctionnelle

**Problème métier** — un indépendant en micro-BNC (France) doit répondre en permanence à cinq questions vitales que ni sa banque ni un tableur ne relient entre elles : combien il peut se verser aujourd'hui sans se mettre en danger, ce qu'il doit à l'URSSAF/au fisc, où il se situe par rapport aux seuils légaux (plafond micro-BNC, franchise de TVA), si sa comptabilité est en règle (justificatifs, rapprochement bancaire, livre des recettes), et son autonomie de trésorerie (combien de mois il peut tenir au rythme actuel). (`annexe-architecture-build5.md:5-7`)

**Pour qui** — un freelance/indépendant unique, en micro-BNC, avec option ACRE active, potentiellement en franchise de TVA (bascule possible vers assujetti). Persona démo : « Atelier L. » / Loïs Mercier, activité 74.10Z (Design), Paris. (`config-app.jsx:141-143`)

**Questions auxquelles l'app répond** (reformulées depuis le vocabulaire du produit, non l'inverse) :
- « Combien je peux me verser, et qu'est-ce qui coince » → écran Pilote (`annexe:153`)
- « Ton solde n'est pas tout à toi » → composition réelle du solde (réserve + versable + dus) → écran Argent (`annexe:171`)
- Où en sont mes seuils micro-BNC / franchise TVA, et quand vais-je basculer ? → cartes Seuils (Pilote et Argent)
- Ma compta est-elle en règle (pièce par dépense, rapprochement bancaire) ? → écran Achats (`annexe:181`)
- Quelle est mon occupation, mes missions, mon CRA ? → écran Activité & congés (`annexe:163-167`)
- Barème vs versement libératoire, CFE, simulation banque, CRA imprimable → écran Outils (`annexe:193`)
- Réglages du régime, du barème, exports légaux → écran Config (`annexe:196-198`)

**Architecture centrale (le point le plus important du handoff)** : deux stores JS globaux (`window.FreelEtat`, `window.FreelDepenses`), aucune page ne stocke un montant en propre ; tout est soit un **FAIT** saisi/lu, soit un **DÉRIVÉ** recalculé à la demande. La séparation existe explicitement parce qu'une version antérieure affichait deux valeurs différentes (3 010 € / 3 180 €) pour la même notion de « provisions » à deux endroits de l'app. (`annexe:38-47`)

---

## 2. Modèle de données — source unique de vérité

### 2.1 `freel-etat.js` (`window.FreelEtat`) — état financier

**FAITS** (objet `FACTS`, `freel-etat.js:17-46`), persistés dans `localStorage['freel-etat-v1']`, fusionnés champ par champ avec les défauts au chargement pour qu'une version antérieure de l'état sauvegardé ne fasse pas disparaître un fait ajouté depuis (`freel-etat.js:50-63`) :

| champ | type | sémantique | valeur démo |
|---|---|---|---|
| `solde` | number (€) | solde du compte pro à une date de référence figée (10/06/2026) | 8 120 |
| `reserve` | number (€) | matelas de sécurité, réglé par un curseur sur Pilote, écrit directement dans le store | 2 470 |
| `factures[]` | array d'objets | `{num:string, client:string, amt:number, state:'paid'\|'wait'\|'late', date:'YYYY-MM-DD', dueDays?:number}` — factures du mois piloté par l'état | 4 entrées (`freel-etat.js:21-26`) |
| `echeances[]` | array d'objets | `{id:string, lab:string, amt:number, state:'paid'\|'wait', due:'YYYY-MM-DD', kind:'urssaf'\|'ir'\|'cfe'}` — échéances sociales/fiscales de l'exercice ; `kind:'urssaf'` porte aussi bien l'URSSAF que la CFP (`freel-etat.js:28-33`) | 4 entrées : urssaf 1 980, ir 620, cfe 410, cfp 170 |
| `caRealise` | number (€) | CA facturé 2026 à date | 59 400 |
| `caEncaisse` | number (€) | CA encaissé 2026 à date — **base légale des seuils** (BNC + TVA) | 32 400 |
| `caProjection` | number (€) | projection de CA fin d'année | 74 200 |
| `baseUrssafT2` | number (€) | assiette du trimestre = recettes encaissées avril→juin (T2) | 7 970 |
| `encaisseMois` | objet `{avril,mai,juin}` | détail mensuel de l'encaissé du trimestre courant | 2 680 / 2 880 / 2 410 |
| `seuilBNC` | number (€) | plafond légal micro-BNC 2026 | 77 700 |
| `seuilTVA` | number (€) | seuil légal de franchise TVA 2026 | 37 500 |
| `tauxUrssaf` | number (ratio) | taux de cotisations (fait déclaré, **jamais utilisé** dans aucun dérivé — voir §7) | 0,246 |
| `tauxCFP` | number (ratio) | taux de contribution à la formation professionnelle | 0,002 |
| `tauxIR` | number (ratio) | taux de base pour le calcul de l'IR libératoire | 0,022 |
| `tva` | string enum | `'franchise'` \| `'assujetti'` | `'franchise'` |

**DÉRIVÉ** (fonctions pures sur `state`, jamais stockées — §3 détaille chaque formule).

**API exposée** : faits en lecture seule via getters (`solde, reserve, factures, echeances, caRealise, caEncaisse, caProjection, seuilBNC, seuilTVA, tva`), dérivés en fonctions, mutateurs `set(k,v)`, `toggleFacture(num)`, `toggleEcheance(id)`, `reset()`, formats `eur/eurR/keur`, `values()` (dictionnaire de chaînes déjà formatées) et `bindAll(root)` (binder déclaratif `[data-fx]`). Un seul writer logique : `set()` + les deux `toggle*`. (`freel-etat.js:194-225`, `annexe:92-104`)

**Clés du binder `data-fx`** (liste exhaustive donnée par l'annexe) : `solde reserve provisions dispo versable remuMois encaisse attente sortiesTotal sortiesPayees sortiesAVenir urssaf ir cfe cfp caRealise caEncaisse caProjection seuilTVA seuilBNC seuilTVApct seuilBNCpct margeTVA depenses tvaDeductible baseUrssaf cotisUrssaf cotisCFP cotisIR prelevT2 encAvril encMai encJuin autonomie` + une paire par facture (`fac024`, `facCli024`). (`annexe:101-104`, confirmé dans `freel-etat.js:139-183`)

### 2.2 `freel-depenses.js` (`window.FreelDepenses`) — dépenses & banque

**FAITS**

Modèle d'une dépense (`freel-depenses.js:7-18`) :

| champ | type | sémantique |
|---|---|---|
| `id` | string | identifiant, généré par `uid()` = `'e'+Date.now().toString(36)+random` |
| `date` | string `'YYYY-MM-DD'` | date de la dépense |
| `four` | string | fournisseur (défaut `'Sans nom'` si absent à la saisie) |
| `cat` | string enum | une des 10 `CATS` : Logiciels, Hébergement, Matériel, Déplacement, Coworking, Assurance RC Pro, Honoraires, Formation, Télécom, Autre (défaut `'Autre'`) |
| `ttc` | number (€) | montant TTC |
| `tva` | number (€) | montant de TVA sur la dépense (pas un taux — un montant) |
| `piece` | bool | justificatif joint ou non |
| `rec` | bool | charge récurrente (abonnement) |
| `acct` | string enum | `'pro'` \| `'old'` \| `'perso'` |
| `recon` | string enum | `'matched'` \| `'pending'` \| `'nobank'` — état de rapprochement, **explicite, jamais deviné** |
| `bankId` | string \| null | référence de l'opération bancaire reliée |

Modèle d'un compte (`ACCOUNTS`, `freel-depenses.js:23-27`) : `{id, nm, short, sync:bool, closed?:bool}` — `pro` (Qonto, `sync:true`), `old` (BNP, `sync:false`, `closed:true`), `perso` (avance, `sync:false`).

Modèle d'une opération bancaire (`seedBank()`, `freel-depenses.js:61-70`) : `{id, io:'in'|'out', who, date, raw, amt, kind:'facture'|'achat'|'new', hint, note, done:bool, expId:string|null}`.

**Période**, forme unique réutilisée partout (registre Achats, dossier de déclaration TVA) : `{kind:'month'|'quarter'|'year'|'all', y, m?, q?}` (`freel-depenses.js:94-107`, `annexe:131-132`).

**DÉRIVÉ / API** : `all()` (tri date desc), `bank()`, `byId(id)`, `account(id)`, `inPeriod(e,p)`, `filter(period,acct)`, `periodLabel(p)`, `summary(period,acct)` → `{n, ttc, tva, recov, blocked, missing, pending, items}`, `add(input)` → `{exp, match}`, `attachPiece(id)`, `link(expId,bankId)`, `markNoBank(id)`, `closeBank(bankId)`, `findMatch(exp)`, `pendingList()`, `openBank()`.

Persistance `localStorage['freel-depenses-v1']` ; si absente ou vide, réamorçage par `seedExpenses()` (récurrentes de 6 mois + 4 ponctuelles pro + 2 sur ancien compte) et `seedBank()` (3 opérations démo). (`freel-depenses.js:74-80`)

---

## 3. Règles de calcul (le cœur métier)

### 3.1 Store `freel-etat.js` — formules canoniques (« à reporter à l'identique », `annexe:68`)

```
sum(a)          = Σ a[i].amt
encaisse()      = sum(factures[state === 'paid'])                         freel-etat.js:87
attente()       = sum(factures[state !== 'paid'])                         freel-etat.js:88
retards()       = factures[state === 'late']                              freel-etat.js:89
sortiesPayees() = sum(echeances[state === 'paid'])                        freel-etat.js:90
sortiesAVenir() = sum(echeances[state !== 'paid'])                        freel-etat.js:91
sortiesTotal()  = sum(echeances)              // TOUTES, sans filtre état freel-etat.js:92
provisions()    = sortiesTotal()                                          freel-etat.js:94
dispo()         = solde − provisions()                                    freel-etat.js:95
versable()      = max(0, dispo() − reserve)                               freel-etat.js:96
remuMois()      = max(0, encaisse() − sortiesTotal())                     freel-etat.js:98
seuilTVApct()   = round(caEncaisse / seuilTVA × 100)                      freel-etat.js:99
seuilBNCpct()   = round(caEncaisse / seuilBNC × 100)                      freel-etat.js:100
margeTVA()      = max(0, seuilTVA − caEncaisse)                           freel-etat.js:101
cotisUrssaf()   = baseUrssafT2 × 0.212      // 21,2 % — constante en dur, freel-etat.js:105
                                              // ignore le fait tauxUrssaf (0.246)
cotisCFP()      = baseUrssafT2 × tauxCFP                                  freel-etat.js:106
cotisIR()       = baseUrssafT2 × tauxIR × 1.56   // = base × 0,022 × 1,56 freel-etat.js:107
                                                  // = base × 0,03432 — le facteur
                                                  // 1.56 n'est expliqué nulle part
prelevT2()      = cotisUrssaf() + cotisCFP()                              freel-etat.js:108
depenses()      = FreelDepenses.summary({kind:'year', y:2026}, 'tous').ttc  freel-etat.js:109-112
                  // année 2026 en dur, pas l'année courante
tvaDeductible() = FreelDepenses.summary({kind:'year', y:2026}, 'tous').recov freel-etat.js:113-116
recurrentMensuel() = Σ FreelDepenses.all()[rec===true && date.slice(0,7)==='2026-06'].ttc
                                                                           freel-etat.js:117-122
                  // mois "2026-06" en dur, pas le mois courant
burnMensuel()   = recurrentMensuel() + provisions() / 6                   freel-etat.js:123-125
                  // lisse les provisions de l'exercice sur 6 mois (pourquoi 6 : non documenté)
autonomie()     = dispo() / burnMensuel(), arrondi à 1 décimale, 0 si burn=0
                                                                           freel-etat.js:126-129
```

Formats non négociables (`freel-etat.js:132-136`) :
```
r10(n)  = round(n/10) × 10
eur(n)  = toLocaleString('fr-FR') + ' €' (espace insécable)
eurR(n) = eur(r10(n))      // montants "au rythme" arrondis à 10 €
keur(n) = round(n/100)/10 + ' k€'
```

### 3.2 Store `freel-depenses.js`

```
inPeriod(e,p) : année obligatoire, filtre par trimestre (Math.floor(mois/3)===q) ou mois exact
                                                                           freel-depenses.js:94-101
summary(p,acct) — pour chaque dépense filtrée :
  ttc += e.ttc ; tva += e.tva
  si e.piece :   recov += e.tva      // TVA récupérable, PIÈCE JOINTE UNIQUEMENT
  sinon :        blocked += e.tva ; missing += 1
  si e.recon==='pending' : pending += 1                                  freel-depenses.js:114-123

findMatch(exp) — auto-rapprochement à la saisie, uniquement si compte synchronisé :
  candidate ∈ bank[io==='out' && !done && !expId]
  |candidate.amt − exp.ttc| ≤ 0.50 €   ET   |date(candidate) − date(exp)| ≤ 6 jours
                                                                           freel-depenses.js:127-135
add(input) :
  si compte non synchronisé → recon='nobank'
  sinon → recon = findMatch() trouvé ? (reste 'pending', le rapprochement est proposé,
          pas automatique) : 'pending'                                   freel-depenses.js:137-151
```

### 3.3 Formules hors des deux stores, extraites des écrans (citées car demandées explicitement par la mission — non présentes dans les deux fichiers stores, donc **non garanties canoniques**, voir §7)

**IR barème 2026 (revenus 2025)** — simulateur Outils (`outils-app.jsx:35-38, 96-113`) :
```
Tranches BR = [[0,11497,0%], [11497,29315,11%], [29315,83823,30%], [83823,180294,41%], [180294,∞,45%]]
irBareme(base, parts) : quotient q = base/parts ; IR = Σ tranche(min(q,haut)-bas)×taux, puis × parts
microBase = CA × 0.66                      // abattement forfaitaire micro-BNC de 34 %
baseWith (foyer, micro inclus) = max(0, autresRevenus + microBase − PER)
baseWithout (foyer, micro exclu) = max(0, autresRevenus − PER)
microBareme = max(0, irBareme(baseWith) − irBareme(baseWithout))   // IR marginal imputable au micro
lib (versement libératoire) = CA × 0.022                            // 2,2 %
libWin = lib ≤ microBareme                                          // le libératoire gagne si moins cher
perSave = max(0, irBareme(baseNoPer) − irBareme(baseWith))          // économie d'impôt due au PER
```
Ce module réimplémente son propre taux de versement libératoire (0,022 en dur, cohérent avec `FreelEtat.tauxIR`) mais recalcule un abattement 66 % (`CA×0.66`) au lieu de lire `FreelEtat` — indépendant du store.

**CFE (Cotisation Foncière des Entreprises)** — simulateur Outils (`outils-app.jsx:116-119, 188-189`) :
```
cfe = round(baseMinCommunale × tauxCommunal / 100)     // ex. 560 € × 26,5 % = 148 €
```
Barème de base minimum affiché (CA N-2) : ≤5 000€ exonéré, puis tranches 5 001→10 000 (237→565€) … >250 000 (237→6 250€). Exonération totale la 1ʳᵉ année civile, puis franchise si CA<5 000€. Aucune de ces bornes n'existe dans `freel-etat.js` — la CFE n'y est qu'un montant fait (`echeances[id='cfe'].amt = 410`).

**Enveloppes de provision (Argent, `argent-app.jsx:69-94`)** — modèle démo `ENVS` distinct de `provisions()` : chaque enveloppe a `{amt (déjà mis de côté), tgt (cible = montant de l'échéance liée), pct, st}`. La cible `tgt` de l'enveloppe `urssaf`/`ir` est bien tirée de `ET.ech(id).amt` (donc du store), mais le montant *déjà provisionné* (`amt`) est une valeur démo en dur (ex. 380 pour l'IR, 200 pour la TVA) — non dérivée d'aucune formule du store.

**Déclaration URSSAF (modale `DeclarationUrssaf`, `argent-app.jsx:511-543`)** — entièrement en dur pour la démo :
```
CA = 17200 (dur) ; soc = round(CA × 0.116) ; ir = round(CA × 0.022) ; total = soc + ir
```
libellé « 11,6 % · taux ACRE » pour la part sociale — **valeur différente** de `cotisUrssaf()` (21,2 %) du store canonique. L'annexe elle-même liste ce module parmi les valeurs en dur à éliminer au profit de `baseUrssafT2`, `cotisUrssaf()`, `cotisIR()` (`annexe:325-327`).

**Répartition du solde (donut Argent, `argent-app.jsx:47-51`)** : `solde = versable() + reserve + provisions()` — présentée comme dérivée du store (« jamais saisie deux fois »), mais 3 grandeurs sur 3 sont bien des fonctions/faits du store — cohérent avec §3.1.

**Réserve en Config (`config-app.jsx:180-198`)** : mécanisme concurrent au fait `reserve` du store —
```
keep = round(dispo × pct / 100 / 10) × 10    // pct par défaut 50 %, réglable 0–80 % pas 5
vers = dispo − keep
```
Ce calcul par pourcentage n'est *pas* câblé sur `FreelEtat.reserve` (qui est un montant absolu réglé par curseur sur Pilote) — deux logiques de « réserve » coexistent dans le bundle (voir §7).

### 3.4 Seuils, plafonds et barème 2026 — valeurs telles qu'écrites dans le code (avec leurs contradictions)

| notion | valeur(s) trouvée(s) | source |
|---|---|---|
| Plafond micro-BNC | 77 700 € | `freel-etat.js:41` (fait canonique) |
| Plafond micro-BNC (à venir, panneau fraîcheur barème) | 77 700 € → 83 600 € | `v1.11-shell.js:32` |
| Seuil franchise TVA | 37 500 € | `freel-etat.js:42`, `config-app.jsx:161`, `config-app.jsx:177` |
| Taux cotisations URSSAF « avec ACRE » | **21,2 %** (formule canonique, Pilote HTML l'affiche identiquement) | `freel-etat.js:105`, `Pilote - Le Flux.html:591,622` |
| Taux cotisations, fait `tauxUrssaf` (jamais utilisé dans un dérivé) | 24,6 % | `freel-etat.js:44` |
| Taux cotisations BNC, panneau fraîcheur barème (valeur actuelle → nouvelle) | 24,6 % → 26,1 % | `v1.11-shell.js:33` |
| Taux de cotisations « avec ACRE », Config | **10,6 %** (aide : « taux plein 21,1 % → 10,6 % avec ACRE ») | `config-app.jsx:159` |
| Cotisations sociales + CFP, modale déclaration URSSAF | **11,6 %** (label « taux ACRE ») | `argent-app.jsx:512,533` |
| Cotisations, détail provision Argent | **10,6 %** | `argent-app.jsx:90` |
| CFP | 0,2 % | `freel-etat.js:44`, `config-app.jsx:160` |
| Impôt libératoire BNC | 2,2 % | `freel-etat.js:44,107`, `config-app.jsx:160`, `outils-app.jsx:109` |
| Abattement forfaitaire micro-BNC | 34 % (donc base = CA×0,66) | `config-app.jsx:159`, `outils-app.jsx:103` |
| ACRE — réduction | « 50 % des cotisations la 1ʳᵉ année », active jusqu'au 31/12/2026 | `config-app.jsx:145` |
| ACRE — fin des taux réduits, panneau fraîcheur (valeur actuelle → nouvelle) | 31/12/2026 → 28/02/2026 | `v1.11-shell.js:34` |
| Millésime barème | 2026 (vérifié 2025-12-14 dans le fait `bareme`, mais texte Config dit « vérifiés le 11 juil. 2026 ») | `v1.11-shell.js:14`, `config-app.jsx:156` |
| Alerte d'approche de seuil | 85 % du plafond/de la franchise (configurable) | `config-app.jsx:164` |

**Il n'existe pas un taux URSSAF unique dans ce bundle** : au moins quatre valeurs distinctes (21,2 % / 24,6 % / 11,6 % / 10,6 %) sont chacune présentées comme « le » taux ACRE selon l'écran. Seule `freel-etat.js:105` (21,2 %) est la formule réellement branchée au binder `data-fx="cotisUrssaf"` et affichée sur l'écran hifi Pilote — c'est la valeur à considérer canonique à défaut d'arbitrage produit. Voir §7 pour la décision à prendre à l'implémentation.

---

## 4. Les 6 écrans

Navigation partagée : rail vertical fixe (desktop) / barre d'onglets fixe en bas ≤760px. Ordre : **Pilote · Activité & congés · Argent · Achats · Outils · Config**, puis pied de rail « Livre des recettes » + avatar. (`annexe:148-150`)

### 4.1 Pilote — Le Flux (`Pilote - Le Flux.html` + `pilote-flux.js` + `pilote-quickacts.js`)
**Rôle** : la décision du jour — « combien je peux me verser, et qu'est-ce qui coince ». (`annexe:153`)
**Cartes/sections identifiées, dans l'ordre du fichier** :
1. Bandeau de flux à 3 colonnes KPI cliquables : Cash (`solde`) → Disponible (`dispo`) → Rémunération (`remuMois` + bouton « Verser sur mon compte »). Chaque colonne ouvre une feuille de détail (`FreelSheet.open`). (`annexe:154-156`)
2. Curseur de réserve (matelas), écrit `reserve` dans le store en direct, `versable` recalculé immédiatement.
3. Carte « Décisions du jour » — badge « X à traiter » (démo : 4), score santé 78/100 (`Pilote - Le Flux.html:385,397`).
4. Cartes seuils micro-BNC & franchise TVA avec « leviers ».
5. Échéancier « À déclarer ».
6. Factures du mois avec retards (ex. facture #024 en retard J+18, `data-fx="facCli024"/"fac024"`, `Pilote - Le Flux.html:574`).
7. Réglages de maquette derrière une icône engrenage (gain de 85 px de hauteur utile).
Feuilles de détail = `<template>` HTML ouverts par `FreelSheet.open()` — contenu vérifié : détail « Disponible » (dispo − réserve), détail « Tu peux te verser » (conseillé le 1er juillet, après provision URSSAF du 5), détail cotisations sociales (21,2 % avec ACRE), détail provision URSSAF (case « recettes BNC » = `baseUrssaf`). (`Pilote - Le Flux.html:549-625`)
**États** : non documentés explicitement (pas de mention vide/chargement/erreur dans les sources lues — voir §7).

### 4.2 Activité & congés — Plan de charge (`Activité - Plan de charge.html` + `activite-app.jsx`)
**Rôle** : missions, calendrier, congés, CRA. (`annexe:163-167`)
Calendrier mensuel fusionné avec congés ; saisie journalière = mission · durée (¼→1 j) · tâche, permettant de sortir le CRA sans ressaisie. Cartes confirmées : « Charges récurrentes » (par mois, `activite-app.jsx:664`), « Ce mois » (mouvement isolé ex. « Nouveau clavier » 62€, `activite-app.jsx:680`). Indicateurs : occupation du mois (18,5 j facturés / 22 ouvrés = 84 %), occupation par mission, synthèse hebdo, DSO réel (42 j vs 30 j contractuels — carte visible dans le Pilote aussi).

### 4.3 Argent — Trésorerie & Performance (`Argent - Trésorerie & Performance.html` + `argent-app.jsx`)
**Rôle** : la vérité longue durée. Deux sous-onglets `tres` (Trésorerie) / `perf` (Performance). (`annexe:169-178`)
**Sous-onglet Trésorerie**, cartes dans l'ordre (`argent-app.jsx:239-451`) :
1. « Ton solde n'est pas tout à toi » — donut = réserve + versable + dus, sous-titre `solde {ET.solde}`.
2. « Enveloppes de provision — combien est mis de côté » — jauge de 4 px en pied de carte, pas de remplissage traversant ; clic = détail (`PROV_DETAIL`).
3. « Seuils — où j'en suis » — plafonds annuels ; carte pliable dont le résumé replié (`data-fold`) est **en dur** : `"Micro-BNC 69 % (53 600 / 77 700 €) · franchise TVA 86 % — bascule estimée sept."` (`argent-app.jsx:281`) — incohérent avec `caEncaisse=32 400` du store (donnerait 42 %, pas 69 %) : exactement le type de valeur en dur que l'annexe demande d'éliminer (`annexe:325`).
4. « Échéancier & obligations 2026 » — légende de couleur par charge, statuts `payee/adecl/watch/todo` (`FSTAT`, `argent-app.jsx:83-88`).
5. « Évolution du compte — entrées, sorties & solde » — clic sur un mois → modale `FlowModal` (composition).
**Sous-onglet Performance** :
1. « CA réalisé vs encaissé » — clic sur un mois = composition (modale, données `COMPO`).
2. « Tu peux te verser » (sous-carte, libellé identique à Pilote, tag « dispo − réserve »).
3. « Capacité de versement par mois » — barre = capacité, plein = versé.
Cartes « rendement » et « dépendance client » annoncées par l'annexe (`annexe:176`) **non retrouvées littéralement** dans les 130 premières et les portions grep-ées d'`argent-app.jsx` — à vérifier directement dans le fichier complet (non lu intégralement, voir §7).
**Modales** : `FlowModal` (composition d'un mois), `DeclarationUrssaf` (chiffres en dur, voir §3.3), `TvaModal` (tire dépenses + justificatifs du store `FreelDepenses.summary(p,'tous')` à la demande pour la période choisie, `argent-app.jsx:545-550`).

### 4.4 Achats — Justificatifs & Banque (`Achats - Justificatifs & Banque.html` + `achats-app.jsx`)
**Rôle** : la conformité — chaque dépense déductible a sa pièce, chaque opération est rapprochée. (`annexe:180-191`)
Sections confirmées, dans l'ordre : barre de période + compte (Mois/Trimestre/Année/Tout, navigation ‹›, sélecteur pro/ancien/perso/tous) → carte « Registre des achats — {période} » (`achats-app.jsx:149-150`) → carte « Rapprochement bancaire » (`achats-app.jsx:247-248`) avec les deux sens (opération sans dépense : créer+joindre ; dépense sans opération : relier ou « pas de banque »). Modale « Nouvelle dépense » (fournisseur + montant requis, TVA calculée mais débrayable, case récurrente, dépôt de pièce) (`achats-app.jsx:327`), et modale contextuelle « Relier l'opération / Nouvelle dépense · {who} » déclenchée depuis une opération bancaire (`achats-app.jsx:425`).
Synthèse de carte pliée : `n achats · X € TTC · TVA déductible Y € · Z pièce(s) manquante(s)`.

### 4.5 Outils — Simulateurs (`Outils - Simulateurs.html` + `outils-app.jsx`)
**Rôle** : calculs fiscaux, rendement, rapprochement bancaire, CRA — « tout est recalculé en direct » (`outils-app.jsx:74`).
Sous-onglets confirmés : **Impôt & CFE** (`ImpotCFE`), **Compte pro & banque** (`ComptePro`), **CRA** (`CRA`). (`outils-app.jsx:78-88`)
Onglet Impôt & CFE, cartes dans l'ordre : « Calculateur d'impôt — barème vs versement libératoire » (champs CA annuel encaissé HT, parts fiscales, autres revenus du foyer, versement PER déductible ; comparatif visuel avec tag « avantageux » sur l'option gagnante) → « Impôt du foyer par tranche » (détail par tranche BR, barre de remplissage) → « Simulateur CFE » (base minimum communale + taux, barème par tranches de CA N-2, résultat estimé, badge « exonéré année 1 »).

### 4.6 Config (`Config.html` + `config-app.jsx`)
**Rôle** : réglages du régime, du barème, exports.
7 sections confirmées, dans l'ordre du fichier (`config-app.jsx:139,152,185,207,226,240,278`) :
1. **Profil & statut** — nom commercial, identité, SIRET, code APE, n° TVA intracom, adresse du siège (détermine aussi la commune → base/taux CFE), régime (Micro-BNC/BIC), date de début d'activité, toggle ACRE, toggle versement libératoire.
2. **Paramètres fiscaux** — bandeau « Barèmes 2026 à jour » avec bouton de vérification manuelle ; champs abattement 34 %, taux cotisations avec ACRE 10,6 %, impôt libératoire 2,2 %, CFP 0,2 %, plafond micro-BNC 77 700 €, seuil franchise TVA 37 500 € ; périodicité des cotisations (Mensuel/Trimestriel, pilote l'échéancier « À déclarer » du Pilote) ; toggle mise à jour auto des barèmes ; toggle alerte seuils à 85 % ; option TVA (bascule auto au-delà de 37 500 €, ou option volontaire).
3. **Réserve & versements** — curseur % de réserve matelas gardée (défaut 50 %, 0–80 % pas 5), seuil de sécurité trésorerie (5 000 €, alerte sous ce niveau), jour de versement préféré, IBAN du compte perso de virement (utilisé par le bouton « Verser » du Pilote), toggle provisionnement automatique, toggle rappel de versement.
4. **Facturation** — préfixe de numérotation, prochain numéro, délai de paiement par défaut (30/15/45 j/à réception), pénalités de retard (3× taux légal), IBAN d'encaissement, mention légale (art. 293 B CGI), toggle logo sur factures.
5. **Livre des recettes** (`#livre`) — registre obligatoire micro généré depuis les factures payées, export CSV.
6. **Compte & Cloud Sync**.
7. **Données & export** — exports CSV / FEC / JSON.

**États (vide / chargement / erreur / alerte)** : aucun des quatre documents lus intégralement ne spécifie de state management explicite pour vide/chargement/erreur (pas de squelette de chargement, pas de message d'état vide documenté). Seul un niveau d'alerte est structuré côté échéancier (`FSTAT` : `payee/adecl/watch/todo`) et côté seuils (config : alerte à 85 %). Ceci est une lacune documentaire, reportée en §7.

---

## 5. Vocabulaire imposé

| libellé exact | où il apparaît | ne pas reformuler en |
|---|---|---|
| « Ton solde n'est pas tout à toi » | Argent > Trésorerie (donut), `argent-app.jsx:239` | « répartition du solde » |
| « versable » / « Tu peux te verser » | Pilote, Argent, Config | « rémunération disponible » |
| « dus » | légende du solde (provisions dues, agrégat neutre) | « charges » |
| « à déclarer » | statut d'échéance (`FSTAT.adecl`) | « en attente » |
| « pas de banque » (`markNoBank`) | Achats, rapprochement | « ignoré » |
| « pièce manquante » | Achats | « justificatif absent » |
| « Combien je peux me verser, et qu'est-ce qui coince » | intention de l'écran Pilote | — |
| « Décisions du jour » | carte Pilote | « alertes » |
| « Enveloppes de provision — combien est mis de côté » | Argent | « provisions » seul |
| « Registre des achats » | Achats | « liste des dépenses » |
| « Rapprochement bancaire » | Achats | « réconciliation » |
| « Réserve matelas » | Pilote/Argent/Config | « épargne de précaution » |
| « Provisions dues » | Argent (neutre, agrégat, couleur `--slate`) | une couleur de charge |
| « déclarée · payée » / « à déclarer » / « à surveiller » / « à venir » | statuts `FSTAT` de l'échéancier | — |
| « Case « recettes BNC » » | détail provision URSSAF Pilote | « CA à déclarer » |
| « CRA » | Activité/Outils | « compte-rendu » seul (le sigle est utilisé tel quel) |

Voir aussi `annexe:351-354` : « les libellés du prototype sont le fruit d'itérations avec l'utilisateur… à reprendre littéralement ».

---

## 6. Règles de gestion et invariants

- **Un seul writer par store.** `FreelEtat` : uniquement `set()`, `toggleFacture()`, `toggleEcheance()`. `FreelDepenses` : uniquement `add()`, `attachPiece()`, `link()`, `markNoBank()`, `closeBank()`. Aucun composant ne doit recalculer sa propre copie d'un montant dérivé — c'est la règle qui a corrigé l'incohérence 3 010 €/3 180 €. (`annexe:97-100, 230-238`)
- **`recon` est explicite, jamais deviné** : `matched` / `pending` / `nobank` sont posés par une action utilisateur ou par `add()`/`link()`/`markNoBank()`, jamais inférés silencieusement ailleurs. (`freel-depenses.js:12-17`)
- **TVA récupérable conditionnée à la pièce jointe** : `recov` dans `summary()` n'additionne `e.tva` que si `e.piece===true` ; sinon la TVA part dans `blocked` et incrémente `missing`. Aucune TVA récupérable sans justificatif, par construction. (`freel-depenses.js:117-121`)
- **Comptes non synchronisés ne sont jamais rapprochés** : `findMatch()` retourne `null` immédiatement si `account(acct).sync===false` ; `add()` force `recon='nobank'` dans ce cas. (`freel-depenses.js:127-128,146`)
- **Couleur fixe par type de charge** — URSSAF (ambre), TVA (bleu), IR (violet `#b79ae4`), CFE (orange `#d9926a`) : une charge garde la même couleur sur tous les écrans (jauge, pastille calendrier, légende, enveloppe). Les agrégats (dus/provisions totales) utilisent le neutre `--slate`, jamais une couleur de charge. (`annexe:259-270`)
- **Pliage des cartes ne perd jamais l'information** — replier une carte affiche l'en-tête + une phrase de synthèse (`data-fold` côté React, résumé calculé) ; l'identité de la carte pour la persistance est le texte de `.card-h .lbl`, stockée par page dans `localStorage['freel-fold:<nom-de-fichier-de-la-page>']`. Les clics sur `button, a, input, select, label, .act` dans l'en-tête ne déclenchent pas le pliage. Un `MutationObserver` réapplique l'état aux cartes rendues après coup (nécessaire pour React). (`freel-fold.js:1-26`, `annexe:204-210`)
- **Arrondis** : montants « au rythme » (rémunération, encaissé, sorties, cotisations) arrondis à 10 € via `eurR`/`r10` ; montants exacts (solde, dispo, versable, réserve, provisions, seuils) affichés au euro près via `eur`. Gros agrégats en k€ via `keur`. Format FR strict : espace insécable avant `€`, séparateur de milliers espace, virgule décimale. (`freel-etat.js:131-136`, `annexe:280-282`)
- **Ordre de chargement des scripts** impératif : `freel-depenses.js` → `freel-etat.js` (qui lit le store dépenses) → `freel.js` → script de page → `freel-docs.js` → `freel-fold.js`. (`annexe:386-387`)
- **Base légale des seuils = CA encaissé**, jamais le CA facturé (`caEncaisse`, pas `caRealise`) — cohérent avec la règle micro-BNC réelle (comptabilité de trésorerie). (`freel-etat.js:36`, `seuilTVApct/seuilBNCpct` utilisent `caEncaisse`)
- **Statuts autorisés et transitions** :
  - `facture.state` : `paid` ↔ `wait` (toggle bidirectionnel via `toggleFacture`), plus `late` (présent dans les données mais pas atteint par le toggle — pas de fonction qui fasse transiter *vers* `late`, donc `late` semble être un état de calcul/affichage plutôt qu'un état togglable). *(à confirmer à l'implémentation, voir §7)*
  - `echeance.state` : `paid` ↔ `wait` uniquement (toggle bidirectionnel via `toggleEcheance`) — l'annexe elle-même juge ce cycle « trop pauvre » et demande un cycle réel *à déclarer → déclarée → payée* avec date par étape (`annexe:348-349`).
  - `expense.recon` : `pending` → `matched` (via `link`) ou `pending`/`matched` → `nobank` (via `markNoBank`) ; pas de retour documenté de `nobank` vers `pending`/`matched`.
- **Un fait sauvegardé plus ancien ne doit jamais effacer un fait ajouté depuis** : la fusion au chargement de `freel-etat.js` ne remplace que les clés déjà présentes dans `raw`, clé par clé, en conservant les valeurs par défaut pour toute nouvelle clé. (`freel-etat.js:50-63`)

---

## 7. Zones d'ombre

1. **Taux de cotisation URSSAF non unique dans le bundle.** Quatre valeurs concurrentes pour « le taux ACRE » : 21,2 % (`freel-etat.js:105`, seule branchée au binder et affichée sur l'écran hifi Pilote), 24,6 % (fait `tauxUrssaf`, jamais consommé par un dérivé), 11,6 % (modale démo `DeclarationUrssaf`, `argent-app.jsx:512`), 10,6 % (Config et détail de provision Argent, avec l'explication « taux plein 21,1 % → 10,6 % avec ACRE » qui ne correspond à aucun des trois autres chiffres). L'annexe ne tranche pas explicitement laquelle est la vérité produit ; elle ne demande de corriger que la modale `DeclarationUrssaf`. **Décision requise avant implémentation.**
2. **Le facteur `× 1.56` dans `cotisIR()`** (`freel-etat.js:107`) n'est justifié par aucun commentaire ni aucune section de l'annexe. Le taux réel du versement libératoire BNC est cité ailleurs (Config, Outils, modale URSSAF) comme un plat 2,2 % du CA — sans multiplicateur. À clarifier : bug de prototype, ou logique métier volontaire non documentée ?
3. **`provisions()` = `sortiesTotal()` inclut les échéances déjà `paid`**, pas seulement `sortiesAVenir()` (`freel-etat.js:92-94`). Si `state==='paid'` signifie que le montant a déjà quitté `solde`, alors `dispo() = solde − provisions()` soustrait deux fois le même argent. Le commentaire du code dit pourtant « provisions dues = … restant à couvrir » (`freel-etat.js:93`), ce qui contredit l'absence de filtre par état. La sémantique exacte de `echeance.state:'paid'` par rapport à `solde` n'est précisée nulle part.
4. **`baseUrssafT2` (7 970) est un fait déclaré séparément**, alors qu'il est numériquement égal à `Σ encaisseMois` (2 680+2 880+2 410=7 970) — aucune fonction ne le dérive automatiquement de `encaisseMois`. Risque de désynchronisation si l'un est modifié sans l'autre en production.
5. **Deux notions homonymes « encaissé »** : `caEncaisse` (fait annuel/YTD, base des seuils, 32 400) et `encaisse()` (dérivé, somme des `factures[state==='paid']` du seul mois piloté, ex. 6 010 dans les données démo) ne sont reliées par aucune formule — elles pourraient diverger silencieusement en production si l'une des deux sources n'est pas mise à jour.
6. **Deux mécanismes de « réserve » coexistent** : `FreelEtat.reserve` (montant absolu, réglé par curseur sur Pilote, utilisé par `versable()`) vs le curseur % de Config (`config-app.jsx:180-198`, `keep = dispo × pct%`, non câblé au store). Lequel doit piloter l'autre à l'implémentation n'est pas tranché.
7. **Champs promis par l'UI Config sans équivalent dans `FreelEtat.FACTS`** : seuil de sécurité trésorerie (5 000 €), IBAN de virement perso, délai de paiement par défaut / pénalités de retard, périodicité de cotisation (mensuel/trimestriel — cette dernière est censée « piloter l'échéancier À déclarer » du Pilote alors que `echeances[]` est une liste statique sans logique de génération), toggle « provisionner automatiquement ». Le modèle à deux stores documenté par l'annexe ne couvre pas ces champs ; un troisième store « réglages » ou une extension de `FreelEtat.FACTS` sera nécessaire.
8. **`facture.state:'late'`** apparaît dans les données mais aucune fonction du store ne fait transiter un état vers `late` (seul `toggleFacture` fait `paid`↔`wait`). Il n'est pas clair si `late` doit être calculé automatiquement (date d'échéance dépassée) ou saisi manuellement — l'annexe ne le précise pas.
9. **États d'écran (vide / chargement / erreur)** ne sont documentés dans aucune des quatre sources lues intégralement. Seuls des niveaux d'alerte (statuts d'échéance, seuil à 85 %) sont structurés. Il faudra les définir ex nihilo à l'implémentation ou les extraire d'une lecture complète des fichiers d'écran (non faite ici, hors du périmètre assigné).
10. **Cartes « rendement » et « dépendance client »** de l'onglet Performance d'Argent, annoncées par l'annexe (`annexe:176`), n'ont pas été retrouvées littéralement dans les portions d'`argent-app.jsx` consultées (jusqu'à la ligne ~510 plus recherches ciblées) — à vérifier par une lecture complète du fichier (46 Ko, non lu intégralement, hors périmètre de cette mission).
11. **Incohérence INDEX.html vs contenu réel du dossier** : `INDEX.html` décrit une arborescence `app/ · docs/ · archive/` et cite une version « courante » `V1.21 « Calme »` (`app/V1.21 Calme - Pilote.html`), alors que le dossier livré ne contient qu'un `app/` avec les fichiers build 5 / v1.11 décrits par l'annexe (pas de `docs/`, pas d'`archive/`, pas de fichier V1.21). `INDEX.html` semble provenir d'une version antérieure ou d'un autre bundle et n'est pas fiable comme sommaire de ce paquet précis — à traiter avec prudence, l'annexe et les fichiers `app/` réels font foi.
12. **Résumé plié en dur incohérent avec le store** : la carte « Seuils » d'Argent affiche en dur `"Micro-BNC 69 % (53 600 / 77 700 €)"` (`argent-app.jsx:281`) alors que `caEncaisse=32 400` du store donnerait 42 %. L'annexe liste explicitement cette carte parmi les valeurs à corriger (`annexe:325`) — confirmé et quantifié ici.
13. **Génération des dépenses récurrentes, ventilation HT/TVA des factures, conservation des justificatifs 10 ans, idempotence du rapprochement bancaire, cycle de statut d'obligation enrichi** — tous explicitement identifiés comme trous fonctionnels par l'annexe elle-même (`annexe:334-349`), non résolus dans le code lu, à concevoir en production.

---

## Fichiers de référence (chemins absolus)

- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/zip/design_handoff_freel_v1.11/annexe-architecture-build5.md`
- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/zip/design_handoff_freel_v1.11/app/freel-etat.js`
- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/zip/design_handoff_freel_v1.11/app/freel-depenses.js`
- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/zip/design_handoff_freel_v1.11/INDEX.html`
- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/zip/design_handoff_freel_v1.11/app/outils-app.jsx`
- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/zip/design_handoff_freel_v1.11/app/argent-app.jsx`
- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/zip/design_handoff_freel_v1.11/app/config-app.jsx`
- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/zip/design_handoff_freel_v1.11/app/v1.11-shell.js`
- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/zip/design_handoff_freel_v1.11/app/freel-fold.js`
- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/zip/design_handoff_freel_v1.11/app/achats-app.jsx` (extraits)
- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/zip/design_handoff_freel_v1.11/app/activite-app.jsx` (extraits)
- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/zip/design_handoff_freel_v1.11/app/Pilote - Le Flux.html` (extraits)
