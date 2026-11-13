# FREEL — mémoire de projet

Poste de pilotage d'un indépendant en micro-BNC. L'application vit dans `app/`
(Vite + React 19 + TypeScript strict). `index.html` à la racine est **l'ancienne
version, à conserver** : elle sert de référence fonctionnelle, elle ne se
supprime pas.

## La référence visuelle : `docs/design/direction/`

**Avant de dessiner ou de modifier un écran, regarder la maquette correspondante.**
Le propriétaire a retenu le 13/11 la direction « Calme, graphiques retravaillés » :
ses quatre thèmes tels quels, un dessin plus fin. `docs/design/DIRECTION-VISUELLE.md`
dit les règles ; `docs/design/direction/` porte les maquettes, leur feuille de
style — qui fait foi pour les mesures — et leurs captures.

```
cd app && node scripts/capturer-direction.mjs              # calme, + planche en nuit
cd app && node scripts/capturer-direction.mjs --mode=tous  # les quatre thèmes
```

Un écran sans maquette se dessine d'après la planche et les règles, **et se
soumet au propriétaire avant d'être codé** : deux directions ont été écartées
avant celle-ci, sur l'allure seule.

### Le handoff : mémoire, plus référence

`docs/design/captures/` rend chaque écran du handoff produit avec Claude Design
(`INDEX.md` fait la correspondance). Il n'est plus la référence de style depuis
le 12/11 ; il sert à retrouver ce qu'un écran montrait. La leçon qu'il a donnée
vaut toujours pour les maquettes : **une image contredit ce que la lecture du
code laisse supposer.** Elle l'a fait plusieurs fois :

- l'écran Argent porte **un graphe combiné entrées / sorties / solde**, pas deux
  graphes de barres séparés ;
- la répartition du solde est un **donut**, avec la phrase explicative et les
  montants à côté — pas seulement une barre segmentée ;
- l'échéancier est une **frise** avec repère « auj. », pas une liste groupée ;
- la capacité de versement se lit **versé à l'intérieur de la barre de
  capacité**, pas en deux barres côte à côte ;
- le rythme d'une mission se saisit **une ligne par mois**, avec jours et CA
  calculés en regard.

Les captures, celles des maquettes comme celles du handoff
(`node scripts/capturer-handoff.mjs`), ne se retouchent pas à la main : elles
cesseraient de dire la vérité sur le fichier dont elles sont tirées.

## Les trois axes de contrôle

Un écart ne se voit que si quelque chose le cherche. Trois inventaires, dont les
unités sont différentes :

| Document | Unité |
|---|---|
| `docs/AUDIT-REDESIGN-V1.11.md` | l'écran et sa conformité au design |
| `docs/AUDIT-ANCIENNE-VS-NOUVELLE.md` | la fonction — écran, action, module |
| `docs/AUDIT-GRAPHES-ET-INDICATEURS.md` | **un nombre que l'utilisateur lit à l'écran** |

Le troisième existe parce que les deux premiers ne pouvaient structurellement
pas voir un indicateur perdu à l'intérieur d'un écran existant : l'écran est là,
le magasin est câblé, les tests sont verts, et le chiffre a disparu.

**Les tenir fait partie du lot, pas de l'après.** Les lots B et C ont été livrés
et fusionnés pendant que les trois documents restaient datés du lot A : sept
visualisations et six indicateurs y manquaient, et une ligne se contredisait avec
sa propre section « reste à faire ». Un inventaire qu'on ne met pas à jour au
moment de la livraison ne signale plus rien — il devient la photographie d'un état
passé, et la seule chose qu'il garantit est qu'on cessera de le consulter.

## Livrer

Un lot n'est fini que quand les cinq sont vrais :

1. `cd app && npm run verifier` est vert ;
2. les captures sont regénérées et **relues** ;
3. les trois inventaires portent ce que le lot a changé ;
4. le contrôle visuel est passé sur les écrans touchés ;
5. `docs/LISTE-DE-SORTIE.md` porte ce que le lot a changé.

**Une PR par lot, ouverte au premier commit.** Quatre lots empilés sur une
branche dont la PR fusionne en cours de route se retrouvent sans PR ouverte :
plus rien ne les porte en revue, et c'est arrivé au lot C. Ne rien proposer à la
fusion qui ne soit fini au sens ci-dessus — et le dire explicitement quand ça
l'est.

`docs/VISION-PRODUIT.md` dit à quoi sert le produit ; s'y référer avant
d'arbitrer entre deux conceptions. Ce qui reste à faire vit dans
`docs/LISTE-DE-SORTIE.md`, et nulle part ailleurs.

## Invariants

1. Les faits seuls sont stockés. Toute valeur dérivée se calcule dans un
   sélecteur — jamais persistée.
2. Les statuts sont dérivés, jamais stockés.
3. `Resolution<T>` (`publie | hypothese | refuse`) sur toute donnée qui engage :
   on s'abstient plutôt que d'inventer un taux ou un seuil.
4. Une source unique par notion. Deux calculs concurrents finissent par ne pas
   tomber d'accord.
5. Le schéma est versionné et **refuse** une version postérieure au lieu de la
   raboter. Une migration **descend jusqu'où les champs ont bougé** : une fusion
   de surface ne comble pas un champ apparu dans un élément de liste.
6. **Aucune donnée personnelle dans le dépôt.** Il est public. Les données de
   démonstration portent des valeurs manifestement factices. `tests/smoke-test.js`
   balaie le dépôt entier — y compris `docs/design/`, y compris les `.jsx`.
   Il reconnaît des **formes** (SIRET, IBAN, TVA, courriel hors domaine fictif) ;
   un prénom n'a pas de forme et lui échappe : à vérifier à l'œil.
7. Les budgets de performance ne se relèvent pas. Quand un budget dépasse, on
   **extrait** le module qui n'a rien à faire dans le lot.

## Sécurité

L'application va être publiée (décision 21). `docs/AUDIT-SECURITE.md` porte les
constats ; les lots 56 à 62 de la liste de sortie, ce qui reste. Cinq règles,
qui valent pour tout lot :

1. **Rien d'externe à l'exécution.** Ni CDN, ni traceur, ni police distante. La
   politique de contenu de `app/index.html` est le garde-fou, et elle ne
   s'assouplit pas plus qu'un budget ne se relève : on change le code, pas elle.
2. **Ce qui vient d'un fichier ou du réseau est hostile.** Validé par le schéma
   à l'entrée ; échappé à la sortie, selon la sortie — HTML, CSV, XML, adresse.
   Un libellé de relevé bancaire est choisi par un tiers.
3. **Aucun secret dans une page servie.** Ni clé de service, ni adresse de
   projet dans le dépôt. La clé publique ne protège rien : ce sont les règles
   d'accès qui protègent, et la sonde qui le constate.
4. **Le SQL est exécuté par l'utilisateur lui-même.** L'application constate
   par relecture ; un « succès » du serveur ne prouve rien (lot 25).
5. **L'ancienne version ne se supprime pas, elle se bride** — sur la copie
   publiée, jamais sur l'original.

## Vérification

`cd app && npm run verifier` enchaîne : typecheck, tests, build, câblage,
budgets, responsive, index, confidentialité, migration, vitesse, fuites.
Aucun travail n'est fini avant qu'il soit vert.

La mutation est la preuve : après avoir corrigé un calcul, inverser la
correction doit faire échouer un test nommé. Sinon le test ne tient rien.

## Langue

Le code, les commentaires, les commits et les libellés sont **en français**.
Les commentaires disent *pourquoi*, avec le contre-exemple qui a motivé la
décision — pas *ce que* fait la ligne suivante.

**L'application tutoie.** C'est la voix du handoff — « Ton argent », « Tu peux
te verser », « Rien ne réclame ton attention » — et celle d'un outil personnel
qu'on ouvre tous les matins. Arbitré le 20/08 ; l'application vouvoyait jusque-là
et la passe a été faite d'un coup, sur les 31 fichiers concernés.

**Une exception, et une seule : ce qui part chez le client.** `relance.ts` écrit
des lettres de relance et des mises en demeure adressées au client, pas à
l'utilisateur. Elles vouvoient, et c'est le contraire d'une incohérence — une
mise en demeure tutoyée ne vaut rien.

Le piège de cette passe : un `vous` de politesse et un `vous` pluriel ne se
distinguent par aucune expression régulière, et `votre` s'accorde en genre avec
ce qui suit. Elle se relit à l'œil, jamais au `sed`.
