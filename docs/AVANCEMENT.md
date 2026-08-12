# État d'avancement — reprise de session

**Ce fichier est le point d'entrée de toute nouvelle session.** Il se lit en
premier, avant tout autre document. Il est mis à jour à chaque fin de lot de
travail. Si son contenu contredit un autre document, c'est lui qui fait foi
sur l'état d'avancement — les autres font foi sur les décisions.

**Dernière mise à jour** : 28 juillet 2026
**Branche de travail** : `claude/orchestration-redesign-screens-0ee3sz`, repartie de `main`
**PR #245** : **MERGÉE.** Elle est close, elle ne peut plus porter de travail —
toute suite donne lieu à une **nouvelle** PR. Ne pas y ajouter de commits, ne
pas la rouvrir.

Tout ce qui est décrit ci-dessous est donc **sur `main`** et déployé : l'audit,
le plan, les corrections J0 de l'app existante, et le socle de la nouvelle
application sous `app/`.

**Sanité au moment de la reprise** — `cd app && npm run verifier` enchaîne
typage, tests, build, contrôle responsive et migration de bout en bout. Repères
au dernier passage :

| Repère | Valeur |
|---|---|
| Tests | **565** (+ 91 côté legacy) |
| Build | **58 Ko** de code applicatif, 188 Ko de bibliothèques, 260 Ko au premier rendu |
| Budget | conforme sur les **4 postes** vérifiés |
| Responsive | **120 combinaisons** (5 tailles × 4 palettes × **6 écrans**) |
| Migration | conforme |

Un nombre de tests en baisse, ou un budget dépassé, signale une régression.

**Le budget a changé de forme le 12/08.** Il était un plafond unique de 250 Ko
sur le paquet d'entrée ; la mesure a montré ce que ce chiffre recouvrait :
192 Ko de React et 55 Ko de code applicatif. Le seuil surveillait donc surtout
une dépendance qui ne bouge pas, et laissait le code du projet grossir sans
qu'on s'en aperçoive — jusqu'à frôler la limite d'un coup, à l'écran Config.

`scripts/verifier-budget.mjs` vérifie désormais quatre postes séparément. Avant
de relever l'un d'eux : vérifier qu'un écran n'a pas été tiré dans l'entrée par
un import partagé. C'est la cause la plus fréquente, et relever le plafond la
masquerait.

---

## 0. Réécriture d'historique du 12/08/2026

**Tout clone antérieur au 12/08/2026 est incompatible.** L'historique a été
réécrit pour retirer des données personnelles présentes dans 13 à 15 commits :
nom d'entreprise, SIRET, numéro de TVA intracommunautaire et SIREN. Les 21
branches ont été force-poussées.

Pour reprendre un clone existant :

```
git fetch origin --prune
git checkout -B <votre-branche> origin/main
```

Ne pas tenter de fusionner l'ancien historique dans le nouveau : les commits
n'ont plus les mêmes empreintes, et la fusion réintroduirait les données
retirées.

**Ce que la réécriture n'a pas pu faire.** GitHub conserve 250 références
`refs/pull/N/head`, une par pull request, qu'aucun envoi ne peut supprimer.
Les anciens commits restent donc atteignables par l'interface web d'une
ancienne PR, ou par `git fetch origin refs/pull/N/head`. Vérifié en revanche :
un `git clone` ordinaire ne rapporte plus aucune de ces valeurs — 737 commits,
zéro occurrence. Une purge complète suppose une demande au support GitHub, ou
la recréation du dépôt.

---

## 0 bis. Pourquoi `index.html` est encore là

**Ce n'est pas du code mort : c'est l'application en production**, celle qui
est servie et qui fait tourner l'activité. La nouvelle version ne peut pas
encore la remplacer, et le tableau ci-dessous dit précisément ce qui manque.

| Fonction | `index.html` (legacy) | `app/` (nouvelle) |
|---|---|---|
| Consulter, calculer, provisionner | ✅ | ✅ |
| Saisir une **dépense** avec justificatif | ❌ | ✅ |
| Importer un relevé bancaire | ❌ | ✅ |
| Livre des recettes conforme, DES | ❌ | ✅ |
| **Créer un client** | ✅ | ❌ |
| **Créer une mission** | ✅ | ❌ |
| **Émettre une facture, et son PDF** | ✅ | ❌ |
| **Écrire dans Supabase** (synchro) | ✅ | ❌ lecture seule |

Les quatre dernières lignes sont le chemin critique vers la suppression du
legacy. Tant qu'elles ne sont pas faites, retirer `index.html` priverait
l'utilisateur de son outil de facturation — et une facture non émise est un
revenu non encaissé.

**Ordre à respecter, et pourquoi.** Clients et missions d'abord, car une
facture s'y rattache ; la facturation ensuite ; l'écriture Supabase en
dernier, parce qu'elle est la seule opération qui peut abîmer des données
existantes et qu'elle demande donc que le reste soit sûr.

---

## 1. À lire, dans cet ordre

| Ordre | Document | Ce qu'il apporte |
|---|---|---|
| 1 | **ce fichier** | Où on en est, quoi faire ensuite |
| 2 | [`PLAN-REFONTE.md`](./PLAN-REFONTE.md) | Les 6 décisions arbitrées (D1–D6), le barème par périodes, les 7 jalons |
| 3 | [`AUDIT-REDESIGN-V1.11.md`](./AUDIT-REDESIGN-V1.11.md) | Le diagnostic complet |
| 4 | le code lui-même | Les six écrans sont écrits ; leurs en-têtes portent le *pourquoi* de chaque choix |

Les neuf rapports d'audit détaillés ont été retirés du dépôt le 12/08/2026.
Leur substance est dans le document 3, et les décisions qu'ils ont produites
sont devenues du code commenté — c'est là qu'il faut les lire désormais. Ils
restent dans l'historique git (`git show 9d97b6b:docs/audit/05-spec-ecrans.md`)
si un point de spécification manque.

---

## 2. Les invariants à ne jamais casser

Ces règles sont le produit de l'audit et des arbitrages du propriétaire.
Toute contribution doit les respecter, y compris sous pression de délai.

1. **Aucun nombre officiel en dur.** Taux, seuils, plafonds, tranches et
   abattements sont des **données datées** portant leur source et leur date
   de vérification. Ajouter une période, jamais modifier une période passée :
   recalculer un trimestre antérieur doit redonner le montant déclaré alors.
2. **Aucun écran ne contient de nombre.** Tout vient du domaine. C'est ce qui
   a produit les cinq valeurs concurrentes du taux URSSAF dans l'ancienne
   version.
3. **Asymétrie du temps.** On extrapole vers le futur (prévision légitime),
   jamais vers le passé (un taux écoulé est un fait publié).
4. **Sécurité fermée sur l'opposable.** Un chiffre qui engage — déclaration,
   montant à payer, échéance, export légal — s'abstient de s'afficher si le
   barème ne couvre pas la période. Une prévision, elle, s'affiche avec son
   hypothèse **visible**.
5. **Le dérivé n'est jamais stocké.** Seuls les faits sont persistés.
6. **Aucune donnée personnelle dans le code.** Ni nom, ni SIRET, ni IBAN, ni
   BIC, ni client. Régression déjà survenue et exposée publiquement. Un
   garde-fou de test la bloque désormais.
7. **La mise en page ne se calcule pas en JS.** Tout en CSS. L'ancienne
   version recalculait les grilles avec `window.innerWidth`, avec un bug
   vérifié : élargir au-delà de 600 px ne les restaurait jamais.
8. **Un test vert doit signifier quelque chose.** Pas de `catch` qui avale,
   pas de plancher d'assertions complaisant.
9. **Aucune fonction nouvelle avant la bascule** (J6), sauf les justificatifs
   qui sont un invariant de conformité. Une réécriture qui ne bascule jamais
   est un échec.

---

## 3. Ce qui est fait

### Sécurité — fuite de données fermée

Les valeurs par défaut de `COMPANY`, `MISSIONS`, `CLIENTS` et `TREASURY`
contenaient les données réelles du propriétaire (nom, SIRET, IBAN, BIC, TVA
intracom, client, TJM). `index.html` étant servi publiquement et
`onboardingDone` valant `true`, tout visiteur au stockage vide démarrait sur
ces données, sans authentification.

- Valeurs neutralisées, `onboardingDone: false`, commentaire d'avertissement.
- Correctif poussé sur `main` (déployé).
- IBAN et BIC **purgés de tout l'historique git** sur les trois branches.
- Sauvegarde intégrale de l'app d'origine sur `backup/v1-monolithe-pre-refonte`.
- RLS Supabase **vérifié fonctionnel** : requête anonyme avec la clé publique
  renvoie `200` et `[]`. La clé anon en clair est normale, ce n'est pas une faille.
- **Exposition passée non annulable** : la donnée a été publique. Le
  propriétaire a été invité à prévenir sa banque.

### J0 — Vérité et filet (terminé)

**Harnais de tests réparé.** Il annonçait « 47 passés, 0 échoués » sans rien
vérifier. Trois défauts : le mauvais bloc `<script>` était évalué (419 Ko de
jsPDF au lieu de l'application, qui est dans le 4ᵉ bloc) ; l'exception était
avalée par un `catch` ; aucun plancher d'assertions. Le `catch` masquait un
échec authentique. **90 assertions réelles**, vérifiées par trois tests
négatifs (casser `safeNum`, réintroduire un IBAN, supprimer un bloc → tous
sortent en code 1).

**Bug d'argent corrigé.** `getUrssafRate()` tronquait le mois à son année :
juillet 2026 et les mois suivants étaient calculés à **25,6 % au lieu de
26,1 %**. Table `URSSAF_PERIODS` par intervalle de dates, résolution par mois,
`getUrssafRate()` délègue sans changer de signature (les 8 sites de calcul en
bénéficient sans modification). Ajout de `peutEngagerSurUrssaf()` et
`motifRefusUrssaf()`.

**Régime toujours BNC.** L'IIFE `LEGAL` lisait `COMPANY` déclaré ~90 lignes
plus bas : `undefined` par hoisting. Champs dépendants du type convertis en
accesseurs.

**`getLegal()`** ne retombe plus sur un 2026 codé en dur.

**Échéances réglementaires.** `ECHEANCES_REGLEMENTAIRES` alerte sur la
réception obligatoire des factures électroniques au **01/09/2026**, avec
préavis, montée en gravité à 30 jours, et maintien de l'alerte après échéance.

### J2 — Coquille et migration (l'essentiel est fait)

**L'application se lance, s'affiche et est vérifiée.** `npm run verifier`
enchaîne typage, tests, build et contrôle responsive.

- **Build** : 198 Ko de JS, 63 Ko gzippé, sous le plafond d'avertissement de
  250 Ko. À comparer aux 1,86 Mo de l'ancienne version, dont 627 Ko de
  bibliothèques bloquantes et non cachables.
- **Tokens** : les 4 palettes aux valeurs exactes de `v1.11.css`, 41 tokens
  thémés + 12 fixes. Les deux défauts du design sont corrigés : `clair` a
  désormais ses propres `--r`/`--r-sm`, et `--c-ir`/`--c-cfe`/`--slate`/
  `--blue-soft` sont thémés dans les 4 palettes.
- **Thème appliqué avant le premier rendu** par le script inline de
  `index.html` — vérifié par assertion, pas supposé.
- **Coquille** : rail latéral en desktop, dock flottant en pilule ≤ 760 px avec
  libellé sur l'onglet actif seul. **Entièrement en CSS**, mobile-first en
  couches `min-width`, bascule à 761 px. Aucun `window.innerWidth`.
- **Routage réel** par hash, `navigation.ts` comme source unique. La détection
  par `document.title` et l'appariement des badges par préfixe de texte ont
  disparu.
- **Migration** écrite et testée : rapport à blanc, instantané avant écriture,
  idempotence, invariant d'absence de perte.
- **Vérification responsive automatisée** (`scripts/verifier-responsive.mjs`) :
  **5 tailles × 4 palettes = 20 combinaisons**, toutes conformes. Contrôle le
  zéro-débordement horizontal, la forme de la navigation selon le palier, les
  cibles tactiles ≥ 44 px en portrait, et l'application du thème avant rendu.
  ⚠️ Chromium est préinstallé à une version qui ne correspond pas au paquet
  Playwright : le script pointe `/opt/pw-browsers/chromium-1194/...`
  explicitement. **Ne pas lancer `npx playwright install`.**

### J1 — Noyau fiscal (démarré)

Projet `app/` créé : **Vite 7 + React 19 + TypeScript strict** (dont
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`erasableSyntaxOnly`), Vitest, Zustand. `npm install` fait, typecheck et
tests verts.

- `app/src/domain/types.ts` — types nominaux `Euros`, `Ratio`, `Mois`,
  `DateISO` (pour qu'un euro ne puisse pas être multiplié par un euro), et
  surtout le type **`Resolution<T>`** à trois états : `publie` / `hypothese`
  / `refuse`. Le compilateur force l'appelant à traiter les trois cas, au
  lieu de recevoir un nombre dont il ignore la fiabilité.
- `app/src/domain/bareme/urssaf.ts` — barème par périodes, `tauxCotisations()`,
  `libelleHypothese()`, `verifierIntegrite()`.
- `app/src/domain/bareme/urssaf.test.ts` — **23 tests** : les 10 bascules mois
  par mois, l'asymétrie du temps, la contiguïté de la table, la provenance.

---

## 4. Ce qui reste — par jalon

### J1 · fin du noyau fiscal
- [x] ~~Abattement, plafonds, TVA, impôt~~ — **fait et couvert.** 82 tests
      ajoutés, `bareme/index.ts` en place avec `verifierIntegriteBareme()`.
      Tests éprouvés par mutation : réintroduire le facteur `× 1,56` déclenche
      2 échecs, inverser la borne du seuil majoré 1 échec.
- [ ] Grille CFE et ACRE par période (non traités)
- [ ] `provisions()` **à deux volets** (voir D3) : échéances émises non payées
      **+** charges à provisionner sur recettes encaissées non déclarées. Exige
      un fait **« période déclarée »** qui n'existe nulle part aujourd'hui
- [ ] `dispo()`, `versable()`, réserve unifiée (D4)
- [ ] Régime d'imposition comme discriminant (D2) : VL ⇒ 2,2 % intégré au
      prélèvement URSSAF et **aucun** acompte PAS ; barème ⇒ acompte PAS
      **saisi** (montant notifié par la DGFiP, pas calculable)
- [ ] Harnais différentiel contre l'app actuelle, distinguant **régression** et
      **correction intentionnelle** adossée à une décision datée

### J2 · coquille et migration
- [ ] Tokens : les 4 palettes, valeurs exactes de `v1.11.css`. **Corriger au
      passage** : `clair` ne redéfinit pas `--r`/`--r-sm` et hérite donc du
      thème sombre ; `--c-ir`, `--c-cfe`, `--slate`, `--blue-soft` ne sont
      jamais rethémées
- [ ] Application du thème **avant le premier rendu** (script inline, évite le flash)
- [ ] Rail 212 px desktop / dock flottant en pilule ≤ 760 px, libellé sur
      l'onglet actif seul
- [ ] Routage réel, une route par écran. **Supprimer** la détection par
      `document.title` et l'appariement des badges par préfixe de texte
- [ ] Migration `freel_v50_*` → nouveau schéma : rapport à blanc, instantané
      exporté **avant** toute écriture, idempotence, invariant d'absence de perte
- [ ] Migration du **blob cloud** Supabase, pas seulement du local
- [ ] Matrice Playwright + **assertion de zéro débordement horizontal à 390 px**

### J3 · Pilote + Outils
- [x] ~~Écran Pilote, zéro nombre en dur~~ — **fait.** Couche d'état
      (`state/store.ts`, un seul écrivain par fait) et sélecteurs
      (`state/selecteurs.ts`, aucun dérivé stocké). Curseur de réserve = seule
      source de la réserve (D4). Vérification de bout en bout dans un vrai
      navigateur : données de l'ancien format migrées, affichées, provisions
      volet 2 comprises, idempotence au rechargement.
- [x] ~~Primitives d'UI accessibles~~ — **Sheet** (dialogue modal, piège de
      focus dans les deux sens, Échap, voile, restitution du focus, verrou de
      défilement) et **Info** (motif « i », cible 44 px au lieu de 18,
      `aria-describedby`, clic garanti au clavier). 22 tests en jsdom, éprouvés
      par mutation. Restent à faire : sémantique d'onglets ARIA et région live
      pour les toasts.
- [x] ~~`allTodos()` réel~~ — **fait**, `domain/calculs/aTraiter.ts`, 26 tests.
- [x] ~~Écran Outils~~ — **fait.** Simulateur d'IR câblé sur le barème
      (abattement, tranches, calcul progressif), détail par tranche dans le
      panneau latéral, hypothèse affichée quand les tranches ne sont pas
      publiées pour la période.
- [ ] Mouvements bancaires : `selecteurs.solde()` renvoie pour l'instant le seul
      solde initial. Un seul endroit à changer, volontairement isolé
- [ ] Outils remonté ici : l'écran le moins cher prouve le noyau tôt
- [ ] Comparateur micro-BNC vs déclaration contrôlée **avant le 30/09**

### J4 · Argent
- [x] ~~Écran Argent~~ — **fait.** Deux sections en onglets ARIA, enveloppes de
      provision à deux volets, chiffre d'affaires mois par mois.
- [x] ~~Graphes Chart.js → SVG~~ — `GrapheBarres`, sans dépendance, avec la
      donnée doublée en tableau accessible.
- [ ] Cycle d'échéance enrichi (à déclarer → déclarée → payée, daté)
- [ ] jsPDF différé ; retirer les méta anti-cache (concerne le legacy)

### J5 · Achats, Activité, Config
- [x] ~~Justificatifs sur **IndexedDB**, invariant « pas de TVA sans pièce »~~ —
      **fait.** `infra/justificatifs.ts` : le fichier est conservé, avec une
      empreinte SHA-256 et l'horodatage du dépôt. C'est l'empreinte, recalculée
      par `verifierIntegrite()`, qui donne à la copie numérique sa valeur
      probante — l'ancienne version n'avait qu'un booléen `piece: true`, sans
      fichier ni trace, classé « sans valeur probante » par l'audit.
- [x] ~~Écran Achats~~ — **fait.** L'écran chiffre ce que les pièces manquantes
      coûtent (`tvaPerdueFauteDePiece`) : « justificatif manquant » n'incite
      personne à chercher une facture, un montant si.
- [x] ~~État de rapprochement explicite et corrigeable~~ — **fait.**
      `rapproche` / `en_attente` / `sans_banque`, stocké et non redéduit à
      l'affichage. Invariant : jamais « rapproché » sans relevé disponible.
- [x] ~~Autoliquidation TVA sur achats hors de France~~ — **détectée et
      signalée** : TVA due **et** non déductible. La déclaration (DES) reste à
      produire.
- [x] ~~Reprise des charges de l'ancienne trésorerie~~ — **fait.** Les
      mouvements de type `Charge` deviennent des dépenses, toutes avec
      `justificatifId: null` : la migration ne peut pas inventer les pièces
      manquantes, et le rapport le dit, chiffres à l'appui.
- [x] ~~Écran Activité~~ — **fait.** Calendrier des congés **dans la page** et
      non dans une modale : on voit les jours posés et leur effet sur
      l'occupation en même temps, ce qui est la seule question qu'on se pose en
      les posant.
- [x] ~~Taux d'occupation sur un dénominateur réel~~ — jours ouvrables du mois,
      jours fériés **calculés** (comput de Pâques compris) et congés déduits.
      L'ancienne version divisait par 20, une constante : un mois de mai à
      19 jours ouvrés donnait 95 % à qui avait travaillé tous les jours.
- [x] ~~Délai de paiement par client~~ — **médiane** et non moyenne : un client
      qui paie à 30 jours neuf fois et à 300 une fois n'est pas un client à
      57 jours.
- [x] ~~Écran Config, et l'édition du barème~~ — **fait.** Une période URSSAF
      s'ajoute depuis l'application, avec sa source et la date de saisie. C'est
      ce qui rend le barème maintenable : sans cette porte, un taux périmé
      resterait appliqué indéfiniment, ou l'alerte de fraîcheur bloquerait les
      déclarations sans que personne puisse la lever. Le domaine refuse de
      réécrire une période close — recalculer un trimestre passé doit redonner
      le montant réellement déclaré à l'époque.
- [x] ~~Retirer la section « Propositions Claude Code »~~ (D5) — **fait**, elle
      n'existe pas dans le nouvel écran.
- [x] ~~Déclaration européenne de services (DES)~~ — **fait.** Un point avait
      été mal compris dans les jalons précédents et il fallait le lever avant
      d'écrire une ligne : **la DES est due par celui qui VEND** un service à
      un assujetti d'un autre État membre, pas par celui qui en achète.
      L'écran Achats détecte l'autoliquidation à l'achat, qui relève de la
      déclaration de TVA ; la DES regarde les **recettes**.
      · **La franchise en base n'en dispense pas**, et il n'y a aucun seuil :
        une prestation de 50 € déclenche l'obligation.
      · **750 € d'amende par déclaration** manquante ou inexacte. Forfaitaire :
        le montant en jeu ne dépend pas du chiffre d'affaires mais du nombre de
        mois oubliés. D'où le placement parmi les retards du Pilote.
      · Le mois retenu est celui de l'**émission**, pas de l'encaissement — la
        taxe est exigible chez le preneur à l'achèvement de la prestation. Le
        livre des recettes et la DES ne coïncident donc pas, et l'écran le dit.
      · Une ligne sans numéro de TVA du preneur est **bloquée** plutôt que
        déposée : une déclaration inexacte est sanctionnée comme une absente.
- [x] ~~Livre des recettes conforme~~ — **fait.** Le registre se tient en
      **ajout seul** : une recette encaissée ne se modifie pas et ne se
      supprime pas, elle s'annule par une écriture inverse datée du jour de la
      correction. Les deux écritures restent visibles, leur somme est nulle.
      Un registre qu'on peut réécrire ne prouve rien.
      · Mentions obligatoires constatées une par une (date d'encaissement, mode
        de règlement, identité du client, référence de pièce) — l'écart est
        **nommé**, « registre non conforme » n'aide personne à le corriger.
      · Numérotation : trous et doublons signalés. Un numéro absent se lit, en
        contrôle, comme une facture retirée du registre.
      · Un brouillon jamais émis se supprime et libère son numéro ; une facture
        émise ne se supprime plus, elle s'annule par un avoir.
- [x] ~~Import de relevé bancaire~~ — **fait.** Lecture CSV qui **dit ce qu'elle
      a compris** (séparateur, colonnes, format de date, lignes écartées et
      pourquoi) : il n'existe pas de format d'export bancaire, et une colonne
      mal interprétée produirait des montants plausibles que rien ne
      signalerait. Réimporter un relevé qui recouvre le précédent — le cas
      ordinaire — n'ajoute que ce qui manque : le solde ne double pas.
- [x] ~~`selecteurs.solde()` réel~~ — solde initial plus les mouvements. La
      fonction avait été isolée dès le départ pour que ce changement n'ait
      qu'un seul endroit à toucher : **aucun écran n'a eu à être modifié**.
- [x] ~~Rapprochement bancaire~~ — l'écran **propose**, l'utilisateur tranche.
      Un candidat unique reste un candidat : le valider d'office ferait ce
      qu'on reproche à l'ancienne version, en plus discret. Le montant doit
      correspondre **au centime** — une tolérance masquerait un écart de
      règlement, ce qu'un rapprochement est censé faire apparaître.
- [x] ~~`banqueReliee` retiré du schéma~~ — il était devenu DÉRIVABLE dès que
      les mouvements ont existé. Le garder aurait enfreint l'invariant n°5, et
      permis qu'un booléen à `true` coexiste avec une liste vide.

### J6 · bascule (après le 31/10)
- [ ] Nouvelle version à la racine, ancienne **neutralisée en écriture** sous `/legacy/`
- [ ] Neutralisation en 4 points : mandataire remplaçant `window.localStorage`,
      synchro coupée, autre table Supabase, espace de noms disjoint (**surtout
      pas** `freel_app_version`, qui déclenche un `location.reload()`)
- [ ] Test Playwright prouvant zéro écriture et zéro requête depuis `/legacy/`

### Hors séquence
- [ ] Règles RLS Supabase durcies (vérifiées actives, à documenter) — 1 h

---

## 4 bis. Leçon du 12/08 — les jeux d'essai reproduisaient la supposition

Le mappage des factures legacy était faux sur **presque tous les champs** :
le code cherchait `montant`, `date`, `datePaiement` et `payee` ; l'ancienne
application emploie `ht`, `dateEnvoi`, `datePaiementReel` et `status`. Les
recettes arrivaient donc à **zéro euro, sans date et jamais encaissées** —
chiffre d'affaires vide, provisions nulles, livre des recettes vide.

Trois contrôles auraient dû l'attraper, et aucun ne l'a fait :

| Contrôle | Pourquoi il a laissé passer |
|---|---|
| Tests de migration | Le jeu d'essai portait les noms **supposés**, pas les vrais |
| `verifierAbsenceDePerte` | Il lisait le même mauvais champ : il comparait zéro à zéro et concluait « aucune perte » |
| Migration de bout en bout | Son jeu d'essai aussi ; et il ne vérifiait que le **nombre** de recettes, jamais leur contenu |

**Règle qui en découle.** Les noms de champs d'un jeu d'essai legacy se
**relèvent** du code d'origine, jamais ne se supposent :

```
grep -ohE "f\.[a-zA-Z]+" index.html | sort | uniq -c | sort -rn
```

Et un contrôle de reprise doit porter sur le **contenu**, pas sur le compte :
deux recettes vides passent un test qui compte deux recettes.

C'est l'utilisateur qui l'a détecté, en constatant que « les données
n'apparaissent pas partout » après connexion à Supabase.

---

## 5. Points ouverts

| Sujet | État |
|---|---|
| **Taux de cotisations** | **Erreur corrigée le 12/08.** La table portait une bascule à 26,1 % au 1er juillet 2026. Ce taux avait bien été programmé, mais le **décret n° 2025-943 du 8 septembre 2025** a plafonné la dernière marche à **25,6 %** : la bascule n'a jamais eu lieu. Les deux applications surestimaient donc les cotisations d'un demi-point depuis juillet 2026. `urssaf.fr` renvoie toujours 503 ; la correction s'appuie sur deux sources secondaires concordantes citant le décret. Un avis d'appel réel reste le recoupement de premier ordre |
| **ACRE au 01/07/2026** | Passage de l'abattement de 50 % à 25 % **probable mais non confirmé**. Sans effet sur le propriétaire (ACRE éteinte depuis le T1 2026), nécessaire pour recalculer un trimestre passé |
| **Export FEC** | Retiré du périmètre (D6). Code conservé sur la branche de sauvegarde |
| **Marge de build** | Réglé. React est sorti dans un chunk `vendor` : il ne change pas d'un déploiement à l'autre, donc le cache du navigateur le conserve. Modifier une ligne de code invalidait 248 Ko ; désormais 55 |
| **Relevé bancaire** | Aucun n'est importé : `Faits.banqueReliee` vaut `false`, et l'écran Achats l'annonce au lieu d'afficher un rapprochement fictif. L'import de relevé est la brique qui manque, et elle débloquera aussi `selecteurs.solde()` |
| **Coquille lisible en J2** | Optimisation retenue : afficher un écran réel sur l'**ancien** schéma en lecture seule, pour valider le mappage de migration à l'œil avant qu'il soit terminal |

---

## 6. Conventions de code

- **Français** pour les noms de domaine métier, les commentaires et les
  messages d'erreur. L'app est franco-française et ses termes sont juridiques.
- Les commentaires expliquent **pourquoi**, pas quoi. Un commentaire qui
  paraphrase le code est du bruit ; un commentaire qui explique une asymétrie
  ou un piège légal a de la valeur.
- Le domaine est **pur** : aucun import de React, du DOM ou du stockage dans
  `src/domain/`. C'est ce qui le rend testable et vérifiable.
- Un test par comportement, nommé en français, décrivant la règle et non la
  fonction.
- `npm run typecheck && npm test` avant chaque commit.

---

## 7. Commandes

```
cd app
npm install
npm run dev         # serveur de développement
npm test            # tests du domaine
npm run typecheck   # TypeScript strict
npm run build       # build de production

# à la racine : tests de l'app existante (legacy)
node tests/smoke-test.js
```
