/**
 * Sélecteurs de l'écran Argent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE À PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Troisième application de la même règle, après `selecteurs.activite.ts` et
 * `selecteurs.facture.ts` : le Pilote puise `etatPilote` dans `selecteurs.ts`,
 * donc l'empaqueteur emporte ce fichier ENTIER dans le lot de premier rendu.
 * L'état de l'écran Argent — le chiffre d'affaires mois par mois, les seuils,
 * l'encours — n'y a rien à faire : il ne sert qu'à un écran chargé à la
 * demande, et l'ouverture de l'application le téléchargeait pour rien.
 *
 * Le budget d'entrée l'a signalé en dépassant, comme les fois précédentes.
 * Relever le seuil aurait masqué la cause.
 */

import type { DateISO, Euros, Mois } from '../domain/types';
import { euros } from '../domain/types';
import { plafondMicro, seuilsTva } from '../domain/bareme';
import type { SeuilsTva } from '../domain/bareme';
import type { Resolution } from '../domain/types';
import type { Echeance, VentilationProvisions } from '../domain/calculs/provisions';
import type { ResultatTresorerie } from '../domain/calculs/tresorerie';
import { DELAI_PAIEMENT_DEFAUT, encoursDe, suivre } from '../domain/calculs/facturier';
import type { Faits } from './schema';
import { dateDuJour, etatPilote, moisCourant } from './selecteurs';
import { contexteDepense } from './selecteurs.achats';
import { tvaDeDepense } from '../domain/calculs/depenses';
import {
  type DossierTva, type PieceCollectee, type PieceDeduite, dossierTva
} from '../domain/calculs/dossierTva';

/**
 * Toutes les factures, avec leur statut dérivé à la date du jour.
 *
 * Le délai de paiement vient du carnet ; à défaut de client rattaché, le délai
 * légal supplétif. Retenir zéro afficherait « en retard » dès l'émission.
 */
export function facturesSuivies(faits: Faits, maintenant: Date = new Date()) {
  const delais = new Map(faits.clients.map((c) => [c.nom, c.delaiPaiementJours]));
  return suivre(
    faits.recettes,
    (nom) => delais.get(nom) ?? DELAI_PAIEMENT_DEFAUT,
    dateDuJour(maintenant)
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Écran Argent
   ───────────────────────────────────────────────────────────────────────── */

export interface MoisChiffre {
  readonly mois: Mois;
  /** Recettes émises sur le mois, encaissées ou non. */
  readonly realise: Euros;
  /** Recettes encaissées sur le mois. */
  readonly encaisse: Euros;
}

/**
 * Chiffre d'affaires mois par mois, réalisé et encaissé.
 *
 * Les deux courbes ne mesurent pas la même chose et l'écart entre elles EST
 * l'information : le réalisé dit ce qui a été facturé, l'encaissé ce qui est
 * arrivé sur le compte. C'est cet écart qui se transforme en trou de
 * trésorerie, et la raison pour laquelle les seuils fiscaux se calculent sur
 * l'encaissé, jamais sur le facturé.
 */
export function chiffreParMois(faits: Faits, annee: number): readonly MoisChiffre[] {
  const mois: MoisChiffre[] = [];
  for (let m = 1; m <= 12; m++) {
    const cle = `${annee}-${String(m).padStart(2, '0')}` as Mois;
    const realise = faits.recettes
      .filter((r) => r.emiseLe !== null && r.emiseLe.startsWith(cle))
      .reduce<number>((s, r) => s + r.montant, 0);
    const encaisse = faits.recettes
      .filter((r) => r.encaisseeLe !== null && r.encaisseeLe.startsWith(cle))
      .reduce<number>((s, r) => s + r.montant, 0);
    mois.push({ mois: cle, realise: euros(realise), encaisse: euros(encaisse) });
  }
  return mois;
}

export interface EtatArgent {
  readonly annee: number;
  readonly parMois: readonly MoisChiffre[];
  readonly caEncaisse: Euros;
  readonly caRealise: Euros;
  /**
   * Ce qui est émis et non réglé, compté facture par facture, toutes années.
   *
   * Ce n'est PAS l'écart entre le facturé et l'encaissé de l'année : deux
   * agrégats annuels ne se soustraient pas. Voir `encoursDe`.
   */
  readonly resteARentrer: Euros;
  /** Le total de provision, ventilé par nature — voir `EtatPilote`. */
  readonly provisionsParNature: VentilationProvisions;
  readonly tresorerie: ResultatTresorerie;
  readonly voletConstate: Euros;
  readonly voletAProvisionner: Euros;
  readonly seuils: EtatSeuils;
}

/**
 * Où en est-on des seuils.
 *
 * Chaque seuil est une `Resolution` : il vient d'une table datée qui peut ne
 * pas couvrir la période demandée. Une jauge dessinée sur un seuil inconnu
 * afficherait un pourcentage inventé — et c'est sur ce pourcentage qu'on
 * décide de facturer ou non avant la fin de l'année.
 */
export interface EtatSeuils {
  readonly plafondMicro: Resolution<Euros>;
  readonly franchiseTva: Resolution<SeuilsTva>;
  /** Chiffre d'affaires encaissé de l'année, l'assiette des deux seuils. */
  readonly caEncaisse: Euros;
}

export function etatArgent(
  faits: Faits,
  echeances: readonly Echeance[] = faits.echeances,
  maintenant: Date = new Date()
): EtatArgent {
  const annee = maintenant.getFullYear();
  const parMois = chiffreParMois(faits, annee);
  const caRealise = euros(parMois.reduce<number>((s, m) => s + m.realise, 0));
  const caEncaisse = euros(parMois.reduce<number>((s, m) => s + m.encaisse, 0));
  const pilote = etatPilote(faits, echeances, maintenant);

  const m = moisCourant(maintenant);
  const type = faits.entreprise.typeActivite;

  return {
    seuils: {
      plafondMicro: plafondMicro(m, type),
      franchiseTva: seuilsTva(m, type),
      caEncaisse
    },
    annee,
    parMois,
    caEncaisse,
    caRealise,
    // Compté facture par facture, et sur TOUTES les années : une facture de
    // l'an dernier qui n'est pas réglée reste due au 1er janvier. La borner à
    // l'année en cours ferait disparaître de l'écran exactement celle qu'il
    // faut aller chercher.
    resteARentrer: encoursDe(facturesSuivies(faits, maintenant)).resteARentrer,
    tresorerie: pilote.tresorerie,
    voletConstate: pilote.voletConstate,
    voletAProvisionner: pilote.voletAProvisionner,
    provisionsParNature: pilote.provisionsParNature
  };
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
 * Les avoirs sont écartés : une écriture d'annulation neutralise déjà le
 * montant de la facture qu'elle vise, et compter les deux ferait entrer un
 * montant négatif sans sa contrepartie.
 */
export function dossierTvaDuTrimestre(
  faits: Faits,
  du: DateISO,
  au: DateISO,
  maintenant: Date = new Date()
): DossierTva {
  const encaissements: PieceCollectee[] = faits.recettes
    .filter((r): r is typeof r & { encaisseeLe: DateISO } =>
      r.encaisseeLe !== null && typeof r.annuleEcriture !== 'string')
    .map((r) => ({
      id: r.id,
      numero: r.numero,
      clientNom: r.clientNom,
      encaisseeLe: r.encaisseeLe,
      montantHt: r.montant,
      // `undefined` et `null` disent la même chose ici — la TVA n'a pas été
      // conservée — et le dossier les compte à part plutôt que pour zéro.
      tva: r.tvaCollectee ?? null
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

  return dossierTva({ du, au, encaissements, achats });
}
