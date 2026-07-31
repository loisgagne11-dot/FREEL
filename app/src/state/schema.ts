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
  readonly statut: 'active' | 'terminee' | 'prospect';
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
  readonly modeReglement: 'virement' | 'cheque' | 'especes' | 'carte' | 'autre' | null;
  readonly numero: string;
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
   * `true` quand des opérations bancaires sont disponibles pour rapprocher.
   *
   * Fait, et non déduction : sans lui, une dépense marquée « rapprochée » sous
   * une ancienne configuration continuerait de s'afficher comme telle après la
   * déconnexion du compte, en affirmant un contrôle qui n'a plus lieu.
   */
  readonly banqueReliee: boolean;
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
    banqueReliee: false, periodesUrssafAjoutees: [],
    soldeInitial: 0 as Euros, reserve: 0 as Euros, besoinMensuel: 0 as Euros,
    periodesDeclarees: [], configImpotBrute: {}
  };
}
