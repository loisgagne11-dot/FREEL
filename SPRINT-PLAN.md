# FREEL - Plan de Sprint pour atteindre 10/10

## DIAGNOSTIC RÉEL (synthèse honnête)

| Axe | Note | Verdict |
|-----|------|---------|
| **Architecture** | 3/10 | Monolithique (16k lignes dans 1 fichier HTML), non maintenable à l'échelle |
| **Sécurité** | 2/10 | Vulnérabilités XSS critiques (innerHTML partout), pas de sanitization, credentials en clair |
| **Tests** | 0/10 | Aucun test automatisé, zéro couverture |
| **Qualité code** | 4/10 | Duplication massive, magic numbers, pas de constantes, string concatenation |
| **Conformité fiscale** | 6/10 | Bonne base LEGAL_BY_YEAR mais taux potentiellement erronés, pas de piste d'audit |
| **Fonctionnalités métier** | 7/10 | Riche et bien pensé — le point fort de l'app |
| **UX/Accessibilité** | 5/10 | Design correct, accessibilité inexistante (0 ARIA, 0 keyboard nav) |
| **RGPD/Données** | 2/10 | Non conforme (pas de consentement, pas de suppression, pas de chiffrement) |
| **DevOps** | 3/10 | CI basique (deploy only), pas de scan sécurité, pas de lint |
| **MOYENNE** | **3.5/10** | **MVP prometteur mais non prêt pour la production** |

---

## SPRINT 1 - SÉCURITÉ (Priorité P0 - BLOQUANT)
**Note actuelle: 2/10 → Cible: 10/10**

### 1.1: Créer une fonction d'échappement HTML ✅
- [x] Ajouter `escapeHTML(str)` qui échappe `<>&"'`
- [x] Utiliser partout où des données utilisateur sont injectées dans du HTML

### 1.2: Sécuriser TOUS les innerHTML avec données utilisateur ✅
- [x] Auditer chaque innerHTML contenant des données user (noms, adresses, SIRET, descriptions)
- [x] Remplacer par `textContent` quand HTML n'est pas nécessaire
- [x] Appliquer `escapeHTML()` quand innerHTML est requis avec données user
- [x] Focus critique: `generateInvoiceHTMLContent()` — toutes les propriétés non échappées
- [x] Focus critique: modales salaire, infos financières, recommandations
- [x] Focus: `d.adresseClient.replace(/,/g, '<br>')` — injection directe (escape avant replace)

### 1.3: Sécuriser l'import JSON ✅
- [x] Valider la structure du JSON importé (schéma attendu)
- [x] Vérifier les types de chaque champ avant application
- [x] Rejeter les données malformées avec message clair
- [x] Limiter la taille du fichier importé (5 Mo max)

### 1.4: Sécuriser les erreurs exposées ✅
- [x] Masquer `err.message` dans les toast Supabase → messages génériques
- [x] Ne jamais exposer de stack traces côté utilisateur
- [x] Logger les erreurs en console uniquement

### 1.5: Sécuriser le stockage credentials ✅
- [x] Avertir l'utilisateur que les clés Supabase sont stockées en clair
- [x] Ajouter une option de déconnexion qui purge les credentials (existant)

---

## SPRINT 2 - RGPD & DONNÉES (Priorité P0 - BLOQUANT)
**Note actuelle: 2/10 → Cible: 10/10**

### 2.1: Droit à l'effacement ✅
- [x] Ajouter un bouton "Supprimer toutes mes données" dans Config
- [x] Confirmation double avant suppression (confirm + re-saisie "SUPPRIMER")
- [x] Purger localStorage complet + Supabase si connecté

### 2.2: Export des données personnelles (portabilité) ✅
- [x] Bouton "Exporter mes données" (JSON complet RGPD)
- [x] Inclure TOUTES les données (company, missions, clients, treasury, IR, conges, goalCA, theme, notifs)

### 2.3: Consentement et transparence ✅
- [x] Ajouter une politique de confidentialité accessible (section dépliable)
- [x] Informer que les données restent en local (pas de tracking)
- [x] Si Supabase activé: avertissement envoi données cloud

### 2.4: Chiffrement local (optionnel mais recommandé)
- [x] Supabase gère déjà l'auth — pas de mots de passe en clair côté app
- [ ] Chiffrement localStorage optionnel (hors scope V1, complexité disproportionnée pour un SPA)

---

## SPRINT 3 - ACCESSIBILITÉ (Priorité P0 - BLOQUANT)
**Note actuelle: 5/10 (UX) avec accessibilité à ~2/10 → Cible: 10/10**

### 3.1: Attributs ARIA sur les éléments interactifs ✅
- [x] `aria-label` sur tous les boutons icône/emoji (thème ☀️, notif 🔔, auth 🔒, privacy 👁️)
- [x] `role="dialog"` + `aria-modal="true"` sur les modals (showModal)
- [x] `role="banner"` sur le header, `role="tabpanel"` sur le main
- [x] `role="tablist"`, `role="tab"`, `aria-selected` sur les onglets + bottom-nav
- [x] `role="status"` + `aria-live="polite"` sur le toast container

### 3.2: Formulaires accessibles ✅
- [x] Associer chaque input à son label via `for`/`id` dans `createInput()`
- [x] `aria-required="true"` sur les champs obligatoires (paramètre `required`)
- [x] Marqueur visuel `*` sur les labels des champs obligatoires
- [ ] `aria-invalid="true"` + `aria-describedby` pour les erreurs de validation (Sprint 6)

### 3.3: Navigation clavier ✅
- [x] Focus trap dans les modals (trapFocus avec Tab cycling)
- [x] Escape pour fermer tous les modals et overlays (global + modal-level)
- [x] Auto-focus sur premier champ à l'ouverture du modal
- [x] `:focus-visible` outline visible sur tous les éléments interactifs
- [x] Skip-to-content link

### 3.4: Contrastes et alternatives textuelles ✅
- [x] `:focus-visible` avec outline 2px solid accent + offset
- [x] `aria-hidden="true"` sur les icônes décoratives (bottom-nav icons, badge)
- [x] Les indicateurs utilisent toujours icône + texte (déjà le cas dans l'app)

---

## SPRINT 4 - QUALITÉ CODE & ARCHITECTURE (Priorité P1)
**Note actuelle: Architecture 3/10, Qualité 4/10 → Cible: 8/10**
*(10/10 nécessiterait une réécriture modulaire complète, hors scope)*

### 4.1: Éliminer la duplication ✅
- [x] Identifier les blocs de code dupliqués
- [x] Supprimer showRendementDetail() alias inutile → showRendementConfig() direct
- [x] Centraliser les constantes (magic numbers → constantes nommées)

### 4.2: Organiser le code par sections claires ✅
- [x] Sections déjà structurées avec séparateurs (Constants, Utils, Compute, Render, Events)
- [x] CHARGE_TYPES centralisé comme source unique
- [x] CSS variables bien organisées (colors, radius, spacing)

### 4.3: Remplacer les magic numbers ✅
- [x] Constantes extraites: MAX_IMPORT_SIZE, TOAST_DURATION, TOAST_DURATION_SHORT
- [x] Constantes extraites: DEBOUNCE_DELAY, MAX_MOUVEMENTS_DISPLAY
- [x] Constantes extraites: AUTONOMY_CONFORTABLE, AUTONOMY_WARNING
- [x] Constantes extraites: OCCUPATION_GOOD, OCCUPATION_MEDIUM
- [x] Seuils fiscaux correctement centralisés dans LEGAL_BY_YEAR

### 4.4: Nettoyer le code mort ✅
- [x] showRendementDetail() supprimé (alias redondant)
- [x] Références corrigées vers showRendementConfig() directement

---

## SPRINT 5 - CONFORMITÉ FISCALE (Priorité P1)
**Note actuelle: 6/10 → Cible: 10/10**

### 5.1: Vérifier tous les taux 2025/2026 ✅
- [x] URSSAF BNC: 24.6%/12.3% (2025), 25.6%/12.8% (2026) — confirmé urssaf.fr
- [x] URSSAF BIC vente: 12.3%/6.15% — corrigé (était 12.4%/13.2%)
- [x] URSSAF BIC service: 21.2%/10.6% — corrigé (était 21.4%/23.2%)
- [x] TVA 2025: seuils mis à jour (loi Midy nov 2025): 37500/41250/85000/93500
- [x] TVA 2026: inchangés (réforme 25k€ rejetée au Parlement)
- [x] Plafonds CA 2026: mis à jour 83600€ services / 203100€ vente (LFI 2026)
- [x] CFP: 0.2% — vérifié correct
- [x] ACRE: 50% pendant 4 trimestres — vérifié correct
- [x] IR: tranches 2025/2026 vérifiées (revalorisation ~1.8%)

### 5.2: Piste d'audit ✅
- [x] Timestamp createdAt ajouté sur chaque facture du livre des recettes
- [x] Numérotation séquentielle déjà implémentée (validateInvoiceSequence)

### 5.3: Edge cases fiscaux
- [x] TVA: transition en cours d'année déjà gérée (tvaDepuis par mois)
- [x] ACRE: calcul par trimestres (acreDureeQuarters)
- [ ] Note: dépassement seuil micro en cours d'année non implémenté (complexité hors scope)

---

## SPRINT 6 - ROBUSTESSE & VALIDATION (Priorité P1)
**Note actuelle: ~4/10 → Cible: 10/10**

### 6.1: Renforcer validateInput() ✅
- [x] SIRET: vérification algorithme Luhn (luhnCheck)
- [x] IBAN: validation format + checksum mod 97 (ibanMod97Check, ISO 13616)
- [x] Email: regex RFC 5322 simplifiée
- [x] Téléphone: format français (0X) + international (+33, +XX)
- [x] Dates: cohérence fin > début (type 'dateRange')
- [x] safeNum() helper pour parsing numérique avec fallback

### 6.2: Validation mission creation renforcée ✅
- [x] TJM > 0 déjà implémenté dans showMissionModal save
- [x] Feedback visuel: showValidationError avec bordure rouge + message
- [x] clearValidationError pour reset

### 6.3: Gestion d'erreurs robuste ✅
- [x] Messages user-friendly (Sprint 1 — err.message masqués)
- [x] Fallbacks: safeNum() pour NaN → 0
- [x] Protéger tous les JSON.parse dans loadAll avec try/catch individuels
- [x] Validation type Array sur missions et clients au chargement

---

## SPRINT 7 - UX MISSION CREATION (Priorité P1)
**Note actuelle: 7/10 → Cible: 10/10**

### 7.1: Améliorer le flow de création ✅
- [x] Auto-focus sur le premier champ (select client ou input) à l'ouverture
- [x] Pré-remplissage intelligent (date début = demain)
- [x] Indicateur de progression (badges numérotés 1-5 en haut du formulaire)
- [x] Sections numérotées visuellement (1️⃣ à 5️⃣)

### 7.2: Feedback utilisateur ✅
- [x] Toast de confirmation après sauvegarde (déjà implémenté)
- [x] Tooltip aide contextuels TJM et délai paiement
- [x] Placeholders sur tous les champs (TJM, site, titre, adresses, etc.)
- [x] Labels de délai clarifiés (M+1 → M+1 (30j))
- [x] Validation visuelle (bordure rouge + message sous champ TJM)

### 7.3: Gestion des périodes ✅
- [x] Validation des chevauchements de périodes (bloque la sauvegarde)
- [x] Calcul en temps réel du nombre de jours par période (total j/sem)
- [x] Affichage du total jours/CA estimé en bas du formulaire (updateEstimate)

### 7.4: Gestion des statuts ✅
- [x] Filtres par statut dans la liste des missions (all/active/prospect/perdue)
- [x] Compteurs par statut dans les onglets de filtre

---

## SPRINT 8 - DEVOPS & CI/CD (Priorité P2)
**Note actuelle: 3/10 → Cible: 8/10**

### 8.1: Enrichir le pipeline
- [ ] Ajouter validation HTML dans deploy.yml
- [ ] Ajouter un check de taille fichier (alerte si > 2MB)
- [ ] Vérifier que les fonctions critiques sont définies (smoke test)

### 8.2: Scan sécurité basique
- [ ] Script qui vérifie l'absence de patterns dangereux (eval, document.write)
- [ ] Vérifier qu'aucun secret n'est commité (.env, clés API)

---

## SPRINT 9 - TESTS (Priorité P2)
**Note actuelle: 0/10 → Cible: 6/10**
*(10/10 nécessiterait un framework de test complet, hors scope pour un fichier HTML unique)*

### 9.1: Tests de smoke intégrés
- [ ] Script Node.js qui charge le HTML et vérifie les fonctions globales
- [ ] Vérifier que compute() ne crash pas avec des données vides
- [ ] Vérifier que compute() ne crash pas avec des données complètes
- [ ] Vérifier les calculs fiscaux critiques (URSSAF, TVA, IR)

### 9.2: Tests de validation
- [ ] Tester validateInput() avec des cas limites
- [ ] Tester les calculs de jours ouvrés
- [ ] Tester buildMission() avec différents scénarios

---

## SPRINT 10 - PERFORMANCE (Priorité P2)
**Note actuelle: ~6/10 → Cible: 9/10**

### 10.1: Optimiser les manipulations DOM
- [ ] Remplacer `body.innerHTML = ''` par `body.replaceChildren()`
- [ ] DocumentFragment pour les listes longues
- [ ] Debounce sur recherche et calculs temps réel

### 10.2: Optimiser la mémoire
- [ ] Détruire les instances Chart.js avant d'en créer de nouvelles
- [ ] Cleanup event listeners à la fermeture des modals
- [ ] Nettoyer les setTimeout orphelins

---

## ORDRE D'EXÉCUTION FINAL

```
P0 BLOQUANT (sécurité & conformité):
├── Sprint 1: Sécurité XSS         (2/10 → 10/10)
├── Sprint 2: RGPD/Données         (2/10 → 10/10)
└── Sprint 3: Accessibilité        (2/10 → 10/10)

P1 IMPORTANT (qualité & fiabilité):
├── Sprint 4: Qualité code         (4/10 → 8/10)
├── Sprint 5: Conformité fiscale   (6/10 → 10/10)
├── Sprint 6: Robustesse           (4/10 → 10/10)
└── Sprint 7: UX Mission           (7/10 → 10/10)

P2 AMÉLIORATIONS:
├── Sprint 8: DevOps/CI            (3/10 → 8/10)
├── Sprint 9: Tests                (0/10 → 6/10)
└── Sprint 10: Performance         (6/10 → 9/10)
```

## MÉTRIQUES DE SUCCÈS

| Axe | Définition du 10/10 |
|-----|---------------------|
| Sécurité | 0 XSS, sanitization 100%, credentials sécurisés, import validé |
| RGPD | Droit effacement, export données, consentement, transparence |
| Accessibilité | WCAG 2.1 AA, ARIA complet, keyboard nav, contrastes OK |
| Architecture | Sections claires, 0 duplication inutile, constantes nommées |
| Conformité fiscale | Tous taux vérifiés 2025/2026, piste d'audit, edge cases couverts |
| Robustesse | Validation stricte, error handling exhaustif, 0 crash possible |
| UX Mission | Flow intuitif, feedback clair, préremplissage, 0 friction |
| DevOps | Lint + validation + scan sécu dans pipeline |
| Tests | Smoke tests critiques, calculs fiscaux vérifiés |
| Performance | 0 reflow inutile, cleanup mémoire, render < 3s |

---

## NOTES D'IMPLÉMENTATION

### Contraintes:
- Fichier unique index.html (pas de refactoring en modules séparés)
- Pas de framework, vanilla JS uniquement
- Doit rester fonctionnel offline (PWA)
- Compatibilité Chrome/Firefox (Edge optionnel)

### Ce fichier sert de MÉMOIRE PERSISTANTE:
- Cocher [x] chaque tâche terminée
- Mettre à jour les notes après chaque sprint
- Ne jamais supprimer ce fichier pendant l'exécution

---

*Dernière mise à jour: 2026-03-15*
*Basé sur l'audit complet du code V74*
