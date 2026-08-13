/**
 * Sélecteurs de l'écran Achats.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE À PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Troisième application de la même règle, après `selecteurs.activite` et
 * `selecteurs.facture` : un sélecteur qui ne sert qu'à un écran DIFFÉRÉ n'a
 * rien à faire dans `selecteurs.ts`.
 *
 * Le Pilote y puise `etatPilote`, et le Pilote est au premier rendu :
 * l'empaqueteur emporte donc le fichier ENTIER dans le lot initial. Le régime
 * de TVA par période, le calcul de TVA perdue faute de pièce et les candidats
 * au rapprochement étaient téléchargés avant le premier pixel, pour un écran
 * que l'utilisateur n'ouvre peut-être jamais.
 *
 * La règle se vérifie mécaniquement : si le budget d'entrée dépasse, chercher
 * d'abord ce qu'un import partagé a tiré dedans. Relever le plafond le
 * masquerait, et un budget qu'on relève à chaque dépassement ne mesure plus
 * rien.
 */

import type { Mois } from '../domain/types';
import { moisDe } from '../domain/types';
import {
  type ContexteDepenses, type EtatRapprochement, type RegimeTva,
  type ResumeDepenses, type TvaDepense,
  rapprochementEffectif, resumerDepenses, tvaDeDepense
} from '../domain/calculs/depenses';
import {
  type EcritureRapprochable, candidatsPour, resumerRapprochement
} from '../domain/calculs/banque';
import type { MouvementBancaire, ResumeRapprochement } from '../domain/calculs/banque';
import { type Periode, dansLaPeriode, periodeCourante } from '../domain/calculs/periode';
import { moisCourant, soldeEstSuivi } from './selecteurs';
import type { Depense, Faits } from './schema';

/**
 * Le régime de TVA en vigueur à un mois donné.
 *
 * Résolu par période, comme les taux URSSAF, et pour la même raison : une
 * entreprise qui franchit le seuil en cours d'année relève de la franchise
 * avant, et de l'assujettissement après. Appliquer le régime d'aujourd'hui à
 * une dépense de mars rendrait déductible une TVA qui ne l'était pas.
 */
export function regimeTvaAu(faits: Faits, m: Mois): RegimeTva {
  const depuis = faits.entreprise.tvaDepuis;
  return depuis !== null && m >= depuis ? 'assujetti' : 'franchise';
}

/**
 * Le contexte d'une dépense : régime à sa date de paiement, et disponibilité
 * d'un relevé bancaire.
 *
 * Une dépense sans date est rattachée au régime courant : c'est la seule
 * hypothèse défendable, et l'écran signale par ailleurs que la date manque.
 */
export function contexteDepense(
  faits: Faits,
  maintenant: Date = new Date()
): (d: Depense) => ContexteDepenses {
  const courant = moisCourant(maintenant);
  return (d) => ({
    regimeTva: regimeTvaAu(faits, d.payeeLe === null ? courant : moisDe(d.payeeLe)),
    banqueSynchronisee: soldeEstSuivi(faits)
  });
}

/** Une dépense accompagnée de ce que le domaine en dit. */
export interface LigneDepense {
  readonly depense: Depense;
  readonly tva: TvaDepense;
  readonly rapprochement: EtatRapprochement;
  readonly regimeTva: RegimeTva;
}

export interface EtatAchats {
  readonly lignes: readonly LigneDepense[];
  readonly resume: ResumeDepenses;
  readonly banqueReliee: boolean;
  readonly resumeBanque: ResumeRapprochement;
  readonly mouvements: readonly MouvementBancaire[];
  /** Candidats par mouvement, calculés une fois pour l'écran. */
  readonly candidats: ReadonlyMap<string, readonly EcritureRapprochable[]>;
  /** Dépenses dont la date de paiement manque : ni exercice, ni régime. */
  readonly sansDate: number;
  /** La période observée — l'écran l'affiche, il ne la redécoupe pas. */
  readonly periode: Periode;
}

/**
 * L'état de l'écran Achats.
 *
 * Les dépenses sont rendues de la plus récente à la plus ancienne, celles sans
 * date en tête : une dépense non datée est le premier problème à traiter, pas
 * une ligne à reléguer en bas de liste.
 */
export function etatAchats(
  faits: Faits,
  maintenant: Date = new Date(),
  periode: Periode = periodeCourante('tout', maintenant)
): EtatAchats {
  const contexte = contexteDepense(faits, maintenant);
  const ecritures = ecrituresRapprochables(faits);

  // Le filtre s'applique AVANT le résumé : des totaux calculés sur toutes les
  // dépenses sous un en-tête « T3 2026 » diraient autre chose que la liste
  // affichée juste en dessous.
  const retenues = faits.depenses.filter((d) => dansLaPeriode(d.payeeLe, periode));

  const lignes = [...retenues]
    .sort(comparerParDate)
    .map((depense) => {
      const c = contexte(depense);
      return {
        depense,
        tva: tvaDeDepense(depense, c),
        rapprochement: rapprochementEffectif(depense, c),
        regimeTva: c.regimeTva
      };
    });

  return {
    periode,
    lignes,
    resume: resumerDepenses(retenues, contexte),
    banqueReliee: soldeEstSuivi(faits),
    resumeBanque: resumerRapprochement(faits.mouvementsBancaires, ecritures),
    mouvements: faits.mouvementsBancaires,
    candidats: new Map(
      faits.mouvementsBancaires.map((m) => [m.id, candidatsPour(m, ecritures)])
    ),
    sansDate: faits.depenses.filter((d) => d.payeeLe === null).length
  };
}

/**
 * Les écritures qu'un mouvement bancaire peut venir confirmer.
 *
 * Dépenses et recettes ensemble, avec leur sens : c'est le domaine qui
 * décidera qu'un débit ne peut correspondre qu'à une dépense. Les rassembler
 * ici évite que l'écran ait à connaître cette règle.
 */
export function ecrituresRapprochables(faits: Faits): readonly EcritureRapprochable[] {
  const rattachees = new Set(
    faits.mouvementsBancaires
      .map((m) => m.rapprocheAvec)
      .filter((id): id is string => id !== null)
  );

  const depenses = faits.depenses.map((d) => ({
    id: d.id,
    libelle: d.libelle || d.fournisseur,
    montant: d.montantTtc,
    date: d.payeeLe,
    nature: 'depense' as const,
    dejaRapprochee: rattachees.has(d.id)
  }));

  // Une annulation n'est pas encaissée deux fois : elle ne se rapproche pas.
  const recettes = faits.recettes
    .filter((r) => r.encaisseeLe !== null && r.annuleEcriture == null)
    .map((r) => ({
      id: r.id,
      libelle: r.libelle || r.clientNom,
      montant: r.montant,
      date: r.encaisseeLe,
      nature: 'recette' as const,
      dejaRapprochee: rattachees.has(r.id)
    }));

  return [...depenses, ...recettes];
}

function comparerParDate(a: Depense, b: Depense): number {
  if (a.payeeLe === null) return b.payeeLe === null ? 0 : -1;
  if (b.payeeLe === null) return 1;
  return b.payeeLe.localeCompare(a.payeeLe);
}

