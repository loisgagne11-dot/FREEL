# Audit fonctionnel — ancienne application vs nouvelle

**Date :** 13/08/2026
**Méthode :** inventaire des 769 fonctions de `index.html` (24 287 lignes),
confronté au périmètre de `app/` — 35 actions de magasin, 32 sélecteurs,
14 modules de calcul, 9 écrans. Chaque verdict est vérifié dans le code, pas
supposé.

**Légende :** ✅ présent · 🟢 amélioré · ⚠️ partiel · ❌ absent · 🚫 retiré
volontairement, avec la décision qui le justifie

---

## Ce qu'il faut retenir

La nouvelle application est **plus juste** que l'ancienne partout où elle la
recouvre : le barème est daté et versionné, le livre des recettes est
conforme, les justificatifs ont valeur probante, l'occupation se calcule sur
un dénominateur réel. Ce n'est pas le sujet de cet audit.

Le sujet, c'est ce qu'elle **ne fait pas encore**. Sept manques, dont trois
bloquants pour un usage quotidien :

| # | Manque | Pourquoi c'est bloquant |
|---|---|---|
| 1 | **Aucune échéance ne peut être saisie** | Le volet « échéances émises » est câblé sur une liste vide (`etatPilote(faits)`, `echeances = []`). Impossible d'enregistrer un appel URSSAF, un avis d'impôt, une CFE. Le flux du mois n'a donc **aucune sortie** — et le « disponible » est faux dans le sens dangereux : trop haut |
| 2 | **Pas de clients opérationnels par mission** | L'ancienne application porte `mission.entites[]` — plusieurs clients finaux derrière un même donneur d'ordre, chacun avec sa couleur, son contact et **son rythme hebdomadaire**, et une affectation jour par jour (`entiteByDay`). C'est exactement le cas «&nbsp;Mission via Scalian&nbsp;». La nouvelle n'a qu'un client par mission : le CRA ne peut pas être ventilé |
| 3 | **Pas de versement de rémunération** | `versable` se calcule, mais rien ne permet d'enregistrer qu'on s'est versé la somme. Le solde ne bouge donc jamais du fait d'un versement |

Les quatre autres — objectif de CA, projection de franchissement des seuils,
import OFX, restauration d'une sauvegarde — sont réels mais pas quotidiens.

Une remarque de méthode : trois de ces manques ne se voient pas en lisant le
code, parce que le code existe. `Echeance` est un type complet, `provisions()`
sait l'utiliser, et les tests passent. Ce qui manque, c'est le **chemin entre
l'écran et lui** — la même famille de défaut que les quatre actions câblées ce
matin.

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
| **`mission.entites[]` — clients opérationnels** | ❌ | **Manque n°2.** Plusieurs clients finaux par mission, chacun avec couleur, adresse, contact, courriel, téléphone et **rythme hebdomadaire propre** ; le planning affecte chaque journée à une entité (`entiteByDay`). Rien de tout cela n'existe |
| `getScheduledDaysForMonth`, `joursParSemaine` | ✅ | `rythmes[]` par plages de dates, demi-journées comprises |
| `showDaysEditor`, `saveDaysFromEditor`, `recalcDaysTable` | ✅ | Vue semaine avec ajustement à la journée ; l'ajustement l'emporte sur le rythme, **y compris à zéro** |
| `fillAllDays` — remplir le mois d'un geste | ❌ | Il faut ajuster jour par jour |
| `resetReelsToTheorique` — revenir au rythme | ❌ | Un ajustement posé ne se retire pas en bloc |
| `buildCRAData`, `generateCRAHTMLContent`, `generateCRAPDF` | 🟢 | Le CRA est **produit**, jamais saisi ; une mission par page à l'impression |
| `showCRAPreviewWithSend` — envoi au client | ❌ | Impression seulement |
| Congés, demi-journées, jours fériés | 🟢 | Fériés **calculés** (comput de Pâques compris) ; l'ancienne divisait par 20, une constante |
| `showWeeklyBreakdownModal` | ✅ | Vue semaine |

## 3. Argent, charges, trésorerie

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| **`getChargesData`, `showChargeModal`, `showChargePonctuelle`, `showChargeRecurrente`, `getChargeTypesList`, `updateEcheance`, `togglePaid`** | ❌ | **Manque n°1.** L'ancienne gère sept natures (URSSAF, TVA, IR, CFP, CFE, Impôt PL, Autres), ponctuelles ou récurrentes, avec un état payé. La nouvelle porte le type `Echeance` et sait le calculer — mais aucun écran ne peut en créer une, et `etatPilote(faits)` reçoit une liste vide |
| `getAbsoluteBalance`, `showEditSoldeInitial`, `showTresoSettings` | ✅ | Solde initial et besoin mensuel saisissables (ajoutés le 13/08 — ils n'avaient **aucune interface** jusque-là) |
| `showSalaireModal`, `computeSalaireProjections` | ❌ | **Manque n°3.** Le versable se calcule, mais rien n'enregistre le versement |
| `setGoalCA`, `showGoalModal`, `renderGoalWidget` | ❌ | Aucun objectif de chiffre d'affaires |
| `computeProjections`, `showProjectionAutonomieModal` | ⚠️ | L'autonomie en mois existe (`autonomieMois`) ; la projection détaillée et son écran, non |
| `calculerRendementMensuel`, `showRendementConfig` | ❌ | Suivi de rendement / placements : absent |
| Provisions à deux volets | 🟢 | Décision D3. Le volet 2 fonctionne ; le volet 1 est vide faute d'échéances (manque n°1) |
| Périodes déclarées | 🟢 | Ajouté le 13/08, par mois ou par trimestre selon la périodicité |
| `showWaterfallDetail`, `showAbsoluteWaterfallDetail` | ✅ | Carte de répartition du solde |

## 4. Fiscal et social

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| `getUrssafRate`, `getUrssafRateAt`, `getUrssafPeriod` | 🟢 | Barème **par intervalle de dates**, avec source et date de vérification. L'ancienne tronquait le mois à son année — juillet 2026 était calculé au mauvais taux |
| Ajouter une période de barème | 🟢 | Depuis l'application, avec sa source. L'ancienne exigeait un redéploiement |
| `calculateIR`, `getIRForYear`, `getTranche`, `showIRDetail` | ✅ | Simulateur dans Outils, détail par tranche |
| `addIRMonthlyProvisions` | ⚠️ | En versement libératoire, les 2,2 % sont intégrés ; au barème, l'acompte PAS est **saisi** et non calculé (décision D2 — le montant est notifié par la DGFiP). Pas de provision mensuelle automatique |
| `computeCFEEstimate`, `showCFESimulator`, `renderCFEResult` | ❌ | La CFE existe comme nature de dette, mais sans grille ni estimateur |
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
| `compositionTJMEffectif`, `compositionMargeNette` | ✅ | Présents |
| `showKPIComposition` — d'où vient un chiffre | ⚠️ | Les motifs « i » expliquent les règles, mais on ne peut pas déplier le calcul ligne à ligne |
| `calculateHealthScore` — score /100 | 🚫 | Refusé : la spécification elle-même note que les valeurs sont **codées en dur** dans le prototype, sans fonction qui les calcule. Une jauge à 72/100 qui ne mesure rien ressemble à une information |
| `getInsights`, `renderInsightsCritiques` | ❌ | Pas de conseils automatiques |
| `getCompareData`, `compDelta`, `computeTrend`, `createSparkline` | ❌ | Aucune comparaison à la période précédente, aucune tendance |
| `drawMainChart`, `drawPerfDonut`, `drawSoldeChart` | ✅ | `GrapheBarres` en SVG, avec la donnée **doublée en tableau accessible**. 627 Ko de Chart.js en moins |
| `getActionsList`, `markActionDone` | ✅ | `aTraiter` — la liste des sujets, réelle |

## 7. Système

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| Thème, palettes | 🟢 | 4 palettes, appliquées **avant le premier rendu** (vérifié par assertion sur 140 combinaisons) |
| `togglePrivacy` | 🟢 | Mode confidentiel vérifié dans un vrai navigateur : **zéro montant lisible** sur les 7 écrans |
| Auth Supabase, synchro | 🟢 | Verrou optimiste **atomique côté serveur** ; l'ancienne écrasait |
| `_subscribeRealtime` — synchro temps réel | ❌ | Il faut recharger pour voir les changements d'un autre appareil |
| `exportData` / `exportJSON` | ✅ | Export JSON complet |
| `importData` / `importJSON` — **restauration** | ❌ | On peut exporter une sauvegarde, pas la réinjecter. Une sauvegarde qu'on ne sait pas restaurer n'est pas une sauvegarde |
| `showOnboarding` et sa séquence | ❌ | Aucun parcours de première ouverture ; on arrive sur un Pilote vide |
| `createSearchOverlay`, `performSearch` | ❌ | Pas de recherche globale |
| `initKeyboardShortcuts`, `createKeyboardHelp` | ❌ | Pas de raccourcis clavier |
| `createNotifCenter`, `updateNotifBadge` | ⚠️ | Les badges par onglet existent ; pas de centre de notifications avec historique |
| `adaptMobileGrids` | 🟢 | **Supprimé volontairement** : l'ancienne recalculait les grilles en JS, avec un bug vérifié — élargir au-delà de 600 px ne les restaurait jamais. Tout est en CSS (invariant n°7) |
| `luhnCheck`, `ibanMod97Check` | ⚠️ | La validation SIRET/IBAN de saisie n'a pas été reprise |
| Pastilles Cloud / Documents / Qonto | 🚫 | Refusées : aucune intégration ne les alimente. Une pastille verte qui ne mesure rien est pire qu'absente |

---

## Ordre de traitement proposé

1. **Les échéances** — le type existe, `provisions()` sait s'en servir, il
   manque l'écriture et un écran. C'est le meilleur rapport valeur/effort, et
   ça débloque le volet 1 des provisions **et** les sorties du flux du mois.
2. **Les clients opérationnels par mission** — touche le schéma, le planning
   et le CRA. C'est le plus structurant, et c'est votre cas réel.
3. **Le versement de rémunération** — une action, un mouvement, une ligne au
   flux.
4. **La restauration d'une sauvegarde** — le pendant de l'export, quelques
   heures, et ça ferme un risque de perte de données.
5. Le reste — objectif de CA, projection de seuil, OFX, onboarding, recherche,
   raccourcis — au fil de l'usage.

Trois choses ne reviendront pas, et c'est délibéré : l'export FEC (D6), le
score de santé sur 100 (il ne mesurait rien), et le recalcul des grilles en
JavaScript (invariant n°7).
