# Provenance de ce dossier

Ce bundle est le **handoff de design produit avec Claude Design** — la
référence visuelle et fonctionnelle de la refonte. Il a été versé au dépôt le
13/08/2026, après que le propriétaire l'a fourni.

## Pourquoi il est ici

Les neuf fichiers `docs/design/*.md` en décrivent la substance ; ce dossier-ci
en est la **source**. Deux choses qu'aucun `.md` ne remplace :

- les prototypes eux-mêmes (`app/*.html`, `app/*.jsx`), qui montrent le
  comportement voulu et pas seulement son résumé ;
- `annexe-architecture-build5.md`, qui documente les deux stores, les règles de
  calcul et le **vocabulaire** — les libellés sont réfléchis, et les changer
  gratuitement fait perdre des décisions.

Le 12/08, `docs/design/` avait été supprimé du dépôt comme « rapports
d'audit ». C'était une erreur de nature : deux de ces documents ne constatent
rien, ils prescrivent (voir `AVANCEMENT.md`, §4 ter). Ce dossier ne doit plus
quitter le dépôt.

## Ce n'est pas du code de production

Le README du bundle le dit lui-même : ce sont des références écrites en
HTML/CSS/JS, à **recréer** dans la stack cible (ici React + TypeScript), pas à
copier. À reprendre fidèlement : la hiérarchie de l'information, les tokens,
les règles de calcul, le vocabulaire, l'architecture à source unique de vérité.

## Ce qui a été modifié à l'entrée

Les données de démonstration du bundle contenaient **deux IBAN et une adresse
de courriel** portant le prénom du propriétaire. L'invariant n°6 interdit toute
donnée personnelle dans le dépôt, y compris dans un document de référence — le
dépôt est public, et un IBAN de référence est un IBAN publié.

Remplacés par des valeurs manifestement factices :

| Avant | Après |
|---|---|
| deux IBAN au format valide | `FR00 0000 0000 0000 0000 0000 000` — clé de contrôle `00`, invalide par construction |
| une adresse `prénom@…` | `contact@atelier-demo.fr` |

Rien d'autre n'a été touché : ni les écrans, ni les tokens, ni les libellés.

**Le garde-fou avait deux angles morts**, tous deux corrigés dans
`tests/smoke-test.js` le même jour :

1. il ne lisait pas les fichiers `.jsx` — une extension absente de la liste, et
   c'est le fichier entier qui échappe au contrôle ;
2. il ne reconnaissait qu'une affectation `iban: 'FR…'`. Ici l'IBAN était un
   attribut JSX et une chaîne d'option de menu. Une donnée bancaire ne devient
   pas inoffensive parce qu'elle change de place dans la syntaxe.
