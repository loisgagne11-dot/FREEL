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

**Sanité au moment de la reprise** — `cd app && npm run verifier` : 189 tests,
typage strict, build à 198 Ko / 63 Ko gzippé, 20 combinaisons responsive
conformes. Si l'un de ces chiffres a baissé, quelque chose a régressé.

---

## 1. À lire, dans cet ordre

| Ordre | Document | Ce qu'il apporte |
|---|---|---|
| 1 | **ce fichier** | Où on en est, quoi faire ensuite |
| 2 | [`PLAN-REFONTE.md`](./PLAN-REFONTE.md) | Les 6 décisions arbitrées (D1–D6), le barème par périodes, les 7 jalons |
| 3 | [`AUDIT-REDESIGN-V1.11.md`](./AUDIT-REDESIGN-V1.11.md) | Le diagnostic complet |
| 4 | [`audit/05-spec-ecrans.md`](./audit/05-spec-ecrans.md) | La spec écran par écran, à consulter au moment d'implémenter chaque écran |
| 5 | [`audit/03-design-system.md`](./audit/03-design-system.md) | Tokens, media queries, responsabilités du shell |

Les autres rapports d'`audit/` sont des références ponctuelles.

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
- [ ] Primitives d'UI accessibles : `role="dialog"`, piège de focus, sémantique
      d'onglets, région live (le `.info` du design est à 18 px, cible à 44)
- [ ] `allTodos()` réel (partir de `computeAlerts` de l'ancienne app)
- [ ] Mouvements bancaires : `selecteurs.solde()` renvoie pour l'instant le seul
      solde initial. Un seul endroit à changer, volontairement isolé
- [ ] Outils remonté ici : l'écran le moins cher prouve le noyau tôt
- [ ] Comparateur micro-BNC vs déclaration contrôlée **avant le 30/09**

### J4 · Argent
- [ ] Les 9 graphes Chart.js → SVG maison ; jsPDF différé ; retirer les méta anti-cache
- [ ] Cycle d'échéance enrichi (à déclarer → déclarée → payée, daté)

### J5 · Achats, Activité, Config
- [ ] Justificatifs sur **IndexedDB**, invariant « pas de TVA sans pièce »
- [ ] État de rapprochement explicite et corrigeable (`matched`/`pending`/`nobank`)
- [ ] Autoliquidation TVA sur achats hors de France, et DES
- [ ] Livre des recettes conforme : `paidAt`, `modeReglement`, journal en ajout
      seul, correction par annulation
- [ ] Écran d'édition du barème dans Config + alerte de fraîcheur
- [ ] Retirer la section « Propositions Claude Code » (D5)

### J6 · bascule (après le 31/10)
- [ ] Nouvelle version à la racine, ancienne **neutralisée en écriture** sous `/legacy/`
- [ ] Neutralisation en 4 points : mandataire remplaçant `window.localStorage`,
      synchro coupée, autre table Supabase, espace de noms disjoint (**surtout
      pas** `freel_app_version`, qui déclenche un `location.reload()`)
- [ ] Test Playwright prouvant zéro écriture et zéro requête depuis `/legacy/`

### Hors séquence
- [ ] Règles RLS Supabase durcies (vérifiées actives, à documenter) — 1 h

---

## 5. Points ouverts

| Sujet | État |
|---|---|
| **Taux de cotisations** | Valeurs du propriétaire, à recouper **une fois** avec un avis d'appel réel. `urssaf.fr` renvoie 503 sur ses pages de barème. C'est le seul chiffre du projet où une erreur coûte plusieurs milliers d'euros par an |
| **ACRE au 01/07/2026** | Passage de l'abattement de 50 % à 25 % **probable mais non confirmé**. Sans effet sur le propriétaire (ACRE éteinte depuis le T1 2026), nécessaire pour recalculer un trimestre passé |
| **Export FEC** | Retiré du périmètre (D6). Code conservé sur la branche de sauvegarde |
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
