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
| Rattacher une pièce à une facture existante | 🆕 | **N'existe dans aucune des deux.** Signalé par un utilisateur : « je n'ai aucun moyen de relier une facture déjà existante ». `infra/justificatifs.ts` ne savait joindre un fichier qu'à une DÉPENSE ; une facture de vente établie hors de l'application, ou reprise de l'ancienne version, n'avait aucun moyen d'être jointe à sa recette. Le panneau « Pièce jointe » du Facturier fait le même geste que celui d'Achats — dépôt, remplacement, vérification d'intégrité, détachement — et dit explicitement qu'une facture émise ICI n'en a pas besoin : elle se reconstruit depuis les faits |

## 2. Missions, planning, CRA

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| `buildMission`, `showMissionModal`, statuts | ✅ | Carnet complet, statuts `active` / `terminee` / `prospect` / `perdue` |
| **`mission.entites[]` — clients opérationnels** | ✅ | **Corrigé le 13/08** (schéma v4). Chaque client opérationnel porte son nom, sa teinte, ses coordonnées et **son rythme**. `entiteByDay` — QUEL client travaillait QUEL jour — n'était pas repris : chaque client gardait sa semaine type sur toute la mission (un client arrêté continuait au planning), toutes les corrections allaient au premier, et un client sans semaine type recevait le rythme entier (jours comptés deux fois). **Repris jour par jour depuis le lot 31 (16/11)** : plages partagées sans recouvrement, journées attribuées en corrections, jour partagé à une demi-journée chacun, client évincé lu « arrêté », rapport qui compte et nomme |
| Déclarer le rythme d'une mission | ✅ | **Ajouté le 13/08.** Il n'existait AUCUN écran pour le saisir : `rythmes` ne pouvait venir que de la migration, donc toute mission créée dans l'application avait un planning vide, définitivement. Semaine type à sept boutons, tour journée → demi-journée → rien, le même geste qu'au planning |
| Capacité de versement d'un mois à venir | ✅ | **Lot R.** Elle s'abstient tant que rien n'y est attendu, au lieu d'afficher un négatif né de dépenses projetées. L'ancienne application n'avait pas cet indicateur du tout |
| `getScheduledDaysForMonth`, `joursParSemaine` | ✅ | `rythmes[]` par plages de dates, demi-journées comprises |
| `showDaysEditor`, `saveDaysFromEditor`, `recalcDaysTable` | ✅ | Vue semaine avec ajustement à la journée ; l'ajustement l'emporte sur le rythme, **y compris à zéro** |
| `fillAllDays` — remplir le mois d'un geste | 🚫 | **Sans objet ici.** Le planning se remplit déjà seul depuis le rythme, c'est le modèle même. Remplir à la main n'aurait de sens que sur un planning vide — et un planning vide se remplit en déclarant un rythme, pas en cliquant trente et une fois |
| `resetReelsToTheorique` — revenir au rythme | ✅ | **Ajouté le 13/08**, à la maille de la semaine. Le bouton n'apparaît que si elle porte une correction |
| `buildCRAData`, `generateCRAHTMLContent`, `generateCRAPDF` | ✅ | **Lot P (29/08) : le générateur de CRA.** Atelier deux colonnes dans Outils › CRA — saisie à gauche, aperçu du document à droite, `Imprimer` et `Télécharger` en pied. Le document est une **synthèse hebdomadaire** : par semaine, les jours par client ventilés télétravail / sur site, la phrase de tâches, puis les totaux par client et le grand total. Le fichier téléchargé est **autonome** — il emporte sa feuille de style, parce qu'il s'ouvre chez le client sans notre application autour. **Depuis le 27/11, ce fichier est un vrai PDF** (« Télécharger le PDF », voir la section du 27/11) : le HTML autonome a quitté le CRA |
| Le CRA porte un montant | 🚫 | **Retiré au lot P.** La carte d'Activité affichait le total de jours ET sa valorisation au TJM sur le document. Un CRA qui porte un prix se renégocie au lieu de se signer. La valorisation reste sur l'écran Activité, où elle s'adresse à l'utilisateur, et ne figure sur aucun papier remis au client |
| La ventilation télétravail / sur site du CRA | ✅ | **Lot P.** Lue sur le `lieu` des journées du planning. Une journée dont le lieu n'a jamais été renseigné va dans une colonne `sans lieu` et **jamais** dans « télétravail » : une mission facturée « sur site » qui ne l'a pas été se conteste. Quand aucune journée du mois ne porte de lieu, les deux colonnes disparaissent au lieu d'afficher deux zéros |
| Les tâches accomplies de la semaine | ✅ | **Lot P, schéma 17 (`notesCra`).** Le seul fait du CRA qui se saisisse — tout le reste se dérive du planning. Enregistré par lundi ET par destinataire : la note d'un client ne suit pas sur le document d'un autre |
| Saisir les jours du CRA à la main | 🚫 | **Refusé au lot P**, contre le handoff qui pose des champs de saisie. « 2 jours de télétravail cette semaine » ne dit pas LESQUELS : les répartir inventerait des faits, ne pas les enregistrer donnerait un document qui contredit le planning. Les jours viennent du planning, en lecture seule, et se corrigent dans Activité |
| Aperçu de la facture PENDANT la saisie | ✅ | **Lot Q (29/08).** Le document ne s'affichait qu'APRÈS l'émission — geste irréversible : une facture irrégulière ne se corrige pas, elle s'annule par un avoir et se réémet sous un nouveau numéro. On remplissait donc à l'aveugle et on découvrait ensuite. L'atelier montre le papier à droite de la saisie, et il suit la frappe |
| Télécharger / imprimer une facture | ✅ | **Lot Q.** Depuis la rédaction (brouillon), après l'émission, et depuis la réédition d'une facture du livre. Fichier **autonome** : il emporte sa feuille de style, parce qu'il s'ouvre chez le client sans notre application autour |
| Le brouillon se distingue d'une facture émise | ✅ | **Lot Q.** Son numéro n'est pas encore attribué : deux brouillons du même jour portent le même, et l'un des deux deviendrait un doublon au livre de quelqu'un. Le bandeau part AVEC le fichier — c'est tout son intérêt |
| Montants HT **et** TTC sur la facture | ✅ | **Lot Q.** Total HT, TVA, net à payer. En franchise la ligne de TVA dit « — » plutôt que de disparaître : une ligne absente laisse croire à un oubli, une ligne assumée dit que la question a été traitée |
| `showCRAPreviewWithSend` — envoi au client | ❌ | Aperçu, impression et téléchargement au lot P. **L'envoi reste absent**, et avec lui les statuts « envoyé le », « validé », « archivé » que le handoff dessine dans sa liste « CRA récents » : aucun de ces trois faits n'est enregistré. La colonne montre donc les mois à documenter — ce qui est vrai — plutôt que des états simulés |
| Congés, demi-journées, jours fériés | 🟢 | Fériés **calculés** (comput de Pâques compris) ; l'ancienne divisait par 20, une constante. **Lot G** : le congé se pose depuis le plan de charge lui-même, à la demi-journée. Le calendrier séparé qui le portait arrondissait au JOUR — une matinée de congé gonflait le solde de moitié, en silence |
| `toggleConge` — poser un congé d'un clic | 🟢 | **Lot G** : le clic ouvre un éditeur au lieu de basculer. Un clic de plus sur le geste courant, et c'est le prix de trois choses que la bascule ne pouvait pas dire — le lieu, le client quand deux missions revendiquent la même moitié, et le congé à la demi-journée. Surtout, elle ne pouvait qu'AJOUTER une moitié, jamais la retirer à quelqu'un d'autre : une journée et demie posée sur un seul vendredi n'avait aucun geste pour la corriger |
| `showWeeklyBreakdownModal` | ✅ | Vue semaine |

## 3. Argent, charges, trésorerie

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| **`getChargesData`, `showChargeModal`, `getChargeTypesList`, `updateEcheance`, `togglePaid`** | ✅ | **Corrigé le 13/08.** Carte « Échéances reçues » dans Argent : saisir, corriger, supprimer, marquer payée. Cinq natures — URSSAF, TVA, impôt, CFE, CFP. « Impôt PL » n'en est pas une : en versement libératoire les 2,2 % sont prélevés **avec** les cotisations (D2), donc c'est une échéance URSSAF. « Autres » non plus : une dépense professionnelle est une dépense, elle vit dans Achats |
| `showChargeRecurrente` — échéance récurrente | 🟢 | **Ajouté le 13/08**, mais comme une commodité de SAISIE : la répétition crée N échéances ordinaires et s'efface. L'ancienne stockait une règle à côté de ses instances, sans dire laquelle fait foi quand un appel réel diffère — et il diffère |
| Suivi du paiement d'une échéance | 🟢 | **Ajouté le 13/08.** La date du débit ET le montant réellement parti, pas une case « payée ». L'écart au montant appelé est conservé : c'est lui qui explique un solde qui ne tombe pas juste |
| `getAbsoluteBalance`, `showEditSoldeInitial`, `showTresoSettings` | ✅ | Solde initial et besoin mensuel saisissables (ajoutés le 13/08 — ils n'avaient **aucune interface** jusque-là) |
| `showSalaireModal`, `computeSalaireProjections` | 🟢 | **Corrigé le 13/08, en refusant la forme demandée.** L'ancienne application SIMULAIT son solde (encaissements moins charges), elle devait donc enregistrer le salaire pour le retrancher. Ici le solde est réel : le virement est déjà au relevé, et le saisir une seconde fois le compterait deux fois. Il se **nomme** — « rémunération que je me suis versée » dans Achats › Relevé — et le Pilote affiche « déjà versé ce mois » face au besoin mensuel. Se verser de l'argent n'est pas une opération comptable en micro : la personne et l'entreprise sont la même |
| `setGoalCA`, `showGoalModal`, `renderGoalWidget` | 🟢 | **Livré** (V17, puis lot A6). Cette ligne annonçait « ❌ aucun objectif » alors que `AUDIT-GRAPHES-ET-INDICATEURS.md` le comptait parmi les livrés depuis des semaines&nbsp;: **deux documents en contradiction sur le même fait**, corrigé au bilan du 24/08 après vérification dans le code. `objectifCaAnnuel` est un fait réglé en Config, l'allure attendue se lit sur le graphe de Performance (repère mensuel) et l'écart s'exprime en JOURS d'avance ou de retard — pas en pourcentage, parce qu'un retard se rattrape en jours de travail |
| `computeProjections`, `showProjectionAutonomieModal` | ⚠️ | L'autonomie en mois existe (`autonomieMois`) ; la projection détaillée et son écran, non |
| `calculerRendementMensuel`, `showRendementConfig` | ❌ | Suivi de rendement / placements : absent |
| Provisions à deux volets | 🟢 | Décision D3. Les deux volets fonctionnent depuis le 13/08 |
| Périodes déclarées | 🟢 | Ajouté le 13/08, par mois ou par trimestre selon la périodicité |
| `showWaterfallDetail`, `showAbsoluteWaterfallDetail` | ✅ | Carte de répartition du solde |
| `data.tauxRecouvrement`, `data.dsoGlobal` | 🟢 | **Livré au lot N1.** L'ancienne affichait « Recouvrement 87 % · DSO moyen 42 j » ; la nouvelle n'avait que le délai PAR CLIENT (lot Q), sans rien qui l'agrège ni qui rapporte l'encaissé au facturé. Deux écarts assumés, et ce sont deux corrections&nbsp;: le taux porte sur les MONTANTS et non sur le nombre de factures (`nb payées / nb émises` donnait 50 % pour une facture de 300 € réglée et une de 12 000 € impayée), et le délai global est une MÉDIANE et non une moyenne (trois règlements à 30 jours et un à 151 donnent 60, un délai auquel rien n'est jamais arrivé). La moyenne reste affichée quand elle s'écarte de la médiane, parce que l'écart lui-même signale qu'un dossier traîne |
| Envoi vers le compte — garde-fou | 🟢 | **Élargi le 28/08.** Il ne se déclenchait que si l'appareil était VIDE. Un appareil rempli du JEU DE DÉMONSTRATION ne l'est pas&nbsp;: charger la démo pour regarder puis « enregistrer sur le compte » écrasait des données réelles par des factures fictives, sans confirmation, et le compteur de version n'y voyait rien d'anormal — la version distante était bien celle qu'on avait lue. La reconnaissance se DÉRIVE de l'identité de l'entreprise (nom et SIRET neutralisé, en conjonction)&nbsp;: aucun drapeau stocké, l'invariant n°1 l'interdirait. Qui renomme son entreprise sort de la reconnaissance, et c'est voulu — à ce moment-là il s'est approprié le dossier |
| **Composition d'un chiffre au clic** | 🟢 | **Ajouté au lot J3.** L'ancienne ouvrait la décomposition de « CA Encaissé HT » ou de « Marge Nette » ; la nouvelle n'affichait que quatre résultats de trésorerie, sans moyen de les recouper. Or ils s'enchaînent — le total de l'un est un terme du suivant — et c'est exactement ce que « je ne comprends pas les données » désignait après un import. Chaque tuile s'ouvre maintenant sur sa formule en toutes lettres, ses termes avec le nombre de faits qu'ils recouvrent, ce que le chiffre veut dire et ce qu'il tait. Deux écarts assumés avec l'ancienne : le panneau **mesure** l'écart entre sa colonne et le total au lieu de le supposer, et il **ne recalcule rien** — les parts du solde sortent de `soldeDerive` en même temps que le montant, jamais d'une copie des trois règles de tri qui ont déjà produit deux bugs |

## 4. Fiscal et social

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| `getUrssafRate`, `getUrssafRateAt`, `getUrssafPeriod` | 🟢 | Barème **par intervalle de dates**, avec source et date de vérification. L'ancienne tronquait le mois à son année — juillet 2026 était calculé au mauvais taux |
| Ajouter une période de barème | 🟢 | Depuis l'application, avec sa source. L'ancienne exigeait un redéploiement |
| `calculateIR`, `getIRForYear`, `getTranche`, `showIRDetail` | ✅ | Simulateur dans Outils, détail par tranche |
| `addIRMonthlyProvisions` | 🟢 (lot 27) | En versement libératoire, les 2,2 % sont intégrés ; au barème, l'acompte PAS est **saisi** et non calculé (décision D2 — le montant est notifié par la DGFiP). La provision de l'année se déplie mois par mois depuis le lot 27 (Argent › note d'impôt), avec la même règle que le total |
| `computeCFEEstimate`, `showCFESimulator`, `renderCFEResult` | ✅ | **Fait le 14/08, en refusant la grille.** `bareme/cfe.ts` porte les RÈGLES — exonération de création, base réduite de moitié la 1ʳᵉ année d'imposition, dispense sous 5 000 € de recettes N−2, calendrier, déclaration 1447-C. Aucune fourchette de base minimum n'est écrite : elle est fixée par la commune, et la grille en dur de l'ancienne était jugée non conforme par l'audit comptable. La carte demande l'avis et calcule base × taux, ou ne dit rien |
| Comparateur versement libératoire / barème | 🟢 | **Ajouté le 13/08. N'existait pas dans l'ancienne.** Le seul arbitrage du projet qui porte une date : l'option s'exerce avant le 30/09 pour l'année suivante. Il mesure ce que l'activité AJOUTE à l'impôt du foyer, et compare ce surcroît aux 2,2 %. L'éligibilité — plafond de revenu fiscal de référence — n'est **pas** vérifiée, et l'écran le dit ; **depuis le lot 34-bis**, le plafond lui-même est dit, lu sur le barème de l'impôt |
| `getAcreInfo` | ⚠️ | L'ACRE s'applique au calcul ; pas de grille par période (noté au journal comme non traité) |
| `renderTVAModule`, seuils, franchise | ✅ | Jauges de seuils dans Argent |
| `projectTVADate` — date de franchissement projetée | ✅ | **Présente**, contrairement à ce que cette ligne annonçait jusqu'au bilan du 24/08 — `franchissementPrevu` est calculée et affichée sur Argent&nbsp;› Trésorerie. Même contradiction que la ligne « objectif de CA » ci-dessus&nbsp;: l'inventaire des indicateurs la donnait pour livrée, celui-ci pour absente |
| `isTVAApplicable`, autoliquidation | 🟢 | Autoliquidation détectée à l'achat : TVA **due et non déductible** |
| Déclaration européenne de services (DES) | 🟢 | **N'existe pas dans l'ancienne.** 750 € d'amende par déclaration manquante, sans seuil |
| `exportFEC` | 🚫 | Décision D6, hors périmètre. Code conservé sur la branche de sauvegarde |
| `exportLivreRecettes`, `exportLivreRecettesPDF` | ✅ | Livre imprimable, et **conforme** — mentions obligatoires constatées une par une. **Lot 6 :** en CSV aussi, depuis « Exporter », pour un tableur français (`;`, BOM, virgule décimale), filtré sur l'année d'ENCAISSEMENT ; un nom de client qui commence comme une formule est neutralisé |
| `computeEcheancesReglementaires`, `getLegalMilestones`, `renderLegalTimeline` | 🟢 | Les échéances réglementaires alertent (facturation électronique au 01/09/2026) ; **depuis le lot 53, la frise de l'année les place** sur la ligne Formalités, avec les pièces qui expirent, et le calendrier `.ics` les exporte |

## 5. Achats, banque, justificatifs

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| Dépenses : ajouter, corriger, supprimer | ✅ | La correction a été câblée le 13/08 — elle **conserve** le justificatif et l'état de rapprochement |
| Justificatifs | 🟢 | Fichier conservé, empreinte SHA-256, horodatage. L'ancienne n'avait qu'un booléen `piece: true`, classé « sans valeur probante » par l'audit. Le rattachement, généralisé à une nature de fait (`dépense` ou `recette`, voir ligne « Rattacher une pièce à une facture existante » en section 1) — et une pièce liée à un fait encore existant, dépense ou recette, ne se supprime pas |
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
| `compositionTxOccupation` | 🟢 | Dénominateur réel : jours ouvrables, fériés calculés, congés déduits. **Lot C4** : le dénominateur est désormais ÉCRIT à l'écran sous la jauge, et l'occupation ne s'affiche plus qu'une fois par écran — elle était en tuile ET dans le panneau, avec deux calculs différents |
| Plan de charge — le créneau et le lieu | 🆕 | **N'existe dans aucune des deux.** L'ancienne stockait une quotité par jour : « 0,5 » ne disait ni quelle moitié ni où. Le schéma 14 pose les deux, et les vues semaine et mois les montrent — sans jamais les inventer sur une journée d'avant |
| `compositionTJMEffectif`, `compositionMargeNette` | ⚠️ | **Le mécanisme existe, ces deux-là n'y sont pas branchés.** Le lot J3 a livré la composition au clic — formule en toutes lettres, termes, ce que le chiffre tait — sur les quatre chiffres de TRÉSORERIE (solde, à garder de côté, disponible, versable). Le TJM effectif et la marge nette gardent leurs infobulles sans décomposition. Le coût de les ajouter est faible&nbsp;: `Composition` est générique, il n'y manque que les termes. Historique de la ligne&nbsp;: elle a annoncé « Présents » (faux), puis « Absents » (vrai alors), et voici son troisième état |
| `showKPIComposition` — d'où vient un chiffre | ⚠️ | Les motifs « i » expliquent les règles, mais on ne peut pas déplier le calcul ligne à ligne |
| `calculateHealthScore` — score /100 | 🚫 | Refusé : la spécification elle-même note que les valeurs sont **codées en dur** dans le prototype, sans fonction qui les calcule. Une jauge à 72/100 qui ne mesure rien ressemble à une information |
| `getInsights`, `renderInsightsCritiques` | ❌ | Pas de conseils automatiques |
| `getCompareData`, `compDelta`, `computeTrend`, `createSparkline` | 🚫 | **Refusés, motif écrit.** `computeTrend` comparait trois mois à trois mois sur une facturation irrégulière : un client qui règle deux factures le même mois produisait « +180 % » sans qu'aucune activité n'ait changé. Une flèche qui s'affole se cesse d'être lue, puis se met à rassurer quand elle est verte. La comparaison N−1 reste utile — la troisième année, pas la première |
| `drawMainChart` | ✅ | Deux graphes, pas un. `GrapheBarres` en SVG là où l'on lit ; sur le pilier Performance, des colonnes en HTML **cliquables** — le handoff veut « clic sur un mois = composition », et un `<rect>` SVG n'est ni tabulable ni annoncé. 627 Ko de Chart.js en moins dans les deux cas |
| `drawPerfDonut` — destination du CA | 🚫 | Refusé : il redisait, en moins précis, ce que `Repartition` dit du solde |
| `drawSoldeChart` — courbe de solde | ✅ | **Livré au lot B, refait au lot L1** : un graphe combiné entrées / sorties / niveau, sur l'année CHOISIE (janvier à décembre, plus de « douze mois glissants »). Comme l'ancienne, il trace le SOLDE — mais seulement sur les mois CLOS, où c'est un fait exact dérivé des faits (`soldeAuDernierJourDe`) ; l'ancienne le prolongeait aussi sur l'avenir en devinant une auto-versement, ce que celui-ci refuse toujours. Les mois à venir restent le disponible projeté, visuellement distinct (pointillés, « prévu ») — jamais un solde deviné, pour la raison que la carte détaille |
| `getActionsList`, `markActionDone` | ✅ | `aTraiter` — la liste des sujets, réelle |

## 7. Système

| Fonction de l'ancienne | Verdict | Détail |
|---|---|---|
| Thème, palettes | 🟢 | 4 palettes, appliquées **avant le premier rendu** (vérifié par assertion sur 140 combinaisons) |
| Icône d'onglet, icône d'écran d'accueil, manifeste | 🟢 | L'ancienne les portait en `data:` (PNG 192 et manifeste en ligne, « Freel - Gestion Freelance »). La nouvelle : logo validé le 22/11 (piste 1), `favicon.svg`, icône Apple 180 pleine, manifeste « Freel » avec icônes 192, 512 et masquable — fichiers servis, chemins relatifs. Tenu par `icones.test.ts` |
| `togglePrivacy` | 🟢 | Mode confidentiel vérifié dans un vrai navigateur : **zéro montant lisible** sur les 7 écrans |
| Auth Supabase, synchro | 🟢 | Verrou optimiste **atomique côté serveur** ; l'ancienne écrasait. **Lot 1 (06/11)** : un appareil resté sur une version ancienne ne peut plus écraser un compte écrit par une plus récente |
| `_subscribeRealtime` — synchro temps réel | 🟢 autrement (lot 42, 22/11) | Pas de canal permanent (audit produit, F9) : FREEL regarde le compte à l'ouverture, au retour au premier plan et au retour du réseau, et envoie quelques secondes après chaque modification. Un ordinateur resté ouvert se met à jour quand on y revient ; les deux côtés modifiés : « À choisir », jamais de fusion silencieuse. Voir la section du 22/11 ci-dessous |
| `exportData` / `exportJSON` | ✅ | Export JSON complet |
| `importData` / `importJSON` — **restauration** | ✅ | **Ajouté le 13/08.** Le fichier est lu, son contenu **annoncé** — tant de recettes, de dépenses, de missions —, et rien n'est écrasé avant confirmation. Le refus de fond (schéma plus récent que ce code) est relayé à l'écran plutôt qu'avalé. **Lot 1 (06/11)** : chaque élément de liste est contrôlé (un `[null]` faisait planter l'application à chaque ouverture) ; l'état local est **mis de côté** avant tout remplacement, et « Revenir à l'état d'avant » le rétablit |
| Sûreté de l'enregistrement local | 🟢 | **Lot 1 (06/11), absent de l'ancienne** : deux onglets ne s'effacent plus (écoute `storage`, contrôle de révision avant écriture) ; un stockage plein se signale sur tous les écrans au lieu d'avaler les saisies ; un écran qui plante affiche un filet avec téléchargement des données brutes au lieu d'une page blanche |
| `showOnboarding` et sa séquence | ❌ | Aucun parcours de première ouverture ; on arrive sur un Pilote vide |
| `createSearchOverlay`, `performSearch` | ✅ | **Lot 6.** ⌘K / Ctrl K : factures (brouillons compris), clients, missions, dépenses. Accents et casse ignorés ; un montant se cherche par sa valeur (« 1200 » trouve 1 200,50 €) ; le début d'un mot passe avant le milieu |
| `initKeyboardShortcuts`, `createKeyboardHelp` | ⚠️ | ⌘K seul (lot 6) ; pas d'autres raccourcis ni d'aide |
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
| **`poserPlageDeConges` jamais appelée** | Le calendrier posait un jour à la fois : trois semaines de vacances = vingt et un clics, et la demi-journée — portée par le schéma depuis la v2, comptée correctement par le solde — était **inatteignable** | ✅ corrigé — panneau de plage, réduite aux jours ouvrés. **Lot G** : `poserPlageDeConges` est devenue la source UNIQUE de l'écriture d'un congé, `basculerConge` ayant disparu avec la carte qui était son seul appelant |

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

## Lot 2 (07/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Saisie d'une échéance d'impôt | 🟢 | Nouveau choix « Ce qu'elle règle » : acompte de l'année, ou solde de l'impôt de l'année précédente (champ optionnel `exercice`). L'ancienne ne distinguait pas les deux |
| Déclarations URSSAF à zéro | 🟢 | Les périodes closes sans recette se marquent déclarées depuis l'échéancier ; l'alerte du Pilote peut enfin s'éteindre |
| Dates « aujourd'hui » | 🟢 | Date du calendrier local partout (une facture émise à 0 h 30 le 1er janvier n'est plus datée de l'année précédente) |

## Lot 3 (07/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Passage à la TVA en cours d'année | 🟢 | Le mois de TVA se déduit des encaissements (seuil majoré franchi, ou franchise perdue l'année d'avant) ; la saisie ne porte plus que l'option. Factures et dépenses lisent la même source : une facture émise après le franchissement porte la TVA sans attendre une saisie. L'ancienne exigeait la date à la main |
| Factures émises sans TVA après le franchissement | 🟢 | Nouveau sujet « à traiter » qui les compte ; il retombe quand elles sont annulées par un avoir |
| Annulation d'une facture avec TVA (avoir) | 🟢 | L'avoir reprend la TVA au signe opposé et entre au dossier de TVA du trimestre où il est émis, marqué « Avoir sur … ». Avant : la TVA de la facture annulée restait collectée |
| Situation du foyer (mariage ou Pacs) | 🟢 | Nouveau fait, facultatif, en Réglages → Trésorerie et dans le comparateur ; il fixe le plafond de la décote. L'ancienne ignorait la décote |
| Comparateur versement libératoire / barème | 🟢 | Reprend les parts, les autres revenus et la situation saisis en Réglages (il repartait de « 1 part, 0 € ») ; applique la décote |

## Lot 4 (07/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Reprise d'une sauvegarde de l'ancienne application | 🟢 | Les recettes reprises reçoivent désormais les champs apparus depuis (échéance, envoi, relances, TVA, pièce) : avant, l'échéance de chaque facture reprise était recalculée à chaque lecture. Une sauvegarde sans lieu sur les journées se reprend et se calcule (plan de charge, CRA) — testé |
| Jeu de démonstration (Réglages → Données) | 🟢 | Montre une activité sereine et se recale sur la date du jour ; l'ancienne n'en avait pas |
| Rappels réglementaires | 🟢 | La facturation électronique ne reste plus « en retard » pour toujours après sa date : « en vigueur », puis plus rien un mois après |

## Lot 5 (07/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Déclaration URSSAF | 🟢 | Date limite (dernier jour du mois suivant) ; « à faire avant le … » puis « en retard » ; base encaissée et montant à payer, sur le Pilote et dans l'échéancier. L'ancienne ne datait ni ne chiffrait la déclaration |
| Prénom | 🟢 | Saisi dans Réglages → Profil, pour la salutation seulement |
| Statuts du flux | 🟢 | Chaque facture et chaque échéance du mois a sa pastille, qui mène là où elle se met à jour |

## Lot 6 (07/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Mois parcouru | 🟢 | Un seul mois pour toute l'application, en tête de barre ; l'année n'en change que le millésime. L'ancienne avait une période par écran |
| Flux d'un mois passé ou à venir | 🟢 | **N'existe pas dans l'ancienne.** Passé : encaissé, payé, versé (au relevé). À venir : factures attendues à leur échéance, échéances dues. Aucun versable hors du mois courant |
| Création depuis n'importe quel écran | 🟢 | « + Nouveau » : facture, dépense, mission, congés — chaque entrée ouvre la saisie |
| Livre des recettes en CSV | 🟢 | Voir `exportLivreRecettes` |
| Recherche globale | ✅ | Voir `createSearchOverlay` |
| Liste des factures | 🟢 | Onglet « Factures » d'Activité (rail du handoff) ; les anciennes adresses y mènent |

## Lot 7 (07/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Synchronisation avec le compte | 🟢 | Une coupure réseau ne déconnecte plus (seul un refus 400/401 périme la session) ; 15 s au plus par requête ; une adresse en http est refusée à la saisie, avec le motif |
| Import de relevé CSV | 🟢 | « 1e5 » et « 12abc » ne sont plus lus comme des montants : la ligne est écartée et nommée ; un libellé cité sur plusieurs lignes reste un seul libellé |
| Impression, téléchargement | 🟢 | Cadre d'impression isolé et retiré après l'impression ; l'URL d'un export n'est plus révoquée avant que le navigateur l'ait lue |
| Sécurité du contenu | 🆕 | Politique CSP sans script en ligne non déclaré — l'ancienne n'en avait aucune |
| Autoliquidation de la TVA (franchise) | 🟢 | Montant corrigé (base × 20 %) ; libellé juste selon le régime |
| ACRE, IR 2025, plafond du micro | 🟢 | Voir l'inventaire des indicateurs, lot 7 |
| Brouillon de la facture du mois | 🟢 | Suit le mois de la barre du haut |

## Lot 8 (07/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Créer une dépense depuis une opération du relevé | 🆕 | Formulaire pré-rempli (fournisseur tiré du libellé, montant, date), dépense reliée à l'opération. L'ancienne ne le faisait pas |
| Relier une dépense à son opération, depuis Achats | 🟢 | Proposé quand une opération compatible existe ; « hors compte » sinon |
| Dépenses récurrentes | 🟢 | Repérées sans saisie (même fournisseur, même montant, mois voisins) et totalisées sur la période ; jamais générées d'avance |

## Lot 9 (08/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Réglages | 🟢 | Sept sections, chacune à son adresse (un lien peut ouvrir directement « Réserve & versements ») ; aucun réglage ajouté ni retiré |
| Barèmes appliqués | 🟢 | Lisibles dans Paramètres fiscaux (abattement, cotisations, VL, CFP, plafond, franchise), relus dans les fonctions des calculs |
| Livre des recettes en CSV | 🟢 | Aussi dans Données & export, avec le choix de l'année |
| Repartir de zéro | 🟢 nouveau | Vide l'application dans ce navigateur après confirmation ; l'état d'avant est mis de côté et se rétablit. Le compte distant n'est pas touché |
| Mentions légales des factures | 🟢 | Lisibles dans Facturation, tirées de la fonction qui les imprime |

## Lot 10 (08/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Sauvegarde des justificatifs | 🟢 nouveau | L'ancienne application n'exportait aucune pièce (livre des recettes, PDF et FEC seulement). Archive ZIP : faits, pièces nommées et rangées par année du fait et par nature, manifeste à empreintes, LISEZMOI ; lisible sans l'application |
| Restauration des justificatifs | 🟢 nouveau | Pièces recontrôlées (CRC et SHA-256) avant d'être redéposées avec leur identifiant et leur date de dépôt ; jamais de doublon ni de suppression ; « Ajouter seulement les pièces manquantes » laisse les faits intacts |
| Rappel d'archive | 🟢 nouveau | « Dernière archive le … » et pièces déposées depuis, en Données et sur Achats ; la date vit dans ce navigateur, hors des faits |

## Lot 11 (08/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Vérification des règles d'accès du projet | 🟢 nouveau | L'ancienne application documentait une règle pour `user_data` sans jamais vérifier qu'elle était appliquée. La nouvelle compte, sans session et sans rien lire, les lignes visibles avec la clé publique, sur ses deux tables |
| `docs/supabase.sql` | 🟢 | Porte aussi la règle de `user_data` (la même que l'ancienne documentait : l'ancienne application continue de fonctionner) |

## Lot 12 (09/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Provision d'impôt sur le revenu (`getIRForYear`, `addIRMonthlyProvisions`) | 🟢 | L'ancienne provisionnait l'impôt entier de l'année (encaissé + facturé) dès qu'une facture était connue, réparti sur les mois encaissés. La nouvelle prend la même assiette, planning compris, et met de côté le taux moyen de l'année sur ce qui est entré : rien n'est retenu sur un argent pas encore arrivé, et au 31 décembre l'impôt est entier |

## Lot 13 (09/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| TVA autoliquidée d'un franchisé | 🟢 | L'ancienne application l'ignorait ; la nouvelle la calculait (lot 7) sans la provisionner. Elle entre dans la provision TVA, en hypothèse |
| Détail de la dette « impôt » | 🟢 | Montre la provision d'impôt sur le revenu que le versable retient |

## Lot 15 (11/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Dossier de déclaration de TVA | 🟢 | Porte les achats autoliquidés du trimestre, par provenance ; son solde retombe sur la provision |


## Lot 16 (11/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Pointer un encaissement depuis le Pilote | 🟢 | L'ancienne application basculait la facture « payée » d'un clic, sans date ni mode. La nouvelle le faisait seulement dans le facturier ; le Pilote le fait désormais, avec les deux mentions du livre des recettes |
| Encaisser une facture annulée par un avoir | 🟢 | Accepté jusqu'ici par l'écriture, et proposé par le rapprochement bancaire pour un virement du même montant ; le rapprochement ne la propose plus, et l'écriture la refuse, comme son écriture d'annulation |
| Date d'encaissement dans le futur | 🟢 | Acceptée ; refusée par le formulaire, au facturier comme au Pilote |

## Lot 17 (11/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Pointer une échéance payée depuis le Pilote | 🟢 | Seulement à l'échéancier et dans le détail de la dette jusqu'ici ; aussi depuis la colonne Sorties du flux |
| Date du paiement dans le détail de la dette | 🟢 | « Payé aujourd'hui » seulement : un débit d'hier tombait dans le mauvais mois le premier du mois. Date et montant saisis, comme à l'échéancier |
| Date de débit dans le futur | 🟢 | Acceptée à l'échéancier ; refusée partout |

## Lot 18 (11/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Conserver le détail d'une facture émise | 🟢 | Schéma 20 : les lignes (désignation, quantité, prix unitaire, taux appliqué) sont gardées à l'émission, depuis l'éditeur comme depuis le brouillon du mois en franchise |
| Rééditer une facture à plusieurs taux | 🟢 | Refusée faute de détail ; rétablie depuis ses lignes |
| Émettre depuis le brouillon du mois, en franchise | 🟢 | TVA non portée (« inconnue ») : la facture ne se revoyait pas. TVA nulle et lignes conservées |

## Lot 19 (11/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Émettre la facture du mois hors franchise | 🟢 | Portait au livre une facture sans TVA ni lignes, impossible ensuite à revoir ou à télécharger ; ouvre l'éditeur prérempli, où le taux se choisit |
| Ajuster le brouillon du mois avant de l'émettre | 🟢 | Aucun chemin : il fallait tout ressaisir dans une facture vierge |

## Lot 20 (11/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Ventiler la TVA collectée par taux pour la déclaration | 🟢 | Absent des deux versions ; depuis les lignes conservées, ou le taux unique d'une facture ; les factures mêlées sans détail sont signalées, jamais réparties au hasard |

## Lot 21 (11/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Effacer le relevé importé | 🟢 | Sans confirmation, avec la perte de tous les rapprochements faits à la main ; confirmé, et la perte est chiffrée |
| Retirer une opération importée | 🟢 | Impossible sans tout effacer ; retrait d'une ligne, la pièce rapprochée reste au registre |

## Lot 22 (11/11) — ce qui change dans les fonctions

| Fonction | Verdict | Détail |
|---|---|---|
| Annuler une facture par un avoir | 🟢 | Confirmé ; la conséquence distingue l'encaissée (remboursement au livre à la date du jour, chiffre d'affaires à déclarer en baisse) de la facture due (neutralisée) |
| Avoir sur une facture envoyée | 🟢 | Impossible jusqu'ici : « envoyée » manquait à la condition du bouton |
| Écriture inverse au livre des recettes | 🟢 | Confirmée ; plus offerte sur une écriture déjà annulée, dont le second clic était refusé en silence |
| Supprimer un brouillon, une échéance, un client, une mission | 🟢 | Confirmés ; client et mission refusés le disent avant |
| Supprimer une dépense | 🟢 | Confirmée ; le mouvement du relevé rapproché à elle revient « à traiter » — il restait « Rapprochée » à une écriture disparue |
| Repasser une échéance à payer | 🟢 | Confirmé : la date et le montant du débit se perdaient d'un clic |
| Retirer une période URSSAF saisie, revenir au rythme d'une semaine | 🟢 | Confirmés |
| Détacher une pièce d'une dépense ou d'une facture | 🟢 | Confirmé : le fichier ne se rattache qu'en le redéposant, et la TVA d'une dépense cesse d'être récupérable |

## Lot 24 (11/11) — la bascule

| Fonction | Verdict | Détail |
|---|---|---|
| Consulter l'ancienne application | 🟢 | Toujours possible, sous `/legacy/`, en lecture seule : aucune écriture dans le stockage ni vers le compte (`verifier:bascule`) |
| Saisir dans l'ancienne application | ⚪ retiré, voulu | Une saisie y serait perdue ou écraserait la reprise ; le bandeau mène à la nouvelle version |
| Reprise de l'ancienne vers la nouvelle | 🟢 | Inchangée : même origine, même stockage — éprouvée sur le site assemblé |

## Lot 25 (11/11) — effacer ses données du compte

| Fonction | Verdict | Détail |
|---|---|---|
| Effacer ses données du compte (RGPD) | 🟢 nouveau | L'ancienne application n'en avait pas. Copie par copie, confirmé, prouvé par relecture ; la règle de suppression manquante est détectée au lieu d'un faux « effacé » |

## Lot 26 (12/11) — l'accueil à la première ouverture

| Fonction | Verdict | Détail |
|---|---|---|
| Onboarding de première ouverture | 🟢 | L'ancienne application avait un parcours en quatre étapes ; la nouvelle propose trois chemins et un profil minimal de six questions — celles dont dépendent cotisations, impôts et TVA |
| Signaler la démonstration | 🟢 nouveau | Bandeau tant que le jeu livré est là |

## Lot 27 (12/11) — l'impôt sur le revenu suit ses échéances réelles

| Fonction | Verdict | Détail |
|---|---|---|
| Provision d'impôt répartie par mois (`addIRMonthlyProvisions`) | 🟢 | L'ancienne posait une ligne « IR Estimé » par mois encaissé, au prorata du CA HT. La nouvelle déplie la provision mois par mois (encaissé, impôt du mois, acomptes prélevés, à garder fin de mois) ; le dernier mois retombe sur la provision du jour, acomptes appelés compris. Pas de case « payé » par mois : c'est l'acompte saisi qui règle, pas la ligne de provision |
| Solde de l'avis d'impôt | 🟢 nouveau | Saisi tel qu'il est écrit (reste à payer) ; découpé selon la règle officielle — une fois sous 300 €, quatre prélèvements de septembre à décembre au-delà, deux pour un avis tardif ; enregistré sur l'exercice qu'il règle |
| Première année BNC, puis l'automne suivant | 🟢 nouveau | Aucun acompte la première année ; à l'automne suivant, solde de N-1 et acomptes de N les mêmes mois, chacun sur son exercice — test d'intégration de bout en bout |
| Solde estimé de l'an passé dans la frise | 🟢 nouveau | Aux dates officielles, tant que l'avis manque |


## Lot 28 (13/11) — déclaration datée, opération ignorée (schéma 21)

| Fonction | Verdict | Détail |
|---|---|---|
| Statut d'une période déclarée | 🟢 | L'ancienne cochait « déclaré » sans date. La nouvelle date la déclaration (du jour par défaut, corrigeable, jamais future) et lit le cycle à déclarer → déclarée le … → payée le … ; « Annuler la déclaration » la défait |
| Écarter une opération du relevé | 🟢 nouveau | « Ignorer » : un virement entre ses comptes, une opération annulée. Distinct de « sans contrepartie » : l'une compte au solde, l'autre nulle part. Se reprend |
| Migration 20 → 21 | 🟢 | Descend dans les listes : les mois déclarés deviennent des périodes à date inconnue (aucune date inventée, doublons fondus), chaque mouvement reçoit `ignoree: false` ; un mois nu est refusé au schéma courant |

## Lot 56 (14/11) — la chaîne qui publie est verrouillée

| Fonction | Verdict | Détail |
|---|---|---|
| Publication du site | 🟢 | L'ancienne application se publiait sans contrôle. Désormais : actions épinglées par empreinte, jeton en lecture seule, audit bloquant des dépendances servies, `verifier` complet avant toute fusion et tout déploiement |
| Signaler une faille | 🟢 nouveau | `SECURITY.md` : signalement privé de GitHub, aucune adresse de courriel publiée |

## Lot 57 (14/11) — le compte garde la mémoire

| Fonction | Verdict | Détail |
|---|---|---|
| Revenir à un état précédent du compte | 🟢 nouveau | L'ancienne application écrasait sa ligne (`upsert`, dernier écrit gagne) sans rien garder. Le serveur garde les 20 états remplacés ; « Revenir à cet état » écrit le compte puis l'appareil, chacun gardant son filet |
| Effacer ses données du compte | 🟢 | Emporte aussi les états précédents, relecture à l'appui |
| Règles d'accès | 🟢 | Rôle connecté nommé, taille bornée, version imposée par le serveur. Actif une fois le SQL exécuté par le propriétaire |

## Lot 29 (14/11) — « Enregistrer en brouillon »

| Fonction | Verdict | Détail |
|---|---|---|
| Garder une facture en cours de rédaction | 🟢 | L'ancienne gardait un brouillon numéroté. La nouvelle le garde avec ses lignes, sans numéro ; il se reprend depuis le facturier et s'émet sous son identifiant (pièce jointe comprise). Supprimer reste confirmé |

## Lot 46 (14/11) — facture conforme 2026-2027 (schéma 22)

| Fonction | Verdict | Détail |
|---|---|---|
| Mentions légales de la facture | 🟢 | L'ancienne imprimait « 293 B du CGI » en dur. La nouvelle date la mention (CIBS au 01/01/2027, hypothèse sourcée), accole « EI », porte l'escompte, la nature des opérations, l'option débits et le SIREN du client |
| Référence de commande | 🟢 nouveau | Portée par la mission, reprise et figée sur chaque facture |
| Facturation électronique : réception | 🟢 | Rappel devenu état : « ma plateforme agréée » en Réglages l'éteint |

## Lot 33 (14/11) — « Reste à sortir » : un seul total

| Fonction | Verdict | Détail |
|---|---|---|
| Détail d'une dette par nature | 🟢 | L'ancienne n'avait pas de détail. La nouvelle en avait un dont le total différait de la vignette pour l'impôt, la TVA et la CFP ; il lit désormais la même source |

## Lot 35 (15/11) — mis de côté pour l'impôt (schéma 23)

| Fonction | Verdict | Détail |
|---|---|---|
| Virement vers le compte personnel « pour l'impôt » | 🟢 nouveau | L'ancienne ne distinguait que le salaire simulé. Se nomme dans le relevé ; solde la provision d'impôt de son exercice ; n'est pas une rémunération |

## Lot 58 (15/11) — l'ancienne version bridée, le cadre refusé

| Fonction | Verdict | Détail |
|---|---|---|
| Consulter l'ancienne application | 🟢 | Toujours sous `/legacy/`, en lecture seule, et désormais sous politique de contenu : Supabase d'une seule source épinglée avec empreinte (elle en essayait trois, en `@2` flottant ; deux répondaient 404), aucun script d'un autre hôte. L'original `index.html` n'est pas touché, seule la copie publiée l'est |
| Affichage dans un cadre par une autre page | 🟢 | Ni l'ancienne ni la nouvelle ne s'y affichent : elles restent vides. L'ancienne n'avait aucune protection |

## Lot 59 (15/11) — appareil perdu, fichier piégé

| Fonction | Verdict | Détail |
|---|---|---|
| Effacer ses données d'un appareil | 🟢 nouveau | L'ancienne n'avait que « vider » le navigateur à la main. « Effacer cet appareil » (Données) et « Se déconnecter et effacer cet appareil » (Compte) proposent l'archive, déconnectent, effacent données, pièces, session, réglages — ceux de l'ancienne version compris — et le prouvent en relisant |
| Se déconnecter | 🟢 | Dit désormais ce qui reste sur l'appareil |
| Relier un compte, changer de projet | 🟢 22/11 | L'adresse collée avec le chemin de l'API (`/rest/v1/`) est ramenée à son origine — elle rendait la connexion impossible et ne se corrigeait plus ; l'écran dit le projet relié et offre « Changer de projet » (déconnecté seulement ; depuis le parcours de première connexion du 22/11, aussi connecté, après confirmation — voir la dernière section) |
| Importer un relevé, une sauvegarde, une archive, une pièce | 🟢 | Bornés avant lecture, contrôlés en profondeur ; un fichier fabriqué est refusé avec le champ en cause. L'ancienne lisait tout, sans borne |
| Rester connecté sur deux onglets | 🟢 | Les deux onglets ne se déconnectent plus l'un l'autre au renouvellement de la session |
| Annonce d'une sauvegarde à restaurer | 🟢 | Un fichier que l'adoption refuserait est refusé dès l'annonce, sans proposer « Remplacer » |

## Lot 31 (16/11, logique) — une mission à plusieurs clients

| Fonction | Verdict | Détail |
|---|---|---|
| Reprendre les journées attribuées par client (`entiteByDay`) | 🟢 | Voir la ligne des clients opérationnels ; la vérification d'absence de perte compare désormais les journées mission par mission, mois par mois |
| Arrêter un client à une date | 🟢 nouveau | L'ancienne ne savait pas arrêter un client sans réécrire son passé. Borner ses plages et ses corrections, avec une confirmation chiffrée ; « arrêté le … » dérivé ; « Retirer » confirmé propose l'arrêt à la place |
| Facturer une mission à plusieurs clients | 🟢 nouveau | Schéma 24 : facture commune par défaut, ou une par client avec le payeur choisi dans le carnet ; le brouillon du mois se découpe par payeur |

## Lot 51, phase 1 (16/11)

| Fonction | Verdict | Détail |
|---|---|---|
| Exporter (menu de la barre) | 🟢 | Le menu quitte la barre ; chaque export vit avec ses données : livre CSV, sauvegarde et archive dans Données, factures dans le facturier, compte rendu dans Outils |
| Choisir le thème | 🟢 | Dans Réglages › Affichage, avec masquer les montants ; Calme par défaut |

## Lot 51, phase 2 (16/11) — le rail et les contenus

| Fonction | Verdict | Détail |
|---|---|---|
| Retrouver un écran par une ancienne adresse (favori, lien) | 🟢 | `#/argent`, `#/outils`, `#/config/…`, `#/activite/factures`, `#/achats/releve`… mènent au nouvel écran, une ligne de test par adresse ; `/v2/#/argent` finit sur `#/tresorerie` |
| Importer un relevé, rapprocher | 🟢 | Sous Trésorerie › Banque (`#/tresorerie/releve`), plus sous Achats |
| Compte rendu d'activité | 🟢 | Sous Activité › Compte rendu ; un lien venu d'ailleurs ouvre l'atelier, le clic sur l'onglet ne l'ouvre pas |
| Livre des recettes, TVA, DES | 🟢 | Depuis Obligations (`#/obligations/livre`, `#/obligations/tva`) ; le lien seul du pied du rail et de Config disparaît |
| Masquer les montants au téléphone | 🟢 | Interrupteur du volet « Plus » |
| « À traiter » | 🟢 | Les compteurs du rail et du volet ; chaque alerte mène à l'écran qui la règle : échéances → Obligations, factures en retard → Factures, seuils → Trésorerie, barème → Réglages |

## Lot 51, les cinq mots (16/11)

Aucune fonction ne change. L'ancienne version nommait le même montant de six
façons (constat E3) ; la nouvelle n'en garde qu'une par grandeur, et un
contrôle de lexique sur le texte rendu empêche les anciens noms de revenir.

## Lot 53, phase 3 (20/11) — l'écran Obligations

« Échéances reçues » et « Périodes URSSAF » sont retirées. Contrôle ligne à
ligne : chaque fonction des deux cartes est ATTEINTE ailleurs, et son test a
été repris à travers l'écran (`Obligations.gestes.test.tsx`) avant le retrait.

| Fonction des anciennes cartes | Verdict | Où elle vit maintenant |
|---|---|---|
| Saisir une échéance (cinq natures), `getChargesData` & co. | 🟢 | « + Saisir » en tête de « À faire et à venir » : le même formulaire, chargé au clic ; un dossier sans avis offre « Saisir l'avis » / « Saisir le paiement », nature et date posées |
| Échéance récurrente (`showChargeRecurrente`) | 🟢 | La répétition du formulaire (douze au plus), inchangée ; chaque appel d'une série URSSAF reçoit sa période |
| Ce qu'elle règle — acompte ou solde (impôt) ; solde de l'avis découpé, avis tardif, aperçu | 🟢 | Le formulaire, inchangé |
| Période réglée par un appel URSSAF saisi à la main | 🆕 | Champ « Période réglée », proposé d'après la date, « Aucune — une régularisation » possible |
| Suivi du paiement : date et montant réellement parti, écart conservé, date future refusée | 🟢 | Dossier de l'obligation : « Enregistrer le paiement » (« Pointer le prélèvement » pour l'impôt) sur chaque appel |
| Repasser à payer (confirmé) | 🟢 | Dossier, sur l'appel payé |
| Corriger, supprimer (confirmé, conséquence chiffrée) | 🟢 | Dossier › « Corriger » ouvre le formulaire, « Supprimer cette échéance » y reste confirmé |
| Périodes déclarées, déclarer à une date — le geste unique « Déclarée le … pour … € » | 🟢 | Dossier URSSAF : « Je l'ai déclarée le… », montant prérempli, appel créé |
| Déclaration à zéro | 🟢 | Dossier URSSAF : « Rien encaissé : à déclarer à zéro, c'est obligatoire » |
| Période en cours, pas encore déclarable | 🟢 | Dossier URSSAF ; la ligne dit « Déclarable le 1ᵉʳ juillet » dans le mois qui vient |
| Date de déclaration corrigeable, jamais future, vide = non enregistrée | 🟢 | Dossier URSSAF (et DES, TVA, revenus, 1447-C pour leur propre date) |
| Annuler la déclaration (confirmé quand l'appel créé part) | 🟢 | Dossier URSSAF ; « Annuler la déclaration » pour les autres natures |
| Montant à payer « taux manquant » | 🟢 | Dossier URSSAF, et « — » sur la ligne |
| « À faire avant le … » / « en retard », base encaissée | 🟢 | Pastille de la ligne, détail « … € encaissés », titre de l'écran |
| Résumé replié (reste à payer, prochaine date) et message du vide | 🟢 | Liste repliée : dû saisi et prochaine limite ; « Aucune échéance saisie : … surestimés » sous la liste |
| Couleur fixe par type de charge | 🟢 | Sur la ligne de la frise ; la liste suit la maquette, sans filet |
| Pointer une échéance depuis le Pilote, la Trésorerie | 🟢 | Inchangé ; et le détail du flux, le flux d'un autre mois, la carte CFE et les sujets « à traiter » ouvrent le dossier concerné (`#/obligations/<id>`) |

| Fonction nouvelle | Verdict | Détail |
|---|---|---|
| Frise de l'année par nature | 🆕 | URSSAF, TVA (DES comprise), Impôt, CFE, Formalités ; ● ◇ ○ ▲ |
| Dossier par obligation | 🆕 | URSSAF, TVA, DES, CFE, impôt, déclaration de revenus (5TE / 5HQ), formalité, pièce |
| Pièces à fournir | 🆕 | Vigilance, RC pro, avis SIRENE, plateforme ; modifiées sur place |
| Calendrier `.ics` | 🆕 | « Ajouter au calendrier » : un fichier, pas un abonnement |
| Nom de l'exploitant (jour de la CA3) | 🆕 | Demandé dans le dossier TVA quand il manque — il n'a pas encore de champ dans Réglages (lot 41) |
| Jeu de démonstration, recalé à la date du jour | 🟢 | Déclare aussi ses revenus des années passées, le 15 mai : recalé en juillet 2027, il annonçait la déclaration des revenus 2026 à faire, limite passée |

## Lot 34-bis (21/11) — caisse de retraite, plafond du versement libératoire, histoire de l'option (schéma 26)

L'ancienne application ne connaissait ni la Cipav, ni le plafond, ni l'histoire
de l'option : rien n'est perdu, tout est nouveau. La reprise de l'ancienne
version pose la SSI et une histoire vide — l'option reprise vaut depuis le
début, ce qu'elle disait.

| Fonction | Verdict | Détail |
|---|---|---|
| Caisse de retraite (`Entreprise.caisseRetraite`) | 🆕 | Réglages › Profil, en BNC seulement ; SSI par défaut et à la migration ; aucune liste de professions |
| Barème de la Cipav (`PERIODES_CIPAV`, `baremeDeLaCaisse`) | 🆕 | Daté et sourcé (décret n° 2024-484) ; seule source du barème appliqué avec les périodes saisies (`periodesUrssafEffectives`) ; l'ajout d'une période, le formulaire du barème et la fraîcheur d'« à traiter » ne lisent plus la table de la SSI |
| Plafond de revenu fiscal de référence du versement libératoire | 🆕 | `plafondRfrVersementLiberatoire`, lu sur `PERIODES_IR` ; refus motivé pour une année dont le barème manque ; sous le comparatif des Simulateurs |
| Option pour le versement libératoire | 🟢 | La case demande « Depuis quand ? » : « À partir du 1ᵉʳ janvier … (je change d'option) » garde l'année en cours ; « Depuis le début de mon activité (je corrige une erreur) » fait ce que faisait la case ; l'année de création, seulement la seconde. Passé le 30 septembre, le 1ᵉʳ janvier proposé est celui de l'année d'après, et « Demandé avant le 30 septembre » garde le suivant. Rien n'est écrit avant la réponse |
| Histoire de l'option (`Entreprise.historiqueVl`, `vlAu`) | 🆕 | Une lecture par mois pour la déclaration de revenus, la provision et le solde d'impôt, le versement libératoire au dû et à la déclaration URSSAF, le rail, Activité, Réglages |
| Contrôle d'un bloc venu d'ailleurs | 🟢 | Refuse une caisse inconnue, une histoire qui n'est pas une liste, une période sans mois lisible, des périodes dans le désordre |

## Lot 48 (21/11) — le carnet de commandes, Activité › Missions (schéma 27)

La liste des missions devient le tableau « Toutes les missions », sous trois
tuiles et la frise des douze mois. Contrôle ligne à ligne : chaque geste et
chaque lecture de l'ancienne liste est ATTEINT, et son test a été repris à
travers le tableau (`Activite.carnet.test.tsx`, `Activite.clientsMission.test.tsx`,
`Activite.test.tsx`) avant le remplacement.

| Fonction de l'ancienne liste | Verdict | Où elle vit maintenant |
|---|---|---|
| Ouvrir une mission (la ligne entière était le bouton) | 🟢 | Le nom de la mission, dans sa ligne ; au téléphone, une cible de 44 px |
| Modifier une mission (client, description, TJM, dates, délai, référence de commande, rythme) | 🟢 | Le formulaire, inchangé, ouvert depuis le nom |
| Arrêter une mission (statut terminée), la marquer perdue ou prospect | 🟢 | Le statut du formulaire ; la ligne passe sous « Terminées » |
| Supprimer une mission (refus motivé si une facture en relève, confirmation chiffrée) | 🟢 | Le formulaire, inchangé |
| Clients opérationnels : ajouter, arrêter à une date, retirer, facturer à part (lot 31) | 🟢 | Le formulaire, inchangé |
| « Pour A jusqu'au 13 mai, puis B » (lot 31) | 🟢 | Sous le nom de la mission, quand aucune référence de commande ne passe avant |
| Ajouter une mission | 🟢 | « + Ajouter une mission » en tête de l'écran ; le vide de l'onglet le propose ; « + Nouveau » et `#/activite/nouvelle-mission` inchangés |
| Facturé, encaissé, reste à rentrer | 🟢 | Colonnes Facturé et Encaissé ; « reste … » sous l'encaissé |
| « Chiffre du client, partagé avec N autre(s) » | 🟢 | « partagé avec N autre(s) » sous le facturé ; l'infobulle « Comment les montants sont rattachés » est gardée |
| Tarif, « TJM non renseigné » | 🟢 | Colonne Tarif |
| Statut | 🟢 | Colonne État, dérivée et plus riche (fin annoncée, à facturer, soldée…) |
| Compte de l'onglet (« Missions 6 ») | 🟢 | Inchangé |

| Fonction nouvelle | Verdict | Détail |
|---|---|---|
| Volume commandé (`Mission.joursCommandes`) | 🆕 | Demi-journées permises, refusé sinon ; vide = la mission suit son planning |
| Préavis de fin (`preavisFinJours`) | 🆕 | Vide = 60 jours (`PREAVIS_FIN_PAR_DEFAUT_JOURS`, la seule constante) |
| Reconduction tacite (`reconduction.dureeMois`) | 🆕 | `fin` reste l'échéance de la période en cours ; les suivantes se dérivent, jamais écrites |
| Probabilité d'un prospect (`probabilite`) | 🆕 | Demandée au seul prospect, effacée quand la mission n'en est plus un ; n'entre dans aucun total |
| Carnet signé, fin de visibilité, occupation du mois | 🆕 | Trois tuiles ; un prospect n'est jamais compté |
| Frise des douze mois et jours signés par mois | 🆕 | « 0 » tant qu'un contrat court, « — » au-delà |
| Filtres Toutes / En cours / Prospects / Terminées | 🆕 | Une perdue est rangée avec les terminées |
| Fin de mission annoncée | 🆕 | Bandeau de l'onglet ; sujet « à faire » sous Activité, « Préparer la suite » → `#/activite/mission-<id>` ; sort quand la fin est prolongée, la mission arrêtée ou la reconduction dite |
| Migration 26 → 27 | 🟢 | Descend dans chaque mission, quatre champs à `null` ; la reprise de l'ancienne version les pose à `null` ; un bloc venu d'ailleurs est refusé hors des bornes |

## Lot 49 (21/11) — la Trésorerie à douze mois (schéma 28)

L'écran est refait d'après `direction/tresorerie.html`. Contrôle ligne à ligne :
chaque geste de l'ancien écran est ATTEINT, son test repris à travers le nouveau
(`Tresorerie.test.tsx`, `Tresorerie.douze.test.tsx`, `Tresorerie.annee.test.tsx`,
`Obligations.gestes.test.tsx`) avant le retrait des modules (`Argent.tresorerie`,
`Argent.projection`, la moitié « versement » d'`Argent.performance`).

| Fonction de l'ancien écran | Verdict | Où elle vit maintenant |
|---|---|---|
| Ouvrir la formule du solde, du disponible (Composition) | 🟢 | Le libellé de la ligne de la cascade, et celui de « À te verser » en plus |
| « Pointer le versement au relevé », avec son aide | 🟢 | « Verser sur mon compte » ouvre l'aide et mène au relevé (`#/tresorerie/releve`) ; rien n'est enregistré |
| Régler la part gardée au curseur (carte « Tu peux te verser », Réglages › Réserve) | 🔴 retirée, décision 24 | Le fait `partGardeeAuVersement` quitte le schéma (28) ; la réserve porte seule la prudence ; un bandeau dit une fois l'ancien pourcentage, « Relever ma réserve » mène à Réglages › Réserve, « Compris » le fait taire (`modifierEntreprise`) |
| Ouvrir le détail d'une enveloppe du dû (déclarer un mois estimé, payer un appel) | 🟢 | Une ligne de « Ce qui est dû » ouvre le même détail (`PanneauDetailDette`), avec les volets et la couverture |
| Choisir l'année (menu « Année ») | 🟢 autrement | La bascule « 12 mois à venir \| Année N » ; dans la vue Année, « ‹ 2025 » et « 2027 › » quand l'année existe dans les faits |
| Déplier / replier les cartes (Répartition, Enveloppes, Seuils, Projection) | 🔴 retiré | Les cartes de la maquette ne se replient pas ; le détail du dû est à un clic, le tableau des douze mois aussi |
| Ouvrir le relevé, l'importer (carte Banque, `#/tresorerie/releve`) | 🟢 | Inchangé, en pied |
| L'impôt mois par mois (pli sous la note d'impôt) | 🟢 | Dans le détail de la ligne « Impôt sur le revenu » |

| Fonction nouvelle | Verdict | Détail |
|---|---|---|
| Douze mois glissants, trois mois constatés | 🆕 | Le passé recalculé depuis les faits de ce soir-là (`faitsAu`), jamais stocké |
| Le dû posé à sa date dans le solde prévu | 🆕 | URSSAF, formation et versement libératoire à la limite de la déclaration de leur période ; impôt au barème à ses prélèvements ; TVA à sa déclaration (lue sur les obligations) ; CFE avec son avis |
| Point bas annoté | 🆕 | Le mois le plus bas, versement tenable déduit |
| « + Compter le prospect », « Et si une mission s'arrête… » | 🆕 | État d'écran, jamais un fait, remis à zéro en quittant l'écran ; prospect compté en entier, jamais pondéré ; l'arrêt coupe le planning après la date |
| Seuils franchis par le pipeline, jours facturables | 🆕 | Factures émises à leur échéance, planning signé au délai du client ; jours au tarif moyen des missions signées de l'année, refusés sans tarif |
| Vue Année | 🆕 | Disponible de chaque fin de mois, entrées et sorties, capacité de versement |
| Migration 27 → 28 | 🟢 | Retire `partGardeeAuVersement`, pose `entreprise.partGardeeRetiree` (le pourcentage) quand il valait plus que 0 ; la reprise de l'ancienne version n'en pose aucune ; un pourcentage venu d'ailleurs hors de 1 à 100 est refusé ; un dossier 29 est refusé |

## Lot 50, phase A (21/11) — ce qui change dans les fonctions

Aucun écran, aucun geste retiré. Une règle déplacée, et la suppression d'une
mission qui la suit.

| Fonction | Verdict | Détail |
|---|---|---|
| Supprimer une mission (refus motivé si une facture en relève) | 🟢 plus juste | Le refus lit la règle du facturé (`rattacherFactures`) au lieu de sa propre fenêtre de dates : une facture partie après la fin retient la mission (l'audit du jeu d'essai se supprimait en laissant sa facture au registre sans rien qui l'explique) ; une facture qu'une référence de commande donne à une autre mission ne la retient plus ; un brouillon d'un de ses payeurs la retient toujours. Message : « N recette(s) de ce client revient/reviennent à cette mission » |
| Le facturé d'une mission, la composition d'un mois | 🟢 une source | Une seule fonction (`calculs/rattachementFactures`) ; la copie de `selecteurs.performance` a disparu |
| Projection de trésorerie | 🟢 plus juste | Au barème, l'impôt des encaissements à venir ; chez un redevable, la TVA encaissée et sortie à sa déclaration (voir `AUDIT-GRAPHES-ET-INDICATEURS.md`, lot 50) |

## 22/11 — Réglages › Compte & synchronisation, le parcours de première connexion

L'écran est refait d'après `direction/compte.html`. Contrôle ligne à ligne :
chaque geste de l'écran d'avant est ATTEINT, et ses tests passent à travers le
nouveau (`Compte.test.tsx`, adapté aux libellés de la maquette ; les quatre
tests de la saisie du projet sont repris par l'étape 3 du guide dans
`Compte.parcours.test.tsx`).

| Fonction de l'écran d'avant | Verdict | Où elle vit maintenant |
|---|---|---|
| Relier un compte : adresse et clé, « Enregistrer » | 🟢 plus sûr | Guide, étape 3 (ou « J'ai déjà un projet Supabase ») : « Vérifier » n'enregistre qu'un projet joint avec une clé acceptée ; l'adresse collée avec `/rest/v1/` est ramenée à son origine et le champ le montre ; une adresse en `http:` est refusée avant tout envoi, avec le motif |
| L'aide « Où trouver ces informations » (renvoyait au fichier `docs/supabase.sql` du dépôt) | 🟢 autrement | Les étapes 1 à 3 du guide, les aides sous les champs, et « Copier le script » qui copie le fichier lui-même |
| « Projet relié » et « Changer de projet » (déconnecté seulement) | 🟢 élargi | « Projet relié » en tête de « Ton compte » ; « Changer de projet » en pied de la santé du projet, déconnecté d'un geste, **connecté** après confirmation (déconnexion, puis l'étape 3). Absent quand le projet est fixé au build |
| Se connecter | 🟢 | Onglet « Me connecter » de « Ton compte » |
| Reprise de la session au chargement, renouvellement sous verrou | 🟢 inchangée | `Compte.tsx` ; `verifier:onglets` cherche désormais « Me déconnecter » |
| L'aide « Ce que fait la connexion au compte » | 🟢 | Au titre de la carte « Sauvegardé » |
| Connecté, serveur, « Compte enregistré le », « Cet appareil » | 🟢 | Carte « Sauvegardé » : Projet (l'hôte), Connecté, Cet appareil ; la date devient « Dernier envoi à … » (l'heure du compte distant, déjà lue) |
| État du compte illisible : envoi désactivé, avertissement | 🟢 inchangé | Même phrase, pastille « état inconnu » |
| « Enregistrer cet appareil sur le compte » — conséquence, confirmation (appareil vide, démonstration), conflit, refus d'un compte plus récent | 🟢 inchangé | « Dans un sens précis », sous « Synchroniser maintenant » |
| « Charger le compte sur cet appareil » — aperçu, refus d'un bloc plus récent, compte vide | 🟢 inchangé | Idem |
| « Reprendre les données de l'ancienne application » — aperçu, rapport, anomalies | 🟢 | Carte « Plus rarement » |
| Se déconnecter | 🟢 | « Me déconnecter » ; même message sur ce qui reste sur l'appareil |
| Se déconnecter et effacer cet appareil | 🟢 | « Plus rarement » |
| États précédents du compte (voir, revenir) | 🟢 | « États précédents » en pied de la santé : la liste se lit dès l'ouverture (le clic l'a déjà demandée) |
| Effacer la copie de cette version, effacer les données de l'ancienne application, bilan relu, identifiant à supprimer dans le tableau de bord | 🟢 | « Plus rarement » ; le message « règle absente » renvoie au script que l'étape 2 copie |
| Règles d'accès : verdict par table, « Vérifier », « vérifié le », alerte et SQL copiable | 🟢 | Santé du projet : « Un inconnu ne lit rien » (heure de la vérification), « Le détail, table par table » (ouvert d'office quand quelque chose cloche), les mêmes alertes, « Vérifier à nouveau » |

| Fonction nouvelle | Verdict | Détail |
|---|---|---|
| Rien n'est relié : deux portes | 🆕 | « Me guider pas à pas », « J'ai déjà un projet Supabase » ; « Sans compte » mène à Données & export |
| Guide en cinq étapes | 🆕 | Fait ✓, en cours vert, à venir estompé ; l'étape survit à l'aller-retour vers supabase.com (stockage de l'onglet), jamais dans les faits |
| « Copier le script » | 🆕 | `docs/supabase.sql` lu au build (`?raw`), module chargé à la demande ; presse-papiers refusé → le script s'affiche sélectionné |
| « Vérifier » : un constat par maillon | 🆕 | Projet joignable (injoignable : la forme attendue ; ne répond pas : la pause), clé acceptée (clé refusée : la clé anon ; clé service_role reconnue, jamais envoyée ni gardée), base préparée (absente : refaire l'étape 2 ; une table sur deux : réexécuter), règles d'accès, inscriptions fermées. Aucun texte du serveur affiché |
| Créer mon compte | 🆕 | Confirmation demandée (« un courriel est parti à … »), adresse déjà inscrite (y compris l'utilisateur factice sans identité), mot de passe trop faible, inscriptions fermées, adresse hors de l'équipe du projet, envoi limité |
| Mot de passe oublié | 🆕 | Lien PKCE ; retour par `?code=`, retiré de l'adresse avant le premier rendu ; nouveau mot de passe ; lien expiré, déjà servi ou ouvert dans un autre navigateur : dit, avec le geste |
| Adresse de retour à déclarer | 🆕 | Affichée et copiable sous « Créer mon compte » et « Mot de passe oublié ? » |
| Inscriptions fermées, offre gratuite en pause | 🆕 | Constatées par relecture (étape 5, santé) ; la pause dite, et comment rouvrir |
| « Sauvegardé » et sa pastille | 🆕 | À jour, à envoyer, à recevoir, diffère, rien encore — dérivée des deux côtés (`selecteurs.synchro`), rien de stocké ; la démonstration ne compte pas comme des données. **Depuis le lot 42**, c'est l'état de la première liaison seulement : synchronisé, l'appareil dit l'état du moteur (section suivante) |
| « Synchroniser maintenant » | 🆕 | Relit le compte, puis ne prend que le sens certain (compte vide : envoyer ; appareil vide : montrer avant de charger), par les mêmes confirmations ; sinon il fait choisir |

`docs/supabase.sql` : la règle de `user_data` ne se pose plus que si la table
existe. Sur un projet neuf, elle échouait et l'éditeur SQL annulait tout le
script, table des faits comprise (constaté sur un Postgres 16 local) — un
nouvel utilisateur ne pouvait pas préparer sa base.

## 22/11 — Lot 42 : la synchronisation automatique, sans temps réel

Avancé à la demande du propriétaire : relié sur téléphone et ordinateur, il
devait « Enregistrer » sur l'un puis « Charger » sur l'autre. L'ancienne
s'abonnait au temps réel (`_subscribeRealtime`) et écrasait le compte sans
contrôle de version ; la nouvelle ne garde aucun canal ouvert, et ne fusionne
jamais en silence.

| Fonction | Verdict | Détail |
|---|---|---|
| Recevoir ce qu'un autre appareil a enregistré | 🟢 autrement | À l'ouverture, au retour au premier plan (`visibilitychange`), au retour du réseau (`online`) : si cet appareil n'a rien changé, il prend le compte — par `adopterFaitsDistants` (validation du schéma, copie de côté). Pas pendant une saisie : un volet modal ouvert ou un champ au focus font attendre qu'il se ferme |
| Envoyer ce qui change ici | 🟢 | Trois secondes après la dernière modification, et au mieux en quittant (`keepalive` sous 64 Kio). Le filtre `version = base` reste : refusé, le moteur relit et repasse par la règle |
| Les deux côtés ont changé | 🟢 plus sûr | « À choisir » : les dates des deux côtés, « Garder ce que j'ai ici » (l'état écarté part dans les vingt états précédents du serveur) ou « Prendre celui du compte » (l'état d'ici mis de côté dans Données), chacun précédé de « Télécharger la version que tu écartes » |
| Un compte écrit par une version plus récente | 🟢 | Ni pris ni écrasé, même modifié ici : « Mets FREEL à jour » |
| Compte effacé ailleurs, version qui recule, bloc illisible | 🆕 | « À vérifier » : dit, rien n'est renvoyé tout seul — un effacement demandé ailleurs n'est pas défait |
| Appareil vidé (« Repartir de zéro ») | 🟢 | Ne vide pas le compte tout seul : « À choisir » |
| La démonstration | 🟢 | Ni envoyée, ni remplacée par les vrais chiffres au retour sur l'onglet |
| Deux onglets | 🟢 | Un seul travaille à la fois (verrou du lot 59), l'autre relit la base : une modification ne part qu'une fois |
| Session expirée, refusée | 🟢 | Renouvelée sans bruit ; refusée : « Reconnecte-toi », rien de perdu |
| Hors ligne, retard affiché | 🆕 | La pastille dit « Synchronisé à 9 h 41 » (l'heure de la dernière synchronisation réussie, retenue par l'appareil, jamais dans les faits), « Envoi… », « Hors ligne — changements à envoyer » ; nouvel essai espacé jusqu'à cinq minutes |
| Première liaison | 🟢 inchangée | Tant que l'appareil n'a jamais synchronisé, rien d'automatique : le parcours de l'écran Compte et ses confirmations. Un appareil déjà relié entre dans l'automatique en ouvrant Réglages › Compte une fois (les deux côtés identiques), ou par un premier envoi ou chargement |
| « Synchroniser maintenant » d'un appareil synchronisé | 🟢 une règle | Passe par le moteur : la même règle que l'automatique |
| Restaurer une sauvegarde sur un appareil synchronisé | 🟢 dit | Elle part sur le compte ; Données le dit avant la confirmation |

Ce qui n'est pas fait : le temps réel (sorti du plan, F9) — un ordinateur
resté au premier plan sans qu'on y touche ne reçoit rien avant qu'on y
revienne ou qu'on y modifie quelque chose.

## 27/11 — Le compte rendu d'activité en PDF

Demandé par le propriétaire : « télécharger le CRA en format PDF.
Actuellement c'est du HTML. » L'ancienne passait par jsPDF (`generateCRAPDF`,
419 Ko chargés d'office) ; la nouvelle écrit le format elle-même, chargée au
clic, et le PDF lit le **même modèle** que l'aperçu.

| Fonction | Verdict | Détail |
|---|---|---|
| `generateCRAPDF` — le CRA en PDF | 🟢 | Activité › Compte rendu, « Télécharger le PDF » (bouton principal) : `CRA_<aaaa-mm>_<client>.pdf` ou `…_tous-clients.pdf`, A4, Helvetica, un fichier qui se signe et s'archive. Sans bibliothèque : `infra/pdf` (écrivain pur, testé) et `documents/craPdf` (mise en page), 15,7 Ko à part, chargés au clic — l'entrée ne bouge pas d'un octet. Relu par pdfinfo, pdftotext et pypdf en mode strict |
| Le PDF dit ce que l'aperçu montre | 🆕 | `modeleDuCra` décide de chaque texte une fois ; `DocumentCra` (HTML) et `craPdf` le placent. Un test compare le texte de l'aperçu et celui du PDF, dans le même ordre, sur une et deux pages. Le PDF téléchargé depuis l'écran porte la note du client qui signe, jamais celle d'un autre |
| Un mois qui dépasse la page | 🆕 | Saut de page : les colonnes se redisent en haut de la suivante, le titre des totaux aussi ; « 1 / 2 » en pied |
| Le téléchargement HTML autonome du CRA | 🚫 retiré | Il ne s'ouvrait proprement que dans un navigateur ; le PDF le remplace. « Imprimer » reste |
| Le PDF de la facture | 🟢 inchangé | La facture garde « Imprimer → Enregistrer en PDF » et son téléchargement HTML (`downloadInvoiceAsHTML` plus haut) : hors de ce lot, la « facture en PDF » est rangée dans la liste de sortie |


## 27/11 — Les factures tenues dans un autre logiciel (demandé le 22/11)

« Avoir le choix de générer la facture ou de juste suivre les factures et
joindre la facture en pièce jointe. » L'ancienne ne connaissait que ses
propres factures ; ce choix n'existe dans aucune des deux versions avant ce
lot.

| Fonction | Verdict | Détail |
|---|---|---|
| Choisir l'outil d'émission | 🆕 | Réglages › Facturation : FREEL / un autre logiciel. Un fait (`emissionFactures`, schéma 29), FREEL par défaut ; refusé à l'import s'il n'est pas l'un des deux |
| Enregistrer une facture émise ailleurs | 🆕 | Numéro du logiciel (exigé, unique parmi les recettes, sans la casse), dates d'émission et d'envoi, échéance, mois couvert, montant du planning, PDF. Aucun numéro de FREEL n'est pris ; la facture porte `emisePar: 'externe'` et entre au suivi, au livre et aux relances comme une autre |
| Les mois travaillés sans facture | 🆕 | Liste et sujets « À faire », un par mois ; la reprise de l'ancienne version reprend désormais son `mois` de facture (`moisFacture`), qu'elle perdait — sans lui, juillet facturé le 2 août paraîtrait encore à enregistrer |
| Rattacher une facture au mois qu'elle couvre | 🆕 | Pour une facture d'avant le schéma 29, qui ne le disait pas : un geste dans la ligne du mois en attente |
| Rééditer une facture | 🟢 | « Revoir la facture » et `#/facture/<numéro>` refusés pour une facture émise ailleurs : FREEL n'en a pas le document |
| `setFactureStatus(…, 'envoyée')` — qui posait `dateEnvoi` au jour du clic | 🟢 | La date se propose (aujourd'hui) et se corrige ensuite ; un envoi à venir ou avant l'émission est refusé |
| Ouvrir la pièce d'une facture | 🆕 | N'existait nulle part : la pièce se déposait et se vérifiait, ne se lisait pas. Nouvel onglet, adresse locale révoquée à sa fermeture, type forcé à ceux du dépôt (une pièce `text/html` ne s'ouvre pas) |
| Numérotation continue au livre | 🟢 | Les numéros d'un autre logiciel ne comptent plus dans la suite de FREEL (ils y créaient des trous imaginaires) ; les doublons restent contrôlés partout |
