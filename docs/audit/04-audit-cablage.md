# Audit d'écart — câblage existant → conception cible (Freel)

Sources : `01-vision.md` (CIBLE), `02-inventaire-existant.md` (EXISTANT), tous deux lus intégralement.
Vérifications ciblées effectuées directement dans `/home/user/FREEL/index.html` (24 051 lignes) par Grep (formulations multiples) et Read par offset — jamais lu en entier. Chaque affirmation porte une étiquette : **[vérifié]** (grep/Read direct sur le dépôt, ligne citée), **[rapport]** (repris tel quel d'un des deux rapports sans re-vérification), ou **(non vérifié)** (déduction raisonnable, non contrôlée dans le code).

---

## 1. Table de correspondance des écrans

| Écran CIBLE | Écran(s) EXISTANT(S) porteur(s) | Se transpose tel quel | Doit migrer d'un écran à l'autre | N'existe pas du tout |
|---|---|---|---|---|
| **Pilote** | Aucun écran dédié — le plus proche est **Cockpit** (`renderCockpit` `23124`, hero `renderDashboardHero` `16092`, indicateurs `renderHealthIndicators` `15163`, timeline `renderActionsAndMilestones` `16783`) [rapport, confirmé structure par grep] | Hero cash/salaire/autonomie ; alertes seuils (`computeAlerts()` `6129`, ex. alerte "Seuil TVA" `6180-6181` [vérifié]) | Les cartes seuils/échéancier de Cockpit doivent migrer vers Pilote ; certaines cartes "seuils" existent peut-être aussi côté Finances — provenance exacte des cartes seuils non tranchée dans les sources lues (non vérifié) | Curseur réserve matelas piloté en direct sur `versable()` ; carte "Décisions du jour" avec vraie requête `allTodos()` ; feuilles de détail latérales (`FreelSheet`) |
| **Activité & congés** | **Activité** (`renderActivite` `23219`, Missions `19101`, Factures `19814`) [rapport] + le calendrier congés vit en modale, hors écran dédié : `showMonthCongesModal()` `10679` [vérifié, live, appelé depuis FAB `5418` et 10+ autres points] | Missions, factures, occupation (`tauxOccupation` `6510`), DSO par client (`15357-15381`) [vérifié] | Occupation/DSO sont aujourd'hui calculés pour le **Cockpit** (`renderHealthIndicators` consomme `data.tauxOccupation`, invocation confirmée `23211`) [vérifié] — doivent migrer vers Activité & congés si la cible veut ces indicateurs sur cet écran ; le calendrier (`showMonthCongesModal`) est un modal FAB, pas une vue de calendrier intégrée à la page — doit être remonté en composant de page | Calendrier de plan de charge **intégré à la page** (la fonction candidate `renderCongesCalendar()` `15597` est du **code mort**, jamais appelée nulle part — vérifié par grep du nom entier, 1 seule occurrence dans tout le fichier = sa propre définition) |
| **Argent** | **Trésorerie** (`renderTresorerie` `21798`, solde/mouvements/rapprochement) + **Finances** (`renderFinances` `18081`, sous-onglets Évolution/Performance `18106-18110` [vérifié]) — correspondance quasi 1:1 avec les deux sous-onglets `tres`/`perf` de la cible | Graphe "CA HT (Prévu/Réalisé/Encaissé)" avec toggle Mensuel/Cumulé (`18121-18129` [vérifié]) ; graphe salaires ; échéancier obligations via `CHARGE_TYPES` (`2767-2799` [vérifié]) | Fusionner deux écrans existants en un seul écran cible à deux sous-onglets — donc plus une réorganisation qu'une création | Enveloppes de provision avec montant déjà mis de côté distinct de la cible (`tgt`) ; modales `DeclarationUrssaf`/`TvaModal` telles que spécifiées ; le taux URSSAF canonique unique (existant a son propre calcul dans `compute()`, cible en a 4 concurrents — à arbitrer, voir §8) |
| **Achats** | Pas d'écran dédié — brique répartie entre **Trésorerie** (import/rapprochement bancaire `showBankImportModal` `10197`, `parseOFX/parseCSV` `10265-10287`, `reconcileTransactions` `10381` [vérifié]) et une modale accessible depuis le FAB (`showChargeModal()` `10016`, catégories `CHARGE_CATEGORIES` `9999-10014` [vérifié]) | Catégories de dépense (14, proches des 10 CATS cible), montant, TVA déductible calculée à la volée (`updateTvaInfo` `10062-10072`), toggle récurrente/ponctuelle | Le contenu de `showChargeModal` + le rapprochement de `reconcileTransactions` doivent migrer vers un écran Achats dédié avec période/compte en barre de navigation (actuellement dispersés entre FAB et Trésorerie) | Champ justificatif/pièce jointe (0 occurrence, 2 formulations grep testées) ; champ `fournisseur` nommé comme tel (existant n'a qu'une "description" libre) ; état de rapprochement **explicite et stocké** par dépense (`recon` matched/pending/nobank) — l'existant réconcilie automatiquement via candidats (`reconcileTransactions`) mais ne pose pas un état persistant par charge |
| **Outils** | Contenu dispersé : simulateurs IR/CFE dans **Config** (`showIRDetail` `8692`, `showCFESimulator` `8855` [vérifié]) ; CRA en modale FAB (`showCRAModal`, `12671-13140` [vérifié]) ; rapprochement bancaire déjà couvert côté Achats/Trésorerie | Calcul IR par tranches (`calculateIR` `4134`), CFE (`computeCFEEstimate` `8928` [rapport]), génération CRA PDF | Les 3 simulateurs doivent quitter Config pour un écran Outils dédié à 3 sous-onglets (Impôt & CFE / Compte pro & banque / CRA) — aucun de ces 3 sous-onglets n'existe comme regroupement aujourd'hui | Sous-onglet "Compte pro & banque" en tant que tel (le rapprochement existe mais rattaché à Trésorerie, pas à un espace Outils) |
| **Config** | **Config** (`renderConfig→renderParams→renderAdmin`, 4 sous-onglets Entreprise/Infos/Données/Cloud `22265,22536,22695,22830` [rapport]) + une partie de **Compte** (voir ligne ci-dessous) | Régime fiscal, ACRE, Livre des recettes (`exportLivreRecettes` `3603`), export FEC (`exportFEC` `3643`, colonnes vérifiées `3682-3714`), sync Supabase | Les simulateurs IR/CFE doivent **sortir** de Config vers Outils ; le contenu de l'écran Compte (Profil/Préférences/Sécurité&Données) doit **entrer** dans Config (sections Profil & statut, Compte & Cloud Sync, Données & export) | Section "Réserve & versements" avec curseur % dédié (existant a un concept différent, `reserveCompte` = plancher fixe €150, `16301-16306` [vérifié], pas un % de `dispo`) ; bandeau fraîcheur barème avec date de vérification manuelle |
| **(sans destination cible)** | **Compte** (`renderCompte` `23253`, Profil/Préférences/Sécurité `23302/23407/23511` [rapport]) | — | Tout son contenu doit se relocaliser dans Config (voir ligne Config) | L'écran en tant que tel disparaît de la nav à 6 onglets cible — à retirer, pas à reskiner |

**Constat central vérifié** : ce n'est bien pas un reskin — sur les 6 écrans cible, un seul (**Argent**) correspond à une fusion propre de deux écrans existants entiers ; les 5 autres impliquent une redistribution fine de fonctions venant de 3 à 4 écrans existants différents (Cockpit, Activité, Trésorerie, Finances, Config, Compte comptent 6 écrans, mais leurs fonctions se recomposent en une topologie différente).

---

## 2. Complétude par écran

| Écran cible | % complétude estimé | Déjà là | Manque | Verdict |
|---|---|---|---|---|
| **Pilote** | ~35 % | Chiffres clés (solde/dispo/versable-like via `salaireVersable` `19585` [vérifié]), alertes seuils (`computeAlerts` `6129`), timeline actions | Carte "Décisions du jour" avec vraie requête, curseur réserve unifié, feuilles latérales, réconciliation des 4 taux URSSAF concurrents | **À recâbler** (les briques de calcul existent, l'assemblage et le mécanisme d'alerte central n'existent pas) |
| **Activité & congés** | ~55 % | Missions, factures, occupation, DSO, calendrier congés (en modale) | Calendrier intégré en page (pas modale), remontée occupation/DSO depuis Cockpit | **À recâbler** |
| **Argent** | ~60 % | Solde, mouvements, provisions, échéancier par type de charge, graphe CA réalisé/encaissé, graphe salaires | Enveloppes de provision au sens cible, modales de déclaration conformes, taux canonique unique, statuts d'échéance enrichis | **À recâbler** (le plus complet des 6, car fusion de deux écrans déjà denses) |
| **Achats** | ~40 % | Catégories de dépense, saisie montant/TVA/récurrence, rapprochement bancaire automatique | Justificatif/pièce jointe, champ fournisseur, état de rapprochement explicite stocké, écran dédié avec période/compte | **À recâbler + compléter** (squelette de données solide, conformité documentaire absente) |
| **Outils** | ~45 % | Les 3 calculs (IR, CFE, CRA) existent et fonctionnent, mais dispersés | Regroupement en un écran à 3 sous-onglets, cohérence des taux avec le reste de l'app | **À recâbler** |
| **Config** | ~50 % (65 % si on inclut le contenu actuellement dans Compte) | Régime fiscal, ACRE, Livre des recettes, export FEC/CSV/JSON, sync Supabase, profil/sécurité (dans Compte) | Section Réserve & versements dédiée, bandeau fraîcheur barème, fusion effective avec Compte | **À recâbler** |

Aucun des 6 écrans n'est à "créer de zéro" — chacun a un socle de calcul et/ou d'UI réel dans l'existant ; le travail dominant est la redistribution et le complément, pas la création pure.

---

## 3. Fonctions manquantes

| Fonction / capacité | Écran | Pourquoi nécessaire | Statut | Effort |
|---|---|---|---|---|
| Justificatif de dépense (upload/pièce) + invariant "TVA récupérable seulement si pièce jointe" | Achats | Conformité fiscale réelle (déduction de TVA/charge sans preuve = risque en cas de contrôle) ; c'est un invariant explicite de la cible (§3.2/§6 de `01-vision.md`) | **BLOQUANT** | M |
| Réserve matelas unique pilotant `versable()` (arbitrer entre le curseur % de Config existant-différent `reserveCompte` €150 fixe et le montant absolu cible réglé sur Pilote) + choix d'**un** taux URSSAF canonique parmi les 4 concurrents que la cible elle-même contient (21,2/24,6/11,6/10,6 %, `01-vision.md §3.4/§7.1`) | Pilote | C'est la promesse centrale de l'app ("combien je peux me verser") ; câbler par-dessus des formules déjà contradictoires reproduirait le bug historique (3010 €/3180 €) que l'architecture à writer unique est censée avoir corrigé | **BLOQUANT** | S/M (surtout arbitrage produit, peu de code) |
| Requête réelle derrière le panneau "À traiter" / carte "Décisions du jour" (`allTodos()` : agrégat factures en retard + échéances à déclarer + pièces manquantes + seuils proches + erreurs de sync) | Pilote | Sans elle, l'écran qui est la raison d'être du redesign ("la décision du jour") affiche une carte factice/statique | **BLOQUANT** | M |
| État de rapprochement explicite et stocké par dépense (`matched`/`pending`/`nobank`), avec l'invariant "compte non synchronisé jamais rapproché" | Achats | L'existant réconcilie automatiquement par candidats (`reconcileTransactions` `10381`) mais ne pose aucun état persistant consultable/corrigeable par l'utilisateur — sans lui, "chaque opération est rapprochée" (rôle affiché de l'écran) n'est pas vérifiable | **BLOQUANT** | M |
| Cycle de statut d'échéance enrichi (à déclarer → déclarée → payée, avec date par étape, `FSTAT`) | Argent | La cible qualifie elle-même le cycle actuel binaire de "trop pauvre" (`01-vision.md §6`) ; sans lui les statuts visuels promis (`adecl/watch/todo`) ne peuvent pas s'afficher fidèlement | RECOMMANDÉ | M |
| Sysbar unifiée à 4 pastilles (Cloud/Documents/Qonto/Palette) | Transverse | Aujourd'hui 4 icônes isolées et hétérogènes dans le header (`1867-1870`, voir §6) ; sans regroupement, la "couche indicateurs système" transverse de la cible n'existe pas comme composant unique | RECOMMANDÉ | M |
| Emplacement réel des documents (Drive/OneDrive/Dropbox/coffre) | Achats/Config | Prérequis technique du justificatif de dépense au-delà du simple champ ; actuellement 0 intégration (voir §4) | RECOMMANDÉ | L |
| Bandeau fraîcheur du barème + vérification manuelle + millésime affiché | Config | `LEGAL_BY_YEAR` contient déjà 2025/2026 mais rien n'indique à l'utilisateur si les taux affichés sont à jour | RECOMMANDÉ | S |
| 4 palettes `data-theme` (existant = binaire dark/light uniquement, `data-theme="light"` seul variant trouvé, `466` [vérifié]) | Config/transverse | Invariant explicite de la cible ; nécessaire pour que la pastille "Palette" ait un sens | RECOMMANDÉ | M |
| Sync cloud avec détection/affichage de conflit réel (existant = `upsert(..., {onConflict:'user_id'})` `2467` [vérifié], dernier écrit gagne, silencieux) | Config | Sans elle, deux appareils synchronisés peuvent s'écraser silencieusement — pas fiscalement bloquant mais risque de perte de données | RECOMMANDÉ | L |
| Agrégation bancaire Qonto DSP2 réelle (remplace l'import CSV/OFX manuel) | Argent/Achats | Le manuel (`parseOFX/parseCSV`) couvre déjà le besoin fonctionnel de rapprochement ; l'API réelle est un confort de collecte automatique, pas un blocage | RECOMMANDÉ (proche CONFORT) | L |
| Dock flottant en pilule ≤760px (existant = barre fixe pleine largeur, `.bottom-nav` `1491-1496` [rapport]) | Transverse | Rôle de navigation déjà assuré fonctionnellement par la barre actuelle ; changement purement visuel | CONFORT | S/M |
| Sheet latéral (`FreelSheet`, existant = modales centrées uniquement : `formModal`/`detailModal`/`fabModal` `1896-1922` [vérifié]) | Transverse | Le détail est déjà accessible via modale ; changement de motif d'interaction, pas de capacité | CONFORT | M |
| Motif `.info`/`.explain` (texte replié derrière un i) — existant n'a que des tooltips natifs `title` (ex. `21862` [vérifié]) et des blocs `.info-box` toujours visibles | Transverse | Amélioration de lisibilité, aucune fonction bloquée sans lui | CONFORT | S |
| `.tblscroll` composant dédié (existant = `overflow-x:auto` ad hoc sur `.card`/`.timeline`, `500,619,1798,1801` [vérifié]) | Transverse | Le débordement horizontal est déjà géré au cas par cas | CONFORT | S |
| Devis | — | **Absent des deux sources** : ni la cible (`01-vision.md`, aucune mention de "devis" dans les 6 écrans) ni l'existant ne portent cette fonction. Ce n'est donc pas un écart entre existant et cible — hors périmètre de cet audit, à ne pas ajouter au chantier sauf demande produit explicite | (hors périmètre) | — |

**Compte des BLOQUANTS : 4.** Le classement reste discriminant à dessein — la majorité des écarts identifiés sont des défauts de recâblage/organisation ou des améliorations de confiance (RECOMMANDÉ), pas des absences qui rendraient l'app non-fonctionnelle.

---

## 4. Appels API / persistance absents

| Besoin de la cible | Simulé aujourd'hui par | Ce qu'il faudrait réellement |
|---|---|---|
| Synchro cloud multi-appareil fiable | Un blob JSON unique par utilisateur dans la table Supabase `user_data` (`2426,2466,2541,23065` [rapport]), badge texte "Synchronisé"/"Hors ligne" (`23332` [vérifié]) reflétant l'état d'authentification, pas l'état réseau réel | Granularité par entité ou au minimum horodatage de version comparé côté client/serveur avant upsert, file d'attente hors-ligne, UI de résolution de conflit |
| Emplacement des documents (Drive/OneDrive/Dropbox/coffre) | **Rien** — 0 occurrence vérifiée (`Google Drive`, `OneDrive`, `Dropbox`, `coffre-fort`, `stockage document` — 2 formulations testées, aucun résultat) | OAuth vers un fournisseur de stockage (ou coffre in-app chiffré), endpoint d'upload, lien de récupération, pastille "Documents" reflétant l'état de connexion |
| Agrégation bancaire Qonto DSP2 | Import manuel de fichier CSV/OFX + heuristique de rapprochement locale (`parseOFX/parseCSV` `10265-10287`, `reconcileTransactions` `10381` [vérifié]) ; le message d'aide dit lui-même "Aucune donnée n'est envoyée sur Internet — le rapprochement se fait localement" (`10249` [vérifié]) | Intégration API bancaire DSP2 (agrément tiers de type Powens/Budget Insight/Bridge, ou API Qonto propre), consentement OAuth, webhook/polling des nouvelles opérations |
| Dépôt et conservation des pièces (obligation 10 ans) | **Rien** — aucun champ d'upload, aucune politique de rétention trouvée | Stockage de fichier avec métadonnées (date, montant, dépense liée), politique de conservation, export/archivage |
| Requête réelle derrière `allTodos()` | Un centre de notifications global (`toggleNotifCenter()`, badge `notifBadge` `1867` [vérifié]) qui liste des notifications lues/non lues — structure différente d'un agrégat "à traiter" catégorisé par écran ; et `computeAlerts()` (`6129` [rapport]) qui produit des alertes ponctuelles (ex. seuil TVA `6180-6181` [vérifié]) sans consolidation cross-écran | Une fonction pivot unique scannant échéances non déclarées, factures en retard, pièces manquantes, seuils proches, erreurs de sync — alimentant à la fois les badges par onglet et le panneau "À traiter" |

---

## 5. États non gérés

| État | Où il devrait apparaître | Géré aujourd'hui | Constat |
|---|---|---|---|
| Vide | Toutes les listes (missions, factures, charges, mouvements) | **Oui, partiellement** | Vérifié : nombreux messages "Aucune charge" (`7104`), "Aucune mission ce mois" (`11257,14052`), "Aucune facture en cours de cycle" (`7928`), classe CSS dédiée `.empty-state` (`1152,1483`) — géré au cas par cas par widget, pas systématisé comme motif unique pour les 6 écrans cible |
| Chargement | Sync cloud, exports, calculs | **Partiel** | Un seul texte "Chargement en cours..." trouvé, spécifique au chargement de la lib Supabase (`22861` [vérifié]) — pas de squelette de chargement générique pour le reste de l'app |
| Erreur | Toute action réseau/calcul | **Partiel** | Toasts d'erreur ponctuels existants (ex. `toast('Aucune donnée pour ce mois', 'error')` `11925,12154`) — mécanisme éphémère, pas d'état "erreur" persistant affiché dans une carte |
| Hors-ligne | Sysbar "Cloud" | **Non, au sens réel** | Le badge "Hors ligne" (`23332`) reflète l'absence d'utilisateur connecté (`CURRENT_USER`), pas une vraie détection réseau — 0 occurrence de `navigator.onLine` dans tout le fichier (vérifié) |
| Données périmées (millésime barème) | Config, Outils | **Non** | `LEGAL_BY_YEAR` contient des données par année (`2587` [rapport]) mais aucune UI de fraîcheur/date de vérification trouvée (recherche "à jour"/"millésime"/"vérifié le" : 0 résultat pertinent) |
| Conflit de synchro | Sysbar "Cloud" | **Non** | `upsert(data, {onConflict:'user_id'})` (`2467` [vérifié]) = dernier écrit gagne, silencieusement ; aucune UI de conflit |
| Permissions refusées | Sysbar "Cloud" / actions RGPD | **Non (vérifié négativement)** | Aucune occurrence de gestion de permission/403/RLS trouvée au-delà de textes de licence de bibliothèques tierces (faux positifs) |

---

## 6. Composants inexistants

| Composant cible | Statut dans l'existant |
|---|---|
| Dock en pilule flottante ≤760px | **Inexistant** — l'existant a une barre fixe pleine largeur (`.bottom-nav`, 6 onglets, `position:fixed; bottom:0`, `1491-1496` [rapport]) : même rôle, forme différente |
| Sysbar et ses 4 panneaux (Cloud/Documents/Qonto/Palette) | **Inexistant comme composant unique.** Précédent partiel vérifié dans le header (`1867-1870`) : 4 icônes isolées — ☁️ cloud (rôle proche), ☀️ thème (binaire, pas 4 palettes), plus **2 icônes hors périmètre cible** : 🔔 centre de notifications et 👁️ mode confidentialité. Aucune pastille "Documents" ni "Qonto" |
| Panneau "À traiter" | **Inexistant.** Le plus proche est le centre de notifications (`toggleNotifCenter`, badge `notifBadge`) — structure et sémantique différentes (notifications lues/non lues, pas actions par écran) |
| Sheet latéral | **Inexistant.** Toutes les UI de détail utilisent des modales centrées (`formModal`, `detailModal`, `fabModal`, `1896-1922` [vérifié]) — aucun motif de panneau glissant depuis le bord |
| Motif `.info`/`.explain` (texte replié derrière un i) | **Inexistant comme composant interactif.** Précédent partiel : tooltip natif `title` sur icône "ⓘ" (`21862` [vérifié], affichage au survol uniquement) et blocs `.info-box` statiques toujours visibles (`1505-1508`) — pas de mécanisme cliquable de dépliage |
| Onglets de section | **Existe déjà, réutilisable.** Le mécanisme de sous-onglets (`ACTIVITE_TAB`, `FINANCES_TAB` avec bascule vue `18106-18110` [vérifié], `CONFIG_TAB`, `COMPTE_TAB`) et le motif DOM de tabs cliquables sont vivants et fonctionnels — **pas un manque**, un socle à harmoniser visuellement |
| `.tblscroll` | **Inexistant comme classe dédiée.** `overflow-x:auto` posé au cas par cas sur `.card`/`.timeline`/certaines grilles (`500,619,1798,1801` [vérifié]) |
| Calendrier de plan de charge | **Précédent fort mais mal exposé.** `showMonthCongesModal()` (`10679` [vérifié]) est un vrai calendrier mensuel avec pastilles par jour et bascule activité/congés, vivant et déclenché depuis le FAB et plusieurs écrans — mais la vue pleine page candidate `renderCongesCalendar()` (`15597`) est **du code mort** (jamais appelée, vérifié par grep du nom entier) |
| Graphe CA réalisé vs encaissé | **Existe déjà.** `mainChart` dans Finances/Évolution : "📊 CA HT (Prévu / Réalisé / Encaissé)" avec toggle Mensuel/Cumulé et invite au clic par mois (`18121-18134` [vérifié]) — **pas un manque**, à relocaliser vers Argent > Performance |

---

## 7. Risques de régression

| Risque | Détail vérifié |
|---|---|
| **Migration des données locales** (le plus important) | Format actuel : `localStorage['freel_v50_...']` contenant un bundle `{c:COMPANY, m:MISSIONS, cl:CLIENTS, t:TREASURY, ir:IR_CONFIG, _ts}` (`saveAll` `5631`, `loadAll` `5648` [rapport]) + clés annexes (`freel_theme`, `freel_goal_ca`, `freel_notif_read`, `freel_supabase`, `freel_ts`, `freel_collapse_*`, `freel_app_version`). La cible utilise un schéma à 2 stores totalement différent (`freel-etat-v1`/`freel-depenses-v1`). **Sans script de migration explicite mappant COMPANY/MISSIONS/CLIENTS/TREASURY/IR_CONFIG vers FACTS/factures/echeances + dépenses, tout utilisateur existant perd ses données au premier chargement de la nouvelle version.** |
| Export PDF (jsPDF vendorisé, lignes 18-392) | Utilisé par génération de facture (`generateAndDownloadPDF` `12474` [rapport]) et par le CRA (`showCRAModal`/export PDF, `12671-13138` [vérifié], nom de fichier généré `'CRA ' + data.mois...` `13138`) — 39 occurrences combinées jsPDF+Chart.js vérifiées dans le fichier ; une réécriture qui ne recâble pas ces appels perd silencieusement l'export facture ET le CRA |
| Graphiques Chart.js vendorisé | `mainChart`, `tresoSalairesChart`, `joursParMissionChart`, `drawSoldeChart` (`20486,20663` [rapport]) — perte des visualisations si le nouveau rendu ne réinstancie pas les mêmes canevas |
| Export FEC réel | `exportFEC()` (`3643`), structure des 18 colonnes standard FEC vérifiée (`3714` : `JournalCode...Idevise`) — obligation légale de conservation ; ne doit pas être perdu dans le recâblage |
| Numérotation légale des factures | `getNextInvoiceNumber/reserveInvoiceNumber/repairInvoiceNumbers/validateInvoiceNumbering` (`3168-3181,3550` [rapport]) — la continuité de séquence est légalement contrainte (pas de trou) ; un recâblage naïf de l'écran factures pourrait rompre la séquence pour un utilisateur en cours d'exercice |
| Comptes déjà synchronisés via Supabase | Le blob distant (`user_data`) est au format `{c,m,cl,t,ir}` actuel — changer le schéma de stockage local sans migrer aussi le blob cloud casse la sync pour les comptes déjà connectés |
| Accessibilité déjà investie | `role="tablist"/"tab"`, `aria-selected`, `:focus-visible`, skip-link (`1838,1871-1877` [vérifié]) — un reskin qui recompose les composants doit reproduire ces attributs, sinon régression silencieuse d'accessibilité |
| Filet de tests cassé | `tests/smoke-test.js` affiche "47 passés, 0 échoués" alors que la portion testant les fonctions de calcul plante et voit son erreur avalée par un `catch` (`02-inventaire-existant.md §8.2`, vérifié par exécution réelle par l'agent précédent) — **toute réécriture des stores/formules avance aujourd'hui sans détection automatique de régression de calcul.** Ce n'est pas un risque du redesign en tant que tel, mais un risque qui touchera *tous* les chantiers ci-dessous tant qu'il n'est pas corrigé |

---

## 8. Priorisation

1. **Arbitrer les incohérences numériques que la CIBLE elle-même contient** (taux URSSAF : 4 valeurs concurrentes 21,2/24,6/11,6/10,6 % ; facteur `×1,56` non documenté dans `cotisIR()` ; `provisions()` qui inclut peut-être deux fois les échéances déjà payées) — sans cet arbitrage, tout câblage ultérieur reproduit le bug historique (3010 €/3180 €) que l'architecture à writer unique est censée avoir corrigé. *(à mener en parallèle : corriger `smoke-test.js` pour qu'il cesse d'avaler l'erreur de calcul — coût faible, protège tous les chantiers suivants.)*
2. **Construire le store canonique à écriture unique et migrer les données existantes** (COMPANY/MISSIONS/CLIENTS/TREASURY/IR_CONFIG → nouveau schéma, avec script de migration testé) — c'est le socle sur lequel les 6 écrans reposent, et le point de rupture n°1 pour les utilisateurs déjà en production (§7).
3. **Construire la requête réelle `allTodos()` et le mécanisme d'alerte à 2 niveaux** (badge par onglet + panneau "À traiter") — sans cela, l'écran Pilote, raison d'être du redesign, reste une coquille.
4. **Redistribuer le contenu des écrans existants vers la topologie cible** (Trésorerie+Finances → Argent ; Activité+calendrier congés → Activité & congés ; simulateurs Config → Outils ; Compte → fusion dans Config) — réorganisation de code déjà fonctionnel, moins risquée une fois le store stabilisé (dépend de #2).
5. **Achats : ajouter justificatif, champ fournisseur, état de rapprochement explicite** — construit sur le squelette `CHARGE_CATEGORIES`/`showChargeModal` déjà présent à 60-70 %, donc un chantier de complément plutôt que de création.
6. **Couche transverse "indicateurs système" (sysbar 4 pastilles) et stockage documentaire réel** — dépend de #3 (panneau) et #5 (Achats) pour avoir du contenu réel à afficher ; sinon coquille vide.
7. **Agrégation bancaire Qonto DSP2 réelle** — l'import manuel fonctionne déjà, chantier différable, effort le plus lourd (agrément/API tierce).
8. **Reskin visuel pur** (4 palettes, dock en pilule, sheet latéral, motif `.info`/`.explain`, `.tblscroll`) — dernier, sans dépendance montante, risque le plus faible, gain le plus visible.

---

## Fichiers de référence

- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/reports/01-vision.md`
- `/tmp/claude-0/-home-user-FREEL/c57106da-e016-5a61-aee3-4f435a38dfa6/scratchpad/reports/02-inventaire-existant.md`
- `/home/user/FREEL/index.html` (vérifications par Grep/Read ciblés, non lu intégralement)
