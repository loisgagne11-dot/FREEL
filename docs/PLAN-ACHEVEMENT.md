# Plan d'achèvement — jusqu'à ce que l'application soit finie

Ce document est **l'état du travail**, pas son résumé. Il vit sur disque parce
que le contexte d'une conversation se perd et qu'un fichier, non. Toute reprise
commence ici : on lit l'état, on prend le premier lot ouvert, on l'exécute, on
met la ligne à jour.

**Objectif** : l'application `app/` fait tout ce que faisait l'ancienne
(`index.html`), sur le dessin du handoff (`docs/design/captures/`), sans qu'il
manque un écran, une action, un graphe ni un chiffre.

---

## 1. Le dispositif contre la dérive

Quatre choses, et chacune répond à une façon précise de dériver.

### 1.1 Une capture de référence par écran

`docs/design/captures/` — 48 rendus du handoff, deux thèmes, panneaux et modales
compris. **On regarde la capture avant de dessiner.** Ce dossier existe parce
que lire le code du handoff a produit trois décisions fausses (donut pris pour
une barre, graphe combiné pris pour deux graphes, rythme mensuel pris pour des
plages libres). Un écran ne se déduit pas de sa source, il se regarde.

### 1.2 Une capture de notre propre application, au même nom

`docs/design/captures-app/` — le même écran, rendu depuis `app/`, sous le même
nom de fichier. Deux images côte à côte se comparent ; deux descriptions, non.
Générées par `app/scripts/capturer-app.mjs` sur le **jeu de démonstration
partagé** (`app/public/jeu-de-demonstration.json`), qui reprend les données
fictives du handoff pour que les deux images montrent les mêmes chiffres.

### 1.3 Trois portes avant qu'un lot soit « fini »

Aucune ne remplace les autres — elles ne voient pas les mêmes défauts.

| Porte | Ce qu'elle voit | Ce qu'elle ne voit pas |
|---|---|---|
| `npm run verifier` | régression, type, budget, fuite | un écran conforme aux tests et faux à l'œil |
| `controleur-adherence` | l'écart entre ce qui a été annoncé et ce qui est livré | ce que personne n'avait annoncé |
| `controleur-visuel` | l'écart entre notre capture et celle du handoff | ce qui ne se voit pas sur une image fixe |

### 1.4 Un lot n'est jamais « à peu près » fini

Un lot est **ouvert** ou **fini**. « Fini » veut dire : les trois portes sont
franchies, la ligne du tableau porte ✅, et le commit est poussé. Il n'y a pas
d'état intermédiaire, parce qu'un état intermédiaire se raconte et ne se
vérifie pas.

---

## 2. Le périmètre, arbitré avec le propriétaire le 16/08

| Question | Réponse retenue |
|---|---|
| Modèle de prix d'une mission | **Régie · TJM seul.** Forfait et Par lots écartés — ils changeraient le calcul d'occupation et de CA prévisionnel pour un besoin qui n'existe pas. |
| Détail du plan de charge | **Ce que montrent les captures** : créneau matin / après-midi nommé, et lieu télétravail / sur site par demi-journée. Le CRA les totalise. |
| Documents | Génération **PDF** : facture, CRA. Plus le livre des recettes et le FEC. |
| Stockage en ligne | **Supabase** : les faits, et un **coffre des documents officiels** — tout PDF validé (facture émise, CRA envoyé, livre des recettes) y est déposé automatiquement et reste retrouvable depuis l'application. Objectif déclaré : « si l'appli a un souci, j'ai tout de stocké ». |
| Modules d'intelligence | **Deux retenus** : provisions en auto-pilot, brief du lundi. Les quatre autres (relances automatiques, score de risque client, copilote fiscal, prévision probabiliste) restent hors périmètre. |

**Ce que je ne fais pas et pourquoi** : les connecteurs Qonto et Google Drive de
la barre du haut. Ils demandent des identifiants bancaires que je ne dois pas
manipuler. L'import de relevé CSV/OFX existe déjà et couvre le besoin. Les
pastilles resteront décoratives ou seront retirées — arbitrage au lot G.

**Ce dont j'aurai besoin de vous, une seule fois** : l'URL et la clé publique
(`anon`) de votre projet Supabase, saisies **dans l'écran Config de
l'application**, jamais dans le dépôt. Je livre le code et le schéma SQL à
exécuter ; je ne vois pas vos identifiants.

---

## 3. Les lots

Ordre choisi par le nombre d'indicateurs perdus, puis par dépendance. Un lot ne
démarre pas avant que ceux dont il dépend soient finis.

### Socle O — l'outillage de contrôle

Prérequis de tout le reste : sans lui, « conforme au visuel » reste une opinion.

| # | Livrable | Capture de référence | Critère d'acceptation | État |
|---|---|---|---|---|
| O1 | Jeu de démonstration partagé, aux données du handoff | — | Charge sans erreur ; aucune donnée personnelle (`verifier:fuites` vert) | ✅ |
| O2 | `capturer-app.mjs` : nos écrans, mêmes noms que le handoff | — | Produit une image par écran du handoff comparable | ✅ |
| O3 | Agent `controleur-visuel` | — | Rend une liste d'écarts localisés, pas un avis global | ✅ |
| O4 | Bouton « charger un jeu de démonstration » dans Config | `*-config-donnees` | Remplit une application vierge, et le dit avant d'écraser | ✅ |

### Lot P — Ce que l'impôt et l'ACRE coûtent vraiment

**Placé avant la suite du dessin** : la tuile « Résultat projeté » (A1) et les
provisions de l'écran Trésorerie (B4) en dépendent toutes les deux. Soulevé par
le propriétaire le 16/08, vérifié sur le code, confirmé.

| # | Livrable | Critère d'acceptation | État |
|---|---|---|---|
| P1 | La durée d'ACRE devient une **règle datée avec sa source**, comme les taux URSSAF | Le `4` en dur de `sousAcreLe` disparaît ; la règle porte sa source et sa date de vérification ; l'invariant n°3 est tenu | ✅ |
| P2 | Les faits du foyer fiscal : parts, autres revenus imposables, versement PER | Ils dorment aujourd'hui dans `configImpotBrute`, non interprétés ; une provision d'IR sans eux serait un chiffre inventé | ✅ |
| P3 | `provisionImpotRevenu` : l'IR estimé de l'année, réparti sur les mois | Assiette = encaissé constaté + encaissements attendus des missions ; abattement forfaitaire ; barème avec parts ; **les acomptes de PAS déjà saisis sont retranchés** | ⚠️ Le module prend l'assiette complète, mais l'appelant du volet 2 ne peut pas lui fournir les encaissements attendus — voir journal |
| P4 | La provision d'IR entre au volet 2 des provisions | Le versable cesse d'être surévalué de tout l'impôt pour qui n'a pas coché le versement libératoire | ✅ |
| P5 | L'écran dit l'hypothèse | Sans parts ni autres revenus, la provision s'affiche comme incomplète — jamais comme un résultat | ✅ |
| P6 | **L'assiette prend les encaissements attendus des missions** | Aujourd'hui la provision ne compte que l'encaissé constaté : un plancher juste, mais qui monte au fil de l'année au lieu d'être lissé. Le module accepte déjà l'assiette complète ; il manque un accès au pipeline de projection depuis le paquet d'entrée — cycle `etatProjection` → `etatPilote`, et dix-huit kilo-octets à trouver | ⬜ |

#### §3 ter — Pourquoi ce lot existe, et ce qu'il ne refait pas

**L'impôt n'était pas provisionné du tout sous le régime du barème.**
`tauxImpotEtContributions` rend la CFP seule — 0,2 % — et `provisions.ts` en
fait la ligne « impôt » du volet 2. Quelqu'un qui n'a pas coché le versement
libératoire voit donc un versable surévalué de tout son impôt sur le revenu.

**Ce n'est pas l'anomalie E qui rouvre.** Ce qui avait été interdit, c'est de
RECONSTITUER l'acompte de prélèvement à la source : la DGFiP le notifie,
l'utilisateur le saisit, et le recalculer produisait une double imposition.
Une PROVISION est autre chose :

| | Acompte de PAS | Provision d'IR |
|---|---|---|
| Nature | un **fait** — un avis reçu, une date, un montant | une **estimation** de ce que l'année va coûter |
| Volet | 1, déjà appelé | 2, dû mais pas encore appelé |
| Source | l'avis d'imposition | le CA projeté et le foyer |

Les deux cohabitent **à une condition** : la provision estimée retranche les
acomptes déjà saisis. Sans cette soustraction, l'anomalie E revient sous un
autre nom.

**L'ACRE court moins longtemps que ce que nous calculions — confirmé.**
`sousAcreLe` applique douze mois pleins à compter du mois de début d'activité.
La règle du micro-social court « jusqu'à la fin du 3ᵉ trimestre civil suivant
celui de l'affiliation » — soit onze mois pour un début en février, dix pour un
début en décembre. L'écart allait dans le sens dangereux : moins de charges,
donc plus de disponible, donc plus de versable.

**Confirmé par constat le 16/08** : début d'activité au 01/02/2025, exonération
appliquée jusqu'au 31/12/2025, taux plein à partir de janvier 2026. La règle
trimestrielle tombe juste ; les douze mois pleins donnaient janvier 2026 en
trop. La règle remonte dans le barème **avec sa source et sa date de
vérification**, comme les taux URSSAF — le `4` d'origine n'en avait aucune, ce
que l'invariant n°3 interdit.

**L'assiette de la projection est celle que le propriétaire décrit** : les
missions donnent le chiffre d'affaires de l'année, remis à jour à chaque
évolution de mission et de planning ; le RÉEL prend le relais mois par mois dès
que la facture est émise. Le module distingue les deux sans les mélanger — c'est
la même règle que partout ailleurs dans le projet, le constaté ne se confond pas
avec l'attendu.

### Lot Q — Une facture n'est pas payée le jour où elle part

Soulevé par le propriétaire le 16/08. **Bloque la justesse de toute prévision** :
la projection de trésorerie, la capacité de versement mensuelle et la provision
d'impôt reposent toutes sur la date à laquelle l'argent arrive.

| # | Livrable | Critère d'acceptation | État |
|---|---|---|---|
| Q1 | Un délai de paiement qui sait dire « 30 jours **fin de mois** » | Aujourd'hui `delaiPaiementJours: number` ne sait qu'ajouter des jours. « Fin de mois » est une autre arithmétique, et c'est celle que le propriétaire subit sur ses deux missions en cours | ⬜ |
| Q2 | Le délai se déclare **sur la mission**, dans une liste déroulante | Une mission passée par une agence n'a pas les mêmes conditions qu'une vente directe au même nom. Liste, pas saisie libre : les conditions réelles sont un petit ensemble de formules nommées | ⬜ |
| Q2 bis | L'application signale un délai **hors des bornes légales** | 60 jours nets ou 45 jours fin de mois au maximum (art. L441-10 du code de commerce). Un délai plus long se signale sans se refuser : il arrive qu'on en signe | ⬜ |
| Q3 | La facture **porte son échéance** comme un fait | Elle est imprimée sur le document envoyé au client : changer les conditions d'un client ne doit pas réécrire la date d'échéance des factures déjà parties | ⬜ |
| Q4 | Les prévisions s'alignent sur ces échéances | `etatProjection`, `capaciteVersement` et la provision d'impôt datent l'encaissement attendu à l'échéance réelle, plus à une approximation | ⬜ |
| Q5 | Migration des factures existantes | L'échéance se calcule une fois depuis les conditions du client, puis se fige. Le dire, ne pas le supposer | ⬜ |

#### §3 quater — Pourquoi l'échéance devient un fait

Le code actuel dérive l'échéance à la lecture :
`ajouterJours(r.emiseLe, delaiParClient.get(r.clientNom))`.

Trois défauts, du plus léger au plus grave :

1. **Il ne sait pas dire « fin de mois ».** Une facture émise le 12 juin à
   « 30 jours fin de mois » n'est pas due le 12 juillet mais le 31 juillet.
   Dix-neuf jours d'écart sur chaque facture, et la prévision de trésorerie
   annonce l'argent avant qu'il n'arrive.

2. **Le délai ne vit que sur le client.** Une mission passée par une agence et
   une vente directe au même client n'ont pas les mêmes conditions.

3. **Changer les conditions d'un client réécrit le passé.** « Cette facture
   était-elle en retard ? » change de réponse rétroactivement, et le compteur
   de retards avec. Or l'échéance est **imprimée sur le document envoyé** :
   c'est un fait, pas une dérivée. Le délai de la mission et celui du client
   ne sont plus que la valeur **proposée à la création** — ce qui est
   exactement leur rôle.

C'est la même distinction que partout ailleurs dans le projet : le constaté ne
se recalcule pas depuis un réglage qui a bougé depuis.

#### §3 quinquies — Les formules proposées, et pourquoi une liste

Les conditions de paiement ne sont pas un nombre libre : ce sont quelques
formules nommées, que les deux parties reconnaissent et écrivent telles quelles
sur le contrat. Une saisie libre en jours ne peut d'ailleurs pas exprimer
« fin de mois », qui est le cas courant.

La liste proposée à la création d'une mission :

| Formule | Ce qu'elle calcule, pour une facture du 12 juin |
|---|---|
| Paiement à réception | 12 juin |
| 30 jours nets | 12 juillet |
| 45 jours nets | 27 juillet |
| 60 jours nets | 11 août |
| **30 jours fin de mois** | + 30 jours, puis fin du mois atteint → **31 juillet** |
| **45 jours fin de mois** | + 45 jours, puis fin du mois atteint → **31 juillet** |
| Fin de mois + 30 jours | fin du mois d'émission, puis + 30 jours → 30 juillet |
| Fin de mois + 45 jours | fin du mois d'émission, puis + 45 jours → 14 août |

Les deux dernières existent parce que « 30 jours fin de mois » et « fin de mois
+ 30 jours » sont deux conventions distinctes, souvent confondues, qui ne
tombent pas le même jour. Les nommer sans ambiguïté vaut mieux que de deviner
laquelle l'utilisateur voulait dire.

**Défaut : 30 jours fin de mois.** C'est ce que le propriétaire subit sur ses
missions en cours, et le supplétif légal — 30 jours — n'en est pas loin.

**Hors bornes légales.** L'article L441-10 plafonne à 60 jours nets ou 45 jours
fin de mois. « Fin de mois + 45 jours » et « 60 jours fin de mois » dépassent.
L'application ne les refuse pas — on signe parfois ce qu'on n'a pas choisi —
mais elle le dit, parce que c'est une information que le freelance a intérêt à
connaître au moment de facturer.

### Lot R — Dégager le paquet d'entrée

**Bloque la clôture du lot Q**, et bloquera tous les suivants : le paquet
d'entrée n'a plus de marge. Il était à 79,89 / 80 Ko avant le lot Q, soit un
dixième de pour cent — n'importe quel ajout le fait déborder, et l'invariant
n°7 interdit de relever le plafond.

| # | Livrable | Critère d'acceptation | État |
|---|---|---|---|
| R1 | La FORMULATION des sujets « à traiter » quitte le paquet d'entrée | Dix mille huit cent cinquante-sept octets de phrases françaises y voyagent aujourd'hui, pour un panneau qui ne s'ouvre qu'au clic. La détection — combien, quelle gravité, quel écran — reste ; la mise en mots part avec le panneau | ⬜ |
| R2 | Le budget retrouve une marge exploitable | Au moins cinq kilo-octets, sans quoi le lot suivant rouvre le même sujet | ⬜ |

#### §3 sexies — La coupure : détecter n'est pas formuler

C'est la même coupure que celle déjà faite deux fois dans ce projet — les
libellés de délai de paiement d'un côté, le calcul d'échéance de l'autre ; le
barème de Config sorti dans son propre paquet. Ce qui CALCULE reste, ce qui
NOMME part avec l'écran qui l'affiche.

Ici, la pastille du haut n'a besoin que d'un nombre et d'une gravité. Les
intitulés, les contextes et les libellés d'action ne servent qu'au panneau, et
ce panneau charge déjà sa coquille à la demande.

### Lot A — Argent · Performance

C'est là que le plus grand nombre d'indicateurs de l'ancienne application ont
disparu. Le plan initial a été **révisé après expertise** : trois de ses six
points auraient publié un chiffre faux ou recréé un défaut déjà fermé. Les
arbitrages sont écrits au §3 bis, sous le tableau.

| # | Livrable | Capture | Critère d'acceptation | État |
|---|---|---|---|---|
| A0 | Le cadre : titre « Ton argent », sous-titre, étiquette « Provisions · N % couvertes », et les **deux piliers** (Trésorerie / Performance) portant chacun sa question et son chiffre | `*-argent-tresorerie`, `*-argent-performance` | Le vocabulaire du handoff est repris tel quel ; le sort des onglets « Livre des recettes » et « DES » est tranché par écrit | ⬜ |
| A1 | Quatre tuiles : CA réalisé, CA encaissé, À encaisser, **Résultat projeté** | `*-argent-performance` | Assiette = le pipeline de `etatProjection`, jamais une extrapolation du passé. Cotisations sommées **mois par mois** (l'ACRE s'éteint en cours d'année). Sous barème : acomptes de PAS **saisis** seulement, jamais un IR déduit d'un taux — sinon le libellé dit « avant impôt sur le revenu ». Si l'un des trois ne tient pas : **trois tuiles**, pas quatre dont une fausse | ⬜ |
| A2 | Graphe CA réalisé vs encaissé, **mois écoulés seulement**, valeurs en k€ au-dessus, repère du mois courant, cumul en pied | `*-argent-performance` | Douze mois rendraient les étiquettes illisibles et contrediraient la référence, qui s'arrête au mois courant | ⬜ |
| A3 | **Panneau Composition, permanent**, ouvert sur le mois courant | `*-argent-performance` | Réalisé ventilé par mission avec `jours × TJM` ; encaissé par facture ; **reste à encaisser calculé facture par facture**, jamais par soustraction de deux agrégats ; cas « encaissé d'avance » traité ; ce qui ne se départage pas entre missions simultanées d'un même client est **dit** | ⬜ |
| A4 | « Tu peux te verser » + curseur de part gardée | `*-argent-performance` | Deux faits distincts (§3 bis) ; `versable × (1 − part)` ; défaut 0 % ; le bouton **nomme un mouvement bancaire**, il ne crée pas un fait de versement | ⬜ |
| A5 | Capacité de versement par mois, **versé à l'intérieur de la barre**, futur hachuré | `*-argent-performance` | Un module de domaine `capaciteVersement.ts` écrit et testé **avant** de dessiner ; un mois futur n'a **aucun** versé — le hachuré ne remplit rien | ⬜ |
| A6 | Objectif de CA : ligne de référence rattachée à l'**encaissé**, et jours d'écart en pied | `*-argent-performance` | Aucune ligne sans objectif fixé ; l'écart au dessin (le handoff n'a pas d'objectif) est écrit | ⬜ |
| A7 | Les trois inventaires remis d'équerre | — | V9 cesse d'être vrai, `drawMainChart` et `computeTrend` reçoivent leur motif. Un inventaire qui se trompe dans le sens « présent » coûte plus cher qu'un manque | ⬜ |

#### §3 bis — Arbitrages du lot A

**Le résultat projeté ne peut pas être « CA − cotisations ».** Sous le régime du
barème, le calcul de charges ne rend que la CFP à 0,2 % et ne refuse jamais : la
tuile aurait affiché « après cotisations » en ignorant tout l'impôt sur le
revenu, sans qu'aucun garde-fou ne se déclenche. Et le corriger en recalculant
l'IR rouvrirait l'anomalie déjà fermée : l'acompte de prélèvement à la source
est un **fait saisi**, jamais une sortie de calcul — le reconstituer produit une
double imposition. La tuile dit donc ce qu'elle sait, et nomme ce qu'elle ignore.

**La réserve est deux notions, pas une.** Le handoff porte les deux dans le même
écran de réglages : un **seuil de sécurité** en euros (« plancher affiché sur tes
courbes ») et une **part gardée** en pourcentage. Ce ne sont pas deux façons de
dire la même chose — un plancher exprimé en pourcentage du disponible descend à
mesure qu'on vide le compte, et le versement soutenable finit par tout
autoriser. C'est une boucle, pas une préférence.

- `reserve: Euros` **reste le fait**, et prend son nom du dessin : **seuil de
  sécurité**. Les deux endroits qui l'appellent encore « réserve » se réalignent.
- **Nouveau fait** `partGardeeAuVersement` (ratio) : ce que le curseur écrit, ici
  comme dans Config. Source unique.
- Le montant gardé ne se stocke jamais : il se dérive.
- Formule : `versable × (1 − part)`, et non `disponible × (1 − part)` comme le
  fait le prototype — à 0 % celui-ci propose de verser le matelas avec.
- **Défaut 0 %, pas 50 %** : un défaut à 50 % couperait en deux, sans un geste,
  le versable de tout compte existant.

**« Enregistrer le versement » n'écrit pas un fait de plus.** L'arbitrage est
déjà pris : un versement est **un nom sur un mouvement bancaire**, pas une
saisie. Deux sources pour « déjà versé » finiraient par ne pas tomber d'accord.

**Écartés, avec motif.** La bascule mensuel / cumulé — le cumul est en pied de
carte, une bascule ajouterait un état d'écran pour dire le même total. Les
congés en second axe — un axe en jours sur un graphe en euros ; la donnée vit au
lot C4. La tendance ↑/↓ % — elle comparait trois mois à trois mois sur une
facturation irrégulière. La moyenne de capacité — elle moyennerait des mois
projetés, donc une fiction ; la moyenne du **versé**, elle, est reprise.

**Reporté, mais écrit** : le sélecteur de période. L'année est aujourd'hui
verrouillée sur l'horloge ; au 1er janvier l'écran Performance devient vide et
l'année précédente est inatteignable. Traité au lot A si le budget le permet,
sinon en lot propre — pas oublié.

### Lot B — Argent · Trésorerie

| # | Livrable | Capture | Critère d'acceptation | État |
|---|---|---|---|---|
| B1 | Quatre tuiles : solde, disponible, à encaisser, autonomie | `*-argent-tresorerie` | L'autonomie dit son hypothèse ; zéro besoin mensuel ⇒ abstention, pas zéro mois | ⬜ |
| B2 | **Graphe combiné entrées / sorties / solde** projeté, avec ligne de seuil | `*-argent-tresorerie` | Une courbe de solde, des barres autour d'un zéro, le net sous chaque mois | ⬜ |
| B3 | **Donut** « Ton solde n'est pas tout à toi » + phrase + montants à droite | `*-argent-tresorerie` | Les trois parts, la phrase qui les explique, les montants masquables | ⬜ |
| B4 | Enveloppes de provision en quatre cartes, clic = détail | `*-argent-tresorerie` | Chaque carte : montant mis de côté / montant dû, et son échéance | ⬜ |
| B5 | Seuils : deux jauges avec projection et date de franchissement | `*-argent-tresorerie` | Déjà présent — à conformer au dessin | ⬜ |
| B6 | **Frise de l'échéancier** avec repère « auj. » | `*-argent-tresorerie` | Les échéances posées sur douze mois, pas groupées en liste | ⬜ |

### Lot C — Activité & congés

| # | Livrable | Capture | Critère d'acceptation | État |
|---|---|---|---|---|
| C1 | Schéma : créneau (matin / après-midi) et lieu (télétravail / sur site) | — | Migration qui descend jusqu'aux ajustements ; une demi-journée sans créneau reste lisible | ⬜ |
| C2 | Vue semaine : deux créneaux par jour, client, lieu, congé hachuré | `*-activite-plan-de-charge` | Deux clients différents le même jour sont exprimables | ⬜ |
| C3 | Vue mois : grille calendaire, deux créneaux, initiales client | `*-activite-mois` | Le week-end et les fériés se distinguent | ⬜ |
| C4 | « Le mois en chiffres » : jours, CA généré, **occupation en jauge**, répartition clients, télétravail | `*-activite-plan-de-charge` | L'occupation dit « 18,5 / 22 j ouvrés · 2 j congé », pas un pourcentage nu | ⬜ |
| C5 | « Ce que Freel remarque » | `*-activite-plan-de-charge` | Chaque remarque nomme le fait qui la déclenche ; aucune remarque inventée | ⬜ |
| C6 | Onglet Missions : avancement `j / j`, CA mission, filtres par statut | `*-activite-missions` | Un TJM absent se dit, ne se suppose pas | ⬜ |
| C7 | Onglet Factures : période, encaissé attendu / reçu, statut, retard en jours | `*-activite-factures` | « émise » et « envoyée » restent distinctes | ⬜ |
| C8 | Onglet Clients : part du CA, **DSO réel constaté vs contractuel**, remarque | `*-activite-clients` | Le DSO s'abstient sous trop peu de factures réglées | ⬜ |

### Lot D — Pilote

| # | Livrable | Capture | Critère d'acceptation | État |
|---|---|---|---|---|
| D1 | « Le flux du mois » : entrées / sorties / rémunération, statuts cliquables | `*-pilote` | Cliquer un statut le met à jour, sans quitter l'écran | ⬜ |
| D2 | Santé + autonomie au rythme actuel | `*-pilote` | La santé énumère ses composantes ; aucun score inventé | ⬜ |
| D3 | « Décisions du jour » : chaque décision porte son levier et son bouton | `*-pilote` | Une décision sans action possible ne s'affiche pas | ⬜ |
| D4 | Actions rapides personnalisables (catalogue + `+`) | `*-pilote` | Le choix persiste | ⬜ |
| D5 | Panneau « Pointer un encaissement » | `*-pilote-encaissements` | Marque payé et met à jour le flux | ⬜ |

### Lot E — Achats & justificatifs

| # | Livrable | Capture | Critère d'acceptation | État |
|---|---|---|---|---|
| E1 | Quatre tuiles : dépenses, TVA déductible, à rapprocher, justificatifs manquants | `*-achats` | La TVA non récupérable faute de pièce est comptée à part | ⬜ |
| E2 | Rapprochement bancaire : opérations sans dépense, dépenses sans opération | `*-achats` | Chaque ligne propose l'action exacte : associer, relier, créer | ⬜ |
| E3 | Registre des achats : clic = détail & pièce | `*-achats` | Dépenses récurrentes signalées et totalisées | ⬜ |
| E4 | Filtres période et compte | `*-achats` | — | ⬜ |
| E5 | Panneau « Nouvelle dépense » avec dépôt de justificatif | `*-pilote-depense` | — | ⬜ |

### Lot F — Outils & simulateurs

| # | Livrable | Capture | Critère d'acceptation | État |
|---|---|---|---|---|
| F1 | Calculateur d'impôt : barème vs versement libératoire, foyer, PER | `*-outils-impot` | Désigne l'option avantageuse et dit de combien | ⬜ |
| F2 | Impôt du foyer par tranche | `*-outils-impot` | Chaque tranche avec sa borne et son montant | ⬜ |
| F3 | Simulateur CFE | `*-outils-impot` | Exonération première année ; base minimum par commune | ⬜ |
| F4 | Rendement du compte pro | `*-outils-banque` | — | ⬜ |
| F5 | Import de relevé et rapprochement | `*-outils-banque` | Existe — à conformer | ⬜ |
| F6 | Générateur de CRA | `*-outils-cra` | — | ⬜ |

### Lot G — Config

| # | Livrable | Capture | Critère d'acceptation | État |
|---|---|---|---|---|
| G1 | Navigation en sept sections, avec sous-titres | `*-config-*` | — | ⬜ |
| G2 | Profil & statut | `*-config-profil` | — | ⬜ |
| G3 | Paramètres fiscaux, avec fraîcheur du barème | `*-config-fiscal` | Un barème périmé se signale ; l'application ne l'extrapole pas | ⬜ |
| G4 | Réserve & versements, curseur en % + seuil de sécurité | `*-config-reserve` | Source unique avec le curseur du lot A4 | ⬜ |
| G5 | Facturation : numérotation, IBAN, mentions | `*-config-facturation` | — | ⬜ |
| G6 | Compte & Cloud Sync | `*-config-cloud` | Dit ce qui est synchronisé et quand ; aucun identifiant dans le dépôt | ⬜ |
| G7 | Données & export | `*-config-donnees` | — | ⬜ |
| G8 | Arbitrage sur les pastilles Qonto / Drive de la barre du haut | `*-pilote` | Retirées ou explicitement marquées non connectées | ⬜ |

### Lot H — Documents officiels

| # | Livrable | Critère d'acceptation | État |
|---|---|---|---|
| H1 | Facture en PDF, au dessin du handoff | Mentions légales obligatoires ; TVA ou art. 293 B selon le régime | ⬜ |
| H2 | CRA en PDF, synthèse hebdomadaire télétravail / sur site | Un CRA par client opérationnel | ⬜ |
| H3 | Livre des recettes en CSV | Colonnes réglementaires, ordre chronologique | ⬜ |
| H4 | Export FEC | Format de l'administration | ⬜ |
| H5 | Sauvegarde et restauration JSON | Aller-retour sans perte, vérifié par test | ⬜ |

### Lot I — Stockage en ligne

| # | Livrable | Critère d'acceptation | État |
|---|---|---|---|
| I1 | Schéma SQL à exécuter dans Supabase, livré dans le dépôt | Politiques d'accès par utilisateur ; rien d'ouvert en écriture publique | ⬜ |
| I2 | Synchronisation des faits | Conflit détecté et arbitré, jamais écrasé en silence | ⬜ |
| I3 | **Coffre des documents** : tout PDF validé y monte automatiquement | Retrouvable depuis l'application ; l'échec de dépôt se dit | ⬜ |
| I4 | Mode hors ligne | L'application reste utilisable sans réseau ; le retard de synchronisation s'affiche | ⬜ |

### Lot J — Provisions en auto-pilot

| # | Livrable | Critère d'acceptation | État |
|---|---|---|---|
| J1 | Chaque encaissement rapproché remplit les enveloppes au taux de sa période | Le taux vient du barème daté, jamais d'une moyenne | ⬜ |
| J2 | Ordre de virement préparé vers le bocal | Proposé, jamais exécuté sans geste | ⬜ |

### Lot K — Le brief du lundi

| # | Livrable | Critère d'acceptation | État |
|---|---|---|---|
| K1 | Le flux en une ligne, trois décisions, un chiffre | Ne s'affiche que s'il a quelque chose à dire | ⬜ |

---

## 4. Comment un lot se déroule

1. **Lire** les captures du lot et la ligne du tableau.
2. `expert-plan` juge le plan du lot : couverture fonctionnelle contre
   l'ancienne application, justesse comptable, conformité au dessin.
3. `executant` écrit le code, les tests et les commentaires.
4. `npm run verifier` — porte 1.
5. `capturer-app.mjs` puis `controleur-visuel` — porte 2.
6. `controleur-adherence` — porte 3.
7. La ligne passe à ✅, le lot est commité, poussé, et une PR est ouverte.

Un écart relevé par une porte rouvre l'étape 3. On ne passe pas au lot suivant
avec une porte rouge : c'est ainsi qu'on se retrouve avec six écrans à moitié
faits plutôt qu'avec trois écrans finis.

---

## 5. Journal

| Date | Lot | Ce qui a été fait |
|---|---|---|
| 16/08 | — | Plan établi et périmètre arbitré. |
| 16/08 | Lot R | Ouvert : le paquet d'entrée n'a plus de marge, et l'invariant n°7 interdit de relever le plafond. |
| 16/08 | Lot Q | Code livré et testé, **non clos** : le budget d'entrée dépasse de cent-dix octets. Trois extractions faites (libellés séparés du calcul, table de règles remplacée par la lecture de l'identifiant, deux fonctions de date fusionnées) — il en manque une, et c'est le lot R. |
| 16/08 | Lot P | Livré, P6 excepté. Le versable baisse de 5 045 € sur 60 000 € encaissés en BNC à une part : c'est l'impôt qui n'était provisionné nulle part. L'ACRE s'arrêtait un mois trop tard. Deux extractions imposées par le budget, aucun plafond relevé. |
| 16/08 | Lot Q | Ouvert : l'échéance d'une facture se déduisait du client à la lecture, sans savoir dire « fin de mois » et en réécrivant le passé à chaque changement de conditions. |
| 16/08 | Lot P | Ouvert : l'impôt sur le revenu n'était provisionné nulle part sous le régime du barème, et la fenêtre d'ACRE est probablement trop longue de un à trois mois. |
| 16/08 | Lot P | Livré. L'ACRE est une règle **trimestrielle** datée (`bareme/acre.ts`), confirmée par constat sur un compte réel — un début au 01/02/2025 s'arrête au 31/12/2025, et non au 31/01/2026 comme le calculait le `4` en dur. Les trois faits du foyer fiscal sont saisissables et repris de `configImpotBrute` (schéma 12). `provisionImpotRevenu` entre au volet 2, acomptes de PAS retranchés. **Réserve sur P3** : l'assiette du volet 2 se limite à l'encaissé CONSTATÉ. Le pipeline de `etatProjection` ne peut pas être lu depuis `etatPilote` — `etatProjection` appelle lui-même `etatPilote`, et l'y importer ferait franchir de 18 Ko le budget d'entrée. Le montant est donc un plancher, et il le dit. |
| 16/08 | Socle O | Outillage de contrôle en place. La première comparaison montre l'onglet Performance à trois tuiles sur quatre, sans composition au clic, sans capacité de versement et sans curseur de réserve. |
