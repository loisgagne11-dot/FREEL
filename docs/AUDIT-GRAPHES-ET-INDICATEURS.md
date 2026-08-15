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

---

## 2. Inventaire des visualisations

✅ présente · ⚠️ remplacée · ❌ absente · 🚫 refusée avec motif écrit

| # | La question à laquelle elle répond | Ancienne | Maquette | Actuelle |
|---|---|---|---|---|
| V1 | CA réalisé vs encaissé, mois par mois | ✅ | ✅ | ✅ `GrapheBarres`, doublé en tableau accessible |
| V2 | Composition d'un mois de CA, au clic | ✅ | ✅ | ❌ le graphe n'est pas cliquable |
| V3 | Répartition du solde | ✅ donut | ✅ donut | ⚠️ barre segmentée — **meilleure**, montants en clair |
| V4 | Provisions **par catégorie** | ✅ | ✅ | ✅ **ajouté depuis** |
| V5 | Jauges de seuils | ✅ | ✅ | ✅ mieux nommées, + **repère de date ajouté depuis** |
| V6 | Frise de l'échéancier | ✅ | ✅ | ⚠️ liste groupée ; la lecture « à date » de la frise est perdue |
| V7 | Courbe de solde / trésorerie | ✅ | ✅ | ✅ **ajoutée depuis** — sur le DISPONIBLE et non le solde, deux scénarios, hypothèses écrites |
| V8 | Jours par mission, mois par mois | ✅ | ⚠️ | ✅ **tableau rapport / charge ajouté depuis**, trié par euro-jour |
| V9 | Capacité de versement par mois | ✅ | ✅ | ✅ **ajoutée depuis** — versé (relevé) face au soutenable |
| V10 | Cascade CA → charges → net | ✅ (deux fois) | ❌ | 🚫 §5.5 |
| V11 | Donut de destination du CA | ✅ | ❌ | 🚫 §5.5 |
| V12 | Sparklines dans les tuiles | ✅ | ❌ | 🚫 §5.5 |
| V13 | Dépendance client | ✅ | ✅ | ⚠️ barre segmentée + légende chiffrée |
| V14 | Occupation avec repère 100 % | ⚠️ | ✅ | ❌ chiffre nu |
| V15 | Impôt par tranche | ✅ barres | ✅ barres | ⚠️ **tableau exact** — progrès, la barre était décorative |
| V16 | Projection par scénarios | ✅ | ❌ | 🚫 §5.5 |
| V17 | Objectif de CA avec allure attendue | ✅ | ❌ | ❌ |
| V18 | Autonomie à zones 3/6/12 mois | ✅ | ⚠️ | 🚫 §5.5 |
| V19 | Score de santé /100 | ✅ | ✅ (en dur) | 🚫 §5.1 |
| V20 | Calendrier / plan de charge | ✅ | ✅ | ✅ |

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
| **Objectif de CA + allure** | ❌ |
| **Comparaison N−1 / tendance** | ❌ — utile la troisième année, pas la première |
| **TVA perdue faute de pièce** | 🟢 **n'existe nulle part ailleurs** — chiffre le coût de la négligence |
| **Écarts de conformité du livre** | 🟢 **n'existe nulle part ailleurs** |
| **Prévision de revenu du mois** | 🟢 **n'existe nulle part ailleurs** — le maillon que la vision nomme « le plus important » |

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

### 4.6 Composition d'un mois au clic

Le titre de la carte de la maquette dit littéralement « clic sur un mois =
composition ». Le libellé est réfléchi, il est perdu. Faible coût, forte
valeur — avec une précaution : le `<svg>` est `aria-hidden`, donc les cibles
doivent être des `<button>` HTML au-dessus, ou les lignes du tableau.

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

1. **Composition d'un mois au clic** (§4.6)
2. **Objectif de CA avec allure attendue** (V17) — dépend d'un objectif que
   rien ne porte encore dans les faits
3. **Comparaison N−1** en filigrane du graphe existant — utile la troisième
   année, pas la première

Livrés : la ventilation des provisions (§4.1), le repère de date et la
projection de franchissement (§4.2), le tableau « rapport vs charge » par
mission (§4.3), le TJM effectif et le TJM net (§4.4), la phrase de synthèse
de santé (§5.1), l'assiette nommée de l'autonomie.

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
