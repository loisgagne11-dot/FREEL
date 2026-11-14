# Audit de sécurité — avant publication

**Date : 13 novembre 2026.** Demandé par le propriétaire (décision 21) :
l'application va être publiée, c'est-à-dire ouverte à d'autres que lui.

Ce document dit **ce qui a été constaté**. Ce qui reste à faire vit dans
`LISTE-DE-SORTIE.md` (lots 56 à 65), et nulle part ailleurs.

## 0. En bref

La base est saine pour un outil personnel : les données d'un compte ne se
lisent que par lui, rien d'externe ne s'exécute dans la page, et ce qui est
servi ne porte aucune vulnérabilité connue. Elle n'est **pas encore prête pour
un public**. Quatre choses à corriger avant d'ouvrir, dans cet ordre :

1. **L'ancienne version partage l'origine de la nouvelle, sans aucune
   protection** (S1). Une faille chez elle donne accès à la session et aux
   données de la nouvelle.
2. **La chaîne qui publie n'est pas verrouillée** (S2, S3). Qui parvient à
   pousser sur `main`, ou à corrompre une action de la chaîne, sert du code à
   tous les utilisateurs.
3. **L'hébergement ne pose aucun en-tête** (S4) : l'application peut être
   affichée dans un cadre par un site tiers, et son origine est partagée avec
   les autres sites du même compte.
4. **Le compte n'a pas de mémoire** (S5) : un écrasement — session volée,
   migration fautive — est définitif côté serveur.

Et une décision qui change l'ampleur du reste : **comment publier** (§5).

## 1. Ce qui a été lu, et ce qui ne l'a pas été

Lu : `app/index.html` (politique de contenu), `app/src/infra/` (client du
compte, session, sonde d'accès, pièces, téléchargement), les exports et les
imports, `docs/supabase.sql`, `.github/workflows/`, `app/scripts/assembler-site.mjs`,
l'ancienne `index.html` pour ses liaisons externes. `npm audit` lancé le 13/11.

**Pas fait, et pourquoi :**

- Aucun essai sur un vrai projet Supabase : les identifiants du propriétaire ne
  se manipulent pas. Les règles d'accès sont jugées sur le texte du SQL ; leur
  présence réelle se constate par la sonde de l'écran Compte.
- Les réglages du dépôt GitHub (double authentification, protection de `main`)
  ne sont pas visibles d'ici : ils sont listés au §6 pour être vérifiés.
- Les en-têtes réellement servis par le site en ligne n'ont pas été mesurés :
  c'est la première ligne du lot 58.

## 2. Ce qui est solide — à ne pas défaire

| Sujet | Ce qui protège | Preuve |
|---|---|---|
| Lecture des données d'autrui | Quatre règles « les siens » sur `freel_faits`, une sur `user_data` | `docs/supabase.sql` ; test d'égalité avec `supabase.acces.ts` |
| Règles absentes côté serveur | Sonde anonyme : compte les lignes lisibles avec la seule clé publique ; une sonde qui échoue ne dit jamais « protégée » | `infra/supabase.acces.ts` (lot 11) |
| Secrets | Ni adresse de projet ni clé dans le dépôt ; `https:` exigé, sans exception | `infra/supabase.ts`, `motifUrlRefusee` |
| Code injecté | Politique de contenu par empreintes : aucun script en ligne autre que les deux de la page, aucun domaine tiers | `app/index.html` ; `infra/csp.test.ts` |
| Dépendances servies | Trois : `react`, `react-dom`, `zustand`. Client du compte écrit à la main. `npm audit --omit=dev` : **0** | `app/package.json` |
| Traceurs, CDN | Aucun : `connect-src` n'autorise que l'origine et le projet du compte | `app/index.html` |
| Écrasement entre appareils | Verrou de version vérifié par le serveur dans la requête | `pousserFaits` |
| Effacement | Prouvé par relecture, jamais annoncé sur la foi d'un « succès » | `effacerLigne` (lot 25) |
| Sorties | CSV neutralisé contre les formules ; titre de document échappé ; aucun `dangerouslySetInnerHTML` | `livreRecettesCsv.ts`, `telechargement.ts` |
| Pièces | Taille bornée, types listés (pas de SVG), empreinte SHA-256, jamais envoyées au compte | `infra/justificatifs.ts` |
| Perte locale | Copie avant restauration, deux onglets, quota plein | lot 1 |
| Confidentialité du dépôt | Balayage des formes (SIRET, IBAN, courriel) | `tests/smoke-test.js` |

## 3. Qui pourrait nuire, et à quoi

**Ce qu'il faut protéger** : les données financières (sur l'appareil, sur le
compte), les jetons de session, la justesse des chiffres qui finissent dans une
déclaration, et l'existence même des données dans la durée.

**Par où** : (a) un site tiers ouvert à côté — cadre invisible, lien piégé ;
(b) un fichier piégé — import, relevé bancaire dont un tiers choisit les
libellés ; (c) une dépendance ou une action de la chaîne corrompue ; (d) le
compte GitHub ou Supabase du propriétaire ; (e) un appareil perdu ou prêté ;
(f) dans le modèle B seulement, un autre inscrit du même projet.

## 4. Constats

Gravité : **haute** = à corriger avant toute publication ; **moyenne** = avant
publication aussi, mais sans chemin d'attaque direct constaté ; **basse** =
durcissement.

| N° | Gravité | Constat et preuve | Correction | Lot |
|---|---|---|---|---|
| S1 | Haute | **L'ancienne version vit sur la même origine, sans politique de contenu.** `index.html` (racine) : aucune politique, 48 écritures `innerHTML`, des scripts chargés à la volée depuis trois CDN, un seul attribut `integrity`. Publiée sous `/legacy/`, elle lit tout ce que lit la nouvelle : jetons de session, faits, pièces. La lecture seule (lot 24) bloque ses écritures, pas ses lectures ni une sortie de données par navigation | Sur la **copie publiée**, jamais sur l'original : politique de contenu listant les hôtes exacts, `object-src`, `base-uri` et `form-action` fermés. À terme, une origine à elle (sous-domaine) | 58, 60 |
| S2 | Haute | **La chaîne de publication n'est pas verrouillée.** Les sept actions sont épinglées par étiquette (`@v5`), pas par empreinte ; `validate.yml` n'a pas de bloc `permissions` ; pas de veille des dépendances ; le déploiement ne lance pas le `verifier` complet | Empreintes, permissions minimales, veille automatique, `verifier` avant déploiement ; réglages du dépôt (§6) | 56 — ✅ 14/11 dans le dépôt : empreintes, `permissions` partout, `persist-credentials: false`, Dependabot hebdomadaire, `verifier` complet avant validation et avant déploiement. **Reste le §6, au propriétaire** |
| S3 | Moyenne | **Outillage vulnérable.** `npm audit` : 16 alertes, dont 2 critiques (`vitest`, `tinypool`) et 4 hautes (`vite`, `undici`, `nanoid`, `source-map-js`). **Aucune dans ce qui est servi** : le risque est sur le poste et la chaîne qui construisent | Mise à jour ; contrôle bloquant sur les dépendances servies, informatif sur l'outillage | 56 — ✅ 14/11 : `npm audit` = 0 (vitest 3 → 4, `npm audit fix`, minimatch forcé en 11 sous `typescript-estree`) ; l'audit des dépendances servies bloque la validation et le déploiement, celui de l'outillage s'affiche |
| S4 | Moyenne | **Aucun en-tête de réponse.** La politique est en `<meta>` : `frame-ancestors` y est sans effet, donc rien n'empêche un site tiers d'afficher l'application dans un cadre et de détourner un clic vers « Effacer » ou « Écraser ». Pas de `nosniff`, de politique de référent, de permissions, ni de maîtrise du cache (d'où le rattrapage d'index périmé). L'origine `…github.io` est commune à tous les sites du même compte. La documentation de l'hébergeur ne prévoit aucun réglage d'en-tête, et dit elle-même qu'il ne convient pas aux échanges sensibles comme l'envoi d'un mot de passe | Tout de suite : refus de s'afficher dans un cadre, référent coupé. Ensuite : un hébergement qui pose des en-têtes et un nom de domaine propre | 58, 60 |
| S5 | Moyenne — irréversible | **Le compte ne garde aucun état précédent.** Une ligne par compte, remplacée à chaque envoi. La copie locale du lot 1 ne couvre que l'appareil qui a agi. Sur l'offre gratuite de Supabase, les sauvegardes ne se téléchargent pas et un projet inactif peut être mis en pause | Historique côté serveur par déclencheur, lisible par son propriétaire seulement ; « Revenir à un état précédent du compte » | 57 — ✅ 14/11 dans le dépôt : `freel_faits_historique` par déclencheur (20 états, heure du serveur), « Revenir à cet état » dans Compte, effacement compris. **Actif une fois `docs/supabase.sql` exécuté par le propriétaire** |
| S6 | Basse | **Règles d'accès perfectibles** : rôle non précisé, pas de borne de taille sur `faits`, `version` non contrainte côté serveur (elle peut reculer) | `to authenticated`, borne de taille, contrôle de la version | 57 — ✅ 14/11 dans le dépôt : `to authenticated` et `(select auth.uid())` sur chaque règle ; borne de 4 Mo (et non dix fois le jeu d'essai, qui aurait refusé un compte chargé au bout d'un an) ; version n → n + 1 imposée par le serveur. Même condition |
| S7 | Moyenne | **Appareil perdu ou prêté.** Faits, pièces et jetons sont en clair dans le navigateur ; se déconnecter laisse les données sur l'appareil, sans le dire | « Se déconnecter et effacer cet appareil », après avoir proposé l'archive ; dire que le verrouillage de l'appareil est la vraie protection. Le chiffrement local par phrase secrète n'est pas retenu pour la première publication (coût élevé, oubli de la phrase = perte) : à rouvrir sur demande | 59 |
| S8 | Basse | **Fichiers hostiles : rien ne prouve la robustesse.** Aucune borne de taille à l'import, aucun corpus d'essais hostiles. Aucune exécution possible constatée | Bornes, corpus d'essais, mutation | 59 |
| S9 | Basse | **Renouvellement de session** : deux onglets peuvent renouveler en même temps et se déconnecter l'un l'autre ; `lireSession` ne contrôle pas l'échéance | Verrou entre onglets, lecture stricte | 59 |
| S10 | Moyenne — modèle B | **Pas de cycle de vie du compte** : ni inscription, ni mot de passe oublié, ni second facteur, ni suppression de l'identifiant. L'adresse du projet se saisit librement : faire saisir un projet tiers suffit à détourner les données. Supprimer un identifiant exige la clé de service, donc du code côté serveur ; le refus des mots de passe déjà fuités est réservé à l'offre payante | Bloc « comptes hébergés » | 63 à 65 |
| S11 | Moyenne | **Rien de ce qu'un site public doit dire** : mentions légales, confidentialité, limites de l'outil. Les polices ne sont pas embarquées (aucun `@font-face`) : l'écran s'affiche en police système | Pages légales, identité fournie hors dépôt ; polices embarquées, jamais par CDN | 61, 51 |
| S12 | Basse | **Aucun canal de signalement**, aucune revue avant ouverture | `SECURITY.md` ; revue finale | 56 — ✅ 14/11 `SECURITY.md` (signalement privé, sans courriel) ; 62 pour la revue |

## 5. Deux façons de publier

| | A — « chacun chez soi » | B — « comptes hébergés » |
|---|---|---|
| Où vivent les données | Sur l'appareil de chacun. Synchronisation facultative vers **son propre** projet | Sur le projet du propriétaire, pour tous les inscrits |
| Ce que le propriétaire détient | Rien | Les données financières de tiers |
| Rôle au sens du RGPD | Éditeur d'un logiciel ; aucune donnée d'utilisateur traitée | Responsable de traitement : registre, information, sécurité, sous-traitant, notification d'une violation sous 72 h (art. 13, 28, 30, 32, 33) |
| Travail restant | Lots 56 à 62 | Les mêmes, plus 63 à 65 |
| Charge durable | Faible | Assistance, coûts, abus, sauvegardes |

**Recommandation : A d'abord.** L'application sait déjà fonctionner sans
compte, et c'est ce qui la rend sûre à publier : une fuite côté propriétaire
est impossible quand il ne détient rien. B reste ouvert plus tard, sans rien
défaire. Tant que la décision n'est pas prise, le plan suit A.

## 6. Ce que seul le propriétaire peut régler

**GitHub** — double authentification (clé d'accès de préférence) ; `main`
protégée (PR obligatoire, validation exigée, pas de poussée forcée) ;
environnement `github-pages` limité à `main` ; détection de secrets et blocage
à la poussée ; signalement privé des vulnérabilités ; alertes de dépendances.

**Supabase (son projet)** — exécuter `docs/supabase.sql` en entier (la règle
d'effacement du lot 25 attend toujours) ; second facteur sur le compte du
tableau de bord ; confirmation du courriel ; **inscriptions fermées** tant que
le modèle A est retenu ; lancer la sonde depuis l'écran Compte.

## 7. Exigences de sécurité des lots déjà prévus

| Lot | Exigence |
|---|---|
| 39 — achat en photo | L'image reste sur l'appareil ; le type se contrôle sur les premiers octets, pas sur la déclaration du navigateur ; aucune lecture par un service tiers |
| 40 — synchronisation des pièces | Espace privé, un dossier par compte, règles d'accès sur le chemin, taille et types bornés côté serveur ; la sonde anonyme s'étend à cet espace |
| 42 — hors ligne | Le cache ne garde que les fichiers de l'origine ; jamais une réponse du compte ; une version nouvelle remplace l'ancienne sans rester coincée |
| 44 — envoi par courriel | Adresse et objet encodés ; aucun retour à la ligne ne passe dans un en-tête |
| 47 — facture électronique | Chaque valeur saisie est échappée dans le fichier produit ; le fichier est validé contre son schéma avant d'être proposé |
| 51 — jetons de style | Polices embarquées dans l'application, sous licence libre vérifiée ; la politique de contenu ne s'ouvre à aucun domaine |

## 8. Sources

Relues en ligne le 13/11/2026 :

| Point | Source |
|---|---|
| Nommer le rôle d'une règle (`to authenticated`) ; envelopper `auth.uid()` dans un `select` | Supabase, *Row Level Security* |
| Liste de mise en production : règles d'accès sur chaque table, confirmation du courriel, second facteur sur le compte du tableau de bord, CAPTCHA, limites de débit ; sauvegardes non téléchargeables et mise en pause possible sur l'offre gratuite | Supabase, *Going into production* et *Production checklist* |
| Refus des mots de passe fuités : offre payante. Second facteur par code temporaire : gratuit, actif sur tous les projets | Supabase, *Password security* ; *Multi-factor authentication (TOTP)* |
| Supprimer un utilisateur exige la clé de service, côté serveur seulement | Supabase, référence `auth.admin.deleteUser` |
| Épingler chaque action par son empreinte complète | GitHub, *Security hardening for GitHub Actions* |
| Aucun réglage d'en-tête documenté ; « ne devrait pas servir à des échanges sensibles comme l'envoi de mots de passe » | GitHub, *GitHub Pages limits* ; *Securing your GitHub Pages site with HTTPS* |
| `frame-ancestors` n'a pas d'effet dans un `<meta>` | MDN, *Content-Security-Policy : frame-ancestors* |
| Les traceurs strictement nécessaires au service sont dispensés de consentement | CNIL, « Cookies et autres traceurs : que dit la loi » (29/09/2020) |
| Mentions d'un site d'entrepreneur individuel : nom et prénom avec « EI », adresse de domiciliation, courriel, téléphone, immatriculation, coordonnées de l'hébergeur | Service public, F37351, vérifiée le 13/10/2026 |

**Non confirmé** : qu'un éditeur non professionnel puisse ne donner que les
coordonnées de son hébergeur. La fiche lue ne le dit pas ; le texte de la loi
du 21 juin 2004 est à lire avant le lot 61. Conséquence à mesurer par le
propriétaire : publier en tant que professionnel affiche son nom et son adresse
de domiciliation sur le site — jamais dans le dépôt.

Références de méthode, non relues ce jour : OWASP (*Application Security
Verification Standard*, *Top 10*, fiches *Clickjacking Defense* et *CSV
Injection*) ; ANSSI, *Recommandations pour la mise en œuvre d'un site web* ;
CNIL, *Guide de la sécurité des données personnelles* ; règlement (UE)
2016/679.
