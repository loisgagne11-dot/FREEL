/**
 * Déclaration européenne de services (DES).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DES PORTE SUR CE QU'ON VEND, PAS SUR CE QU'ON ACHÈTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * C'est le point que l'on confond le plus souvent, et il fallait le lever
 * avant d'écrire une ligne : la DES est due par le PRESTATAIRE qui rend un
 * service à un assujetti établi dans un autre État membre. Celui qui achète
 * un service à un prestataire étranger n'a pas de DES à déposer — il
 * autoliquide la TVA, ce qui est une autre obligation, portée par la
 * déclaration de TVA.
 *
 * L'écran Achats détecte l'autoliquidation à l'achat. Ce module-ci regarde
 * les RECETTES.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS PROPRIÉTÉS QUI SURPRENNENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  1. **La franchise en base n'en dispense pas.** On peut ne facturer aucune
 *     TVA et devoir néanmoins déclarer chaque prestation intracommunautaire.
 *     C'est l'oubli le plus fréquent chez les micro-entrepreneurs.
 *  2. **Aucun seuil.** Une seule prestation de 50 € déclenche l'obligation.
 *  3. **750 € d'amende par déclaration manquante ou erronée.** Une omission
 *     répétée sur un an coûte davantage que la plupart des redressements que
 *     cette application cherche par ailleurs à éviter.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUELLE DATE RETENIR — ET POURQUOI CE N'EST PAS L'ENCAISSEMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le livre des recettes s'écrit à l'encaissement ; la DES, non. La taxe
 * devient exigible chez le preneur à l'achèvement de la prestation, et c'est
 * ce mois-là qui commande la déclaration. Une facture émise en juin et payée
 * en septembre se déclare en juin.
 *
 * L'application ne connaît pas la date d'achèvement : elle retient la date
 * d'émission de la facture, qui la suit de près dans l'usage. L'approximation
 * est signalée à l'écran plutôt que passée sous silence.
 */

import { type DateISO, type Euros, type Mois, euros } from '../types';

/**
 * Les 27 États membres, par code ISO.
 *
 * Cette liste EST une donnée officielle, et elle change — le Royaume-Uni en
 * est sorti en 2020. Elle porte donc sa source et sa date de vérification,
 * comme les taux de cotisations.
 */
export const ETATS_MEMBRES_UE = {
  codes: [
    'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR',
    'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
    'SE', 'SI', 'SK'
  ] as const,
  source: 'Union européenne — 27 États membres depuis le retrait du Royaume-Uni (2020)',
  verifieLe: '2026-08-12' as DateISO
};

/** Amende encourue par déclaration manquante ou inexacte. */
export const AMENDE_PAR_DECLARATION = {
  valeur: euros(750),
  source: 'CGI, art. 1788 A — défaut de production de la DES',
  verifieLe: '2026-08-12' as DateISO
};

/** Jour du mois suivant avant lequel la déclaration doit être déposée. */
export const JOUR_LIMITE = 10;

export function estDansLUe(pays: string): boolean {
  return (ETATS_MEMBRES_UE.codes as readonly string[]).includes(pays.trim().toUpperCase());
}

/** Le client d'une recette, du point de vue de la DES. */
export interface PreneurService {
  readonly nom: string;
  /** Code pays ISO à deux lettres. `FR` ou vide pour un client français. */
  readonly pays: string;
  /** Numéro de TVA intracommunautaire du preneur. Obligatoire sur la DES. */
  readonly tvaIntracom: string;
}

export interface RecetteDeclarable {
  readonly id: string;
  readonly clientNom: string;
  readonly montant: Euros;
  /** Date d'émission : c'est elle qui commande le mois de déclaration. */
  readonly emiseLe: DateISO | null;
  /** Une écriture d'annulation ne se déclare pas comme une prestation. */
  readonly annuleEcriture?: string | null;
}

export type MotifExclusion =
  | 'client_francais'
  | 'client_hors_ue'
  | 'client_inconnu'
  | 'sans_date_emission'
  | 'annulation';

export interface LigneDes {
  readonly recetteId: string;
  readonly clientNom: string;
  /** Numéro de TVA du preneur, tel qu'il figurera sur la déclaration. */
  readonly tvaIntracom: string;
  readonly montant: Euros;
  readonly emiseLe: DateISO;
}

export interface AnomalieDes {
  readonly recetteId: string;
  readonly message: string;
}

export interface DeclarationDes {
  readonly mois: Mois;
  readonly lignes: readonly LigneDes[];
  readonly total: Euros;
  /**
   * Prestations à déclarer dont le numéro de TVA du preneur manque.
   *
   * Elles ne sont PAS dans `lignes` : une déclaration déposée sans numéro de
   * TVA valable est une déclaration inexacte, donc passible de la même amende
   * qu'une déclaration absente. Mieux vaut réclamer le numéro que déposer
   * quelque chose d'incomplet.
   */
  readonly anomalies: readonly AnomalieDes[];
  /** Date limite de dépôt, au 10 du mois suivant. */
  readonly limiteLe: DateISO;
  /** `true` s'il n'y a ni ligne ni anomalie : aucune déclaration n'est due. */
  readonly sansObjet: boolean;
}

/** Le 10 du mois suivant celui déclaré. */
export function limiteDepot(m: Mois): DateISO {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) + 1;
  const annee = Math.floor(total / 12);
  const mois = String((total % 12) + 1).padStart(2, '0');
  return `${annee}-${mois}-${String(JOUR_LIMITE).padStart(2, '0')}` as DateISO;
}

/**
 * Pourquoi une recette n'entre pas dans la déclaration, ou `null` si elle y
 * entre.
 *
 * Rendre un motif plutôt qu'un booléen permet à l'écran d'expliquer une
 * absence : « aucune prestation à déclarer » et « trois prestations écartées
 * faute de connaître le pays du client » demandent des réactions opposées.
 */
export function motifExclusion(
  recette: RecetteDeclarable,
  preneur: PreneurService | undefined
): MotifExclusion | null {
  if (recette.annuleEcriture !== undefined && recette.annuleEcriture !== null) {
    return 'annulation';
  }
  if (recette.emiseLe === null) return 'sans_date_emission';
  if (preneur === undefined) return 'client_inconnu';

  const pays = preneur.pays.trim().toUpperCase();
  // Un client sans pays renseigné est réputé français : c'est le cas
  // majoritaire, et supposer l'étranger ferait apparaître des obligations
  // imaginaires à chaque facture.
  if (pays === '' || pays === 'FR') return 'client_francais';
  return estDansLUe(pays) ? null : 'client_hors_ue';
}

/**
 * La déclaration d'un mois.
 *
 * Le mois retenu est celui de l'ÉMISSION, pas de l'encaissement — voir l'en-tête
 * du module.
 */
export function declarationDuMois(
  recettes: readonly RecetteDeclarable[],
  preneurs: ReadonlyMap<string, PreneurService>,
  m: Mois
): DeclarationDes {
  const lignes: LigneDes[] = [];
  const anomalies: AnomalieDes[] = [];

  for (const recette of recettes) {
    if (recette.emiseLe === null || recette.emiseLe.slice(0, 7) !== m) continue;

    const preneur = preneurs.get(recette.clientNom);
    if (motifExclusion(recette, preneur) !== null) continue;
    if (preneur === undefined) continue; // exclu ci-dessus ; borne le typage

    const numero = preneur.tvaIntracom.replace(/\s/g, '').toUpperCase();
    if (numero === '') {
      anomalies.push({
        recetteId: recette.id,
        message: `${preneur.nom} est établi dans l’Union européenne mais son numéro `
          + 'de TVA intracommunautaire n’est pas renseigné. Sans lui, la déclaration '
          + 'serait inexacte — et une déclaration inexacte est sanctionnée comme une '
          + 'déclaration absente.'
      });
      continue;
    }

    lignes.push({
      recetteId: recette.id,
      clientNom: preneur.nom,
      tvaIntracom: numero,
      montant: recette.montant,
      emiseLe: recette.emiseLe
    });
  }

  return {
    mois: m,
    lignes,
    total: euros(lignes.reduce<number>((s, l) => s + l.montant, 0)),
    anomalies,
    limiteLe: limiteDepot(m),
    sansObjet: lignes.length === 0 && anomalies.length === 0
  };
}

export interface DeclarationEnRetard {
  readonly mois: Mois;
  readonly limiteLe: DateISO;
  readonly joursDeRetard: number;
  readonly nombreLignes: number;
  readonly total: Euros;
}

function joursEntre(a: DateISO, b: DateISO): number {
  const t = (d: DateISO) =>
    Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** Le mois d'une date. */
const moisDeDate = (d: DateISO): Mois => d.slice(0, 7) as Mois;

function moisPrecedent(m: Mois): Mois {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) - 1;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}` as Mois;
}

/**
 * Les déclarations dont la date limite est passée.
 *
 * Une déclaration ne peut être « en retard » que si des prestations la
 * rendaient exigible : un mois sans prestation intracommunautaire n'appelle
 * aucun dépôt, et le réclamer produirait une alerte permanente que
 * l'utilisateur finirait par ignorer.
 *
 * On ne remonte pas indéfiniment : au-delà de `moisExamines`, une omission
 * ancienne relève d'une régularisation avec le service des douanes, pas d'un
 * rappel dans une liste de tâches.
 */
export function declarationsEnRetard(
  recettes: readonly RecetteDeclarable[],
  preneurs: ReadonlyMap<string, PreneurService>,
  aujourdhui: DateISO,
  moisExamines = 24
): readonly DeclarationEnRetard[] {
  const retards: DeclarationEnRetard[] = [];
  let m = moisPrecedent(moisDeDate(aujourdhui));

  for (let i = 0; i < moisExamines; i++) {
    const declaration = declarationDuMois(recettes, preneurs, m);
    const exigible = declaration.lignes.length > 0 || declaration.anomalies.length > 0;

    if (exigible && declaration.limiteLe < aujourdhui) {
      retards.push({
        mois: m,
        limiteLe: declaration.limiteLe,
        joursDeRetard: joursEntre(declaration.limiteLe, aujourdhui),
        nombreLignes: declaration.lignes.length + declaration.anomalies.length,
        total: declaration.total
      });
    }
    m = moisPrecedent(m);
  }

  // Du plus ancien au plus récent : le retard le plus long est le plus coûteux.
  return retards.sort((a, b) => a.mois.localeCompare(b.mois));
}

/** Amende encourue au titre des déclarations en retard. */
export function amendeEncourue(retards: readonly DeclarationEnRetard[]): Euros {
  return euros(retards.length * AMENDE_PAR_DECLARATION.valeur);
}

/** Contrôle d'intégrité, agrégé par `bareme/index`. */
export function verifierIntegriteDes(): readonly string[] {
  const ecarts: string[] = [];
  if (ETATS_MEMBRES_UE.codes.length !== 27) {
    ecarts.push(
      `des : ${ETATS_MEMBRES_UE.codes.length} États membres listés, 27 attendus.`
    );
  }
  if (new Set(ETATS_MEMBRES_UE.codes).size !== ETATS_MEMBRES_UE.codes.length) {
    ecarts.push('des : un code pays apparaît deux fois.');
  }
  if (!estDansLUe('FR')) {
    ecarts.push('des : la France doit figurer parmi les États membres.');
  }
  if (AMENDE_PAR_DECLARATION.valeur <= 0) {
    ecarts.push('des : l’amende doit être strictement positive.');
  }
  return ecarts;
}
