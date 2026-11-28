# Audit des graphes, visualisations et indicateurs

**Date :** 14/08/2026
**Périmètre :** ancienne application (`index.html`), maquette
(`docs/design/handoff-v1.11/` et `docs/design/05-spec-ecrans.md`), version
actuelle (`app/src/`).

**Critère de jugement :** *le meilleur des deux*, et non la conformité. La
question posée n'est pas « ce graphe existait-il ? » mais « quel est le bon
graphe, le bon indicateur, pour cette activité ? ». L'audit est donc autorisé
à proposer ce qui n'existe nulle part, à recommander l'abandon de ce qui
n'apprend rien, et à critiquer la maquette.

---

## Pourquoi ce document existe

Les deux inventaires précédents avaient pour unité **la fonction** : un écran,
une action de magasin, un module de calcul. Un indicateur n'est aucun des
trois — c'est une ligne dans un écran, et un graphe aussi. Un indicateur perdu
ne fait donc échouer aucun contrôle : l'écran existe, le magasin est câblé, les
tests sont verts.

Ce document tient l'inventaire dont l'unité est **un nombre que l'utilisateur
lit à l'écran**. C'est le troisième axe de contrôle, à côté du design et des
fonctions.

> **Il a passé deux lots sans être tenu.** Le lot B et le lot C ont été livrés,
> relus et fusionnés pendant que ce document restait daté du lot A. Sept
> visualisations et six indicateurs y manquaient, et une ligne se contredisait
> avec le §6 depuis autant de temps.
>
> Un inventaire qui n'est pas mis à jour au moment de la livraison ne signale
> plus rien : il devient une photographie d'un état passé, et la seule chose
> qu'il garantit est qu'on ne le consultera plus. C'est le même mécanisme que
> le V9 déclaré présent alors que rien ne s'affichait — sauf qu'ici c'est
> l'inventaire entier qui décroche, pas une ligne.
>
> **La mise à jour des trois inventaires fait partie du lot, pas de l'après.**

---

## Verdict d'ensemble

Les neuf `new Chart()` de l'ancienne application et les huit visualisations de
la maquette se sont ramassés en **un graphe, trois jauges et deux barres
segmentées**.

Une partie de cette réduction est un **progrès** : plusieurs graphes de
l'ancienne ne disaient rien (§5.5). Une autre est une **perte nette sur
exactement les questions que la vision produit met en tête** — où j'en suis à
date, quelle mission me rapporte quoi pour combien de temps, sur quelle
catégorie porte ma provision.

Et trois indicateurs étaient **faux**, dont deux affichaient des euros.

---

## 1. Les trois indicateurs faux — corrigés

Un chiffre faux coûte plus cher qu'un chiffre absent : il ferme la question.

### 1.1 « Reste à rentrer » de l'écran Argent

`selecteurs.ts` calculait `max(0, caRealise − caEncaisse)` sur l'année. Deux
agrégats annuels ne se soustraient pas : une facture émise en décembre et
encaissée en janvier gonfle l'encaissé d'une année sans contrepartie dans le
réalisé de la même. Sur 40 000 € réalisés, 44 000 € encaissés dont 12 000 €
venus de l'an dernier et 8 000 € qui ne sont pas rentrés, l'écran affichait
**0 €**. La borne à zéro n'était pas une protection : elle effaçait le signal.

Pire, le **même libellé** existait ailleurs, correctement calculé
(`selecteurs.facture.ts`). Deux sources pour la même notion, dont une fausse.

**Corrigé** — `encoursDe()` dans `domain/calculs/facturier.ts`, partagé par les
deux écrans. L'assiette de l'écran Argent est toutes les années : une facture
de l'an dernier reste due au 1er janvier.

### 1.2 « CA par mission »

Le rattachement donnait l'intégralité du chiffre d'affaires d'un client à la
**première** de ses missions et **zéro** aux suivantes. On lisait « 0 € » en
face d'une mission qui facturait. Les brouillons étaient comptés dans le CA.

**Corrigé** — rattachement par client **et fenêtre de dates**, ce qui sépare
correctement deux missions successives. Les missions simultanées d'un même
client, qu'aucune date ne peut départager, affichent le chiffre du client
**en le disant**.

### 1.3 « Occupation »

Le dénominateur était excellent — jours ouvrés réels, fériés calculés par le
comput grégorien, congés déduits. Le numérateur déduisait les jours travaillés
du **montant facturé ÷ TJM**, alors que le planning donne ces journées
directement. Un mois facturé au trimestre affichait **0 % d'occupation sur un
mois plein**.

**Corrigé** — jours pris du planning, ajustements compris. La division ne sert
plus que de repli, et l'écran annonce qu'il estime au lieu de mesurer.

**Suite, lot C4 : il y en avait DEUX sur le même écran.** Une tuile « Occupation »
en haut, et une autre ligne « Occupation » dans le panneau latéral — deux fois le
même mot pour deux calculs qui n'étaient pas les mêmes. La tuile est retirée. Le
panneau la garde parce qu'il a la place d'écrire son **dénominateur**
(« 18,5 / 22 j ouvrés · 2 j congé »), sans lequel « 84 % » ne se compare pas d'un
mois à l'autre, et de dire si le chiffre est une mesure lue sur le planning ou une
estimation déduite d'un montant divisé par un tarif.

Le doublon n'apparaît dans aucun des deux autres inventaires : l'écran existe,
l'action est câblée, les tests sont verts. C'est exactement la classe de défaut
pour laquelle ce document a été ouvert.

---

## 2. Inventaire des visualisations

✅ présente · ⚠️ remplacée · ❌ absente · 🚫 refusée avec motif écrit

| # | La question à laquelle elle répond | Ancienne | Maquette | Actuelle |
|---|---|---|---|---|
| V1 | CA réalisé vs encaissé, mois par mois | ✅ | ✅ | ✅ graphe propre au pilier Performance&nbsp;: **mois écoulés seulement**, valeurs en k€, mois courant encadré, cumul en pied |
| V2 | Composition d'un mois de CA, au clic | ✅ | ✅ | ✅ **livrée** — chaque mois est un `<button>`, le panneau Composition suit ; réalisé par mission avec `j × TJM`, encaissé par facture |
| V3 | Répartition du solde | ✅ donut | ✅ donut | ✅ **donut livré** (lot B) — la barre segmentée disait le partage, pas la part&nbsp;; le donut porte le disponible en son centre, la phrase explicative à côté, et chaque part son montant en clair. **Lot 49 : remplacé par la cascade** de `direction/tresorerie.html` — solde, − dû, = disponible, − réserve, = à te verser, une barre par ligne posée sur le solde — et, pour le dû, la barre de répartition de la planche (`BarreRepartition`) |
| V4 | Provisions **par catégorie** | ✅ | ✅ | ✅ **ajouté depuis** |
| V5 | Jauges de seuils | ✅ | ✅ | ✅ mieux nommées, + **repère de date ajouté depuis**. **Lot 49 : trois anneaux de la planche** (`AnneauSeuil`), avec la date de franchissement par le pipeline et les jours facturables |
| V6 | Frise de l'échéancier | ✅ | ✅ | ✅ **frise livrée** (lot B), **refaite au lot 53** d'après la maquette Obligations — une ligne par nature présente (URSSAF, TVA avec la DES, Impôt, CFE, Formalités), un signe par mois (● fait, ◇ à faire, ○ à venir, ▲ en retard ; le plus pressant quand plusieurs tombent le même mois, tous nommés dans l'infobulle), bande du mois courant, trait plein jusqu'au dernier fait, une phrase pour qui ne la voit pas. Elle précède la liste, qui porte les montants et les dates en clair |
| V7 | Courbe de solde / trésorerie | ✅ | ✅ | ✅ **Lot 49 : deux graphes alignés sur douze mois glissants** — le disponible (trois mois constatés, prévu versement tenable déduit, réserve, point bas) puis ce qui entre et ce qui sort, le dû à sa date ; la vue Année relit l'année civile. *Avant :* **graphe combiné, sur le SOLDE réel** (lot B, refait lot L1) — entrées, sorties et niveau sur un même repère, net écrit sous chaque mois. Couvre janvier à décembre de l'année CHOISIE (plus de « douze mois glissants »)&nbsp;: les mois clos tracent le solde réel en trait plein (un fait, dérivé des faits jusqu'à leur fin de mois), les mois à venir le disponible projeté en pointillés, annoncés « prévu » — jamais un solde deviné, pour la raison que l'infobulle détaille |
| V8 | Jours par mission, mois par mois | ✅ | ⚠️ | ✅ **tableau rapport / charge ajouté depuis**, trié par euro-jour |
| V9 | Capacité de versement par mois | ✅ | ✅ | ✅ **affichée** (lot 49 : dans la vue Année de la Trésorerie, restylée planche) — versé à l'intérieur de la barre de capacité, futur hachuré sans plein. Était ✅ à tort&nbsp;: voir la note sous le tableau. **Lot R** : un mois à venir où rien n'est attendu s'ABSTIENT désormais au lieu d'afficher un négatif — voir §8 |
| V10 | Cascade CA → charges → net | ✅ (deux fois) | ❌ | 🚫 §5.5 |
| V11 | Donut de destination du CA | ✅ | ❌ | 🚫 §5.5 |
| V12 | Sparklines dans les tuiles | ✅ | ❌ | 🚫 §5.5 |
| V13 | Dépendance client | ✅ | ✅ | ⚠️ barre segmentée + légende chiffrée |
| V14 | Occupation avec repère 100 % | ⚠️ | ✅ | ✅ **jauge livrée** (lot C4) dans « Le mois en chiffres », avec son dénominateur écrit dessous. La tuile qui donnait un SECOND chiffre d'occupation sur le même écran est retirée&nbsp;: §1.3 |
| V24 | **Le compte rendu d'activité, semaine par semaine** | ⚠️ liste de numéros de jours | ✅ | ✅ **livré au lot P** — Outils › CRA, atelier deux colonnes avec aperçu vivant. Par semaine&nbsp;: le rang dans le mois, la plage réellement travaillée, une ligne par client ventilée télétravail / sur site, la phrase de tâches. Puis les totaux par client et le grand total. L'ancienne rendait « 1 2 3 4 7 8 9½ 10 »&nbsp;: exact et illisible — un client qui signe veut le volume, pas un calendrier à recopier. **27/11** : ces nombres partent aussi en PDF, lus sur le même modèle que l'aperçu |
| V25 | **La facture, pendant qu'on l'écrit** | ⚠️ après émission | ✅ | ✅ **livrée au lot Q** — atelier deux colonnes, aperçu qui suit la frappe, bandeau « brouillon » tant que le numéro n'est pas attribué. Elle porte le HT, la TVA et le net à payer |
| V15 | Impôt par tranche | ✅ barres | ✅ barres | ⚠️ **tableau exact** — progrès, la barre était décorative |
| V16 | Projection par scénarios | ✅ | ❌ | 🚫 §5.5 |
| V17 | Objectif de CA avec allure attendue | ✅ | ❌ | ✅ **livrée**, absente du handoff&nbsp;: repère mensuel sur le graphe et écart en JOURS en pied |
| V18 | Autonomie à zones 3/6/12 mois | ✅ | ⚠️ | 🚫 §5.5 |
| V19 | Score de santé /100 | ✅ | ✅ (en dur) | 🚫 §5.1 |
| V20 | Calendrier / plan de charge | ✅ | ✅ | ✅ **refait** (lot C) — deux créneaux par jour au lieu d'une case, client et lieu dans chacun |
| V21 | Vue semaine par créneau | ❌ | ✅ | ✅ **livrée** (lot C2) — MATIN / APRÈS-M. nommés, client dans sa teinte, description de mission, lieu, congés hachurés |
| V22 | Vue mois par créneau | ❌ | ✅ | ✅ **livrée** (lot C3) — initiales du client, légende qui en donne la clé, lieu en coin de case |
| V23 | Répartition du TEMPS par client | ❌ | ✅ | ✅ **livrée** (lot C4) — en jours et sur le mois. Distincte de V13, qui est en euros et sur l'année&nbsp;: voir la note sous le tableau |

> **V13 et V23 mesurent deux choses, et c'est ce qui les rend utiles ensemble.**
> V23 est en JOURS et sur le MOIS — où passe le temps, maintenant. V13 est en
> EUROS et sur l'ANNÉE — le risque de perdre le client qui pèse 60 % du chiffre
> d'affaires. Elles ne coïncident pas : un client qui prend 40 % des journées
> pour 15 % du chiffre est mal tarifé, et aucune des deux ne le dit seule.
>
> Elles ont pourtant porté le MÊME TITRE pendant un temps — la carte de
> dépendance client s'appelait « Le mois en chiffres » tout en mesurant l'année.
> Deux mesures sous un titre qui n'en décrit qu'une se lisent comme une seule,
> et la contradiction apparente fait douter des deux.

> **V9 disait « ✅ » alors que rien ne s'affichait.** Le calcul existait —
> `capaciteVersement.ts` et son sélecteur, testés, verts — et aucun écran ne
> l'appelait. L'inventaire lisait le code du domaine et concluait « présent ».
>
> C'est l'erreur la plus coûteuse que puisse commettre un inventaire, parce
> qu'elle est la seule qui ferme le sujet : un manque signalé finit par être
> comblé, un manque déclaré présent ne l'est jamais. La colonne « Actuelle » ne
> se lit donc plus dans `domain/` ni dans `state/` — **elle se lit dans un
> écran**, et le contrôle qui la vérifie est la capture, pas la lecture.

---

## 3. Inventaire des indicateurs

Ne sont listés que les verdicts qui appellent une décision.

| Indicateur | Verdict |
|---|---|
| **Solde du compte** | 🟢 avec la précision « saisi, aucun relevé importé » — ni l'ancienne ni la maquette ne la donnaient |
| **Provisions** | 🟢 deux volets, plus juste que les quatre enveloppes en dur de la maquette · ventilation par catégorie **ajoutée depuis** |
| **Versable** | 🟢 une seule source, là où l'ancienne en avait trois concurrentes |
| **Déjà versé ce mois** | 🟢 **n'existe nulle part ailleurs** |
| **Autonomie (mois)** | 🟢 `null` si non renseigné, là où l'ancienne codait `2200 \|\| 500` en dur — mais elle divise le **versable**, donc exclut la réserve, et l'écran ne dit pas ce qu'il compte |
| **Reste à rentrer** | ✅ corrigé, §1.1 |
| **TJM effectif** et **TJM net** | ✅ **ajoutés depuis** — avec l'écart entre le tarif des contrats et le facturé, qui mesure ce qui se perd en remises et jours non facturés. Le net s'abstient quand le barème ne couvre pas la période |
| **Bénéfice net / marge %** | 🚫 légitime : le « bénéfice » de l'ancienne n'avait pas de définition comptable stable en micro |
| **DSO / délai de paiement** | 🟢 **médiane** et non moyenne |
| **Jours travaillés du mois, par client qui signe** | 🟢 **lot P.** Sur le document ET sur l'écran Activité. La maille est le client OPÉRATIONNEL et non la mission&nbsp;: deux donneurs d'ordre derrière une même agence signent chacun le sien |
| **Ventilation télétravail / sur site du mois** | 🟢 **lot P.** Lue sur le `lieu` des journées. Une journée sans lieu compte au total et va dans une colonne `sans lieu` — jamais rangée au hasard. Quand le mois n'en connaît aucun, les deux colonnes disparaissent au lieu d'afficher deux zéros trompeurs |
| **Valorisation du mois au TJM** | 🟢 **déplacée au lot P**, pas perdue. Elle était sur le document remis au client&nbsp;; elle est maintenant sur l'écran Activité, où elle s'adresse à l'utilisateur. Un CRA qui porte un prix se renégocie au lieu de se signer |
| **Total HT, TVA, net à payer d'une facture** | 🟢 **lot Q**, sur le document ET pendant la saisie. Les deux montants réclamés — « pour les factures j'ai besoin de voir les deux montants » |
| **Statut d'un CRA — « envoyé le », « validé », « archivé »** | ❌ **volontairement absent.** Le handoff les dessine dans sa liste « CRA récents ». Aucun des trois n'est un fait enregistré&nbsp;: un CRA n'est pas un objet du modèle, c'est une VUE du planning. La colonne montre donc les mois à documenter, avec leur volume et le nombre de documents à produire. Le jour où l'envoi sera enregistré, la date viendra s'y poser |
| **Dépendance client** | 🟢 sur le CA encaissé de l'année, bien motivé |
| **Seuils en %** | 🟢 avec le reste en euros, ce que le % seul ne dit pas |
| **Date probable de franchissement TVA** | ✅ **ajoutée depuis** |
| **Objectif de CA + allure** | ✅ **livré** (V17) — la ligne disait ❌ alors que §6 le comptait parmi les livrés&nbsp;: deux verdicts opposés dans le même document, corrigé ici |
| **Comparaison N−1 / tendance** | ❌ — utile la troisième année, pas la première |
| **TVA perdue faute de pièce** | 🟢 **n'existe nulle part ailleurs** — chiffre le coût de la négligence |
| **Écarts de conformité du livre** | 🟢 **n'existe nulle part ailleurs** |
| **Prévision de revenu du mois** | 🟢 **n'existe nulle part ailleurs** — le maillon que la vision nomme « le plus important » |
| **Jours travaillés du mois** | 🟢 **ajouté** (lot C4) — le libellé suit la SOURCE&nbsp;: « jours travaillés » quand ils sont lus sur le planning, « équivalent-jours facturés » quand ils sont déduits d'un montant. Le même titre pour les deux ferait passer une estimation pour un fait |
| **CA généré par le mois** | 🟢 **ajouté** (lot C4) — ce que le TRAVAIL du mois produit, et non ce qui est rentré sur le compte. Les deux diffèrent de tout le délai de paiement, et l'infobulle le dit |
| **Occupation du mois** | ✅ corrigé deux fois, §1.3 — désormais en jauge, avec son dénominateur écrit, et une seule fois par écran |
| **Répartition du temps par client** | 🟢 **ajouté** (lot C4) — en jours et sur le mois, distinct de la dépendance client. Voir la note du §2 |
| **CA facturé de l'année** | 🟢 **renommé** (lot J4) — le titre annonçait «&nbsp;CA réalisé&nbsp;» et la note «&nbsp;facturé, cumulé&nbsp;»&nbsp;: la note disait juste, le titre non. Or «&nbsp;réalisé&nbsp;» désigne ailleurs une TOUTE AUTRE mesure — ce que le travail du planning produit, jours retenus × tarif, que l'écran Activité nomme «&nbsp;CA généré&nbsp;». Les deux sont légitimes et ne coïncident jamais, puisqu'on facture après coup. Un utilisateur venu de l'ancienne application, qui appelait «&nbsp;CA réalisé&nbsp;» la seconde, lisait deux nombres très différents sous le même nom — et concluait à raison qu'il ne comprenait pas les données. **Une source unique par notion suppose d'abord un nom par notion** |
| **Détail d'une dette, mois par mois** | 🟢 **ajouté** (lot L) — la vignette de provision disait trois nombres&nbsp;: couvert, dû, échéance. Elle répondait à «&nbsp;est-ce que le 5 juillet va passer&nbsp;», pas à «&nbsp;d'où sort ce montant&nbsp;» ni à «&nbsp;qu'est-ce que j'ai à faire&nbsp;». Sur un dossier réel, une provision d'URSSAF est la somme de huit mois d'encaissements à des taux qui ont pu changer, plus deux appels dont un est payé — un total ne se vérifie ni ne s'agit. L'enveloppe s'ouvre désormais sur l'année, le mois, la ligne, avec son statut et le geste qui la fait avancer. **Le geste suit l'ORIGINE** : une dette estimée se déclare, une dette appelée se paie ; les confondre ferait inscrire un règlement sans appel en face. Le total du détail retombe sur celui des provisions, tenu par un test — une seconde définition de la même dette finirait par ne pas tomber d'accord avec la première |
| **Tous les chiffres du jeu de démonstration** | 🟢 **corrigés** (lot M1) — le jeu se déclarait schéma 13 et n'avait donc pas de `soldeInitialAu`, champ que la migration ne comble JAMAIS avec une date devinée. `soldeDerive` s'abstenait, et la démonstration ignorait en silence sept recettes et neuf dépenses&nbsp;: toutes les captures montraient un compte en détresse que ses propres faits contredisaient. Aucun test ne pouvait l'attraper — le calcul était juste, c'est la donnée qui mentait, et il a fallu le panneau de composition (J3) pour l'écrire en toutes lettres. Le jeu est désormais un document complet du schéma courant, daté la veille de son premier fait, et trois tests tiennent la propriété |
| **L'année lue, sur tous les écrans** | 🟢 **corrigé** (lot O1) — remonté par l'utilisateur&nbsp;: « faut que le filtre d'année soit actif sur tous les onglets, pas sur un seul ». Le sélecteur ne s'affichait que sur Argent et n'était passé qu'à lui. Il ANCRE désormais la période d'Activité, Argent, Facturer, Achats et Outils — il ne s'y ajoute pas&nbsp;: deux filtres successifs donneraient « le mois d'août, dans l'année 2025 » alors que la barre pointe sur août 2026, un ensemble vide présenté comme un résultat. Il disparaît de Pilote (poste de pilotage d'AUJOURD'HUI&nbsp;: « combien je peux me verser » n'a pas d'année) et de Config (des réglages). **Lot 6 :** il est remplacé par le navigateur de mois, présent sur le Pilote aussi — seul le flux y suit le mois. **Aucune capture ne le montre**&nbsp;: il se masque quand il n'a qu'une année à proposer, et le jeu de démonstration ne porte que 2026 — manque à porter au bilan |
| **Taux de recouvrement** | 🟢 **livré** (lot N1) — l'ancienne le montrait ; il manquait. Le facturier disait « reste à rentrer », « dont en retard », « encaissé sur la période » — trois montants dont aucun ne répond à la question qu'on se pose en les lisant&nbsp;: est-ce que c'est BEAUCOUP&nbsp;? 6 010 € en attente sur un trimestre à 8 000 € facturés est une alerte, les mêmes 6 010 € sur un trimestre à 60 000 € sont la respiration normale d'un délai de paiement. **Deux écarts assumés avec l'ancienne, et ce sont deux corrections.** (1) Le taux porte sur les MONTANTS, pas sur le nombre de factures&nbsp;: `nb payées / nb émises` donnait 50 % pour une facture de 300 € réglée et une de 12 000 € impayée, ce qui décrit une situation confortable là où 97,6 % du chiffre d'affaires manque. (2) L'assiette exclut brouillons et avoirs&nbsp;: les compter ferait baisser le taux à chaque correction d'erreur, ce qui punirait exactement le bon geste |
| **Délai d'encaissement global** | 🟢 **livré** (lot N1) — le délai par client existait depuis le lot Q, rien ne l'agrégeait. La MÉDIANE, pas la moyenne&nbsp;: trois règlements à 30 jours et un à 151 donnent une moyenne de 60, un délai auquel rien n'est jamais arrivé. La moyenne n'apparaît que lorsqu'elle s'écarte franchement de la médiane — et ce qu'elle apprend alors n'est pas un délai, c'est qu'UN dossier traîne. Le délai court depuis l'ENVOI et non depuis l'émission&nbsp;: un client ne peut pas régler une facture qu'il n'a pas reçue, et compter depuis l'émission lui imputerait les jours pendant lesquels le document a dormi dans un dossier |
| **Composition d'un chiffre de trésorerie** | 🟢 **ajouté** (lot J3) — quatre chiffres commandent toutes les décisions&nbsp;: le solde, ce qu'il faut garder de côté, le disponible, le versable. Ils s'ENCHAÎNENT — le total de l'un est un terme du suivant — et l'écran n'en montrait que les résultats. Après un import, l'utilisateur trouvait quatre nombres qu'il ne pouvait recouper ni entre eux ni contre sa banque, et disait qu'il ne comprenait pas les données&nbsp;: rien ne les expliquait. Chaque tuile s'ouvre désormais sur sa formule en toutes lettres, ses termes, ce que le chiffre veut dire, et ce qu'il tait. On remonte la chaîne jusqu'aux faits sans jamais rencontrer un nombre venu de nulle part. **L'écart entre la colonne et le total est MESURÉ, pas supposé**&nbsp;: il vaut zéro sur tous les chemins, des tests le tiennent, et s'il cessait un jour de valoir zéro l'écran le dirait avant qu'un test ne le rattrape — un total recalculé depuis les termes aurait caché la divergence en affichant un nombre qui n'est plus celui de la tuile |
| **Parts du solde du compte** | 🟢 **ajouté** (lot J3) — solde de départ, encaissements, dépenses payées, échéances réglées, net du relevé, avec le nombre de faits que chaque part recouvre. Les parts sortent de `soldeDerive` en même temps que le montant, jamais d'une copie&nbsp;: les trois règles de tri du solde — la borne de date, le sort des mouvements rapprochés, l'abstention totale sans date — sont subtiles et ont déjà produit deux bugs à elles seules. Une colonne qui en oublierait une afficherait un détail ne retombant pas sur son propre total. **La réserve du solde non daté est la première chose à lire**&nbsp;: c'est l'état de tout compte repris de l'ancienne application, et c'est ce qui produisait le solde figé pendant qu'un an d'encaissements défilait à côté |
| **Ventilation des provisions par interlocuteur** | 🟢 **ajouté** (lot J3) — le Pilote montrait déjà le découpage par VOLET (appelé / estimé). Ce que rien ne disait, c'est à QUI l'argent est dû, qui est la question qu'on se pose devant un total. Le panneau ventile par nature et renvoie à l'enveloppe pour le détail mois par mois (lot L2) |
| **Montant d'une facture : HT, TVA, TTC** | 🟢 **corrigé** (lot K) — la liste n'affichait qu'un chiffre, sans dire lequel. C'était le HT, l'assiette du chiffre d'affaires que l'URSSAF réclame&nbsp;: le bon chiffre pour déclarer, pas celui que le client vire ni celui qu'on retrouve sur le relevé. Rapprocher un virement demandait de refaire le calcul de tête, à un taux qu'aucun écran ne rappelait. Le TTC prend la tête sur la liste de suivi des règlements, le HT reste nommé juste dessous. **Zéro et inconnu ne se confondent pas**&nbsp;: une facture en franchise porte «&nbsp;sans TVA&nbsp;» et un seul montant, une facture d'avant le schéma 9 dit «&nbsp;TTC inconnu&nbsp;» plutôt que d'afficher un total inventé |
| **Écart facturé / planning** | 🟢 **ajouté** (lot I) — le brouillon du mois restait affiché à côté de la facture émise «&nbsp;pour que l'écart se voie&nbsp;». Il se voyait au sens où les deux montants étaient à l'écran, mais il fallait les soustraire de tête&nbsp;: un écart qu'on doit calculer soi-même est un écart qu'on ne remarque pas — et celui-ci se remarque d'ordinaire quand le CLIENT le remarque. Il est désormais chiffré, et son SIGNE porte le conseil, parce que les deux sens n'appellent pas le même geste&nbsp;: facturé en moins, c'est du travail qui se perd à la clôture et il reste une facture complémentaire à émettre ; facturé en plus, c'est un avoir. L'égalité se dit aussi, plutôt que de laisser un blanc que rien ne distingue d'un calcul qui n'a pas tourné |
| **Journées surengagées** | 🟢 **ajouté** (lot G) — la CAUSE d'une occupation au-dessus de 100 %, dite plutôt que devinée. Le numérateur additionne les journées par CLIENT, le dénominateur compte les jours du CALENDRIER&nbsp;: deux rythmes qui prévoient tous deux le vendredi donnent une journée et demie sur un seul vendredi. Le taux n'est pas faux — il rapporte fidèlement une donnée impossible. On ne le borne donc pas, on nomme la cause et on renvoie au geste qui la corrige |
| **Jours fériés du mois** | 🟢 **déplacé** (lot G) — il vivait dans la carte « Congés du mois », retirée avec sa seconde grille. Il explique le dénominateur&nbsp;: un férié ne se compte pas à l'œil sur une trame de trente cases |
| **Congés posés dans l'année** | 🟢 **déplacé** (lot G) — même origine. C'est le SEUL endroit où les congés se lisent sur l'année, et le mois affiché n'y répond pas. Le laisser partir avec la carte aurait été exactement le défaut que ce document existe pour attraper |
| **Part de télétravail** | 🟢 **n'existe nulle part ailleurs** (lot C4) — et **son dénominateur est l'information**. Deux demi-journées à domicile sur un mois de vingt jours donneraient « 100 % », faux et d'autant plus crédible que le chiffre est rond. La part ne porte que sur les demi-journées dont le lieu est renseigné, et la ligne écrit combien elles sont sur combien. Aucune : on s'abstient et on dit pourquoi |

---

## 4. Ce que la vision réclame et que personne n'a jamais dessiné

Ces manques ne sont ni dans l'ancienne, ni dans la maquette. **Aucun inventaire
de conformité ne les verra jamais.**

### 4.1 Ventilation des provisions par catégorie — ✅ livré

« Sur cette somme totale, combien j'ai de provision et sur quelle catégorie ».
`NatureDette` existait, chaque échéance la portait, rien ne la remontait.

Le point délicat, tenu : le volet 2 n'a **aucune échéance à qui demander sa
nature**. Il se ventile par règle de calcul — cotisations d'un côté, impôt et
contributions de l'autre — et la TVA n'y figure pas, parce qu'elle se relève
sur les factures et ne se déduit d'aucun taux.

### 4.2 « À la date d'aujourd'hui, où j'en suis » — ✅ livré

La jauge disait « 69 % du plafond ». **Excellent au 15 mars, problème au 15
novembre** : le même chiffre veut dire deux choses opposées et rien ne les
distinguait.

Deux ajouts de nature différente, non mêlés : un **repère de date** (fait de
calendrier, aucune extrapolation) et une **date probable de franchissement**
(extrapolation, hypothèse écrite, abstention sous un trimestre d'activité).

Le seuil majoré de TVA est le cas où cela compte le plus : le franchir rend la
TVA exigible **rétroactivement au 1er du mois**, sur des factures déjà émises
sans TVA.

### 4.3 « Quelle mission me rapporte quoi et me prend combien de temps » — ✅ livré

Personne n'a jamais mis les deux face à face. L'ancienne avait le rapport et la
charge dans **deux écrans différents, jamais croisés**. La maquette a les jours
par client sans le CA en face. La version actuelle a le CA sans les jours.

La matière existe désormais et n'existait pas avant : `prevision.ts` produit,
par mission, `joursRetenus` et `montantRetenu` valorisés au tarif de chaque
date.

**La bonne visualisation n'est ni un donut ni des barres empilées, c'est un
tableau trié par € par jour effectif** — on compare des ratios, pas des
proportions.

### 4.4 TJM effectif et TJM net — ✅ livré

Disparus sans motif écrit. Le TJM effectif dit si les jours non facturés, les
remises et les forfaits rognent le tarif affiché. Le TJM **net** — après
cotisations et impôt — est ce que tout indépendant sous-estime. Le noyau fiscal
sait le calculer, et la seconde tuile doit s'abstenir quand le barème ne couvre
pas la période.

### 4.5 Courbe de solde — ✅ livrée, autrement

Absente, sans motif écrit, alors que la spécification la place en tête de
l'onglet Trésorerie. Mais **la recopier serait une erreur** : projeter le solde
futur honnêtement demanderait les encaissements attendus (existe), les sorties
futures (existe) *et* le versement qu'on se fera (n'existe pas).

**Proposition mesurée** : un graphe de solde **constaté** sur 12 mois, tiré du
relevé — donc entièrement factuel — avec les échéances datées portées en aval
comme repères, **sans courbe extrapolée**.

### 4.6 Composition d'un mois au clic — ✅ livrée

Le titre de la carte de la maquette dit littéralement « clic sur un mois =
composition ». Le libellé est réfléchi, il est perdu. Faible coût, forte
valeur — avec une précaution : le `<svg>` est `aria-hidden`, donc les cibles
doivent être des `<button>` HTML au-dessus, ou les lignes du tableau.

**Livrée, et la précaution a été suivie plus loin que prévu** : il n'y a plus
de `<svg>` du tout sur ce graphe. Chaque mois est un `<button>` contenant ses
deux valeurs en TEXTE, avec un `aria-label` qui les donne en euros — sans lui,
le bouton s'annonçait « 9,4 k€ 8,0 », deux nombres abrégés sans unité ni mois.
Le tableau de rechange devient alors inutile : la donnée n'a jamais été des
pixels.

Le reste à encaisser du panneau se compte **facture par facture**. Le prototype
faisait « réalisé du mois − encaissé du mois » : sur un juin qui émet 8 000 € et
encaisse 12 000 € venus d'avril, cette soustraction rend zéro, et les 8 000 €
dus disparaissent de l'écran.

---

## 5. Jugement sur les renoncements

### 5.1 Le score /100 — le renoncement est juste, et le besoin est couvert autrement

Le motif écrit est **vérifiable** : dans la maquette, le « 78/100 » et ses
sous-scores sont littéralement écrits dans le HTML, aucune fonction ne les
produit. L'ancienne le calculait, mais avec des pondérations arbitraires — un
chiffre d'apparence officielle que personne n'a validé. **Refuser était juste.**

Mais « est-ce que ça va ? » en un coup d'œil reste sans réponse. La `SanteCard`
rend trois pastilles : c'est vrai, c'est démontrable, et c'est **trois
informations, pas une**.

**Proposition** : pas de note, une **phrase de synthèse** dérivée sans
arbitrage, avec une règle de priorité stricte et écrite — provisions non
couvertes > période déclarable en retard > impayé — la pire des trois
gouvernant le ton. C'est le coup d'œil sans inventer de pondération, et c'est
plus honnête qu'un score : ça dit *quoi*, pas *combien sur cent*.

### 5.2 `GrapheBarres` — le meilleur composant du lot

**Juste** : la donnée doublée en tableau accessible (seule version consultable
au lecteur d'écran — ni le canvas Chart.js ni la maquette ne l'avaient) ; la
dégradation des étiquettes quand elles ne tiennent pas ; `Math.max(1, …)` sur
le maximum, un graphe plat plutôt qu'un graphe faux.

**À corriger** : `preserveAspectRatio="none"` déforme les barres selon le
conteneur ; pas de cliquabilité (§4.6) ; il ne sert **qu'une fois** dans toute
l'application.

### 5.3 `Jauge` — juste sur le fond

« La barre n'est pas l'information » est le bon principe, et « il reste X € »
est ce que ni l'ancienne ni la maquette n'écrivaient. Le respect de
`Resolution<T>` est exemplaire : l'écran affiche le **motif** du refus plutôt
qu'une jauge sur un seuil inventé.

Le manque — répondre à « vais-je dépasser » et pas seulement « combien
ai-je consommé » — est **comblé** depuis (§4.2).

### 5.4 `Repartition` — la bonne réponse

Remplacer le donut par une barre segmentée est un progrès : montants en clair,
et le cas « les provisions dépassent le solde » est **dit**, alors qu'un donut
ne peut pas le représenter. Le niveau de détail manquant (§4.1) est comblé.

### 5.5 Renoncements validés sans réserve

| Renoncement | Motif |
|---|---|
| **Chart.js** (627 Ko bloquants) → SVG | Budget tenu par extraction, pas par relèvement de plafond |
| **Cascade CA → net** | En micro-BNC, « bénéfice net » n'a pas de définition comptable stable : l'abattement forfaitaire n'est pas une charge réelle. Illusion de comptabilité analytique sur un régime qui n'en a pas |
| **Donut de destination du CA** | Redisait, en moins précis, ce que `Repartition` dit du solde |
| **Projection par scénarios** | Paramétrée par « 4 / 5 / 7 semaines de congés » et un TJM de repli en dur : trois fictions habillées en analyse |
| **Barres d'impôt par tranche** → tableau | La barre était décorative, le tableau engage |
| **Barre d'autonomie à zones** | Zones arbitraires, calcul reposant sur des constantes en dur |
| **Sparklines** | Tracé de 80 px sans axe ni échelle, illisible et non accessible |

---

## 6. Reste à faire, par valeur

1. **Comparaison N−1** en filigrane du graphe existant — utile la troisième
   année, pas la première

Livrés : la composition d'un mois au clic (§4.6, V2), l'objectif de CA et son
écart en jours (V17), la capacité de versement enfin affichée (V9), la
ventilation des provisions (§4.1), le repère de date et la
projection de franchissement (§4.2), le tableau « rapport vs charge » par
mission (§4.3), le TJM effectif et le TJM net (§4.4), la phrase de synthèse
de santé (§5.1), l'assiette nommée de l'autonomie.

**Livrés au lot B** : le donut de répartition du solde (V3), la frise de
l'échéancier (V6), le graphe combiné entrées / sorties / disponible (V7).

**Refait au lot L1** : le graphe combiné (V7) montrait un défaut à trois
faces, remonté directement par l'utilisateur — peu lisible, indifférent à la
bascule d'année (toujours douze mois glissants depuis aujourd'hui, même après
le lot J2), et une courbe de DISPONIBLE assortie d'une phrase « sans rien te
verser » jugée sans intérêt. Le solde PASSÉ se dérivant désormais des faits
exactement (`domain/calculs/solde.ts`, `soldeAuDernierJourDe`), l'argument qui
interdisait de tracer un solde — deviner quand chaque dette sort du compte —
ne vaut plus que pour l'AVENIR : les mois clos tracent donc le solde réel, les
mois à venir restent une hypothèse de disponible, visuellement distincte
(pointillés, mot « prévu ») et non plus muette sur ce qu'elle suppose. Le
graphe suit `etat.annee`, de janvier à décembre ; sur une année passée, tous
les mois sont des faits. La tuile « Solde du compte », état instantané, n'en
dépend toujours pas — voir le test « ne change pas le solde du compte quand on
change l'année regardée ».

**Livré au lot J2** : le **sélecteur de période** — l'année n'est plus
verrouillée sur l'horloge. `etatArgent` reçoit désormais l'année comme un
paramètre distinct de `maintenant` (`app/src/state/selecteurs.argent.ts`),
choisie par une bascule dans la barre du haut (`SelecteurAnnee`,
`SelecteurPeriodeArgent`), bornée aux années où le dossier a un fait
(`anneesDisponibles`) — jamais à un intervalle inventé. Le 1ᵉʳ janvier ne vide
plus le pilier Performance : l'année précédente reste à un clic. Le solde du
compte, lui, n'en dépend PAS — c'est un état instantané, pas une période — et
un test nommé (`selecteurs.test.ts`, « ne change pas le solde du compte quand
on change l'année regardée ») tient explicitement cette frontière.

**Livrés au lot C** : le plan de charge à deux créneaux par jour (V20), la vue
semaine (V21), la vue mois (V22), la répartition du temps par client (V23),
l'occupation en jauge avec son dénominateur (V14), les jours travaillés et le CA
généré du mois, la part de télétravail.

**Livré au lot I** : l'écart chiffré entre ce qui a été facturé et ce que le
planning compte maintenant. Le mécanisme existait — le brouillon dérivé du même
planning que le compte rendu, laissé visible à côté de la facture émise — mais
il s'arrêtait à mettre les deux nombres côte à côte.

**Livrés au lot G** : les journées surengagées — la cause d'une occupation
au-dessus de 100 %, que rien ne disait — et le rapatriement des deux comptes
que la carte « Congés du mois » emportait avec elle en disparaissant (fériés du
mois, congés cumulés de l'année). Ce second point est précisément ce que ce
document existe pour attraper&nbsp;: l'écran est là, le magasin est câblé, les
tests sont verts, et le chiffre a disparu.

**Tranché contre la recommandation** : `preserveAspectRatio="none"` reste
(§5.2). L'attribut est délibéré — il tient la hauteur fixe qui empêche le
graphe de pousser la page en portrait, et retrouver la proportion demanderait
de mesurer le conteneur en JavaScript, ce que cet écran s'interdit. Seul
l'artefact visible est corrigé : l'arrondi des barres, qui devenait un ovale
différent d'une largeur d'écran à l'autre, est supprimé.

**À ne pas faire** : réintroduire la cascade, le donut de destination, les
scénarios, les sparklines ou le score /100 (§5.5, §5.1). Ne pas retransformer
`Repartition` en donut au motif que la maquette en montrait un : c'est le
*niveau de détail* qui manquait, pas la forme.

---

## 7. Ce que le lot P (29/08) laisse ouvert

**Livré** : V24, le générateur de compte rendu d'activité — aperçu vivant,
impression et téléchargement d'un fichier autonome, une ventilation par lieu
qui s'abstient plutôt que de deviner, et la phrase de tâches enregistrée
(schéma 17). Le montant a quitté le document client.

**Reste ouvert, et nommé plutôt que tu.**

1. **Un lieu par défaut sur le client opérationnel.** Aujourd'hui, le lieu se
   pose journée par journée. Un compte importé de l'ancienne application n'en
   a aucun, et son CRA rend donc une colonne `sans lieu` pour tout le mois —
   honnête, mais peu utile. Une mission passée par une agence a pourtant une
   convention stable, « chez ce client je suis à distance sauf mention
   contraire ». Ce serait le même motif de priorité qu'ajustement contre
   rythme&nbsp;: la journée l'emporte sur la convention. À faire avec
   `partTeletravail` du plan de charge, qui lit la même notion et doit rester
   d'accord (invariant n°4).

2. **L'envoi du CRA, enregistré comme un fait.** Il débloquerait les statuts
   du handoff, qui sont aujourd'hui hors de portée faute de donnée.

3. ~~**Le paquet d'entrée est à 79,94 Ko pour un plafond de 80.**~~ ✅ **Traité
   au lot Q**, et pas volontairement&nbsp;: le budget a DÉPASSÉ (80,12 Ko) sur
   l'ajout d'une seule action rapide, ce qui a rendu l'extraction obligatoire.
   Cinq écritures ont quitté le magasin pour `state/ecritures.carnet` — celles
   du carnet et du relevé, dont les gardes emportaient `calculs/carnet` et
   `calculs/banque` dans le premier rendu pour des écrans chargés à la demande.
   **77,09 Ko**, soit près de 3 Ko de marge retrouvés.

   Deux choses ont été refusées au passage. Déplacer les GARDES dans les
   écrans aurait rapporté les mêmes octets&nbsp;: c'eût été échanger un
   invariant contre un budget — un second point d'entrée aurait accepté deux
   clients homonymes, dont le nom sert justement de clé de rattachement. Et
   ouvrir un second magasin aurait donné deux copies des faits, qui divergent
   à la première écriture. Les écritures déplacées lisent donc le même état et
   passent par `ecrireFaits`, seule porte vers le disque.

   `verifier-cablage` a été étendu aux modules d'écriture : sans cela, un
   simple déplacement de fichier aurait fait sortir cinq écritures du contrôle
   — exactement le mécanisme que ce script existe pour empêcher.

---

## 8. Lot R — les graphes de l'écran Argent

### 8.1 Six mois à « −0,1 k€ » n'étaient pas un diagnostic

Le contrôle visuel montrait la fin d'année entière en négatif sur le plan de
capacité : SEP, OCT, NOV, DÉC, tous à `−0,1 k€`. Aucun de ces mois n'attendait
quoi que ce soit ; le nombre ne venait que de dépenses projetées. Quatre
colonnes rouges d'affilée se lisent **« le reste de mon année est dans le
rouge »** — une conclusion que rien ne soutient.

`capaciteDuMois` s'abstient maintenant sur un mois **à venir** dont l'encaissé
attendu est nul, et sa colonne porte un tiret avec son motif. Trois
distinctions ont été tenues, et chacune compte :

* sur un mois **vécu**, la même valeur négative reste juste — le mois n'a rien
  encaissé et un abonnement est parti, c'est son seul signal utile ;
* un mois **à venir qui attend un encaissement** garde sa capacité, négative
  comprise : elle repose alors sur quelque chose ;
* le **mois courant** est constaté, pas projeté : il ne s'abstient jamais.

La colonne reste **en place** : la retirer décalerait les onze autres et
personne ne verrait le trou.

### 8.2 Le motif ne se lisait qu'à la souris

La colonne refusée portait son motif dans un `title` — une infobulle de survol,
que rien n'annonce à qui écoute la page et que personne n'atteint au doigt. Le
tiret disait « — » et rien d'autre. Le motif est désormais du texte.

### 8.3 Les barres, mesurées sur le handoff plutôt qu'estimées

Les valeurs ont été **relevées dans la feuille du handoff**, pas approchées à
l'œil :

| | avant | handoff, donc maintenant |
|---|---|---|
| barre de série | 11 px, rayon 2 px | **14 px, rayon 4 px** (`.cabars .grp i`) |
| barre de capacité | 22 px, rayon 2 px | **30 px max, rayon 6 px** (`.capbars .track`) |
| écart entre deux séries | 3 px | **4 px** |
| écart entre deux mois | 2 px | **12 px** |
| hauteur de la bande | 175 px | **200 px** (`.cabars`) |

Un écart au handoff est assumé : son `min-height: 4px` donne un moignon même à
zéro. Un mois sans chiffre d'affaires afficherait une barre minuscule, qui se
lit « un petit peu » plutôt que « rien ». L'étiquette dit déjà « 0 » ; le tracé
se tait.

### 8.4 Ce qui n'a PAS été touché, et pourquoi

**Le graphe de trésorerie garde ses mois projetés à `−100 €`.** Le défaut a
l'air identique à celui du §8.1 — quatre mois d'affilée en petit négatif — et
il ne l'est pas. Ici le nombre est une **projection déclarée** : la carte « Où
va ton disponible » écrit la règle en toutes lettres, « dépenses courantes :
100 € par mois, moyenne des six derniers mois », et chaque colonne porte le
mot « prévu ». Une hypothèse annoncée et sourcée n'est pas un artefact de
formule. La corriger reviendrait à masquer une prévision juste.

**Le vide sous le graphe de CA reste.** La carte de composition est plus haute
que celle du graphe, et le rang laisse donc du fond de page en dessous.
`align-items: stretch` a été essayé, mesuré et repoussé — le vide passe alors
*à l'intérieur* de la carte, au-dessus des barres, et se lit comme un graphe
qui n'a pas fini de charger. L'étirer vraiment demanderait que la bande cesse
d'avoir une hauteur fixe, donc que la ligne d'objectif ne puisse plus se poser
sur la même échelle sans mesurer le conteneur en JavaScript. Un repère faux
coûte plus cher qu'un vide.

## Lot 2 (07/11) — un chiffre, une source

Six nombres lus à l'écran changent de valeur ou de sens. Chacun est tenu par
un test nommé, prouvé par mutation.

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Provision d'impôt sur le revenu | Argent → enveloppes, versable | Repartait de zéro le 1er janvier | Garde le solde estimé de l'année écoulée jusqu'à la saisie de l'avis (« Solde de l'impôt N ») |
| Impôt de l'activité | Provision et comparateur VL | Prorata au taux moyen dans la provision, surcroît dans le comparateur | Surcroît (taux marginal) partout, une seule fonction — décision du propriétaire |
| Enveloppe URSSAF / impôt | Argent → enveloppes, donut | CFP (0,2 %) rangée en impôt | CFP dans sa propre enveloppe ; URSSAF + CFP = ce que demande la déclaration |
| « N périodes à déclarer » | Pilote, Santé, échéancier | Pilote : périodes à zéro comprises ; échéancier : seulement avec encaissement | Une seule règle ; l'échéancier dit « à déclarer à zéro » |
| « N à traiter » | Barre du haut | Somme des quantités (« 5 ») | Nombre de sujets (« 2 »), comme la salutation et les badges |
| TJM net, capacité de versement | Activité, Argent → performance | « net de cotisations et impôt » | « avant impôt sur le revenu » au barème |

**Non fait, reporté au lot 7** : le même montant s'affiche encore en k€ avec
deux arrondis différents entre Trésorerie et Performance (`enKiloEuros`).

## Lot 3 (07/11) — TVA franchie en cours d'année, décote

Six nombres lus à l'écran changent de valeur ou de sens. Chacun est tenu par
un test nommé, prouvé par mutation.

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Solde du compte | Pilote, Argent | Hors taxe : sur une facture de 1 000 € HT payée 1 200 €, il manquait 200 € | Ce que le client a versé, TVA comprise |
| Provision de TVA | Argent → enveloppes, versable | Rien entre l'encaissement et la saisie de l'appel ; le reversement retranchait une seconde fois | La TVA collectée non encore appelée est gardée de côté ; encaisser puis reverser ne fait plus varier le versable |
| Mois de passage à la TVA | Réglages → Profil, factures, dépenses | Deux sources : la date calculée s'affichait, les factures lisaient la saisie restée vide | Une seule (`debutTvaEffectif`) |
| « Factures à régulariser » | Barre du haut, Pilote | — | Nombre de factures émises sans TVA depuis le franchissement |
| TVA collectée du trimestre | Argent → dossier de TVA | Avoirs écartés : la TVA d'une facture annulée ne revenait jamais | L'avoir compte au trimestre de l'avoir, au signe opposé |
| Impôt de l'activité | Provision d'impôt, comparateur VL | Sans décote | Décote du barème 2024 (889 € / 1 470 €, 45,25 %) ; situation inconnue → la moins favorable, dite à l'écran quand elle change le montant |

**À savoir** : la décote ne fait pas toujours baisser l'impôt de l'activité.
Pour un foyer déjà dans la zone où elle s'éteint, chaque euro d'impôt brut en
retire 45,25 centimes : une part, 20 000 € d'autres revenus, 6 000 €
imposables — 660 € au barème seul, 958,65 € avec la décote.

## Lot 4 (07/11) — jeu d'essai, démonstration

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Provision de TVA | Argent → enveloppes, versable | Gardait la TVA déductible déjà nettée par l'échéance de TVA (1 300 € au lieu de 1 140 sur le jeu d'essai) | Collectée − déductible − échéances : égale au dossier du trimestre (test nommé) |
| « N à traiter » | Barre du haut, Pilote | +1 « en retard » permanent depuis le 1er septembre 2026 (facturation électronique) | « en vigueur depuis N jours », à faire, pendant un mois |
| Tous les nombres du jeu de démonstration | Captures, démo chargée | 4 périodes en retard, versable 140 €, 0,1 mois d'autonomie au 10 juin | Aucune période en retard, versable 7 556 €, 3,3 mois ; provisions 1 970 € (l'URSSAF T2 du handoff : 1 980 €) |

**Filet** : `src/integration/` parcourt toutes les sorties d'écran du jeu
d'essai à sept dates et refuse tout NaN ou Infinity ; il vérifie aussi que le
Pilote et l'échéancier comptent les mêmes périodes, et que le versable vaut
solde − provisions − réserve.

## Lot 5 (07/11) — le Pilote du handoff

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Versable | Pilote | Deux fois : carte « Je peux me verser » et colonne Rémunération | Une fois, colonne Rémunération, cliquable vers sa composition |
| Solde, À garder, Disponible, Seuil | Pilote | Quatre tuiles, doublons de l'en-tête d'Argent | Retirées du Pilote (Argent, à un clic) ; le solde reste dans la pastille de l'en-tête |
| « Ce que je dois » | Pilote | Carte à part | La colonne Sorties : payé · à venir, une ligne par échéance et une pour les charges à provisionner |
| Constat « Factures » | Pilote → Santé | Factures EN ATTENTE (une facture à trente jours y passait pour un problème) | Factures EN RETARD |
| « N périodes à déclarer » | Pilote, échéancier | « En retard » dès la clôture | « À faire » jusqu'à la date limite, avec base et montant à payer |
| Phrase de santé | Pilote | Trois rangs (provisions, déclarations, factures) | Cinq rangs écrits, régime et déclaration à faire compris |


## Lot 6 (07/11) — barre du haut et rail

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Le mois lu | Barre du haut, tous les écrans | Une année au sélecteur (absent du Pilote), un mois propre à Activité | « ‹ juin 2026 › » en tête de barre, un seul mois ; l'année à côté n'en change que le millésime |
| Le flux du mois | Pilote | Toujours le mois courant | Suit le mois de la barre. Mois courant : inchangé. Mois passé : encaissé, attendu et toujours impayé, échéances payées / impayées, **versé au relevé** (« — » sans relevé, jamais 0 €). Mois à venir : factures attendues à leur échéance, échéances dues, **aucun versable** — le versable du jour sous « mai 2026 » serait un montant qu'on ne pouvait pas se verser |
| Santé, décisions du jour | Pilote | Aujourd'hui | Toujours aujourd'hui, quel que soit le mois de la barre — tenu par un test |
| Compteur « à traiter » de « Facturer » | Rail | Sur l'entrée « Facturer » | Additionné sur « Activité », où vit la liste des factures |
| Montant d'une facture, d'une dépense | Recherche ⌘K | — | Au centime ; « 1200 » retrouve 1 200,50 € |
| Livre des recettes | Export CSV | — | Montants à virgule décimale, annulations en nombres négatifs, TVA inconnue laissée VIDE (pas « 0,00 ») |

## Lot 7 (07/11) — finitions

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| TVA à autoliquider | Achats | Tirée d'un TTC : 16,67 € pour 100 € facturés par un prestataire de l'UE | Base × 20 % : 20 € (art. 283-2 du CGI) |
| Cotisations sous ACRE | Provisions, versable, Argent | 50 % du taux, quelle que soit la date de création | 50 % pour un début avant le 01/07/2026, 75 % à partir de cette date (décret 2026-69) |
| Impôt de l'activité 2026 | Provisions, comparateur | Hypothèse sur le barème des revenus 2024 | Hypothèse sur le barème des revenus 2025, publié (tranches et décote) |
| Plafond du micro | Argent, « à traiter » | Plafond plein l'année de création | Proratisé aux jours d'activité (203 100 × 335 / 365 = 186 407 €) |
| Parts des provisions | Argent → enveloppes, composition | Arrondies une à une : 1 à 2 centimes d'écart avec le total | Retombent exactement sur le total |
| Montants en k€ | Graphes d'Argent | Deux arrondis (« 11 k€ » pour douze mois entre 10 500 et 11 400 €) | Une décimale partout au-delà de 1 000 € |
| Jours de retard | Facturier, relances, DES, rapprochement, « à traiter » | Six calculs ; une date illisible donnait « 0 jour » de retard au facturier | Un seul, en UTC ; une date illisible ne passe plus pour « pas de retard » |

## Lot 8 (07/11) — Achats

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Dépenses de la période | Achats | Total TTC de toute la période « Tout » | Total TTC du mois de la barre, et le nombre d'achats |
| TVA déductible | Achats | « TVA récupérable » | Même nombre, avec la part perdue faute de pièce en sous-ligne |
| À rapprocher | Achats | Seulement dans l'onglet Relevé | Opérations sans dépense + dépenses en attente de leur opération |
| Justificatifs manquants | Achats | Dans le sous-titre | Tuile ; compte les pièces absentes, même sans TVA en jeu (franchise) |
| Dépenses récurrentes | Achats → registre | — | Total des dépenses récurrentes de la période (dérivé) |

## Lot 9 (08/11) — Réglages

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Fin de l'exonération ACRE | Réglages → Profil (sous l'interrupteur, et la fenêtre d'ACRE) | « 31/{mois} » écrit en dur : « 31/09/2026 », « 31/06/2027 » — des dates qui n'existent pas | Le vrai dernier jour du trimestre (`finDuMois`) : 30/09, 30/06 |
| Taux d'exonération ACRE | Réglages → Profil | Dans une bulle | Sous l'interrupteur : 50 % ou 25 % selon la date de création |
| Taux du versement libératoire | Réglages → Profil | Dans une bulle | Sous l'interrupteur, lu dans le barème du mois |
| Abattement, taux de cotisations (plein → avec ACRE), versement libératoire, CFP, plafond du micro (proratisé l'année de création), seuil de franchise de TVA | Réglages → Paramètres fiscaux, « Barèmes {année} en vigueur » | Absents : seule la table des cotisations par période se lisait | Six valeurs en lecture seule, relues dans les fonctions mêmes des calculs ; un refus s'écrit « — » avec son motif, jamais 0 % ; « vérifiés le » tiré du barème |
| Contenu d'une sauvegarde | Réglages → Données | Tableau de comptes (recettes, dépenses, missions, clients, périodes) | Les mêmes comptes, dans la ligne « Sauvegarde complète (JSON) » |
| Livre des recettes | Réglages → Données | Seulement dans le menu « Exporter » | Ligne « Livre des recettes (CSV) », année au choix dès qu'il y en a deux |

## Lot 10 (08/11) — justificatifs

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Justificatifs conservés, et leur poids | Réglages → Données, ligne de l'archive | — | « tes 12 justificatifs (3,4 Mo) » ; se tait si IndexedDB ne se lit pas, plutôt que d'annoncer zéro |
| Justificatifs pas encore archivés | Données, Achats | — | Pièces déposées après la dernière archive faite DANS CE NAVIGATEUR (toutes s'il n'y en a jamais eu) |
| Date de la dernière archive | Données | — | Date courte ; fait d'environnement, hors des faits |
| Pièces altérées, illisibles, sans fait | Données, après l'archive ; manifeste | — | Comptées et nommées ; jamais retirées en silence |
| Contenu d'une archive à restaurer | Confirmation | Recettes, dépenses, missions, clients | + justificatifs, date de l'archive, pièces d'ici qui seraient détachées |
| Pièces restaurées | Message après restauration | — | « N pièce(s) ajoutée(s), M déjà présente(s) », et la liste des refus avec leur motif |

## Lot 11 (08/11) — règles d'accès

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Lignes lisibles sans connexion, par table | Compte & synchronisation | — | Compté par le serveur (`Content-Range`), jamais lu ; un total absent ou une requête refusée s'affiche « vérification impossible », jamais 0 |

## Lot 12 (09/11) — l'impôt au taux de l'année

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Impôt sur le revenu à mettre de côté | Versable du Pilote, composition, Argent | Impôt calculé sur l'encaissé seul — un plancher, faux dès qu'une tranche est franchie (cas fictif : 413 € au 30 juin pour 30 000 € encaissés) | Impôt de l'année projetée × part encaissée − acomptes (≈ 2 520 € sur le même cas) ; `hypothese` dès que le pipeline contribue |
| Impôt estimé de l'année, chiffre d'affaires projeté, taux moyen | Argent → hypothèses | « X € estimés sur la part micro », « soit Y € par mois » | Les trois nommés, et ce qui restera à mettre de côté sur les encaissements à venir |
| Pastilles du rail, indicateur « à traiter », décisions du Pilote | Partout | Calculés au premier rendu | Calculés à la demande : absents un instant, jamais « 0 » |

## Lot 13 (09/11) — ce qui est dû

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| TVA à reverser (provision) | Versable, enveloppes, composition, dette | Collectée − déductible − réglée | + TVA autoliquidée des achats de services dans l'Union payés EN FRANCHISE (hypothèse, sans date de dépôt) ; chez un redevable elle s'annule et n'ajoute rien |
| « dont TVA autoliquidée » | Détail de l'enveloppe TVA | — | Plafonnée à ce qui reste provisionné |
| Impôt sur le revenu à mettre de côté | Détail de la dette « impôt » | Absent : seul le taux sur les encaissements y figurait | Au même chiffre que le versable |

## Lot 15 (11/11) — dossier de TVA

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| TVA autoliquidée à déclarer (base, TVA due) | Argent → Préparer ma déclaration de TVA | Absente | Ligne A3 pour les achats de l'Union ; totaux à part pour les achats hors Union (ligne à confirmer) |
| Solde à payer du dossier | Même panneau | Collectée − déductible | + autoliquidée due − autoliquidée déductible : inchangé chez un redevable, + la TVA due en franchise ; égal à la provision TVA |


## Lot 16 (11/11) — pointer un encaissement

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Reste à encaisser (nombre de factures, total) | Pilote → panneau Encaissements | — | Factures émises, non réglées, non annulées ; le même total que « en attente » du flux (source unique `facturesAEncaisser`) ; TTC attendu sur le compte précisé quand les factures portent une TVA connue |
| « en attente » et lignes d'entrées du flux | Pilote, flux d'un autre mois | Une facture annulée par un avoir et son écriture d'annulation y figuraient toutes deux (le total retombait juste, les lignes montraient le client deux fois, dont une en négatif) | Ni l'une ni l'autre ; total inchangé |
| Factures en attente du livre des recettes | Argent → Livre des recettes | La facture annulée et son avoir négatif y figuraient | Même liste que le flux et le panneau |
| Montant d'une ligne du panneau | Panneau Encaissements | — | TTC quand la facture porte une TVA (ce qu'on lit sur le relevé), HT en dessous ; HT seul sinon |

## Lot 17 (11/11) — pointer une échéance payée

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Lignes de la colonne Sorties | Pilote › Le flux du mois | Les échéances du mois seulement : un appel du mois dernier impayé disparaissait de la liste (le total des provisions le comptait toujours) | Payées du mois, puis tout ce qui reste à payer jusqu'à la fin du mois, retards compris, « en retard » |
| Reste à payer ce mois-ci (nombre, total), autres plus tard | Pilote → panneau Sorties | — | Échéances non payées jusqu'à la fin du mois ; le reste compté à part (source unique `echeancesAPayer`) |

## Lot 18 (11/11) — lignes d'une facture

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Quantités, prix unitaires, totaux par taux d'une facture rééditée | Facturier › Revoir la facture | Une ligne « 1 × total » ; refus à deux taux | Les lignes émises ; refus si elles ne retombent pas sur le montant et la TVA du livre |
| TVA des factures émises depuis le brouillon du mois en franchise | Dossier de TVA, facturier | « inconnue » (non portée) | Zéro, connue |

## Lot 19 (11/11) — brouillon du mois

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Jours et prix journalier préremplis | Nouvelle facture, depuis le brouillon | — | Une ligne par mission, recalculée depuis le planning (jours fériés exclus) |

## Lot 20 (11/11) — TVA par taux

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Base et TVA collectée, par taux | Argent → Préparer ma déclaration de TVA | — (total seulement) | Par taux, avoirs déduits au signe opposé ; les pièces sans ventilation lisible comptent au total de TVA, pas au tableau |

## Lot 21 (11/11) — relevé

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Opérations qui partiraient, dont rapprochées ou pointées | Achats › Relevé, confirmation d'effacement | — | Compté sur le relevé au moment de confirmer |

## Lot 22 (11/11) — confirmations

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Montant de l'avoir (TTC et HT quand il y a une TVA) et date du remboursement | Activité › Factures, Argent › Livre, confirmation | — | Lu sur la facture, au jour de la confirmation |
| Montant de la dépense supprimée | Achats › détail, confirmation | — | Au centime, comme la fiche (l'arrondi à l'euro disait 36 € pour 35,98 €) |
| Paiement oublié (date, montant réellement débité) | Argent › Échéances, « Repasser à payer » | — | Lu sur l'échéance |
| Journées dont les corrections partent | Activité › Semaine, « Revenir au rythme » | — | Comptées sur la semaine affichée |
| TVA qui cesse d'être récupérable | Achats › détail, « Détacher » | — | Lue sur la dépense (au centime) |
| « À rapprocher » (tuile et file du relevé) | Achats | Sous-comptait le mouvement d'une dépense supprimée, resté « Rapprochée » | Le mouvement y revient |

## Lot 24 (11/11) — bascule

Aucun nombre lu ne change : le lot déplace les deux versions sans toucher à
leurs calculs.

## Lot 25 (11/11) — compte

Aucun nombre lu ne change.

## Lot 26 (12/11) — accueil

Aucun nombre lu ne change.

## Lot 27 (12/11) — impôt sur le revenu

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Encaissé, impôt du mois, acomptes prélevés, à garder fin de mois — de janvier au mois courant | Argent › Provisions, pli « L'impôt AAAA, mois par mois » | — (le total seul) | `repartitionMensuelleImpot` : la règle du total (impôt de l'année projetée × part encaissée), cumul arrondi une fois ; le dernier mois = provision du jour + acomptes appelés non prélevés, tenu par un test |
| Montant et date de chaque prélèvement du solde estimé de l'an passé | Argent › Échéancier, frise — depuis le lot 53, Obligations : une ligne « ≈ » par prélèvement, et la ligne Impôt de la frise | — | Le solde estimé (`soldeImpotPrecedentDe`) découpé par `prelevementsDuSolde` ; la somme retombe au centime sur l'estimation, tenu par un test. Affichage seul : la provision le compte déjà, une fois |
| Nombre, dates et montants des prélèvements d'un avis | Saisir une échéance › Impôt › solde, aperçu | — | `prelevementsDuSolde` : 1 (≤ 300 €), 4 ou 2 (avis tardif) ; parts égales au centime, le reste au dernier. Dates 2026 relevées (`publie`) ; autre année : le 25 ou le jour ouvré suivant (`hypothese`, dit à l'écran) |
| Acomptes retranchés de la provision de l'année | Argent › note d'impôt | Inchangé (par exercice depuis le lot L4) | Inchangé — désormais traversé par le test du cas « première année puis automne suivant » |


## Lot 28 (13/11) — déclaration datée, opération ignorée

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Solde du compte (et tout ce qui en descend : versable, autonomie, composition) | Pilote, Argent | Une opération écartée ne pouvait être que « sans contrepartie » (motif `autre`) et **comptait** : 5 000 € virés sur un livret baissaient le solde de 5 000 € | Une opération **ignorée** ne compte dans aucun total, que le solde de départ soit daté ou non (le relevé seul la reprenait aussi : corrigé avant livraison). Tenu par trois tests nommés et deux mutations |
| Provenance du solde (« rapproché » / « dérivé ») | Pilote, Argent | Une ligne écartée restait « à traiter » ou faussement pointée | Ignorée, elle est classée : elle ne retient plus le solde dans l'état « dérivé » |
| Opérations, rapprochées, à trancher, sans candidat | Achats › Relevé, tuiles | — | Inchangées dans leur forme ; une ignorée sort de « à trancher » et de « sans candidat ». Le résumé du relevé ajoute « N ignorée(s) » |
| « À rapprocher » | Achats, compteur | Comptait une ligne qu'on voulait seulement écarter | Ne la compte plus (`estATraiter`, source unique) |
| Date de déclaration d'une période | Argent › Échéancier, Périodes URSSAF — depuis le lot 53, le dossier URSSAF d'Obligations, avec l'avance sur la limite | « Déclarée », sans date : une déclaration en retard se lisait comme une à l'heure | « Déclarée le … » (champ de date, vide si inconnue — toute période cochée avant le schéma 21) puis « payée le … » / « à payer avant le … » / « à payer depuis le … » lus sur l'appel de la période. La date ne s'invente jamais |

Le retard lui-même (« deux jours après la limite ») n'est pas encore dit : la
maquette Obligations le montre, il revient au lot 53.

## Lot 56 (14/11) — la chaîne qui publie

Aucun nombre lu ne change : le lot touche la chaîne de construction et
l'outillage de test (vitest 3 → 4), pas le code servi. Les 2 627 tests passent
à l'identique.

## Lot 57 (14/11) — le compte garde la mémoire

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Date et numéro d'enregistrement d'un état précédent | Config › Compte, « États précédents du compte » | — | Heure du **serveur** au remplacement (jamais l'horloge d'un appareil) ; numéro = compteur d'écritures que portait l'état. 20 au plus |

Aucun chiffre du dossier ne change.

## Lot 29 (14/11) — « Enregistrer en brouillon »

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Numéro d'un brouillon | Factures, filtre « Brouillons » ; rédaction | Le numéro suivant, réservé dès la création | « Sans numéro » : il naît à l'émission. Un brouillon numéroté avant le lot garde le sien |
| Numéro de la facture suivante | Rédaction, en-tête et document | Comptait les brouillons numérotés | Inchangé dans son calcul ; les nouveaux brouillons n'y pèsent plus |

## Lot 46 (14/11) — facture conforme 2026-2027

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| SIREN du client | Document de facture | — (SIRET seul) | Dérivé du SIRET, contrôlé par la clé de Luhn ; absent s'il ne se contrôle pas — et l'émission est alors bloquée |
| Référence de commande | Document de facture, rédaction | — | Celle de la mission (plusieurs missions : toutes), figée sur la recette |

Aucun montant ne change.

## Lot 33 (14/11) — « Reste à sortir » : un seul total

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Reste à sortir, impôt | Argent › enveloppe « Impôt », détail | Lignes × taux complet (CFP comprise), impôt sur le revenu « en plus des lignes » : un autre chiffre que la vignette | Le total de la vignette ; lignes au taux hors CFP ; l'impôt sur le revenu de l'année « dont », compris |
| Reste à sortir, TVA | Détail « TVA » | Appels seuls | + « dont TVA collectée, pas encore déclarée » |
| Reste à sortir, CFP | Détail « CFP » | 0 € (appels seuls) | Estimée mois par mois, comme la vignette |
| Reste à sortir, URSSAF et CFE | Détails | Déjà d'accord | Inchangé, désormais lu de la source |
| Écart entre le total et les lignes | Détail | — | Affiché s'il dépasse un centime (faute de calcul, jamais absorbée) |

## Lot 35 (15/11) — mis de côté pour l'impôt (décision 17)

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Solde du compte (et versable, autonomie, composition, évolution) | Pilote, Argent | Un acompte d'impôt saisi payé était retranché, même prélevé sur le compte personnel avec l'argent d'un virement déjà retranché : deux fois la même somme | Un exercice qui porte un virement « mis de côté pour l'impôt » est réglé depuis le compte personnel : ses échéances d'impôt ne sortent plus du compte pro |
| Provision d'impôt sur le revenu | Pilote, Argent, détail « Impôt » | Réduite des acomptes saisis | Réduite de ce qui a été viré pour l'exercice, quand il y en a ; des acomptes sinon. Jamais des deux |
| « Déjà versé » | Pilote, Rémunération | Rémunérations seules | Inchangé : un virement « impôt » n'en est pas une |
| À mettre de côté pour l'impôt | Pilote, Rémunération | — | La provision d'impôt restante (barème ; rien sous versement libératoire) |

## Lot 58 (15/11) — aucun nombre touché

Lot de sécurité sur la page et la copie publiée de l'ancienne version : aucun
sélecteur, aucun calcul, aucun nombre lu à l'écran ne change.

## Lot 59 (15/11) — aucun nombre touché

Lot de sécurité : aucun sélecteur ni aucun nombre lu à l'écran ne change. Un
relevé dont une ligne porte un montant démesuré écarte cette ligne, et le
compte rendu d'import le dit.

## Lot 51 (en cours, 15/11) — les couleurs des charges

Aucun nombre ne change. Les teintes qui les distinguent, si : impôt, URSSAF,
TVA et CFE prennent celles de la direction visuelle, distinctes pour un
lecteur daltonien (l'URSSAF n'emprunte plus l'ambre « à surveiller », ni la
TVA le bleu générique). Partout où une charge a sa couleur — enveloppes de
Trésorerie, frise et liste de l'échéancier, anneau de composition — et dans
les quatre thèmes. Relu sur capture à 390 px, clair et sombre.

## Lot 31 (16/11) — les brouillons de facture du mois

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Montant du brouillon du mois | Factures, Pilote | Un brouillon par payeur de mission, tous clients confondus | Inchangé en « facture commune » (par défaut) ; en « une par client », un brouillon par client et par payeur, dont la somme égale le brouillon commun (tenu par un essai) |
| Jours d'un client arrêté | Planning, CRA, brouillon | Comptés jusqu'à la fin de la mission | Plus aucun après la date d'arrêt |
| Jours repris de l'ancienne version | Planning, CRA | Tous au premier client, double comptage possible | Jour par jour, à chaque client ; la vérification d'absence de perte compare mois par mois |

## Lot 51, phase 2 (16/11) — des nombres qui changent d'écran

Aucun calcul ne change ; des nombres déménagent, et un s'ajoute.

| Nombre lu | Avant | Après |
|---|---|---|
| CA facturé, encaissé, à encaisser, résultat projeté ; graphe facturé / encaissé ; composition du mois ; dépendance client | Argent › Performance | Activité › Analyse, pour l'année choisie dans l'en-tête de l'onglet (tenu par un essai : l'année choisie, pas celle de l'horloge) |
| « Tu peux te verser », part gardée, capacité de versement par mois | Argent › Performance | Trésorerie |
| Frise de l'échéancier, reste à payer, périodes URSSAF | Argent › Échéancier | Obligations (refaite au lot 53 : frise, liste unique, dossiers) |
| Opérations du relevé, opérations à rapprocher | Achats › Relevé | Trésorerie › Banque : « N opérations au relevé, toutes traitées » ou « · N à rapprocher », compté à l'affichage |
| Compteurs du rail | Argent, Activité | Factures (factures en retard, TVA à régulariser), Obligations (échéances, périodes à déclarer, livre incomplet), Trésorerie (seuils), Réglages (barème à vérifier) |

## Lot 51, les cinq mots (16/11) — des nombres renommés

Aucun calcul ne change ; un nombre ne porte plus qu'un nom, et un nom ne
désigne plus qu'un nombre.

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Le dû du jour (charges des échéances et des encaissements non déclarés) | Flux du Pilote, mois passés, détail | « Sorties » — ce ne sont pas des sorties, rien n'est encore sorti | « Dû » ; le détail s'intitule « Ce qui est dû » |
| Le dû | Santé, anneau et enveloppes de la Trésorerie | « 2 350 € dus » | « dû 2 350 € » |
| La capacité de versement mensuelle sur un an | Trésorerie, projection | « Tu peux te verser 1 643 € par mois » — un second « tu peux te verser », pour un autre montant | « Versement tenable : 1 643 € par mois » |
| À te verser moins la part gardée | Trésorerie, carte « Tu peux te verser » | Même nom que disponible − réserve ; égal à lui seulement si la part gardée vaut 0 % (cas de la démo) | Inchangé ici ; la part gardée se fond dans la réserve au lot 49 (décision 24), et ce second montant disparaît |

## Lot 53, phase 2 (17/11) — une source pour ce qui est à faire

Les obligations deviennent une source (`obligationsEntre`), et « à traiter »
la lit. Aucun écran n'est redessiné ; des nombres lus changent de sens ou
s'ajoutent. Chacun est tenu par un test nommé, prouvé par mutation.

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Pastille d'Obligations | Rail | Un par sujet, information comprise : quatre périodes à déclarer pesaient 1, une CFE à soixante jours aussi | Une par **obligation à traiter** (étape à faire ou en retard) plus les autres sujets de l'écran (livre incomplet, aucune échéance) ; l'information ne compte plus. Le titre d'Obligations lira la même fonction (`nombreAFaire`) — test d'accord sur la démonstration et le jeu d'essai |
| Sujets « à traiter » | Pilote, rail | Périodes URSSAF, DES en retard, CFE sans avis, 1447-C, facturation électronique | S'ajoutent, quand ils sont à faire : la DES du mois écoulé avant sa limite, la CA3 ou la CA12 d'un redevable, la TVA autoliquidée d'un franchisé (CA3 du mois suivant), la déclaration de revenus (à partir de 2027), l'appel URSSAF ou l'avis de CFE à payer, la pièce à renouveler. Ce que l'application ne savait pas noter avant le 17/11 n'est pas « en retard » |
| Contexte d'une échéance réglementaire | Pilote | « Dans N jours » toujours | Rien quand le jour n'est pas connu (CA3 sans nom : « Indique ton nom… ») |
| Limite d'une déclaration | Pilote | « avant le 1 juin » | « avant le 1ᵉʳ juin » |
| Nombre de déclarations conservées | Réglages › Données | « N périodes déclarées », DES déposées comprises | « N déclarations » |
| DES en retard | Pilote, panneau DES | Pilote : fenêtre en jours depuis la limite | Les vingt-quatre mois qui précèdent le mois courant, comme le panneau : la même amende des deux côtés |

**Pas encore à l'écran** (phase 3) : l'avance sur la limite, les cases 5TE /
5HQ, les états des pièces, le calendrier `.ics` — calculés et testés, sans
lecteur visible. *Tous à l'écran depuis la phase 3, ci-dessous.*

## Lot 53, phase 3 (20/11) — l'écran Obligations

L'écran est refait d'après les deux maquettes validées. « Échéances reçues »
et « Périodes URSSAF » partent ; chacun de leurs nombres se lit ailleurs, et
le dit ci-dessous. Chaque ligne est tenue par un test nommé ; celles marquées
† ont été éprouvées par mutation.

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Titre « N choses à faire d'ici … » † | Obligations, en-tête | « Tes obligations », sans nombre | `nombreAFaire` — la fonction de la pastille du rail, test d'accord rendu côte à côte ; daté par la limite la plus lointaine de ce qui est à faire (« fin juillet » au dernier jour du mois), un retard à la place de la date, « Rien à faire avant le … » au jour où la prochaine chose **s'ouvre** (son ouverture ; la limite d'un prélèvement, qui se pointe le lendemain) — daté par la limite, il disait « avant le 31 juillet » la veille du jour où il comptait une chose à faire |
| Années du segment | Obligations, en-tête | Années des faits (`anneesDisponibles`, celles d'Argent) | Années qui portent une obligation jusqu'à l'année courante, l'année courante, l'année de la prochaine obligation à venir, l'année affichée |
| Signe d'un mois sur la frise † | Obligations › L'année | Un jalon par échéance saisie, nom, date et montant écrits dessous | Un signe par nature et par mois ; « déclarée, à payer » est ◇ ; un prélèvement non pointé ◇ (à pointer), jamais ▲ ; ◌ non suivi (pointillé gris) pour une limite passée avant le 17/11 seulement, nommé par la légende quand il y est |
| Montant d'une ligne † (fusion) | Obligations › À faire et à venir | Deux cartes : l'appel saisi d'un côté, la période de l'autre | Une ligne par obligation, prévue et saisie réunies (une CFE et son avis : une ligne) ; « ≈ » quand estimé, « — » quand rien n'est dit ou qu'un taux manque |
| « Déclarable le 1ᵉʳ juillet » | Obligations, pastille | « Période en cours, pas encore déclarable » | L'ouverture de l'étape, dans le mois qui vient ; « À venir » au-delà |
| Avance d'une déclaration † | Obligations, faites dépliées et dossier | Absente | « déclarée le 28 avril, deux jours avant la limite », contre la limite reportée ; rien quand la date manque |
| Reste à payer, prochaine limite | Obligations, liste repliée | « Échéances reçues » repliée : appels non payés, prochaine date | `duSaisi` (au centime le volet des appels) et la prochaine limite de la liste |
| Recettes à déclarer, cotisations, VL, CFP | Dossier URSSAF | Montant total seul (« À payer … ») | Ligne par ligne, taux effectif, « avec l'ACRE » ; `ventilationDeclaration`, dont `montantDeclaration` est le total ; « taux manquant » plutôt qu'un montant |
| TVA collectée, déductible, autoliquidée, à payer | Dossier TVA (CA3, CA12) | Registre de TVA seulement, par trimestre | Sur la période de la déclaration ; « date calculée » et sa règle sur une CA3 |
| Cases 5TE / 5HQ et leur montant | Dossier déclaration de revenus | Absentes | Montant brut (hors taxes pour un redevable), rien de déduit |
| État d'une pièce † | Obligations › Pièces à fournir | Absent | Vigilance « obtenue le … » et à jour six mois (provisoire dite), RC pro « valable jusqu'au … », SIRENE « téléchargé le … » et « Pas de validité » — jamais « à jour » ; une pièce absente est « à obtenir », pas en retard |
| Calendrier `.ics` | Obligations, « Ajouter au calendrier » | Absent | Téléchargé au clic ; « un fichier à importer dans ton agenda ; sans serveur, il ne se met pas à jour seul » dit avant et après |

**Retiré, avec sa raison** : le repère « auj. » en pastille de l'ancienne
frise — la maquette met le mois courant en bande ; le nom, la date et le
montant écrits sous chaque jalon — la liste juste en dessous les porte, et
la frise ne pose plus qu'un signe par mois.

## Lot 34-bis (21/11) — la caisse de retraite, le plafond du versement libératoire, l'histoire de l'option

Aucun écran n'est redessiné. Des nombres changent de source, un s'ajoute.
Chaque ligne est tenue par un test nommé ; celles marquées † ont été
éprouvées par mutation.

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Taux de cotisations † | Réglages › Paramètres fiscaux (« Barèmes en vigueur », taux plein et avec l'ACRE) ; derrière lui le dû du Pilote et de la Trésorerie, les charges d'Activité, le dossier URSSAF | Celui de la SSI pour tous : 25,6 % en 2026 | Celui de la caisse (`periodesUrssafEffectives` ← `baremeDeLaCaisse`) : Cipav 23,2 % en BNC (21,2 % jusqu'au 30/06/2024 ; 11,6 % sous ACRE à 50 %), SSI sinon — et toujours en BIC |
| Table des cotisations par période | Réglages › Paramètres fiscaux | Celle de la SSI | Celle de la caisse ; « Ta caisse de retraite est la Cipav : la colonne BNC porte son barème » pour un affilié Cipav |
| Plafond de revenu fiscal de référence du versement libératoire † | Simulateurs, sous le comparatif | Absent : « un nombre officiel que l'application ne porte pas » | Limite haute de la deuxième tranche du barème des revenus Y−2, fois les parts du comparatif, arrondie à l'euro inférieur : 29 315 € pour 2026, 29 579 € pour 2027 ; Y l'année suivante, ou celle du début dans les trois mois qui suivent la création ; refus motivé, sans montant, quand le barème manque |
| Cases 5TE / 5HQ † | Dossier de la déclaration de revenus | L'option du jour pour toutes les années : quittée en 2026, elle faisait déclarer 2025 en 5HQ | L'option du mois d'encaissement (`vlAu`) |
| Solde estimé de l'impôt de l'année précédente † ; provision d'impôt de l'année † | Pilote, Trésorerie, composition, détail de la dette, Obligations | Nuls ou au barème selon l'option du jour : quittée en janvier, elle inventait un solde 2025 que le versement libératoire avait payé | Par année : sous l'option toute l'année, rien ; année partagée, l'assiette hors option (la case 5HQ) |
| Versement libératoire au dû † | Pilote, Trésorerie, détail de la dette | Au taux du mois courant pour tout l'encaissé non déclaré : un décembre encore à déclarer perdait ses 2,2 % au 1er janvier | Au taux du mois d'encaissement (`tauxImpotAu`) |
| Versement libératoire d'une déclaration URSSAF † | Dossier URSSAF | Option du jour | Option du dernier mois de la période : le quatrième trimestre 2025, déclaré en janvier 2026 après avoir quitté l'option, garde ses 2,2 % |
| « VL » au pied du rail † ; « avant impôt » du tarif journalier ; aide « Tu as opté » | Rail, Activité › Analyse, Réglages › Paramètres fiscaux | Le booléen : une option prise en novembre pour janvier s'affichait en novembre | L'option du mois ; Réglages › Profil dit « À partir du 1ᵉʳ janvier … » tant qu'un changement n'a pas pris effet |

## Lot 48 (21/11) — le carnet de commandes, Activité › Missions

L'onglet Missions est refait d'après la maquette `direction/activite.html`.
L'ancienne liste portait, par mission, le facturé, l'encaissé et le reste ; ils
y sont encore, et sept nombres s'y ajoutent. Les jours viennent tous du
planning (`planningsDuMois`, la source du CRA et de la facture du mois) ; les
règles, de `calculs/carnetDeCommandes`. Chaque ligne est tenue par un test
nommé ; celles marquées † ont été éprouvées par mutation.

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Titre « Couvert jusqu'au … » † | Activité › Missions, en-tête | « Ton plan de charge » (le titre du planning) | La plus tardive des échéances des missions signées (`finDeVisibilite`) ; « Couvert, sans fin fixée. » dès qu'une signée n'a pas de fin ; « Rien de signé. » sans signée à venir — un prospect n'y entre jamais |
| Carnet signé, en jours et en euros † | Tuile « Carnet signé » | Absent | Σ reste à produire des missions signées : volume commandé − jours faits, ou jours planifiés jusqu'à l'échéance ; euros = jours × TJM de la mission. Une signée sans fin ni volume est NOMMÉE (« hors …, sans fin fixée »), jamais comptée pour zéro ; tout sans fin : « Sans fin ». Prospect jamais compté |
| Tendance du carnet | Tuile « Carnet signé », courbe | Absente | Les jours signés des douze mois à venir (la rangée de la frise), courbe monotone qui ne dépasse jamais ses points |
| Fin de visibilité, « Dans N jours, plus rien n'est signé », « ◇ À préparer » † | Tuile « Fin de visibilité » | Absente | La même échéance que le titre ; « sauf reconduction » quand la mission qui la porte se reconduit ; la pastille quand elle est dans son préavis sans reconduction |
| Occupation du mois, « x jours sur y ouvrés, z jours de congé retirés » † | Tuile « Occupation de <mois> » | Planning › en-tête (« % occupé ») et « Le mois en chiffres » | Même source (`moisEnChiffres`) : le même nombre aux trois endroits ; « équivalent-jours » quand il est déduit des factures ; la rangée des jours signés du mois courant dit le même nombre de jours (test d'accord) |
| Tendance de l'occupation | Tuile « Occupation », courbe | Absente | L'occupation des douze derniers mois ; un mois sans jour ouvrable n'a pas de point |
| Barres des missions sur douze mois | « Les douze mois à venir » | Absentes | Une ligne par signée ou prospect, de son début (ou du mois courant) à son échéance, rond au bout ; pas de rond sans fin ; prospect en pointillé « non compté » ; bande du mois courant, trait « aujourd'hui » |
| Jours signés par mois † | « Les douze mois à venir », rangée du bas | Absents | Jours du planning des missions au planning (signées, et terminées dans le mois : ceux de l'occupation), mois courant entier ; « 0 » tant qu'une signée ou un prospect court, « — » au-delà. Dits en texte dans la phrase de la frise (`aria-label`) |
| Fin annoncée, reconduction † | Bandeau sous la frise | Absente | « ◇ X se termine dans N jours », au préavis (60 jours par défaut, ou celui de la mission) ; « ◇ X se reconduit le … sauf dénonciation » |
| Jours faits / commandés et barre † | Toutes les missions, « Jours faits » | Absents | Jours retenus au planning jusqu'à aujourd'hui inclus (les mêmes que le CRA d'un mois clos, test d'accord) ; « / commandés » et la barre quand un volume est dit, ambre au-delà ; « — / 25 » pour un prospect |
| Facturé, encaissé, reste | Toutes les missions | Ligne de la liste : facturé, « Encaissé … · Reste … », « Chiffre du client, partagé avec N autre(s) » | Inchangés (`lignesDeMission`) : colonnes Facturé et Encaissé, « reste … » sous l'encaissé d'une mission non terminée, « partagé avec N autre(s) » sous le facturé |
| Tarif | Toutes les missions | « 520 € / jour », « TJM non renseigné » | Colonne Tarif ; « TJM non renseigné » quand il manque |
| État d'une mission † | Toutes les missions, « État » | Le statut seul (« En cours ») | Dérivé (`etatDeLaMission`) : ● En cours ; ◇ Fin dans N jours ; ◇ Reconduite le … ; ◇ Finie le …, à clore ; ◇ … € à facturer (travail achevé — volume atteint ou échéance passée — moins le facturé) ; ○ Prospect, N % ; ● Terminée, soldée / … € à encaisser / Terminée ; × Perdue |
| Nombres des filtres | Toutes les missions | Absents (le compte de l'onglet seul) | Toutes / En cours / Prospects / Terminées (perdues comprises) |
| Fin d'une mission annoncée † | « À faire » (Pilote), pastille du rail sous Activité | Absente | Un sujet « à faire » par mission signée dans son préavis, sans reconduction : « X se termine dans N jours », « Préparer la suite » → la mission |

**Retiré, avec sa raison** : le titre « Ton plan de charge » sur l'onglet
Missions — il décrivait le planning ; le montant de chaque ligne aligné à
droite du nom — devenu la colonne Facturé.

**Reste** : le facturé d'une mission ne compte que les factures émises dans
sa fenêtre de dates. Une facture émise après la fin (l'audit ponctuel du jeu
d'essai, fini le 8 mai, facturé le 12) n'est rattachée à aucune mission —
défaut antérieur au lot, signalé, non corrigé ici (`lignesDeMission`).
**→ Corrigé au lot 50, phase A** (voir plus bas) : la période facturée
rattache la facture du 12 mai à l'audit.

## Lot 49 (21/11) — la Trésorerie à douze mois

L'écran est refait d'après `direction/tresorerie.html`. Il portait quatre
tuiles, un anneau, des enveloppes, trois jauges en barre, un graphe combiné sur
l'année et une carte de projection ; chacun de leurs nombres est ci-dessous —
dans la maquette, placé sans maquette (†† : à montrer au propriétaire), ou lu
ailleurs. Chaque ligne est tenue par un test nommé ; celles marquées † ont été
éprouvées par mutation. Les calculs : `selecteurs.tresorerie`, `selecteurs.sorties`,
`etatProjection` étendu, `calculs/seuilsPipeline`, `calculs/sortiesDeCharges`.

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Solde du compte, sa provenance | Cascade, ligne 1 ; indication en tête (« relevé du 4 juin », « solde saisi le … », « date-le dans Réglages ») | Tuile « Solde du compte », note dessous | Même nombre (`etatPilote`), même provenance ; la formule s'ouvre au clic sur le libellé |
| Dû | Cascade, ligne 2 ; total de « Ce qui est dû » | Anneau, total des enveloppes, résumé replié | Même nombre, deux fois sur l'écran comme dans la maquette |
| Disponible | Cascade, ligne 3 | Tuile, centre de l'anneau | Même nombre ; négatif en rouge, jamais borné, et la phrase « ton disponible est négatif : le dû dépasse le solde de … » |
| Réserve | Cascade, ligne 4 | Part de l'anneau, vignette « Réserve » (constituée / réglée) | Constituée seulement (« constituée sur 2 470 € » quand le disponible ne la couvre pas) |
| À te verser † | Cascade, ligne 5 | Part de l'anneau ; carte « Tu peux te verser » = à te verser × (1 − part gardée) | **Un seul « à te verser »** (décision 24) : disponible − réserve. La part gardée est retirée du schéma (28) ; le bandeau la dit une fois |
| Déjà versé ce mois | Pied de la cascade | Absent de la Trésorerie (versé dans la capacité seulement) | « Déjà versé en juin : 0 € », lu au relevé ; « à lire sur ton relevé » sans relevé — inconnu, pas nul |
| Autonomie | Pied de la cascade | Tuile « Autonomie 3,3 mois » | « Ton besoin est de 2 300 € par mois — de quoi tenir 3,3 mois. » ; besoin à zéro : ni besoin ni autonomie |
| À encaisser (6 010 €, 3 factures) | **Quitte la Trésorerie** | Tuile | Lu sur Factures (« Reste à rentrer », même `encoursDe`), au Pilote (flux du mois, « en attente ») et dans Activité › Analyse ; ici, les factures attendues sont dans les entrées de chaque mois (« 4 810 € de factures à échéance ») |
| Couverture du dû | Pastille de « Ce qui est dû » | Étiquette d'en-tête « Dû · 100 % couvert » | « ● Tout est couvert », ou « ▲ N € non couverts » (le montant, plus un pourcentage) |
| Dû par charge, sa base et sa date † | « Ce qui est dû », quatre lignes | Vignettes par nature (couvert / dû, « éch. … ») ; la CFP à part | URSSAF et formation (URSSAF + CFP, qui partent ensemble), impôt, TVA, CFE — même à zéro ; « Sur tes encaissements depuis avril · à payer le 31 juillet », « Versement libératoire, payé avec l'URSSAF », « Sur un achat hors de France · 30 juin » (la CA3 du mois suivant, décision 25), « Avis en novembre · rien à garder avant » ; dates lues sur le dû posé à ses échéances |
| Volets du dû, couvert par enveloppe, détail mois par mois, note d'impôt, impôt mois par mois | Détail d'une ligne (au clic) | Carte « Enveloppes du dû » dépliée | Le même contenu, dans le volet de la ligne : les deux volets, « Couvert par le solde : … sur … » et la règle « la plus proche servie d'abord », la note d'impôt et ses réserves, le détail (`PanneauDetailDette`) |
| Versement tenable, mois qui limite | Titre de la carte de la courbe | Phrase de la carte de projection, repliée | « Tu peux te verser 1 896 € par mois jusqu'en mai 2027 » ; « Rien à te verser chaque mois pour l'instant » à zéro |
| Disponible, trois mois constatés † | Courbe, trait plein | Graphe combiné : le SOLDE réel des mois clos de l'année | Le disponible de chaque fin de mois, recalculé depuis les faits de ce soir-là (`faitsAu`) — jamais stocké ; rien avant le solde de départ |
| Disponible prévu, versement déduit † | Courbe, pointillé | Disponible « hypothèse » sans versement, jusqu'en décembre | Douze mois glissants (mois courant + 11), versement tenable pris chaque mois ; « aujourd'hui » à son jour |
| Point bas † | Annotation de la courbe | Absent | « point bas · 2 471 € en mai » : le mois le plus bas, versement déduit (`pointBas`) |
| Pic | Annotation de la courbe | Absent (valeurs écrites au-dessus de chaque mois) | « fin août, prévu · 20 435 € » ; le reste à l'infobulle (survol, doigt, clavier) |
| Solde prévu, dû prévu par mois † | Infobulle ; « Voir en tableau » | Absents | Le dû quitte le compte à sa date (URSSAF à la limite de sa déclaration, TVA à sa CA3, impôt à ses prélèvements, CFE avec son avis) ; solde − dû = disponible chaque mois (test) |
| Dans un an : sans rien te verser / en t'étant versé / versé cumulé | « Voir en tableau » | Carte de projection | Inchangé (même dernier mois) |
| Taux de charges, dépenses courantes moyennes, sources du prévu | « Voir en tableau », légende | Trois hypothèses de la projection | « Charges retenues sur chaque encaissement : 15 % » devient « Le dû grandit de 15 % de chaque encaissement — le disponible le retire ce jour-là — et quitte le compte à l'échéance de sa déclaration » : l'ancienne phrase ne disait plus quand il sort ; dépenses : inchangé |
| Entrées et sorties d'un mois † | « Ce qui entre et ce qui sort » (douze mois prévus) ; vue Année (constatés et prévus) | Barres du graphe combiné, net sous chaque mois | Entrées attendues (factures émises, planning signé) vers le haut ; sorties le jour où elles quittent le compte vers le bas ; le mois choisi en relief avec ses deux valeurs ; sa phrase (« Juillet — 4 810 € de factures à échéance et 6 840 € du planning signé. Il sort 1 896 € pour toi, 2 152 € d'URSSAF le 31 et 100 € de dépenses ») ; « Le détail de juillet » en tableau, net du mois compris |
| Solde de fin de mois d'un mois clos | Vue Année, infobulle et tableau | Courbe du graphe combiné | Inchangé (`soldeAuDernierJourDe`) — relu au mois constaté |
| Capacité de versement par mois, versé dans la barre | Vue Année †† | Carte sous la Trésorerie | Même calcul (`capaciteParMois`, année relue en paramètre) ; le versé à l'intérieur de la barre, futur hachuré, abstention dite |
| Plafond, franchise, seuil majoré : réalisé / seuil, reste | « Tes seuils de l'année » †† | Trois jauges en barre, repliées | Trois anneaux de la planche, « 22 720 € sur 37 500 € », « Il reste 14 780 € avant le seuil » |
| Franchissement par le pipeline † | « Tes seuils de l'année » †† | Absent | « Par ce qui est émis et signé : franchi en août 2026 » — factures à leur échéance, planning au délai du client, aucun prospect (`franchissementParLePipeline`) |
| Franchissement au rythme, projection annuelle, abstention | « Tes seuils de l'année » | Sous chaque jauge | Inchangés (`franchissementPrevu`, `projectionAnnuelle`) |
| Jours facturables avant le seuil † | « Tes seuils de l'année », pastille †† | Absent | « ◇ encore 29 jours facturables » : (seuil − encaissé) / tarif moyen des missions signées de l'année, à l'inférieur ; refusé avec motif sans tarif |
| Repère « N % de l'année écoulée » | En-tête de « Tes seuils de l'année » | Sur chaque jauge | Une fois, en tête |
| Redevabilité de TVA (année précédente, perte de franchise) | Sous les anneaux | Sous les jauges | Inchangée |

**Retiré, avec sa raison** : l'anneau du solde et sa phrase (la cascade dit la
même chose, enchaînée) ; les quatre tuiles (leurs nombres sont dans la cascade,
sauf « À encaisser », lu sur Factures et au Pilote) ; le graphe combiné de
l'année (ses deux graphes le remplacent, alignés, et la vue Année relit le
passé) ; le résumé replié de chaque carte (les cartes ne se replient plus) ; la
part gardée (décision 24).

**Reste** : sous le versement libératoire, l'impôt des encaissements à venir
part avec l'URSSAF ; au barème, l'impôt de l'année prochaine sur ces
encaissements n'entre pas dans la projection (le taux ne porte que la
formation) — antérieur au lot, inchangé. Les entrées prévues sont hors taxes,
comme le pipeline l'a toujours été : pour un redevable de la TVA, l'entrée réelle
est plus haute d'autant — antérieur, signalé.
**→ Corrigés tous deux au lot 50, phase A** (ci-dessous).

## Lot 50, phase A (21/11) — trois justesses, avant l'écran Analyse

Trois nombres faux avant d'être laids, venus des lots 48 et 49. Aucun écran
redessiné. La démonstration (versement libératoire, franchise, factures émises
pendant leurs missions) garde tous ses nombres — les tests qui les tiennent
sont inchangés ; c'est le jeu d'essai (au barème, redevable depuis juin, un
audit facturé après sa fin) qui bouge. Chaque ligne est tenue par un test
nommé, toutes éprouvées par mutation (code inversé, test qui tombe : compte
rendu du lot).

| Nombre lu | Où | Avant | Après |
|---|---|---|---|
| Facturé, encaissé, reste, état d'une mission † | Activité › Missions (tableau), carnet de commandes | Factures émises entre le début et la fin de la mission : l'audit du jeu d'essai (fini le 8 mai, facturé le 12) — 0 €, « Terminée » | Une seule règle, `rattacherFactures` : la référence de commande de la facture quand une mission la porte ; un avoir suit la facture qu'il annule ; sinon la **période facturée** — depuis la facture précédente au même client jusqu'à l'émission —, aux missions signées qui la touchent. L'audit : **2 400 € facturés, 2 400 € encaissés, « Terminée, soldée »** ; l'atelier de formation, son avoir et l'atelier de suivi, hors mission, ne lui reviennent pas |
| « partagé avec N autre(s) » † | Activité › Missions, sous le facturé | Deux missions actives en même temps | Deux missions dans la même période facturée : simultanées, ou la dernière facture de l'une partie après le début de l'autre (la fenêtre la donnait à la seconde seule, sans le dire) |
| Réalisé d'un mois, par mission † | Activité › Analyse, composition d'un mois | Copie de la fenêtre de dates (`dansLaFenetre`), qui ne voyait ni la facture d'après la fin, ni les payeurs des plages | La même règle que le facturé de la mission — la copie a disparu |
| Disponible prévu, versement tenable, point bas † | Trésorerie, courbe et titre | Au barème, le taux de charges ne portait que la formation : l'impôt des encaissements à venir n'entrait nulle part | Le disponible retire, mois par mois, l'impôt que la provision chiffre déjà pour l'année (`resteSurEncaissementsAVenir`, réparti au prorata) ; l'année suivante, au taux moyen de l'impôt de l'année. Jeu d'essai au 15 décembre : **4 551 → 3 770 € par mois**, toujours jusqu'en novembre 2027 (point bas 8 007 → 8 005 €) |
| Impôt sorti du solde prévu † | Trésorerie, sorties d'un mois | Le reste de l'impôt de l'année seul, daté sur son propre calendrier | Le solde de l'année entier (reste + à venir) posé à ses prélèvements de l'automne suivant ; la part due aujourd'hui et la part à venir suivent un calendrier (au-delà de 300 €, quatre prélèvements) |
| Solde prévu d'un redevable † | Trésorerie, courbe (infobulle), tableau | Entrées hors taxes : la TVA sortait à sa déclaration sans être entrée | La TVA entre avec l'encaissement (celle de la facture émise ; le taux normal du barème pour le planning, rien pour un client établi hors de France) et sort à la déclaration qui couvre son mois — CA3 du mois ou du trimestre, CA12 de l'année (régime simplifié : acomptes sans montant, toute la TVA posée à la CA12). Le disponible ne la voit jamais. Jeu d'essai, fin décembre : **32 345 → 34 566 €** |
| Entrées d'un mois † | Trésorerie, « Ce qui entre et ce qui sort », phrase et tableau | Hors taxes, prévues comme constatées | TVA comprise — ce qui entre sur le compte, comme le solde dérivé la compte : jeu d'essai, janvier « 2 160 € de factures à échéance et 8 928 € du planning signé » (1 800 et 7 440 hors taxes) ; « Net du mois » juste chez un redevable |
| Hypothèses de la projection † | Trésorerie, « Voir en tableau » | « Le dû grandit de N % de chaque encaissement » seulement | La même phrase, plus — quand ils existent — l'impôt sur le revenu des douze mois (« lu sur ta provision d'impôt : il part avec le solde de son année, à l'automne suivant ») et la TVA encaissée (« quitte le compte à la déclaration qui la reverse ») ; rien de plus sur la démonstration |

**Reste** : le franchissement du seuil de TVA *prévu* par le pipeline
(« franchi en août 2026 » sur la démonstration) ne fait pas encore porter de
TVA aux encaissements qui le suivent — la projection ne lit la redevabilité que
sur les faits (`regimeTvaAu`). Les acomptes de prélèvement à la source de
l'année suivante, s'ils sont saisis d'avance, s'ajoutent à l'impôt né des
encaissements de cette année-là (erreur dans le sens prudent).

## Lot 50, phase B (21/11) — sept indicateurs calculés, pas encore affichés

Calculés et testés (`selecteurs.analyse`), sur la démonstration et le jeu
d'essai ; **aucun n'est encore à l'écran** — l'écran Analyse attend la
validation de sa maquette (`direction/analyse.html`). La colonne « Actuelle »
du §3 ne les compte donc pas : un calcul sans écran n'est pas un indicateur
livré (la leçon de V9).

| Indicateur | Formule retenue | Démonstration, 10/06/2026 | Jeu d'essai, 15/12/2026 |
|---|---|---|---|
| Net de poche de l'année | Encaissé HT − cotisations − formation − impôt − CFE − dépenses ; impôt `null` (« avant impôt ») quand il ne se calcule pas | 18 077 € (22 720 − 2 908 − 45 − 500 − 0 − 1 190) | 44 324 € |
| Mois lissé, et sa tendance | Net des douze derniers mois entiers ÷ mois d'activité comptés ; net de chacun | 2 500 € par mois, sur huit mois | 3 961 € par mois, sur douze |
| Taux de prélèvement | (Cotisations + formation + impôt + CFE) ÷ encaissé | 15 % | 37 % (au barème, foyer à deux parts) |
| Jours nécessaires par mois | (Besoin + dépenses du mois) ÷ (tarif des contrats × (1 − taux)) | 5,6 jours (2 300 € à 502 €) | 10 jours |
| Tarif plancher | (Besoin + dépenses) annuels ÷ (jours de l'occupation × (1 − taux)) ; refusé sous trois mois | 134 € (250 jours) | 238 € |
| Objectif en net | (Objectif × (1 − taux) − dépenses annuelles) ÷ 12 | 72 000 € → 5 018 € par mois | 80 000 € → 4 157 € |
| Encours par ancienneté | Non échues, 1–30, 31–60, au-delà ; somme = reste à encaisser | 4 810 € (2) · 1 200 € (1) · 0 · 0 | 9 000 € non échus |
| Comparaison avec l'an passé | Même période, encaissé et jours au planning ; refusée sous douze mois | Refusée : « viendra en octobre 2026 » | 72 480 € et 197 jours, contre 23 760 € et 134 |

Deux écarts à la formule de `AUDIT-PRODUIT-ET-INTERFACE.md` §5, dits ici :
les **dépenses** entrent dans les jours nécessaires (sans elles, le net du
mois tombait sous le besoin de leur montant) et l'objectif inverse se calcule
`(net + dépenses) ÷ (1 − taux)` et non `net ÷ (1 − taux) + dépenses` (les
dépenses se paient sur un chiffre d'affaires déjà prélevé). Le **tarif** est
celui des contrats sur les journées du planning, pas le « tarif effectif » :
voir la note qui suit.

**Rencontré, non corrigé (hors lot)** : le « tarif effectif » de « Ce qu'une
journée te rapporte » divise ce qui est déjà facturé par les journées du
planning de **toute** l'année, à venir comprises — la démonstration lit
400 € « effectifs » et « 102 € perdus par journée » au 10 juin, quand rien
n'est perdu : juin et juillet ne sont simplement pas encore facturés.

## 22/11 — Réglages › Compte & synchronisation, le parcours de première connexion

Aucun graphe. Ce que l'écran donne à lire, et d'où il le tient : rien n'est
stocké, tout se relit ou se dérive à l'ouverture.

| Nombre ou état lu | Où | Avant | Après |
|---|---|---|---|
| Heure du dernier envoi | Carte « Sauvegardé » | « Compte enregistré le » + date courte | « Dernier envoi à **9 h 41** » (le jour même) ou « le 21/11 à 18 h 05 » : l'horloge de l'appareil qui a écrit (`maj_le`), indicative — elle n'arbitre jamais rien. **Lot 42** : sur un appareil synchronisé, remplacée par l'heure de la dernière synchronisation (section suivante) |
| État de la synchronisation | Pastille de la carte | — | « à jour », « à envoyer », « à recevoir », « diffère », « vide », « état inconnu », « illisible ici » — dérivé des faits des deux côtés (`selecteurs.synchro`, comparaison canonique : `jsonb` range les clés autrement). « À envoyer » et « à recevoir » seulement quand un côté est vide ; la démonstration ne compte pas comme des données |
| Ce que contient l'appareil | Carte « Sauvegardé » | « Cet appareil : N recette(s), M dépense(s) » | Inchangé |
| Lignes lisibles sans connexion | Santé du projet | Par table, dans le bloc « Règles d'accès » | Le total des tables exposées dans le constat (« 3 ligne(s) se lisent sans connexion »), et par table sous « Le détail, table par table » — compté par le serveur (`Content-Range`), jamais lu ; un total absent reste « non vérifié », jamais 0 |
| Heure de la vérification | Santé ; étape 5 | « vérifié le 22/11/2026 10:00 » | « règles d'accès vérifiées à 9 h 40 » ; « vérifié à … — FREEL relit ce réglage » |
| Projet joignable, clé acceptée, base, règles, inscriptions | Étape 3 ; santé | — | Un constat par maillon (✓, ✗ avec le geste, ? non vérifié, · en attente) ; lus sur des codes HTTP et des booléens (`disable_signup`), jamais sur un texte du serveur |

## 22/11 — Lot 42 : la synchronisation automatique

Avancé à la demande du propriétaire. Aucun graphe ; une heure, et des états,
que la barre du haut montre sur tous les écrans.

| Nombre ou état lu | Où | Avant | Après |
|---|---|---|---|
| Heure de la dernière synchronisation | Pastille de la barre du haut (bureau ; nom accessible au téléphone) ; carte « Sauvegardé » | Aucune : la pastille disait « Compte relié », faute d'heure conservée | « Synchronisé à 9 h 41 », « Synchronisé hier », « Synchronisé le 20/11 » ; « Dernière synchronisation à **9 h 41** ». L'horloge de CET appareil au moment où il s'est mis d'accord avec le compte (envoi accepté, compte adopté, égalité constatée) — retenue par l'appareil (`freel.synchro.appareil.v1`), jamais dans les faits ni sur le serveur ; affichée, elle n'arbitre rien (c'est le compteur de version qui tranche). La veille se dit « hier » : une heure seule se lirait « ce matin » |
| Heure du dernier envoi | Carte « Sauvegardé » | « Dernier envoi à … » (`maj_le` du compte) | Remplacée, sur un appareil synchronisé, par l'heure ci-dessus : l'heure d'un autre appareil dit quand LUI a envoyé, pas quand celui-ci s'est mis d'accord. Un appareil jamais synchronisé la garde |
| État de la synchronisation automatique | Pastille du haut ; pastille de la carte | « à jour / à envoyer / à recevoir / diffère » de la seule première liaison | Publié par le moteur (une source, `infra/synchro.etat`) : à jour, envoi…, hors ligne (avec ou sans changements à envoyer), à choisir, mise à jour en attente (formulaire ouvert), reconnecte-toi, mets FREEL à jour, à vérifier, démonstration, en échec. Ne s'invente pas : tant que le moteur n'a rien dit, la pastille donne l'heure de la dernière synchronisation, qui reste vraie |
| Dates de « À choisir » | Carte « À choisir » | — | « Cet appareil a été modifié à … » : la dernière modification vue ici depuis la synchronisation (horloge de l'appareil) — ou « depuis la dernière synchronisation » si elle n'a pas été vue ; « le compte à … » : `maj_le` de l'état distant. Elles disent QUAND, pas qui a raison |
| Contenu des deux côtés | Carte « À choisir » | — | « N recette(s), M dépense(s), K client(s) » ici et sur le compte, comptés sur les faits — ceux du compte après la validation du schéma |

## 27/11 — Le compte rendu d'activité en PDF

Aucun nombre ajouté ni retiré : le PDF porte ceux de V24 — jours par semaine,
par client, ventilés télétravail / sur site, « dont … sans lieu », totaux par
client, grand total —, déjà formatés par `modeleDuCra`, le module que
l'aperçu lit aussi. Un second formatage (« 4.5 j » d'un côté, « 4,5 j » de
l'autre) n'est plus possible : un test compare le texte de l'aperçu et celui
du PDF, dans le même ordre.

| Nombre | Où il se lit | Avant | Maintenant |
|---|---|---|---|
| Jours de la semaine, du client, du mois (V24) | Aperçu du CRA, fichier téléchargé | Aperçu et fichier HTML (le même nœud sérialisé) | Aperçu et PDF, depuis le même modèle ; « 1 / 2 » en pied du PDF, qui n'est pas un nombre de l'activité |


## 27/11 — Les factures émises dans un autre logiciel (demandé le 22/11)

Le propriétaire émet dans Tiime ; FREEL suit. Quatre nombres naissent, un
change de source, aucun n'est retiré. En mode FREEL, l'écran est celui
d'avant, à une exception : une facture annulée par un avoir ne couvre plus son
mois (voir le brouillon du mois ci-dessous).

| Nombre | Où il se lit | Avant | Maintenant |
|---|---|---|---|
| Montant HT et jours d'un mois à enregistrer † | Factures, « À enregistrer : juin 2026 » (mode externe) | Absent : le brouillon du mois proposait « Émettre » ou « Rédiger », et chiffrait un écart facture / planning | Le brouillon du mois, tel quel (`brouillonsDeFacture`, la source du CRA) : « 10,5 j au planning », « 5 460 € HT ». **Aucun écart** : la facture reprend le planning (22/11) |
| Mois en attente, un par payeur † | Factures, « Les mois en attente » ; « Mars et mai 2026 : travaillés, et aucune facture enregistrée » | Absent | `moisAEnregistrer` : les douze derniers mois, et le mois en cours quand le payeur n'y a plus de journée à venir. Un mois sort dès qu'une facture le **couvre** (`moisFactureDe` : le mois dit, sinon celui d'émission). Une facture d'avant sans mois dit se rattache d'un geste |
| Sujets « Enregistrer la facture de mars 2026 » † | « À faire » (Pilote), pastille de Factures | Absent | Un sujet par mois, à faire (jamais en retard : la facture est peut-être émise, c'est FREEL qui ne la connaît pas) ; « Atelier Novak · 2 880 € HT d'après le planning ». La même fonction que l'écran (`moisAEnregistrer`), regroupée par mois. Muet en mode FREEL |
| TVA et TTC d'une facture à enregistrer † | Volet « Enregistrer une facture émise » | Absent | Selon le régime : rien en franchise ni en autoliquidation (dit en une phrase), sinon le taux choisi et « 576 € de TVA, 3 456 € TTC » |
| Échéance proposée † | Même volet | Absent | `echeanceDe` sur le délai du client (« Calculée : 45 jours fin de mois »), corrigeable — la facture de Tiime fait foi |
| Mois couvert par une facture (« déjà émise ») | Brouillon du mois (mode FREEL) | Le mois d'émission ; une facture annulée par un avoir comptait encore | Le mois dit s'il y en a un, sinon celui d'émission — la même règle que les mois en attente ; une facture annulée ne couvre plus rien, le mois redevient à facturer |
| Date d'envoi | Ligne d'une facture, « envoyée le … » | Toujours le jour du clic | La date choisie (aujourd'hui proposé), corrigeable tant que la facture attend son règlement |

**Non-régression vérifiée** : « Reste à rentrer », « Dont en retard »,
« Encaissé sur la période » et « Recouvrement » lisent les recettes, d'où
qu'elles viennent — une facture de Tiime y entre comme une de FREEL (test).
Une facture encaissée sans mode de règlement reste **encaissée** — le statut
se lit sur la date seule — et son manque reste un sujet « à compléter » du
livre, jamais un retard (tests nommés). La suite de numérotation du livre
n'additionne plus les numéros d'un autre logiciel ; les doublons, si.

## 28/11 — Le planning : fériés lisibles, saisie au pinceau (demandés le 22/11)

Deux nombres naissent, dans le message du pinceau ; aucun n'est retiré. Les
vues semaine (V21) et mois (V22) gagnent le nom des fériés, qui n'est pas un
nombre mais explique ceux qu'elles affichent : « 4 j ouvrés » sur une semaine
de cinq se lit enfin, l'Ascension est écrite dans la colonne.

| Nombre | Où il se lit | Avant | Maintenant |
|---|---|---|---|
| Demi-journées posées par un geste † | Barre de pinceaux, « 10 demi-journées posées pour Studio Lumen » | Absent : l'éditeur ne posait qu'une portée d'un jour, et le disait par un toast sans compte | Jours posés × créneaux de la portée (`Application.demiJournees`), sauts déduits. « Rien à changer » quand les jours portaient déjà le pinceau ; « N journées rendues au rythme » pour Effacer |
| Jours sautés par une plage † | Même message, « sautés : 2 jours de week-end, Ascension, 1 jour de congé » | Absent | Comptés par motif (`sautSurUnePlage`, la règle même de l'aperçu) ; les fériés **nommés** ; « jours après l'arrêt du client » pour un client opérationnel arrêté |
| Jours fériés du mois | Le mois en chiffres | Un compte, sans dire lesquels | Inchangé ; leurs noms se lisent dans la légende de la vue mois (« 14 Ascension ») et de la semaine (« 14 : Ascension ») |
| Part de télétravail | Le mois en chiffres | Sur les demi-journées dont le lieu est renseigné | Inchangée. Le pinceau d'un client porte son **dernier lieu saisi** : peindre une semaine documente son lieu, et la part le compte. Sans lieu saisi, la puce n'en porte pas, et rien n'est inventé |

**Non-régression vérifiée** : le décompte des jours ouvrés, l'occupation et
le CRA lisent `ferie` comme avant ; le nom sort du même appel au calendrier
que le booléen (test : le rythme ne remplit pas l'Ascension, et la nomme).
