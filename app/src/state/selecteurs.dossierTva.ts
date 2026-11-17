/**
 * Le dossier de TVA d'une période, et le contexte d'une dépense qu'il lit.
 *
 * Sorti de `selecteurs.argent` (et de `selecteurs.achats`) quand les
 * obligations ont dû le lire : importé de là, il tirait dans le paquet différé
 * de « à traiter » toute la trésorerie, la projection et le rapprochement
 * bancaire — et la liste de préchargement que l'entrée tient pour ce paquet
 * grossissait d'autant, sur un budget d'entrée à 436 octets de sa limite.
 */

import type { DateISO } from '../domain/types';
import { moisDe } from '../domain/types';
import type { ContexteDepenses } from '../domain/calculs/depenses';
import { tvaDeDepense } from '../domain/calculs/depenses';
import { baseHtAutoliquidee } from '../domain/calculs/depenses.tva';
import {
  type DossierTva, type PieceAutoliquidee, type PieceCollectee, type PieceDeduite, dossierTva,
  ventilationParTaux
} from '../domain/calculs/dossierTva';
import type { Depense, Faits } from './schema';
import { moisCourant, regimeTvaAu, soldeEstSuivi } from './selecteurs';

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

/* ─────────────────────────────────────────────────────────────────────────
   Le dossier de déclaration de TVA
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Tout ce qu'il faut pour remplir la déclaration d'un trimestre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX DATES DIFFÉRENTES, ET C'EST LE PIÈGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La TVA collectée sur les prestations de services est exigible à
 * l'ENCAISSEMENT, la TVA déductible à la date de PAIEMENT de la dépense.
 * Aucune des deux n'est la date d'émission — qui est pourtant celle qui range
 * les factures partout ailleurs dans cette application. Les confondre décale
 * une déclaration entière d'un trimestre.
 *
 * Les avoirs COMPTENT, au trimestre de l'avoir et au signe opposé. Ils
 * étaient écartés, au motif qu'une annulation « neutralise déjà » la facture :
 * vrai pour le chiffre d'affaires, faux pour la TVA. La facture annulée reste
 * dans le trimestre où elle a été déclarée ; c'est le trimestre de l'avoir qui
 * porte la régularisation. Sans elle, 200 € de TVA déjà reversés sur une
 * facture annulée ne revenaient jamais.
 */
export function dossierTvaDuTrimestre(
  faits: Faits,
  du: DateISO,
  au: DateISO,
  maintenant: Date = new Date()
): DossierTva {
  const encaissements: PieceCollectee[] = faits.recettes
    .filter((r): r is typeof r & { encaisseeLe: DateISO } => r.encaisseeLe !== null)
    .map((r) => ({
      id: r.id,
      numero: r.numero,
      clientNom: r.clientNom,
      encaisseeLe: r.encaisseeLe,
      montantHt: r.montant,
      // `undefined` et `null` disent la même chose ici — la TVA n'a pas été
      // conservée — et le dossier les compte à part plutôt que pour zéro.
      tva: r.tvaCollectee ?? null,
      avoir: typeof r.annuleEcriture === 'string',
      ventilation: ventilationParTaux(r.montant, r.tvaCollectee ?? null, r.lignes ?? null)
    }));

  const contexte = contexteDepense(faits, maintenant);
  const achats: PieceDeduite[] = faits.depenses
    .filter((d): d is typeof d & { payeeLe: DateISO } => d.payeeLe !== null)
    .map((d) => ({
      id: d.id,
      libelle: d.libelle,
      payeeLe: d.payeeLe,
      montantTtc: d.montantTtc,
      tvaRecuperable: tvaDeDepense(d, contexte(d)).recuperable
    }));

  // Même régime (au mois de paiement) et même règle de TVA que la provision :
  // `contexte(d)` lit `regimeTvaAu` sur `payeeLe`.
  const autoliquidations: PieceAutoliquidee[] = [];
  for (const d of faits.depenses) {
    if (d.payeeLe === null || d.provenance === 'france') continue;
    const c = contexte(d);
    autoliquidations.push({
      id: d.id,
      libelle: d.libelle,
      fournisseur: d.fournisseur,
      provenance: d.provenance,
      payeeLe: d.payeeLe,
      baseHt: baseHtAutoliquidee(d, c),
      tvaDue: tvaDeDepense(d, c).aAutoliquider,
      regime: c.regimeTva
    });
  }

  return dossierTva({ du, au, encaissements, achats, autoliquidations });
}

