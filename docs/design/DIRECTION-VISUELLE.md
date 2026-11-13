# Direction visuelle — « Calme, graphiques retravaillés »

**Retenue par le propriétaire le 13 novembre 2026** (décision 20), après deux
propositions écartées : « Registre » (propre mais terne) et quatre styles
nouveaux (il préférait ses propres couleurs).

Ce document et les maquettes de `docs/design/direction/` sont **la référence de
style**. Le handoff (`docs/design/captures/`) ne l'est plus : il reste la
mémoire de l'ancien dessin. L'organisation des écrans, elle, vient de
`AUDIT-PRODUIT-ET-INTERFACE.md` (§8) et des mêmes maquettes.

## Ce qui a été demandé, mot pour mot

- « J'aime les modes que j'avais déjà mis sur l'ancienne appli et mon préféré
  était le thème calme. »
- « Le style de tes graphes, des gros blocs et tout, ne faisait pas très front
  end incroyable. »

Donc : **les couleurs ne changent pas, le dessin change.**

## Les maquettes

| Fichier | Écran | Captures versionnées |
|---|---|---|
| `direction/planche.html` | Pilote — planche de référence : tous les types de composants y figurent | `planche-calme.png`, `planche-nuit.png` |
| `direction/tresorerie.html` | Trésorerie | `tresorerie-calme.png` |
| `direction/obligations.html` | Obligations | `obligations-calme.png` |
| `direction/activite.html` | Activité — missions et carnet | `activite-calme.png` |
| `direction/pilote-telephone.html` | Pilote à 390 px | `pilote-telephone-calme.png` |

Chaque maquette s'ouvre seule dans un navigateur ; `?mode=nuit` (ou `sombre`,
`clair`) change de thème. `direction/calme.css` **fait foi pour les mesures** :
ce document dit les règles, la feuille dit les pixels.

```
cd app && node scripts/capturer-direction.mjs              # calme, + planche en nuit
cd app && node scripts/capturer-direction.mjs --mode=tous  # les quatre thèmes
```

Données fictives (Camille Demo), horloge au 10 juin 2026.

## Cinq règles

1. **Tes thèmes, tels quels.** Calme, Nuit, Sombre, Clair : fonds, textes,
   verts, ambres, rayons, ombres et dégradés de carte sont ceux de
   `app/src/styles/tokens.css`. Rien ne s'invente ; un besoin nouveau devient
   un jeton, dans les quatre thèmes à la fois.
2. **Un chiffre par écran.** Chaque écran répond d'abord à une question par un
   nombre — 76 px sur le Pilote — et tout le reste l'explique.
3. **Des traits, pas des blocs.** Une donnée se dessine avec le moins d'encre
   possible : barre de 12 à 14 px à bouts ronds, courbe de 3 px, anneau de 8 px.
   Aucun aplat de couleur plus grand qu'une pastille.
4. **La couleur veut dire quelque chose.** Vert : à toi. Ambre : à surveiller.
   Rouge : en retard. Les quatre charges ont chacune la leur. Un état ne se lit
   jamais par la couleur seule : toujours un signe et un mot (● Encaissée,
   ▲ En retard, ◇ À émettre, → Envoyée).
5. **Les chiffres s'alignent.** Tout montant est en JetBrains Mono, chiffres
   tabulaires, espace insécable avant « € ».

## Jetons ajoutés aux thèmes

Les quatre couleurs de charges d'origine se confondaient pour un lecteur
daltonien (TVA et impôt surtout). Celles-ci passent le validateur de palette
sur la surface de chaque thème, **dans cet ordre d'empilement** : impôt,
URSSAF, TVA, CFE. Changer l'ordre ou une teinte demande de relancer le
validateur.

| Jeton | Calme, Clair | Nuit, Sombre |
|---|---|---|
| `--c-impot` | `#7a58a8` | `#9085e9` |
| `--c-urssaf` | `#b9862b` | `#c98500` |
| `--c-tva` | `#2f7fb0` | `#3987e5` |
| `--c-cfe` | `#bb5870` | `#d55181` |

S'y ajoutent, par thème et dans `calme.css` : `--bar-soft` (la série en
retrait d'une paire de barres), `--chip-ok` et `--chip-warn` (texte des
pastilles), `--k1` à `--k3` et leur texte (clients du planning).

## Composants

| Composant | Règle |
|---|---|
| Carte | Dégradé `--card-a` → `--card-b`, filet `--line`, rayon `--r`, ombre `--sh-2`, marge intérieure 22 × 24 px. Titre 16,5 px, graisse 650 |
| Chiffre héros | 76 px, vert, graisse 700 ; le « € » plus petit, à la même ligne de base |
| Tuile d'indicateur | Étiquette en capitales Mono 12 px ; valeur Mono 30 px ; une ligne d'explication ; **une courbe de tendance** à droite, sans axe, point final marqué |
| Répartition | Barre de 12 px en segments à bouts ronds séparés de 3 px ; légende dessous, pastille + libellé + montant |
| Pastille d'état | Signe + mot, fond teinté, hauteur 26 px |
| Liste, tableau | Lignes d’environ 58 px, séparées d'un filet ; initiales du client dans un rond teinté ; montant aligné à droite |
| Bouton | Hauteur 46 px, pilule ; le vert plein est réservé à **une** action par écran |
| Commande de période | Un seul segment par écran, dans l'en-tête de la carte qu'il gouverne |

## Graphiques

| Graphique | Règle |
|---|---|
| Courbe | Lissage **monotone** : la courbe ne dépasse jamais ses points, sinon elle invente un pic ou un creux. Constaté : trait plein 3 px. Prévu : pointillé rond 2,5 px. Dégradé dessous, plus léger pour le prévu |
| Repères | « aujourd'hui » : filet vertical et pastille sombre. Seuils (réserve, objectif) : pointillé de leur couleur, libellé posé sur le trait, jamais en légende à part |
| Annotations | Deux points au plus sont nommés sur une courbe : le pic et le creux, par une petite carte ou un libellé. Le reste se lit au survol |
| Axes | Trois graduations, pointillées, en Mono 12 px ; un seul axe vertical, toujours ; les mois en toutes lettres abrégées, le mois courant en gras |
| Barres | 14 px, bouts ronds, par paires (en retrait / pleine) ; le mois courant sur un fond teinté avec sa valeur ; l'objectif en trait pointillé libellé |
| Anneau | Une seule valeur, un seul arc, le pourcentage au centre ; jamais de camembert à plusieurs parts |
| Frise | Trait fin, rond plein = fait, rond creux = à venir, « auj. » en pastille ; l'échéance la plus proche porte une carte |
| Survol et clavier | Chaque point se lit au survol **et** au clavier ; chaque graphique a une phrase de résumé (`aria-label`) et ses nombres existent ailleurs en texte |
| Mouvement | Tracé en 400 ms à l'apparition ; rien si « réduire les animations » est demandé |

À ne pas faire : double axe, 3D, aplat plein écran, dégradé arc-en-ciel,
légende détachée quand un libellé direct tient, plus de quatre séries par
graphique.

## Téléphone (décision 19)

Tout écran se livre à 390 px. La maquette `pilote-telephone.html` fixe la règle :
une colonne ; le rail devient une barre basse de cinq entrées ; le chiffre héros
passe à 52 px ; les tuiles défilent à l'horizontale ; un graphique garde sa
hauteur et réduit ses graduations ; un tableau devient une liste de cartes ;
toute cible fait 44 px au moins.

## Polices

Hanken Grotesk (texte) et JetBrains Mono (chiffres), toutes deux sous licence
libre OFL. **Constat du 13/11 : l'application ne les embarque pas** — aucun
`@font-face`, donc l'écran s'affiche dans la police du système. Le lot 51 les
embarque en `woff2`, sous-ensemble latin, `font-display: swap`. Jamais par un
CDN : la politique de contenu ne s'ouvre à aucun domaine tiers. Si le poids ne
tient pas dans les budgets, c'est la pile système qui reste — le budget ne se
relève pas.

## Thème par défaut

Aujourd'hui « sombre ». Proposition : **« calme »** pour un nouvel utilisateur,
puisque c'est le préféré du propriétaire ; le thème choisi reste mémorisé.
À confirmer par lui avant le lot 51.
