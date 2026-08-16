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
import { ratio } from '../domain/types';
import type { Depense } from '../domain/calculs/depenses';
import type { PeriodeBareme } from '../domain/bareme/urssaf';
import type { ModeReglement } from '../domain/calculs/livreRecettes';
import type { MotifSansContrepartie, MouvementBancaire } from '../domain/calculs/banque';
import type { Ajustements, Rythme } from '../domain/calculs/planning';
import type { Echeance } from '../domain/calculs/provisions';

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
export type { Ajustements, Rythme };

export const VERSION_SCHEMA = 12 as const;

/**
 * Part maximale du versable qu'on peut choisir de garder.
 *
 * Au-delà de 80 %, le curseur ne dit plus « je garde une marge », il dit « je
 * ne me verse rien » — et cette décision-là se prend en ne se versant rien, pas
 * en réglant un curseur qu'on oubliera d'avoir mis là. La borne existe aussi
 * pour que `versable × (1 − part)` reste une somme qu'on peut afficher : à 100 %
 * l'écran proposerait toujours zéro, sans dire pourquoi.
 */
export const PART_GARDEE_MAX = 0.8;
export const CLE_STOCKAGE = 'freel.faits.v1' as const;
/** Instantané pris avant la première écriture, pour pouvoir revenir en arrière. */
export const CLE_INSTANTANE_AVANT_MIGRATION = 'freel.instantane.avant-migration.v1' as const;

export interface Entreprise {
  readonly nom: string;
  readonly siret: string;
  /** Début d'activité. Détermine notamment la période d'ACRE. */
  readonly debutActivite: DateISO | null;
  readonly typeActivite: TypeActivite;
  readonly acre: boolean;
  /** Régime d'imposition. Discriminant EXCLUSIF (voir bareme/impot). */
  readonly versementLiberatoire: boolean;
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
}

export interface Client {
  readonly id: string;
  readonly nom: string;
  readonly adresse: string;
  readonly siret: string;
  readonly email: string;
  readonly delaiPaiementJours: number;
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
   * Matelas de sécurité, montant absolu. Source unique (D4).
   *
   * Le fait garde son nom ; l'écran, lui, l'appelle « seuil de sécurité »,
   * comme le dessin. Renommer le champ aurait obligé à une migration pour un
   * gain nul — et aurait fait passer le vocabulaire de l'interface dans le
   * stockage, où il n'a rien à faire.
   */
  readonly reserve: Euros;
  readonly besoinMensuel: Euros;
  /**
   * Part du versable qu'on choisit de laisser sur le compte, entre 0 et 0,8.
   *
   * ───────────────────────────────────────────────────────────────────────
   * DEUX NOTIONS, PAS DEUX FAÇONS DE DIRE LA MÊME CHOSE
   * ───────────────────────────────────────────────────────────────────────
   *
   * `reserve` est un PLANCHER en euros — le seuil de sécurité, la ligne sous
   * laquelle les courbes ne doivent pas descendre. Celui-ci est une PART du
   * versable, une prudence qu'on renouvelle à chaque versement.
   *
   * Les confondre — c'est-à-dire exprimer le plancher en pourcentage du
   * disponible — fabriquerait une boucle : le plancher descendrait à mesure
   * qu'on vide le compte, et le versement soutenable finirait par tout
   * autoriser. Ce n'est pas une préférence d'affichage, c'est une erreur de
   * modèle.
   *
   * ───────────────────────────────────────────────────────────────────────
   * LE DÉFAUT EST ZÉRO, ET CE N'EST PAS UN OUBLI
   * ───────────────────────────────────────────────────────────────────────
   *
   * Le prototype propose 50 %. Repris tel quel, il couperait en deux, sans
   * qu'un geste ait été fait, le versable de tout compte existant. Un réglage
   * par défaut qui change un montant affiché est un chiffre faux : zéro ne
   * change rien tant que personne n'a bougé le curseur.
   *
   * Le montant gardé, lui, ne se stocke jamais — il se dérive (invariant 1).
   */
  readonly partGardeeAuVersement: Ratio;
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
  /** Mois dont la déclaration a été faite. Opère la bascule entre volets de provisions. */
  readonly periodesDeclarees: readonly Mois[];
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
}

export function entrepriseVide(): Entreprise {
  return {
    nom: '', siret: '', debutActivite: null, typeActivite: 'BNC', acre: false,
    versementLiberatoire: false, tvaDepuis: null, tvaIntracom: '', iban: '',
    bic: '', adresse: '', codePostal: '', ville: '', codeApe: '', email: '',
    telephone: '', urssafPeriodicite: 'mensuel', onboardingFait: false
  };
}

export function faitsVides(): Faits {
  return {
    version: VERSION_SCHEMA,
    entreprise: entrepriseVide(),
    clients: [], missions: [], recettes: [], depenses: [], conges: [],
    mouvementsBancaires: [], periodesUrssafAjoutees: [],
    soldeInitial: 0 as Euros, reserve: 0 as Euros, besoinMensuel: 0 as Euros,
    partGardeeAuVersement: ratio(0),
    objectifCaAnnuel: null,
    periodesDeclarees: [], echeances: [], configImpotBrute: {},
    partsFiscales: null, autresRevenusFoyer: null, versementPerDeductible: null
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
 * Ce qui est vérifié : la FORME de premier niveau. Pas le contenu de chaque
 * enregistrement — le prétendre serait mentir sur la portée du contrôle.
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
      + `Mettez à jour l’application avant de continuer.`;
  }

  const listes = [
    'clients', 'missions', 'recettes', 'depenses', 'conges',
    'mouvementsBancaires', 'periodesUrssafAjoutees', 'periodesDeclarees'
  ] as const;
  for (const cle of listes) {
    if (cle in o && !Array.isArray(o[cle])) return `Le champ « ${cle} » devrait être une liste.`;
  }

  const nombres = ['soldeInitial', 'reserve', 'besoinMensuel'] as const;
  for (const cle of nombres) {
    const v = o[cle];
    if (cle in o && (typeof v !== 'number' || !Number.isFinite(v))) {
      return `Le champ « ${cle} » devrait être un montant.`;
    }
  }

  // L'objectif est le premier montant qui a le droit d'être absent. Le ranger
  // avec les autres l'aurait rendu obligatoire, et un compte d'avant le schéma
  // 10 aurait été refusé pour n'avoir pas fixé d'objectif.
  const objectif = o['objectifCaAnnuel'];
  if ('objectifCaAnnuel' in o && objectif !== null
    && (typeof objectif !== 'number' || !Number.isFinite(objectif))) {
    return 'Le champ « objectifCaAnnuel » devrait être un montant ou être absent.';
  }

  // La part gardée est un RATIO, pas un montant : elle ne peut donc pas voyager
  // avec `soldeInitial` et consorts. Son absence est légitime — aucun compte
  // d'avant le schéma 11 ne la porte — et la refuser rejetterait tous les
  // comptes existants.
  //
  // Le contrôle borne à [0 ; 1] et non à [0 ; PART_GARDEE_MAX] : au-delà de 1,
  // `versable × (1 − part)` devient NÉGATIF et l'écran proposerait de se verser
  // une dette ; en dessous de 0, il proposerait plus que le versable. Ce sont
  // les deux erreurs qui engagent. Entre 0,8 et 1, le chiffre reste juste et
  // seulement trop prudent : le magasin le ramène dans la plage utile plutôt
  // que de refuser le compte entier pour un curseur mal réglé.
  const part = o['partGardeeAuVersement'];
  if ('partGardeeAuVersement' in o
    && (typeof part !== 'number' || !Number.isFinite(part) || part < 0 || part > 1)) {
    return 'Le champ « partGardeeAuVersement » devrait être une part entre 0 et 1, '
      + 'ou être absent.';
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

  const entreprise = o['entreprise'];
  if ('entreprise' in o
    && (typeof entreprise !== 'object' || entreprise === null || Array.isArray(entreprise))) {
    return 'Le champ « entreprise » devrait être un objet.';
  }

  return null;
}

/**
 * Complète un bloc validé avec les valeurs par défaut des champs absents.
 *
 * Un schéma ANTÉRIEUR est légitime : il lui manque les champs ajoutés depuis.
 * Les combler ici évite que chaque écran ait à se demander si la liste qu'il
 * lit existe — question à laquelle un jour l'un d'eux répondrait mal.
 *
 * À n'appeler qu'après `motifRefusFaits`, qui seul autorise l'entrée.
 */
/**
 * Convertit les congés du schéma 1 vers le schéma 2.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CAS QUI CASSE TOUT SI ON L'OUBLIE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le schéma 1 portait `conges: ['2026-08-10', …]` — de simples chaînes. Le
 * schéma 2 porte `{ date, quotite }`, pour tenir la demi-journée que
 * l'ancienne application gère depuis toujours.
 *
 * Tout bloc déjà enregistré — sur le poste comme sur le compte distant — est
 * au format 1. Le laisser passer tel quel donnerait des congés dont `date`
 * vaut `undefined` : le calendrier n'afficherait plus rien, le décompte
 * tomberait à zéro, et rien ne le signalerait. Une migration de schéma qu'on
 * oublie ne lève pas d'erreur, elle vide les données en silence.
 */
function congesDuSchema1(brut: unknown): readonly Conge[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((c): Conge[] => {
    if (typeof c === 'string') return [{ date: c as DateISO, quotite: 1 }];
    if (typeof c === 'object' && c !== null) {
      const o = c as Record<string, unknown>;
      if (typeof o['date'] !== 'string') return [];
      const q = typeof o['quotite'] === 'number' && Number.isFinite(o['quotite'])
        ? o['quotite'] : 1;
      return [{ date: o['date'] as DateISO, quotite: q }];
    }
    return [];
  });
}

/**
 * Complète les missions du schéma 1.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COMBLER LA RACINE NE SUFFIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `completerFaits` fusionnait les défauts au premier niveau seulement : une
 * liste `missions` présente écrasait le défaut en bloc, y compris pour les
 * champs ajoutés au schéma 2 À L'INTÉRIEUR de chaque mission.
 *
 * Résultat constaté dans un vrai navigateur : `rythmes` valait `undefined`,
 * le planning lisait sa longueur, et l'écran Activité tombait entièrement —
 * pour tout compte enregistré avant le schéma 2, c'est-à-dire tous.
 *
 * La leçon est la même que pour les congés, un niveau plus bas : une
 * migration de schéma doit descendre jusqu'où les champs ont bougé.
 */
function missionsDuSchema1(brut: unknown): readonly Mission[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((m): Mission[] => {
    if (typeof m !== 'object' || m === null) return [];
    const o = m as Record<string, unknown>;
    const { rythmes: _r, ajustements: _a, ...reste } = o;
    return [{
      ...(reste as unknown as Mission),
      entites: entitesDuSchema3(o)
    }];
  });
}

/**
 * Le rythme quitte la mission pour son client opérationnel (schéma 3 → 4).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CAS À UNE ENTRÉE N'EST PAS UNE EXCEPTION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Jusqu'au schéma 3, `rythmes` et `ajustements` étaient portés par la mission
 * elle-même. Une mission d'alors devient donc une mission à UN client
 * opérationnel, qui reprend son nom de client et son rythme tel quel. Rien
 * n'est perdu, rien n'est inventé, et le planning d'hier redonne exactement
 * les mêmes journées.
 *
 * Sans cette conversion, `entites` serait absent, le planning n'aurait plus
 * aucun rythme à lire et les calendriers se videraient — en silence, comme
 * les congés du schéma 1 avant eux.
 */
function entitesDuSchema3(o: Record<string, unknown>): readonly ClientOperationnel[] {
  const dejaConverti = Array.isArray(o['entites']) && o['entites'].length > 0;
  if (dejaConverti) {
    return (o['entites'] as unknown[]).flatMap((e): ClientOperationnel[] => {
      if (typeof e !== 'object' || e === null) return [];
      const c = e as Record<string, unknown>;
      return [{ ...entiteVide(), ...(c as unknown as ClientOperationnel) }];
    });
  }

  return [{
    ...entiteVide(),
    id: `${typeof o['id'] === 'string' ? o['id'] : 'mission'}-co1`,
    nom: typeof o['clientNom'] === 'string' ? o['clientNom'] : '',
    rythmes: Array.isArray(o['rythmes']) ? o['rythmes'] as readonly Rythme[] : [],
    ajustements: (typeof o['ajustements'] === 'object' && o['ajustements'] !== null)
      ? o['ajustements'] as Ajustements
      : {}
  }];
}

export function entiteVide(): ClientOperationnel {
  return {
    id: '', nom: '', couleur: '', adresse: '', contact: '', email: '',
    telephone: '', rythmes: [], ajustements: {}
  };
}

/**
 * `sansContrepartie` passe du booléen au motif (schéma 4 → 5).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PIÈGE DU FAUX QUI DEVIENT VRAI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le champ valait `true` ou `false` ; il vaut désormais `'remuneration'`,
 * `'autre'` ou `null`. Sans conversion, un `false` enregistré hier serait lu
 * comme « différent de null », donc comme un mouvement DÉJÀ classé : tous les
 * mouvements à traiter disparaîtraient de la file, sans que rien ne le
 * signale.
 *
 * C'est le troisième champ imbriqué à migrer, après les congés et les rythmes.
 * La règle est acquise : une migration descend jusqu'où les champs ont bougé.
 */
function mouvementsDuSchema4(brut: unknown): readonly MouvementBancaire[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((mv): MouvementBancaire[] => {
    if (typeof mv !== 'object' || mv === null) return [];
    const o = mv as Record<string, unknown>;
    const ancien = o['sansContrepartie'];
    const motif: MotifSansContrepartie | null =
      ancien === 'remuneration' || ancien === 'autre' ? ancien
        // Un `true` d'hier ne disait pas pourquoi : il devient « autre ».
        // Le requalifier en rémunération inventerait une information.
        : ancien === true ? 'autre'
          : null;
    return [{ ...(o as unknown as MouvementBancaire), sansContrepartie: motif }];
  });
}

/**
 * `payee` devient une DATE de paiement (schéma 5 → 6).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CONVERTIR SANS INVENTER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un `payee: true` d'hier dit qu'une échéance a été réglée, sans dire quand.
 * On retient sa date d'échéance : ce n'est pas une invention pour les seules
 * données qui existent aujourd'hui. Elles viennent toutes de la reprise des
 * mouvements « Charge » du legacy, où la date d'échéance A ÉTÉ POSÉE À PARTIR
 * de la date du mouvement — c'est-à-dire du paiement. La conversion redonne
 * donc exactement la bonne date.
 *
 * `payee: false` devient `null` : pas de paiement, pas de date.
 *
 * Quatrième champ imbriqué à migrer, après les congés, les rythmes et le motif
 * des mouvements. La règle est acquise et se vérifie à chaque fois : une
 * migration descend jusqu'où les champs ont bougé.
 */
function echeancesDuSchema5(brut: unknown): readonly Echeance[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((e): Echeance[] => {
    if (typeof e !== 'object' || e === null) return [];
    const o = e as Record<string, unknown>;
    const dejaConverti = 'payeeLe' in o;
    const echeanceLe = typeof o['echeanceLe'] === 'string' ? o['echeanceLe'] as DateISO : null;

    const payeeLe = dejaConverti
      ? (typeof o['payeeLe'] === 'string' ? o['payeeLe'] as DateISO : null)
      : (o['payee'] === true ? echeanceLe : null);

    return [{
      ...(o as unknown as Echeance),
      payeeLe,
      montantPaye: typeof o['montantPaye'] === 'number' && Number.isFinite(o['montantPaye'])
        ? o['montantPaye'] as Euros
        : null
    }];
  });
}

/**
 * v9 → v10 : l'objectif de chiffre d'affaires annuel.
 *
 * Aucune fonction de migration dédiée, et c'est vérifié plutôt que supposé :
 * le champ est de PREMIER NIVEAU, donc la fusion de surface ci-dessous le
 * comble depuis `faitsVides()`. La règle du projet — « une migration descend
 * jusqu'où les champs ont bougé » — est respectée précisément parce qu'ici
 * rien n'a bougé sous la surface. Les quatre migrations imbriquées existantes
 * sont là parce que leurs champs, eux, vivaient dans des éléments de liste.
 *
 * La valeur comblée est `null` et non zéro : voir `objectifCaAnnuel`.
 *
 * v10 → v11 : la part gardée au versement.
 *
 * Même conclusion, et vérifiée de la même façon plutôt que supposée : le champ
 * est de PREMIER NIVEAU, donc `{ ...defauts, ...o }` le comble depuis
 * `faitsVides()` dès lors qu'un bloc de schéma 10 ne porte pas la clé. La
 * vérification n'est pas une lecture du code mais un test nommé —
 * « un compte de schéma 10 reçoit une part gardée nulle, et non `undefined` » —
 * qui échoue si la fusion cesse de suffire. C'est ce qui distingue ce cas des
 * cinq migrations imbriquées ci-dessus : leurs champs, eux, vivaient dans des
 * éléments de liste, que la fusion de surface n'atteint pas.
 *
 * La valeur comblée est zéro, et jamais 0,5 : voir `partGardeeAuVersement`.
 *
 * v11 → v12 : les trois faits du foyer fiscal. Ceux-là, la fusion de surface
 * ne suffit PAS à combler — non parce qu'ils vivent dans une liste, mais parce
 * que leur valeur dort ailleurs, dans `configImpotBrute`. Voir
 * `foyerFiscalDuSchema11`.
 */
export function completerFaits(brut: unknown): Faits {
  const o = brut as Record<string, unknown>;
  const defauts = faitsVides();
  const entreprise = (typeof o['entreprise'] === 'object' && o['entreprise'] !== null)
    ? o['entreprise'] as Partial<Entreprise>
    : {};

  return {
    ...defauts,
    ...o,
    ...foyerFiscalDuSchema11(o),
    // Le numéro de schéma devient celui de CE code : les champs manquants
    // viennent d'être comblés, le bloc n'est plus à l'ancien format.
    version: VERSION_SCHEMA,
    entreprise: { ...entrepriseVide(), ...entreprise },
    conges: congesDuSchema1(o['conges']),
    missions: missionsDuSchema1(o['missions']),
    mouvementsBancaires: mouvementsDuSchema4(o['mouvementsBancaires']),
    echeances: echeancesDuSchema5(o['echeances']),
    recettes: recettesDuSchema6(o['recettes'])
  } as Faits;
}

/**
 * v11 → v12 : le foyer fiscal sort de `configImpotBrute`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REPRENDRE PLUTÔT QUE REDEMANDER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application tenait ces trois valeurs dans un objet indexé PAR
 * ANNÉE : `{ '2025': { parts, autresRevenus, perAnnuel }, '2026': {…} }`. La
 * reprise l'a conservé tel quel, sans jamais l'interpréter — d'où
 * `configImpotBrute`. Les redemander à la saisie alors qu'ils sont là
 * ferait retaper une information déjà donnée, et la provision d'impôt
 * refuserait de se calculer jusqu'à ce que ce soit fait.
 *
 * L'ANNÉE LA PLUS RÉCENTE l'emporte : c'est la seule qui décrit la situation
 * actuelle du foyer. La dimension annuelle est perdue, et c'est assumé — un
 * historique des parts ne sert à rien tant qu'aucun écran ne recalcule une
 * année passée, et le porter demanderait une table que personne ne tiendrait
 * à jour. Le jour où un tel écran existe, la donnée brute est toujours là.
 *
 * Un zéro de l'ancienne application reste un zéro : il a été saisi. Seule une
 * clé absente devient `null`, qui veut dire « pas renseigné ».
 */
export interface FoyerFiscal {
  readonly partsFiscales: number | null;
  readonly autresRevenusFoyer: Euros | null;
  readonly versementPerDeductible: Euros | null;
}

const nombreOuNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Extrait le foyer fiscal de l'ancienne configuration d'IR.
 *
 * Exporté pour que la reprise du legacy et la migration de schéma lisent la
 * MÊME règle : deux lectures de la même structure finiraient par diverger, et
 * l'application dirait alors deux nombres de parts selon l'origine du compte.
 */
export function foyerFiscalDepuisConfigImpot(brute: unknown): FoyerFiscal {
  const parAnnee = (typeof brute === 'object' && brute !== null && !Array.isArray(brute))
    ? brute as Record<string, unknown>
    : {};
  const derniereAnnee = Object.keys(parAnnee)
    .filter((cle) => /^\d{4}$/.test(cle))
    .sort()
    .pop();
  const ancien = derniereAnnee !== undefined
    && typeof parAnnee[derniereAnnee] === 'object' && parAnnee[derniereAnnee] !== null
    ? parAnnee[derniereAnnee] as Record<string, unknown>
    : {};

  return {
    partsFiscales: nombreOuNull(ancien['parts']),
    autresRevenusFoyer: nombreOuNull(ancien['autresRevenus']) as Euros | null,
    versementPerDeductible: nombreOuNull(ancien['perAnnuel']) as Euros | null
  };
}

function foyerFiscalDuSchema11(o: Record<string, unknown>): FoyerFiscal {
  // Ce qui est déjà saisi dans le nouveau schéma l'emporte : la reprise ne
  // sert qu'à combler une absence, jamais à écraser une valeur corrigée
  // depuis l'écran Config.
  const repris = foyerFiscalDepuisConfigImpot(o['configImpotBrute']);
  return {
    partsFiscales: nombreOuNull(o['partsFiscales']) ?? repris.partsFiscales,
    autresRevenusFoyer:
      (nombreOuNull(o['autresRevenusFoyer']) as Euros | null) ?? repris.autresRevenusFoyer,
    versementPerDeductible:
      (nombreOuNull(o['versementPerDeductible']) as Euros | null) ?? repris.versementPerDeductible
  };
}

/**
 * v6 → v7 : les recettes portent leurs dates de relance.
 * v7 → v8 : elles portent aussi leur date d'envoi.
 * v8 → v9 : et la TVA que le document porte.
 *
 * Le champ est nouveau et facultatif ; une recette d'avant le schéma 7 n'a
 * simplement jamais été relancée dans l'application. On pose donc une liste
 * vide plutôt que de laisser `undefined` circuler : le reste du code compte des
 * relances, et `undefined.length` n'est pas une absence, c'est une panne.
 *
 * La règle du projet s'applique une fois de plus : une migration descend
 * jusqu'où les champs ont bougé. Ici ils n'ont pas bougé, ils sont apparus —
 * mais le comblement doit quand même descendre au niveau de chaque recette,
 * ce que la fusion de surface de `completerFaits` ne fait pas.
 */
function recettesDuSchema6(brut: unknown): readonly Recette[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((r): Recette[] => {
    if (typeof r !== 'object' || r === null) return [];
    const o = r as Record<string, unknown>;
    const relances = Array.isArray(o['relancesLe'])
      ? o['relancesLe'].filter((d): d is DateISO => typeof d === 'string')
      : [];
    // v8 : la date d'envoi. `undefined` deviendrait « pas encore envoyée »
    // par accident ; on pose `null` explicitement, qui dit la même chose mais
    // le dit — et une facture d'avant le schéma 8 n'a effectivement aucune
    // date d'envoi enregistrée, quoi qu'il se soit passé dans la vraie vie.
    const envoyeeLe = typeof o['envoyeeLe'] === 'string' ? o['envoyeeLe'] as DateISO : null;
    // v9 : `null` reste `null` et ne devient PAS zéro. Une facture d'avant le
    // schéma 9 portait peut-être de la TVA ; la compter pour zéro sous-évaluerait
    // une déclaration, ce qui est le sens dangereux de l'erreur.
    const tvaCollectee = typeof o['tvaCollectee'] === 'number' && Number.isFinite(o['tvaCollectee'])
      ? o['tvaCollectee'] as Euros
      : null;
    return [{ ...(o as unknown as Recette), relancesLe: relances, envoyeeLe, tvaCollectee }];
  });
}
