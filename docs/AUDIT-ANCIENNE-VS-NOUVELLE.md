# Audit fonctionnel — ancienne application vs nouvelle

**Date :** 13/08/2026
**Méthode :** inventaire des 769 fonctions de `index.html` (24 287 lignes),
confronté au périmètre de `app/` — 35 actions de magasin, 32 sélecteurs,
14 modules de calcul, 9 écrans. Chaque verdict est vérifié dans le code, pas
supposé.

**Légende :** ✅ présent · 🟢 amélioré · ⚠️ partiel · ❌ absent · 🚫 retiré
volontairement, avec la décision qui le justifie

---

## Le défaut de cet inventaire, corrigé le 14/08

> « Je me questionne sur pourquoi tu ne l'avais pas pris en compte de base, vu
> qu'on vise non pas juste à refaire un visuel conforme mais à y ajouter toute
> l'intelligence de l'ancienne appli — et ça comprend les formules, les
> indicateurs et les graphes. »

La remarque porte, et voici la cause exacte.

L'unité de cet inventaire était **la fonction** : un écran, une action de
magasin, un module de calcul. Les trois vérificateurs automatiques mesurent les
mêmes objets. Cette unité attrape bien une fonction entière qui manque — c'est
ainsi qu'ont été trouvés la relance, la CFE, le contrôle des identifiants.

Mais **un indicateur n'est ni un écran, ni une action, ni un module** : c'est
une ligne dans un écran. Un graphe aussi. Quand l'ancienne application affichait
un ratio quelque part et que le nouvel écran ne le reprend pas, rien ne
s'allume : l'écran existe, le magasin est câblé, les tests sont verts. Le trou
est **invisible par construction**. Une formule portée mais jamais affichée est
du code mort qui passe tous les contrôles.

Ce n'était donc pas une erreur de périmètre — le périmètre était juste — mais
un **trou d'instrumentation** : il manquait un recensement dont l'unité soit
« un nombre que l'utilisateur lit à l'écran ». Ce recensement existe désormais
et vit dans `AUDIT-GRAPHES-ET-INDICATEURS.md`. Il a trouvé du premier coup
**trois indicateurs faux**, dont deux affichaient des euros — et deux
affirmations fausses de ce document-ci, corrigées ci-dessous.

---

## Ce qu'il faut retenir

La nouvelle application est **plus juste** que l'ancienne partout où elle la
recouvre : le barème est daté et versionné, le livre des recettes est
conforme, les justificatifs ont valeur probante, l'occupation se calcule sur
un dénominateur réel. Ce n'est pas le sujet de cet audit.

Le sujet, c'est ce qu'elle **ne fait pas encore**. Sept manques recensés, dont
trois bloquants pour un usage quotidien — **les deux premiers sont corrigés
depuis**, et le second a fait apparaître un huitième manque que l'audit avait
laissé passer : le rythme de travail n'était saisissable nulle part.

| # | Manque | Pourquoi c'est bloquant |
|---|---|---|
| 1 | ~~**Aucune échéance ne peut être saisie**~~ | ✅ **Corrigé le 13/08.** `echeances` est devenu un fait du schéma (v3), avec sa carte dans Argent, et `etatPilote` / `etatArgent` / `fluxDuMois` lisent désormais le compte au lieu d'une liste vide. La migration trie en prime les charges legacy : les fiscales et sociales deviennent des **échéances payées**, plus des dépenses — une cotisation n'est pas un achat |
| 2 | ~~**Pas de clients opérationnels par mission**~~ | ✅ **Corrigé le 13/08.** Schéma v4 : le rythme et les ajustements appartiennent au **client opérationnel**, pas à la mission. Une ligne de planning et un CRA par client qui signe. Découvert au passage : **le rythme n'était saisissable nulle part** — une mission créée dans l'application avait un planning vide à jamais |
| 3 | ~~**Pas de versement de rémunération**~~ | ✅ **Corrigé le 13/08, autrement que demandé.** Le versement ne devient PAS un fait : ce serait le compter deux fois, puisque le virement figure déjà au relevé. C'est un mouvement bancaire à **nommer** — `sansContrepartie` passe du booléen au motif, et le Pilote affiche « déjà versé ce mois » face au besoin mensuel |

Les quatre autres — objectif de CA, projection de franchissement des seuils,
import OFX, restauration d'une sauvegarde — sont réels mais pas quotidiens.
**La restauration est faite depuis** : un export qu'on ne sait pas réinjecter
n'est pas une sauvegarde, c'est un fichier qui rassure.

Une remarque de méthode : le manque n°1 ne se voyait pas en lisant le code,
parce que le code existait. `Echeance` était un type complet, `provisions()`
savait l'utiliser, et les tests passaient. Ce qui manquait, c'était le **chemin
entre l'écran et lui** — la même famille de défaut que les quatre actions
câblées le matin même. Un paramètre `= []` qu'aucun appelant ne renseigne est
un trou qui ne fait échouer aucun test.

---

## 1. Facturation

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| Créer une facture, aperçu, numérotation | 🟢 | Les mentions obligatoires sont constatées **à chaque frappe**, avec l'amende encourue, et l'émission est bloquée tant qu'il en manque une. L'ancienne laissait émettre |
| `getNextInvoiceNumber`, `formatInvoiceNumber` | ✅ | `numeroSuivant`, continuité vérifiée |
| `validateInvoiceNumbering`, `repairInvoiceNumbers`, `swapInvoiceNumbers` | ⚠️ | Les trous et doublons sont **signalés** (`verifierConformite`), mais il n'existe pas d'outil pour les réparer ou permuter deux numéros. C'est probablement volontaire : réécrire un numéro émis est ce qu'un contrôle cherche |
| `setFactureStatus`, `togglePaid`, `markAllPaid`, `bulkSetFactureStatus` | 🟢 | Remplacés par `encaisserRecette` **avec date et mode de règlement obligatoires** (mentions du livre). Pas de passage en masse : chaque encaissement porte sa propre date |
| `logInvoiceAudit`, `getInvoiceRegistry` | 🟢 | Le registre est le livre lui-même, en ajout seul |
| `downloadInvoiceAsHTML`, `generateAndDownloadPDF` | 🟢 | Impression navigateur → PDF. 419 Ko de jsPDF en moins |
| `showSendInvoiceModal` — envoi par courriel | ❌ | Aucun envoi. Il faut passer par sa messagerie, avec le PDF imprimé |
| `attachInvoiceDragHandlers` — réordonner par glisser | 🚫 | L'ordre d'une facture au registre est chronologique, il ne se choisit pas |
| Avoir / annulation | 🟢 | Écriture inverse datée, les deux lignes restent visibles. L'ancienne supprimait |

## 2. Missions, planning, CRA

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| `buildMission`, `showMissionModal`, statuts | ✅ | Carnet complet, statuts `active` / `terminee` / `prospect` / `perdue` |
| **`mission.entites[]` — clients opérationnels** | ✅ | **Corrigé le 13/08** (schéma v4). Chaque client opérationnel porte son nom, sa teinte, ses coordonnées et **son rythme**. `entiteByDay` n'a pas été repris et n'a pas à l'être : chacun ayant ses propres journées, il n'y a plus rien à arbitrer — l'ancienne application avait trois sources pour une même journée, et rien n'indiquait laquelle faisait foi |
| Déclarer le rythme d'une mission | ✅ | **Ajouté le 13/08.** Il n'existait AUCUN écran pour le saisir : `rythmes` ne pouvait venir que de la migration, donc toute mission créée dans l'application avait un planning vide, définitivement. Semaine type à sept boutons, tour journée → demi-journée → rien, le même geste qu'au planning |
| `getScheduledDaysForMonth`, `joursParSemaine` | ✅ | `rythmes[]` par plages de dates, demi-journées comprises |
| `showDaysEditor`, `saveDaysFromEditor`, `recalcDaysTable` | ✅ | Vue semaine avec ajustement à la journée ; l'ajustement l'emporte sur le rythme, **y compris à zéro** |
| `fillAllDays` — remplir le mois d'un geste | 🚫 | **Sans objet ici.** Le planning se remplit déjà seul depuis le rythme, c'est le modèle même. Remplir à la main n'aurait de sens que sur un planning vide — et un planning vide se remplit en déclarant un rythme, pas en cliquant trente et une fois |
| `resetReelsToTheorique` — revenir au rythme | ✅ | **Ajouté le 13/08**, à la maille de la semaine. Le bouton n'apparaît que si elle porte une correction |
| `buildCRAData`, `generateCRAHTMLContent`, `generateCRAPDF` | 🟢 | Le CRA est **produit**, jamais saisi ; une mission par page à l'impression |
| `showCRAPreviewWithSend` — envoi au client | ❌ | Impression seulement |
| Congés, demi-journées, jours fériés | 🟢 | Fériés **calculés** (comput de Pâques compris) ; l'ancienne divisait par 20, une constante |
| `showWeeklyBreakdownModal` | ✅ | Vue semaine |

## 3. Argent, charges, trésorerie

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| **`getChargesData`, `showChargeModal`, `getChargeTypesList`, `updateEcheance`, `togglePaid`** | ✅ | **Corrigé le 13/08.** Carte « Échéances reçues » dans Argent : saisir, corriger, supprimer, marquer payée. Cinq natures — URSSAF, TVA, impôt, CFE, CFP. « Impôt PL » n'en est pas une : en versement libératoire les 2,2 % sont prélevés **avec** les cotisations (D2), donc c'est une échéance URSSAF. « Autres » non plus : une dépense professionnelle est une dépense, elle vit dans Achats |
| `showChargeRecurrente` — échéance récurrente | 🟢 | **Ajouté le 13/08**, mais comme une commodité de SAISIE : la répétition crée N échéances ordinaires et s'efface. L'ancienne stockait une règle à côté de ses instances, sans dire laquelle fait foi quand un appel réel diffère — et il diffère |
| Suivi du paiement d'une échéance | 🟢 | **Ajouté le 13/08.** La date du débit ET le montant réellement parti, pas une case « payée ». L'écart au montant appelé est conservé : c'est lui qui explique un solde qui ne tombe pas juste |
| `getAbsoluteBalance`, `showEditSoldeInitial`, `showTresoSettings` | ✅ | Solde initial et besoin mensuel saisissables (ajoutés le 13/08 — ils n'avaient **aucune interface** jusque-là) |
| `showSalaireModal`, `computeSalaireProjections` | 🟢 | **Corrigé le 13/08, en refusant la forme demandée.** L'ancienne application SIMULAIT son solde (encaissements moins charges), elle devait donc enregistrer le salaire pour le retrancher. Ici le solde est réel : le virement est déjà au relevé, et le saisir une seconde fois le compterait deux fois. Il se **nomme** — « rémunération que je me suis versée » dans Achats › Relevé — et le Pilote affiche « déjà versé ce mois » face au besoin mensuel. Se verser de l'argent n'est pas une opération comptable en micro : la personne et l'entreprise sont la même |
| `setGoalCA`, `showGoalModal`, `renderGoalWidget` | ❌ | Aucun objectif de chiffre d'affaires |
| `computeProjections`, `showProjectionAutonomieModal` | ⚠️ | L'autonomie en mois existe (`autonomieMois`) ; la projection détaillée et son écran, non |
| `calculerRendementMensuel`, `showRendementConfig` | ❌ | Suivi de rendement / placements : absent |
| Provisions à deux volets | 🟢 | Décision D3. Les deux volets fonctionnent depuis le 13/08 |
| Périodes déclarées | 🟢 | Ajouté le 13/08, par mois ou par trimestre selon la périodicité |
| `showWaterfallDetail`, `showAbsoluteWaterfallDetail` | ✅ | Carte de répartition du solde |

## 4. Fiscal et social

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| `getUrssafRate`, `getUrssafRateAt`, `getUrssafPeriod` | 🟢 | Barème **par intervalle de dates**, avec source et date de vérification. L'ancienne tronquait le mois à son année — juillet 2026 était calculé au mauvais taux |
| Ajouter une période de barème | 🟢 | Depuis l'application, avec sa source. L'ancienne exigeait un redéploiement |
| `calculateIR`, `getIRForYear`, `getTranche`, `showIRDetail` | ✅ | Simulateur dans Outils, détail par tranche |
| `addIRMonthlyProvisions` | ⚠️ | En versement libératoire, les 2,2 % sont intégrés ; au barème, l'acompte PAS est **saisi** et non calculé (décision D2 — le montant est notifié par la DGFiP). Pas de provision mensuelle automatique |
| `computeCFEEstimate`, `showCFESimulator`, `renderCFEResult` | ✅ | **Fait le 14/08, en refusant la grille.** `bareme/cfe.ts` porte les RÈGLES — exonération de création, base réduite de moitié la 1ʳᵉ année d'imposition, dispense sous 5 000 € de recettes N−2, calendrier, déclaration 1447-C. Aucune fourchette de base minimum n'est écrite : elle est fixée par la commune, et la grille en dur de l'ancienne était jugée non conforme par l'audit comptable. La carte demande l'avis et calcule base × taux, ou ne dit rien |
| Comparateur versement libératoire / barème | 🟢 | **Ajouté le 13/08. N'existait pas dans l'ancienne.** Le seul arbitrage du projet qui porte une date : l'option s'exerce avant le 30/09 pour l'année suivante. Il mesure ce que l'activité AJOUTE à l'impôt du foyer, et compare ce surcroît aux 2,2 %. L'éligibilité — plafond de revenu fiscal de référence — n'est **pas** vérifiée, faute d'un nombre officiel daté, et l'écran le dit |
| `getAcreInfo` | ⚠️ | L'ACRE s'applique au calcul ; pas de grille par période (noté au journal comme non traité) |
| `renderTVAModule`, seuils, franchise | ✅ | Jauges de seuils dans Argent |
| `projectTVADate` — date de franchissement projetée | ❌ | Le pourcentage s'affiche, la date probable non |
| `isTVAApplicable`, autoliquidation | 🟢 | Autoliquidation détectée à l'achat : TVA **due et non déductible** |
| Déclaration européenne de services (DES) | 🟢 | **N'existe pas dans l'ancienne.** 750 € d'amende par déclaration manquante, sans seuil |
| `exportFEC` | 🚫 | Décision D6, hors périmètre. Code conservé sur la branche de sauvegarde |
| `exportLivreRecettes`, `exportLivreRecettesPDF` | ✅ | Livre imprimable, et **conforme** — mentions obligatoires constatées une par une |
| `computeEcheancesReglementaires`, `getLegalMilestones`, `renderLegalTimeline` | ⚠️ | Les échéances réglementaires alertent (facturation électronique au 01/09/2026) ; pas de frise chronologique |

## 5. Achats, banque, justificatifs

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| Dépenses : ajouter, corriger, supprimer | ✅ | La correction a été câblée le 13/08 — elle **conserve** le justificatif et l'état de rapprochement |
| Justificatifs | 🟢 | Fichier conservé, empreinte SHA-256, horodatage. L'ancienne n'avait qu'un booléen `piece: true`, classé « sans valeur probante » par l'audit |
| `parseCSV`, `parseBankFile` | ✅ | Import CSV qui **dit ce qu'il a compris** : séparateur, colonnes, format de date, lignes écartées et pourquoi |
| `parseOFX` | ❌ | Le format OFX n'est pas lu. Certaines banques n'exportent que celui-là |
| `reconcileTransactions`, `scoreCandidate` | 🟢 | L'écran **propose**, l'utilisateur tranche. Correspondance au centime — une tolérance masquerait un écart de règlement |
| `editMovement`, `deleteMovement` | ⚠️ | Un mouvement importé ne se corrige pas à la main ; on réimporte le relevé (qui n'ajoute que ce qui manque) |
| État de rapprochement | 🟢 | Stocké et non redéduit à l'affichage |

## 6. Analyse et indicateurs

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| `getClientsStats`, dépendance client | 🟢 | Concentration sur le CA **encaissé de l'année**, pas du mois : mesurée sur un mois, elle sauterait d'un client à l'autre au gré des règlements |
| `compositionDSO`, délai de paiement | 🟢 | **Médiane** et non moyenne : un client qui paie à 30 jours neuf fois et à 300 une fois n'est pas un client à 57 jours |
| `compositionTxOccupation` | 🟢 | Dénominateur réel : jours ouvrables, fériés calculés, congés déduits |
| `compositionTJMEffectif`, `compositionMargeNette` | ❌ | **Absents.** Cette ligne annonçait « Présents » — c'était faux, aucune occurrence dans `app/src/`. Un inventaire qui se trompe dans ce sens coûte plus cher qu'un manque : il ferme le sujet |
| `showKPIComposition` — d'où vient un chiffre | ⚠️ | Les motifs « i » expliquent les règles, mais on ne peut pas déplier le calcul ligne à ligne |
| `calculateHealthScore` — score /100 | 🚫 | Refusé : la spécification elle-même note que les valeurs sont **codées en dur** dans le prototype, sans fonction qui les calcule. Une jauge à 72/100 qui ne mesure rien ressemble à une information |
| `getInsights`, `renderInsightsCritiques` | ❌ | Pas de conseils automatiques |
| `getCompareData`, `compDelta`, `computeTrend`, `createSparkline` | 🚫 | **Refusés, motif écrit.** `computeTrend` comparait trois mois à trois mois sur une facturation irrégulière : un client qui règle deux factures le même mois produisait « +180 % » sans qu'aucune activité n'ait changé. Une flèche qui s'affole se cesse d'être lue, puis se met à rassurer quand elle est verte. La comparaison N−1 reste utile — la troisième année, pas la première |
| `drawMainChart` | ✅ | Deux graphes, pas un. `GrapheBarres` en SVG là où l'on lit ; sur le pilier Performance, des colonnes en HTML **cliquables** — le handoff veut « clic sur un mois = composition », et un `<rect>` SVG n'est ni tabulable ni annoncé. 627 Ko de Chart.js en moins dans les deux cas |
| `drawPerfDonut` — destination du CA | 🚫 | Refusé : il redisait, en moins précis, ce que `Repartition` dit du solde |
| `drawSoldeChart` — courbe de solde | ❌ | **Absent**, et sans motif écrit jusqu'ici. Rien ne montre le solde au-delà du mois courant |
| `getActionsList`, `markActionDone` | ✅ | `aTraiter` — la liste des sujets, réelle |

## 7. Système

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| Thème, palettes | 🟢 | 4 palettes, appliquées **avant le premier rendu** (vérifié par assertion sur 140 combinaisons) |
| `togglePrivacy` | 🟢 | Mode confidentiel vérifié dans un vrai navigateur : **zéro montant lisible** sur les 7 écrans |
| Auth Supabase, synchro | 🟢 | Verrou optimiste **atomique côté serveur** ; l'ancienne écrasait |
| `_subscribeRealtime` — synchro temps réel | ❌ | Il faut recharger pour voir les changements d'un autre appareil |
| `exportData` / `exportJSON` | ✅ | Export JSON complet |
| `importData` / `importJSON` — **restauration** | ✅ | **Ajouté le 13/08.** Le fichier est lu, son contenu **annoncé** — tant de recettes, de dépenses, de missions —, et rien n'est écrasé avant confirmation. Le refus de fond (schéma plus récent que ce code) est relayé à l'écran plutôt qu'avalé |
| `showOnboarding` et sa séquence | ❌ | Aucun parcours de première ouverture ; on arrive sur un Pilote vide |
| `createSearchOverlay`, `performSearch` | ❌ | Pas de recherche globale |
| `initKeyboardShortcuts`, `createKeyboardHelp` | ❌ | Pas de raccourcis clavier |
| `createNotifCenter`, `updateNotifBadge` | ⚠️ | Les badges par onglet existent ; pas de centre de notifications avec historique |
| `adaptMobileGrids` | 🟢 | **Supprimé volontairement** : l'ancienne recalculait les grilles en JS, avec un bug vérifié — élargir au-delà de 600 px ne les restaurait jamais. Tout est en CSS (invariant n°7) |
| `luhnCheck`, `ibanMod97Check` | ✅ | **Repris le 14/08**, dans `calculs/identifiants.ts`. Clé de Luhn sur le SIRET (avec l'exception La Poste), clé mod-97 sur l'IBAN, calculée par réduction au fil de la lecture — un `Number` sur la chaîne entière donnerait un modulo faux **sans lever d'erreur**. On signale, on ne bloque jamais : une clé dit « improbable », pas « faux » |
| Pastilles Cloud / Documents / Qonto | 🚫 | Refusées : aucune intégration ne les alimente. Une pastille verte qui ne mesure rien est pire qu'absente |

---

## Ordre de traitement proposé

1. ~~**Les échéances**~~ — ✅ **fait le 13/08.** Schéma v3, quatre actions de
   magasin, carte dans Argent, tri des charges legacy à la migration. Le volet 1
   des provisions et les sorties du flux du mois sont débloqués.
2. ~~**Les clients opérationnels par mission**~~ — ✅ **fait le 13/08.**
   Schéma v4, migration des entités legacy, planning et CRA ventilés, et
   l'éditeur de rythme qui manquait.
3. ~~**Le versement de rémunération**~~ — ✅ **fait le 13/08**, sous une autre
   forme que celle demandée : un nom sur un mouvement, pas un fait de plus.
4. ~~**La restauration d'une sauvegarde**~~ — ✅ **faite le 13/08.**
5. Le reste — objectif de CA, projection de seuil, OFX, onboarding, recherche,
   raccourcis — au fil de l'usage.

Trois choses ne reviendront pas, et c'est délibéré : l'export FEC (D6), le
score de santé sur 100 (il ne mesurait rien), et le recalcul des grilles en
JavaScript (invariant n°7).

---

## Revue du 14/08 — ce que la relecture a trouvé

L'audit listait ce que l'ancienne application faisait et la nouvelle non. Il ne
regardait pas la question inverse : **ce que la nouvelle prétend faire et
n'atteint pas.** Trois trous s'y cachaient, tous du même genre — un fait au
schéma, migré depuis l'ancienne version, et aucun chemin pour l'atteindre.

| Trou | Conséquence | État |
|---|---|---|
| **`entreprise.adresse`, `codePostal`, `ville` saisissables nulle part** | L'adresse est une mention obligatoire ; `etatFacture` bloque l'émission sans elle, et le message renvoyait « à renseigner dans Config → Profil » **où le champ n'existait pas**. Une entreprise créée dans la nouvelle version ne pouvait émettre **aucune** facture | ✅ corrigé |
| **`entreprise.iban` / `bic` invisibles** | Repris à la migration, jamais affichés, absents du document imprimé. Le client recevait une facture régulière sur laquelle **rien n'indiquait où payer** | ✅ corrigé — bloc « Règlement » sur la facture, champs dans Config, clé mod-97 |
| **`poserPlageDeConges` jamais appelée** | Le calendrier posait un jour à la fois : trois semaines de vacances = vingt et un clics, et la demi-journée — portée par le schéma depuis la v2, comptée correctement par le solde — était **inatteignable** | ✅ corrigé — panneau de plage, réduite aux jours ouvrés |

Une quatrième, sans conséquence pour l'utilisateur : `ajouterEcheance` au
singulier était morte, doublée par sa version au pluriel. Retirée — deux chemins
pour le même fait finissent par diverger, et celui que personne n'emprunte n'est
jamais testé.

### Le garde-fou qui manquait

Les quatre se ressemblent, et ressemblent aux quatre actions non câblées du
13/08. Le journal en avait tiré une règle et **une commande à lancer à la
main**. Une règle qu'on doit penser à appliquer n'est pas une règle.

`verifier:cablage` la lance désormais à chaque passage de la chaîne : il lit les
actions déclarées par le magasin et vérifie que chacune est appelée depuis
ailleurs que ses propres tests. Vérifié par mutation — une action fictive
ajoutée au contrat fait échouer le script.

Ce qu'il ne peut pas voir : un bouton derrière une condition toujours fausse le
satisferait. C'est un **plancher**, pas une preuve — mais un plancher qui aurait
attrapé les cinq occurrences connues.

---

## Annexe — l'écart de 2 060 € sur le CA encaissé

**Question posée :** l'ancienne application annonce 43 030 € encaissés sur
2026, la nouvelle 40 970 €. Est-ce un défaut de la nouvelle, ou une différence
de définition&nbsp;?

**Réponse : une différence de définition, et la nouvelle a la bonne.**
Vérifié en lisant les deux calculs côte à côte.

### Ce que chacune compte

L'ancienne (`getIRForYear`, ligne 4391 de `index.html`) parcourt les factures
des missions et applique **trois filtres** que la nouvelle n'a pas :

| Filtre de l'ancienne | Effet | Pourquoi c'est discutable |
|---|---|---|
| `if (mis.statut === 'prospect' \|\| mis.statut === 'perdue') return` | Écarte **toutes** les factures d'une mission marquée perdue | Une mission perdue a pu être payée en partie avant de l'être. Cet argent est bien entré sur le compte, et l'URSSAF le réclamera |
| `if (f.jours <= 0) return` | Écarte les factures sans jours saisis | Une facture porte un montant. Qu'on ait ou non renseigné son nombre de jours ne change pas ce qui est arrivé sur le compte |
| `if (f.status === 'payée' && paymentMonth > nowYm) paymentMonth = nowYm` | **Ramène au mois courant** une date de paiement future | C'est le plus lourd : une facture payée avec une date en 2027 est comptée dans l'année en cours. Le chiffre de l'année en est gonflé, et celui de l'année suivante vidé |

La nouvelle (`caEncaisseAnnee`) ne retient qu'une chose : les recettes dont la
**date d'encaissement** tombe dans l'année. Sans filtre de statut de mission,
sans filtre de jours, sans repli de date.

C'est la définition du chiffre d'affaires encaissé en micro — ce qui est
réellement arrivé sur le compte cette année-là — et c'est celle que l'URSSAF
et le livre des recettes emploient.

### Le sens de l'écart concorde

Les trois filtres poussent dans le même sens : le troisième **gonfle** l'année
en cours en y attirant des paiements futurs, les deux premiers en **retirent**
des montants réels. L'ancienne annonçant *plus* que la nouvelle, le troisième
domine — ce qui est cohérent avec les données observées le 12/08, où des
écritures étaient datées de **janvier 2027**.

### Ce qui reste à faire, et pourquoi ce n'est pas urgent

Dire **laquelle** des trois lignes explique les 2 060 € demande les données
réelles, que ce dépôt ne contient pas et ne doit pas contenir. C'est un
rapprochement à faire dans l'application, écran Facturer&nbsp;: filtrer sur
« Encaissées », période « Année », et comparer la liste au détail de l'ancienne
version.

**Ce n'est pas un correctif à écrire.** Aligner la nouvelle sur l'ancienne
reviendrait à réintroduire trois erreurs de définition pour retrouver un
chiffre faux.
