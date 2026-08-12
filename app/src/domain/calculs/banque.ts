/**
 * Mouvements bancaires et rapprochement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PROPOSER, PAS DÉCIDER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application rapprochait automatiquement : `reconcileTransactions`
 * appariait des opérations par ressemblance et écrivait le résultat sans
 * jamais poser d'état consultable ni corrigeable. L'audit l'a relevé pour deux
 * raisons. D'abord parce qu'un appariement faux devenait invisible — rien
 * n'indiquait qu'un rapprochement avait eu lieu, ni sur quoi. Ensuite parce
 * qu'« chaque opération est rapprochée » n'était donc pas vérifiable : la
 * phrase ne renvoyait à aucun fait.
 *
 * Ici, le domaine PROPOSE des candidats et dit combien il y en a. C'est
 * l'utilisateur qui tranche, et le résultat est un fait stocké. Un candidat
 * unique reste un candidat : l'accepter d'office ferait exactement ce qu'on
 * reproche à l'ancienne version, en plus discret.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE EMPREINTE SUR CHAQUE MOUVEMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Réimporter un relevé qui chevauche le précédent est le cas ordinaire, pas
 * l'exception : on exporte « le mois dernier » puis « les trois derniers
 * mois ». Sans identité stable, le solde doublerait sur la période commune.
 * L'empreinte — date, montant, libellé normalisé — rend l'import idempotent.
 */

import { type DateISO, type Euros, euros } from '../types';

export interface MouvementBancaire {
  /** Empreinte stable : le même mouvement réimporté garde le même identifiant. */
  readonly id: string;
  readonly date: DateISO;
  readonly libelle: string;
  /** Signé : négatif au débit, positif au crédit. */
  readonly montant: Euros;
  /**
   * Écriture à laquelle ce mouvement a été rattaché — dépense ou recette —,
   * ou `null` tant que personne n'a tranché.
   */
  readonly rapprocheAvec: string | null;
  /**
   * `true` quand l'utilisateur a déclaré qu'aucune écriture ne correspond :
   * frais bancaires, virement personnel, remboursement. Sans cet état, ces
   * mouvements resteraient éternellement « à traiter » et l'écran finirait
   * par ne plus être regardé.
   */
  readonly sansContrepartie: boolean;
}

/**
 * L'empreinte d'un mouvement.
 *
 * Le libellé est normalisé — casse, accents, espaces multiples — parce qu'une
 * même opération peut être exportée avec une mise en forme différente d'un
 * relevé à l'autre. La date et le montant, eux, sont pris tels quels : deux
 * opérations du même jour au même montant avec le même libellé sont
 * indiscernables, et les traiter comme une seule est le comportement voulu
 * pour un réimport.
 */
export function empreinteMouvement(
  date: DateISO,
  montant: Euros,
  libelle: string
): string {
  const normalise = libelle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${date}|${montant.toFixed(2)}|${normalise}`;
}

export interface ResultatImport {
  readonly mouvements: readonly MouvementBancaire[];
  readonly ajoutes: number;
  /** Mouvements déjà présents, écartés pour ne pas doubler le solde. */
  readonly deja: number;
}

/**
 * Fusionne un relevé importé avec les mouvements déjà connus.
 *
 * Les mouvements existants ne sont jamais remplacés : un rapprochement déjà
 * tranché par l'utilisateur survit au réimport. C'est la propriété qui rend
 * l'opération sans risque, et donc réellement utilisable.
 */
export function importerMouvements(
  existants: readonly MouvementBancaire[],
  lignes: readonly { readonly date: DateISO; readonly libelle: string; readonly montant: Euros }[]
): ResultatImport {
  const connus = new Map(existants.map((m) => [m.id, m]));
  let ajoutes = 0;
  let deja = 0;

  for (const ligne of lignes) {
    const id = empreinteMouvement(ligne.date, ligne.montant, ligne.libelle);
    if (connus.has(id)) { deja += 1; continue; }
    connus.set(id, {
      id,
      date: ligne.date,
      libelle: ligne.libelle,
      montant: ligne.montant,
      rapprocheAvec: null,
      sansContrepartie: false
    });
    ajoutes += 1;
  }

  return {
    mouvements: [...connus.values()].sort((a, b) => b.date.localeCompare(a.date)),
    ajoutes,
    deja
  };
}

/**
 * Le solde bancaire.
 *
 * Solde initial plus la somme des mouvements. Tant qu'aucun relevé n'est
 * importé, il vaut le solde initial — et l'écran doit alors dire que le solde
 * n'est pas suivi, plutôt que d'afficher un chiffre figé comme s'il était à
 * jour.
 */
export function soldeBancaire(
  soldeInitial: Euros,
  mouvements: readonly MouvementBancaire[]
): Euros {
  return euros(mouvements.reduce<number>((s, m) => s + m.montant, soldeInitial));
}

/** Une écriture candidate au rapprochement — dépense ou recette. */
export interface EcritureRapprochable {
  readonly id: string;
  readonly libelle: string;
  /** Montant positif ; le sens est donné par `nature`. */
  readonly montant: Euros;
  readonly date: DateISO | null;
  readonly nature: 'depense' | 'recette';
  /** `true` si elle est déjà rattachée à un mouvement. */
  readonly dejaRapprochee: boolean;
}

/**
 * Fenêtre de recherche, en jours.
 *
 * Sept jours de part et d'autre : un virement émis un vendredi arrive le
 * lundi, un prélèvement est daté de l'échéance et non du débit, et un chèque
 * peut traîner une semaine. Une fenêtre plus étroite manquerait ces cas
 * ordinaires ; plus large, elle ferait remonter des candidats sans rapport.
 */
export const FENETRE_JOURS = 7;

export interface Candidats {
  readonly mouvementId: string;
  readonly ecritures: readonly EcritureRapprochable[];
}

function joursEntre(a: DateISO, b: DateISO): number {
  const t = (d: DateISO) =>
    Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.abs(Math.round((t(b) - t(a)) / 86_400_000));
}

/**
 * Les écritures qui pourraient correspondre à un mouvement.
 *
 * Le montant doit correspondre **au centime**. Une tolérance sur le montant
 * paraîtrait accommodante, mais elle apparierait une facture de 1 200 € à un
 * paiement de 1 199,50 € — c'est-à-dire masquerait un écart de règlement, qui
 * est précisément ce qu'un rapprochement doit faire apparaître.
 *
 * Le sens, lui, n'est pas négociable : un débit ne peut correspondre qu'à une
 * dépense, un crédit qu'à une recette.
 */
export function candidatsPour(
  mouvement: MouvementBancaire,
  ecritures: readonly EcritureRapprochable[],
  fenetreJours: number = FENETRE_JOURS
): readonly EcritureRapprochable[] {
  if (mouvement.rapprocheAvec !== null || mouvement.sansContrepartie) return [];

  const natureAttendue = mouvement.montant < 0 ? 'depense' : 'recette';
  const cible = Math.abs(mouvement.montant);

  return ecritures
    .filter((e) => !e.dejaRapprochee)
    .filter((e) => e.nature === natureAttendue)
    .filter((e) => Math.abs(e.montant - cible) < 0.005)
    .filter((e) => e.date === null || joursEntre(e.date, mouvement.date) <= fenetreJours)
    // La plus proche en date d'abord : c'est le candidat le plus probable, et
    // celui que l'utilisateur voudra voir en tête.
    .sort((a, b) => {
      if (a.date === null) return 1;
      if (b.date === null) return -1;
      return joursEntre(a.date, mouvement.date) - joursEntre(b.date, mouvement.date);
    });
}

export interface ResumeRapprochement {
  readonly total: number;
  readonly rapproches: number;
  readonly sansContrepartie: number;
  /** Mouvements pour lesquels exactement une écriture correspond. */
  readonly propositionsEvidentes: number;
  /** Mouvements pour lesquels plusieurs écritures correspondent. */
  readonly ambigus: number;
  /** Mouvements sans aucun candidat : à qualifier à la main. */
  readonly sansCandidat: number;
}

/**
 * L'état du rapprochement.
 *
 * `propositionsEvidentes` compte les mouvements à un seul candidat. Le mot
 * « évidente » n'autorise pas à les valider d'office : il dit seulement que
 * l'utilisateur n'aura pas à choisir. La distinction compte, parce que c'est
 * exactement là que l'ancienne version se permettait de trancher seule.
 */
export function resumerRapprochement(
  mouvements: readonly MouvementBancaire[],
  ecritures: readonly EcritureRapprochable[],
  fenetreJours: number = FENETRE_JOURS
): ResumeRapprochement {
  let rapproches = 0;
  let sansContrepartie = 0;
  let evidentes = 0;
  let ambigus = 0;
  let sansCandidat = 0;

  for (const m of mouvements) {
    if (m.rapprocheAvec !== null) { rapproches += 1; continue; }
    if (m.sansContrepartie) { sansContrepartie += 1; continue; }
    const n = candidatsPour(m, ecritures, fenetreJours).length;
    if (n === 0) sansCandidat += 1;
    else if (n === 1) evidentes += 1;
    else ambigus += 1;
  }

  return {
    total: mouvements.length,
    rapproches,
    sansContrepartie,
    propositionsEvidentes: evidentes,
    ambigus,
    sansCandidat
  };
}
