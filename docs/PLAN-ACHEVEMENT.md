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

### Lot A — Argent · Performance

C'est là que le plus grand nombre d'indicateurs de l'ancienne application ont
disparu.

| # | Livrable | Capture | Critère d'acceptation | État |
|---|---|---|---|---|
| A1 | Quatre tuiles : CA réalisé, CA encaissé, À encaisser, Résultat projeté | `*-argent-performance` | Le résultat projeté annonce « après cotisations » et s'abstient si le taux est inconnu | ⬜ |
| A2 | Graphe CA réalisé vs encaissé, valeurs en k€ au-dessus, cumulé en pied | `*-argent-performance` | Les deux séries, les douze mois, le cumul en pied de carte | ⬜ |
| A3 | **Clic sur un mois → panneau Composition** | `*-argent-performance` | Réalisé ventilé par mission, encaissé par facture, reste à encaisser ; cible cliquable au clavier | ⬜ |
| A4 | « Tu peux te verser » + curseur de réserve en % | `*-argent-performance` | Le curseur écrit un fait ; la phrase dit le calcul en toutes lettres | ⬜ |
| A5 | Capacité de versement par mois, **versé à l'intérieur de la barre**, futur hachuré | `*-argent-performance` | Le futur se distingue du passé sans couleur seule | ⬜ |
| A6 | Objectif de CA sur le graphe : ligne de référence et allure attendue | `*-argent-performance` | Aucune ligne quand aucun objectif n'est fixé | ⬜ |

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
| 16/08 | Socle O | Outillage de contrôle en place. La première comparaison montre l'onglet Performance à trois tuiles sur quatre, sans composition au clic, sans capacité de versement et sans curseur de réserve. |
