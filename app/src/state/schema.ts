/**
 * Schéma des FAITS persistés.
 *
 * Seuls les faits sont stockés. Rien de dérivé : ni `dispo`, ni `versable`,
 * ni provisions, ni total de recettes. L'ancienne application stockait des
 * valeurs calculées à côté des faits qui les produisaient, ce qui garantit
 * qu'elles divergent tôt ou tard — c'est l'origine des trois totaux
 * différents pour les mêmes recettes relevés par l'audit.
 *
 * Le numéro de version est obligatoire et sert à la migration. Il ne
 * réutilise PAS le préfixe `freel_v50_` de l'ancienne version, ni la clé
 * `freel_app_version` qui déclenche un `location.reload()` dans le legacy.
 */

import type { DateISO, Euros, Mois, Ratio, TypeActivite } from '../domain/types';
import type { Depense } from '../domain/calculs/depenses';
import type { CaisseRetraite, PeriodeBareme } from '../domain/bareme/urssaf';
import type { ModeReglement } from '../domain/calculs/livreRecettes';
import type { MouvementBancaire } from '../domain/calculs/banque';
import type { PeriodeDeclaree } from '../domain/calculs/declarations.declarees';
import type { AjustementJour, Ajustements, Rythme } from '../domain/calculs/planning';
import type { Echeance } from '../domain/calculs/provisions';
import type { FormuleDelai } from '../domain/calculs/delaiPaiement';
import type { PieceAFournir } from '../domain/calculs/pieces';
import type { PeriodeOptionVl } from '../domain/calculs/optionVl';

/**
 * La dépense est définie par le domaine, pas par le schéma.
 *
 * C'est le sens de la dépendance qui compte : les règles de TVA déductible
 * énoncent ce qu'une dépense doit porter (un identifiant de pièce, pas un
 * booléen ; une provenance, pas une supposition), et le stockage suit. Dans
 * l'autre sens, on stockerait une forme commode dont les règles devraient
 * ensuite s'accommoder.
 */
export type { Depense };
export type { AjustementJour, Ajustements, Rythme };
export type { PieceAFournir };

/*
 * 23 (lot 35) : le motif « impot » d'un mouvement bancaire. Une version
 * antérieure le lirait comme un « sans contrepartie » quelconque et
 * provisionnerait une seconde fois l'impôt déjà viré : elle doit REFUSER
 * ce dossier plutôt que d'en sous-estimer le versable.
 *
 * 24 (lot 31) : la facturation par client — `Mission.facturation` et
 * `Rythme.facturerA`. Une version antérieure les ignorerait et ferait une seule
 * facture au payeur de la mission pour des journées qu'un autre doit payer ;
 * puis, au premier renvoi, les effacerait. Elle doit refuser le dossier.
 *
 * 25 (lot 53) : la déclaration généralisée (`PeriodeDeclaree.nature`,
 * `.periode`), le lien d'un appel URSSAF à sa période (`Echeance.periode`),
 * les faits de TVA (`regimeTva`, `ca3Mensuelle`, `nomExploitant`) et les
 * pièces à fournir. Une version antérieure lirait une période déclarée sans
 * `mois` comme illisible, ou perdrait au premier renvoi les DES déposées, les
 * pièces et les liens — et chaque appel redeviendrait disputé entre deux
 * périodes. Elle doit refuser le dossier.
 *
 * 26 (lot 34-bis) : la caisse de retraite (`Entreprise.caisseRetraite`) et
 * l'histoire de l'option pour le versement libératoire
 * (`Entreprise.historiqueVl`). Une version antérieure calculerait les
 * cotisations d'un affilié Cipav au taux de la SSI, et recalculerait au
 * barème une année passée sous versement libératoire — puis, au premier
 * renvoi, effacerait les deux. Elle doit refuser le dossier.
 *
 * 27 (lot 48) : le carnet de commandes — `Mission.joursCommandes`,
 * `.preavisFinJours`, `.reconduction`, `.probabilite`. Une version antérieure
 * ne compterait pas le volume commandé, n'annoncerait pas une fin au préavis
 * choisi, prendrait l'échéance d'un contrat reconduit pour sa fin — puis, au
 * premier renvoi, effacerait les quatre. Elle doit refuser le dossier.
 *
 * 28 (lot 49, décision 24) : la part gardée au versement se fond dans la
 * réserve — `partGardeeAuVersement` disparaît, `Entreprise.partGardeeRetiree`
 * garde une fois le pourcentage d'avant pour le dire. Une version antérieure
 * relirait un dossier sans part comme « 0 % » et le renverrait avec : un
 * réglage retiré reviendrait d'un autre appareil. Elle doit refuser le dossier.
 */
export const VERSION_SCHEMA = 28 as const;
export const CLE_STOCKAGE = 'freel.faits.v1' as const;
/** Instantané pris avant la première écriture, pour pouvoir revenir en arrière. */
export const CLE_INSTANTANE_AVANT_MIGRATION = 'freel.instantane.avant-migration.v1' as const;
/** Copie de l'état local prise juste avant un remplacement complet — voir `garderInstantane`. */
export const CLE_AVANT_REMPLACEMENT = 'freel.avant-remplacement.v1' as const;

export interface Entreprise {
  readonly nom: string;
  /**
   * Le prénom de la personne, pour la saluer sur le Pilote — rien d'autre.
   *
   * Il ne figure sur aucun document : une facture porte le nom de
   * l'entreprise. Vide tant qu'il n'est pas saisi, et la salutation s'en passe
   * plutôt que de saluer l'entreprise (« Bonjour Atelier de démonstration »).
   * Jamais écrit dans le code : le dépôt est public.
   */
  readonly prenom: string;
  readonly siret: string;
  /** Début d'activité. Détermine notamment la période d'ACRE. */
  readonly debutActivite: DateISO | null;
  readonly typeActivite: TypeActivite;
  /**
   * La caisse de retraite (schéma 26). Sans objet hors BNC : voir
   * `baremeDeLaCaisse`. Défaut `ssi`, la caisse de droit commun — c'est aussi
   * ce que valait tout dossier d'avant, et l'ancienne application ne la
   * portait pas.
   */
  readonly caisseRetraite: CaisseRetraite;
  readonly acre: boolean;
  /**
   * Régime d'imposition. Discriminant EXCLUSIF (voir bareme/impot).
   *
   * La DERNIÈRE option choisie : celle qui vaut après la dernière période de
   * `historiqueVl` — au 1er janvier prochain, peut-être. Aucun calcul ne la lit
   * directement : ils passent par `vlAu`, qui dit l'option d'un mois.
   */
  readonly versementLiberatoire: boolean;
  /**
   * Ce que valait l'option AVANT (schéma 26) : des périodes closes, triées,
   * sans chevauchement. Vide, l'option du jour vaut depuis toujours — ce que
   * disait tout dossier d'avant. Voir `calculs/optionVl`.
   */
  readonly historiqueVl: readonly PeriodeOptionVl[];
  /** Mois d'assujettissement à la TVA, `null` si en franchise. */
  readonly tvaDepuis: Mois | null;
  readonly tvaIntracom: string;
  readonly iban: string;
  readonly bic: string;
  readonly adresse: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly codeApe: string;
  readonly email: string;
  readonly telephone: string;
  readonly urssafPeriodicite: 'mensuel' | 'trimestriel';
  readonly onboardingFait: boolean;
  /**
   * La plateforme agréée choisie pour RECEVOIR les factures électroniques
   * (obligatoire pour toute entreprise depuis le 01/09/2026), et depuis quand
   * (schéma 22). `null` : non renseignée.
   *
   * Un fait, et non une case « c'est fait » : le rappel « réception
   * obligatoire » était un compte à rebours qui ne savait jamais si l'on était
   * prêt — il disait « en vigueur » un mois, puis se taisait, prêt ou pas.
   * Le nom est saisi par l'utilisateur, jamais proposé par le code : aucune
   * plateforme n'a à figurer dans un dépôt public.
   */
  readonly plateformeAgreee: { readonly nom: string; readonly depuis: DateISO | null } | null;
  /**
   * Option pour le paiement de la TVA d'après les débits (schéma 22).
   *
   * Un prestataire de services acquitte la TVA à l'encaissement, sauf option.
   * L'option change l'exigibilité, et elle se porte sur la facture : c'est
   * l'une des quatre mentions ajoutées par la réforme de la facturation
   * électronique. Sans objet en franchise en base.
   */
  readonly optionTvaDebits: boolean;
  /**
   * Le régime de TVA d'un redevable (schéma 25) : `simplifie` — une CA12
   * annuelle et deux acomptes — ou `reel_normal` — des CA3. Sans objet en
   * franchise en base.
   *
   * Un FAIT, parce que rien ne le déduit : le réel normal se choisit sur
   * option, et le simplifié est le régime de droit commun d'un micro-
   * entrepreneur qui devient redevable. Défaut `simplifie` pour cette raison.
   * Le régime simplifié est supprimé au 01/01/2027 (loi 2025-127, art. 38 ;
   * annonce DGFiP du 22/09/2026, relevée le 17/11/2026 :
   * https://www.impots.gouv.fr/actualite/le-regime-simplifie-dimposition-la-tva-est-supprime-compter-du-1er-janvier-2027) :
   * le fait garde ce qui valait avant, la règle datée dira ce qui vaut après.
   */
  readonly regimeTva: 'simplifie' | 'reel_normal';
  /**
   * L'option pour une CA3 MENSUELLE au réel normal (schéma 25). Sans option,
   * la CA3 est trimestrielle à partir de 2027 pour qui ne dépasse pas
   * 1 000 000 € (CGI 287, version au 01/01/2027 ; même page de la DGFiP) :
   * `false` par défaut, ce qui ne change rien tant qu'aucune option n'a été
   * prise.
   */
  readonly ca3Mensuelle: boolean;
  /**
   * Le nom de famille de l'exploitant, pour son INITIALE (schéma 25) : le jour
   * de dépôt d'une CA3 d'entreprise individuelle en dépend (CIBS A161-29 —
   * A à H, ou I à Z ; relevé le 17/11/2026 :
   * https://www.legifrance.gouv.fr/codes/id/LEGISCTA000049803706/).
   *
   * Vide par défaut, et il le reste tant qu'il n'est pas saisi : on le
   * demande, on ne le devine pas. Le nom de l'entreprise est souvent une
   * enseigne (« Atelier … ») dont l'initiale n'a rien à voir, et le prénom
   * n'est pas le nom. Jamais écrit dans le code : le dépôt est public.
   */
  readonly nomExploitant: string;
  /**
   * La part gardée à chaque versement que portait le dossier avant le schéma
   * 28, en pourcentage — `null` quand il n'y en avait pas, ou qu'elle a été
   * dite (décision 24).
   *
   * Un pourcentage du versable n'a pas d'équivalent en euros de réserve : il
   * valait 10 % de 7 527 € un jour, 10 % de 300 € le mois suivant. La
   * migration ne le convertit donc pas — elle le garde pour le DIRE une fois,
   * avec la réserve à relever pour qui gardait plus. Sans ce fait, « à te
   * verser » monterait de 10 % au premier chargement, sans un mot.
   */
  readonly partGardeeRetiree: number | null;
}

export interface Client {
  readonly id: string;
  readonly nom: string;
  readonly adresse: string;
  readonly siret: string;
  readonly email: string;
  /**
   * Les conditions de paiement habituelles de ce client.
   *
   * Une FORMULE et non un nombre de jours : « 30 jours fin de mois » ne
   * s'exprime pas en jours, et c'est pourtant la formule la plus répandue.
   * Voir `calculs/delaiPaiement`.
   *
   * Ce n'est qu'une valeur PROPOSÉE au moment de créer une facture. L'échéance
   * réelle se fige dans la recette, parce qu'elle est imprimée sur le document
   * envoyé — changer ceci ne réécrit pas le passé.
   */
  readonly delaiPaiement: FormuleDelai;
  /**
   * Code pays ISO à deux lettres. Vide ou `FR` pour un client français.
   *
   * Commande l'obligation de déclaration européenne de services : une
   * prestation vendue à un assujetti d'un autre État membre est déclarable
   * dès le premier euro, franchise en base comprise.
   */
  readonly pays: string;
  /** Numéro de TVA intracommunautaire du client. Obligatoire sur la DES. */
  readonly tvaIntracom: string;
}

export interface Mission {
  readonly id: string;
  readonly clientId: string | null;
  /** Conservé tel quel quand le client n'a pas pu être rattaché par identifiant. */
  readonly clientNom: string;
  readonly description: string;
  readonly tjm: Euros;
  readonly debut: DateISO | null;
  readonly fin: DateISO | null;
  /**
   * `perdue` existe parce que l'ancienne application l'employait : une
   * mission perdue n'est ni active — son chiffre d'affaires prévisionnel ne
   * compte plus — ni terminée, puisqu'elle n'a rien produit.
   */
  readonly statut: 'active' | 'terminee' | 'prospect' | 'perdue';
  /**
   * Les clients opérationnels de la mission.
   *
   * ───────────────────────────────────────────────────────────────────────
   * QUI FACTURE N'EST PAS QUI OCCUPE LES JOURNÉES
   * ───────────────────────────────────────────────────────────────────────
   *
   * Une mission passée par une agence a DEUX clients de nature différente :
   * celui qui paie — `clientId`, l'agence, qui reçoit la facture — et ceux
   * chez qui on travaille réellement. « Mission via Scalian » peut couvrir
   * deux donneurs d'ordre finaux, chacun avec son rythme et son contact.
   *
   * Les confondre a une conséquence concrète : le CRA se remet au client
   * opérationnel, qui le signe. Un CRA qui mélange deux d'entre eux expose à
   * l'un le volume consacré à l'autre, et ne se fait signer par personne.
   *
   * ───────────────────────────────────────────────────────────────────────
   * IL Y EN A TOUJOURS AU MOINS UN
   * ───────────────────────────────────────────────────────────────────────
   *
   * Le cas courant — un seul client, qui paie et qui occupe — n'est pas une
   * exception mais le cas à une entrée. La liste ne peut donc pas être vide,
   * et l'interface ne montre le concept que lorsqu'il y en a plusieurs :
   * personne n'a à apprendre le mot « client opérationnel » pour saisir une
   * mission ordinaire.
   *
   * C'est ce qui évite la duplication de l'ancienne application, qui portait
   * un rythme sur la mission ET un rythme par entité, plus une table
   * `entiteByDay` pour arbitrer entre les deux. Trois sources pour une même
   * journée finissent toujours par se contredire.
   */
  readonly entites: readonly ClientOperationnel[];
  /**
   * Les conditions de paiement de CETTE mission, ou `null` pour celles du
   * client.
   *
   * Une mission passée par une agence et une vente directe au même nom n'ont
   * pas les mêmes conditions. Le délai du client reste le défaut ; celui-ci le
   * remplace quand il est renseigné.
   *
   * Facultatif comme les autres champs arrivés par migration : une mission
   * d'avant le schéma 13 n'en porte pas, et le comblement se fait à la lecture
   * plutôt qu'en réécrivant quarante jeux d'essai.
   */
  readonly delaiPaiement?: FormuleDelai | null;
  /**
   * La référence de commande du client — bon de commande, numéro d'achat
   * (schéma 22). Mention obligatoire quand le client en émet une : une facture
   * sans elle part souvent en rejet chez les services comptables des grands
   * comptes et des sociétés de portage, et le paiement attend. Reprise sur
   * chaque facture de la mission. Facultative, comme `delaiPaiement`.
   */
  readonly referenceCommande?: string | null;
  /**
   * Comment la mission se facture quand elle a plusieurs clients
   * opérationnels (schéma 24, décision 14).
   *
   * `commune` : une facture au payeur de la mission, une ligne par client
   * opérationnel — le cas de l'agence, qui reçoit tout. `par_client` : chaque
   * journée part au payeur de la plage qui la couvre (`Rythme.facturerA`), et
   * chaque client opérationnel a son brouillon.
   *
   * Absent vaut `commune`, et c'est voulu : c'est ce que l'application faisait
   * jusqu'ici. Un défaut à `par_client` couperait en deux, sans qu'un geste ait
   * été fait, la facture d'une agence qui en attend une.
   */
  readonly facturation?: 'commune' | 'par_client';
  /**
   * Le volume du bon de commande, en jours — demi-journées permises
   * (schéma 27). `null` : aucun volume n'est commandé, la mission court au
   * rythme du planning.
   *
   * Un FAIT, et non le total du planning : « 60 jours commandés » est ce que
   * le client a signé, le planning ce qu'on a prévu d'en faire. Les confondre
   * ferait disparaître l'écart qui compte — vingt jours commandés que plus
   * aucune semaine ne porte, et qu'on découvre à la fin de la mission.
   */
  readonly joursCommandes?: number | null;
  /**
   * Combien de jours avant la fin l'annoncer (schéma 27) ; `null` pour le
   * défaut, `PREAVIS_FIN_PAR_DEFAUT_JOURS` (`calculs/carnetDeCommandes`).
   * `null` et non 60 écrit sur chaque mission : changer le défaut un jour ne
   * doit pas demander de réécrire des dossiers.
   */
  readonly preavisFinJours?: number | null;
  /**
   * La reconduction tacite, par périodes de `dureeMois` (schéma 27). `fin`
   * reste l'échéance de la période EN COURS ; les suivantes se dérivent à la
   * lecture, jamais écrites — une échéance recopiée chaque trimestre finirait
   * par contredire celle d'où elle part.
   */
  readonly reconduction?: { readonly dureeMois: number } | null;
  /**
   * La probabilité d'un PROSPECT, de 0 à 100, facultative (schéma 27). Elle se
   * lit à côté de la mission et n'entre dans aucun total : un carnet pondéré
   * par des pourcentages saisis au jugé se lirait comme un carnet signé.
   */
  readonly probabilite?: number | null;
}

/**
 * Un client opérationnel : là où les journées se passent.
 *
 * Il porte son propre RYTHME, et ses propres AJUSTEMENTS. C'est ce qui permet
 * « lundi-mardi chez l'un, mercredi-jeudi chez l'autre » sans avoir à décider,
 * jour par jour, à qui appartient la journée : chacun a les siens.
 */
export interface ClientOperationnel {
  readonly id: string;
  readonly nom: string;
  /**
   * Teinte du planning, en hexadécimal.
   *
   * Elle ne sert qu'à distinguer deux entités d'un coup d'œil dans la grille.
   * Vide, l'interface en attribue une par rang — une couleur oubliée à la
   * saisie ne doit pas produire deux blocs identiques.
   */
  readonly couleur: string;
  readonly adresse: string;
  readonly contact: string;
  readonly email: string;
  readonly telephone: string;
  /**
   * Le rythme de travail, par plages de dates.
   *
   * C'est LE fait qui remplit le planning : « lundi à jeudi pleins, vendredi
   * à mi-temps ». On le déclare une fois, le planning se remplit tout seul,
   * et on ne corrige ensuite que ce qui s'est passé autrement.
   *
   * Plusieurs plages parce qu'un rythme change en cours de mission — passer
   * à quatre jours en septembre ne doit pas réécrire l'été.
   */
  readonly rythmes: readonly Rythme[];
  /**
   * Ce qui a réellement été travaillé, quand cela diffère du rythme.
   *
   * Une table date → quotité. Un ajustement l'emporte TOUJOURS sur le rythme,
   * y compris à zéro : sans cela, effacer une journée serait impossible, le
   * rythme la remettrait à chaque calcul, et le CRA facturerait un jour qui
   * n'a pas eu lieu.
   */
  readonly ajustements: Ajustements;
}

/**
 * Une recette, au sens du livre des recettes.
 *
 * `encaisseeLe` et `modeReglement` sont OBLIGATOIRES au passage en encaissé :
 * ce sont des mentions du livre des recettes, et l'ancienne application ne
 * les portait pas — ce qui rendait son registre non conforme.
 */
export interface Recette {
  readonly id: string;
  readonly clientNom: string;
  readonly libelle: string;
  readonly montant: Euros;
  readonly emiseLe: DateISO | null;
  readonly encaisseeLe: DateISO | null;
  readonly modeReglement: ModeReglement | null;
  readonly numero: string;
  /**
   * Identifiant de l'écriture que celle-ci annule.
   *
   * Le livre des recettes se tient en AJOUT SEUL : une recette encaissée ne se
   * modifie pas et ne se supprime pas, elle s'annule par une écriture inverse
   * qui laisse la trace de la correction. Un registre qu'on peut réécrire ne
   * prouve rien — et c'est précisément ce qu'un contrôle vérifie.
   */
  readonly annuleEcriture?: string | null;
  /**
   * Date à laquelle la facture a été ENVOYÉE au client.
   *
   * ───────────────────────────────────────────────────────────────────────
   * ÉMISE N'EST PAS ENVOYÉE
   * ───────────────────────────────────────────────────────────────────────
   *
   * Le document peut exister, porter son numéro et sa date, et dormir dans un
   * dossier. C'est même le cas le plus fréquent en fin de mois : on établit
   * les factures d'un coup, on les envoie ensuite.
   *
   * Les confondre coûte deux choses. On relance un client qui n'a jamais reçu
   * la facture — la pire des relances. Et on ne sait pas répondre à « je ne
   * l'ai jamais reçue », qui est la réponse la plus courante à une relance.
   *
   * `null` tant qu'elle n'est pas partie. Une DATE et non un booléen, pour la
   * même raison que partout ailleurs ici : un statut qu'aucune date ne prouve
   * ne prouve rien.
   */
  readonly envoyeeLe?: DateISO | null;
  /**
   * TVA portée par le document, en euros.
   *
   * ───────────────────────────────────────────────────────────────────────
   * UN FAIT DU DOCUMENT, PAS UNE DÉRIVATION
   * ───────────────────────────────────────────────────────────────────────
   *
   * `montant` est le HT — l'assiette du chiffre d'affaires en micro, celle que
   * l'URSSAF réclame. La TVA était calculée à l'émission puis JETÉE, et elle
   * ne se recalcule pas : les lignes de la facture ne sont pas conservées, et
   * une facture peut porter plusieurs taux — 20 %, 10 %, 5,5 %.
   *
   * La supposer à 20 % pour remplir une déclaration serait exactement le
   * chiffre faux qu'on ne veut pas voir partir sur un formulaire officiel.
   *
   * `null` a deux sens qui ne se confondent pas et que le dossier de
   * déclaration distingue : une facture émise EN FRANCHISE ne porte pas de TVA
   * — c'est zéro, et c'est juste ; une facture d'avant le schéma 9 en portait
   * peut-être une, et on ne la connaît pas. La seconde doit être signalée, pas
   * comptée pour zéro.
   */
  readonly tvaCollectee?: Euros | null;
  /** Recette globalisée en fin de journée, sans identité de client. */
  readonly globalisee?: boolean;
  /**
   * La référence de commande imprimée sur CETTE facture (schéma 22).
   *
   * Figée à l'émission, comme l'échéance : corriger la référence de la mission
   * ne doit pas réécrire un document que le client a déjà reçu. Facultative :
   * une facture d'avant le schéma 22 n'en portait pas.
   */
  readonly referenceCommande?: string | null;
  /**
   * Les dates auxquelles cette facture a été relancée.
   *
   * ───────────────────────────────────────────────────────────────────────
   * UNE LISTE, PAS UN COMPTEUR NI UN BOOLÉEN
   * ───────────────────────────────────────────────────────────────────────
   *
   * « Je l'ai relancé quand ? » et « combien de fois ? » sont deux questions,
   * et la première est celle qu'on se pose au téléphone. Un compteur répond à
   * la seconde et perd la première ; un booléen perd les deux.
   *
   * Les dates commandent aussi le TON : le premier message est un rappel, le
   * deuxième est ferme, le troisième une mise en demeure. Sans la trace, on
   * réécrit indéfiniment le même rappel courtois — ou on met en demeure
   * quelqu'un qu'on n'a jamais prévenu.
   */
  readonly relancesLe?: readonly DateISO[];
  /**
   * La date à laquelle la facture est due — celle IMPRIMÉE sur le document.
   *
   * ───────────────────────────────────────────────────────────────────────
   * UN FAIT, PAS UNE DÉRIVÉE
   * ───────────────────────────────────────────────────────────────────────
   *
   * Elle se calculait à la lecture, en ajoutant le délai du client à la date
   * d'émission. Changer les conditions d'un client réécrivait donc
   * rétroactivement l'échéance de toutes ses factures déjà parties : « cette
   * facture était-elle en retard ? » changeait de réponse, et le compteur de
   * retards avec.
   *
   * Or le client, lui, a un papier avec une date dessus. C'est cette date-là
   * qui fait foi, et elle ne bouge plus une fois la facture émise.
   *
   * `null` sur une facture sans date d'émission : rien n'est encore dû.
   */
  readonly echeanceLe?: DateISO | null;
  /**
   * Identifiant du justificatif conservé pour cette recette, ou `null` s'il
   * manque. `undefined` sur une recette d'avant le schéma 16 — voir
   * `recettesDuSchema15` dans `schema.migrations.ts`, qui le comble à `null`.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * UNE FACTURE ÉMISE ICI N'EN A PAS BESOIN — UNE FACTURE VENUE D'AILLEURS, SI
   * ─────────────────────────────────────────────────────────────────────────
   *
   * Une facture établie PAR l'application se reconstruit entièrement depuis
   * les faits — mission, client, montant, numéro — et n'a besoin d'aucun
   * fichier pour exister. Ce champ sert aux factures établies AILLEURS (devis
   * réglé de la main à la main, export d'un autre outil) et à celles reprises
   * de l'ancienne version, qui n'existaient dans son registre que par un
   * booléen `piece: true` sans aucune valeur probante. Comme
   * `Depense.justificatifId` : un identifiant de fichier réellement conservé,
   * jamais un booléen qui ne permettrait pas de retrouver la pièce.
   */
  readonly justificatifId?: string | null;
  /**
   * Les lignes du document émis, telles que le client les a reçues.
   *
   * ───────────────────────────────────────────────────────────────────────
   * LE DÉTAIL D'UNE FACTURE NE SE RECONSTRUIT PAS
   * ───────────────────────────────────────────────────────────────────────
   *
   * Jusqu'au schéma 19, une facture émise ne gardait que son total HT, sa TVA
   * et ses désignations mises bout à bout. « Revoir la facture » la rétablissait
   * en une seule ligne au prix du total — un document qui porte le numéro de
   * l'original sans lui ressembler —, et la refusait quand elle mêlait deux
   * taux de TVA. Diviser le total par les jours pour retrouver « 18 j × 430 € »
   * donne un prix arrondi dont le produit ne retombe pas sur le total : le
   * détail ne se devine pas, il se garde.
   *
   * `null` quand il n'est pas conservé : une facture d'avant le schéma 20, une
   * recette saisie sans document, une écriture d'annulation. `null` n'est pas
   * une liste vide — une facture a au moins une ligne.
   */
  readonly lignes?: readonly LigneConservee[] | null;
}

/** Une ligne de facture conservée : ce que le document imprimait. */
export interface LigneConservee {
  readonly designation: string;
  readonly quantite: number;
  readonly prixUnitaireHt: Euros;
  readonly tauxTva: Ratio;
}

/**
 * Un jour de congé, avec sa quotité.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DEMI-JOURNÉE N'EST PAS UN RAFFINEMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application la gère depuis longtemps — un congé y est écrit
 * `'2026-08-14'` ou `'2026-08-14_half'`. La première version de ce schéma ne
 * portait qu'une liste de dates : elle comptait donc une demi-journée comme
 * une journée entière, gonflant le solde de congés et faussant l'occupation
 * du mois dans le même mouvement.
 */
/**
 * La phrase de tâches accomplies d'une semaine, sur un compte rendu d'activité.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE SEUL FAIT DU CRA QUI SE SAISISSE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Tout le reste du document se DÉRIVE du planning : les jours, leur
 * répartition entre télétravail et présence sur site, les totaux. « Ce que
 * j'ai fait cette semaine-là » ne se déduit d'aucun fait enregistré — ni du
 * rythme, ni de la description de la mission, qui vaut pour toute sa durée.
 * Ne pas l'enregistrer obligerait à le retaper à chaque réédition, ce qui est
 * exactement la ressaisie que ce générateur existe pour supprimer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA CLÉ EST LE LUNDI, PAS LE RANG DE LA SEMAINE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Semaine 2 » se déplace : elle dépend du mois, et du jour où celui-ci
 * commence. Un lundi en date ISO ne bouge pas, et la note reste attachée à la
 * semaine qu'elle décrit même si le découpage du document change.
 */
export interface NoteCra {
  /** Le lundi de la semaine décrite, en date ISO. */
  readonly semaine: DateISO;
  /**
   * Le client destinataire, ou la chaîne vide pour le document tous clients.
   *
   * Le NOM et non l'identifiant du client opérationnel : c'est le nom qui est
   * imprimé sur le document, et deux entités homonymes rendent de toute façon
   * une seule ligne dans la synthèse. Renommer un client détache ses notes —
   * elles ne sont pas perdues, elles cessent d'être proposées, et c'est
   * préférable à les voir réapparaître sous un nom qui n'est plus le leur.
   */
  readonly destinataire: string;
  readonly texte: string;
}

export interface Conge {
  readonly date: DateISO;
  /** 1 pour une journée, 0,5 pour une demi-journée. */
  readonly quotite: number;
}

export interface Faits {
  readonly version: typeof VERSION_SCHEMA;
  readonly entreprise: Entreprise;
  readonly clients: readonly Client[];
  readonly missions: readonly Mission[];
  readonly recettes: readonly Recette[];
  readonly depenses: readonly Depense[];
  /**
   * Jours posés en congé, en dates pleines.
   *
   * L'ancienne application les stockait par mois (`{ '2025-08': [1, 2, 3] }`),
   * ce qui obligeait à reconstruire une date à chaque lecture et rendait
   * impossible une plage à cheval sur deux mois. Une liste de dates se trie,
   * se compare et se déduplique sans conversion.
   */
  readonly conges: readonly Conge[];
  /**
   * Les phrases de tâches accomplies des comptes rendus d'activité.
   *
   * Une liste plate plutôt qu'un dictionnaire imbriqué par mois puis par
   * client : c'est ce qui permet de la filtrer, de la trier et de la
   * dédupliquer sans conversion — le même arbitrage que pour `conges`, dont
   * l'ancienne application faisait un `{ '2025-08': [1, 2, 3] }` qu'il fallait
   * reconstruire à chaque lecture.
   */
  readonly notesCra: readonly NoteCra[];
  /**
   * Les opérations du compte, importées depuis un relevé.
   *
   * `banqueReliee` a disparu du schéma quand ce champ est apparu : il était
   * devenu DÉRIVABLE — un relevé est disponible si et seulement s'il y a des
   * mouvements. Le conserver aurait enfreint l'invariant « aucune valeur
   * dérivée n'est stockée », et ouvert la possibilité qu'un booléen à `true`
   * coexiste avec une liste vide.
   */
  readonly mouvementsBancaires: readonly MouvementBancaire[];
  /**
   * Périodes de barème URSSAF saisies par l'utilisateur.
   *
   * Elles s'ajoutent à celles livrées avec le code, sans les remplacer : les
   * taux officiels changent et l'application ne peut pas être redéployée à
   * chaque publication. Sans cette porte d'entrée, un taux périmé resterait
   * appliqué indéfiniment — ou l'alerte de fraîcheur bloquerait les
   * déclarations sans que personne puisse la lever.
   */
  readonly periodesUrssafAjoutees: readonly PeriodeBareme[];
  readonly soldeInitial: Euros;
  /**
   * La date à laquelle `soldeInitial` était vrai, ou `null` tant qu'elle n'est
   * pas connue.
   *
   * ───────────────────────────────────────────────────────────────────────
   * UN SOLDE SANS DATE NE SE COMBINE PAS AUX FAITS
   * ───────────────────────────────────────────────────────────────────────
   *
   * `soldeInitial` a longtemps été traité comme un point de départ auquel les
   * faits enregistrés depuis (recettes encaissées, dépenses payées, échéances
   * réglées) pouvaient s'ajouter sans risque. C'était faux dès que l'écran
   * Config le décrivait comme « le solde du compte aujourd'hui » : ce montant
   * contient DÉJÀ tous les encaissements et paiements passés. Y rajouter une
   * recette encaissée hier compte le même euro deux fois — dans le sens le
   * plus dangereux, un solde plus haut qu'il ne l'est réellement.
   *
   * Une date résout l'ambiguïté : seuls les faits postérieurs à elle sont
   * ajoutés (voir `domain/calculs/solde.ts`). Sans date, l'application ne
   * peut pas savoir ce qui est déjà dans le montant saisi et s'abstient donc
   * de dériver quoi que ce soit — voir `ProvenanceSolde['sansDate']`.
   *
   * `null` par défaut, y compris pour tout compte migré depuis un schéma
   * antérieur : personne n'a jamais dit à quelle date son solde était vrai,
   * et l'inventer serait fabriquer une date qui n'a pas été vérifiée.
   */
  readonly soldeInitialAu: DateISO | null;
  /**
   * Matelas de sécurité, montant absolu. Source unique (D4).
   *
   * Le fait garde son nom ; l'écran, lui, l'appelle « réserve » depuis le
   * lot 51 (« seuil de sécurité » avant), comme la direction visuelle. Renommer le champ aurait obligé à une migration pour un
   * gain nul — et aurait fait passer le vocabulaire de l'interface dans le
   * stockage, où il n'a rien à faire.
   *
   * Depuis le schéma 28, elle porte seule la prudence : la part gardée à
   * chaque versement s'y est fondue (décision 24). Deux réglages faisaient
   * deux « à te verser » sous le même nom, qui ne tombaient d'accord qu'à 0 %.
   */
  readonly reserve: Euros;
  readonly besoinMensuel: Euros;
  /**
   * L'objectif de chiffre d'affaires encaissé sur l'année civile, ou `null`.
   *
   * ───────────────────────────────────────────────────────────────────────
   * POURQUOI `null` ET NON ZÉRO
   * ───────────────────────────────────────────────────────────────────────
   *
   * « Je ne me suis pas fixé d'objectif » et « mon objectif est de zéro euro »
   * sont deux états différents, et l'écran ne doit pas les confondre : le
   * premier n'affiche rien, le second afficherait un objectif atteint à
   * l'infini dès le premier euro. Zéro comme valeur par défaut aurait aussi
   * fait diviser par zéro tout ce qui rapporte le réalisé à l'objectif.
   *
   * ───────────────────────────────────────────────────────────────────────
   * SUR L'ENCAISSÉ
   * ───────────────────────────────────────────────────────────────────────
   *
   * Le reste de l'application compte en encaissé — plafonds, TVA, impôt,
   * cotisations. Poser l'objectif sur le facturé aurait fabriqué un troisième
   * référentiel, et un objectif « atteint » que le compte n'aurait jamais vu
   * passer.
   */
  readonly objectifCaAnnuel: Euros | null;
  /**
   * Les mois dont la déclaration a été faite, chacun avec sa date (schéma 21 ;
   * une liste de mois nus jusque-là). Opère la bascule entre volets de
   * provisions. Voir `PeriodeDeclaree` pour ce que vaut une date `null`.
   */
  readonly periodesDeclarees: readonly PeriodeDeclaree[];
  /**
   * Les échéances émises : appels de cotisations, avis d'impôt, CFE.
   *
   * ───────────────────────────────────────────────────────────────────────
   * CE FAIT MANQUAIT, ET SON ABSENCE FAUSSAIT TOUT VERS LE HAUT
   * ───────────────────────────────────────────────────────────────────────
   *
   * Les provisions se tiennent en deux volets (D3). Le premier — ce que
   * l'URSSAF ou le fisc ont DÉJÀ appelé — se calculait sur une liste vide,
   * parce qu'aucun écran ne pouvait en créer une. Il valait donc zéro en
   * permanence, et le flux du mois n'avait aucune sortie.
   *
   * L'erreur allait dans le sens dangereux : moins de provisions, donc plus
   * de disponible, donc plus de versable. L'application invitait à se verser
   * de l'argent qui était déjà dû.
   *
   * Une échéance est un FAIT, pas une projection : elle existe parce qu'un
   * appel est arrivé. C'est ce qui la distingue du volet 2, qui estime une
   * dette pas encore appelée.
   */
  readonly echeances: readonly Echeance[];
  /** Conservé brut : la structure de l'ancienne configuration d'IR est reprise sans interprétation. */
  readonly configImpotBrute: Readonly<Record<string, unknown>>;
  /**
   * Nombre de parts du quotient familial, ou `null` tant que rien n'est saisi.
   *
   * ───────────────────────────────────────────────────────────────────────
   * `null` N'EST PAS 1, ET NE LE DEVIENDRA PAS
   * ───────────────────────────────────────────────────────────────────────
   *
   * « Je n'ai pas renseigné mes parts » et « je suis seul, donc une part »
   * sont deux états différents. Poser 1 par défaut ferait afficher une
   * provision d'impôt d'apparence complète à quelqu'un qui a trois parts —
   * et le barème progressif appliqué à un quotient trois fois trop petit
   * surestime l'impôt du simple au double. Le second état se DÉCLARE ; le
   * premier fait refuser le calcul, ce qui est visible.
   */
  readonly partsFiscales: number | null;
  /**
   * Revenus imposables du foyer HORS micro-entreprise, pour l'année.
   *
   * Ils déterminent la tranche marginale dans laquelle le résultat du micro
   * vient s'empiler. Les ignorer sous-estime l'impôt — le sens dangereux.
   * `null` quand rien n'est saisi : le calcul retient alors zéro, mais le
   * DIT, au lieu de présenter le résultat comme complet.
   */
  readonly autresRevenusFoyer: Euros | null;
  /** Versements sur un plan d'épargne retraite, déductibles du revenu global. */
  readonly versementPerDeductible: Euros | null;
  /**
   * Marié ou pacsé, soumis à imposition commune (`true`), seul (`false`), ou
   * `null` tant que rien n'est saisi.
   *
   * Il ne fixe qu'une chose : le plafond de la décote. Les parts ne le disent
   * pas — un parent isolé en a deux, comme un couple sans enfant — et le
   * deviner ferait appliquer la décote d'un couple à qui n'en est pas un.
   */
  readonly impositionCommune: boolean | null;
  /**
   * Les pièces que les clients demandent : attestation de vigilance,
   * assurance, avis SIRENE (schéma 25). Leur état — à jour, à renouveler —
   * se dérive des dates, jamais stocké. Voir `PieceAFournir`.
   */
  readonly pieces: readonly PieceAFournir[];
}

export function entrepriseVide(): Entreprise {
  return {
    nom: '', prenom: '', siret: '', debutActivite: null, typeActivite: 'BNC', caisseRetraite: 'ssi', acre: false,
    versementLiberatoire: false, historiqueVl: [], tvaDepuis: null, tvaIntracom: '', iban: '',
    bic: '', adresse: '', codePostal: '', ville: '', codeApe: '', email: '',
    telephone: '', urssafPeriodicite: 'mensuel', onboardingFait: false,
    plateformeAgreee: null, optionTvaDebits: false,
    regimeTva: 'simplifie', ca3Mensuelle: false, nomExploitant: '', partGardeeRetiree: null
  };
}

export function faitsVides(): Faits {
  return {
    version: VERSION_SCHEMA,
    entreprise: entrepriseVide(),
    clients: [], missions: [], recettes: [], depenses: [], conges: [], notesCra: [],
    mouvementsBancaires: [], periodesUrssafAjoutees: [],
    soldeInitial: 0 as Euros, soldeInitialAu: null, reserve: 0 as Euros, besoinMensuel: 0 as Euros,
    objectifCaAnnuel: null,
    periodesDeclarees: [], echeances: [], configImpotBrute: {},
    partsFiscales: null, autresRevenusFoyer: null, versementPerDeductible: null,
    impositionCommune: null, pieces: []
  };
}

/**
 * Motif de refus d'un bloc de faits, ou `null` s'il est exploitable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI VALIDER CE QU'ON A SOI-MÊME ÉCRIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Tant que les faits ne venaient que de `localStorage`, un `JSON.parse(...) as
 * Faits` passait : l'application relisait ce qu'elle avait écrit. Dès qu'ils
 * arrivent d'un compte distant, ce n'est plus vrai. Le bloc peut avoir été
 * écrit par une AUTRE version de l'application, sur un autre appareil.
 *
 * Un transtypage laisserait alors entrer un `recettes` qui n'est pas un
 * tableau, et l'erreur n'apparaîtrait qu'à l'affichage, loin de sa cause,
 * après avoir écrasé l'état local. On refuse à l'entrée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE VERSION PLUS RÉCENTE EST REFUSÉE, PAS RABOTÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Si le compte porte un schéma postérieur à celui que ce code connaît, le
 * charger reviendrait à ignorer les champs inconnus — puis à les EFFACER au
 * premier renvoi. Une version ancienne de l'application détruirait ainsi le
 * travail fait sur une plus récente. Elle s'arrête donc.
 *
 * Ce qui est vérifié : la FORME de premier niveau, et que chaque élément d'une
 * liste est bien un enregistrement — voir `motifRefusElements`. Pas la valeur
 * de chaque champ : le prétendre serait mentir sur la portée du contrôle.
 */
export function motifRefusFaits(brut: unknown): string | null {
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) {
    return 'Le bloc de faits n’est pas un objet.';
  }
  const o = brut as Record<string, unknown>;

  const version = o['version'];
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return 'Le bloc de faits ne porte pas de numéro de schéma.';
  }
  if (version > VERSION_SCHEMA) {
    return `Ce compte a été enregistré par une version plus récente de `
      + `l’application (schéma ${version}, connu ici : ${VERSION_SCHEMA}). `
      + `Le charger effacerait ce que cette version-ci ne sait pas lire. `
      + `Mets à jour l’application avant de continuer.`;
  }

  // `echeances` manquait à cette liste : un `echeances: {}` passait, puis
  // faisait tomber l'échéancier au premier `filter`.
  const listes = [
    'clients', 'missions', 'recettes', 'depenses', 'conges', 'notesCra',
    'mouvementsBancaires', 'periodesUrssafAjoutees', 'periodesDeclarees', 'echeances', 'pieces'
  ] as const;
  for (const cle of listes) {
    if (cle in o && !Array.isArray(o[cle])) return `Le champ « ${cle} » devrait être une liste.`;
  }
  const motifElements = motifRefusElements(o, version);
  if (motifElements !== null) return motifElements;

  const nombres = ['soldeInitial', 'reserve', 'besoinMensuel'] as const;
  for (const cle of nombres) {
    const v = o[cle];
    if (cle in o && (typeof v !== 'number' || !Number.isFinite(v))) {
      return `Le champ « ${cle} » devrait être un montant.`;
    }
  }

  // `soldeInitialAu` a le droit d'être absent (compte d'avant le schéma 15)
  // ou `null` (jamais daté) — c'est le comportement d'ABSTENTION que le lot
  // installe, pas une erreur à réparer. Seule une valeur présente qui n'est
  // ni `null` ni une date `AAAA-MM-JJ` est refusée : elle ferait entrer une
  // comparaison de dates fausse dans `soldeDerive`, silencieusement.
  const soldeAu = o['soldeInitialAu'];
  if ('soldeInitialAu' in o && soldeAu !== null
    && (typeof soldeAu !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(soldeAu))) {
    return 'Le champ « soldeInitialAu » devrait être une date, être nul, ou être absent.';
  }

  // L'objectif est le premier montant qui a le droit d'être absent. Le ranger
  // avec les autres l'aurait rendu obligatoire, et un compte d'avant le schéma
  // 10 aurait été refusé pour n'avoir pas fixé d'objectif.
  const objectif = o['objectifCaAnnuel'];
  if ('objectifCaAnnuel' in o && objectif !== null
    && (typeof objectif !== 'number' || !Number.isFinite(objectif))) {
    return 'Le champ « objectifCaAnnuel » devrait être un montant ou être absent.';
  }

  // Les trois faits du foyer fiscal ont le droit d'être absents — aucun compte
  // d'avant le schéma 12 ne les porte — et le droit d'être `null`, qui veut
  // dire « pas renseigné » et non « zéro ». Seule une valeur présente mais qui
  // n'est pas un nombre fini est refusée : elle ferait entrer un `NaN` dans le
  // barème progressif, dont le résultat est un montant d'impôt sans forme.
  for (const cle of ['partsFiscales', 'autresRevenusFoyer', 'versementPerDeductible'] as const) {
    const v = o[cle];
    if (cle in o && v !== null && (typeof v !== 'number' || !Number.isFinite(v))) {
      return `Le champ « ${cle} » devrait être un nombre, être nul, ou être absent.`;
    }
  }
  const commune = o['impositionCommune'];
  if ('impositionCommune' in o && commune !== null && typeof commune !== 'boolean') {
    return 'Le champ « impositionCommune » devrait être vrai, faux, nul, ou être absent.';
  }

  const entreprise = o['entreprise'];
  if ('entreprise' in o
    && (typeof entreprise !== 'object' || entreprise === null || Array.isArray(entreprise))) {
    return 'Le champ « entreprise » devrait être un objet.';
  }

  /* Schéma 22. Une plateforme qui n'est pas un objet lisible ferait lever
     l'écran Réglages et le rappel « réception obligatoire » à chaque
     ouverture : un fichier hostile n'a pas à pouvoir rendre l'application
     inutilisable. Absente ou nulle : non renseignée. */
  if (estEnregistrement(entreprise)) {
    const plateforme = entreprise['plateformeAgreee'];
    if (plateforme !== undefined && plateforme !== null && (!estEnregistrement(plateforme)
      || typeof plateforme['nom'] !== 'string'
      || (plateforme['depuis'] !== null && plateforme['depuis'] !== undefined
        && (typeof plateforme['depuis'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(plateforme['depuis']))))) {
      return 'Le champ « entreprise.plateformeAgreee » devrait porter un nom et une date, ou être nul.';
    }
    const debits = entreprise['optionTvaDebits'];
    if (debits !== undefined && typeof debits !== 'boolean') {
      return 'Le champ « entreprise.optionTvaDebits » devrait être vrai ou faux.';
    }
  }

  return null;
}

const estEnregistrement = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Position lisible d'un élément fautif : on compte à partir de 1. */
const illisible = (cle: string, i: number): string =>
  `Le champ « ${cle} » contient un élément illisible (n° ${i + 1}). `
  + `Ce fichier ou ce compte est abîmé : rien n’a été chargé.`;

/**
 * Chaque élément de liste est un enregistrement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN BLOC ABÎMÉ NE DOIT PAS ENTRER, PARCE QU'IL NE RESSORT PLUS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le contrôle de premier niveau laissait passer `"depenses": [null]`. Le bloc
 * était accepté, ENREGISTRÉ, puis Pilote, Argent, Activité et Achats levaient
 * « Cannot read properties of null » : écran blanc, et le même écran blanc à
 * chaque ouverture, puisque le bloc était déjà persisté. Seul un vidage
 * manuel du stockage en sortait — en effaçant tout.
 *
 * Les listes d'enregistrements le sont à toutes les versions. Deux exceptions
 * de forme : `periodesDeclarees` a été une liste de mois (des chaînes)
 * jusqu'au schéma 20 — la migration les convertit, il ne faut donc pas les
 * refuser avant elle ; au schéma courant, chaque élément porte sa nature et sa
 * période —, et `conges` a été une liste de dates nues jusqu'au schéma 1 — la
 * migration les convertit, il ne faut donc pas les refuser avant elle.
 *
 * Les listes IMBRIQUÉES des missions ne sont contrôlées qu'au schéma courant :
 * c'est le seul cas où rien ne les reconstruit (`completerFaitsCourants` ne
 * descend pas), alors que la migration réécrit les entités des schémas
 * antérieurs de toute façon.
 *
 * La VALEUR des champs du schéma 25 — nature connue, période à la bonne
 * forme, pièce lisible — se contrôle à l'entrée de ce qui vient d'ailleurs
 * (`schema.exterieur`), pas ici : ce module est lu à chaque ouverture, et un
 * dossier local ne contient que ce que l'application a écrit.
 */
function motifRefusElements(o: Record<string, unknown>, version: number): string | null {
  const enregistrements = [
    'clients', 'missions', 'recettes', 'depenses', 'notesCra',
    'mouvementsBancaires', 'periodesUrssafAjoutees', 'echeances', 'pieces'
  ] as const;
  for (const cle of enregistrements) {
    const liste = o[cle];
    if (!Array.isArray(liste)) continue;
    const i = liste.findIndex((e) => !estEnregistrement(e));
    if (i !== -1) return illisible(cle, i);
  }

  const conges = o['conges'];
  if (Array.isArray(conges)) {
    const i = conges.findIndex((c) => typeof c !== 'string' && !estEnregistrement(c));
    if (i !== -1) return illisible('conges', i);
  }
  const declarees = o['periodesDeclarees'];
  if (Array.isArray(declarees)) {
    /* Au schéma courant, plus rien ne reconstruit la liste : un mois nu, ou
       une période d'avant le schéma 25 (`mois` sans `nature`), y passerait
       pour une période dont la nature vaut `undefined`, que la règle ne
       retrouverait jamais — la période redeviendrait « à déclarer » et sa
       dette, provisionnée une seconde fois, sans un mot. */
    const lisible = (m: unknown): boolean => (version === VERSION_SCHEMA
      ? estEnregistrement(m) && typeof m['nature'] === 'string' && typeof m['periode'] === 'string'
      : typeof m === 'string' || estEnregistrement(m));
    const i = declarees.findIndex((m) => !lisible(m));
    if (i !== -1) return illisible('periodesDeclarees', i);
  }

  if (version !== VERSION_SCHEMA) return null;
  /* Les lignes d'une facture : une liste dans un élément de liste, que rien ne
     reconstruit au schéma courant. Une ligne sans prix numérique ferait lever
     la réédition — et le facturier avec elle — à chaque ouverture. */
  const recettes = o['recettes'];
  if (Array.isArray(recettes)) {
    const i = (recettes as Record<string, unknown>[]).findIndex((r) => !lignesLisibles(r['lignes']));
    if (i !== -1) return illisible('recettes', i);
  }
  if (!Array.isArray(o['missions'])) return null;
  for (const [i, m] of (o['missions'] as Record<string, unknown>[]).entries()) {
    const entites = m['entites'];
    /* Schéma 24. Un mode inconnu se lirait « commune » par défaut et ferait
       une facture au payeur de la mission pour des journées qu'un autre doit
       payer ; un payeur qui n'est pas un nom ne se retrouverait dans aucun
       carnet, et le brouillon partirait sans destinataire. Une plage sans
       bornes lisibles ne couvre aucun jour : ses journées disparaîtraient du
       planning, du CRA et de la facture sans un mot. */
    const facturation = m['facturation'];
    const entitesLisibles = Array.isArray(entites)
      && (facturation === undefined || facturation === 'commune' || facturation === 'par_client')
      && entites.every((e) =>
        estEnregistrement(e)
        && Array.isArray(e['rythmes']) && e['rythmes'].every((r) => estEnregistrement(r)
          && typeof r['du'] === 'string' && typeof r['au'] === 'string'
          && (r['facturerA'] == null || typeof r['facturerA'] === 'string'))
        && estEnregistrement(e['ajustements']));
    if (!entitesLisibles) return illisible('missions', i);
  }
  return null;
}

/** Absentes, nulles, ou une liste de lignes dont chaque champ a son type. */
function lignesLisibles(lignes: unknown): boolean {
  if (lignes === undefined || lignes === null) return true;
  return Array.isArray(lignes) && lignes.every((l) =>
    estEnregistrement(l)
    && typeof l['designation'] === 'string'
    && Number.isFinite(l['quantite'])
    && Number.isFinite(l['prixUnitaireHt'])
    && Number.isFinite(l['tauxTva']));
}

/**
 * Fusionne les défauts d'un bloc DÉJÀ au schéma courant, sans exécuter aucune
 * migration.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE FONCTION EXISTE À CÔTÉ DE `completerFaits`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `completerFaits` — dans `schema.migrations.ts` — convertit les schémas
 * antérieurs : congés en simples chaînes, ajustements en nombres nus, TVA
 * jamais posée. Ce code ne sert qu'UNE FOIS dans la vie d'un compte, au
 * passage d'une version à la suivante, et jamais à qui a déjà le schéma
 * courant — la majorité des ouvertures. Il pesait pourtant dans le paquet de
 * PREMIER RENDU, téléchargé par tout le monde à chaque démarrage pour ne
 * jamais s'exécuter chez la plupart.
 *
 * Cette fonction-ci fait le strict nécessaire pour le cas majoritaire — un
 * dossier déjà à `VERSION_SCHEMA` — sans importer le module de migrations :
 * elle comble les champs de PREMIER NIVEAU absents (une écriture interrompue,
 * un stockage édité à la main) exactement comme le fait `completerFaits`,
 * mais ne descend PAS dans les listes. Un compte déjà au schéma courant n'a,
 * par construction, plus de congé écrit en chaîne nue ni d'ajustement en
 * nombre nu : ces formes n'existent qu'à des schémas que `VERSION_SCHEMA` a
 * dépassés depuis longtemps.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE N'EST PAS UNE ABSENCE DE GARDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un bloc corrompu ou partiel — un stockage tronqué par un quota dépassé en
 * cours d'écriture, une entreprise à moitié remplie — reste rattrapé : c'est
 * exactement ce que fait la fusion de surface `{ ...faitsVides(), ...brut }`,
 * complétée par le même comblement de `entreprise` que `completerFaits`. Ce
 * qui manque ici, c'est uniquement la conversion des formats de schémas
 * révolus — pas la protection contre les données absentes.
 *
 * À n'appeler qu'après `motifRefusFaits`, qui seul autorise l'entrée, et
 * seulement quand la version du bloc est ÉGALE à `VERSION_SCHEMA` — voir
 * `infra/migration.ts` (`migrer`), seul appelant légitime.
 */
export function completerFaitsCourants(brut: Record<string, unknown>): Faits {
  const entreprise = (typeof brut['entreprise'] === 'object' && brut['entreprise'] !== null)
    ? brut['entreprise'] as Partial<Entreprise>
    : {};
  return {
    ...faitsVides(),
    ...brut,
    version: VERSION_SCHEMA,
    entreprise: { ...entrepriseVide(), ...entreprise }
  } as Faits;
}
