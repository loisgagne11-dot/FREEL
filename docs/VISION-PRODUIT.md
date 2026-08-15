# Le rôle de l'application, dit par son propriétaire

**Date :** 14/08/2026
**Source :** énoncé direct du propriétaire, retranscrit sans réinterprétation.

Ce document prime sur les inventaires de conformité. Ceux-ci mesurent l'écart à
une maquette et à une ancienne application ; celui-ci dit **à quoi sert
l'outil**. Quand les deux divergent, c'est celui-ci qui tranche.

---

## La chaîne centrale : la mission engendre tout le reste

C'est le cœur, et c'est ce qui a été nommé « le plus important ».

> Pouvoir facilement **ajouter et modifier une mission** avec le niveau de
> paramétrage voulu. Que ces missions se déclinent en **prévision de revenu**,
> alimentent le **planning Activité**, les **factures automatiques** et le
> **CRA de chaque mois**. Puis que les montants alimentent les **indicateurs et
> KPI**.

Une mission n'est donc pas une fiche : c'est **la source unique** d'où
descendent quatre choses, et dont les montants remontent ensuite dans tous les
chiffres de pilotage.

```
                    ┌─→ prévision de revenu ─┐
   MISSION ─────────┼─→ planning Activité    ├─→ indicateurs & KPI
   (paramétrage)    ├─→ facture du mois      ┘
                    └─→ CRA du mois
```

## La facture du mois se fabrique toute seule

> La facture du mois en cours est **créée en brouillon** et **se met à jour en
> fonction de mes modifications d'Activité**. Puis je peux modifier le **statut
> d'avancement** de chaque facture, et mettre une **date d'envoi** et une
> **date de paiement**.

Trois exigences distinctes :

1. un brouillon **existe sans qu'on le demande**, pour le mois en cours ;
2. il **suit** le planning : corriger une journée corrige la facture ;
3. le cycle de vie d'une facture compte **plus de deux états** — brouillon,
   envoyée (avec sa date), payée (avec sa date).

## Les provisions : calculées, puis ajustées au réel

> Les provisions des dépenses basées sur des calculs doivent être
> **automatiques et justes**, et **ajustables au réel** lorsque la dépense
> arrive vraiment.
>
> Exemple : échéance TVA. J'avais prévu de payer tant et mis tant en prévision
> sur le compte. Lorsque ça arrive, je dois pouvoir **ajouter cette dépense en
> indiquant quand et combien j'ai payé**, et que **ça le retire de ma provision
> pour TVA**.

Le point sensible est le dernier : une provision est une **prévision qui se
solde**. Tant qu'elle n'est pas soldée par un paiement réel — daté, chiffré —
elle reste au passif ; une fois soldée, elle en sort. L'écart entre le prévu et
le réel est une information en soi.

## Les jalons portent leur dossier

> Les **dates des jalons sont visibles** et **au clic dessus j'ai le détail de
> ce que je vais devoir payer**, pour ne pas avoir à chercher les infos. Plus
> le **détail des factures précises concernées**, en accès rapide.
>
> Genre : je dois déclarer ma TVA pour un trimestre. Au clic, j'ai **toutes les
> informations pour remplir ma déclaration**.

C'est une exigence d'usage, pas d'affichage : le critère de réussite est qu'on
puisse remplir un formulaire officiel **sans quitter l'écran ni chercher
ailleurs**.

## La trésorerie, en trois questions

> Combien j'ai **cumulé d'argent sur le compte** ; sur cette somme totale,
> combien j'ai de **provision et sur quelle catégorie** ; et quelle somme j'ai
> de **dispo pour un versement** pour moi.

La nouveauté par rapport à l'existant est **« sur quelle catégorie »** : le
total de provision ne suffit pas, il faut savoir ce qui est URSSAF, TVA, impôt,
CFE.

## Analyser

> Des indicateurs et des graphes qui permettent d'analyser mon CA : ce que je
> **réalise** sur l'année, ce que j'**encaisse**, et **à la date d'aujourd'hui
> où j'en suis**. Quelle mission me rapporte quoi et me prend combien de charge
> de temps, et plus encore.

Deux axes : le temps (réalisé / encaissé / à date) et la mission (rapport /
charge).

## Les achats sont une chaîne de preuve

> Suivre et ajouter les achats, y attribuer une **facture en photo**, les
> **historiser pour garder une preuve**, et faire la **somme de la TVA que je
> récupère** — donc à soustraire lors de la déclaration de TVA.

La dernière proposition relie les achats aux jalons : la TVA déductible n'est
pas un chiffre décoratif, c'est une ligne de la déclaration.

## Les simulateurs

> J'ai des simulateurs d'impôts.

---

## Où en est chacune de ces attentes

Relevé dans le code au 14/08, pas supposé.

| Attente | État | Constat |
|---|---|---|
| Mission → **planning Activité** | ✅ | Rythme par client opérationnel, ajustements par journée |
| Mission → **CRA du mois** | ✅ | Un CRA par client qui signe |
| Mission → **prévision de revenu** | ✅ | Prévu et retenu côte à côte, chaque journée au tarif de sa date |
| Mission → **facture du mois en brouillon** | ✅ | Dérivé du planning, donc il suit par construction. Émettre est le geste qui engage |
| Facture : **statut d'avancement, date d'envoi** | ✅ | Brouillon, à envoyer, envoyée, en retard, encaissée — chacun dérivé d'une date, jamais d'un statut saisi |
| Provisions **automatiques et justes** | ✅ | Deux volets : échéances émises, et charges sur recettes encaissées non déclarées |
| Provision **soldée par un paiement réel** | ✅ | Une échéance payée sort du volet 1 ; la date et le montant réellement débité sont exigés |
| Provisions **par catégorie** | ✅ | Ventilé URSSAF / TVA / impôt / CFE / CFP, volet 1 par échéance et volet 2 par règle de calcul |
| **Jalons datés et visibles** | ⚠️ | Les échéances ont leurs dates et une frise mensuelle ; les jalons réglementaires alertent |
| Jalon → **dossier complet pour déclarer** | ✅ | La TVA a son dossier, ouvert depuis la trésorerie, avec le détail des factures et des achats concernés |
| Trésorerie : **cumulé / provisionné / disponible** | ✅ | Solde, provisions ventilées et versable |
| CA **réalisé vs encaissé**, graphes | ✅ | Par mois, avec les valeurs au-dessus des barres |
| **Où j'en suis à aujourd'hui** | ✅ | Repère de date sur chaque jauge, et date probable de franchissement — qui s'abstient sous un trimestre |
| **Rapport et charge par mission** | ✅ | Tableau trié par euro-jour, plus le TJM effectif et le TJM net |
| Achats : **photo, historisation, preuve** | ✅ | Fichier réellement conservé, empreinte vérifiée — pas un booléen |
| Achats → **TVA déductible de la déclaration** | ✅ | Les achats payés du trimestre composent la ligne déductible, listés un par un |
| **Simulateurs d'impôts** | ✅ | IR par tranches, comparateur versement libératoire, CFE |

## Ce que cela change dans l'ordre de travail

Les deux inventaires de conformité (`PLAN-CONFORMITE-100.md`) mesuraient l'écart
à une maquette et à une ancienne application. Ils restent valables, mais **ils
ne classaient pas par valeur d'usage**. Cet énoncé le fait, et il déplace
l'ordre :

1. ~~**La chaîne de la mission**~~ — prévision de revenu ✅, brouillon de
   facture qui suit l'Activité ✅.
2. ~~**Le cycle de vie d'une facture**~~ — envoyée avec sa date ✅ ; payée
   avec la sienne ✅ (elle l'était déjà).
3. ~~**Les provisions par catégorie**~~ ✅.
4. ~~**Le dossier de déclaration de TVA**~~, atteint depuis son jalon, avec
   les factures et la TVA déductible qui le composent ✅.
5. ~~**Le rapport par mission** en face de sa charge~~ ✅.

Ce qui était en tête des plans précédents et que cet énoncé **déclasse
explicitement** : la relance d'impayés (« pas super important »). Elle vient
d'être livrée ; elle ne sera pas approfondie.
