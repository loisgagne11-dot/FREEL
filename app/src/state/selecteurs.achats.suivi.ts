/**
 * Ce que l'écran Achats propose de faire : rapprochements, tuiles.
 *
 * Module à part de `selecteurs.achats` pour la même raison que celui-ci est à
 * part de `selecteurs` : il ne sert qu'à un écran différé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉCRAN PROPOSE UNE ACTION, L'UTILISATEUR LA DÉCLENCHE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque opération du relevé sans dépense reçoit l'action la plus probable.
 * Aucune n'est exécutée d'office : un candidat unique reste un candidat (voir
 * `calculs/banque`). Ce qui change ici, c'est que l'utilisateur ne choisit
 * plus parmi cinq boutons identiques, il confirme ou corrige une proposition.
 */

import { type MouvementBancaire, candidatsPour } from '../domain/calculs/banque';
import { estATraiter } from '../domain/calculs/banque.etat';
import { type Periode, dansLaPeriode } from '../domain/calculs/periode';
import { rapprochementEffectif } from '../domain/calculs/depenses';
import { contexteDepense, ecrituresRapprochables, type EtatAchats } from './selecteurs.achats';
import type { Depense, Faits } from './schema';
import { dateDuJour } from './selecteurs';
import { facturesAEncaisser } from './selecteurs.pipeline';

export type ActionOperation =
  /** Un crédit qui règle une facture : `encaisser` quand elle n'est pas encore passée en encaissée. */
  | { readonly type: 'associer'; readonly recetteId: string; readonly libelle: string; readonly encaisser: boolean }
  /** Un débit qui correspond à une dépense déjà saisie. */
  | { readonly type: 'relier'; readonly depenseId: string; readonly libelle: string }
  /** Un débit que rien n'explique : la dépense est à créer depuis l'opération. */
  | { readonly type: 'creer'; readonly fournisseur: string }
  /** Un crédit sans facture : on ne crée pas de dépense depuis un encaissement. */
  | { readonly type: 'qualifier' };

export interface PropositionOperation {
  readonly mouvement: MouvementBancaire;
  readonly action: ActionOperation;
}

export interface PropositionDepense {
  readonly depense: Depense;
  /** L'opération compatible, ou `null` : alors seule « Hors compte » reste. */
  readonly mouvement: MouvementBancaire | null;
}

export interface SuiviRapprochement {
  readonly operations: readonly PropositionOperation[];
  readonly depenses: readonly PropositionDepense[];
  readonly aTraiter: number;
}

const TOUT_LE_TEMPS = Number.POSITIVE_INFINITY;

/** Les formes juridiques et préfixes bancaires qui ne disent pas qui est payé. */
const PREFIXES = /^(?:prlv|prelevement|prélèvement|vir|virement|sepa|cb|carte|paiement|pmt|achat)\b\.?\s*/i;
const SUFFIXES = /\s+(?:sarl|sas|sasu|eurl|sa|inc|ltd|llc|gmbh)\.?$/i;

/**
 * Le fournisseur probable d'un libellé bancaire.
 *
 * Une heuristique et non une vérité : « PRLV GITHUB INC » donne « Github », pas
 * « GitHub ». Le résultat PRÉ-REMPLIT un champ que l'utilisateur relit ; il ne
 * s'écrit jamais sans validation.
 */
export function fournisseurDepuisLibelle(libelle: string): string {
  let reste = libelle.trim();
  for (let i = 0; i < 4 && PREFIXES.test(reste); i += 1) reste = reste.replace(PREFIXES, '');
  reste = reste
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  while (SUFFIXES.test(reste)) reste = reste.replace(SUFFIXES, '');
  return reste
    .split(' ')
    .filter((mot) => mot !== '')
    .map((mot) => mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase())
    .join(' ');
}

const estEnAttente = estATraiter;

/**
 * Ce qui reste à traiter entre le relevé et les dépenses, sur la période.
 *
 * Sans relevé importé, il n'y a rien à rapprocher : des dépenses « en attente
 * de leur opération » n'auraient aucune opération à attendre (voir
 * `rapprochementEffectif`, qui dit « sans relevé »).
 */
export function suiviRapprochement(
  faits: Faits,
  periode: Periode,
  maintenant: Date = new Date()
): SuiviRapprochement {
  if (faits.mouvementsBancaires.length === 0) return { operations: [], depenses: [], aTraiter: 0 };

  const ecritures = ecrituresRapprochables(faits);
  const contexte = contexteDepense(faits, maintenant);

  // Les factures attendues : un crédit les règle plusieurs semaines après leur
  // émission, la fenêtre de sept jours des écritures datées ne s'y applique pas.
  //
  // La liste unique des factures à encaisser : le filtre local écartait
  // l'écriture d'annulation mais gardait la facture qu'elle annule, si bien
  // qu'un virement du même montant proposait de l'encaisser.
  const attendues = facturesAEncaisser(faits, dateDuJour(maintenant))
    .map(({ recette: r }) => ({
      id: r.id,
      libelle: r.numero ? `Facture ${r.numero} · ${r.clientNom}` : (r.libelle || r.clientNom),
      montant: r.montant,
      date: r.emiseLe,
      nature: 'recette' as const,
      dejaRapprochee: faits.mouvementsBancaires.some((m) => m.rapprocheAvec === r.id)
    }));

  const operations: PropositionOperation[] = faits.mouvementsBancaires
    .filter((m) => estEnAttente(m) && dansLaPeriode(m.date, periode))
    .map((mouvement) => {
      const candidate = candidatsPour(mouvement, ecritures)[0]; // déjà saisie ou déjà encaissée
      if (mouvement.montant >= 0) {
        if (candidate !== undefined) {
          return { mouvement, action: { type: 'associer', recetteId: candidate.id, libelle: candidate.libelle, encaisser: false } };
        }
        const facture = candidatsPour(mouvement, attendues, TOUT_LE_TEMPS)[0];
        return {
          mouvement,
          action: facture === undefined
            ? { type: 'qualifier' }
            : { type: 'associer', recetteId: facture.id, libelle: facture.libelle, encaisser: true }
        };
      }
      return {
        mouvement,
        action: candidate === undefined
          ? { type: 'creer', fournisseur: fournisseurDepuisLibelle(mouvement.libelle) }
          : { type: 'relier', depenseId: candidate.id, libelle: candidate.libelle }
      };
    });

  const enAttente = faits.mouvementsBancaires.filter(estEnAttente);
  const depenses: PropositionDepense[] = faits.depenses
    .filter((d) => dansLaPeriode(d.payeeLe, periode))
    .filter((d) => rapprochementEffectif(d, contexte(d)) === 'en_attente')
    .filter((d) => !faits.mouvementsBancaires.some((m) => m.rapprocheAvec === d.id))
    .map((depense) => {
      const ecriture = ecritures.find((e) => e.id === depense.id && e.nature === 'depense');
      const mouvement = ecriture === undefined
        ? undefined
        : enAttente.find((m) => candidatsPour(m, [ecriture]).length > 0);
      return { depense, mouvement: mouvement ?? null };
    });

  return { operations, depenses, aTraiter: operations.length + depenses.length };
}

export interface TuilesAchats {
  readonly depenses: { readonly totalTtc: number; readonly nombre: number };
  readonly tva: { readonly deductible: number; readonly nonRecuperable: number };
  readonly aRapprocher: { readonly total: number; readonly operations: number; readonly depenses: number };
  /** Dépenses sans pièce, TVA récupérable ou non : la preuve manque dans les deux cas. */
  readonly justificatifsManquants: number;
  /** TTC des dépenses récurrentes de la période. */
  readonly recurrentTtc: number;
}

/**
 * Les valeurs des quatre tuiles et du repère de l'en-tête.
 *
 * Les justificatifs manquants se comptent sur la PIÈCE (`justificatifId`), pas
 * sur la TVA perdue : en franchise aucune TVA ne se perd, et pourtant la pièce
 * manque. Compter la TVA ferait afficher « Tout est justifié » à quelqu'un dont
 * aucune dépense ne l'est.
 */
export function tuilesAchats(
  etat: EtatAchats,
  suivi: SuiviRapprochement,
  recurrentes: ReadonlySet<string>
): TuilesAchats {
  return {
    depenses: { totalTtc: etat.resume.totalTtc, nombre: etat.resume.nombre },
    tva: { deductible: etat.resume.tvaRecuperable, nonRecuperable: etat.resume.tvaPerdueFauteDePiece },
    aRapprocher: { total: suivi.aTraiter, operations: suivi.operations.length, depenses: suivi.depenses.length },
    justificatifsManquants: etat.lignes.filter((l) => l.depense.justificatifId === null).length,
    recurrentTtc: etat.lignes
      .filter((l) => recurrentes.has(l.depense.id))
      .reduce((somme, l) => somme + l.depense.montantTtc, 0)
  };
}
