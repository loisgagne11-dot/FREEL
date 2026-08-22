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
| V3 | Répartition du solde | ✅ donut | ✅ donut | ✅ **donut livré** (lot B) — la barre segmentée disait le partage, pas la part&nbsp;; le donut porte le disponible en son centre, la phrase explicative à côté, et chaque part son montant en clair |
| V4 | Provisions **par catégorie** | ✅ | ✅ | ✅ **ajouté depuis** |
| V5 | Jauges de seuils | ✅ | ✅ | ✅ mieux nommées, + **repère de date ajouté depuis** |
| V6 | Frise de l'échéancier | ✅ | ✅ | ✅ **frise livrée** (lot B) — chaque obligation à sa date réelle sur l'année, repère « auj. ». Elle ne remplace pas la liste, elle la précède&nbsp;: la frise répond à « qu'est-ce qui vient », la liste à « qu'est-ce que j'en fais » |
| V7 | Courbe de solde / trésorerie | ✅ | ✅ | ✅ **graphe combiné** (lot B) — entrées, sorties et niveau sur un même repère, net écrit sous chaque mois. Sur le DISPONIBLE et non le solde, et le titre le dit&nbsp;: projeter le solde obligerait à deviner quand chaque dette sortira du compte |
| V8 | Jours par mission, mois par mois | ✅ | ⚠️ | ✅ **tableau rapport / charge ajouté depuis**, trié par euro-jour |
| V9 | Capacité de versement par mois | ✅ | ✅ | ✅ **affichée** — versé à l'intérieur de la barre de capacité, futur hachuré sans plein. Était ✅ à tort&nbsp;: voir la note sous le tableau |
| V10 | Cascade CA → charges → net | ✅ (deux fois) | ❌ | 🚫 §5.5 |
| V11 | Donut de destination du CA | ✅ | ❌ | 🚫 §5.5 |
| V12 | Sparklines dans les tuiles | ✅ | ❌ | 🚫 §5.5 |
| V13 | Dépendance client | ✅ | ✅ | ⚠️ barre segmentée + légende chiffrée |
| V14 | Occupation avec repère 100 % | ⚠️ | ✅ | ✅ **jauge livrée** (lot C4) dans « Le mois en chiffres », avec son dénominateur écrit dessous. La tuile qui donnait un SECOND chiffre d'occupation sur le même écran est retirée&nbsp;: §1.3 |
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
2. **Sélecteur de période** — l'année est verrouillée sur l'horloge ; au
   1ᵉʳ janvier le pilier Performance devient vide et l'année précédente est
   inatteignable

Livrés : la composition d'un mois au clic (§4.6, V2), l'objectif de CA et son
écart en jours (V17), la capacité de versement enfin affichée (V9), la
ventilation des provisions (§4.1), le repère de date et la
projection de franchissement (§4.2), le tableau « rapport vs charge » par
mission (§4.3), le TJM effectif et le TJM net (§4.4), la phrase de synthèse
de santé (§5.1), l'assiette nommée de l'autonomie.

**Livrés au lot B** : le donut de répartition du solde (V3), la frise de
l'échéancier (V6), le graphe combiné entrées / sorties / disponible (V7).

**Livrés au lot C** : le plan de charge à deux créneaux par jour (V20), la vue
semaine (V21), la vue mois (V22), la répartition du temps par client (V23),
l'occupation en jauge avec son dénominateur (V14), les jours travaillés et le CA
généré du mois, la part de télétravail.

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
