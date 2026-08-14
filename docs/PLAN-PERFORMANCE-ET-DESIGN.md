# Performance et conformité au handoff — plan exécuté

**Ouvert le :** 13/08/2026 · **Clos le :** 14/08/2026
**Objet :** deux questions distinctes, souvent confondues — « est-ce que la
nouvelle application va aussi vite que l'ancienne ? » et « est-ce qu'elle
ressemble à ce qui a été conçu ? »

Ce document était un plan. Il est devenu le compte rendu de son exécution :
les cinq tâches ont été menées, et ce qui suit dit ce qui a été trouvé — y
compris là où le plan se trompait.

---

## Ce qui a changé, en une page

| # | Tâche du plan | Résultat |
|---|---|---|
| 1 | Comparaison écran par écran contre les prototypes | **Faite, partiellement possible.** Un seul prototype se rend hors contexte ; la spec CSS a servi de source pour les autres. Deux écarts réels trouvés |
| 2 | Mesure de vitesse sur volume réel | **Faite.** `verifier:vitesse` écrit, ajouté à la chaîne. A trouvé une régression de 860 ms sur Facturer, corrigée |
| 3 | Indicateur « à traiter » sur tous les écrans | **Fait.** Et il a révélé un bug d'affichage qui le rendait invisible en portrait |
| 4 | Pastille Cloud | **Faite**, avec trois états et non deux |
| 5 | Écarts de densité en portrait | **Faits.** Le flux du mois passe à trois colonnes côte à côte dès 320 px, et le Pilote reçoit sa rangée d'actions rapides |

Effets de bord notables, tous vérifiés :

- le paquet d'entrée **baisse** de 79,4 à 75,3 Ko malgré quatre ajouts, parce
  que la reprise des données de l'ancienne version en est sortie ;
- une navigation par **sous-routes** (`#/facture/nouvelle`) apparaît, sans
  laquelle les actions rapides auraient menti ;
- deux vérificateurs ont été corrigés parce qu'ils **ne mesuraient pas ce
  qu'ils annonçaient**.

---

## 1. Performance

### Les chiffres, avant et après

| Mesure | Ancienne | Nouvelle | Rapport |
|---|---|---|---|
| Poids total du code livré | **1 873 Ko** en un seul fichier | **554 Ko** répartis | ÷ 3,4 |
| Ce qu'il faut charger pour voir le premier écran | **1 873 Ko**, tout bloquant, plus des scripts CDN | **291 Ko** (75 entrée + 188 bibliothèques + 28 CSS) | ÷ 6,4 |
| Idem, compressé | non mesurable sur un fichier unique de cette forme | **90,5 Ko** | — |
| Écrans suivants | déjà chargés, mais tout l'était d'avance | **23 à 38 Ko**, à l'ouverture seulement | — |
| Bibliothèques bloquantes | Chart.js + jsPDF ≈ 627 Ko | **0** | — |

### La lacune du plan est comblée : on mesure enfin du temps

Le plan disait : « on mesure des octets, pas du temps ». C'était le seul
reproche franc de cet axe. `app/scripts/verifier-vitesse.mjs` le corrige :

- un jeu d'essai de **trois ans d'activité** — 432 recettes, 360 dépenses,
  720 mouvements bancaires, 6 missions ;
- **médiane de cinq passages**, avec rechargement complet à chaque fois : une
  mesure unique attrape un ramasse-miettes et accuse le mauvais écran ;
- plafond à **600 ms** entre la navigation et le titre visible ;
- les sept écrans, dans un vrai navigateur.

**Le contrôle a servi dès son premier passage.** Facturer mettait **860 ms**
pour afficher 432 factures — 7 059 nœuds DOM d'un coup. La liste est désormais
paginée par tranches de 50, et l'écran est à **350 ms**.

Le point de vigilance était ailleurs, et il est couvert par un test dédié :
les **totaux restent calculés sur l'ensemble** des factures, jamais sur les
lignes affichées. Un « reste à rentrer » tronqué aurait été faux dans le sens
rassurant, qui est le pire.

Mesures actuelles, sur ce volume :

| Écran | Temps | | Écran | Temps |
|---|---|---|---|---|
| Pilote | **48 ms** | | Achats | 405 ms |
| Argent | 348 ms | | Outils | 343 ms |
| Activité | 341 ms | | Config | 344 ms |
| Facturer | 350 ms | | | |

### Le budget n'a toujours pas été relevé — et il a baissé

Quatre ajouts (indicateur, actions rapides, pastille Cloud, refonte du flux)
ont porté le paquet d'entrée à **84,7 Ko** pour un plafond de 80. La règle du
projet est de ne jamais relever le plafond mais d'extraire le module fautif.
Deux extractions :

1. **`state/selecteurs.livre.ts`** — `etatDes` et `etatLivre` ne servent qu'à
   l'écran Argent, chargé à la demande ; tant qu'ils vivaient dans
   `selecteurs.ts`, le regroupeur tirait `calculs/des` et
   `calculs/livreRecettes` dans l'entrée. C'est le cas de figure que le
   vérificateur nomme lui-même : « un écran tiré dans l'entrée par un import
   partagé ». Gain : 0,7 Ko.

2. **`infra/migration.legacy.ts`** — la vraie prise. Le convertisseur des
   données de l'ancienne version pesait **11,3 Ko de l'entrée**, téléchargés
   par tout le monde à chaque ouverture, pour du code qui ne s'exécute
   **qu'une fois dans la vie d'un utilisateur** et jamais pour qui n'a pas
   connu la version précédente. `migrer()` ne fait plus que constater la
   présence d'anciennes données et rend `reprise-requise` ; le magasin charge
   alors le convertisseur à la demande.

**Résultat : 75,3 Ko, soit moins qu'avant d'ajouter quoi que ce soit.**

Trois garanties de la migration sont inchangées, et le vérificateur de bout en
bout dans un vrai navigateur le confirme : l'instantané d'avant-migration est
toujours écrit **avant** la moindre conversion, l'idempotence tient au
rechargement, et les anciennes clés ne sont jamais supprimées.

Une précision sur le chemin asynchrone : pendant le chargement du
convertisseur, l'écran reste en phase « initial » plutôt que d'afficher un état
vide qu'on remplacerait une seconde plus tard. Montrer « 0 € » à quelqu'un qui
a trois ans d'activité, même brièvement, aurait été le pire affichage possible.

---

## 2. Conformité au handoff

### Ce que la comparaison écran par écran permet réellement

Le plan promettait une confrontation visuelle des sept écrans contre les
prototypes. Elle a été tentée, et voici ce qu'elle a donné :

**Un seul prototype se rend hors de son contexte** — `Pilote - Le Flux.html`.
Les autres (`Achats`, `Config`, `Outils`, `Argent`, `Activité`) sont des
coquilles dont le contenu vient de modules `*-app.jsx` compilés dans le
navigateur ; servis en statique, ils affichent une page vide. Une comparaison
« écran par écran » sur ces captures aurait confronté du vide à du contenu et
conclu n'importe quoi.

**La source exploitable est ailleurs, et elle est meilleure :** `v1.11.css`
contient la requête de média téléphone, avec les valeurs exactes de densité
voulues. C'est une spécification normative, pas une capture à interpréter.
C'est elle qui a servi.

Cette limite est un fait sur le bundle, pas une tâche escamotée — et il faut
la connaître avant de promettre à nouveau une comparaison visuelle.

### Ce qui est conforme, établi par assertion

| Élément du handoff | État |
|---|---|
| 4 palettes commutables, valeurs exactes de `v1.11.css` | ✅ vérifié sur 140 combinaisons |
| Palette appliquée **avant le premier rendu**, sans flash | ✅ vérifié par assertion |
| Rail 212 px desktop / dock flottant en pilule ≤ 760 px | ✅ vérifié sur `position` |
| Libellé sur l'onglet actif seul, en portrait | ✅ |
| Motif « texte replié derrière un i » | ✅ composant `Info`, cible 44 px |
| Badge par onglet (niveau 1 des alertes) | ✅ |
| **Indicateur « à traiter » sur tous les écrans** (niveau 2) | ✅ **fait dans cette passe** |
| **Rangée d'actions rapides sur le Pilote** | ✅ **faite dans cette passe** |
| **Flux du mois en trois colonnes réduites en portrait** | ✅ **fait dans cette passe** |
| **Pastille Cloud** | ✅ **faite dans cette passe** |
| Argent : Trésorerie / Performance en onglets | ✅ sémantique ARIA |
| Graphe CA : valeurs au-dessus des barres, k€ | ✅ |
| Panneau latéral : piège de focus, Échap, voile | ✅ |
| Aucun débordement horizontal, 7 écrans × 5 tailles × 4 palettes | ✅ vérifié |

### A. L'indicateur « à traiter » — et le bug qu'il a révélé

Le second niveau d'alerte existe désormais sur les sept écrans. Il ne montre
que les sujets de l'onglet courant — sauf sur le Pilote, poste de pilotage, où
il montre tout. C'est ce qui le rend lisible : sur Achats, « 5 » veut dire
« cinq choses ici », pas « cinq choses quelque part ». Il disparaît quand le
total est nul : zéro n'est pas une information à afficher.

**Ce qu'il a mis au jour est plus intéressant que lui.** La pastille flotte en
`position: fixed` au-dessus du dock en portrait. Elle atterrissait à
**−72 px** — hors de l'écran, sans la moindre erreur en console.

La cause : `backdrop-filter: blur(12px)` sur la barre du haut. Un
`backdrop-filter` fait de l'élément le **bloc conteneur** de tous ses
descendants en `position: fixed`, qui cessent alors d'être positionnés par
rapport à la fenêtre. Et ce flou était **invisible** : les tokens `--top-a` et
`--top-b` sont opaques à 97 %, il n'y avait rien à voir au travers.

Douze pixels de flou qu'on ne voit pas contre un contrôle qu'on ne voit plus.
Le flou est parti, et `verifier-responsive.mjs` mesure désormais que la
pastille reste dans la fenêtre — sur les 140 combinaisons.

### B. Actions rapides, et les sous-routes qu'elles ont imposées

Le Pilote répondait à « où j'en suis » et à rien d'autre. Émettre une facture
demandait deux gestes : ouvrir Facturer, puis y trouver « Nouvelle facture ».
Idem pour une dépense. Sur l'écran qui s'ouvre en premier, les deux actions
les plus fréquentes de la semaine étaient à deux niveaux de profondeur — le
reproche exact qui a été fait : « je ne comprends pas trop où elles sont, ce
n'est pas ergonomique ».

Cinq actions sont désormais là : nouvelle facture, ajouter une dépense,
importer un relevé, activité & congés, mes données.

**Mais une action rapide qui dépose sur un écran sans rien ouvrir ne fait pas
gagner le second geste, elle le déplace.** Il a donc fallu que la rédaction
d'une facture ait une **adresse**. D'où `resoudreRoute()`, qui sépare l'écran
de ce qui le suit : `#/facture/nouvelle`, `#/achats/depense`,
`#/achats/releve`, `#/config/compte`.

Le découpage se fait sur les **segments**, jamais sur les caractères — `"#/pi"`
n'est pas un début de `"#/pilote"`, c'est un segment inconnu. C'est ce qui
évite de réintroduire l'appariement par préfixe de texte de l'ancienne
version, où « Achat » sélectionnait « Achats ». Le test qui l'interdisait est
toujours là, et il passe.

Deux gains gratuits : le bouton « retour » du navigateur ramène au facturier
au lieu de sortir de l'écran, et un test vérifie que **chaque** destination des
actions rapides est résolue par le routeur lui-même — aucune ne peut devenir un
lien mort par renommage.

### C. La densité en portrait : le flux du mois

La spécification est explicite (`v1.11.css`, requête de média téléphone) :
`.flux3{grid-template-columns:repeat(3,1fr);gap:10px}`, libellé à 9 px,
montant à 19 px, sous-ligne à 10 px.

L'application ne mettait les colonnes côte à côte qu'**au-delà de 900 px**.
Sur téléphone — là où elle est réellement consultée — les trois chiffres
s'empilaient sur trois écrans, et la comparaison qui fait tout l'intérêt de la
carte redevenait un calcul de tête. Or c'est exactement le calcul qu'on se
trompe à faire un jour de fatigue, celui qui fait qu'on se verse de l'argent
déjà dû.

Corrigé : trois colonnes à toute largeur, avec les sous-lignes réduites à des
fragments courts plutôt que des phrases — dans une colonne étroite, une phrase
se hache en six lignes et le rapport entre les deux montants, seul
renseignement utile, s'y perd. Le montant se réduit avec la fenêtre
(`clamp(15px, 4,6vw, 19px)`) : vérifié à 390 px avec des montants à six
chiffres, sans débordement.

**Un point où la maquette a été contredite, sciemment.** Elle tient les trois
colonnes en portrait en **masquant les montants du détail**
(`.fit .fit-a{display:none}`). Un « voir le détail » qui montre des libellés
sans montants ne détaille rien. Les listes de détail sont donc sorties des
colonnes, sous un dépliant unique qui les ouvre ensemble, en pleine largeur.
Rien n'est perdu à aucune largeur, et un test vérifie que les montants
survivent au portrait.

### D. Pastille Cloud : trois états, pas deux

Le plan la jugeait « la seule des trois à portée », et c'était juste : la
synchronisation du compte existe. Elle est posée.

**Avec trois états, et c'est le point.** « Relié » et « local » ne suffisent
pas : entre les deux se trouve la session **expirée**, qui est le cas
dangereux. L'utilisateur croit être synchronisé, saisit une semaine de
travail, et rien ne remonte. Un point vert dans ce cas serait un mensonge, un
point gris un contresens.

La marge d'une minute est comptée du côté prudent : une session qui expire
dans trente secondes est traitée comme expirée, parce que partir sur une
requête avec un jeton qui meurt en chemin ne synchronise rien — et l'aurait
annoncé comme réussi.

Elle **n'émet aucune requête** : elle lit une clé de stockage et compare une
date. Elle vit dans la barre du haut, présente sur les sept écrans ; une
pastille qui interroge le réseau à chaque montage coûterait plus cher que ce
qu'elle indique.

Elle mène à `#/config/compte`. Signaler une session expirée sans offrir le
chemin pour s'y reconnecter serait un reproche, pas un outil.

Coût dans le paquet d'entrée : vingt lignes. La session — sa forme, sa clé, sa
lecture — a été extraite dans `infra/session.ts`, pour que la barre du haut
n'embarque pas l'ensemble du client distant (requêtes, tables, rafraîchissement
de jeton, conversion du format legacy) afin d'afficher un point de huit pixels.

---

## 3. Deux vérificateurs qui ne vérifiaient pas ce qu'ils annonçaient

C'est la leçon la plus transposable de cette passe.

**`verifier-responsive.mjs` comptait « le premier `<nav>` de la page ».** Il
faisait `document.querySelector('nav')` et affirmait mesurer le rail de
navigation. Le jour où le Pilote a reçu sa rangée d'actions rapides — un second
`<nav>`, légitime et nommé — le compte d'onglets est passé à douze et le
contrôle a échoué sur les quatre palettes. Il désigne maintenant la navigation
principale par son nom accessible.

**La nouvelle assertion sur la pastille ne s'exécutait jamais.** Elle est
conditionnelle, à raison : l'absence de sujet à traiter est un état normal, et
la pastille disparaît alors. Mais sur le stockage vierge du vérificateur, il
n'y avait **jamais** de sujet — la condition était toujours fausse, et
l'assertion silencieuse. Un contrôle qui ne s'exécute pas ne protège de rien :
c'est ainsi qu'un `backdrop-filter` a pu expédier la pastille à −72 px sans que
140 combinaisons s'en aperçoivent.

Le vérificateur amorce donc une facture en retard, émise en 2020 — en retard
quelle que soit la date à laquelle le script est relancé, sans horloge à figer.

**Et le contrôle a été vérifié par mutation** : `backdrop-filter` réintroduit,
48 échecs ; retiré, zéro. Un garde-fou qu'on n'a pas vu échouer n'est pas un
garde-fou.

---

## 4. Ce qui reste refusé, et pourquoi

- **Documents et Qonto.** Rien ne les alimenterait. Une pastille verte qui ne
  mesure rien est pire qu'absente : elle apprend que les pastilles ne servent à
  rien, et on cesse aussi de regarder celles qui marchent. À rouvrir le jour où
  une intégration existe.
- **Le score de santé sur 100.** La spécification note elle-même que ses
  valeurs sont codées en dur dans le prototype, sans fonction qui les calcule.
- **Les trois cartes Argent** (`FluxChart`, `CapaciteBarChart`,
  `VersementCard`). Elles demanderaient d'inventer des données, ou de
  contredire la décision D4 (réserve unifiée, source unique).
- **`fillAllDays`.** Obsolète : le planning se remplit déjà depuis le rythme de
  la mission. Le rétablir rendrait modifiable à la main ce qui doit découler du
  rythme, et un CRA qui contredit le planning ne prouve rien.

Ces refus tiennent au même principe que le reste du projet : **un chiffre
affiché engage**, et mieux vaut une case absente qu'une case qui ment.

---

## 5. Vérification

`npm run verifier` enchaîne, et tout passe :

| Contrôle | Résultat |
|---|---|
| Typage | strict, sans erreur |
| Tests unitaires | **1 047 tests, 61 fichiers** |
| Budget de performance | 4 postes, tous conformes (entrée à 75,3 / 80 Ko) |
| Responsive | 5 tailles × 4 palettes × 7 écrans = **140 combinaisons** |
| Rattrapage d'un `index.html` périmé | conforme |
| Confidentialité | aucun montant ne fuit |
| Migration de bout en bout | conforme, dans un vrai navigateur |
| **Vitesse sur trois ans d'activité** | **7 écrans sous le plafond de 600 ms** |
| Non-régression du barème | 91 assertions |

`verifier:vitesse` est désormais **dans la chaîne**, pas à côté d'elle. Une
régression de temps ne se voit pas autrement.
