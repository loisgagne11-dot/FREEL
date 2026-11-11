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
| S5 (suite) — export des pièces (archive téléchargeable) : elles ne sont ni dans l'export JSON ni dans la synchronisation, et sont à conservation légale | ✅ fait au lot 10 : archive complète et sa restauration ; la synchronisation des pièces reste hors lot |
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
| L13 (provision : ✅ lot 13) — autoliquidation en franchise : la TVA due sur un achat de service à un fournisseur de l'UE (`aAutoliquider`, ex. un abonnement logiciel) n'entre dans aucune provision ni aucun dossier — à confirmer côté fiscal avant de coder (vu au lot 4) | ◐ lot 7 : **confirmé** (art. 283-2 et 259 du CGI ; BOFiP BOI-TVA-DECLA-10-10-20 §140 : la franchise est sans incidence ; FAQ impots.gouv) — due, déclarée sur une CA3 (ligne A3), non déductible, numéro de TVA intracommunautaire requis. **Erreur de calcul corrigée** : le montant était tiré d'un TTC (16,67 € pour 100 €) au lieu de base × 20 % (20 €). *Restent : l'entrée de cette TVA dans les provisions et un rappel de déclaration — la date d'exigibilité et l'échéance de dépôt d'un franchisé ne sont écrites dans aucun texte trouvé, à confirmer auprès du SIE avant de coder une date* |
| Contrôles à ajouter à `verifier` : octets nuls, lint des hooks, contraste, impératifs en -ez, code mort | ✅ fait au lot 7 : cinq contrôles, chacun prouvé en introduisant le défaut. Le contrôle du tutoiement lit l'arbre syntaxique (chaînes et texte JSX seulement) ; il a trouvé trois vouvoiements restants (Compte, formulaires d'Activité), corrigés |
| Modules retenus du handoff encore absents : provisions en pilote automatique, brief du lundi | ⬜ |
| Contrôle visuel du lot 7 | ✅ fait (agent contrôleur, deux thèmes) : aucune régression. Relevé au passage, antérieur au lot : trois libellés du handoff remplacés — « Réserve matelas » (chez nous « Seuil de sécurité »), « CA réalisé » (« CA facturé »), « Réserve auto gardée » (« Part gardée ») ; à trancher avant la fin, chacun avait une raison au lot qui l'a posé |

### Lot 8 — Achats du handoff (priorité 2 : l'écran le plus éloigné de la maquette au contrôle visuel du lot 7)

| Ligne | État |
|---|---|
| La période d'Achats suit le mois de la barre du haut, « Mois » par défaut comme le handoff (elle ouvrait sur « Tout ») | ✅ fait : `ancreDuMois` ; une dépense sans date ne se voit plus qu'en « Tout ». *Facturier et Outils s'ancrent encore sur l'année : à aligner* |
| Titre « Achats & justificatifs », repère « N justificatif(s) manquant(s) » | ✅ fait |
| Quatre tuiles du handoff : Dépenses de la période (TTC, nombre d'achats), TVA déductible (dont non récupérable faute de pièce), À rapprocher (opérations · dépenses), Justificatifs manquants ; l'autoliquidation reste en bandeau | ✅ fait : les « justificatifs manquants » comptent les PIÈCES absentes, pas la TVA perdue (nulle en franchise, alors que la pièce manque) |
| Bloc « Rapprochement bancaire » sur l'onglet Dépenses : opérations du compte sans dépense, avec l'action proposée (associer à une facture, relier à une dépense, **créer la dépense depuis l'opération**), et dépenses en attente de leur opération | ✅ fait : associer (encaisse la facture à la date de l'opération), relier, créer la dépense pré-remplie et reliée, hors compte. Un crédit sans facture propose « sans contrepartie », jamais une dépense |
| Registre des achats en tableau : date, fournisseur, TTC, dont TVA, justificatif, rapprochement ; ligne de total ; dépenses récurrentes DÉRIVÉES (même fournisseur, même montant, mois consécutifs), jamais saisies ; lien « Suivi & déclaration TVA » (`#/argent/tva`) | ✅ fait ; défile dans sa carte sur téléphone |
| Filtre par compte (Tous / Qonto / BNP / Perso) | ⬜ hors lot : ni les dépenses ni les mouvements ne portent de compte — demande un schéma 20 |
| Contrôle visuel du lot 8 | ✅ fait (agent contrôleur, deux thèmes et téléphone 390 px) : conforme avec réserves. Corrigé dans le lot : une seule navigation de mois (la barre de période gardait ses flèches), en-têtes chiffrés alignés, « clic = détail & pièce », icônes des justificatifs et du rapprochement, sous-ligne de franchise sous la TVA déductible. *Restent mineurs : rien n'indique sur téléphone que le registre défile ; les actions « associer / relier / créer » ne se voient sur aucune capture (la démonstration n'a pas d'opération orpheline) — elles sont tenues par des tests. Écran Achats à 39,1 / 40 Ko : extraire avant tout ajout* |

### Lot 9 — Réglages du handoff (priorité 2 : quatre onglets contre sept sections dans la maquette)

| Ligne | État |
|---|---|
| « Configuration » en deux colonnes : à gauche les sept sections (icône, titre, sous-titre, chevron), à droite le panneau de la section ouverte ; sur téléphone, la liste puis le panneau. La section vit dans l'adresse (`#/config/profil`…) | ✅ fait ; `#/config` seul et toute adresse inconnue ouvrent Profil ; chaque section arrive à la demande |
| Profil & statut (identité, adresse, début d'activité, type, TVA intracommunautaire, ACRE et versement libératoire en interrupteurs) · Paramètres fiscaux (barème, périodicité URSSAF, option TVA, foyer fiscal) · Réserve & versements (solde de départ, besoin mensuel, seuil, part gardée, objectif) · Facturation (IBAN, BIC) · Livre des recettes (conformité, accès au registre) · Compte & synchronisation · Données & export | ✅ fait ; chaque champ garde son comportement. Les messages qui renvoyaient aux anciens onglets (« Config › Solde du compte », « Réglages → Données », « Réglages › Barème ») nomment les nouvelles sections |
| Numérotation des factures et mentions personnalisées | ⬜ hors lot : aucun réglage n'existe ; à concevoir |
| Contrôle visuel du lot 9 (agent contrôleur, six sections, deux thèmes, deux passages) | ✅ fait. Corrigé dans le lot : fin d'ACRE « 31/09/2026 » (date inexistante, le jour était écrit en dur — défaut antérieur au lot, aussi dans la fenêtre d'ACRE) ; source de la table des cotisations qui passait sur « vérifié le » ; carte « Barèmes en vigueur » (six valeurs) et périodicité en deux positions ; Données en lignes avec le livre des recettes CSV, un vrai bouton de restauration et « Repartir de zéro » ; mentions de facture lisibles. *Restent assumés : interrupteurs du handoff sans fonction derrière (mise à jour des barèmes, provisionner, rappel, synchronisation bancaire), export FEC, vocabulaire « matelas » (à arbitrer avec les deux autres libellés), montants des champs sans espace des milliers, état « compte relié » non capturé* |
| Troisième contrôle visuel du lot 9 | ✅ fait : les quatre corrections confirmées dans les deux thèmes. Il a trouvé un débordement à 390 px sur Paramètres fiscaux (page de 609 px) : l'en-tête « Actions » réservé aux lecteurs d'écran, en position absolue, échappait au conteneur défilant de la table — défaut antérieur au lot, invisible parce que le contrôle responsive ne visitait que `#/config`. Corrigé, et le contrôle visite désormais les sept sections (280 combinaisons) ; sans le correctif, il échoue sur les quatre palettes. Le foyer fiscal a reçu son titre |
| Effacer le compte distant (RGPD) | ⬜ hors lot : « Repartir de zéro » ne vide que ce navigateur ; supprimer la ligne `user_data` demande une action côté Supabase à concevoir |

### Lot 10 — Les justificatifs se sauvegardent (priorité 1 : S5 suite, l'irréversible)

Les pièces vivent dans IndexedDB, dans un seul navigateur. Ni l'export JSON ni
la synchronisation ne les emportent, alors qu'elles sont à conservation légale :
un navigateur réinitialisé, un ordinateur changé, et six ans de justificatifs
disparaissent sans qu'aucune sauvegarde les ait jamais contenus.

| Ligne | État |
|---|---|
| Archive ZIP complète depuis Données & export : les faits (le même JSON que la sauvegarde), chaque pièce sous un nom lisible SANS l'application, rangée par année DU FAIT puis par nature (`justificatifs/2026/depenses/2026-03-14 Fournisseur 89,00 €.pdf`, suffixe en cas de collision), un manifeste versionné (nom d'origine, empreinte, date de dépôt, fait rattaché et sa date, statut intacte / altérée / illisible / orpheline), un `LISEZMOI.txt`. Écrite sans dépendance (ZIP « stocké », noms UTF-8, sans ZIP64 : 4 Go et 65 535 entrées au plus, refus explicite au-delà), construite en morceaux : une pièce lue à la fois | ✅ fait |
| Chaque pièce est revérifiée (SHA-256) avant d'entrer dans l'archive ; une pièce altérée ou illisible est signalée à l'écran et dans le manifeste, jamais tue | ✅ fait |
| Restauration par le même bouton que la sauvegarde JSON. La confirmation dit la date de l'archive, ce qu'elle contient, et combien de pièces d'ici se retrouveraient sans fait. Deux gestes : « Tout remplacer » (pièces D'ABORD, faits ensuite) et « Ajouter seulement les pièces manquantes » (faits intacts — le cas de qui change de navigateur). Chaque pièce est recontrôlée contre le manifeste avant d'être redéposée avec son identifiant, son empreinte et sa date de dépôt d'origine ; une pièce déjà présente n'est pas dupliquée ; aucune pièce n'est jamais supprimée par une restauration | ✅ fait |
| Rappel : « Dernière archive le … » et « N pièces déposées depuis » en Données, et sur Achats tant qu'il en reste. La date de la dernière archive est un fait de CET environnement, pas un fait métier : rangée à part, hors des faits, de l'export et de la synchronisation — une archive faite ailleurs ne protège pas les pièces d'ici | ✅ fait |
| Durée de conservation lue à l'écran et dans le LISEZMOI : 6 ans au moins (LPF art. L102 B), 10 ans pour les documents comptables d'une activité commerciale (C. com. art. L123-22) — sans date butoir tirée du dépôt : le délai court depuis le document ou la dernière opération. Aucune promesse de valeur probante : l'empreinte montre que le fichier n'a pas changé depuis son dépôt, elle ne remplace ni l'original ni un archivage à valeur probante (le commentaire de `justificatifs.ts` est adouci dans le même sens) | ✅ fait |
| Les textes de Données qui disaient « les justificatifs n'y sont pas » distinguent la sauvegarde JSON (sans pièces) de l'archive (avec) | ✅ fait |
| Contrôle visuel du lot 10 (agent contrôleur, deux thèmes et téléphone, avec de vraies pièces dans IndexedDB : jamais archivées, archivées, restauration, rappel sur Achats) | ✅ fait : conforme, sans défaut bloquant. Corrigé dans le lot : la confirmation de restauration tombait hors de la vue sur téléphone (elle y défile désormais et prend le focus), ses boutons secondaires passaient pour désactivés. Archive réelle relue par `unzip -t` : sans erreur, noms lisibles. *Restent mineurs : boutons des lignes sans icône (la maquette en porte), « Tout remplacer » sans couleur d'alerte* |
| Pièces devenues orphelines après une restauration ou « Repartir de zéro » : `motifRefusSuppression` les déclare supprimables. Aucun écran ne supprime de pièce aujourd'hui | ⬜ hors lot : contrainte écrite pour le futur écran de suppression — refuser pendant la durée de conservation |
| Archive d'une année « pour le comptable », non restaurable | ⬜ hors lot : le rangement par année de l'archive complète y prépare |
| Synchronisation des pièces avec le compte | ⬜ hors lot : demande un stockage de fichiers côté Supabase |
| Nettoyage de cette liste : lignes faites restées ouvertes (grille ACRE, ACRE à 25 %, restauration sans copie de secours) ; la durée de conservation est de 6 ans (LPF L102 B), pas 10 | ✅ fait |

### Lot 11 — Le compte ne fuit pas (priorité 1 : une fuite ne se rattrape pas)

La clé « anon » du projet Supabase est publique par conception : seules les
règles d'accès (RLS) protègent les données. `docs/supabase.sql` les pose sur
`freel_faits`, mais rien ne dit qu'elles existent sur `user_data`, la table de
l'ancienne application que la nouvelle relit. L'ancienne en documentait une ;
personne ne peut dire si elle a été appliquée. Sans elle, la clé publique — qui
figure dans le code de toute page servie — donne à lire les finances de chaque
compte.

| Ligne | État |
|---|---|
| Sonde anonyme : avec la seule clé publique, sans session, l'application demande à Supabase COMBIEN de lignes de `freel_faits` et de `user_data` se lisent (`HEAD` + `Prefer: count=exact`) — sans jamais en lire le contenu. Plus de zéro : les données sont exposées | ✅ fait |
| Compte & synchronisation : verdict lisible (« ne se lisent pas sans connexion », « exposées : N ligne(s) », « table absente », « vérification impossible » avec la raison), relancé à la demande et à l'ouverture quand un projet est configuré ; en cas d'exposition, alerte rouge et le SQL à appliquer, copiable | ✅ fait |
| `docs/supabase.sql` : section `user_data` — activer RLS et la règle « chacun les siens », identique à celle que documentait l'ancienne application (elle continue donc de fonctionner) ; idempotente | ✅ fait |
| Une sonde qui échoue (réseau, CSP, projet mal saisi) ne passe JAMAIS pour « protégé » | ✅ fait |
| Contrôle visuel (deux thèmes, téléphone, projet fictif aux réponses simulées : faits protégés, ancienne table exposée) | ✅ fait : verdicts lisibles, alerte et SQL dans la largeur du téléphone. *Le comportement réel de PostgREST (total `*/0` d'une table vide, 404 d'une table absente) est tenu par les tests, pas encore par un vrai projet : à confirmer à la première vérification sur ton compte* |

### Lot 12 — L'impôt se provisionne au taux de l'année (priorité 2 : un chiffre faux fait verser trop)

La provision d'impôt sur le revenu se calcule sur le seul encaissé : un
« plancher ». Il est faux dès que l'activité franchit une tranche en cours
d'année — le cas courant d'un micro-entrepreneur seul. Exemple FICTIF : 30 000 €
encaissés au 30 juin, rythme constant, une part, aucun autre revenu : la
provision affichée est de 413 € ; l'année coûtera environ 5 080 €, dont environ
2 520 € correspondent à ce qui est déjà entré. Le versable est surévalué
d'environ 2 100 €, puis s'effondre au second semestre.

**Règle retenue** : mettre de côté, sur ce qui est entré, le TAUX MOYEN DE
L'ANNÉE PROJETÉE — impôt de l'année (encaissé + attendu : factures émises non
réglées et revenu du planning, le pipeline d'`etatProjection`) × part déjà
encaissée, moins les acomptes de prélèvement à la source. À rythme constant,
c'est le prorata du temps ; quand les encaissements sont irréguliers, il suit
l'argent réellement reçu (on ne provisionne pas, sur le solde du jour, l'impôt
d'un argent pas encore arrivé) ; au 31 décembre, c'est l'impôt entier.

| Ligne | État |
|---|---|
| Le pipeline (factures émises non réglées, revenu du planning, sur l'année en cours) sort d'`etatProjection` dans une fonction à lui, que lisent la projection ET la provision — un seul calcul, pas de cycle | ✅ fait |
| `provisionImpotRevenu` : impôt de l'année projetée, taux moyen, part encaissée ; à mettre de côté = impôt projeté × part encaissée − acomptes. Sans pipeline (rien d'attendu), l'impôt projeté est celui de l'encaissé : l'actuel, et il le dit | ✅ fait |
| Résolution : la part constatée reste `publie` ; dès que le pipeline contribue, l'ensemble est une `hypothese` avec sa source (« factures émises et planning ») | ✅ fait |
| Pilote, composition et dette lisent le même chiffre (`impotRevenuAProvisionner`) ; test d'accord des trois et test chiffré du cas fictif ci-dessus | ✅ fait pour Pilote et composition (test d'accord) ; *le détail de la dette « impôt » ne montre pas la provision d'IR — il ne lit que le taux sur les encaissements : à reprendre* |
| L'écran dit, là où l'impôt se lit (composition du versable, Argent), qu'il est calculé au taux de l'année projetée, et sur quelle projection | ✅ fait |
| Répartition mois par mois de l'ancienne application (`addIRMonthlyProvisions`) | ⬜ hors lot : la règle ci-dessus la rend inutile pour le versable ; l'échéancier mensuel est un autre sujet |
| Budget d'entrée : lire le planning dans le premier rendu le portait à 84,7 / 80 Ko. Rien n'est relevé : les sujets « à traiter » (pastilles du rail, indicateur de la barre, décisions du Pilote — aucun ne porte le versable) se calculent dans un module chargé à la demande ; prévision, planification et calendrier sortent dans des modules à eux. Entrée à 73,8 Ko | ✅ fait. Pendant le chargement, aucun « 0 » ni « rien ne réclame ton attention » : la salutation reste neutre, la phrase de santé vide (`aria-busy`), la carte en place |
| Le solde de l'année précédente disait « l'impôt montera si d'autres recettes arrivent » d'une année close | ✅ corrigé (`anneeClose`) |
| Contrôle visuel du lot 12 (Pilote sur la démonstration, Argent sur le jeu d'essai au barème) | ✅ fait : le Pilote, une fois le calcul « à traiter » arrivé, est identique (pastilles, décisions, santé). Argent dit « 9 665 € à mettre de côté aujourd'hui… taux moyen de l'année projetée… 11 285 € d'impôt sur 79 680 € de chiffre d'affaires projeté… moins 600 € d'acomptes ; il restera 1 020 € » — recalculé hors écran : 11 284,62 × 0,9096 − 600 = 9 664,93 € |
| Le jeu de démonstration est en versement libératoire, sans parts fiscales : la ligne d'impôt sur le revenu n'y paraît pas, avant comme après | ⬜ à décider : la capture ne montre donc pas ce lot ; un jeu « au barème » le montrerait |

### Lot 13 — Ce qui est dû se voit en entier (priorité 2 : le faux)

Deux sommes dues échappent encore au versable ou à son détail. La TVA
autoliquidée d'un achat de service à un fournisseur de l'Union est due
(confirmé au lot 7 : art. 283-2 du CGI, la franchise est sans incidence) et
n'entre dans aucune provision : le versable est trop haut d'autant. Et le
détail de la dette « impôt » ne montre pas la provision d'impôt sur le revenu
que le versable retient pourtant.

| Ligne | État |
|---|---|
| TVA autoliquidée dans les provisions : la somme des `aAutoliquider` des dépenses payées et non encore réglée à l'administration entre dans l'enveloppe TVA, en `hypothese` (« échéance de dépôt à confirmer auprès de ton service des impôts ») — le montant est sûr, seule la date ne l'est pas ; AUCUNE date d'échéance n'est inventée | ✅ fait, **en franchise seulement** : chez un redevable, la TVA autoliquidée est due et déductible sur la même déclaration, elle s'annule — la compter due sans la compter déductible provisionnait en trop (12 € sur le jeu d'essai). Une ligne « dont TVA autoliquidée » dans le détail de l'enveloppe |
| La TVA autoliquidée réglée (échéance TVA saisie comme payée) cesse d'être provisionnée — sans double compte avec la TVA collectée d'un assujetti | ✅ fait : additionnée AVANT le retranchement des échéances TVA payées — une seule règle de « réglé », celle de la TVA collectée |
| Détail de la dette « impôt » : la provision d'impôt sur le revenu de l'année (et le solde de l'année précédente tant que l'avis manque), au même chiffre que le versable | ✅ fait (`impotRevenuAProvisionner`, lu, jamais recalculé) |
| Pilote, composition, enveloppes et dette tombent d'accord (test d'accord) | ✅ fait, TVA et impôt |
| Rappel de déclaration de la TVA autoliquidée à une date précise | ⬜ hors lot : date d'exigibilité et échéance de dépôt d'un franchisé à confirmer auprès du SIE |
| Le dossier de déclaration de TVA du trimestre (`dossierTvaDuTrimestre`) ignore la TVA autoliquidée d'un franchisé devenu redevable en cours d'année | ✅ lot 15 |
| « Reste à sortir » du détail de la dette ne compte que l'appelé : l'impôt sur le revenu et la TVA s'affichent à côté, en blocs | ⬜ à trancher : la vignette et le détail peuvent donc montrer deux totaux |

### Lot 14 — Les écrans s'ouvrent d'un coup (priorité 3 : le contrôle de vitesse échouait une fois sur deux)

**Diagnostic corrigé en cours de lot.** Le premier relevé (810 ms) mêlait deux
choses. (1) Un ARTEFACT DE MESURE : `waitForSelector` espace ses essais jusqu'à
500 ms ; un écran affiché à 320 ms se mesurait à 810 dès qu'il manquait l'essai
de 300 ms — d'où le contrôle tantôt vert, tantôt rouge, sur un délai que
l'utilisateur ne voyait pas. (2) Un vrai délai, plus petit : à chaque ouverture
d'écran, `lazy` suspend toujours une fois, même code déjà arrivé, et React
retient la révélation 300 ms après avoir montré « Chargement… ». Pas de
cascade de morceaux imbriqués sur Config, Outils ni Facture ; de vraies
cascades sur Argent et Activité.

| Ligne | État |
|---|---|
| Mesuré avant d'écrire : requêtes datées, apparition et disparition du repli, sondage à chaque image contre `waitForSelector` | ✅ fait |
| `composantALaDemande` : une seule promesse pour le préchargement et `lazy` ; une fois le code arrivé, l'écran est rendu directement, sans repli ; tant qu'il n'est pas là (lien direct, réseau lent), `lazy` et son repli comme avant ; le choix est fait au montage — basculer en cours de vie démonterait l'écran et la saisie en cours | ✅ fait |
| Préchargés au repos, APRÈS le premier rendu : les six écrans et les morceaux qu'ils affichent toujours (trésorerie et performance d'Argent, projection, échéancier, onglets d'Activité, rédaction de facture). Par l'adresse seulement : la section de Config et le CRA d'Outils — jamais les sept sections. Restent à la demande : formulaires, éditeurs, registres, composition, document de facture | ✅ fait |
| Le contrôle de vitesse sonde à chaque image (`waitForFunction`, `polling: 'raf'`), même critère — un titre de niveau 1 visible —, même plafond de 600 ms | ✅ fait |
| Le contrôle de vitesse passe dix fois de suite | ✅ fait : médianes de 25 à 171 ms (Argent, le plus lourd), contre ~320 ms avant |
| Aucun budget relevé | ✅ entrée 75,0 / 80 Ko (+0,5 Ko pour le préchargement), premier rendu 285 / 300 |
| Mode discret : le graphe de capacité d'Argent écrivait ses montants en clair dans le texte réservé aux lecteurs d'écran (« 0 € de capacité, 0 € versés »). Défaut antérieur, révélé quand le graphe s'est mis à paraître d'emblée : le contrôle de confidentialité le voit désormais | ✅ corrigé : les montants passent par `<Montant>`, masqués comme le reste |
| `startTransition` sur le changement de route | ⬜ écarté : il supprime le repli mais garde l'ancien écran affiché pendant le chargement — un clic sur un écran lent paraît sans effet, et le contrôle ne mesurerait plus rien |

### Lot 15 — Le dossier de TVA dit tout ce qui se déclare (priorité 2 : le faux)

« Préparer ma déclaration de TVA » donne les chiffres à reporter sur la
déclaration du trimestre. Il ignore la TVA autoliquidée des achats de services
dans l'Union. Chez un redevable, elle se déclare pourtant — due ET déductible
sur la même déclaration, nette nulle : l'omettre rend la déclaration fausse,
même si le solde à payer ne change pas. Chez un franchisé, elle est due et non
déductible : un vrai paiement, que la provision retient depuis le lot 13 et que
le dossier taisait — les deux chiffres ne tombaient plus d'accord.

| Ligne | État |
|---|---|
| Le dossier liste les achats autoliquidés payés dans le trimestre : base hors taxe et TVA due, à la ligne de la déclaration qui les reçoit (ligne A3 — achats de prestations de services intracommunautaires) | ✅ fait (`autoliquidations` du dossier ; base HT par `baseHtAutoliquidee`, à côté de `tvaDeDepense`). Aucune autre ligne du formulaire n'est numérotée dans l'application : « ligne 20 » non sourcée, non écrite. Les achats hors Union y figurent aussi (la provision les compte) avec la mention « ligne à confirmer » |
| Redevable : la même TVA figure aussi en TVA déductible — le solde à payer ne bouge pas, la déclaration est juste. Franchisé : due, non déductible, ajoutée au solde à payer | ✅ fait |
| Le dossier et la provision retombent d'accord (le test d'intégration redevient une égalité stricte : provision TVA = à payer du dossier) | ✅ fait (tests d'accord franchisé et redevable) |
| Pour un franchisé, le dossier dit qu'une déclaration est à déposer pour ces achats, SANS date d'échéance (à confirmer auprès du SIE) | ✅ fait |
| Achats de services HORS de l'Union (un abonnement d'un fournisseur américain) : autoliquidés eux aussi, mais pas à la ligne A3, réservée aux prestations intracommunautaires | ✅ le bloc s'intitule « Achats de services à l'étranger » ; la ligne A3 ne porte que les achats de l'Union ; les autres ont leurs propres totaux, « ligne à confirmer » — aucun numéro de ligne inventé |

### Lot 16 — Pointer un encaissement depuis le Pilote (priorité 3 : le geste quotidien) — PR #312

La carte « Le flux du mois » écrit « clique un statut pour le mettre à jour »,
mais un clic emmène au facturier : rien ne se met à jour d'ici. Or c'est LE
geste du quotidien — un virement arrive, on le pointe. Le handoff a un panneau
« Encaissements — pointe une facture comme payée » (capture
`pilote-encaissements`).

| Ligne | État |
|---|---|
| Panneau « Encaissements » ouvert depuis le Pilote : à gauche « Reste à encaisser — N factures en attente · X € » ; à droite les factures émises non réglées, en retard d'abord (client, numéro, émise le, échéance, montant, pastille « en retard ») ; au pied « Encaissé ≠ facturé — seul l'encaissé compte pour l'URSSAF » et « Terminé » | ✅ `Encaissements.tsx` ; brouillons grisés « à émettre » (lien vers le facturier), comme la maquette ; TTC sur la ligne quand la facture porte une TVA |
| « Marquer payé » ouvre sur la ligne la date (aujourd'hui par défaut) et le mode de règlement — deux mentions obligatoires du livre des recettes, la même règle que le facturier (`encaisserRecette`) ; confirmer pointe la facture, la ligne quitte la liste, le flux et le versable se mettent à jour | ✅ un seul formulaire pour les deux écrans (`FormulaireEncaissement`) ; mode proposé = dernier mode du client ; date future refusée ; focus relayé à la ligne suivante |
| Les pastilles « en attente » et « en retard » de la colonne Entrées ouvrent ce panneau ; celles des sorties gardent leur lien vers l'échéancier | ✅ saisie déjà ouverte sur la facture cliquée ; aussi dans le détail déplié (téléphone) ; + action rapide « Pointer un encaissement » et « + Nouveau › Encaissement » (`#/pilote/encaissements`), comme le catalogue du handoff |
| Chargé à la demande : le Pilote est dans le paquet d'entrée (75 / 80 Ko) | ✅ voir budgets ci-dessous |
| Marquer une ÉCHÉANCE payée depuis le Pilote | ⬜ hors lot : même geste pour les sorties, à faire ensuite |
| Une facture annulée par un avoir et son écriture d'annulation figuraient « en attente » dans le flux (total juste, client affiché deux fois dont une en négatif), dans les factures en attente du livre des recettes, et le rapprochement bancaire proposait d'encaisser la facture annulée | ✅ trouvé en cours de lot : une seule liste `facturesAEncaisser` pour le flux du mois, le flux d'un autre mois, le panneau, le livre des recettes et le rapprochement |
| `encaisserRecette` acceptait une facture annulée (le rapprochement bancaire pouvait la proposer) | ✅ refusé, comme l'écriture d'annulation |

## Reste fonctionnel par écran

Vérifié dans le code le 6 novembre 2026 : « fait » veut dire que le code
existe et est appelé depuis un écran, pas que le test mord.

### Pilote

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| Statuts cliquables dans « Le flux du mois » | ◐ | Les entrées se pointent depuis l'écran ; les échéances (sorties) mènent encore à l'échéancier | 16 |
| Actions rapides personnalisables | ⬜ | Liste figée : ni catalogue, ni « + », ni persistance | à planifier |
| Panneau « Pointer un encaissement » | ✅ | Pastilles des entrées, action rapide, « + Nouveau » | 16 |
| Provision d'IR sur les encaissements attendus | ✅ | Taux moyen de l'année projetée (encaissé + factures émises + planning) appliqué à l'encaissé | 12 |

### Argent

| Élément | État | Ce qui manque | Lot proposé |
|---|---|---|---|
| Provision d'impôt alignée sur les échéances réelles | ◐ | Les prévisions suivent la formule de délai ; la provision d'IR n'utilise pas ce pipeline | 2 |
| Cycle d'échéance enrichi (à déclarer, déclarée, payée, daté) | ◐ | `Echeance` ne porte que `payeeLe` et `montantPaye` ; « déclarée » est un fait distinct, sans date | à planifier |
| Frise des jalons réglementaires | ◐ | La frise trace les échéances saisies, pas les jalons | à planifier |
| Détail de la projection d'autonomie | ◐ | Seul `autonomieMois` est affiché | à planifier |
| Mention de la durée de conservation | ✅ | Lue en Données (ligne de l'archive) et dans le LISEZMOI de l'archive : 6 ans (LPF L102 B), 10 pour une activité commerciale | 10 |
| Grille ACRE par période | ✅ | `PERIODES_ABATTEMENT_ACRE`, par date de création | 7 (L10) |
| Abattement ACRE à 25 % au 01/07/2026 | ✅ | Confirmé par le décret 2026-69 ; appliqué aux créations à partir de cette date, lu sous l'interrupteur (lot 9) | 7 (L10) |
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
| Tuiles « à rapprocher » et « justificatifs manquants » | ✅ | Lot 8 | 8 |
| Rapprochement : créer une dépense depuis une opération orpheline | ✅ | Lot 8 : formulaire pré-rempli, dépense reliée à l'opération | 8 |
| État « ignorée » au rapprochement | ◐ | Le motif `autre` s'en approche | à planifier |
| Dépenses récurrentes signalées, totalisées, générées | ◐ | Lot 8 : signalées et totalisées, DÉRIVÉES (même fournisseur, même montant, mois voisins) ; pas générées — une dépense créée d'avance serait un fait inventé | 8 |
| Filtre par compte | ⬜ | Seule la barre de période existe | à planifier |
| Import OFX | ⬜ | Aucun | à planifier |
| Correction ou suppression à la main d'un mouvement importé | ⬜ | Aucune action | à planifier |
| Justificatifs sauvegardés et protégés de l'éviction | ✅ | Protégés de l'éviction (S5) ; archive complète et rappel « pas encore archivés » sur Achats (lot 10) | 10 |

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
| Navigation en sept sections | ✅ | Lot 9 | 9 |
| Facturation : numérotation et mentions | ◐ | SIRET et IBAN contrôlés ; aucun réglage de numérotation ni de mentions | à planifier |
| Coffre des documents | ⬜ | Aucun dépôt ; retenu au périmètre | à planifier |
| Mode hors ligne, retard de synchronisation affiché | ◐ | Aucun `navigator.onLine` ; la pastille ne dit que relié, expiré ou local | à planifier |
| Synchronisation temps réel multi-appareils | ⬜ | Synchronisation manuelle seulement | à planifier |
| Règles d'accès de `user_data` vérifiées et documentées | ✅ | Sonde anonyme dans Compte, règle « chacun les siens » dans `supabase.sql` | 11 |
| Restauration et récupération sans copie de secours | ✅ | Copie de l'état d'avant (S6), « Revenir à l'état d'avant » dans Données | 1 |

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
