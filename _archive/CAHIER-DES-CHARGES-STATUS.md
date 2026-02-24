# Cahier des Charges FREEL - État d'Avancement Complet

## PHASE 0: ARCHIVAGE ✅

| Tâche | Statut | Notes |
|-------|--------|-------|
| Créer dossier _archive/ | ✅ | Fait |
| Copier index.html vers legacy-v72.html | ✅ | Backup complet |
| Documenter fonctions archivées | ✅ | FUNCTIONS-INDEX.md |

---

## PHASE 1: STRUCTURE ✅

| Tâche | Statut | Notes |
|-------|--------|-------|
| Navigation 4 onglets | ✅ | Cockpit, Activité, Finances, Config |
| Bouton flottant (+) centralisé | ✅ | showFabMenu() contextuel |
| Modèle LEGAL versionné par année | ✅ | LEGAL_BY_YEAR[2025/2026] |
| Support type activité | ✅ | BNC/BIC_vente/BIC_service |
| Setup Supabase sync | ⚠️ | UI faite, CDN bloqué sur Edge |

---

## PHASE 2: COCKPIT ✅

| Tâche | Statut | Notes |
|-------|--------|-------|
| Hero Cash Disponible | ✅ | renderDashboardHero() |
| Indicateur santé (couleur) | ✅ | Vert/Orange/Rouge |
| Donut Solde vs Provisions | ✅ | Composition visuelle |
| Autonomie (X mois) | ✅ | Runway calculé |
| Timeline jalons passés | ✅ | Grisés |
| Timeline jalons à venir | ✅ | Colorés par catégorie |
| Types jalons: URSSAF, TVA, IR, CFE | ✅ | getLegalMilestones() |
| Fin de mission dans timeline | ✅ | Catégorie 'mission' |
| Alertes factures en retard | ✅ | computeAlerts() |
| Alertes charges à payer | ✅ | computeAlerts() |
| Alertes dépassement plafond | ✅ | computeAlerts() |
| Actions recommandées | ✅ | getActionsList() |
| Graphique CA | ✅ | drawMainChart() avec labels |
| Graphique Trésorerie + Salaires | ✅ | drawSoldeChart() avec labels |

---

## PHASE 3: ACTIVITÉ ✅

| Tâche | Statut | Notes |
|-------|--------|-------|
| Liste missions avec statut | ✅ | renderMissionsContent() |
| Indicateur En cours/Terminée/À venir | ✅ | getMissionStatus() |
| TJM, dates, client affichés | ✅ | Carte mission |
| Jours travaillés/planifiés | ✅ | showDaysEditor() |
| Clic → édition mission | ✅ | showMissionModal() |
| Liste factures par mission | ✅ | renderFacturesContent() |
| Statut Payée/En attente/Retard | ✅ | Indicateurs colorés |
| Télécharger facture PDF | ✅ | showDownloadInvoiceModal() |
| Montant HT + TVA affiché | ✅ | Détail facture |
| Graphique CA Prévu | ✅ | Violet pointillé |
| Graphique CA Réalisé | ✅ | Cyan |
| Graphique CA Encaissé | ✅ | Vert |
| Toggle cumul | ✅ | SHOW_CUMUL |

---

## PHASE 4: FINANCES ✅

| Tâche | Statut | Notes |
|-------|--------|-------|
| Solde compte pro temps réel | ✅ | getAbsoluteBalance() |
| Détail: Initial + Encaissé - Charges - Salaires | ✅ | showCashDetail() |
| Provisions par type (URSSAF, TVA, IR) | ✅ | getAbsoluteProvisions() |
| Toggle paiement provision | ✅ | togglePaid() |
| Toggle bidirectionnel | ✅ | payé ↔ à payer |
| Historique mouvements chronologique | ✅ | renderTresorerie() |
| Filtres (type, recherche) | ✅ | SEARCH_STATE |
| Encaissements/Charges/Salaires | ✅ | allMouvements |
| Graphique Solde/Cash Dispo (barres) | ✅ | drawSoldeChart() |
| Graphique Salaires (ligne) | ✅ | drawSoldeChart() |
| Projection future | ✅ | dataSoldeProjection |
| Capacité salaire | ✅ | dataCapaciteSalaire |

---

## PHASE 5: CONFIG ✅

| Tâche | Statut | Notes |
|-------|--------|-------|
| Nom, SIRET entreprise | ✅ | COMPANY |
| Date début activité | ✅ | COMPANY.debut |
| Type activité (BNC/BIC) | ✅ | COMPANY.typeActivite |
| Adresse | ✅ | COMPANY.adresse |
| IBAN/BIC | ✅ | COMPANY.iban/bic |
| ACRE (oui/non, date fin auto) | ✅ | getAcreInfo() |
| Prélèvement libératoire | ✅ | COMPANY.prelevementLiberatoire |
| Périodicité URSSAF | ✅ | mensuel/trimestriel |
| TVA depuis | ✅ | COMPANY.tvaDepuis |
| Liste clients | ✅ | CLIENTS |
| Ajout/Édition client | ✅ | showClientModal() |
| Export JSON | ✅ | exportData() |
| Import JSON | ✅ | importData() |
| Livre recettes CSV | ✅ | exportLivreRecettes() |
| Livre recettes PDF | ✅ | exportLivreRecettesPDF() |
| FEC comptable | ✅ | exportFEC() |
| Cloud Sync UI | ✅ | Configuration Supabase |

---

## PHASE 6: SIMULATEURS ✅

| Tâche | Statut | Notes |
|-------|--------|-------|
| Simulateur IR annuel | ✅ | showIRDetail() |
| Sélection année | ✅ | 2025/2026 |
| Quotient familial | ✅ | Éditable dans simulateur |
| Abattement selon type activité | ✅ | BNC 34%, BIC 50%/71% |
| Tranches IR détaillées | ✅ | Affichage progressif |
| Revenus conjoint, PER, autres | ✅ | Paramètres éditables |
| Simulateur CFE | ✅ | showCFESimulator() |
| CA N-2 | ✅ | Base de calcul |
| Tranches CFE | ✅ | Barème officiel |
| Taux communal | ✅ | Configurable |
| Exonérations | ✅ | 1ère année, CA < 5000€ |

---

## PHASE 7: POLISH ⏳

| Tâche | Statut | Notes |
|-------|--------|-------|
| Tests complets tous scénarios | ⏳ | À faire manuellement |
| Documentation utilisateur | ⏳ | Optionnel |
| Optimisation performance | ✅ | App fluide |
| Cloud Sync fonctionnel | ⚠️ | Tester sur Chrome/Firefox |

---

## RÉSUMÉ FINAL

| Phase | Statut | Progression |
|-------|--------|-------------|
| PHASE 0: Archivage | ✅ | 100% |
| PHASE 1: Structure | ✅ | 95% (Supabase CDN) |
| PHASE 2: Cockpit | ✅ | 100% |
| PHASE 3: Activité | ✅ | 100% |
| PHASE 4: Finances | ✅ | 100% |
| PHASE 5: Config | ✅ | 100% |
| PHASE 6: Simulateurs | ✅ | 100% |
| PHASE 7: Polish | ⏳ | 50% |

**Total: ~95% complet**

### Reste à faire:
1. ⏳ Tests manuels complets
2. ⏳ Cloud Sync (tester sur autre navigateur)
3. ⏳ Documentation utilisateur (optionnel)

---

*Mis à jour: 2026-02-24 - V73*
