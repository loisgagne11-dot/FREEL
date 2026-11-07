# Liste de sortie — ce qui reste avant de dire « l'application est finie »

**Date : 7 novembre 2026.** Schéma des faits : v19. Branche de travail : PR #302.

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
| 2 | Rail : six entrées comme le handoff, ou garder « Facturer » | ✅ décidé le 6/11 : **formule A**, suivre le handoff (la liste des factures devient un onglet d'Activité, la création passe par « + Nouveau » et le Pilote) | Lot 6. |
| 3 | Impôt de l'activité : taux marginal ou prorata | ✅ décidé le 6/11 : **marginal** | Fait en L5 (lot 2). |
| 4 | Prénom du propriétaire dans les sources publiques du handoff et les captures | ✅ accepté le 6/11 — remplacé par la persona « Camille Demo » déjà présente dans le handoff, captures regénérées ; l'historique git n'est pas réécrit | — |
| 5 | Adresse du projet Supabase en dur dans l'ancienne `index.html` | ✅ accepté le 6/11 — ligne retirée, fichier conservé ; l'adresse se saisit dans l'onglet « Cloud & Vie privée » de l'ancienne application | — |
| 6 | Contrôle du taux BNC 2026 (25,6 %) sur l'avis URSSAF réel | ✅ confirmé le 6/11 par le propriétaire. Il signale aussi les 0,2 % de CFP payés avec la déclaration : voir L12 (lot 2) | — |

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

### Lot 2 — Un chiffre, une source (PR #298)

| Ligne | État |
|---|---|
| L1 — une seule `periodesADeclarer`, avec les déclarations à zéro ; l'échéancier dit « à déclarer à zéro » ; test d'accord Pilote ↔ échéancier | ✅ fait |
| L2 — la pastille « à traiter » compte des sujets, comme la salutation et les badges du rail | ✅ fait |
| L4 — provision du solde de l'impôt N-1 jusqu'à la saisie de l'avis ; une échéance d'impôt peut porter l'exercice qu'elle règle ; test qui traverse le 31 décembre | ✅ fait |
| L5 — impôt de l'activité au taux marginal (décision 3), une seule fonction partagée avec le comparateur | ✅ fait |
| L9 — « avant impôt » écrit au barème sur le net d'une journée et la capacité de versement | ✅ fait |
| L12 — CFP rangée dans sa nature `cfp` (enveloppe à part), plus en « impôt » | ✅ fait. *Le montant à payer par déclaration (cotisations + CFP) s'affiche depuis le lot 5, sur le Pilote et dans l'échéancier.* |
| L11 — date du jour locale partout (elle était en UTC quand le mois courant est local) ; `ajouterJours` juste au changement d'heure ; tests à l'heure de Paris | ✅ fait. *Arrondi des parts : reporté au lot 7.* |
| Q2 — plus aucun test qui sort avant sa première assertion (`test/resolution.ts`) ; un test vide depuis le lot R vérifie de nouveau | ✅ fait |
| Q4 — `domain/dates.ts` et `ui/format.ts` comme seules sources | ↪ reporté au lot 7 : unifier `enKiloEuros` change les étiquettes des graphes (« 10,2 k€ » ↔ « 10 k€ ») et demande son contrôle visuel |

Touche le Pilote et l'Argent : captures à regénérer.

### Lot 3 — TVA franchie en cours d'année (PR #299)

| Ligne | État |
|---|---|
| L3 — une seule source du mois de TVA (`debutTvaEffectif`) : dérivé des encaissements, l'option saisie seulement si elle est antérieure ; factures et dépenses la lisent ; sujet « factures à régulariser » qui compte les factures émises sans TVA depuis le franchissement | ✅ fait. *Correction de l'audit : la date était déjà calculée et affichée ; le défaut réel était deux sources — les factures lisaient la saisie, qui restait vide.* |
| L7 — solde en TTC (le client verse la TVA) et provision de la TVA collectée non reversée ; encaisser puis reverser ne fait plus varier le versable | ✅ fait |
| L6 — l'avoir reprend la TVA au signe opposé ; le dossier de TVA compte les avoirs au trimestre de l'avoir et les marque « Avoir sur … » | ✅ fait |
| L8 — décote appliquée (barème 2024 : 889 € / 1 470 €, 45,25 %, BOFiP du 14/04/2025) dans la seule fonction partagée par la provision et le comparateur ; nouveau fait « situation du foyer » (schéma 18) — inconnue, la décote la moins favorable est retenue et l'écran le dit quand elle change le montant ; le comparateur reprend les parts et revenus saisis | ✅ fait |

### Lot 4 — Jeu d'essai à forme réelle et démo en bonne santé (PR #300)

| Ligne | État |
|---|---|
| Jeu d'essai de structure réelle, valeurs factices : mission via agence, import ancien sans lieu, TVA franchie en juin, avoir, foyer à deux parts avec salaire, ACRE qui s'éteint, passage du 31 décembre ; il entre dans les captures et les tests d'intégration | ✅ fait : `app/src/test/jeu-d-essai*.json`, 83 tests dans `src/integration/` (dont `<App />` rendu sur les sept écrans), `capturer-app.mjs --jeu=essai`. *Il a trouvé deux défauts, corrigés : provision de TVA qui gardait la TVA déductible ; import ancien qui laissait des champs de recette absents.* |
| Démo réécrite pour montrer un indépendant serein avec un ou deux sujets (aujourd'hui : quatre périodes en retard, 0,1 mois d'autonomie) | ✅ fait : au 10 juin, une facture à relancer, 3,3 mois d'autonomie. Recalée sur la date du jour quand on la charge (balayée sur deux ans). *Trouvé au passage : le rappel de facturation électronique restait « en retard » pour toujours après le 1er septembre 2026 — corrigé.* |
| Contrôle de confidentialité relu à l'œil | ✅ fait : un nom de client réel retiré d'un exemple de saisie de l'ancienne version ; démo et jeu d'essai relus nom par nom. *Il reste dans l'historique git, que ce dépôt public ne réécrit pas.* |

Sert de filet aux lots 5 et 6.

### Lot 5 — Pilote aligné sur le handoff (PR #301)

| Ligne | État |
|---|---|
| « Décisions du jour » en bloc principal ; une ligne par élément avec pastille de statut cliquable et « levier → » | ✅ fait : pleine largeur, « N à traiter », un levier par sujet vérifié contre la fonction qu'il annonce. Les pastilles cliquables sont celles du flux (encaissé, en attente, en retard ; payé, à venir), qui mènent au facturier ou à l'échéancier. *Renoncé, et écrit : les feuilles de détail du handoff (`tpl-*`) — les décisions mènent à l'écran qui règle ; la feuille « Seuil de TVA — deux leviers chiffrés » ; l'estimation « bascule en septembre » sur le Pilote (Argent la donne, au rythme de l'encaissé) ; la décision positive (« CRA prêt ») et « Dépendance client », hors de ce lot.* |
| Phrase de synthèse de santé à règle de priorité écrite (le score /100 du handoff reste refusé : pondérations arbitraires, `AUDIT-GRAPHES-ET-INDICATEURS.md` §5.1) | ✅ fait : provisions à découvert, déclaration en retard, régime (TVA due, plafond dépassé), facture en retard, déclaration à faire ; « Tout est en ordre » sinon. Le constat « Factures » compte les factures en retard, plus celles en attente |
| Salutation « Bonjour {prénom} — n sujets ce matin », prénom saisi dans Réglages, jamais en dur | ✅ fait : « Bonjour Camille — deux décisions t'attendent. » ; `entreprise.prenom`, schéma 19 |
| Plus aucun doublon (versable, tuiles d'Argent, « Ce que je dois ») ; demi-largeur vide à côté de la carte versable | ✅ fait : le versable vit dans la colonne Rémunération du flux |
| Une période close mais encore dans sa fenêtre de déclaration est annoncée « en retard » dès le lendemain de sa clôture (trouvé au lot 4) : « à déclarer avant le … », à faire, et « en retard » seulement passé la date limite — comme le « Déclarer l'URSSAF T2 — guichet ouvert » du handoff | ✅ fait, avec la base encaissée et le montant à payer (cotisations + VL + CFP) sur le Pilote et dans l'échéancier — le reste du L12 |
| Le code d'entrée est à 78,6 / 80 Ko : extraire avant d'ajouter | ✅ tenu : 78,8 Ko après le lot, les doublons retirés payant les ajouts |
| Contrôle visuel image contre image avec le handoff | ✅ fait (agent contrôleur, deux thèmes) : « conforme avec réserves ». Corrigés : autonomie en chiffre clé, décisions en rangées bordées (retard souligné, étiquette de gravité lisible), raccourcis qui passent à la ligne au lieu d'être coupés à 1 440 px, étiquettes de colonnes colorées, titres en surtitre. *Restent mineurs, assumés : boutons d'action à 44 px (cible tactile, contrôlée par `verifier`) quand le handoff les fait à 30 ; pas de repli du bloc des décisions ; pas d'icône portefeuille ; en thème clair, cartes posées sur un fond blanc (lot 7, contraste).* |

### Lot 6 — Barre du haut et rail (PR #302)

| Ligne | État |
|---|---|
| Navigateur de mois qui pilote tous les écrans ; recherche (client, numéro, montant) ; « + Nouveau » (facture, dépense, mission, congé) ; « Exporter » | ✅ fait : « ‹ juin 2026 › » en tête de barre, un seul mois pour l'application (`App`). Activité le suit et ses flèches le déplacent ; Argent, Achats et Outils en tirent l'année ; le Pilote en tire son flux — un mois passé se lit en constat (encaissé, payé, versé), un mois à venir en échéances (attendu, dû), sans versable dans les deux cas —, la santé et les décisions restent celles du jour. L'année reste à côté et ne change que le millésime du mois. Recherche ⌘K (factures, clients, missions, dépenses ; accents, casse et montants tolérés). « + Nouveau » ouvre la saisie, pas l'écran. « Exporter » : livre des recettes en CSV et sauvegarde JSON. *Renoncé, et écrit : l'export FEC du handoff — le micro-BNC tient un livre des recettes, pas une comptabilité en partie double.* Sur téléphone, la barre passe sur deux rangées et cesse d'être collante |
| Livre des recettes en accès direct dans le rail ; carte utilisateur | ✅ fait : pied du rail en grand écran, `#/argent/livre` ouvre le registre ; carte « prénom — Micro-BNC · ACRE · VL » vers Réglages |
| Rail tranché (décision n° 2) | ✅ fait, formule A : six entrées ; la liste des factures est l'onglet « Factures » d'Activité (Plan de charge · Missions · Factures · Clients), une facture ouverte allume « Activité ». Les onglets d'Activité suivent l'adresse (`#/activite/factures`…) ; `#/facture` seul y renvoie ; tous les liens « facturier » y mènent directement |
| Contrôle visuel image contre image avec le handoff | ✅ fait (agent contrôleur, deux thèmes) : premier passage non conforme sur la barre du haut (mois et palette qui se chevauchaient à 1 440 px), corrigé ; logo du rail posé, avatar en disque. *Restent mineurs, assumés : icônes du rail et des onglets, onglet actif souligné plutôt que vert, pas de compte sur l'onglet Factures, pastilles Cloud / Drive / Qonto refusées.* |
| Budgets : l'entrée (83,4) et Activité (40,15) les franchissaient en cours de lot | ✅ tenus en extrayant, plafonds intacts : boutons de la barre, pied du rail, détail du flux, éditeur de demi-journée, alerte de conservation, deux sélecteurs de Config et d'Argent. Entrée 79,9 / 80 Ko — **la marge est quasi nulle : le prochain ajout à l'entrée devra extraire d'abord** |
| Q5 — budget de Réglages : l'écran Compte est désormais chargé à la demande (Réglages 39,92 → sous 38 Ko ; le plus lourd est Activité, 38,34 / 40) | ✅ fait (lot 1) |

### Lot 7 — Finitions (priorité 3, parallélisable)

| Ligne | État |
|---|---|
| Q4 — `joursEntre` en six copies à sémantique divergente, `enKiloEuros` en deux arrondis : une source chacun (reporté du lot 2) | ✅ fait au lot 7 : `domain/dates.ts`, signé, en UTC pur ; la borne (retard) ou la valeur absolue (rapprochement) reste à l'appelant. Divergence trouvée : le facturier rendait 0 sur une date illisible — une échéance illisible passait pour « pas de retard ». `enKiloEuros` : une décimale au-delà de 1 000 €, symétrique pour les négatifs, dans `ui/format.kilo.ts` (hors de l'entrée). `decalerMois` aussi (lot 6) |
| Le brouillon « La facture de juin » du facturier garde ses propres flèches de mois, à côté du mois de la barre : le brancher dessus, ou dire pourquoi c'est un autre mois (le mois facturé) | ✅ fait au lot 7 : il suit le mois de la barre, ses flèches le déplacent |
| L11 (suite) — arrondi des parts de la ventilation (1 à 2 centimes d'écart avec le total) | ✅ fait au lot 7 : plus fort reste, les parts retombent exactement sur le total ; au-delà d'un centime par part l'écart n'est pas un arrondi et n'est pas réparti en silence |
| Q8 — tutoiement : une douzaine de phrases vouvoient encore (relire à l'œil, `relance.ts` excepté) | ✅ fait au lot 3 : treize impératifs repris (Réglages, Activité, Facture, Échéances, CFE, Compte, messages Supabase) ; restent au vouvoiement les seules lettres au client et les citations dans les commentaires |
| Q7 — contraste de `--muted-2` et de `--green` en thème calme (calculé, pas encore vu sur capture) | ✅ fait au lot 7 : seuil 4,5:1 (WCAG 1.4.3 — ces jetons écrivent du texte de 11 à 13 px), six jetons corrigés à teinte constante dans les quatre palettes ; fond de page clair teinté pour que les cartes blanches se détachent (relevé au lot 5) |
| Q6 — lint des hooks React dans `verifier` | ✅ fait au lot 7 : `verifier:hooks` (eslint, deux règles seulement). Une violation réelle corrigée : `FactureEmise` appelait un hook après un `return` anticipé ; deux directives `eslint-disable` mal placées, qui ne désactivaient rien |
| Q9 — code mort (`GrapheBarres`, classes CSS de l'ancien calendrier) ; iframe d'impression retirée sur `afterprint` ; anti-rebond dans `persister` ; `as never` de `Facturier.tsx` ; modules de plus de 800 lignes | ◐ lot 7 : `GrapheBarres` et quinze classes de l'ancien calendrier retirés ; cadre d'impression retiré sur `afterprint` ; `as never` retiré. *Restent : l'anti-rebond de `persister`, le découpage des modules de plus de 800 lignes (Activité, Facturier, Config — sans défaut constaté, à faire quand on les touche), quatre classes CSS peut-être mortes (`.case`, `.colonneSimple`, `.jauges`, `.invisible`) à vérifier contre les accès dynamiques* |
| S7 — robustesse réseau (n'effacer la session que sur 400/401, délai maximal, `https:` exigé), relevé CSV (`1e5`, `12abc`, libellé multi-ligne), CSP, sandbox de l'iframe d'impression, URL d'export révoquée trop tôt | ✅ fait au lot 7 : une coupure réseau ne déconnecte plus ; 15 s au plus par requête ; une adresse en http est refusée à la saisie, avec le motif ; `1e5` et `12abc` écartés et nommés au compte rendu d'import ; libellé cité sur plusieurs lignes gardé entier (RFC 4180) ; cadre d'impression `sandbox`, retiré après impression ; URL d'export révoquée après 30 s ; CSP sans `unsafe-inline` pour les scripts (empreintes tenues par un test). *Reste : l'impression réelle sous Firefox et Safari, à vérifier à la main* |
| L10 — barèmes à recouper : taux BNC, ACRE, tranches 2025-2026, profil CIPAV, plafond du versement libératoire, seuils de TVA spécifiques, plafond micro proratisé | ◐ lot 7 : recoupés le 07/11/2026 contre Légifrance, BOFiP, impots.gouv et service-public (urssaf.fr était inaccessible). Corrigés : ACRE à 25 % d'exonération pour un début d'activité à partir du 01/07/2026 (décret 2026-69) ; barème de l'IR et décote des revenus 2025 (loi 2026-103) ; plafond du micro proratisé l'année de création ; sources officielles à la place de « ancienne application » ; commentaires périmés (« hausse au 1er juillet 2026 » en BNC : il n'y en a pas). *Restent, à planifier : profil CIPAV (23,2 %, demande un type d'activité au schéma) ; plafond de revenu fiscal de référence du versement libératoire ; seuils de TVA spécifiques (avocats, auteurs) ; acompte de CFE non recoupé ; **mention « article 293 B du CGI » à remplacer au 01/01/2027 par l'article du CIBS** — les sources divergent sur le numéro (L. 223-3 ou L. 233-3), à vérifier au Journal officiel avant décembre* |
| L13 — autoliquidation en franchise : la TVA due sur un achat de service à un fournisseur de l'UE (`aAutoliquider`, ex. un abonnement logiciel) n'entre dans aucune provision ni aucun dossier — à confirmer côté fiscal avant de coder (vu au lot 4) | ◐ lot 7 : **confirmé** (art. 283-2 et 259 du CGI ; BOFiP BOI-TVA-DECLA-10-10-20 §140 : la franchise est sans incidence ; FAQ impots.gouv) — due, déclarée sur une CA3 (ligne A3), non déductible, numéro de TVA intracommunautaire requis. **Erreur de calcul corrigée** : le montant était tiré d'un TTC (16,67 € pour 100 €) au lieu de base × 20 % (20 €). *Restent : l'entrée de cette TVA dans les provisions et un rappel de déclaration — la date d'exigibilité et l'échéance de dépôt d'un franchisé ne sont écrites dans aucun texte trouvé, à confirmer auprès du SIE avant de coder une date* |
| Contrôles à ajouter à `verifier` : octets nuls, lint des hooks, contraste, impératifs en -ez, code mort | ✅ fait au lot 7 : cinq contrôles, chacun prouvé en introduisant le défaut. Le contrôle du tutoiement lit l'arbre syntaxique (chaînes et texte JSX seulement) ; il a trouvé trois vouvoiements restants (Compte, formulaires d'Activité), corrigés |
| Modules retenus du handoff encore absents : provisions en pilote automatique, brief du lundi | ⬜ |
| Contrôle visuel du lot 7 | ✅ fait (agent contrôleur, deux thèmes) : aucune régression. Relevé au passage, antérieur au lot : trois libellés du handoff remplacés — « Réserve matelas » (chez nous « Seuil de sécurité »), « CA réalisé » (« CA facturé »), « Réserve auto gardée » (« Part gardée ») ; à trancher avant la fin, chacun avait une raison au lot qui l'a posé |

### Lot 8 — Achats du handoff (priorité 2 : l'écran le plus éloigné de la maquette au contrôle visuel du lot 7)

| Ligne | État |
|---|---|
| La période d'Achats suit le mois de la barre du haut, « Mois » par défaut comme le handoff (elle ouvrait sur « Tout ») | ⬜ |
| Titre « Achats & justificatifs », repère « N justificatif(s) manquant(s) » | ⬜ |
| Quatre tuiles du handoff : Dépenses de la période (TTC, nombre d'achats), TVA déductible (dont non récupérable faute de pièce), À rapprocher (opérations · dépenses), Justificatifs manquants ; l'autoliquidation reste en bandeau | ⬜ |
| Bloc « Rapprochement bancaire » sur l'onglet Dépenses : opérations du compte sans dépense, avec l'action proposée (associer à une facture, relier à une dépense, **créer la dépense depuis l'opération**), et dépenses en attente de leur opération | ⬜ |
| Registre des achats en tableau : date, fournisseur, TTC, dont TVA, justificatif, rapprochement ; ligne de total ; dépenses récurrentes DÉRIVÉES (même fournisseur, même montant, mois consécutifs), jamais saisies ; lien « Suivi & déclaration TVA » (`#/argent/tva`) | ⬜ |
| Filtre par compte (Tous / Qonto / BNP / Perso) | ⬜ hors lot : ni les dépenses ni les mouvements ne portent de compte — demande un schéma 20 |

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
| Place de « Facturer » dans le rail | ✅ | Formule A : onglet « Factures » d'Activité, création par « + Nouveau » et le Pilote | 6 |

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
| Troisième onglet « Compte pro & banque » | ⬜ | L'import de relevé reste dans Achats — sorti du lot 6, qui ne touchait que la barre et le rail | à planifier |
| Simulateur CFE avec base minimum par commune | ◐ | Lecture de l'avis × taux seulement, par décision | à planifier |
| Comparateur micro-BNC vs déclaration contrôlée | ⬜ | Aucun module | à planifier |
| Décote dans le comparateur d'impôt | ✅ | Appliquée, avec la situation du foyer (L8) | 3 |

### Réglages / Compte

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| Navigation en sept sections | ◐ | Quatre sections (Profil, Barème, Données, Compte) — sorti du lot 6, qui ne touchait que la barre et le rail | à planifier |
| Facturation : numérotation et mentions | ◐ | SIRET et IBAN contrôlés ; aucun réglage de numérotation ni de mentions | à planifier |
| Coffre des documents | ⬜ | Aucun dépôt ; retenu au périmètre | à planifier |
| Mode hors ligne, retard de synchronisation affiché | ◐ | Aucun `navigator.onLine` ; la pastille ne dit que relié, expiré ou local | à planifier |
| Synchronisation temps réel multi-appareils | ⬜ | Synchronisation manuelle seulement | à planifier |
| Règles d'accès de `user_data` vérifiées et documentées | ⬜ | `supabase.sql` ne les touche pas | à planifier |
| Restauration et récupération sans copie de secours | ⬜ | Voir S6 | 1 |

### Documents

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| Livre des recettes en CSV | ✅ | Menu « Exporter » : `;`, BOM, virgule décimale, filtre sur l'année d'encaissement, champs texte protégés contre les formules, TVA inconnue laissée vide | 6 |

### Transverse

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| Brief du lundi | ⬜ | Aucun code | 7 |
| Bascule : nouvelle version à la racine, ancienne sous `/legacy/` neutralisée en écriture | ⬜ | Le déploiement garde l'ancienne à la racine et la nouvelle dans `/v2/` | à planifier |
| Test Playwright « zéro écriture depuis `/legacy/` » | ⬜ | Aucun script | à planifier |
| Harnais différentiel contre l'application actuelle | ⬜ | Aucun script | à planifier |
| Retirer les méta anti-cache de l'ancienne version | ⬜ | Lié à la bascule | à planifier |
| Onboarding de première ouverture | ⬜ | Aucun en UI | à planifier |
| Recherche globale | ✅ | ⌘K / Ctrl K : factures (brouillons compris), clients, missions, dépenses ; montant par valeur | 6 |
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
