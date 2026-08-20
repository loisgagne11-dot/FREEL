# FREEL — mémoire de projet

Poste de pilotage d'un indépendant en micro-BNC. L'application vit dans `app/`
(Vite + React 19 + TypeScript strict). `index.html` à la racine est **l'ancienne
version, à conserver** : elle sert de référence fonctionnelle, elle ne se
supprime pas.

## La référence visuelle : `docs/design/captures/`

**Avant de dessiner ou de modifier un écran, regarder la capture correspondante.**
Le dossier contient un rendu de chaque écran du handoff produit avec Claude
Design, dans les deux thèmes, panneaux et modales compris. `INDEX.md` fait la
correspondance capture → écran.

C'est la référence, pas une illustration. Elle a plusieurs fois contredit ce que
la lecture du code du handoff laissait supposer :

- l'écran Argent porte **un graphe combiné entrées / sorties / solde**, pas deux
  graphes de barres séparés ;
- la répartition du solde est un **donut**, avec la phrase explicative et les
  montants à côté — pas seulement une barre segmentée ;
- l'échéancier est une **frise** avec repère « auj. », pas une liste groupée ;
- la capacité de versement se lit **versé à l'intérieur de la barre de
  capacité**, pas en deux barres côte à côte ;
- le rythme d'une mission se saisit **une ligne par mois**, avec jours et CA
  calculés en regard.

Regénérer après toute modification du handoff :

```
cd app && node scripts/capturer-handoff.mjs          # les deux thèmes
cd app && node scripts/capturer-handoff.mjs --theme=clair
```

Les captures ne se retouchent pas à la main : elles cesseraient de dire la
vérité sur le handoff dont elles sont tirées.

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

`docs/VISION-PRODUIT.md` dit à quoi sert le produit ; s'y référer avant
d'arbitrer entre deux conceptions.

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
