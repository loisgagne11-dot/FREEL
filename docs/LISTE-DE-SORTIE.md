# Liste de sortie — ce qui reste avant de dire « l'application est finie »

**Date : 6 novembre 2026.** Schéma des faits : v17. Branche de travail : PR #297.

Cette liste est **la seule** : elle remplace `AVANCEMENT.md` comme état
d'avancement et les quatre plans (archivés dans `docs/archives/`). Elle existe
parce qu'aucun critère unique ne disait « fini », et que chaque fusion était
suivie de nouveaux défauts trouvés à la main.

**Règle de tenue : elle se met à jour dans le même commit que ce qui la change.
Un lot n'est pas fini tant qu'elle ne le porte pas.**

Les trois inventaires (`AUDIT-REDESIGN-V1.11.md`, `AUDIT-ANCIENNE-VS-NOUVELLE.md`,
`AUDIT-GRAPHES-ET-INDICATEURS.md`) restent le détail par axe : écran, fonction,
nombre lu. Ici, on ne garde que ce qui n'est pas fait.

Légende : ✅ fait · ◐ partiel · ⬜ pas fait.

## Décisions attendues du propriétaire

| N° | Décision | État | Recommandation de l'audit |
|---|---|---|---|
| 1 | Fusionner la PR #296 | ✅ faite, fusionnée le 6/11 | — |
| 2 | Rail : six entrées comme le handoff, ou garder « Facturer » | ⬜ en attente | Suivre le handoff : la facture se crée depuis « + Nouveau » et depuis le Pilote. Conditionne le lot 6. |
| 3 | Impôt de l'activité : taux marginal ou prorata | ⬜ en attente | Marginal : c'est le surcoût réel pour le foyer, et ce que calcule déjà le comparateur. Conditionne L5 (lot 2). |
| 4 | Prénom du propriétaire dans les sources publiques du handoff et les captures | ⬜ en attente | Le remplacer par un prénom fictif dans les sources, regénérer les captures ; ne pas réécrire l'historique git. |
| 5 | Adresse du projet Supabase en dur dans l'ancienne `index.html` | ⬜ en attente | Retirer la ligne (l'ancienne application a déjà un champ de saisie), garder le fichier. |
| 6 | Contrôle du taux BNC 2026 (25,6 %) sur l'avis URSSAF réel, sans communiquer de chiffre | ⬜ en attente | Si le taux est confirmé, L10 se referme pour le taux et la source passe en premier ordre. |

## Lots en cours et à venir

Principe d'ordre : d'abord l'irréversible (une donnée perdue ne revient pas),
puis le faux (un chiffre faux fait prendre une mauvaise décision), puis le laid.
Une PR par lot, finie au sens de `CLAUDE.md` avant d'être proposée. Les
identifiants L, S, Q sont ceux de l'audit du 6 novembre 2026. Les noms de lots
ne se réutilisent jamais.

### Lot 0 — Poser la liste de sortie (PR #297, en cours)

| Ligne | État |
|---|---|
| Cette liste ; archivage des quatre plans ; `AVANCEMENT.md` en historique | ✅ fait |
| Q1 — deux fichiers contenant un octet nul (`Outils.cra.tsx`, `selecteurs.performance.ts`) : git les traite en binaire, les diffs sont illisibles | ✅ fait — échappés, et `tests/smoke-test.js` refuse désormais tout octet nul |

### Lot 1 — Rien ne se perd (PR #297, en cours, priorité 1)

| Ligne | État |
|---|---|
| S1 — validation de chaque élément de liste (dont `echeances` et `missions[].entites`) ; filet d'erreur par écran et pour l'application, avec téléchargement des données brutes | ✅ fait |
| S2 — garde de schéma à l'envoi vers le compte : envoi et « écraser » désactivés si le schéma distant est postérieur (un compte seulement abîmé reste remplaçable, sinon irréparable) | ✅ fait |
| S3 — deux onglets : écoute de `storage`, contrôle de révision avant écriture ; l'autre onglet l'emporte et la saisie écartée est signalée ; une version plus récente ouverte à côté arrête l'écriture | ✅ fait |
| S4 — quota plein : « sans persistance » au premier échec, levé quand l'espace revient ; au démarrage, un stockage plein se lit au lieu de passer pour une navigation privée ; l'alerte est visible sur tous les écrans | ✅ fait |
| S5 — justificatifs : stockage persistant demandé au premier dépôt ; « pièce conservée » seulement à la validation de la transaction | ✅ fait |
| S5 (suite) — export des pièces (archive téléchargeable) : elles ne sont ni dans l'export JSON ni dans la synchronisation, et sont à conservation légale | ⬜ à planifier (lot 7) |
| S6 — copie de l'état local avant toute restauration, récupération de compte ou reprise de l'ancienne application ; « Revenir à l'état d'avant » dans Réglages → Données ; remplacement refusé si la copie ne peut pas s'écrire | ✅ fait |
| Q3 — `verifierAbsenceDePerte` à l'import : réévalué. La conversion passe ce contrôle sur tous les cas atypiques sondés (doublons, montants en texte, factures nulles), et il compare des nombres et des totaux — il n'aurait pas vu les écarts réellement rencontrés (journées sans lieu, missions via agence). Non câblé : aucun test ne pourrait prouver qu'il sert | ✅ clos sans changement |

Chaque correctif porte son test de mutation.

### Lot 2 — Un chiffre, une source (avant le 1er janvier 2027)

| Ligne | État |
|---|---|
| L1 — une seule `periodesADeclarer` ; l'échéancier propose « Déclarer 0 € » (une déclaration à zéro reste obligatoire) | ⬜ |
| L2 — un seul sélecteur `nombreATraiter`, compté en sujets, identique partout | ⬜ |
| L4 — garder la provision d'impôt de N-1 jusqu'au solde, avec un test qui traverse le 31 décembre | ⬜ |
| L5 — une seule méthode d'impôt de l'activité (selon la décision n° 3) | ⬜ |
| L9 — écrire « avant impôt » sur tout net ou toute capacité qui l'exclut | ⬜ |
| L11 — date locale pour les annulations (la date UTC bascule dans l'année précédente) ; CFP rangée dans la nature `cfp` ; arrondi des parts | ⬜ |
| Q2 — les cinq tests qui ne tiennent rien (`if (statut === 'refuse') return;` sans assertion) : utilitaire `publie(r)` | ⬜ |
| Q4 — `domain/dates.ts` et `ui/format.ts` comme seules sources (`joursEntre` en six copies, `enKiloEuros`, libellé « mois année ») | ⬜ |

Touche le Pilote et l'Argent : captures à regénérer.

### Lot 3 — TVA franchie en cours d'année (priorité 2)

| Ligne | État |
|---|---|
| L3 — dériver `tvaExigibleDepuis` des encaissements ; la saisie ne garde que l'option ; afficher la date et les factures concernées | ⬜ |
| L7 — solde en TTC et provision de la TVA collectée non reversée | ⬜ |
| L6 — TVA des avoirs : recopier la TVA au signe opposé dans l'annulation | ⬜ |
| L8 — décote dans le comparateur (en `Resolution`), ou abstention sous le seuil où elle joue | ⬜ |

### Lot 4 — Jeu d'essai à forme réelle et démo en bonne santé (priorité 2)

| Ligne | État |
|---|---|
| Jeu d'essai de structure réelle, valeurs factices : mission via agence, import ancien sans lieu, TVA franchie en juin, avoir, foyer à deux parts avec salaire, ACRE qui s'éteint, passage du 31 décembre ; il entre dans les captures et les tests d'intégration | ⬜ |
| Démo réécrite pour montrer un indépendant serein avec un ou deux sujets (aujourd'hui : quatre périodes en retard, 0,1 mois d'autonomie) | ⬜ |
| Contrôle de confidentialité relu à l'œil | ⬜ |

Sert de filet aux lots 5 et 6.

### Lot 5 — Pilote aligné sur le handoff

| Ligne | État |
|---|---|
| « Décisions du jour » en bloc principal ; une ligne par élément avec pastille de statut cliquable et « levier → » | ⬜ |
| Phrase de synthèse de santé à règle de priorité écrite (le score /100 du handoff reste refusé : pondérations arbitraires, `AUDIT-GRAPHES-ET-INDICATEURS.md` §5.1) | ⬜ |
| Salutation « Bonjour {prénom} — n sujets ce matin », prénom saisi dans Réglages, jamais en dur | ⬜ |
| Plus aucun doublon (versable, tuiles d'Argent, « Ce que je dois ») ; demi-largeur vide à côté de la carte versable | ⬜ |
| Contrôle visuel image contre image avec le handoff | ⬜ |

### Lot 6 — Barre du haut et rail

| Ligne | État |
|---|---|
| Navigateur de mois qui pilote tous les écrans ; recherche (client, numéro, montant) ; « + Nouveau » (facture, dépense, mission, congé) ; « Exporter » | ⬜ |
| Livre des recettes en accès direct dans le rail ; carte utilisateur | ⬜ |
| Rail tranché (décision n° 2) | ⬜ |
| Q5 — budget de Réglages : l'écran Compte est désormais chargé à la demande (Réglages 39,92 → sous 38 Ko ; le plus lourd est Activité, 38,34 / 40) | ✅ fait (lot 1) |

### Lot 7 — Finitions (priorité 3, parallélisable)

| Ligne | État |
|---|---|
| Q8 — tutoiement : une douzaine de phrases vouvoient encore (relire à l'œil, `relance.ts` excepté) | ⬜ |
| Q7 — contraste de `--muted-2` et de `--green` en thème calme (calculé, pas encore vu sur capture) | ⬜ |
| Q6 — lint des hooks React dans `verifier` | ⬜ |
| Q9 — code mort (`GrapheBarres`, classes CSS de l'ancien calendrier) ; iframe d'impression retirée sur `afterprint` ; anti-rebond dans `persister` ; `as never` de `Facturier.tsx` ; modules de plus de 800 lignes | ⬜ |
| S7 — robustesse réseau (n'effacer la session que sur 400/401, délai maximal, `https:` exigé), relevé CSV (`1e5`, `12abc`, libellé multi-ligne), CSP, sandbox de l'iframe d'impression, URL d'export révoquée trop tôt | ⬜ |
| L10 — barèmes à recouper : taux BNC, ACRE, tranches 2025-2026, profil CIPAV, plafond du versement libératoire, seuils de TVA spécifiques, plafond micro proratisé | ⬜ |
| Contrôles à ajouter à `verifier` : octets nuls, lint des hooks, contraste, impératifs en -ez, code mort | ⬜ |
| Modules retenus du handoff encore absents : provisions en pilote automatique, brief du lundi | ⬜ |

## Reste fonctionnel par écran

Vérifié dans le code le 6 novembre 2026 : « fait » veut dire que le code
existe et est appelé depuis un écran, pas que le test mord.

### Pilote

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| Statuts cliquables dans « Le flux du mois » | ◐ | Détail en lecture seule ; aucun statut ne se modifie depuis l'écran | 5 |
| Actions rapides personnalisables | ⬜ | Liste figée : ni catalogue, ni « + », ni persistance | à planifier |
| Panneau « Pointer un encaissement » | ◐ | `encaisserRecette` n'est appelée que depuis le facturier | 5 |
| Provision d'IR sur les encaissements attendus | ⬜ | Les trois appelants de `provisionIrDe` ne passent jamais `caAttendu` : la provision reste un plancher sur l'encaissé | 2 (avec L4, L5) |

### Argent

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| Provision d'impôt alignée sur les échéances réelles | ◐ | Les prévisions suivent la formule de délai ; la provision d'IR n'utilise pas ce pipeline | 2 |
| Cycle d'échéance enrichi (à déclarer, déclarée, payée, daté) | ◐ | `Echeance` ne porte que `payeeLe` et `montantPaye` ; « déclarée » est un fait distinct, sans date | à planifier |
| Frise des jalons réglementaires | ◐ | La frise trace les échéances saisies, pas les jalons | à planifier |
| Détail de la projection d'autonomie | ◐ | Seul `autonomieMois` est affiché | à planifier |
| Mention de conservation de 10 ans | ⬜ | `ANNEES_CONSERVATION` n'est lue par aucun fichier de `ui/` | à planifier |
| Grille ACRE par période | ⬜ | `ABATTEMENT_ACRE` est une constante | 7 (L10) |
| Abattement ACRE à 25 % au 01/07/2026 | ⬜ à vérifier | Annoncé « probable mais non confirmé » ; aucune trace dans le code | 7 (L10) |
| Provision mensuelle de l'IR (`addIRMonthlyProvisions`) | ◐ | Plancher existant, non réparti mois par mois | 2 |
| Provisions automatiques : enveloppes remplies à chaque encaissement, ordre de virement préparé | ⬜ | Aucun code | 7 |
| Comparaison N−1 / tendance | ⬜ volontaire | Reportée (« utile la troisième année ») | à planifier |

### Activité

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| « Ce que Freel remarque » | ⬜ | Seul « Le mois en chiffres » est livré | à planifier |
| Onglet Missions : avancement `j / j` et filtres par statut | ◐ | CA, encaissé, reste, TJM et statut affichés ; ni avancement en jours ni filtre | à planifier |
| Lieu par défaut sur le client | ⬜ | Aucun `lieuParDefaut` ; les journées importées restent « sans lieu » (voir Q3, jeu d'essai du lot 4) | 4 |
| Statut d'un CRA (envoyé, validé, archivé) | ⬜ volontaire | Aucun champ « envoyé » au schéma | à planifier |
| Composition au clic du TJM effectif et de la marge nette | ⬜ | `Composition` n'est pas importé par Activité | à planifier |

### Facturer / Facture

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| Conservation des lignes d'une facture | ⬜ | Schéma 18 à prévoir ; une facture rééditée se rétablit en une désignation | à planifier |
| « Enregistrer brouillon » | ⬜ | Dépend du point précédent | à planifier |
| Envoi par courriel | ⬜ volontaire | Aucun envoi, ni pour la facture ni pour le CRA | — |
| Place de « Facturer » dans le rail | ⬜ décision | Décision n° 2 | 6 |

### Achats

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| Tuiles « à rapprocher » et « justificatifs manquants » | ◐ | Les tuiles sont TTC, TVA récupérable, TVA perdue, à autoliquider ; les pièces manquantes sont dans le sous-titre | à planifier |
| Rapprochement : créer une dépense depuis une opération orpheline | ⬜ | Seuls « associer » et « sans contrepartie » existent | à planifier |
| État « ignorée » au rapprochement | ◐ | Le motif `autre` s'en approche | à planifier |
| Dépenses récurrentes signalées, totalisées, générées | ⬜ | Aucune notion de récurrence | à planifier |
| Filtre par compte | ⬜ | Seule la barre de période existe | à planifier |
| Import OFX | ⬜ | Aucun | à planifier |
| Correction ou suppression à la main d'un mouvement importé | ⬜ | Aucune action | à planifier |
| Justificatifs sauvegardés et protégés de l'éviction | ◐ | Voir S5 | 1 |

### Outils

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| Troisième onglet « Compte pro & banque » | ⬜ | L'import de relevé reste dans Achats | 6 |
| Simulateur CFE avec base minimum par commune | ◐ | Lecture de l'avis × taux seulement, par décision | à planifier |
| Comparateur micro-BNC vs déclaration contrôlée | ⬜ | Aucun module | à planifier |
| Décote dans le comparateur d'impôt | ⬜ | Voir L8 | 3 |

### Réglages / Compte

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| Navigation en sept sections | ◐ | Quatre sections (Profil, Barème, Données, Compte) | 6 |
| Facturation : numérotation et mentions | ◐ | SIRET et IBAN contrôlés ; aucun réglage de numérotation ni de mentions | à planifier |
| Coffre des documents | ⬜ | Aucun dépôt ; retenu au périmètre | à planifier |
| Mode hors ligne, retard de synchronisation affiché | ◐ | Aucun `navigator.onLine` ; la pastille ne dit que relié, expiré ou local | à planifier |
| Synchronisation temps réel multi-appareils | ⬜ | Synchronisation manuelle seulement | à planifier |
| Règles d'accès de `user_data` vérifiées et documentées | ⬜ | `supabase.sql` ne les touche pas | à planifier |
| Restauration et récupération sans copie de secours | ⬜ | Voir S6 | 1 |

### Documents

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| Livre des recettes en CSV | ⬜ | Seuls des exports JSON et HTML existent | 6 (avec l'accès rail) |

### Transverse

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| Brief du lundi | ⬜ | Aucun code | 7 |
| Bascule : nouvelle version à la racine, ancienne sous `/legacy/` neutralisée en écriture | ⬜ | Le déploiement garde l'ancienne à la racine et la nouvelle dans `/v2/` | à planifier |
| Test Playwright « zéro écriture depuis `/legacy/` » | ⬜ | Aucun script | à planifier |
| Harnais différentiel contre l'application actuelle | ⬜ | Aucun script | à planifier |
| Retirer les méta anti-cache de l'ancienne version | ⬜ | Lié à la bascule | à planifier |
| Onboarding de première ouverture | ⬜ | Aucun en UI | à planifier |
| Recherche globale | ⬜ | Aucune (voir lot 6) | 6 |
| Raccourcis clavier | ⬜ | Seulement dans les composants d'accessibilité | à planifier |
| Conseils automatiques (`getInsights`) | ⬜ | Aucun | à planifier |
| Écart du CA encaissé de l'année : quelle ligne l'explique | ⬜ à vérifier | Demande les données réelles du propriétaire, absentes du dépôt | à planifier |
| Reprise de l'ancienne application à refaire | ⬜ à vérifier | Action du propriétaire, pas du code | après lot 1 (Q3) |
| Contrôle visuel de « Évolution du compte » dans les deux thèmes | ⬜ à vérifier | Captures non relues | à planifier |
| Captures : sélecteur d'année absent (le jeu ne porte qu'une année) | ⬜ à vérifier | Non inspecté | 4 |

## Abandonné, avec la décision

| Élément | Décision |
|---|---|
| Facture et CRA « en PDF » | Remplacés par « Imprimer → Enregistrer en PDF » et un téléchargement HTML autonome ; pas de bibliothèque PDF, jamais de fichier `.pdf` factice (`infra/telechargement.ts`) |
| jsPDF différé | Même décision ; jsPDF et Chart.js sont absents de `package.json` |
| Export FEC | Retiré par la décision D6 : le FEC ne concerne pas la micro |
| Rendement du compte pro et `calculerRendementMensuel` | Hors du métier micro-BNC |
| Pastilles Qonto et Documents | Retirées, décision écrite dans `PastillesSysteme.tsx` |
| Réparer ou permuter la numérotation des factures | Refusé : les trous sont signalés, pas réparés |
| Forfait et Par lots | Écartés au périmètre du 16/08 |
| Quatre modules d'intelligence (relances automatiques, score de risque client, copilote fiscal, prévision probabiliste) | Hors périmètre |
| Centre de notifications | Hors périmètre cible |
| Score de santé sur 100, cascade, donut de destination, scénarios, sparklines | Refusés avec motif (`AUDIT-GRAPHES-ET-INDICATEURS.md` §5.5) ; le Pilote reçoit une phrase de synthèse (lot 5) |
| Type « Indispo » du créneau | Non repris : le schéma ne connaît que le congé |
| Onglet Factures dans Activité | Le facturier est un écran à part |
| Simulateur CFE à grille de bases minimales | Refusé au profit de la lecture de l'avis |

## Ce qui est fait

Tout le reste est livré : voir l'historique git et les trois inventaires.
