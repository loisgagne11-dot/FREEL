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
import type { MouvementBancaire } from '../domain/calculs/banque';

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

export const VERSION_SCHEMA = 1 as const;
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
  /** Recette globalisée en fin de journée, sans identité de client. */
  readonly globalisee?: boolean;
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
  readonly conges: readonly DateISO[];
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
    periodesDeclarees: [], configImpotBrute: {}
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
    entreprise: { ...entrepriseVide(), ...entreprise }
  } as Faits;
}
