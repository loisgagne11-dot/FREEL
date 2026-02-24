# Cahier des Charges FREEL - Vérification Complète V74

## Phase 1 : Structure de base

| Tâche | Statut | Notes |
|-------|--------|-------|
| Nettoyer le code existant | ✅ | Archivé dans _archive/ |
| Restructurer navigation 4 onglets | ✅ | Cockpit, Activité, Finances, Config |
| Implémenter bouton (+) flottant | ✅ | showFabMenu() standardisé |
| Mettre en place Supabase sync | ⚠️ | UI faite, CDN bloqué Edge |

---

## Phase 2 : Cockpit

| Tâche | Statut | Notes |
|-------|--------|-------|
| Cash Disponible avec modal détail | ✅ | showCashDetail() |
| Donut Composition Compte (Chart.js) | ✅ | Chart doughnut provisions |
| Jauge Plafond Micro avec projections | ✅ | renderCAPlafondWidget() |
| Salaire Versable avec bouton | ✅ | salaireVersable + bouton |
| Timeline Jalons (scroll horizontal) | ✅ | renderActionsAndMilestones() |
| Autonomie | ✅ | Runway X mois |
| Centre d'Actions avec indicateurs santé | ✅ | getActionsList() |
| **Indicateurs Santé Société** | ✅ | V74: renderHealthIndicators() - Provisions/Factures/Déclarations |

---

## Phase 3 : Activité

| Tâche | Statut | Notes |
|-------|--------|-------|
| Liste Missions avec CRUD sur card | ✅ | renderMissionsContent() |
| Éditeur de jours intégré | ✅ | showDaysEditor() |
| Liste Factures avec filtres et CRUD | ✅ | renderFacturesContent() |
| Génération PDF facture | ✅ | generateInvoicePDF() |
| Liste Clients avec métriques (DSO, %) | ✅ | V74: DSO vs contractuel + alerte dépendance >50% |
| Liste Charges manuelles avec CRUD | ✅ | showChargeModal() |
| **KPIs header (CA, Taux occup.)** | ✅ | V74: CA Réalisé, Encaissé, À Encaisser, Taux Occupation |

---

## Phase 4 : Finances

### Structure V74 (conforme au cahier des charges §5):
- **Évolution** | **Performance** | **Conformité**

| Tâche | Statut | Notes |
|-------|--------|-------|
| **Sous-onglet Évolution** | | |
| Graphique Trésorerie & Salaires | ✅ | drawSoldeChart() |
| Graphique CA HT | ✅ | drawMainChart() |
| Historique salaires | ✅ | Dans mouvements |
| **Sous-onglet Performance** | | |
| Filtres période | ✅ | PERIOD sélecteur |
| **Donut répartition CA HT** | ✅ | V74: Provisions/Charges/Rémunération/Cash dispo |
| Détail provisions/charges/rémunération | ✅ | V74: breakdown sous donut |
| **Comparaison N-1** | ✅ | V74: tableau CA/taux provisions/charges/rémun |
| **Prévisionnel vs Réalisé** | ✅ | V74: objectif CA modifiable + projection |
| Lien Simulateur IR | ✅ | showIRDetail() |
| **Sous-onglet Conformité** | | |
| **Indicateur couverture global** | ✅ | V74: Solde compte vs Provisions dues |
| Détail par type provision | ✅ | V74: tableau Dû/Payé/État/Fiabilité |
| Toggle payé/non payé synchronisé | ✅ | togglePaid() |
| **Analyse écart** | ✅ | V74: diagnostic + actions recommandées |

---

## Phase 5 : Config

| Tâche | Statut | Notes |
|-------|--------|-------|
| Section Entreprise | ✅ | COMPANY complet |
| Section Régime Fiscal (avec calcul ACRE) | ✅ | getAcreInfo() |
| Simulateur IR complet | ✅ | showIRDetail() |
| Simulateur CFE | ✅ | showCFESimulator() |
| Section Trésorerie | ✅ | Solde initial, rendement |
| Références légales | ✅ | LEGAL_BY_YEAR 2025/2026 |
| **Livre des Recettes (vue + export)** | ✅ | V74: vue table permanente + exports |
| Exports (PDF, CSV, JSON) | ✅ | Tous formats |
| Sync Supabase | ⚠️ | UI faite, CDN bloqué Edge |

---

## Phase 6 : Transverse

| Tâche | Statut | Notes |
|-------|--------|-------|
| Recherche globale Cmd+K | ✅ | showSearch() + Cmd+K |
| Raccourcis clavier | ✅ | V74: N=FAB, flèches=navigation mois |
| Responsive mobile | ✅ | @media queries |
| Harmonisation IDs charges (toggle sync) | ✅ | togglePaid synchronisé |
| Gestion cas nouveaux utilisateurs | ✅ | Onboarding showOnboarding() |

---

## Phase 7 : Tests & Polish

| Tâche | Statut | Notes |
|-------|--------|-------|
| Vérifier toutes les règles métier | ✅ | LEGAL_BY_YEAR 2025/2026 |
| Tester cas limites (TVA, ACRE, N-1 vide) | ⚠️ | À tester manuellement |
| Optimiser performance | ✅ | App fluide |
| Ajustements visuels finaux | ✅ | UI cohérente |

---

## RÉSUMÉ V74 - Corrections majeures

### ✅ CORRIGÉS cette session:

**Finances > Performance (§5.4):**
1. Donut répartition → Provisions/Charges/Rémunération/Cash dispo (pas CA par client)
2. Détail sous le donut avec breakdown par type
3. Comparaison N-1 avec tableau complet (CA/taux provisions/charges/rémun/cash)
4. Prévisionnel vs Réalisé avec objectif CA modifiable + projection fin année

**Finances > Conformité (§5.5):**
5. Indicateur couverture → Solde compte vs Provisions dues (pas payé/provisionné)
6. Détail par type avec colonnes Dû/Payé/État/Fiabilité
7. Analyse écart avec diagnostic intelligent + actions recommandées
8. Alerte critique si cash dispo < 0

**Activité (§4.2):**
9. KPIs header: CA Réalisé, Encaissé, À Encaisser, Taux Occupation
10. Clients: DSO vs contractuel avec alerte +10j, dépendance >50%

**Config (§6.2):**
11. Livre des Recettes: vue table permanente (Date, N° Pièce, Client, Montant, Mode)

**Cockpit (§3.2):**
12. Indicateurs Santé toujours visibles: Provisions | Factures | Déclarations

**Menu FAB (§7.2):**
13. Standardisé: Mission, Charge, Salaire, Congés, Facture

**Raccourcis (§8.2):**
14. N ouvre menu FAB (fix bug openModal)
15. Flèches ← → navigation mois

### ⚠️ Limitations connues:
- Supabase CDN bloqué sur Edge (fonctionne Chrome/Firefox)

### ✅ Complets:
- Phase 1: 90% (Supabase Edge)
- Phase 2: **100%**
- Phase 3: **100%**
- Phase 4: **100%**
- Phase 5: 95% (Supabase Edge)
- Phase 6: **100%**
- Phase 7: 95% (tests manuels)

**TOTAL: ~99%**

---

*Mis à jour: 2026-02-24 - V74*
