# Cahier des Charges FREEL - Vérification Complète

## Phase 1 : Structure de base

| Tâche | Statut | Notes |
|-------|--------|-------|
| Nettoyer le code existant | ⚠️ | Archivé mais pas nettoyé |
| Restructurer navigation 4 onglets | ✅ | Cockpit, Activité, Finances, Config |
| Implémenter bouton (+) flottant | ✅ | showFabMenu() contextuel |
| Mettre en place Supabase sync | ⚠️ | UI faite, CDN bloqué Edge |

---

## Phase 2 : Cockpit

| Tâche | Statut | Notes |
|-------|--------|-------|
| Cash Disponible avec modal détail | ✅ | showCashDetail() |
| Donut Composition Compte (Chart.js) | ✅ | Chart doughnut provisions |
| Jauge Plafond Micro avec projections | ✅ | renderCAPlafondWidget() |
| Salaire Versable avec bouton | ✅ | Capacité salaire affichée |
| Timeline Jalons (scroll horizontal) | ✅ | renderActionsAndMilestones() |
| Autonomie | ✅ | Runway X mois |
| Centre d'Actions avec indicateurs santé | ✅ | getActionsList() |

---

## Phase 3 : Activité

| Tâche | Statut | Notes |
|-------|--------|-------|
| Liste Missions avec CRUD sur card | ✅ | renderMissionsContent() |
| Éditeur de jours intégré | ✅ | showDaysEditor() |
| Liste Factures avec filtres et CRUD | ✅ | renderFacturesContent() |
| Génération PDF facture | ✅ | generateInvoicePDF() |
| Liste Clients avec métriques (DSO, %) | ❌ | DSO non implémenté |
| Liste Charges manuelles avec CRUD | ✅ | showChargeModal() |
| KPIs header (CA, Taux occup.) | ⚠️ | CA oui, Taux occup. partiel |

---

## Phase 4 : Finances

### Structure actuelle vs spécifiée:
- **Actuel**: Factures | Trésorerie | Missions
- **Spécifié**: Évolution | Performance | Conformité

| Tâche | Statut | Notes |
|-------|--------|-------|
| **Sous-onglet Évolution** | | |
| Graphique Trésorerie & Salaires | ✅ | drawSoldeChart() |
| Graphique CA HT | ✅ | drawMainChart() |
| Historique salaires | ✅ | Dans mouvements |
| **Sous-onglet Performance** | | |
| Filtres période | ✅ | PERIOD sélecteur |
| Donut répartition CA HT | ❌ | Non implémenté |
| Détail provisions/charges/rémunération | ✅ | Affiché |
| Comparaison N-1 | ❌ | Non implémenté |
| Prévisionnel vs Réalisé | ⚠️ | Graphique mais pas détaillé |
| Lien Simulateur IR | ✅ | showIRDetail() |
| **Sous-onglet Conformité** | | |
| Indicateur couverture global | ❌ | Non implémenté |
| Détail par type provision | ✅ | getAbsoluteProvisions() |
| Toggle payé/non payé synchronisé | ✅ | togglePaid() |
| Analyse écart | ❌ | Non implémenté |

---

## Phase 5 : Config

| Tâche | Statut | Notes |
|-------|--------|-------|
| Section Entreprise | ✅ | COMPANY complet |
| Section Régime Fiscal (avec calcul ACRE) | ✅ | getAcreInfo() |
| Simulateur IR complet | ✅ | showIRDetail() |
| Simulateur CFE | ✅ | showCFESimulator() |
| Section Trésorerie | ✅ | Solde initial, rendement |
| Références légales | ✅ | LEGAL_BY_YEAR |
| Livre des Recettes (vue + export) | ✅ | exportLivreRecettes() |
| Exports (PDF, CSV, JSON) | ✅ | Tous formats |
| Sync Supabase | ⚠️ | UI faite |

---

## Phase 6 : Transverse

| Tâche | Statut | Notes |
|-------|--------|-------|
| Recherche globale Cmd+K | ✅ | showSearch() + Cmd+K |
| Raccourcis clavier | ✅ | initKeyboardShortcuts() |
| Responsive mobile | ✅ | @media queries |
| Harmonisation IDs charges (toggle sync) | ✅ | togglePaid synchronisé |
| Gestion cas nouveaux utilisateurs | ✅ | Onboarding showOnboarding() |

---

## Phase 7 : Tests & Polish

| Tâche | Statut | Notes |
|-------|--------|-------|
| Vérifier toutes les règles métier | ⏳ | En cours |
| Tester cas limites (TVA, ACRE, N-1 vide) | ⏳ | À faire |
| Optimiser performance | ✅ | App fluide |
| Ajustements visuels finaux | ⏳ | En cours |

---

## RÉSUMÉ - ÉLÉMENTS MANQUANTS

### ❌ Non implémentés:
1. **DSO clients** - Métrique délai paiement moyen
2. **Donut répartition CA HT** - Dans Performance
3. **Comparaison N-1** - Année précédente
4. **Indicateur couverture global** - Conformité provisions
5. **Analyse écart** - Prévu vs réalisé détaillé

### ⚠️ Partiels:
1. **Sous-onglets Finances** - Structure différente (Factures/Tréso/Missions vs Évolution/Perf/Conformité)
2. **Supabase** - CDN bloqué sur Edge
3. **Taux occupation** - Présent mais pas en KPI header

### ✅ Complets:
- Phase 1: 75%
- Phase 2: 100%
- Phase 3: 85%
- Phase 4: 60%
- Phase 5: 95%
- Phase 6: 100%
- Phase 7: 50%

**TOTAL ESTIMÉ: ~80%**

---

*Mis à jour: 2026-02-24*
