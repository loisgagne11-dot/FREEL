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

import type { DateISO, Euros, Mois, TypeActivite } from '../domain/types';
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

export const VERSION_SCHEMA = 9 as const;
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
  /** Matelas de sécurité, montant absolu. Source unique (D4). */
  readonly reserve: Euros;
  readonly besoinMensuel: Euros;
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
    periodesDeclarees: [], echeances: [], configImpotBrute: {}
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

export function completerFaits(brut: unknown): Faits {
  const o = brut as Record<string, unknown>;
  const defauts = faitsVides();
  const entreprise = (typeof o['entreprise'] === 'object' && o['entreprise'] !== null)
    ? o['entreprise'] as Partial<Entreprise>
    : {};

  return {
    ...defauts,
    ...o,
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
