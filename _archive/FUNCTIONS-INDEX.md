# Index des Fonctions - FREEL Legacy v72

Ce document indexe toutes les fonctions du code legacy pour référence lors de la refonte.

## 1. UTILITAIRES DOM/UI

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `el(tag, attrs, children)` | 1714 | Crée un élément DOM |
| `$(selector)` | 80 | Raccourci querySelector |
| `$$(selector)` | 80 | Raccourci querySelectorAll |
| `toast(msg, type)` | 1720 | Affiche une notification |
| `openModal(id)` | 3271 | Ouvre une modale |
| `closeModal(id)` | 3272 | Ferme une modale |
| `closeAllModals()` | 3273 | Ferme toutes les modales |
| `showModal(title, content)` | 3294 | Affiche modale dynamique |
| `createInput(...)` | 3322 | Crée un input formulaire |
| `createSelect(...)` | 3331 | Crée un select formulaire |
| `createTextarea(...)` | 3340 | Crée un textarea |

## 2. FORMATAGE

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `EUR(n, forceShow)` | 1727 | Formate en euros (ex: "1 234 €") |
| `PCT(n)` | 1732 | Formate en pourcentage |
| `fmtMonth(s)` | 1736 | "2026-01" → "janv. 2026" |
| `fmtMonthShort(s)` | 1737 | "2026-01" → "janv" |
| `fmtLong(d)` | 1738 | Date longue "1 janvier 2026" |
| `fmtDate(d)` | 1739 | Date courte "01/01/2026" |
| `fmtShort(d)` | 7185 | "1 janv" |
| `highlightText(text, query)` | 1753 | Surligne texte recherché |

## 3. DATES ET CALENDRIER

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `localISO(d)` | 1733 | Date → "YYYY-MM-DD" |
| `ym(y, m)` | 1734 | (2026, 0) → "2026-01" |
| `parseYM(s)` | 1735 | "2026-01" → {y: 2026, m: 0} |
| `parseDate(s)` | 1740 | Parse date flexible |
| `getNextMonth(ymStr)` | 2909 | Mois suivant |
| `getPreviousMonth(ymStr)` | 2919 | Mois précédent |
| `frenchHolidays(year)` | 2390 | Liste jours fériés FR |
| `daysBiz(year, month)` | 2404 | Jours ouvrés du mois |
| `daysBizInRange(...)` | 2417 | Jours ouvrés dans période |
| `isInPeriod(ymStr)` | 2362 | Vérifie si dans période filtre |
| `getPeriodMonths()` | 2373 | Liste mois de la période |

## 4. CALCULS FISCAUX

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `getAcreInfo()` | 2449 | Info ACRE (actif, fin) |
| `getUrssafRate(monthYm)` | 2472 | Taux URSSAF selon ACRE |
| `isTVAApplicable(dateStr)` | 2483 | TVA applicable? |
| `calculateIR(revenuBrut, year)` | 2488 | Calcul IR progressif |
| `getIRForYear(year)` | 2536 | IR annuel estimé |
| `getIRConfig(year)` | 3430 | Config IR (tranches, abattement) |

## 5. CALCUL PRINCIPAL - compute()

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `compute()` | 3742 | **FONCTION PRINCIPALE** - Calcule tout |
| `computeIndicators(data, months)` | 3637 | Calcule les KPIs |
| `computeAlerts(data)` | 3680 | Génère les alertes |
| `computeProjections(...)` | 4077 | Projections scenarios |

## 6. SOLDES ET PROVISIONS

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `getBalanceAtStartOfPeriod()` | 2618 | Solde début période |
| `getProvisionsBeforePeriod()` | 2652 | Provisions avant période |
| `getAbsoluteBalance()` | 2713 | Solde absolu (total vie) |
| `getAbsoluteBalanceDetail()` | 2753 | Détail solde absolu |
| `getAbsoluteProvisions()` | 2937 | Provisions absolues |
| `getAllChargesForType(typeName)` | 3069 | Charges par type |

## 7. PAIEMENTS

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `isPaid(id)` | 2597 | Vérifie si charge payée |
| `togglePaid(id)` | 2598 | Bascule statut paiement |
| `markAllPaid(ids)` | 2599 | Marque plusieurs payées |
| `setFactureStatus(...)` | 2601 | Change statut facture |
| `getPaymentMonth(...)` | 2606 | Mois de paiement prévu |
| `getPaymentDate(...)` | 2612 | Date paiement prévue |

## 8. MISSIONS

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `isMissionActive(mission)` | 2433 | Mission en cours? |
| `getMissionStatus(mission)` | 2440 | Statut mission |
| `buildMission(mis)` | 3199 | Construit objet mission complet |
| `showMissionModal(mission)` | 5693 | Modal création/édition |
| `showDaysEditor(mission)` | 5791 | Éditeur jours travaillés |

## 9. FACTURES

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `getNextInvoiceNumber(year)` | 1859 | Prochain n° facture |
| `reserveInvoiceNumber(year)` | 1875 | Réserve n° facture |
| `registerInvoice(invoiceData)` | 1885 | Enregistre facture |
| `getInvoiceRegistry(year)` | 1909 | Registre factures année |
| `validateInvoiceNumbering(year)` | 1920 | Valide numérotation |
| `showFactureModal(facture)` | 6273 | Modal facture |
| `openInvoiceHTML(...)` | 6437 | Génère HTML facture |
| `generateInvoiceHTMLContent(d)` | 6553 | Contenu HTML facture |

## 10. EXPORTS

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `exportLivreRecettes(year)` | 1973 | Export livre recettes CSV |
| `exportFEC(year)` | 2013 | Export FEC comptable |
| `exportLivreRecettesPDF(year)` | 2098 | Export PDF livre recettes |
| `exportPDFReport()` | 7706 | Export rapport PDF |
| `exportJSON()` | 8342 | Export données JSON |
| `exportData()` | 3436 | Export complet |
| `importData(file)` | 3443 | Import données |

## 11. CLIENTS

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `getClient(clientId)` | 2284 | Récupère client par ID |
| `getClientByName(name)` | 2288 | Récupère client par nom |
| `showClientModal(client)` | 2292 | Modal client |
| `getClientsStats()` | 7916 | Stats clients |

## 12. PERSISTANCE

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `saveAll()` | 3353 | Sauvegarde localStorage |
| `loadAll()` | 3369 | Charge localStorage |
| `autoBackup()` | 8257 | Backup automatique |

## 13. SUPABASE (Cloud)

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `initSupabase()` | 1424 | Init connexion Supabase |
| `updateAuthUI()` | 1449 | MAJ UI authentification |
| `signIn()` | 1504 | Connexion |
| `signUp()` | 1524 | Inscription |
| `signOut()` | 1544 | Déconnexion |
| `syncToCloud()` | 1552 | Sync vers cloud |
| `loadFromCloud()` | 1576 | Charge depuis cloud |

## 14. RENDEMENT

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `getSoldeMoyenMois(targetYm)` | 2797 | Solde moyen du mois |
| `calculerRendementMensuel(targetYm)` | 2865 | Rendement mensuel |
| `updateRendementHistorique()` | 2881 | MAJ historique rendement |
| `getTotalRendement(fromYm, toYm)` | 2929 | Rendement total période |
| `showRendementConfig()` | 5025 | Config rendement |

## 15. SANTÉ / ALERTES

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `calculateHealthScore()` | 7187 | Score santé 0-100 |
| `getActionsList()` | 7405 | Liste actions à faire |
| `getUpcomingDeadlines()` | 3465 | Échéances à venir |
| `getNextUrssafDeadline()` | 7238 | Prochaine échéance URSSAF |
| `getLegalMilestones()` | 7258 | Jalons légaux |
| `getAllYearMilestones()` | 7288 | Tous jalons année |

## 16. TVA

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `projectTVADate()` | 7358 | Projette date franchise TVA |
| `showTVADetail()` | 7374 | Détail TVA |

## 17. COMPOSANTS UI

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `KPI(opts)` | 1765 | Composant KPI |
| `SectionTitle(icon, text)` | 1818 | Titre section |
| `Card(opts)` | 1829 | Composant carte |
| `createSparkline(data, color, height)` | 2577 | Mini graphique |
| `getTrend(data)` | 2587 | Calcule tendance |

## 18. GRAPHIQUES (Chart.js)

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `drawMainChart()` | 11394 | Graphique CA |
| `drawSoldeChart()` | 11475 | Graphique Trésorerie |

## 19. RENDUS PAGES

| Fonction | Ligne | Description |
|----------|-------|-------------|
| `render()` | ~5200 | Rendu principal |
| `renderMissions(container)` | 11675 | Page Missions |
| `renderTresorerie(container)` | ~12000 | Page Trésorerie |
| `renderAnalyse(container)` | ~8500 | Page Analyse |
| `renderConfig(container)` | ~13000 | Page Config |

---

## CONSTANTES IMPORTANTES

```javascript
// Taux légaux 2026 (à vérifier/mettre à jour)
LEGAL = {
  urssaf: 0.246,      // ATTENTION: Devrait être 0.256 pour 2026
  urssafAcre: 0.123,  // ATTENTION: Devrait être 0.128 pour 2026
  cfp: 0.002,
  impLib: 0.022,
  tvaRate: 0.20,
  plafondMicro: 77700,
  plafondTVA: 36800,
  plafondTVAMajore: 39100
}
```

## STRUCTURES DE DONNÉES

```javascript
COMPANY = {
  name, siret, address, city, cp, email, iban, bic,
  debutActivite, typeActivite, // BNC, BIC_vente, BIC_service
  acre, acreFin, prelevementLiberatoire,
  quotientFamilial, revenusConjoint
}

MISSIONS = [{
  id, client, debut, fin, tjm, delaiPaiement, jourPaiement,
  lignes: [{ ym, joursReels, joursPlanifies }],
  factures: [{ id, mois, jours, status, numero, dateFacture }]
}]

CLIENTS = [{ id, name, email, address, cp, city, siret, contact }]

TREASURY = {
  soldeInitial, dateDebut, paidCharges: {}, movements: [],
  rendements: {}, chargesPonctuelles: [], chargesRecurrentes: []
}
```
