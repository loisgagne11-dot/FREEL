# Cahier des Charges FREEL - État d'Avancement

## PARADIGME GÉNÉRAL

| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Consulter partout | ✅ | ✅ | Données visibles sur tous les onglets |
| Créer via (+) | ✅ | ✅ | FAB contextuel selon l'onglet |
| Éditer sur l'objet source | ✅ | ✅ | Clic sur élément → modale d'édition |

---

## ONGLET 1: COCKPIT (🏠)

### Hero - Cash Disponible
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Montant Cash Dispo central | ✅ | ✅ | renderDashboardHero() |
| Indicateur santé (couleur) | ✅ | ✅ | Vert/Orange/Rouge selon montant |
| Donut Solde vs Provisions | ✅ | ✅ | Composition compte pro |
| Autonomie (X mois) | ✅ | ✅ | Runway affiché |

### Timeline Jalons
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Jalons passés (grisés) | ✅ | ⚠️ | renderActionsAndMilestones() - à améliorer |
| Jalons à venir (colorés) | ✅ | ⚠️ | Existe mais format à revoir |
| Types: URSSAF, TVA, IR, CFE | ✅ | ✅ | getLegalMilestones() |
| Fin mission | ✅ | ✅ | Inclus dans jalons |

### Alertes Prioritaires
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Factures en retard | ✅ | ✅ | computeAlerts() |
| Charges à payer | ✅ | ✅ | computeAlerts() |
| Dépassement plafond | ✅ | ✅ | computeAlerts() |
| Actions recommandées | ✅ | ✅ | getActionsList() |

### Graphiques
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| CA (Prévu/Réalisé/Encaissé) | ✅ | ✅ | drawMainChart() |
| Trésorerie + Salaires | ✅ | ✅ | drawSoldeChart() |

---

## ONGLET 2: ACTIVITÉ (💼)

### Missions
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Liste missions avec statut | ✅ | ✅ | renderMissionsContent() |
| Indicateur: En cours/Terminée/À venir | ✅ | ✅ | getMissionStatus() |
| TJM, dates, client | ✅ | ✅ | Affiché dans carte mission |
| Jours travaillés/planifiés | ✅ | ✅ | showDaysEditor() |
| Clic → édition mission | ✅ | ✅ | showMissionModal() |

### Factures
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Liste par mission | ✅ | ✅ | renderFacturesContent() - NOUVEAU |
| Statut: Payée/En attente/Retard | ✅ | ✅ | Indicateurs colorés |
| Télécharger facture | ✅ | ✅ | showDownloadInvoiceModal() - NOUVEAU |
| Montant HT + TVA | ✅ | ✅ | Affiché |

### Graphique CA
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Prévu (violet pointillé) | ✅ | ✅ | drawMainChart() |
| Réalisé (cyan) | ✅ | ✅ | drawMainChart() |
| Encaissé (vert) | ✅ | ✅ | drawMainChart() |
| Cumul toggle | ✅ | ✅ | SHOW_CUMUL variable |

---

## ONGLET 3: FINANCES (💰)

### Solde Compte Pro
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Solde temps réel | ✅ | ✅ | getAbsoluteBalance() |
| Détail: Initial + Encaissé - Charges - Salaires | ✅ | ✅ | showCashDetail() |

### Provisions
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Par type (URSSAF, TVA, IR) | ✅ | ✅ | getAbsoluteProvisions() |
| Toggle paiement | ✅ | ✅ | togglePaid() |
| Bidirectionnel (payé ↔ à payer) | ✅ | ✅ | Corrigé V72 |

### Historique Mouvements
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Liste chronologique | ✅ | ✅ | renderTresorerie() |
| Filtres (type, recherche) | ✅ | ✅ | SEARCH_STATE |
| Encaissements/Charges/Salaires | ✅ | ✅ | allMouvements |

### Graphique Trésorerie
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Solde/Cash Dispo (barres) | ✅ | ✅ | drawSoldeChart() |
| Salaires (ligne) | ✅ | ✅ | drawSoldeChart() |
| Projection future | ✅ | ✅ | dataSoldeProjection |
| Capacité salaire | ✅ | ✅ | dataCapaciteSalaire |

---

## ONGLET 4: CONFIG (⚙️)

### Entreprise
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Nom, SIRET | ✅ | ✅ | COMPANY |
| Date début activité | ✅ | ✅ | COMPANY.debut |
| Type activité (BNC/BIC) | ✅ | ✅ | COMPANY.typeActivite - NOUVEAU |
| Adresse | ✅ | ✅ | COMPANY.adresse |
| IBAN/BIC | ✅ | ✅ | COMPANY.iban/bic |

### Paramètres Fiscaux
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| ACRE (oui/non, date fin auto) | ✅ | ✅ | getAcreInfo() |
| Prélèvement libératoire | ✅ | ✅ | COMPANY.prelevementLiberatoire |
| Quotient familial | ✅ | ⚠️ | getIRConfig() - à exposer dans UI |
| Revenus conjoint | ✅ | ⚠️ | getIRConfig() - à exposer dans UI |

### Clients
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Liste clients | ✅ | ✅ | CLIENTS |
| Ajout/Édition client | ✅ | ✅ | showClientModal() |

### Export/Import
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Export JSON | ✅ | ✅ | exportJSON() |
| Import JSON | ✅ | ✅ | importData() |
| Livre recettes CSV | ✅ | ✅ | exportLivreRecettes() |
| FEC comptable | ✅ | ✅ | exportFEC() |

---

## MODÈLE DE DONNÉES

### LEGAL (Valeurs Légales)
| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Versionné par année | ✅ | ✅ | LEGAL_BY_YEAR[2025/2026] |
| Par type activité | ✅ | ✅ | BNC/BIC_vente/BIC_service |
| Taux URSSAF 2026: 25.6% | ✅ | ✅ | Corrigé |
| Taux ACRE 2026: 12.8% | ✅ | ✅ | Corrigé |
| Tranches IR versionnées | ✅ | ✅ | getLegalIRBrackets() |
| Abattements par type | ✅ | ✅ | getLegalAbattement() |
| Seuils TVA 2026 | ✅ | ✅ | 37500€/41250€ |

### Helpers
| Fonction | Implémentée | Description |
|----------|-------------|-------------|
| getLegal(year) | ✅ | Valeurs légales année |
| getLegalUrssaf(year, type, acre) | ✅ | Taux URSSAF |
| getLegalAbattement(year, type) | ✅ | Abattement IR |
| getLegalIRBrackets(year) | ✅ | Tranches IR |
| getLegalTVA(year, type) | ✅ | Seuils TVA |

---

## SIMULATEURS

| Élément | Spécifié | Implémenté | Notes |
|---------|----------|------------|-------|
| Simulateur IR annuel | ✅ | ⚠️ | calculateIR() existe, UI à créer |
| Simulateur CFE | ✅ | ❌ | À implémenter |

---

## BOUTON (+) - FAB

| Contexte | Actions | Implémenté |
|----------|---------|------------|
| Cockpit | Mission, Charge, Salaire | ✅ |
| Activité | Mission, Télécharger Facture, Salaire | ✅ |
| Finances | Charge, Salaire, Mission | ✅ |
| Config | Client, Mission | ✅ |

---

## RÉSUMÉ

### Complet ✅
- Phase 0: Archivage
- Phase 1: Structure LEGAL versionnée
- Phase 1: Type activité (BNC/BIC)
- Phase 1: Navigation 4 onglets
- Phase 1: FAB contextuel
- Onglet Finances (existant, fonctionnel)

### Partiel ⚠️
- Timeline jalons (format à améliorer)
- Config fiscale (quotient familial dans UI)
- Simulateur IR (calcul OK, UI manquante)

### À faire ❌
- Setup Supabase (existant mais non activé)
- Simulateur CFE
- Tests complets
- Documentation utilisateur

---

*Mis à jour: 2026-02-23*
