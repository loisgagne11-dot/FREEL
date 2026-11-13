# Audit du produit et de l'interface — 12 novembre 2026

Demandé par le propriétaire le 12/11 : auditer le cahier des charges, sa
cohérence avec l'application et les fonctions retenues, dire ce qui rendrait
l'outil plus complet pour un indépendant (gestion, suivi d'activité,
comptabilité), puis contester l'ergonomie, l'organisation et le visuel — et en
tirer un reste à faire remis à jour.

Cadre fixé par ses réponses du jour : **lui d'abord** (micro-BNC, missions au
tarif journalier), sans fermer la porte aux autres micro-entrepreneurs ;
**tout le design est contestable**, sous sa validation ; quatre priorités à
égalité — voir venir la trésorerie, piloter l'activité, ne rien rater côté
obligations, gagner du temps au quotidien.

**Ce document propose, il ne décide pas.** Tant que le propriétaire n'a pas
validé, `LISTE-DE-SORTIE.md` reste la seule liste de ce qui est à faire.

---

## 0. En bref

**Le verdict.** L'application est pertinente et son socle est rare pour un
outil de ce genre : des faits datés, des montants dérivés d'une seule source,
des barèmes sourcés, une abstention quand la donnée manque. Sur ce que le
propriétaire a demandé en août (`VISION-PRODUIT.md`), elle est à 17 attentes
sur 17. **Mais elle regarde le passé et le présent, et le reste à faire aussi.**

Cinq constats commandent les autres :

1. **Le plan restant vise la parité, pas l'usage.** Les lots 28 à 45 finissent
   la reprise de l'ancienne application et de la maquette. Aucun ne répond aux
   deux premières priorités du propriétaire — voir venir, piloter — et le
   cahier des charges ne les formule nulle part.
2. **La facture électronique manque au plan, et elle a une date.** Depuis le
   1er septembre 2026 un micro-entrepreneur doit pouvoir *recevoir* des
   factures électroniques ; à partir du **1er septembre 2027** il doit en
   *émettre*, par une plateforme agréée, franchise de TVA comprise. Ce jour-là,
   le PDF que l'application fabrique ne sera plus une facture valable entre
   professionnels français. C'est le cœur de la vision — « la facture du mois
   se fabrique toute seule » — qui devient non conforme.
3. **La mission, « source unique » de la vision, a l'écran le plus pauvre.**
   Ni dates, ni volume commandé, ni avancement, ni fin annoncée. Le carnet de
   commandes — jusqu'à quand suis-je couvert — n'existe pas.
4. **Les obligations n'ont pas de maison.** Elles sont réparties entre le
   Pilote, le bas de l'écran Argent (à plus de 2 000 pixels du haut), les
   Outils, la Config et le pied du rail. La seule attente de la vision encore en ⚠️ —
   « les jalons portent leur dossier » — vient de là.
5. **L'interface répète plus qu'elle ne hiérarchise.** Le même montant jusqu'à
   quatre fois sur un écran, quatre boutons par ligne de facture, jusqu'à
   quatre commandes de période, un graphe illisible à 390 px, et deux
   couleurs de charges qu'un daltonien ne distingue pas (mesuré, §7).

**Ce que je propose** (§9) : terminer ce qui est engagé, traiter la conformité
datée, puis réorganiser l'outil autour des quatre priorités — une navigation
revue, un écran Obligations, une trésorerie à douze mois, un carnet de
commandes — et sortir du plan ce qui ne sert qu'à la parité. Le reste à faire
passe d'environ 18 lots à environ 26, mieux visés ; cinq questions (§10)
peuvent en retirer plusieurs.

---

## 1. Ce qui a été lu, regardé, et ce qui ne l'a pas été

**Lu.** `VISION-PRODUIT.md` ; `LISTE-DE-SORTIE.md` (décisions 1 à 13, plan des
lots 24 à 45, reste par écran) ; la spécification tirée du handoff
(`design/01-vision.md`, `05-spec-ecrans.md`) ; la critique comptable
(`design/06-critique-comptable.md`) ; les trois inventaires, dont l'inventaire
des indicateurs ; le modèle de données (`state/schema.ts`) et les modules de
calcul (`domain/calculs/`, `domain/bareme/`).

**Regardé.** L'application réelle, construite et capturée le 12/11 sur le jeu
de démonstration (horloge au 10 juin 2026) : thème sombre à 1440 px, tous les
écrans ; à 390 px, tous les écrans ; thème clair, le Pilote.

**Mesuré.** Hauteur des pages, contraste des textes, palette des graphiques
(validateur de palette, vision normale et daltonisme simulé).

**Vérifié sur source officielle** (§11) : calendrier et sanctions de la
facturation électronique, mentions obligatoires d'une facture, nouvelle mention
de franchise de TVA.

**Pas fait, et il faut le savoir :**
- aucun parcours joué à la main (panneaux, formulaires, états vides, erreurs) ;
- aucune donnée réelle : c'est le lot 32, et il peut contredire des points d'ici ;
- pas de lecture au lecteur d'écran ni au clavier seul ;
- pas de comparaison avec les outils du marché : je n'avance rien sur eux ;
- deux chiffres non confirmés sur source officielle (site indisponible le
  12/11) : l'attestation de vigilance et les seuils de validation des
  trimestres de retraite. Ils sont marqués « à vérifier ».

---

## 2. Le cahier des charges

### 2.1 Ce qu'il est aujourd'hui

Il n'y a pas *un* cahier des charges, mais quatre couches d'autorité inégale :

| Couche | Date | Ce qu'elle dit | Son défaut |
|---|---|---|---|
| L'ancienne application | — | Ce qui existait | Référence de parité, pas de besoin |
| Le handoff de design | juillet | Six écrans, un vocabulaire | Une maquette : beaucoup de chiffres en dur, aucun état vide |
| `VISION-PRODUIT.md` | 14/08 | Sept attentes du propriétaire, en ses mots | Tout est au présent ; tout est livré depuis août |
| `LISTE-DE-SORTIE.md` | 11/11 | 13 décisions, 22 lots | « Aucune coupe » : ordonnée par parité |

### 2.2 Ce qui lui manque

- **Le futur.** La vision demande « combien j'ai cumulé », « combien de
  provision », « où j'en suis à la date d'aujourd'hui ». Un seul verbe regarde
  devant : la prévision de revenu. Or les deux premières priorités données le
  12/11 sont au futur.
- **Un critère de réussite par attente.** Une seule en porte un — « remplir un
  formulaire officiel sans quitter l'écran » — et c'est la plus utile du
  document. Les autres disent ce qui doit exister, pas à quoi on reconnaît que
  c'est réussi.
- **Les échéances extérieures.** Le calendrier légal (facture électronique,
  nouvelle mention de franchise, fin du régime simplifié de TVA) vit dans les
  critiques et la liste, pas dans ce qui tranche.
- **Un arbitre depuis le 12/11.** `CLAUDE.md` fait des captures du handoff « la
  référence ». Si le design est contestable, il faut dire ce qui tranche à sa
  place.

### 2.3 Proposition : un cahier des charges en quatre missions

Remplacer la référence « le handoff » par « les quatre questions de
l'utilisateur ». Chaque écran, chaque indicateur se justifie par l'une d'elles
ou sort.

| Mission | La question | Réussi quand | Où (proposé) |
|---|---|---|---|
| **Voir venir** | Combien puis-je me verser, ce mois-ci et chaque mois, sans me mettre en danger ? Que sera mon compte dans douze mois ? | Je lis le versable, le versement tenable et le point bas des douze mois sans faire défiler | Pilote, Trésorerie |
| **Piloter** | Jusqu'à quand suis-je couvert ? Qu'est-ce que je gagne vraiment, et grâce à qui ? | Je lis la fin de mon carnet, mon net mensuel et ma mission la moins rentable en un écran | Activité |
| **Ne rien rater** | Qu'est-ce que je dois déclarer, payer ou fournir, quand, et avec quels chiffres ? | Chaque obligation porte sa date, son état et son dossier ; je remplis le formulaire sans chercher | Obligations |
| **Aller vite** | Clôturer mon mois — planning, compte rendu, facture, envoi, pointage — en combien de gestes ? | Un mois se clôture depuis un seul endroit ; un achat se saisit en photo depuis le téléphone | Activité, Factures, Achats |

`VISION-PRODUIT.md` reste : il décrit la chaîne mission → planning → facture →
indicateurs, qui est juste. Ce tableau s'y ajouterait en tête, daté du 12/11.

---

## 3. Le fond — ce qui est solide

À dire, parce que c'est ce qu'il ne faut pas abîmer en réorganisant.

- **Une comptabilité de trésorerie juste.** Seuils, cotisations et livre des
  recettes sont assis sur l'encaissé ; les provisions se tiennent en deux
  volets (appelé, couru) et se soldent par un paiement daté.
- **L'abstention.** Un taux non publié, des parts fiscales non saisies, un
  solde sans date : l'application dit qu'elle ne sait pas au lieu d'afficher
  un chiffre d'apparence complète. C'est ce qui rend ses autres chiffres
  crédibles.
- **La chaîne de la mission.** Planning, compte rendu, brouillon de facture et
  prévision sortent du même rythme ; corriger une journée corrige tout.
- **Des pièges que peu d'outils traitent** : TVA autoliquidée d'un franchisé,
  déclaration européenne de services, franchissement du seuil en cours
  d'année, avoir plutôt que suppression, solde d'impôt de l'année précédente.
- **La voix.** « Ton solde n'est pas tout à toi » dit en six mots ce qu'un
  tableau de bord met trois tuiles à ne pas dire.

---

## 4. Le fond — ce qui manque ou ne tient pas

Classé selon la règle du projet : irréversible, puis faux, puis incomplet.

### F1. La facture électronique — irréversible et daté

**Les faits** (fiches officielles vérifiées le 07/08/2026, §11) :

| Date | Obligation pour une micro-entreprise, franchise de TVA comprise |
|---|---|
| 01/09/2026 | Être en mesure de **recevoir** des factures électroniques, par une plateforme agréée |
| 01/09/2027 | **Émettre** en électronique ses factures aux entreprises françaises assujetties ; quatre nouvelles mentions |

Sanctions prévues : 50 € par facture non électronique, plafonnés à 15 000 €
par an ; sans plateforme de réception, mise en demeure de trois mois puis
500 €, puis 1 000 € par trimestre. Une solution « compatible » est admise à
condition d'être raccordée à une plateforme agréée.

**L'application aujourd'hui.** Un rappel « réception obligatoire », qui se tait
un mois après le 1er septembre 2026. Aucun fait ne dit qu'une plateforme a été
choisie. Rien sur l'émission. Le plan n'en parle pas — et son lot 44 prévoit
« l'envoi par courriel de la facture », qui ne sera plus un mode de
transmission valable entre professionnels français à cette date.

**Ce que je recommande.** Freel ne doit pas chercher à devenir une plateforme
agréée : c'est une immatriculation auprès de l'administration, hors de portée
d'un outil personnel. Il doit rester le poste de pilotage qui *prépare* la
facture, et la remettre à la plateforme du propriétaire. En trois temps :

1. **Tout de suite** (lot 46) — un fait « ma plateforme agréée » (nom, date),
   qui remplace le rappel par un état ; les mentions manquantes (F2).
2. **Avant le 01/09/2027** (lot 47) — l'export **Factur-X** (un PDF qui
   embarque ses données structurées) à déposer sur la plateforme ; les états
   du cycle de vie (déposée, rejetée, encaissée) à côté de « envoyée » — le
   format exact et les états obligatoires sont à relever dans les
   spécifications de l'administration au début du lot ; et,
   dans l'autre sens, l'**import des factures reçues** : un achat arrive
   structuré — fournisseur, date, montants, TVA — et se range dans Achats sans
   saisie. C'est la réforme qui fait gagner du temps, pour une fois.
3. **Plus tard, si le besoin se confirme** — le raccordement direct à une
   plateforme. Il dépend de celle que le propriétaire choisit (question Q1).

### F2. Les mentions de la facture — faux, à bas bruit

| Mention | Règle | Dans le code |
|---|---|---|
| Franchise de TVA | Depuis le **01/09/2026** : « TVA non applicable, art. L. 223 et s. du code des impositions sur les biens et services (CIBS) ». L'ancienne référence à l'article 293 B du CGI est **tolérée jusqu'au 31/12/2027** | Ancienne mention seule |
| « Entrepreneur individuel » ou « EI » | Accolée au nom et prénom | Pas trouvée |
| Escompte | « Escompte pour paiement anticipé : néant » s'il n'y en a pas | Pas trouvée |
| Numéro du bon de commande | Quand l'acheteur en a établi un | Aucun champ |
| Au 01/09/2027 | SIREN du client, adresse de livraison si différente, nature de l'opération (biens, services, mixte), option pour la TVA sur les débits | SIRET du client présent ; le reste absent |

**Correction du plan.** La liste de sortie écrit que la mention « article
293 B » doit changer « au 01/01/2027 », à livrer avant le 1er janvier. La
fiche officielle dit autre chose : la nouvelle mention s'applique depuis le
1er septembre 2026 et l'ancienne reste admise jusqu'à fin 2027. Il n'y a donc
pas d'urgence au 1er janvier — et il y a déjà un retard de forme. À relire sur
la fiche au moment de coder.

### F3. La mission et le carnet de commandes — incomplet, au cœur

La vision fait de la mission la source de tout. Son modèle porte un client, un
tarif, deux dates, un statut et des rythmes. Il lui manque ce qu'un contrat de
prestation contient :

| Champ | Ce qu'il permet |
|---|---|
| Volume commandé (jours), s'il y en a un | Avancement « 46 / 60 j », reste à produire, dépassement annoncé |
| Fin prévue **et** préavis d'alerte | « La mission se termine dans 45 jours : renouvellement à négocier » |
| Référence de commande | La mention obligatoire de F2, portée sur chaque facture sans ressaisie |
| Intermédiaire (société de portage, agence, plateforme) et sa commission | Le tarif réellement perçu ; qui facturer, qui signe le compte rendu |
| Probabilité d'un prospect (facultative) | Un scénario « si je signe », jamais mêlé au signé |

Et l'indicateur qui en sort, absent aujourd'hui : **le carnet de commandes**.
Le graphe de trésorerie le dit sans le dire — sur la démonstration, la courbe
projetée s'aplatit à partir de septembre, parce que plus aucune entrée n'est
attendue après août. L'information la plus importante de l'écran est une
ligne plate sans légende.

L'écran Missions, lui, liste six missions sans une date, mélange en cours,
prospect, terminée et perdue, et garde le titre « Ton plan de charge ». Le lot
36 prévoit « avancement j / j et filtres » : juste, mais en dessous du besoin.

### F4. Voir venir — le moteur existe, la vue non

`projeterDisponible` calcule déjà douze mois glissants et un **versement
tenable** (« tu peux te verser 1 896 € par mois pendant un an »). C'est
l'indicateur le plus utile de l'application pour un indépendant, et il est
écrit en texte au milieu de l'écran Argent, sous cinq cartes.

Ce qui manque à la vue :

- **L'horizon.** Le graphe du compte s'arrête au 31 décembre de l'année
  choisie. En novembre, cela fait six semaines de visibilité. Le choix venait
  d'une demande juste (le graphe ignorait le sélecteur d'année) ; il répond à
  « que s'est-il passé en 2026 », pas à « que va-t-il se passer ». Ce sont
  deux questions : deux vues.
- **Le point bas.** Le mois où le disponible est le plus faible, et son
  montant. C'est lui qui borne le versement tenable ; il est calculé
  (`moisContraignant`) et seulement cité dans une phrase.
- **Les sorties à leur date.** Les charges sont retenues à l'encaissement
  (c'est la logique du disponible, et elle est juste). Mais le *solde* du
  compte, lui, baisse le jour du prélèvement. Une courbe de solde prévu doit
  poser l'URSSAF, la TVA, l'impôt et la CFE à leurs échéances.
- **Deux « et si »**, sur des faits et non sur des paramètres inventés :
  inclure les prospects ; arrêter une mission à une date. L'ancien
  « projection par scénarios » a été refusé à raison — trois fictions réglées
  par un nombre de semaines de congés. Ceux-ci activent ou coupent des
  missions qui existent.
- **Le franchissement des seuils par le carnet.** La date probable est
  aujourd'hui tirée au rythme linéaire de l'encaissé depuis janvier. Le
  pipeline sait mieux : factures émises à leur échéance, planning au délai de
  paiement. Et il se dit mieux en jours de travail : « il te reste 28 jours
  facturables avant la TVA ».

### F5. Ce que je gagne vraiment — présent en morceaux

Trois chiffres voisins existent sur trois écrans : « Résultat projeté ~33 900 €
après cotisations » (Argent), « Ce qu'il te reste, charges déduites : 288 € par
jour » (Activité), le versable (Pilote). Aucun ne répond à la question qu'un
indépendant se pose le plus : **combien je gagne par mois, net de tout, et
combien de jours me faut-il pour vivre**.

L'inventaire des indicateurs a refusé le « bénéfice net » de l'ancienne
application, à raison : il mélangeait l'abattement fiscal et des charges
réelles. La définition proposée au §5 est une autre grandeur — de l'argent
compté en trésorerie, pas un résultat fiscal — et elle porte un autre nom.

### F6. Les obligations annuelles et les pièces à fournir

- **La déclaration de revenus** (2042-C-PRO). Le dossier de l'URSSAF et celui
  de la TVA existent ; pas celui de mai. Il est dans l'esprit exact de la
  vision : au clic, le montant à reporter, la case, et le contrôle de
  cohérence avec le livre des recettes et les déclarations URSSAF. Les numéros
  de case sont à relever sur le formulaire de l'année, en `hypothese` sinon.
- **Les pièces que le client réclame.** Attestation de vigilance de l'URSSAF
  (à vérifier : contrats d'au moins 5 000 € hors taxes, à renouveler tous les
  six mois), attestation de responsabilité civile professionnelle, avis de
  situation. Le lot 41 prévoit un « coffre des documents » : il ne vaut que si
  chaque pièce porte une **date de validité** et un rappel.
- **Les trimestres de retraite.** En micro, un chiffre d'affaires trop faible
  ne valide pas quatre trimestres. L'indicateur n'existe nulle part ; il
  demande des seuils officiels que je n'ai pas pu confirmer.

### F7. Ne rien rater… quand l'application est fermée

Tous les rappels vivent dans l'application : ils n'existent que si on
l'ouvre. Le plan prévoit un « brief du lundi » (lot 44), qui a le même défaut.
La réponse sobre, sans serveur : **un calendrier à s'abonner** (fichier
`.ics`) — échéances, fins de mission, pièces qui expirent — que le téléphone
rappelle seul.

### F8. Les achats d'un micro en franchise

- **Aucune catégorie** sur une dépense (la maquette en avait dix). Sans elle,
  pas de lecture « où part mon argent », et pas de base pour le comparateur
  micro / déclaration contrôlée du lot 43.
- **L'écran parle de TVA à quelqu'un qui n'en récupère pas.** En franchise, le
  sous-titre (« une dépense sans pièce ne récupère pas sa TVA »), une tuile et
  une colonne sont sans objet. Ce que les achats disent à un micro-BNC, c'est
  le poids de ses frais réels.
- **Une précaution sur ce chiffre.** « Frais réels : 15 % du chiffre
  d'affaires, l'abattement est de 34 % » se lit comme « le micro est
  gagnant ». C'est une indication, pas une comparaison : au réel, les
  cotisations sociales se déduisent aussi et se calculent sur le bénéfice. Le
  vrai comparateur est celui du lot 43 ; l'indicateur doit le dire.

### F9. Ce que je sortirais du plan, et pourquoi

La décision 7 dit « aucune coupe ». Tu as demandé qu'on ne te suive pas quand
ce n'est pas justifié : voici cinq lignes que je ne ferais pas, ou autrement.

| Ligne du plan | Avis | Motif |
|---|---|---|
| Harnais différentiel contre l'ancienne application (lot 45) | **Retirer** | L'ancienne application calculait faux sur des points connus : un écart ne désigne pas une erreur. Le lot 32, sur tes données réelles, apporte la preuve qui compte |
| Synchronisation en temps réel entre appareils (lot 42) | **Réduire** | Un seul utilisateur. Une synchronisation automatique à l'ouverture et au retour au premier plan, plus le retard affiché, couvre le besoin sans canal permanent |
| Actions rapides personnalisables (lot 38) | **Remplacer** | Un catalogue, un « + » et une persistance pour huit boutons d'un seul utilisateur. Mieux : trois actions que l'état du jour appelle (§8.2) |
| Envoi de la facture par courriel (lot 44) | **Refondre** | Voir F1 : valable pour le compte rendu et les clients hors champ, plus pour la facture entre professionnels français |
| Onglet « Compte pro & banque » dans les Outils (lot 43) | **Déplacer** | La banque appartient à la trésorerie, pas aux simulateurs (§8.1) |
| Enveloppes remplies à chaque encaissement, ordre de virement (lot 35) | **Suspendre à Q2** | N'a de sens que si l'argent est réellement mis de côté sur un autre compte |
| Derniers contrôles visuels contre le handoff (lot 30) | **Reporter et redéfinir** | Il validerait des écrans qui vont changer, contre une référence qui ne l'est plus |

---

## 5. Indicateurs et formules proposés

Tous dérivés, jamais stockés ; tous en `Resolution` quand un barème ou une
saisie manque.

| Indicateur | Formule | S'abstient quand |
|---|---|---|
| **Carnet de commandes** (jours, euros) | Σ, sur les missions actives, des journées planifiées de demain à la fin de mission × tarif de leur date | Une mission active sans date de fin : on dit « sans fin fixée » et on ne borne pas |
| **Fin de visibilité** | Dernier jour planifié du carnet | Idem |
| **Couverture d'un mois à venir** | Jours planifiés du mois ÷ jours ouvrés du mois, congés posés retirés | — |
| **Net de poche** (année, mois lissé) | Encaissé hors taxes − cotisations et formation − impôt attribuable à l'activité − CFE − dépenses payées ; le mois lissé = douze mois glissants ÷ 12 | L'impôt n'est pas calculable (parts non saisies) : le net est dit « avant impôt » |
| **Taux de prélèvement** | (Cotisations + formation + impôt + CFE) ÷ encaissé | Idem |
| **Jours nécessaires par mois** | Besoin mensuel ÷ tarif net d'une journée (`tjmNet` existe) | Besoin non saisi |
| **Tarif plancher** | (Besoin annuel + dépenses annuelles) ÷ (jours facturables de l'année × (1 − taux de prélèvement)) | Moins de trois mois d'historique |
| **Versement tenable** *(existe)* | Le plus grand versement mensuel constant qui garde le disponible au-dessus de la réserve sur douze mois | — |
| **Point bas** | Minimum du disponible prévu sur douze mois, et son mois | — |
| **Jours facturables avant un seuil** | (Seuil − encaissé de l'année − encaissements attendus déjà facturés) ÷ tarif moyen du carnet | Carnet vide |
| **Date de franchissement** *(à refaire)* | Premier mois où l'encaissé cumulé + les encaissements attendus du pipeline atteignent le seuil | Moins de 90 jours d'activité et carnet vide |
| **Encours par ancienneté** | Factures non réglées rangées : non échues, 1 à 30 jours de retard, 31 à 60, au-delà | — |
| **Objectif en net** | Chiffre d'affaires nécessaire = net voulu ÷ (1 − taux de prélèvement) + dépenses ; jours nécessaires = ce chiffre ÷ tarif moyen | Taux de prélèvement non calculable |
| **Poids des frais réels** | Dépenses payées ÷ encaissé, lu à côté des 34 % d'abattement, avec la précaution de F8 | Aucune dépense saisie |
| **Trimestres de retraite validés** | Encaissé de l'année contre les seuils officiels | Seuils non relevés : `refuse`, source demandée |
| **Comparaison avec l'an passé** *(lot 44)* | Même période, encaissé et jours facturés | Moins de douze mois d'historique |

---

## 6. La forme — ce qui est réussi

- **Les titres sont des phrases.** « Ton solde n'est pas tout à toi », « Ce
  qu'une journée te rapporte » : on sait pourquoi lire la carte avant de la lire.
- **La confirmation dit la conséquence**, chiffrée, au lieu de « êtes-vous sûr ».
- **Le calendrier à deux créneaux** se lit d'un regard, initiales et couleur
  du client.
- **Les contrastes de texte tiennent** : entre 4,6 et 5,9 pour 1 sur les
  textes secondaires, dans les deux thèmes (seuil courant : 4,5).
- **Chaque graphique a sa table** pour les lecteurs d'écran.

---

## 7. La forme — constats

Chaque constat cite ce qui a été vu sur les captures du 12/11.

**E1. L'accueil ne répond pas aux quatre questions.** Le Pilote montre le
flux du mois en trois colonnes de même poids, la santé, les décisions. Le
chiffre qui commande tout — ce que je peux me verser — est la troisième
colonne. Rien sur les douze mois à venir, rien sur l'activité, les prochaines
échéances seulement si elles sont déjà en alerte. Huit actions rapides sur
deux rangées passent avant tout contenu, alors que le bouton « + Nouveau » de
la barre du haut fait le même travail.

**E2. Des entrées sans montant.** Dans le flux du mois, quatre lignes
« Studio Lumen », « Studio Lumen », « Atelier Novak », « Studio Lumen » avec un
statut, sans montant ni numéro : trois sont indiscernables.

**E3. Deux grandeurs, six noms.** « Disponible », « à toi, hors provisions »,
« À te verser », « Rémunération », « Tu peux te verser », « versable »
désignent deux montants différents (9 997 € et 7 527 €). « Sorties : 1 999 € »
est une provision, pas une sortie. « Ce que tu peux te verser, hors
provisions » se lit dans les deux sens.

**E4. La répétition.** Écran Argent : le disponible apparaît quatre fois
(onglet, tuile, centre du donut, phrase), le solde quatre fois. La page mesure
**3 275 px** à 1440 de large et **4 850 px** sur téléphone — environ six
écrans de défilement. « Tu peux te verser » existe sur trois écrans.

**E5. Les obligations éparpillées.** Frise, échéances reçues et périodes
URSSAF sont trois cartes en bas de la Trésorerie ; les dossiers de TVA et la
déclaration européenne sont trois boutons tout en bas de page ; la CFE est aux
Outils ; le livre des recettes au pied du rail et en Config. Les périodes
URSSAF et les échéances reçues décrivent les mêmes obligations en deux listes.

**E6. La facturation est cachée.** « Factures » est le troisième onglet de
« Activité & congés », dont le libellé est tronqué dans le rail
(« Activité & con… ») et dont le titre de page est « Ton plan de charge ». La
décision 2 du 6/11 l'avait rangée là pour suivre le handoff.

**E7. Des listes de boutons.** Chaque facture occupe environ 120 px et montre
trois à cinq boutons en permanence, dont « Annuler par un avoir » au même
poids que « Enregistrer le règlement ». Treize factures font environ 1 700 px.

**E8. Trop de commandes de période.** Barre du haut : un navigateur de mois
et un sélecteur d'année, sur tous les écrans. S'y ajoutent, dans la page, des
onglets Mois / Trimestre / Année / Tout, et un navigateur de mois propre au
calendrier et à « la facture du mois ». Jusqu'à quatre sur un même écran.

**E9. La barre du haut porte des réglages.** Le choix du thème — qu'on règle
une fois — y occupe une liste déroulante sur chaque écran. Deux boutons ronds
sans libellé (état de la synchronisation, masquage des montants). Sur
téléphone, six commandes au-dessus du contenu.

**E10. Le graphe du compte.** Trois défauts, dont un mesuré :
- sur téléphone, les étiquettes se chevauchent et deviennent illisibles
  (« +4,3 k€3,4 k€2,1 k€ », « PRÉVUPRÉVUPRÉVU ») — vu sur la capture à 390 px ;
- quatre rangées de texte par mois (entrées, sorties, mois, net) : un chiffre
  sur chaque point, donc aucun ne ressort ;
- la courbe change de sens en cours de route : solde réel jusqu'à aujourd'hui,
  « disponible (hypothèse) » ensuite. Deux grandeurs sur un même trait.

**E11. Deux couleurs de charges indiscernables — mesuré.** Chaque charge a sa
couleur partout (URSSAF ambre, TVA bleu, impôt violet, CFE orange) : le
principe est bon. Passée au validateur :

| Thème | Paire la plus proche | Écart en vision normale | Écart en deutéranopie |
|---|---|---|---|
| Sombre | TVA ↔ impôt | 11,1 (plancher : 15) | **0,8** (cible : 8) |
| Clair | TVA ↔ impôt | 12,2 | **2,0** |

Pour un daltonien du rouge-vert — environ un homme sur douze, à des degrés
divers — le bleu de la TVA et le violet de l'impôt se confondent. S'y ajoute une collision de sens :
l'ambre est à la fois l'URSSAF et l'état « en attente », le bleu à la fois la
TVA, le « CA facturé » et un client.

**E12. Le donut.** Trois parts, et la liste des montants à côté : la liste
porte déjà l'information, le donut la redit en moins lisible. Surtout, il ne
sait pas dessiner le cas qui compte — des sommes dues supérieures au solde.
L'historique du projet le sait : la barre avait été préférée pour cette
raison, puis le donut rétabli par fidélité à la maquette.

**E13. Des enveloppes toujours pleines.** Cinq cartes, cinq barres remplies à
100 % : quand tout est couvert — le cas normal — elles occupent près de
380 px pour dire « tout va bien ».

**E14. Les simulateurs.** Des champs larges de 1 150 px pour saisir « 1 » ; le
résultat sous quatre champs ; une troisième carte qui redemande le chiffre
d'affaires. Le compte rendu d'activité, qui est un livrable mensuel, est rangé
parmi les simulateurs.

**E15. Sur téléphone.** Le flux du mois serre trois colonnes dans 390 px, et
**le bouton « Verser sur mon compte » y figure deux fois**. Les pages sont la
version bureau empilée ; rien n'est pensé pour les gestes qu'on fait debout :
pointer un encaissement, photographier un ticket, lire le versable.

**E16. Beaucoup de petit texte.** 161 des 587 tailles de police déclarées
font moins de 12 px (27 %). Le contraste tient ; la taille, moins — surtout
pour les étiquettes en capitales de 10,5 px.

**E17. Des sous-titres qui avertissent au lieu d'orienter.** « Les congés
posés sortent du dénominateur : le même travail sur moins de jours fait monter
l'occupation » est juste, et c'est une note de bas de carte, pas l'intitulé
d'un écran.

---

## 8. Propositions de présentation

Des schémas, pas des maquettes : ils disent la structure. Les maquettes
viennent après ton choix (§10).

### 8.1 La navigation

Aujourd'hui : Pilote · Activité & congés · Argent · Achats · Outils · Config.

Proposé — une entrée par chose qu'on vient faire :

```
  Pilote          les quatre réponses du jour
  Activité        planning · missions et carnet · compte rendu · analyse
  Factures        la facture du mois · à encaisser · historique · clients
  Trésorerie      solde et versable · douze mois · banque et relevé
  Obligations     l'année · à déclarer, à payer, à fournir · les dossiers
  Achats          dépenses et justificatifs
  ─────────────
  Simulateurs     impôt, régime, CFE
  Réglages        profil, barèmes, données, compte, thème
```

- **Factures** sort d'Activité : c'est le geste d'argent le plus fréquent.
  Cela revient sur la décision 2 — elle suivait le handoff, qui ne tranche plus.
- **Obligations** rassemble ce qui est aujourd'hui en cinq endroits (E5).
- **Le compte rendu d'activité** quitte les Outils pour Activité.
- **La banque** (import de relevé, rapprochement) passe sous Trésorerie ;
  Achats garde les dépenses et leurs pièces.
- **« Performance »** disparaît comme pilier d'Argent : l'analyse du chiffre
  d'affaires rejoint Activité › Analyse, le versement reste en Trésorerie.
- **Une seule commande de période par écran**, dans son en-tête, qui dit ce
  qu'elle gouverne. La barre du haut garde la recherche, « + Nouveau » et
  l'état de synchronisation, libellé.

### 8.2 Le Pilote

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tu peux te verser  7 527 €                    [ Verser sur mon compte ]│
│ ██████████████████████████░░░░░░░░▒▒▒▒▒▒                               │
│ à te verser 7 527      réserve 2 470   dû 1 999        solde 11 996 €  │
│ Tenable : 1 896 € par mois jusqu'en mai 2027                           │
├───────────────────────────────┬──────────────────────────────────────┤
│ DOUZE MOIS                    │ ACTIVITÉ                             │
│ courbe du disponible prévu    │ Carnet : 46 jours · 23 900 €         │
│ point bas 9 400 € en février  │ Couvert jusqu'au 28 août             │
│ réserve ─ ─ ─ ─ ─ ─ ─ ─       │ juin ████████░ 98 %   juil ██████░░  │
│                               │ août ███░░░░░    sept ░░░░░░░░       │
├───────────────────────────────┼──────────────────────────────────────┤
│ PROCHAINES ÉCHÉANCES          │ À FAIRE                              │
│ 31 juil.  URSSAF T2   ≈ 1 970 │ ● 1 facture en retard · 1 200 €      │
│ 15 déc.   CFE           148 € │   Studio Lumen, 11 jours  [Relancer] │
│ tout voir ›                   │ ● Clôturer juin : 2 factures à émettre│
└───────────────────────────────┴──────────────────────────────────────┘
```

- Le chiffre qui décide est seul en tête, avec **l'équation du solde** en une
  barre : ce qui est à verser, ce qui est gardé, ce qui est dû. Elle remplace
  le donut et sait montrer un dû qui dépasse le solde.
- Quatre cases, une par mission du cahier des charges (§2.3). Chacune mène à
  son écran.
- « À faire » remplace les actions rapides : ce que l'état du jour appelle,
  avec le montant et le nom du client sur chaque ligne (E2).
- Le flux du mois descend dans Trésorerie, où il a la place de dire ses montants.

### 8.3 Obligations

```
  2026   jan  fév  mar  avr  mai  juin  juil  août  sep  oct  nov  déc
  URSSAF  ●              ●               ◐                ○
  TVA                                                     ○
  Impôt                       ◇                      ○   ○    ○    ○
  CFE                                                               ○
          ● payée   ◐ déclarée, à payer   ○ à venir   ◇ à faire      ▲ auj.

  À TRAITER
  31 juil.  URSSAF · T2 2026   à déclarer   ≈ 1 970 €   [ Ouvrir le dossier ]
  ...
  PIÈCES À FOURNIR
  Attestation de vigilance     valable jusqu'au 14 oct.   [ Renouveler ]
  Responsabilité civile        valable jusqu'au 31 déc.
  Plateforme de facturation    choisie le …               ✓
```

- **Une ligne par nature, une année en largeur.** La frise actuelle ne
  montre que les échéances déjà saisies ; ici chaque obligation a sa ligne,
  qu'elle soit saisie ou seulement prévue (c'est le lot 34).
- **Une seule liste** au lieu de « Échéances reçues » et « Périodes URSSAF » :
  chaque ligne suit son cycle — à déclarer, déclarée le, payée le (le lot 28
  l'a commencé).
- **Chaque ligne ouvre son dossier** : URSSAF, TVA, déclaration européenne,
  CFE, impôt, et la déclaration de revenus de mai.
- **Les symboles doublent la couleur** : l'état ne dépend plus de la teinte (E11).

### 8.4 Trésorerie

- **En tête**, l'équation du solde (la même que le Pilote) et les enveloppes
  en **liste** : une ligne par charge — nom, barre couvert / dû, montant,
  prochaine date. Quand tout est couvert, une seule ligne repliée.
- **Deux graphes au lieu d'un**, alignés sur les mêmes mois :
  1. *Le disponible sur douze mois* — un trait, la réserve en repère, le point
     bas annoté, le futur en pointillé. Par défaut douze mois glissants ; une
     bascule « année 2026 » pour relire le passé.
  2. *Entrées et sorties par mois* — entrées au-dessus de l'axe, sorties en
     dessous, le net en point. Aucun chiffre permanent, sauf sur le mois
     choisi ; le détail au survol et dans la table.
- **Les deux « et si »** (prospects, arrêt d'une mission) en interrupteurs
  au-dessus du premier graphe.
- **Sur téléphone**, six mois visibles et un défilement horizontal, plutôt que
  douze mois écrasés (E10).

### 8.5 Activité

- **Missions** devient une frise : une barre par mission sur les douze mois,
  le réalisé plein, le planifié clair, le prospect hachuré, la fin marquée.
  Dessous, la table : client, tarif, jours faits / commandés, facturé,
  encaissé, fin. Filtres par statut.
- **Clôturer le mois**, un parcours en quatre pas depuis le planning :
  vérifier les journées (les surengagées d'abord) → compte rendu par client →
  factures du mois → dépôt et envoi. Aujourd'hui ces gestes sont sur trois
  écrans.
- **Analyse** regroupe ce qui est sous le calendrier et dans « Performance » :
  chiffre d'affaires cumulé contre l'objectif (une courbe cumulée répond mieux
  à « où j'en suis » qu'un repère mensuel sur des barres), ce que chaque
  mission rapporte, ce qu'une journée rapporte, la dépendance client, le net
  de poche.

### 8.6 Factures

Une table dense — numéro, client, objet, émise, échéance, montant, état —
triée « ce qui attend d'abord ». **Une** action visible par ligne, celle que
l'état appelle (« Enregistrer le règlement », « Relancer », « Émettre ») ; le
reste dans le détail de la ligne. L'avoir n'est plus à un clic de distraction.

### 8.7 Les règles communes

| Règle | Remplace |
|---|---|
| Un montant, une fois par écran ; ailleurs, on y renvoie | E4 |
| Cinq mots pour l'argent, partout : **solde**, **dû**, **disponible**, **réserve**, **à te verser** | E3 |
| Une palette de charges validée au script, et des symboles pour les états | E11 |
| Les couleurs d'état (ambre, rouge) ne servent jamais de série | E11 |
| Un part-de-tout se dit en barre segmentée ; un ratio contre une limite en jauge | E12, E13 |
| Pas de chiffre sur chaque point : l'extrême, le mois choisi, le reste au survol | E10 |
| Un formulaire de calcul : saisie à gauche, résultat à droite, qui suit la frappe | E14 |
| Aucun texte sous 12 px, hors étiquettes d'axe | E16 |
| Le téléphone sert quatre gestes : lire le versable, pointer un encaissement, photographier un achat, corriger une journée | E15 |

---

## 9. Le reste à faire, révisé — proposition

Les numéros de lot existants sont gardés ; les nouveaux prennent la suite
(46 et au-delà), puisqu'un nom de lot ne se réutilise jamais. **L'ordre est
celui du tableau, pas celui des numéros.**

| Ordre | Lot | Contenu | Pourquoi là | Taille |
|---|---|---|---|---|
| 1 | 28 | « Déclarée » datée, « ignorée » au rapprochement | Engagé : schéma 21 écrit, tests à finir | petit |
| 2 | 29 | Enregistrer en brouillon | Ordre imposé, court | petit |
| 3 | 32 | Vérification sur tes données réelles | Avant de bâtir dessus ; attend ton export | moyen |
| 4 | **46** | Facture conforme : mention CIBS, « EI », escompte, référence de commande ; fait « plateforme agréée » ; champs des quatre mentions de 2027 | Faux aujourd'hui, daté | moyen |
| 5 | 33 | « Reste à sortir » : un seul total | Faux : deux totaux pour une notion | petit |
| 6 | — | **Maquettes** de la navigation, du Pilote, d'Obligations, de la Trésorerie et des Missions, à valider | Rien ne se construit dans une structure qui va changer | — |
| 7 | **51** | Nouvelle navigation, une commande de période par écran, thème en Réglages, les cinq mots | Chaque lot suivant se pose à sa place définitive | moyen |
| 8 | **53** + 34 | Écran Obligations : frise aux dates officielles, liste unique à cycle daté, dossiers, déclaration de revenus, pièces à validité (reprend le coffre du lot 41), calendrier à s'abonner | « Ne rien rater » ; solde la seule attente de la vision en ⚠️ | gros |
| 9 | 31 | Mission à plusieurs clients | Décidé le 11/11 et le 12/11 | moyen |
| 10 | **48** | Mission enrichie et carnet de commandes ; frise des missions (reprend l'avancement et les filtres du lot 36) | « Piloter » | moyen |
| 11 | **49** | Trésorerie à douze mois : deux graphes, point bas, sorties à leur date, deux « et si », seuils par le carnet | « Voir venir » | gros |
| 12 | **50** | Ce que je gagne vraiment : net de poche, taux de prélèvement, jours nécessaires, tarif plancher, objectif en net, encours par ancienneté, comparaison avec l'an passé (du lot 44), compositions au clic (du lot 36) | « Piloter » | moyen |
| 13 | **52** | Le Pilote en quatre réponses ; « à faire » à la place des actions rapides (remplace le lot 38) ; remarques automatiques (du lot 36) | Il résume les écrans d'avant : il vient après eux | moyen |
| 14 | **54** | Graphiques : palette validée, équation du solde, enveloppes en liste, lisibilité à 390 px | Laid et, pour certains, illisible | moyen |
| 15 | **55** | Listes et formulaires : factures en table, simulateurs en atelier, clôture du mois | « Aller vite » | moyen |
| 16 | **47** | Facture électronique : export Factur-X, cycle de vie, import des factures reçues | **Avant le 01/09/2027** ; après Q1 | gros |
| 17 | 37 | Lieu par défaut du client ; état d'un compte rendu | Comme prévu | petit |
| 18 | 39 | Catégorie et compte d'une dépense, filtre, import OFX | Élargi à la catégorie (F8) | moyen |
| 19 | 40 | Justificatifs : synchronisation, suppression encadrée, archive annuelle | Comme prévu | moyen |
| 20 | 41 | Réglages de facturation : numérotation, mentions | Le coffre est passé au lot 53 | petit |
| 21 | 42 | Hors ligne, retard affiché, synchronisation automatique à l'ouverture | Sans temps réel (F9) | moyen |
| 22 | 43 | Comparateur micro-BNC / déclaration contrôlée ; poids des frais réels | Sans l'onglet banque (F9) | moyen |
| 23 | 35 | Provisions réellement mises de côté | Selon Q2 | moyen |
| 24 | 44 | Envoi du compte rendu par courriel ; la semaine sur le Pilote | Refondu (F9) | petit |
| 25 | 45 | Raccourcis clavier | Sans le harnais (F9) | petit |
| 26 | 30 | Contrôle visuel final, **contre les maquettes validées**, deux thèmes, quatre largeurs, clavier et lecteur d'écran | En dernier : il valide l'état final | moyen |

**Le compte, honnêtement.** Dix-huit lots restaient ; cette proposition en
compte vingt-six. Elle en ajoute dix (46 à 55), en fond deux dans d'autres
(36, 38) et en allège cinq (41, 42, 43, 44, 45). C'est plus de
travail, dirigé vers ce que tu as dit vouloir. Si tu veux tenir le volume
initial, les candidats à l'abandon sont, dans l'ordre : 45, 44, 35, 42, 37.

**Pour l'exécution.** Chaque lot d'interface part d'une maquette validée, pas
d'une description ; `expert-plan` relit le plan avant, `controleur-visuel` et
`controleur-adherence` après, comme le dépôt le prévoit. `CLAUDE.md` devra
dire que la référence visuelle est désormais la maquette validée du lot, et
non plus les captures du handoff — à écrire au moment où tu valides, pas avant.

---

## 10. Ce qu'il me faut de toi

| | Question | Ce que ta réponse change |
|---|---|---|
| **Q1** | As-tu choisi une plateforme agréée pour recevoir tes factures (obligatoire depuis le 01/09/2026) ? Laquelle ? | Le contenu du lot 47, et s'il faut s'y raccorder |
| **Q2** | Mets-tu réellement tes provisions de côté sur un autre compte ou un sous-compte ? | Le lot 35 : utile si oui, à retirer sinon — et les « enveloppes » se réduisent à la liste de ce qui est dû |
| **Q3** | Factures-tu en direct, ou par une société de portage, une agence, une plateforme ? Tes clients émettent-ils des bons de commande ? | Les champs de la mission (lot 48) et de la facture (lot 46) |
| **Q4** | Que fais-tu de l'application sur ton téléphone, concrètement ? | Les quatre gestes du §8.7 |
| **Q5** | Valides-tu : la nouvelle navigation (§8.1), le retrait des cinq lignes de F9, l'ordre du §9 ? | Tout le reste |

Une fois Q5 tranchée, je dessine les maquettes de l'ordre 6 et je récris
`LISTE-DE-SORTIE.md` en conséquence.

---

## 11. Sources

**Officielles, lues le 12/11/2026.**

- Service public — *Se mettre en conformité avec l'obligation de facturation
  électronique*, fiche F39785, vérifiée le 07/08/2026 : réception au
  01/09/2026 et émission au 01/09/2027 pour les micro-entreprises, franchise
  de TVA comprise ; recours à une plateforme agréée.
  <https://entreprendre.service-public.gouv.fr/vosdroits/F39785>
- Service public — *Facturation*, fiche F23208, vérifiée le 07/08/2026 :
  mentions obligatoires, quatre nouvelles mentions, sanctions, nouvelle
  mention de franchise depuis le 01/09/2026 et tolérance jusqu'au 31/12/2027.
  <https://entreprendre.service-public.gouv.fr/vosdroits/F23208>
- impots.gouv.fr — *Facturation électronique et plateformes agréées* : seule
  une plateforme agréée assure toutes les fonctions de la réforme.
  <https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees>

**Non confirmées sur source officielle** (site de l'URSSAF indisponible le
12/11) — à relever au moment de coder, en `hypothese` d'ici là : seuil et
périodicité de l'attestation de vigilance ; chiffre d'affaires qui valide
quatre trimestres de retraite en micro-BNC (les sites consultés donnent entre
10 800 € et 10 930 € pour 2026, sans s'accorder).

**Mesures.** Palette : validateur de palette, vision normale et daltonisme
simulé, sur les couleurs de `app/src/styles/tokens.css`. Contrastes : rapport
de luminance entre les couleurs de texte et de fond des mêmes jetons. Hauteurs
et chevauchements : captures de l'application du 12/11 (`capturer-app.mjs`,
jeu de démonstration, 1440 et 390 px).
