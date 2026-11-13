import { type DateISO, type Euros, euros } from '../domain/types';
import { type Echeance, exerciceDe } from '../domain/calculs/provisions';
import { prelevementsDuSolde } from '../domain/bareme/soldeImpot';
import { type MoisDImpot, repartitionMensuelleImpot } from '../domain/calculs/repartitionImpot';
import type { Faits } from './schema';
import { moisCourant, provisionIrDe, recettesEncaissees, soldeImpotPrecedentDe } from './selecteurs';

/**
 * L'impôt sur le revenu posé sur le calendrier : la provision de l'année
 * dépliée mois par mois, et le solde de l'an passé placé à ses dates
 * officielles tant que son avis manque.
 *
 * Module à part, chargé avec les écrans qui le lisent : `selecteurs.ts` est au
 * premier rendu, et rien de ceci n'y sert.
 */

const estImpotDe = (annee: number) => (e: Echeance) => e.nature === 'impot' && exerciceDe(e) === annee;

export interface RepartitionImpot {
  readonly annee: number;
  readonly lignes: readonly MoisDImpot[];
  /** Les acomptes de l'année appelés et pas encore prélevés : au volet 1. */
  readonly appelesNonPreleves: Euros;
}

/**
 * La provision d'impôt de l'année, mois par mois.
 *
 * `null` quand la provision elle-même ne se calcule pas (versement
 * libératoire, parts manquantes, barème refusé) : une répartition d'un total
 * absent inventerait le total.
 */
export function repartitionImpotDe(faits: Faits, maintenant: Date = new Date()): RepartitionImpot | null {
  const p = provisionIrDe(faits, maintenant);
  if (p === null || p.statut === 'refuse') return null;
  const { annee, impotAnneeProjetee, caProjete } = p.valeur;
  const acomptes = faits.echeances.filter(estImpotDe(annee));
  return {
    annee,
    lignes: repartitionMensuelleImpot({
      annee,
      jusquA: moisCourant(maintenant),
      impotAnneeProjetee,
      caProjete,
      encaissements: recettesEncaissees(faits).map((r) => ({ le: r.encaisseeLe, montant: r.montant })),
      prelevements: acomptes.flatMap((e) => (e.payeeLe === null
        ? []
        : [{ le: e.payeeLe, montant: e.montantPaye ?? e.montant }]))
    }),
    appelesNonPreleves: euros(acomptes
      .filter((e) => e.payeeLe === null)
      .reduce<number>((s, e) => s + e.montant, 0))
  };
}

export interface PrelevementPrevu {
  readonly id: string;
  readonly montant: Euros;
  readonly date: DateISO;
}

/**
 * Le solde estimé de l'an passé, découpé et daté comme l'administration le
 * prélèvera — tant que l'avis n'est pas saisi.
 *
 * La frise montrait un automne vide à qui n'avait pas encore reçu son avis,
 * alors que c'est la saison la plus chargée de l'année : le solde de l'an
 * passé tombe en même temps que les acomptes de l'année. Le montant est
 * celui que la provision garde déjà de côté (`soldeImpotPrecedentDe`) : la
 * frise le place, elle ne le compte pas une seconde fois.
 */
export function soldeImpotPrevuDe(faits: Faits, maintenant: Date = new Date()): readonly PrelevementPrevu[] {
  const s = soldeImpotPrecedentDe(faits, maintenant);
  if (s === null || s.statut === 'refuse' || s.valeur.resteAProvisionner <= 0) return [];
  const p = prelevementsDuSolde(s.valeur.resteAProvisionner, s.valeur.annee + 1);
  if (p.statut === 'refuse') return [];
  return p.valeur.map((x) => ({ id: `solde-prevu-${x.date}`, montant: x.montant, date: x.date }));
}
