/**
 * Sélecteurs : les valeurs dérivées.
 *
 * Rien ici n'est stocké. Tout est recalculé depuis les faits à chaque lecture,
 * ce qui rend impossible la divergence entre un total et les lignes qui le
 * composent — le défaut qui produisait trois totaux différents pour les mêmes
 * recettes dans l'ancienne application.
 *
 * Ces fonctions sont pures et prennent les faits en paramètre : elles se
 * testent sans React et sans magasin.
 */

import {
  type DateISO, type Euros, type Mois, type TypeActivite,
  euros, moisDe
} from '../domain/types';
import { tauxImpotEtContributions } from '../domain/bareme';
import type { RegimeImposition } from '../domain/bareme';
import {
  type Echeance, type RecetteEncaissee,
  provisions as calculerProvisions
} from '../domain/calculs/provisions';
import { type ResultatTresorerie, autonomieMois, calculerTresorerie } from '../domain/calculs/tresorerie';
import {
  type EntreeATraiter, type SujetATraiter,
  sujetsATraiter
} from '../domain/calculs/aTraiter';
import type { Faits } from './schema';

/** Le mois courant, dérivé de l'horloge et jamais codé en dur. */
export function moisCourant(maintenant: Date = new Date()): Mois {
  const mm = String(maintenant.getMonth() + 1).padStart(2, '0');
  return `${maintenant.getFullYear()}-${mm}` as Mois;
}

/** Le régime d'imposition, tel qu'il découle des faits (discriminant D2). */
export function regimeDe(faits: Faits, acomptePasSaisi: Euros = euros(0)): RegimeImposition {
  return faits.entreprise.versementLiberatoire
    ? { regime: 'versement_liberatoire' }
    : { regime: 'bareme', acomptePasSaisi };
}

/**
 * Les recettes encaissées, au format attendu par le calcul de provisions.
 *
 * Seules les recettes réellement encaissées comptent : c'est l'encaissement
 * qui fait naître la dette sociale, pas l'émission de la facture.
 */
export function recettesEncaissees(faits: Faits): readonly RecetteEncaissee[] {
  return faits.recettes
    .filter((r): r is typeof r & { encaisseeLe: DateISO } => r.encaisseeLe !== null)
    .map((r) => ({ id: r.id, montant: r.montant, encaisseeLe: r.encaisseeLe }));
}

/** Chiffre d'affaires encaissé sur une année civile. */
export function caEncaisseAnnee(faits: Faits, annee: number): Euros {
  const prefixe = String(annee);
  return euros(
    recettesEncaissees(faits)
      .filter((r) => r.encaisseeLe.startsWith(prefixe))
      .reduce<number>((somme, r) => somme + r.montant, 0)
  );
}

/**
 * Le solde bancaire.
 *
 * Provisoirement le solde initial : les mouvements bancaires ne sont pas
 * encore modélisés (ils arriveront avec l'écran Achats et le rapprochement).
 * Isolé dans une fonction pour que l'ajout des mouvements n'ait qu'un seul
 * endroit à changer, et pour que l'approximation soit visible plutôt que
 * dispersée dans les écrans.
 */
export function solde(faits: Faits): Euros {
  return faits.soldeInitial;
}

/** Sous ACRE à ce mois, d'après la date de début d'activité et la durée d'ACRE. */
export function sousAcreLe(faits: Faits, dureeTrimestres = 4): (m: Mois) => boolean {
  const debut = faits.entreprise.debutActivite;
  if (!faits.entreprise.acre || debut === null) return () => false;

  const moisDebut = moisDe(debut);
  // L'ACRE court sur un nombre de trimestres à compter du début d'activité.
  const finExclusive = ajouterMois(moisDebut, dureeTrimestres * 3);
  return (m) => m >= moisDebut && m < finExclusive;
}

function ajouterMois(m: Mois, n: number): Mois {
  const [a, mm] = m.split('-');
  const total = Number(a) * 12 + (Number(mm) - 1) + n;
  const annee = Math.floor(total / 12);
  const mois = String((total % 12) + 1).padStart(2, '0');
  return `${annee}-${mois}` as Mois;
}

/**
 * Construit l'entrée de la requête « à traiter » depuis les faits.
 *
 * Le délai de paiement vient du client quand il est connu, sinon d'un défaut :
 * une facture sans délai renseigné ne doit pas être réputée jamais échue, sinon
 * les retards les plus anciens seraient précisément ceux qu'on ne verrait pas.
 */
const DELAI_PAIEMENT_DEFAUT = 30;

export function entreeATraiter(
  faits: Faits,
  echeancesReglementaires: EntreeATraiter['echeancesReglementaires'] = [],
  maintenant: Date = new Date()
): EntreeATraiter {
  const delaiParClient = new Map(faits.clients.map((c) => [c.nom, c.delaiPaiementJours]));
  return {
    aujourdhui: dateISOde(maintenant),
    typeActivite: faits.entreprise.typeActivite,
    recettes: faits.recettes.map((r) => ({
      id: r.id,
      montant: r.montant,
      emiseLe: r.emiseLe,
      encaisseeLe: r.encaisseeLe,
      modeReglement: r.modeReglement,
      clientNom: r.clientNom,
      delaiPaiementJours: delaiParClient.get(r.clientNom) ?? DELAI_PAIEMENT_DEFAUT
    })),
    periodesDeclarees: faits.periodesDeclarees,
    periodicite: faits.entreprise.urssafPeriodicite,
    debutActivite: faits.entreprise.debutActivite === null
      ? null
      : moisDe(faits.entreprise.debutActivite),
    echeancesReglementaires
  };
}

/** Date du jour au format ISO, dérivée de l'horloge locale. */
function dateISOde(d: Date): DateISO {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const jj = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${jj}` as DateISO;
}

/**
 * Échéances réglementaires à date fixe, filtrées sur leur préavis.
 *
 * Ces obligations ne dépendent d'aucun calcul : elles tombent à une date, que
 * l'utilisateur soit prêt ou non.
 */
export const ECHEANCES_REGLEMENTAIRES: readonly {
  readonly id: string;
  readonly intitule: string;
  readonly date: DateISO;
  readonly preavisJours: number;
}[] = [
  {
    id: 'facturation-electronique-reception',
    intitule: 'Facturation électronique : réception obligatoire',
    date: '2026-09-01' as DateISO,
    preavisJours: 120
  }
];

export function echeancesReglementairesActives(
  maintenant: Date = new Date()
): EntreeATraiter['echeancesReglementaires'] {
  const aujourdhui = dateISOde(maintenant);
  return ECHEANCES_REGLEMENTAIRES
    .filter((e) => {
      const jours = Math.round(
        (new Date(e.date).getTime() - new Date(aujourdhui).getTime()) / 86400000
      );
      return jours <= e.preavisJours;
    })
    .map((e) => ({ id: e.id, intitule: e.intitule, date: e.date }));
}

/** Les sujets à traiter, calculés depuis les faits. Jamais stockés. */
export function aTraiter(
  faits: Faits,
  maintenant: Date = new Date()
): readonly SujetATraiter[] {
  return sujetsATraiter(
    entreeATraiter(faits, echeancesReglementairesActives(maintenant), maintenant)
  );
}

export interface EtatPilote {
  readonly tresorerie: ResultatTresorerie;
  readonly voletConstate: Euros;
  readonly voletAProvisionner: Euros;
  readonly autonomie: number | null;
  /**
   * `true` quand le taux d'impôt n'a pas pu être résolu : le calcul est alors
   * incomplet et l'interface doit le dire au lieu d'afficher un chiffre qui a
   * l'air fini.
   */
  readonly tauxImpotIndisponible: boolean;
  readonly motifTauxImpot: string | null;
}

/**
 * L'état de l'écran Pilote : « combien je peux me verser, et qu'est-ce qui
 * coince ». Aucun nombre n'est écrit ici : tout vient des faits et du domaine.
 */
export function etatPilote(
  faits: Faits,
  echeances: readonly Echeance[] = [],
  maintenant: Date = new Date()
): EtatPilote {
  const m = moisCourant(maintenant);
  const type: TypeActivite = faits.entreprise.typeActivite;
  const regime = regimeDe(faits);

  const tauxImpotR = tauxImpotEtContributions(regime, m, type);
  const tauxImpot = tauxImpotR.statut === 'refuse' ? 0 : tauxImpotR.valeur;

  const detail = calculerProvisions(
    echeances,
    recettesEncaissees(faits),
    { mois: faits.periodesDeclarees },
    { typeActivite: type, sousAcreLe: sousAcreLe(faits), tauxImpotEtContributions: tauxImpot }
  );

  const tresorerie = calculerTresorerie(
    { solde: solde(faits), reserve: faits.reserve },
    detail
  );

  return {
    tresorerie,
    voletConstate: detail.voletConstate,
    voletAProvisionner: detail.voletAProvisionner,
    autonomie: autonomieMois(tresorerie.versable, faits.besoinMensuel),
    tauxImpotIndisponible: tauxImpotR.statut === 'refuse',
    motifTauxImpot: tauxImpotR.statut === 'refuse' ? tauxImpotR.motif : null
  };
}
