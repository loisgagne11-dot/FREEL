# Plan — performance et conformité au handoff de design

**Date :** 13/08/2026
**Objet :** deux questions distinctes, souvent confondues — « est-ce que la
nouvelle application va aussi vite que l'ancienne ? » et « est-ce qu'elle
ressemble à ce qui a été conçu ? ».

---

## 1. Performance — l'essentiel est fait et mesuré

### Ce qui est établi, chiffres à l'appui

| Mesure | Ancienne | Nouvelle | Rapport |
|---|---|---|---|
| Poids total du code livré | **1 873 Ko** en un seul fichier | **554 Ko** répartis | ÷ 3,4 |
| Ce qu'il faut charger pour voir le premier écran | **1 873 Ko**, tout bloquant, plus des scripts CDN | **297 Ko** (81 entrée + 193 bibliothèques + 23 CSS) | ÷ 6,3 |
| Idem, compressé | non mesurable sur un fichier unique de cette forme | **90 Ko** | — |
| Écrans suivants | déjà chargés, mais tout l'était d'avance | **23 à 39 Ko**, à l'ouverture seulement | — |
| Bibliothèques bloquantes | Chart.js + jsPDF ≈ 627 Ko | **0** | — |

Trois causes, toutes traitées :

- **Chart.js remplacé par du SVG** écrit à la main (`GrapheBarres`), avec la
  donnée doublée en tableau accessible.
- **jsPDF remplacé par l'impression du navigateur.** « Imprimer → Enregistrer
  en PDF » produit le même fichier, pour zéro octet de dépendance.
- **Découpage par écran.** L'ancienne chargeait les six écrans avant d'en
  afficher un. Ici, chacun arrive à son ouverture, et les bibliothèques — qui
  ne changent pas d'un déploiement à l'autre — restent dans le cache du
  navigateur quand le code applicatif est modifié.

### Ce qui garde ces chiffres vrais

`npm run verifier:budget` contrôle **quatre postes séparément** à chaque
passage. Le plafond du code applicatif est à 80 Ko et **n'a jamais été relevé**
malgré trois dépassements : chaque fois, la cause était un sélecteur d'écran
différé tiré dans le lot d'entrée par un import partagé, et la réponse a été de
l'extraire (`selecteurs.activite`, `.facture`, `.achats`). Un budget qu'on
relève à chaque dépassement ne mesure plus rien.

### Ce qui n'est PAS mesuré, et c'est la vraie lacune

**On mesure des octets, pas du temps.** Personne n'a chronométré :

- le délai avant premier affichage sur un téléphone réel, en 4G ;
- le temps de rendu du planning ou du livre des recettes **avec un volume
  réel** — 500 écritures, trois ans d'historique ;
- le coût du recalcul à chaque frappe dans les écrans qui recalculent tout
  (Facturer constate les mentions manquantes à chaque caractère).

Le troisième point est le plus probable : tous les sélecteurs recalculent
depuis les faits, par choix — c'est ce qui rend la divergence impossible. À
petit volume c'est gratuit ; à gros volume, ça ne l'est plus forcément.

**Ce qu'il faut faire — une demi-journée, et c'est le meilleur emploi du temps
sur cet axe :**

1. Un jeu d'essai volumineux (3 ans, ~500 recettes, ~800 mouvements) injecté
   dans le vérificateur Playwright existant.
2. Mesure du temps entre navigation et titre visible, par écran, comparée à un
   seuil (par exemple 400 ms). Un `verifier:vitesse` à ajouter à la chaîne.
3. Si un écran dépasse : mémoïser le sélecteur coupable, jamais stocker son
   résultat — l'invariant n°5 tient.

Tant que ce n'est pas fait, la phrase honnête est : « la nouvelle application
télécharge six fois moins, et personne n'a encore vérifié qu'elle **s'affiche**
plus vite ».

---

## 2. Conformité au handoff — l'état réel

### Un aveu de méthode d'abord

La vague de conformité visuelle du 13/08 a été menée contre
`design/05-spec-ecrans.md`. Le **bundle de prototypes** (`handoff-v1.11/`) est
arrivé après, et **aucune comparaison écran par écran n'a été faite contre les
prototypes eux-mêmes**. Ce qui suit est donc établi par lecture du `README.md`
et de l'annexe du bundle — pas par une confrontation visuelle.

C'est la première tâche du plan, et elle conditionne le reste : tout chiffrage
d'écart fait sans avoir regardé serait une supposition.

### Ce qui est conforme, établi

| Élément du handoff | État |
|---|---|
| 4 palettes commutables, valeurs exactes de `v1.11.css` | ✅ et vérifié sur 140 combinaisons |
| Palette appliquée **avant le premier rendu**, sans flash | ✅ et vérifié par assertion |
| Rail 212 px desktop / dock flottant en pilule ≤ 760 px | ✅ vérifié par assertion sur `position` |
| Libellé sur l'onglet actif seul, en portrait | ✅ |
| Motif « texte replié derrière un i » | ✅ composant `Info`, cible 44 px |
| Badge par onglet (niveau 1 des alertes) | ✅ |
| Argent : Trésorerie / Performance en **onglets** | ✅ sémantique ARIA |
| Graphe CA : valeurs au-dessus des barres, k€ | ✅ |
| Panneau latéral (sheet) : piège de focus, Échap, voile | ✅ |
| Aucun débordement horizontal, 7 écrans × 5 tailles × 4 palettes | ✅ vérifié |

### Les écarts que je peux nommer

**A. L'indicateur « à traiter » n'existe que sur le Pilote.**
Le handoff en fait une pastille **présente sur les six écrans** (`.todofab`),
qui montre les sujets de l'onglet courant — et tout, sur le Pilote. Ici, « À
traiter » est une carte du seul Pilote.

Ce n'est pas cosmétique : depuis Achats, rien ne dit qu'Achats a cinq sujets en
attente. Le badge d'onglet le chiffre, mais il faut revenir au Pilote pour
savoir **lesquels**. C'est l'écart le plus fonctionnel des trois.

**B. Les pastilles Cloud / Documents / Qonto — refus maintenu.**
Le handoff prévoit quatre pastilles système. Trois sont **délibérément
absentes** : aucune intégration ne les alimente. Une pastille verte qui ne
mesure rien est pire qu'absente — c'est exactement le défaut reproché à
l'ancienne application, en plus discret.

Ce qui les rendrait légitimes, dans l'ordre de coût :
- **Cloud** : la synchronisation Supabase existe déjà. La pastille pourrait
  dire la vérité aujourd'hui — dernière synchro, état du compte. **C'est la
  seule des trois qui soit à portée, et elle vaut d'être faite.**
- **Documents** : suppose un choix d'emplacement (Drive, OneDrive…). Les
  justificatifs vivent dans IndexedDB ; la pastille dirait « cet appareil », ce
  qui est vrai mais maigre.
- **Qonto** : suppose une connexion bancaire DSP2. Hors de portée, et
  l'import CSV couvre le besoin.

**C. Détails de densité en portrait.**
Le handoff décrit des mises en page précises que rien n'a confronté :
un seul rang de filtres dans Achats, Config en grille 2 colonnes compacte,
tableaux larges à défilement dans leur carte, Flux du mois en trois colonnes
réduites. Le vérificateur garantit qu'**il n'y a aucun débordement** — pas que
la densité soit celle voulue.

---

## 3. Le plan, dans l'ordre

| # | Tâche | Pourquoi maintenant | Effort |
|---|---|---|---|
| 1 | **Comparaison écran par écran contre les prototypes du bundle**, captures à l'appui, sur les 4 palettes et 2 orientations | Tout chiffrage d'écart fait sans regarder est une supposition. Conditionne 3 et 5 | 1 j |
| 2 | **Mesure de vitesse sur volume réel**, ajoutée à la chaîne de vérification | Seule lacune franche de l'axe performance. Une régression de temps ne se voit pas autrement | ½ j |
| 3 | **Indicateur « à traiter » sur tous les écrans** | Écart de conformité le plus fonctionnel : depuis Achats, on ne sait pas ce qu'Achats attend | ½ j |
| 4 | **Pastille Cloud** | La synchronisation existe ; la pastille dirait enfin la vérité sur l'état du compte | ½ j |
| 5 | **Écarts de densité** relevés en 1 | Confort de lecture en portrait, là où l'application sera le plus utilisée | selon 1 |

Total : environ **trois jours**, dont un de constat.

### Ce qui ne figure pas dans ce plan, et pourquoi

- **Documents et Qonto** : rien ne les alimenterait. À rouvrir le jour où une
  intégration existe, pas avant.
- **Le score de santé sur 100** : la spécification note elle-même que ses
  valeurs sont codées en dur dans le prototype, sans fonction qui les calcule.
- **Les trois cartes Argent** (`FluxChart`, `CapaciteBarChart`,
  `VersementCard`) : elles demanderaient d'inventer des données, ou de
  contredire la décision D4 (réserve unifiée, source unique).

Ces refus ne sont pas des retards. Ils tiennent au même principe que le reste
du projet : **un chiffre affiché engage**, et mieux vaut une case absente
qu'une case qui ment.
