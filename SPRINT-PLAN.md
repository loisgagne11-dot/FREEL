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

### 1.1: Créer une fonction d'échappement HTML
- [ ] Ajouter `escapeHTML(str)` qui échappe `<>&"'`
- [ ] Utiliser partout où des données utilisateur sont injectées dans du HTML

### 1.2: Sécuriser TOUS les innerHTML avec données utilisateur
- [ ] Auditer chaque innerHTML contenant des données user (noms, adresses, SIRET, descriptions)
- [ ] Remplacer par `textContent` quand HTML n'est pas nécessaire
- [ ] Appliquer `escapeHTML()` quand innerHTML est requis avec données user
- [ ] Focus critique: `generateInvoiceHTMLContent()` — toutes les propriétés non échappées
- [ ] Focus critique: modales salaire, infos financières, recommandations
- [ ] Focus: `d.adresseClient.replace(/,/g, '<br>')` — injection directe

### 1.3: Sécuriser l'import JSON
- [ ] Valider la structure du JSON importé (schéma attendu)
- [ ] Vérifier les types de chaque champ avant application
- [ ] Rejeter les données malformées avec message clair
- [ ] Limiter la taille du fichier importé

### 1.4: Sécuriser les erreurs exposées
- [ ] Masquer `err.message` dans les toast Supabase → messages génériques
- [ ] Ne jamais exposer de stack traces côté utilisateur
- [ ] Logger les erreurs en console uniquement

### 1.5: Sécuriser le stockage credentials
- [ ] Avertir l'utilisateur que les clés Supabase sont stockées en clair
- [ ] Ajouter une option de déconnexion qui purge les credentials

---

## SPRINT 2 - RGPD & DONNÉES (Priorité P0 - BLOQUANT)
**Note actuelle: 2/10 → Cible: 10/10**

### 2.1: Droit à l'effacement
- [ ] Ajouter un bouton "Supprimer toutes mes données" dans Config
- [ ] Confirmation double avant suppression (modal + re-saisie)
- [ ] Purger localStorage complet + Supabase si connecté

### 2.2: Export des données personnelles (portabilité)
- [ ] Bouton "Exporter mes données" (JSON complet) — déjà partiellement fait, vérifier exhaustivité
- [ ] Inclure TOUTES les données (company, missions, clients, treasury, IR, conges, factures)

### 2.3: Consentement et transparence
- [ ] Ajouter une mention légale / politique de confidentialité accessible
- [ ] Informer que les données restent en local (pas de tracking)
- [ ] Si Supabase activé: informer de l'envoi de données vers le cloud

### 2.4: Chiffrement local (optionnel mais recommandé)
- [ ] Envisager le chiffrement des données sensibles dans localStorage
- [ ] Au minimum: ne pas stocker les mots de passe en clair (Supabase gère déjà)

---

## SPRINT 3 - ACCESSIBILITÉ (Priorité P0 - BLOQUANT)
**Note actuelle: 5/10 (UX) avec accessibilité à ~2/10 → Cible: 10/10**

### 3.1: Attributs ARIA sur les éléments interactifs
- [ ] `aria-label` sur tous les boutons icône/emoji (thème ☀️, notif 🔔, auth 🔒, privacy 👁️)
- [ ] `role="dialog"` + `aria-modal="true"` sur les modals
- [ ] `role="navigation"` sur la navbar
- [ ] `role="tablist"`, `role="tab"`, `role="tabpanel"` sur les onglets principaux et sous-onglets

### 3.2: Formulaires accessibles
- [ ] Associer chaque input à son label via `for`/`id` dans `createInput()`
- [ ] `aria-required="true"` sur les champs obligatoires
- [ ] `aria-invalid="true"` + `aria-describedby` pour les erreurs de validation
- [ ] Grouper les champs liés avec `fieldset` + `legend`

### 3.3: Navigation clavier
- [ ] Focus trap dans les modals (Tab ne sort pas du modal)
- [ ] Escape pour fermer tous les modals et overlays
- [ ] Tab order logique dans tous les formulaires
- [ ] `:focus-visible` outline visible sur tous les éléments interactifs
- [ ] Skip-to-content link

### 3.4: Contrastes et alternatives textuelles
- [ ] Vérifier contrastes texte/fond (ratio WCAG AA 4.5:1 minimum)
- [ ] Textes alternatifs sur les charts (Chart.js aria-label + description textuelle)
- [ ] Ne jamais utiliser la couleur seule comme indicateur (toujours icône + texte en plus)

---

## SPRINT 4 - QUALITÉ CODE & ARCHITECTURE (Priorité P1)
**Note actuelle: Architecture 3/10, Qualité 4/10 → Cible: 8/10**
*(10/10 nécessiterait une réécriture modulaire complète, hors scope)*

### 4.1: Éliminer la duplication
- [ ] Identifier les blocs de code dupliqués (render patterns, calculs répétés)
- [ ] Extraire des fonctions utilitaires partagées
- [ ] Centraliser les constantes (magic numbers → constantes nommées)

### 4.2: Organiser le code par sections claires
- [ ] Ajouter des séparateurs de section avec commentaires structurés
- [ ] Regrouper: Constants → Utils → Data → Compute → Render → Events → Init
- [ ] Documenter les dépendances entre sections

### 4.3: Remplacer les magic numbers
- [ ] Extraire les seuils fiscaux déjà dans LEGAL (vérifier exhaustivité)
- [ ] Remplacer les valeurs hardcodées (délais, taux, limites) par des constantes
- [ ] Centraliser les couleurs/tailles CSS récurrentes en variables CSS

### 4.4: Nettoyer le code mort
- [ ] Supprimer les fonctions inutilisées
- [ ] Supprimer les variables non référencées
- [ ] Supprimer les commentaires obsolètes (// TODO anciens résolus)

---

## SPRINT 5 - CONFORMITÉ FISCALE (Priorité P1)
**Note actuelle: 6/10 → Cible: 10/10**

### 5.1: Vérifier tous les taux 2025/2026
- [ ] URSSAF: vérifier taux BNC/BIC pour 2025 et 2026
- [ ] TVA: vérifier seuils franchise et taux
- [ ] CFP: vérifier taux contribution formation
- [ ] ACRE: vérifier les taux réduits et durées
- [ ] IR: vérifier les tranches et taux marginaux
- [ ] CFE: vérifier les bases de calcul

### 5.2: Piste d'audit
- [ ] Logger les changements de données sensibles (taux, montants) avec timestamp
- [ ] Ajouter un historique des modifications dans le livre des recettes
- [ ] Numérotation séquentielle des factures vérifiable (pas de trous)

### 5.3: Edge cases fiscaux
- [ ] TVA: transition franchise → assujetti en cours d'année
- [ ] ACRE: fin de période ACRE en cours d'année
- [ ] Micro-entreprise: dépassement de seuil en cours d'année
- [ ] Prélèvement libératoire: conditions d'éligibilité

---

## SPRINT 6 - ROBUSTESSE & VALIDATION (Priorité P1)
**Note actuelle: ~4/10 → Cible: 10/10**

### 6.1: Renforcer validateInput()
- [ ] SIRET: vérification algorithme Luhn
- [ ] IBAN: validation format complet (longueur par pays + checksum mod 97)
- [ ] Email: regex stricte
- [ ] Téléphone: format français (10 chiffres, commence par 0)
- [ ] Dates: cohérence fin > début

### 6.2: Validation mission creation renforcée
- [ ] TJM > 0 (pas juste >= 0, un TJM à 0 n'a pas de sens)
- [ ] Date fin >= date début
- [ ] Client valide (existe ou créé)
- [ ] Feedback visuel: bordure rouge + message sous le champ invalide
- [ ] Désactiver le bouton sauvegarder tant que validation échoue

### 6.3: Gestion d'erreurs robuste
- [ ] Remplacer tous les catch vides par des handlers informatifs
- [ ] Messages user-friendly (pas de stack traces)
- [ ] Fallbacks pour les calculs (division par zéro → 0, NaN → 0)
- [ ] Protéger tous les JSON.parse avec try/catch
- [ ] Valider les données chargées depuis localStorage (migration safe)

---

## SPRINT 7 - UX MISSION CREATION (Priorité P1)
**Note actuelle: 7/10 → Cible: 10/10**

### 7.1: Améliorer le flow de création
- [ ] Confirmation avant de quitter si modifications non sauvegardées
- [ ] Auto-focus sur le premier champ à l'ouverture
- [ ] Pré-remplissage intelligent (date début = demain, etc.)
- [ ] Indicateur de progression (sections numérotées visuellement)

### 7.2: Feedback utilisateur
- [ ] Toast de confirmation après sauvegarde
- [ ] Messages d'aide contextuels sur champs complexes (TJM, délai paiement)
- [ ] Placeholders explicites sur tous les champs

### 7.3: Gestion des périodes
- [ ] Validation des chevauchements de périodes
- [ ] Calcul en temps réel du nombre de jours par période
- [ ] Affichage du total jours/CA estimé en bas du formulaire

### 7.4: Gestion des statuts
- [ ] Filtres par statut dans la liste des missions
- [ ] Transition de statut avec confirmation

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
