# FREEL - Plan de Sprint pour atteindre 10/10

## État actuel: ~99% fonctionnel, mais carences critiques

### Diagnostic des axes d'amélioration (note actuelle estimée → cible 10/10)

| Axe | Note actuelle | Problèmes identifiés |
|-----|---------------|---------------------|
| **Sécurité** | 4/10 | XSS via innerHTML partout, pas de sanitization, credentials en clair dans localStorage |
| **Accessibilité** | 3/10 | Aucun aria-label, pas de rôles ARIA, navigation clavier incomplète, contraste non vérifié |
| **Robustesse** | 6/10 | Validation faible (SIRET, IBAN, email), try/catch vides, pas de tests automatisés |
| **UX/Mission Creation** | 7/10 | Flow fonctionnel mais améliorable (feedback, UX, états intermédiaires) |
| **Performance** | 6/10 | innerHTML = '' cause des reflows, pas de cleanup mémoire sur modals, pas de debounce |
| **Code Quality** | 5/10 | Fichier monolithique 16k lignes, pas de séparation de concerns |
| **Documentation** | 5/10 | README minimal, pas de JSDoc, pas de guide contributeur |
| **Tests** | 0/10 | Aucun test automatisé |
| **CI/CD** | 4/10 | Deploy seulement, pas de lint/test/build dans pipeline |
| **Conformité légale** | 8/10 | LEGAL_BY_YEAR bon, quelques edge cases TVA/ACRE non testés |

---

## SPRINT 1 - SÉCURITÉ (CRITIQUE - Priorité P0)
**Objectif: Passer de 4/10 à 10/10 en sécurité**
**Estimation: ~2h de travail**

### Tâche 1.1: Créer une fonction d'échappement HTML
- [ ] Ajouter `escapeHTML(str)` qui échappe `<>&"'`
- [ ] Pattern: `str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[m])`

### Tâche 1.2: Sécuriser tous les innerHTML avec données utilisateur
- [ ] Auditer TOUS les innerHTML qui injectent des données utilisateur
- [ ] Remplacer par textContent quand HTML n'est pas nécessaire
- [ ] Appliquer escapeHTML() quand innerHTML est nécessaire avec des données user
- [ ] Focus critique: `generateInvoiceHTMLContent()` (lignes ~8394-8481)
- [ ] Focus critique: modale salaire, infos financières
- [ ] Vérifier: noms clients, adresses, descriptions, SIRET, IBAN dans les templates

### Tâche 1.3: Sécuriser l'import JSON
- [ ] Valider la structure du JSON importé avant de l'appliquer
- [ ] Vérifier les types de chaque champ
- [ ] Rejeter les données malformées avec message clair

### Tâche 1.4: Sécuriser le stockage Supabase
- [ ] Ne pas exposer les erreurs Supabase détaillées à l'utilisateur
- [ ] Masquer les messages d'erreur techniques (err.message → message générique)

---

## SPRINT 2 - ACCESSIBILITÉ (CRITIQUE - Priorité P0)
**Objectif: Passer de 3/10 à 10/10 en accessibilité**
**Estimation: ~2h de travail**

### Tâche 2.1: Attributs ARIA sur les éléments interactifs
- [ ] Ajouter `aria-label` sur tous les boutons icône/emoji (thème, notifications, auth, privacy)
- [ ] Ajouter `role="dialog"` et `aria-modal="true"` sur les modals
- [ ] Ajouter `aria-label` sur le modal overlay
- [ ] Ajouter `role="navigation"` sur la navbar
- [ ] Ajouter `role="tablist"`, `role="tab"`, `role="tabpanel"` sur les onglets

### Tâche 2.2: Formulaires accessibles
- [ ] Associer chaque input à son label via `for`/`id`
- [ ] Ajouter `aria-required="true"` sur les champs obligatoires
- [ ] Ajouter `aria-invalid` et `aria-describedby` pour les erreurs
- [ ] Vérifier que createInput() génère des associations label/input correctes

### Tâche 2.3: Navigation clavier
- [ ] Vérifier que tous les modals sont trap-focus (focus ne sort pas du modal)
- [ ] Ajouter Escape pour fermer les modals
- [ ] Tab order logique dans les formulaires
- [ ] Focus visible sur tous les éléments interactifs (outline)

### Tâche 2.4: Contrastes et textes alternatifs
- [ ] Vérifier les contrastes texte/fond (ratio 4.5:1 minimum)
- [ ] Ajouter des textes alternatifs aux éléments visuels (sparklines, charts)
- [ ] Ne pas utiliser la couleur seule comme indicateur (ajouter icônes/texte)

---

## SPRINT 3 - ROBUSTESSE & VALIDATION (Priorité P1)
**Objectif: Passer de 6/10 à 10/10 en robustesse**
**Estimation: ~1.5h de travail**

### Tâche 3.1: Renforcer validateInput()
- [ ] SIRET: ajouter vérification Luhn
- [ ] IBAN: ajouter validation format complet (longueur par pays + checksum mod 97)
- [ ] Email: regex plus stricte
- [ ] Téléphone: format français (10 chiffres, commence par 0)
- [ ] Dates: validation cohérence (fin > début)

### Tâche 3.2: Validation mission creation
- [ ] Vérifier que TJM > 0 (pas juste >= 0)
- [ ] Vérifier que date fin >= date début
- [ ] Vérifier que le client existe ou est créé
- [ ] Feedback visuel sur les champs invalides (bordure rouge + message)
- [ ] Empêcher la soumission si validation échoue (désactiver bouton)

### Tâche 3.3: Gestion d'erreurs robuste
- [ ] Remplacer les catch vides par des handlers informatifs
- [ ] Ne pas exposer les stack traces (messages user-friendly)
- [ ] Ajouter des fallbacks pour les calculs (division par zéro, NaN)
- [ ] Protéger JSON.parse avec try/catch systématique

---

## SPRINT 4 - UX MISSION CREATION (Priorité P1)
**Objectif: Passer de 7/10 à 10/10 en UX de création de mission**
**Estimation: ~1.5h de travail**

### Tâche 4.1: Améliorer le flow de création
- [ ] Ajouter une confirmation avant de quitter le formulaire si modifications non sauvegardées
- [ ] Ajouter un indicateur de progression dans le formulaire (sections numérotées)
- [ ] Pré-remplir les champs intelligemment (ex: date début = demain si vide)
- [ ] Auto-focus sur le premier champ à l'ouverture du modal

### Tâche 4.2: Améliorer le feedback utilisateur
- [ ] Toast de confirmation après sauvegarde mission
- [ ] Animation de transition à la sauvegarde
- [ ] Message d'aide contextuel sur les champs complexes (TJM, délai paiement)
- [ ] Placeholder textes explicites

### Tâche 4.3: Améliorer la gestion des périodes
- [ ] Visualisation calendrier des périodes
- [ ] Validation des chevauchements de périodes
- [ ] Calcul en temps réel du nombre de jours par période

### Tâche 4.4: Améliorer la gestion des statuts
- [ ] Transition de statut avec confirmation
- [ ] Historique des changements de statut
- [ ] Filtres par statut dans la liste des missions

---

## SPRINT 5 - PERFORMANCE (Priorité P2)
**Objectif: Passer de 6/10 à 10/10 en performance**
**Estimation: ~1h de travail**

### Tâche 5.1: Optimiser les manipulations DOM
- [ ] Remplacer `body.innerHTML = ''` par `body.replaceChildren()`
- [ ] Utiliser DocumentFragment pour les listes longues
- [ ] Debounce sur les inputs de recherche et calculs en temps réel

### Tâche 5.2: Optimiser la mémoire
- [ ] Cleanup des event listeners lors de la fermeture des modals
- [ ] Détruire les instances Chart.js avant d'en créer de nouvelles
- [ ] Nettoyer les setTimeout orphelins

### Tâche 5.3: Lazy loading
- [ ] Charger les graphiques Chart.js seulement quand l'onglet Finances est actif
- [ ] Différer le calcul des KPIs non visibles

---

## SPRINT 6 - CI/CD & QUALITÉ (Priorité P2)
**Objectif: Pipeline robuste**
**Estimation: ~1h de travail**

### Tâche 6.1: Ajouter du linting au pipeline
- [ ] Créer un script de validation HTML (structure, fermeture tags)
- [ ] Ajouter une étape de vérification dans deploy.yml

### Tâche 6.2: Tests de smoke basiques
- [ ] Vérifier que le fichier HTML est valide
- [ ] Vérifier que toutes les fonctions critiques sont définies
- [ ] Vérifier la taille du fichier (alerte si > 2MB)

---

## SPRINT 7 - DOCUMENTATION (Priorité P3)
**Objectif: Documentation complète**
**Estimation: ~30min de travail**

### Tâche 7.1: Commentaires code critiques
- [ ] Documenter les fonctions clés (compute, render, buildMission, etc.)
- [ ] Ajouter des commentaires de section dans le HTML

---

## ORDRE D'EXÉCUTION RECOMMANDÉ

```
PRIORITÉ P0 (BLOQUANT - Faire en premier):
├── Sprint 1: Sécurité        ← CRITIQUE, risque XSS réel
└── Sprint 2: Accessibilité   ← CRITIQUE, conformité RGAA/WCAG

PRIORITÉ P1 (IMPORTANT):
├── Sprint 3: Robustesse      ← Validation, error handling
└── Sprint 4: UX Mission      ← Amélioration du flow principal

PRIORITÉ P2 (AMÉLIORATIONS):
├── Sprint 5: Performance     ← Optimisations DOM/mémoire
└── Sprint 6: CI/CD           ← Pipeline qualité

PRIORITÉ P3 (NICE TO HAVE):
└── Sprint 7: Documentation   ← Commentaires, docs
```

## MÉTRIQUES DE SUCCÈS (10/10)

| Critère | Définition du 10/10 |
|---------|---------------------|
| Sécurité | 0 vulnérabilité XSS, sanitization complète, pas d'info sensible exposée |
| Accessibilité | WCAG 2.1 AA conforme, navigation clavier complète, ARIA labels partout |
| Robustesse | Validation stricte tous champs, error handling exhaustif, pas de crash possible |
| UX Mission | Flow intuitif, feedback clair, préremplissage intelligent, 0 friction |
| Performance | Pas de reflow inutile, cleanup mémoire, < 3s render initial |
| CI/CD | Lint + validation + deploy automatiques |
| Documentation | Fonctions clés documentées |
| Conformité | Toutes les règles fiscales testées et correctes |

---

*Ce fichier sert de mémoire persistante pour l'exécution du plan.*
*Dernière mise à jour: 2026-03-15*
