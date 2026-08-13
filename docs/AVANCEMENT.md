# État d'avancement — reprise de session

**Ce fichier est le point d'entrée de toute nouvelle session.** Il se lit en
premier, avant tout autre document. Il est mis à jour à chaque fin de lot de
travail. Si son contenu contredit un autre document, c'est lui qui fait foi
sur l'état d'avancement — les autres font foi sur les décisions.

**Dernière mise à jour** : 13 août 2026
**Branche de travail** : `claude/orchestration-redesign-screens-0ee3sz`, repartie de `main`
**Schéma des faits** : **v6**

Les PR #245 à #264 sont **mergées et closes** : elles ne peuvent plus porter de
travail, toute suite donne lieu à une nouvelle PR. Tout ce qu'elles contiennent
est sur `main` et déployé.

**Sanité au moment de la reprise** — `cd app && npm run verifier` enchaîne
typage, tests, build, budget, responsive, index périmé, confidentialité,
migration de bout en bout et absence de données personnelles. Repères au
dernier passage :

| Repère | Valeur |
|---|---|
| Tests | **1 011** sur 59 fichiers (+ 91 côté legacy) |
| Build | **78,2 Ko** de code applicatif, 188 Ko de bibliothèques, 289 Ko au premier rendu |
| Budget | conforme sur les **4 postes** vérifiés |
| Responsive | **140 combinaisons** (5 tailles × 4 palettes × **7 écrans**) |
| Confidentialité | aucun montant lisible sur les 7 écrans |
| Migration | conforme |

Un nombre de tests en baisse, ou un budget dépassé, signale une régression.

**Ce fichier avait quinze jours de retard au 13/08** — il annonçait 565 tests et
58 Ko quand il y en avait 961 et 78. Le document qui « fait foi sur l'état
d'avancement » ne peut pas être celui qu'on oublie de tenir : ses chiffres se
relèvent de la sortie de `npm run verifier`, jamais de mémoire.

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
| **Créer un client** | ✅ | ✅ |
| **Créer une mission** | ✅ | ✅ |
| **Émettre une facture, et son PDF** | ✅ | ✅ |
| **Écrire dans Supabase** (synchro) | ✅ | ✅ (12/08, table distincte) |

**La parité fonctionnelle est atteinte.** Le legacy peut être retiré au
calendrier prévu (J6, après le 31/10) sans priver l'utilisateur d'une fonction
— notamment de son outil de facturation, une facture non émise étant un revenu
non encaissé.

**L'écriture Supabase, et pourquoi elle n'écrase jamais en silence.** Les faits
de cette version vont dans `freel_faits`, **pas** dans `user_data` : deux
tables, deux vies, l'ancienne application reste utilisable et un essai de la
nouvelle ne peut pas abîmer ses données. Le script de création est dans
`docs/supabase.sql` (RLS activée, aucune règle de suppression).

Chaque ligne porte un compteur `version`. L'application n'écrit qu'avec le
filtre `version = <celle qu'elle a lue>` : c'est le **serveur** qui vérifie, en
une opération atomique. Une vérification côté application — lire, comparer,
écrire — laisserait entre la lecture et l'écriture une fenêtre où le second
appareil se glisse, et c'est exactement la perte à empêcher. Zéro ligne
modifiée ⇒ refus, et l'écran présente les deux états côte à côte plutôt que de
proposer « réessayez », qui écraserait justement ce qu'il fallait préserver.

Trois refus délibérés, tous du même ordre — ne rien faire vaut mieux que faire
à l'aveugle :

- **aucune fusion automatique.** Réunir deux jeux d'écritures comptables
  demande de savoir, ligne à ligne, laquelle fait foi ; le deviner produirait
  un registre que personne n'a validé ;
- **envoi indisponible tant que l'état du compte est inconnu.** `'inconnu'`
  n'est pas `null` : l'un dit « le compte est vide », l'autre « on n'a pas
  réussi à regarder ». Les confondre autoriserait un premier envoi qui
  écraserait en fait des données existantes ;
- **un bloc écrit par une version plus récente est refusé, pas raboté.** Le
  charger reviendrait à en ignorer les champs inconnus, puis à les effacer au
  premier renvoi : une version ancienne détruirait le travail fait sur une
  plus récente.

Ce dernier point a exigé de valider les faits à l'entrée (`motifRefusFaits`).
Tant qu'ils ne venaient que de `localStorage`, un `JSON.parse(...) as Faits`
passait : l'application relisait ce qu'elle avait écrit. Venant du réseau, le
transtypage laissait entrer un `recettes` qui n'est pas un tableau, et l'erreur
n'apparaissait qu'à l'affichage — après avoir écrasé l'état local. Portée
réelle du contrôle : la **forme de premier niveau**, pas le contenu de chaque
enregistrement.

**Ordre respecté.** Clients et missions d'abord, car une facture s'y rattache
— fait le 12/08 ; la facturation ensuite — faite le 12/08 ; l'écriture Supabase
en dernier, parce qu'elle est la seule opération qui peut abîmer des données
existantes et qu'elle demande donc que le reste soit sûr.

**Pas de bibliothèque PDF.** La facture est du HTML mis en page pour
l'impression : « Imprimer → Enregistrer en PDF » donne le fichier. jsPDF pesait
627 Ko dans l'ancienne version, pour produire un document que le navigateur
sait déjà fabriquer. Le renoncement assumé : aucun fichier n'est produit par
programme, donc joindre une facture à un courriel passe par la boîte
d'impression.

**Un piège du modèle, traité.** Le rattachement d'une recette à son client se
fait par **nom**, l'ancienne application n'ayant jamais posé d'identifiant.
Renommer un client casserait donc silencieusement ses missions et ses recettes.
Le magasin propage le nouveau nom dans la même écriture, et l'écran avertit
avant d'enregistrer. Passer aux identifiants serait la bonne forme, mais
supposerait de deviner à quel client rattacher chaque recette historique —
c'est-à-dire d'inventer un lien.

---

## 1. À lire, dans cet ordre

| Ordre | Document | Ce qu'il apporte |
|---|---|---|
| 1 | **ce fichier** | Où on en est, quoi faire ensuite |
| 2 | [`PLAN-REFONTE.md`](./PLAN-REFONTE.md) | Les 6 décisions arbitrées (D1–D6), le barème par périodes, les 7 jalons |
| 3 | [`AUDIT-REDESIGN-V1.11.md`](./AUDIT-REDESIGN-V1.11.md) | Le diagnostic complet |
| 3 bis | [`AUDIT-ANCIENNE-VS-NOUVELLE.md`](./AUDIT-ANCIENNE-VS-NOUVELLE.md) | **Ce qui manque encore**, fonction par fonction, avec l'ordre de traitement proposé |
| 4 | [`design/03-design-system.md`](./design/03-design-system.md) et [`design/05-spec-ecrans.md`](./design/05-spec-ecrans.md) | **Les deux spécifications qui font foi sur le visuel** : tokens, composants, et écran par écran ce qui doit s'y trouver |
| 5 | [`design/handoff-v1.11/`](./design/handoff-v1.11/) | **La source** : les prototypes eux-mêmes, plus `annexe-architecture-build5.md` (les deux stores, les règles de calcul, le vocabulaire). Lire d'abord son [`PROVENANCE.md`](./design/handoff-v1.11/PROVENANCE.md) |
| 6 | le code lui-même | Les six écrans sont écrits ; leurs en-têtes portent le *pourquoi* de chaque choix |

Les neuf documents de `docs/design/` avaient été retirés du dépôt le
12/08/2026 comme « rapports d'audit ». C'était une erreur de nature : deux
d'entre eux ne sont pas des constats mais des **spécifications** — ce qu'on
doit construire, pas ce qu'on a trouvé. Ils ont été restaurés le 13/08
(`fdc0fc2^`) et ne doivent plus être supprimés : un écart de conformité
visuelle ne se juge que contre eux (voir §4 ter).

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

### Conformité visuelle et chaîne planning → CRA (13/08)

Le propriétaire a signalé que le visuel ne correspondait pas à ce qu'il avait
conçu. Il avait raison, et la première comparaison que j'ai produite était
elle aussi fausse : je l'avais faite contre `AUDIT-REDESIGN-V1.11.md`, un
diagnostic, alors que la référence est `design/05-spec-ecrans.md`, une
spécification — que mon propre rangement avait supprimée du dépôt (§4 ter).

**Ce qui a été construit.** Chaque composant a sa feuille CSS Modules, ses
tests, et un en-tête qui porte le motif du choix.

| Composant | Ce qu'il apporte, et pourquoi |
|---|---|
| `Greet` | L'en-tête personnalisé de la spec. Le repère chiffré à côté du bonjour : la première question du matin n'est pas « qui suis-je » |
| `BarrePeriode` | Mois / trimestre / année / tout, **une seule** barre partagée. Deux sélecteurs de période sur un même écran finissent par se contredire |
| `Montant` | Le porteur de `data-montant`. Un euro affiché sans passer par lui échappe au mode confidentiel — c'est le seul point d'entrée |
| `Statut`, `Jauge`, `Repartition` | Les primitives de la spec : pastille d'état, barre de remplissage, répartition à légende |
| `FluxCard`, `SanteCard` | Les cartes d'en-tête d'Argent et de Pilote |
| `Vide` | L'état vide **nommé** : « aucune mission » avec le geste qui suit, au lieu d'un tableau à zéro ligne qui ressemble à une panne |
| `PastillesSysteme` | L'état de la synchronisation. Les pastilles Cloud/Documents/Qonto de la maquette sont restées dehors : aucune intégration ne les alimente, une pastille verte qui ne mesure rien est pire qu'absente |
| `VueSemaine` | Le planning à la semaine, avec ajustement d'une journée |
| `CraCard` | Le compte rendu d'activité, **produit** et non saisi. Une mission par page à l'impression : un CRA se remet au client, deux missions sur la même feuille exposeraient à l'un ce que l'autre achète |
| `Toasts` | `role="status"` et non `alert` : la confirmation est lue sans voler le focus. Seulement pour les actions dont l'effet est invisible — poser un congé colore la case, ça n'a pas besoin d'être confirmé |

**La chaîne mission → planning → CRA** (`domain/calculs/planning.ts`). Le
sens de lecture avait été pris à l'envers dans mon premier jet : le CRA
n'alimente pas le planning, il en sort. On déclare un **rythme** sur la
mission (les jours de la semaine travaillés), le planning se remplit seul,
on **ajuste** à la journée, et le CRA est la sortie. D'où la règle centrale :
un ajustement l'emporte toujours sur le rythme, **y compris à zéro** —
sans quoi une journée retirée à la main reviendrait au rechargement suivant.

**Mode confidentiel** (`ui/confidentialite.ts`). Un attribut
`data-confidentiel` sur `<html>`, appliqué **avant React** par le script
inline, et une règle CSS unique qui floute tout `[data-montant]`. `user-select:
none` avec : un montant masqué ne doit pas non plus partir en copier-coller.
Levé à l'impression, où le masquage n'aurait aucun sens.
Le vérificateur `verifier:confidentialite` charge les 7 écrans dans un vrai
navigateur, cherche tout texte qui ressemble à un montant et contrôle le
**style calculé**. Il a trouvé **25 fuites en trois passes** — des tuiles qui
recevaient des chaînes déjà formatées, la légende de `Repartition`, les
nombres de `Jauge`, les valeurs de `SanteCard`. Sans ce contrôle en
navigateur, le mode confidentiel serait parti à moitié fonctionnel.

**Solde initial et besoin mensuel** avaient un champ dans le schéma et
**aucune interface** : impossible de les saisir. Découvert en cherchant
pourquoi le solde de trésorerie affiché ne ressemblait pas à celui de
l'ancienne application. Ce n'était pas un bug de calcul — l'ancienne
*simule* un solde à partir des encaissements moins les charges payées, la
nouvelle part d'un solde bancaire réel. Il fallait pouvoir le renseigner.

**Ce qui a été refusé, et pourquoi.** Trois cartes de la maquette Argent
(`FluxChart`, `CapaciteBarChart`, `VersementCard`) et le score de santé
sur 100 ne sont pas construits : ils demanderaient soit d'inventer des
données, soit de contredire la décision D4 (réserve unifiée, source unique).
La spec elle-même note que ces valeurs sont codées en dur dans le prototype,
sans fonction qui les calcule. Une jauge qui affiche 72/100 sans rien mesurer
ressemble à une information — c'est exactement le défaut reproché à
l'ancienne version.

**Budget d'entrée.** L'ajout de ces écrans a fait passer le chunk d'entrée à
80,5 Ko pour un plafond de 80. Le plafond avait déjà été relevé une fois ;
plutôt qu'une seconde fois, `selecteurs.activite.ts` a été sorti du fichier
de sélecteurs monolithique — 76,6 Ko. Le même dépassement est revenu à
50 octets près en corrigeant la migration des missions ; même réponse,
`selecteurs.facture.ts` cette fois — **76,4 Ko**. Un budget qu'on relève à
chaque dépassement ne mesure plus rien.

La règle qui s'en dégage : **un sélecteur qui ne sert qu'à un écran différé
vit dans le module de cet écran.** `selecteurs.ts` est lu par le Pilote, qui
est au premier rendu ; tout ce qu'on y ajoute est téléchargé avant le premier
pixel, même si personne n'ouvre l'écran concerné.

### Quatre actions du magasin n'atteignaient aucun écran (13/08)

Le propriétaire a signalé qu'il ne pouvait ni retrouver ses factures, ni
changer leur statut, et que les valeurs restaient fausses. Un contrôle
systématique — pour chaque action du magasin, quel écran l'appelle — a donné
la réponse : **quatre n'étaient appelées par personne.**

| Action | Ce que son absence produisait |
|---|---|
| `encaisserRecette` | **Une facture émise ne pouvait JAMAIS passer en encaissée.** Le chiffre d'affaires encaissé restait figé, les provisions calculées dessus étaient fausses, et la trésorerie disponible avec elles |
| `marquerPeriodeDeclaree` | Une période déclarée restait à jamais dans le volet «&nbsp;à provisionner&nbsp;» (D3)&nbsp;: les provisions montaient sans redescendre, on mettait de côté deux fois la même dette |
| `modifierDepense` | Corriger une faute de saisie obligeait à supprimer puis ressaisir — ce qui **détachait le justificatif** et remettait le rapprochement à zéro |
| `supprimerBrouillon` | Un brouillon retenait son numéro sans qu'on puisse le jeter |

Le code du domaine était écrit, testé, correct. Il ne servait à rien. **Un test
unitaire vert sur une fonction que personne n'appelle ne prouve que la
fonction** — c'est le contrôle qui manquait, et il tient en une ligne :

```
for a in <actions>; do grep -rl "\b$a\b" src/ui --include=*.tsx; done
```

**Ce qui a été construit.**

- **Le facturier** (`components/Facturier.tsx`) — toutes les factures dans un
  seul endroit, avec leur état (brouillon / émise / en retard / encaissée /
  annulée / avoir), filtrées par période et par état, et les gestes qui vont
  avec. L'écran Facturer ouvre dessus ; la rédaction passe derrière un bouton,
  parce qu'on vient dix fois voir qui n'a pas payé pour une fois qu'on émet.
- **Le statut est DÉRIVÉ** (`domain/calculs/facturier.ts`), jamais stocké —
  invariant n°5. L'ancienne application portait un champ `status` qu'on pouvait
  passer à « payée » sans date d'encaissement : le registre affichait alors une
  facture réglée qu'aucune écriture ne prouvait.
- **Encaisser passe par un panneau**, pas par une case à cocher : la date ET le
  mode de règlement sont deux mentions obligatoires du livre des recettes. Il
  n'existe pas de geste en un clic qui produise une écriture conforme.
- **Le retard se compte en jours** et pas seulement en étiquette : « en
  retard » se relativise, « 43 jours » se relance.
- **Les périodes URSSAF** (`domain/calculs/declarations.ts`) suivent la
  périodicité déclarée en Config — un trimestriel déclare un trimestre, et le
  marquer déclaré marque ses **trois** mois, mois creux compris. Une période en
  cours n'est pas déclarable : l'URSSAF ouvre la déclaration après la clôture,
  et la cocher d'avance sortirait du volet « à provisionner » des recettes
  qu'on va encore encaisser dessus.
- **Corriger une dépense** ne passe que les champs du formulaire : la pièce
  déposée et l'état de rapprochement ne sont pas des saisies, et les renvoyer
  aux valeurs d'une dépense neuve détacherait le justificatif au premier
  changement de libellé.

---

## 4. Ce qui reste — par jalon

### J1 · fin du noyau fiscal
- [x] ~~Abattement, plafonds, TVA, impôt~~ — **fait et couvert.** 82 tests
      ajoutés, `bareme/index.ts` en place avec `verifierIntegriteBareme()`.
      Tests éprouvés par mutation : réintroduire le facteur `× 1,56` déclenche
      2 échecs, inverser la borne du seuil majoré 1 échec.
- [ ] Grille CFE et ACRE par période (non traités)
- [x] ~~`provisions()` **à deux volets** (D3)~~ — `domain/calculs/provisions.ts`.
      Le fait « période déclarée » qui manquait existe : `periodesDeclarees`
      dans le schéma. C'est lui qui fait basculer la dette du volet
      « à provisionner » vers le volet « constaté » ; sans lui les provisions
      surestiment la dette.
- [x] ~~`dispo()`, `versable()`, réserve unifiée (D4)~~ —
      `domain/calculs/tresorerie.ts`. Le `dispo` peut être négatif, le
      `versable` est borné à zéro : afficher un versable négatif inviterait à
      lire une dette comme un revenu.
- [x] ~~Régime d'imposition comme discriminant (D2)~~ — `versementLiberatoire`
      est un discriminant **exclusif** dans le schéma. VL ⇒ 2,2 % intégré au
      prélèvement URSSAF et aucun acompte PAS ; barème ⇒ acompte PAS **saisi**,
      jamais calculé, puisque le montant est notifié par la DGFiP.
- [ ] Harnais différentiel contre l'app actuelle, distinguant **régression** et
      **correction intentionnelle** adossée à une décision datée

### J2 · coquille et migration
- [x] ~~Tokens : les 4 palettes~~ — y compris les corrections repérées à
      l'audit (`clair` qui héritait des rayons du thème sombre, variables
      jamais rethémées).
- [x] ~~Thème appliqué **avant le premier rendu**~~ — script inline, et le
      vérificateur responsive l'assert sur chaque combinaison : sans assertion,
      un flash ne se voit que sur la machine de quelqu'un d'autre.
- [x] ~~Rail 212 px desktop / dock flottant ≤ 760 px~~ — vérifié par assertion
      sur `position` (`static` en desktop, `fixed` en portrait), pas par
      capture d'écran de complaisance.
- [x] ~~Routage réel, une route par écran~~ — la détection par
      `document.title` et l'appariement des badges par préfixe de texte ont
      disparu. Le routage est exhaustif (`const jamais: never`) : ajouter un
      écran sans le router ne compile pas.
- [x] ~~Migration `freel_v50_*` → nouveau schéma~~ — rapport à blanc,
      instantané exporté **avant** toute écriture, idempotence, invariant
      d'absence de perte.
- [x] ~~Migration du **blob cloud** Supabase~~ — même chemin de conversion que
      le local : deux chemins distincts finiraient par diverger, et
      l'application dirait deux choses différentes selon l'origine de la donnée.
- [x] ~~Matrice Playwright~~ — 140 combinaisons (5 tailles × 4 palettes ×
      7 écrans), **assertion de zéro débordement horizontal** comprise.

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
      par mutation. **Complété le 13/08** : les onglets ARIA existent
      (`Onglets`, utilisés par Argent) et la région live aussi (`Toasts`,
      `role="status"` — voir §3).
- [x] ~~`allTodos()` réel~~ — **fait**, `domain/calculs/aTraiter.ts`, 26 tests.
- [x] ~~Écran Outils~~ — **fait.** Simulateur d'IR câblé sur le barème
      (abattement, tranches, calcul progressif), détail par tranche dans le
      panneau latéral, hypothèse affichée quand les tranches ne sont pas
      publiées pour la période.
- [x] ~~Mouvements bancaires dans `selecteurs.solde()`~~ — solde initial **plus**
      les mouvements importés. L'isolement volontaire a tenu : un seul endroit
      à changer le jour où le relevé a existé.
- [x] ~~Outils remonté ici~~ — l'écran le moins cher a prouvé le noyau tôt.
- [x] ~~**Comparateur — échéance 30/09**~~ — **fait le 13/08.**

      **Correction d'une erreur de ce journal au passage.** Cette ligne
      annonçait un « comparateur micro-BNC vs déclaration contrôlée » en lui
      attachant la date du 30/09. Les deux ne vont pas ensemble : le 30
      septembre est la date limite de l'option pour le **versement
      libératoire** (`PLAN-REFONTE.md`, tableau des dates, le dit
      correctement), pas de l'option pour la déclaration contrôlée, qui a son
      propre calendrier. Le journal avait dérivé, et il aurait fait travailler
      sur le mauvais sujet — ou pire, agir sur le mauvais.

      C'est donc le comparateur **versement libératoire / barème** qui est
      construit, et c'est bien lui qui périme au 30/09.

      Il mesure ce que l'activité AJOUTE à l'impôt du foyer — l'impôt avec
      elle, moins l'impôt sans elle — et compare ce surcroît aux 2,2 %. Le
      comparer autrement, sans les autres revenus ni les parts, reviendrait à
      calculer comme si l'activité était le seul revenu du ménage, et à
      conclure presque toujours en faveur du barème.

      **Refus assumé** : l'éligibilité n'est pas vérifiée. L'option n'est
      ouverte que sous un plafond de revenu fiscal de référence, qui est un
      nombre officiel daté que l'application ne porte pas — l'invariant n°1
      interdit de l'écrire au jugé. L'écran rend l'arithmétique, jamais le
      droit d'opter, et il le dit.

      Trois simplifications sont énoncées avec le **sens** de leur écart :
      pas de décote (barème surestimé en bas), pas de plafonnement du quotient
      familial (barème sous-estimé en haut), aucune réduction d'impôt. Les deux
      premières jouent en sens contraire — un résultat serré ne se tranche pas
      sur ces chiffres seuls.
- [ ] **Comparateur micro-BNC vs déclaration contrôlée** — sujet distinct, sans
      rapport avec le 30/09. Non commencé, et non urgent : il supposerait les
      taux de cotisations du régime réel, que l'application ne porte pas.

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
- [x] ~~Écriture Supabase~~ — table `freel_faits`, distincte de `user_data`.
      Verrou optimiste : le filtre `version=eq.<lue>` voyage dans la requête,
      donc la vérification est **atomique et faite par le serveur**. Zéro ligne
      modifiée ⇒ refus, deux états montrés côte à côte, aucune fusion devinée.
      L'envoi reste indisponible tant que l'état du compte est inconnu.
- [x] ~~Validation des faits à l'entrée~~ — `motifRefusFaits` refuse un bloc
      écrit par une version plus récente **plutôt que d'en raboter les champs
      inconnus**, qui seraient effacés au premier renvoi.

### J6 · bascule (après le 31/10)
- [ ] Nouvelle version à la racine, ancienne **neutralisée en écriture** sous `/legacy/`
- [ ] Neutralisation en 4 points : mandataire remplaçant `window.localStorage`,
      synchro coupée, autre table Supabase, espace de noms disjoint (**surtout
      pas** `freel_app_version`, qui déclenche un `location.reload()`)
- [ ] Test Playwright prouvant zéro écriture et zéro requête depuis `/legacy/`

### Hors séquence
- [ ] Règles RLS Supabase durcies (vérifiées actives, à documenter) — 1 h.
      **Fait pour `freel_faits`** : règles écrites et commentées dans
      `docs/supabase.sql`, sans règle de suppression — rien dans l'application
      ne supprime les données comptables d'un compte, et une règle qui
      l'autoriserait ne servirait qu'à rendre possible un accident. **Reste à
      faire** : vérifier et documenter celles de `user_data`, que cette version
      ne fait que lire.

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

**Suite du 13/08 — les noms étaient bons, le filtre manquait.** Une fois les
champs corrigés, les montants restaient faux : chiffre d'affaires annuel
doublé, écritures datées de janvier 2027, neuf factures en retard qui
n'existent pas, dix-sept périodes à déclarer. Cause : `buildMission` de
l'ancienne application crée une facture **`brouillon` par mois à venir** pour
tenir sa projection. Je les importais comme des recettes. Un brouillon n'est
pas une facture — il n'a pas été émis, il ne doit rien entrer au registre. La
migration les écarte désormais et **dit combien** elle en a écarté, plutôt que
de les faire disparaître en silence.

Deux constats de la même journée qui se ressemblent : le premier venait d'un
mauvais nom de champ, le second d'un champ correct sur des lignes qu'il ne
fallait pas prendre. Lire les bonnes clés ne suffit pas — il faut savoir
**quelles lignes** l'application d'origine considérait comme réelles.

Là encore, c'est l'utilisateur qui l'a vu, en comparant les deux applications
écran par écran.

---

## 4 ter. Leçon du 13/08 — supprimer une spécification n'est pas ranger

Le 12/08, j'ai retiré `docs/design/` du dépôt en le décrivant comme « les neuf
rapports d'audit », substance conservée ailleurs. C'était faux pour deux
d'entre eux : `03-design-system.md` (316 lignes) et `05-spec-ecrans.md`
(537 lignes) ne constatent rien, ils **prescrivent**. Ce sont les seuls
documents qui disent ce que chaque écran doit contenir.

Conséquence directe : quand le propriétaire a signalé que le visuel ne
correspondait pas, j'ai produit un comparatif contre le document
d'**audit** — et conclu à la conformité. La comparaison était structurellement
incapable de trouver l'écart, puisqu'elle ne regardait pas la référence.

**Règle qui en découle.** Avant de supprimer un document, se demander s'il
décrit ce qui **est** ou ce qui **doit être**. Un constat périme ; une
spécification, non — elle reste la seule chose contre quoi « conforme » a un
sens. Les neuf fichiers sont restaurés dans `docs/design/` et référencés au
§1 ; ils ne doivent plus quitter le dépôt.

Il y a aussi une leçon de méthode : *« je considère avoir fini »* n'est pas un
constat de conformité. Le propriétaire a dû me le dire deux fois.

---

## 4 quater. Leçon du 13/08 — une migration doit descendre jusqu'où les champs ont bougé

`completerFaits` comble les champs absents d'un bloc écrit par une version
antérieure. Il le faisait par fusion **au premier niveau** : une liste
`missions` présente écrasait le défaut en bloc, y compris pour `rythmes` et
`ajustements`, ajoutés au schéma 2 *à l'intérieur* de chaque mission.

Conséquence : `rythmes` valait `undefined`, le planning lisait sa longueur, et
l'écran Activité tombait **entièrement** — pour tout compte enregistré avant
le schéma 2, c'est-à-dire tous. Y compris celui du propriétaire.

Ce qui est instructif, c'est **où** cela a été trouvé. Les 867 tests unitaires
passaient : ils construisent leurs missions avec le type courant, donc avec
les champs. Le typage aussi : `completerFaits` retourne `Faits` par assertion,
et une assertion ne vérifie rien. Le défaut n'est apparu que dans le
vérificateur de confidentialité, parce qu'il est le seul à charger l'application
**dans un vrai navigateur avec un bloc au format d'hier**.

Deux règles :

1. Une migration de schéma se descend jusqu'au niveau où les champs ont
   changé. Combler la racine ne protège pas les listes qu'elle contient.
2. Un jeu d'essai écrit avec les types d'**aujourd'hui** ne teste pas une
   migration. Il faut un bloc littéral au format d'hier — c'est ce que font
   désormais les tests `missions d'un bloc au schéma 1`.

Le script a aussi été corrigé pour **nommer** ce genre de panne : il relève
les exceptions de la page et signale « l'écran ne s'est pas monté » au lieu de
laisser expirer une attente de titre, qui décrivait le symptôme et jamais la
cause.

---

### Les échéances émises deviennent un fait (13/08, schéma v3)

Le manque n°1 de l'audit. Le volet 1 des provisions — ce que l'URSSAF ou le
fisc ont **déjà appelé** — se calculait sur une liste vide : le paramètre
`echeances` de `etatPilote` avait `= []` pour défaut, et **aucun appelant ne le
renseignait**. Il valait donc zéro en permanence, et le flux du mois n'avait
aucune sortie.

L'erreur allait dans le sens dangereux : moins de provisions ⇒ plus de
disponible ⇒ plus de versable. **L'application invitait à se verser de l'argent
déjà dû** — le mécanisme exact du rappel qu'on ne peut plus payer, celui
qu'elle existe pour empêcher.

- `echeances` entre au schéma (**v3**), avec `ajouterEcheance`,
  `modifierEcheance`, `supprimerEcheance` et `marquerEcheancePayee`.
- Carte **« Échéances reçues »** dans Argent, entre les enveloppes et les
  périodes URSSAF — l'ordre de lecture est celui du raisonnement : le total, ce
  qui a été appelé, puis ce qui fait basculer l'un dans l'autre.
- Le défaut du paramètre devient `faits.echeances`. Il reste paramétrable, pour
  les tests qui posent un jeu précis.
- **Une échéance est un fait, pas une prévision.** Elle existe parce qu'un
  appel est arrivé. Le volet 2 estime, lui, une dette pas encore appelée : les
  saisir tous les deux compterait deux fois la même somme, et c'est « marquer
  la période déclarée » qui fait passer l'une dans l'autre.
- **Payée ne veut pas dire effacée.** Elle sort des provisions — l'argent a
  quitté le compte, le solde le reflète déjà — mais reste dans la liste, comme
  historique de ce qui a été appelé.
- **La date est exigée** : sans elle, la somme pèserait sur les provisions sans
  apparaître dans aucun mois. Invisible au flux, mais bien retranchée.

**Correction de migration au passage.** L'ancienne application rangeait tout
sous « Charge » : cotisations URSSAF, TVA reversée, avis d'impôt, CFE — et
abonnements logiciels. La migration les reprenait **tous en dépenses**. Or une
cotisation sociale n'est pas un achat : en micro elle n'est pas déductible, et
elle ne porte aucune TVA. L'écran Achats se retrouvait gonflé de lignes qui
n'y ont pas leur place, et leur réclamait un justificatif de TVA qu'elles
n'auront jamais.

Elles deviennent des **échéances payées**, ce qu'elles sont. `natureDeLaCategorie`
fait le tri ; `verifierAbsenceDePerte` compte désormais les deux destinations,
sans quoi chaque cotisation correctement triée aurait été signalée comme perdue.

---

### Les clients opérationnels, et le rythme enfin saisissable (13/08, schéma v4)

Le manque n°2 de l'audit. Une mission passée par une agence a **deux clients
de nature différente** : celui qui paie — qui reçoit la facture — et ceux chez
qui on travaille. Le CRA se remet au second, qui le signe.

**Le rythme appartient désormais au client opérationnel**, pas à la mission.
C'est ce qui permet « lundi-mardi chez l'un, mercredi-jeudi chez l'autre » sans
avoir à trancher, jour par jour, à qui revient la journée : chacun a les
siennes. L'ancienne application portait un rythme sur la mission **et** un
rythme par entité, **plus** une table `entiteByDay` pour arbitrer entre les
deux — trois sources pour une même journée, sans que rien n'indique laquelle
faisait foi. Le nouveau schéma n'en garde qu'une, et `entiteByDay` devient sans
objet.

- Le planning rend **une ligne par client**, avec sa teinte ; la vue semaine a
  une paire de créneaux par ligne, donc un clic sait toujours ce qu'il corrige.
- Le CRA se ventile **par client qui signe**. Les fusionner exposerait à l'un
  le volume consacré à l'autre.
- **Le cas ordinaire ne montre pas le concept** : une mission à un seul client
  affiche le rythme sans nom ni couleur à saisir, et son libellé reste celui de
  la mission. Le vocabulaire n'apparaît qu'au moment où il veut dire quelque
  chose.

**Le huitième manque, que l'audit avait laissé passer.** En construisant le
formulaire, découverte qu'il n'existait **aucun écran pour déclarer un
rythme**. Le domaine savait le calculer, le planning savait le lire, la
migration savait le reprendre — mais une mission créée dans l'application
n'avait aucun moyen d'en recevoir un. Son planning restait vide,
définitivement. Seules les missions reprises de l'ancienne version en avaient.

C'est encore la même famille de défaut que les cinq précédentes : du code juste
et inatteignable. Elle a échappé à l'audit parce que celui-ci comparait des
FONCTIONS, et que l'ancienne application avait bien la sienne — c'est le
chemin vers elle qui manquait, pas la fonction.

L'éditeur ajouté est une semaine type à sept boutons, avec le même tour que le
planning : journée → demi-journée → rien. Ce qu'on apprend d'un côté sert de
l'autre, et une case à cocher ne saurait pas dire la demi-journée.

**Budget.** L'entrée est repassée à 80,19 Ko pour un plafond de 80. Troisième
application de la même règle : `selecteurs.achats.ts` sort du module
monolithique → **76,59 Ko**. Le plafond n'a toujours pas bougé.

---

### La rémunération se nomme, elle ne se saisit pas (13/08, schéma v5)

Le manque n°3 de l'audit, corrigé **autrement que demandé** — et le refus
mérite d'être écrit, parce qu'il tient à la différence entre les deux
applications.

L'audit demandait « un versement de rémunération à enregistrer ». Ç'aurait été
un fait de trop. Se verser de l'argent n'est pas une opération comptable en
micro : la personne et l'entreprise sont la même, un virement du compte pro
vers le compte perso ne crée ni charge ni recette. Et surtout, **le virement
figure déjà au relevé** — le saisir une seconde fois le compterait deux fois.

L'ancienne application n'avait pas ce choix : elle *simulait* son solde à
partir des encaissements moins les charges, et devait donc enregistrer le
salaire pour le retrancher. Ici le solde est réel. Reprendre sa solution aurait
été reprendre la contrainte sans la cause.

Ce qui manquait n'était pas un fait mais un **nom** : savoir lequel des
mouvements sortants est une rémunération.

- `sansContrepartie` passe du **booléen au motif** — `'remuneration'`,
  `'autre'`, ou `null`. Un seul état ne pouvait pas distinguer un virement
  qu'on s'est versé de frais bancaires.
- Le motif ne change **aucun total** : il permet seulement de répondre à
  « combien me suis-je versé ce mois-ci », que rien ne savait dire.
- Le Pilote affiche **« déjà versé ce mois »** sous le versable, et l'écart au
  besoin mensuel. Sans cette ligne, « je peux me verser 3 000 » se lit comme
  « en plus », alors qu'on s'est peut-être déjà versé 2 500 le 5.
- La rémunération n'est proposée que sur les **débits** : un crédit ne peut pas
  être un virement qu'on s'est versé, et l'offrir inviterait à classer une
  recette hors du chiffre d'affaires.

**Le piège de migration, troisième du nom.** Le champ valait `true`/`false`.
Sans conversion, un `false` enregistré hier serait lu comme « différent de
`null` », donc comme un mouvement **déjà classé** : toute la file « à traiter »
aurait disparu, sans que rien ne le signale. Après les congés et les rythmes,
la règle est acquise — une migration descend jusqu'où les champs ont bougé, et
un champ imbriqué se convertit explicitement.

### Un filet contre l'omission (13/08)

Ajouté sans que l'audit le demande, parce que les échéances viennent de faire
apparaître le risque : **une omission ne se voit pas.** Elle produit un chiffre
plausible, juste trop élevé.

Quelqu'un qui encaisse depuis trois mois sans avoir jamais enregistré un appel
de cotisations n'a pas « zéro cotisation » — il a oublié de les saisir. Son
disponible et son versable sont surestimés, et l'application l'invite alors à
se verser de l'argent déjà dû. Exactement ce qu'elle existe pour empêcher.

`aTraiter` porte donc un sujet « aucune échéance enregistrée », qui **dit le
sens de l'erreur** : « surestimé » n'est pas « incomplet », et c'est ce mot-là
qui fait agir. Il se tait sur un ou deux mois — ça peut être un début
d'activité — et disparaît dès la première échéance saisie, **même payée** :
elle prouve que le geste est connu, et continuer à alerter dresserait à ignorer
l'alerte.

### Restaurer une sauvegarde (13/08)

L'export existait depuis le début, la restauration non. Une sauvegarde qu'on ne
sait pas relire n'est pas une sauvegarde : c'est un fichier qui rassure.

Le fichier est lu, son contenu **annoncé** — tant de recettes, de dépenses, de
missions, de clients — et rien n'est écrasé avant confirmation ; même posture
que sur l'écran Compte, et pour la même raison. Un fichier illisible se dit
tout de suite, pas après la confirmation. Le refus de fond — un bloc écrit par
une version plus récente — vient de `adopterFaitsDistants` et est **relayé à
l'écran** plutôt qu'avalé.

---

### Les échéances : un échéancier, une frise, une preuve de paiement (13/08, schéma v6)

Trois corrections d'un coup, dont deux venues d'une remarque du propriétaire —
« je suis censé avoir une sorte de timeline qui m'indique les échéances ; à
partir de ça je dois indiquer si je l'ai payé, quand, et quel montant réel ».

**Un échéancier se saisit en une fois.** Répétition mensuelle ou trimestrielle,
jusqu'à douze occurrences. Mais elle ne produit RIEN de nouveau : elle crée N
échéances ordinaires et s'efface. L'ancienne application stockait une « charge
récurrente » — une règle d'un côté, des instances de l'autre, et rien pour dire
laquelle fait foi quand un appel réel diffère. Or il diffère.
Un piège au passage : ajouter un mois au 31 janvier donne le 3 mars, et
l'échéance sauterait un mois en silence. Le quantième est ramené au dernier
jour du mois visé, sans raboter la série entière.

**Une frise, pas une liste.** Ce qu'on vient chercher est une question de
calendrier : « qu'est-ce qui tombe, et quand ». Les échéances sont donc
groupées par mois, avec le total de chacun — c'est lui qui dit si le mois passe.

**Payer se prouve par une date et un montant.** La première version portait
`payee: boolean`. C'était exactement le défaut reproché à l'ancienne
application sur les factures : **un statut qu'aucune écriture ne prouve.**
Exiger une date et un mode de règlement pour encaisser une recette, puis
accepter une case à cocher pour une échéance, était incohérent — et c'est le
propriétaire qui l'a vu, pas moi.

On enregistre donc la **date du débit** et le **montant réellement parti**. Ce
dernier diffère plus souvent qu'on ne croit — régularisation de fin de
trimestre, changement de taux, majoration de retard. L'écart est conservé et
affiché : ce n'est pas une erreur à corriger, c'est lui qui explique un solde
qui ne tombe pas juste.

**Migration v5 → v6**, quatrième champ imbriqué après les congés, les rythmes et
le motif des mouvements. Un `payee: true` devient la date d'échéance — ce n'est
pas une invention pour les seules données qui existent : elles viennent toutes
de la reprise des mouvements « Charge », où la date d'échéance a été posée à
partir de la date du mouvement, c'est-à-dire du paiement.

### Revenir au rythme sur une semaine (13/08)

`resetReelsToTheorique` de l'ancienne application. Son pendant `fillAllDays`
n'a **pas** été repris et n'a pas à l'être : ici le planning se remplit déjà
tout seul depuis le rythme, c'est le modèle même. Remplir à la main n'aurait de
sens que sur un planning vide — et un planning vide se remplit en déclarant un
rythme, pas en cliquant trente et une fois.

Retirer les corrections, en revanche, reste nécessaire : un rythme changé après
coup laisse derrière lui des ajustements devenus faux. Le bouton n'apparaît que
si la semaine en porte — un bouton toujours là qui ne fait rien apprend à ne
plus le regarder — et « revenir au rythme » n'est pas « mettre à zéro » : la
journée redevient ce que le rythme prévoit.

---

## 4 quinquies. Leçon du 13/08 — un test vert sur du code mort ne prouve rien

`encaisserRecette` était écrite, commentée, couverte par des tests de magasin
qui passaient. Aucun écran ne l'appelait. Idem pour `marquerPeriodeDeclaree`,
`modifierDepense` et `supprimerBrouillon` : quatre fonctions justes, et
inatteignables.

Aucun contrôle du projet ne pouvait le voir. Les tests unitaires appellent la
fonction directement — c'est leur travail. Le typage est satisfait : une action
non appelée est du code valide. Le vérificateur responsive charge les écrans
mais ne clique nulle part. Et la couverture, si elle avait existé, aurait
compté ces lignes comme couvertes.

**Ce que ça coûtait**, en une phrase : on pouvait émettre une facture et jamais
enregistrer son règlement. Toute la chaîne en aval — chiffre d'affaires
encaissé, provisions, disponible, versable — était donc fausse par
construction, et le restait quoi qu'on fasse dans l'application.

**Règle qui en découle.** Une action du magasin est une promesse d'interface.
Quand on en ajoute une, on câble l'écran dans le même mouvement, ou on ne
l'ajoute pas. Et le contrôle se fait par l'inventaire, pas par la mémoire :

```
for a in $(grep -oE '^  readonly [a-zA-Z]+:' src/state/store.ts | ...); do
  grep -rl "\b$a\b" src/ui --include=*.tsx | grep -v test || echo "❌ $a"
done
```

C'est encore le propriétaire qui l'a détecté, en essayant simplement de faire
son travail : « je ne peux pas changer leur statut ».

---

## 5. Points ouverts

| Sujet | État |
|---|---|
| **Taux de cotisations** | **Erreur corrigée le 12/08.** La table portait une bascule à 26,1 % au 1er juillet 2026. Ce taux avait bien été programmé, mais le **décret n° 2025-943 du 8 septembre 2025** a plafonné la dernière marche à **25,6 %** : la bascule n'a jamais eu lieu. Les deux applications surestimaient donc les cotisations d'un demi-point depuis juillet 2026. `urssaf.fr` renvoie toujours 503 ; la correction s'appuie sur deux sources secondaires concordantes citant le décret. Un avis d'appel réel reste le recoupement de premier ordre |
| **ACRE au 01/07/2026** | Passage de l'abattement de 50 % à 25 % **probable mais non confirmé**. Sans effet sur le propriétaire (ACRE éteinte depuis le T1 2026), nécessaire pour recalculer un trimestre passé |
| **Export FEC** | Retiré du périmètre (D6). Code conservé sur la branche de sauvegarde |
| **Marge de build** | Réglé. React est sorti dans un chunk `vendor` : il ne change pas d'un déploiement à l'autre, donc le cache du navigateur le conserve. Modifier une ligne de code invalidait 248 Ko ; désormais 55 |
| **Relevé bancaire** | **Réglé.** L'import CSV existe, `selecteurs.solde()` compte les mouvements, et `banqueReliee` a été retiré du schéma : il était devenu dérivable (un relevé est disponible si et seulement s'il y a des mouvements), et le garder aurait permis qu'un booléen à `true` coexiste avec une liste vide |
| **Coquille lisible en J2** | Optimisation retenue : afficher un écran réel sur l'**ancien** schéma en lecture seule, pour valider le mappage de migration à l'œil avant qu'il soit terminal |
| **Écart de 2 060 € sur le CA encaissé** | **Expliqué le 13/08 : différence de DÉFINITION, pas défaut de la nouvelle.** L'ancienne écarte les factures des missions « perdue », celles sans jours saisis, et surtout **ramène au mois courant** toute date de paiement future — ce qui gonfle l'année en cours de paiements 2027. La nouvelle ne retient que la date d'encaissement réelle, qui est la définition du CA encaissé en micro. Voir l'annexe de `AUDIT-ANCIENNE-VS-NOUVELLE.md`. Reste à faire, sans urgence : dire **laquelle** des trois lignes vaut 2 060 €, ce qui demande les données réelles — donc un rapprochement dans l'application, pas un correctif |
| **Reprise à refaire** | Les congés, les rythmes et les ajustements ne migraient pas avant le 13/08. Une reprise effectuée avant cette date a un planning vide. Il faut relancer « Reprendre les données de l'ancienne application », puis contrôler le planning et le CRA contre ce qu'on sait — c'est le dernier endroit où une erreur de correspondance peut rester cachée |
| **Schéma v1 → v2** | **Réglé, en deux temps.** Les congés étaient des chaînes de dates, ils sont désormais des objets `{ date, quotité }` pour porter la demi-journée — sans conversion, un calendrier existant se serait vidé en silence. Puis, le même jour, le cas manqué : `completerFaits` ne comblait que le **premier niveau**, donc les missions déjà enregistrées arrivaient sans `rythmes`, et l'écran Activité tombait entièrement pour tout compte antérieur au schéma 2. Corrigé et verrouillé par quatre tests |

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

npm run verifier    # la chaîne complète, dans cet ordre :
```

| Étape | Ce qu'elle prouve |
|---|---|
| `typecheck` + `test` + `build` | Le compilateur, les tests, le build |
| `verifier:budget` | Aucun chunk ne dépasse son plafond. **Un plafond se tient, il ne se relève pas** |
| `verifier:responsive` | 140 combinaisons (5 tailles × 4 palettes × 7 écrans) : zéro débordement horizontal, forme de la navigation, cibles ≥ 44 px, thème appliqué avant rendu |
| `verifier:index` | Un `index.html` périmé se récupère tout seul, **une seule fois** (pas de boucle de rechargement) |
| `verifier:confidentialite` | Dans un vrai navigateur : aucun montant lisible quand le mode confidentiel est actif — contrôle du **style calculé**, pas de la présence d'une classe |
| `verifier:migration` | La reprise de bout en bout, sur le contenu et non sur le nombre de lignes |
| `verifier:fuites` | Aucune donnée personnelle dans le dépôt (invariant n°6) — c'est `tests/smoke-test.js`, qui couvre aussi le legacy |

```
# à la racine : tests de l'app existante (legacy)
node tests/smoke-test.js
```
