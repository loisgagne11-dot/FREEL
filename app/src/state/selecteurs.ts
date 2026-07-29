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
import {
  type ContexteDepenses, type EtatRapprochement, type RegimeTva,
  type ResumeDepenses, type TvaDepense,
  rapprochementEffectif, resumerDepenses, tvaDeDepense
} from '../domain/calculs/depenses';
import {
  type DelaiClient, type Jour, type PlanDeCharge,
  calendrierDuMois, chargeDuMois, delaisParClient, planDeCharge
} from '../domain/calculs/activite';
import type { Depense, Faits, Mission } from './schema';

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

/* ─────────────────────────────────────────────────────────────────────────
   Écran Activité
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Tarif journalier par nom de client.
 *
 * Une mission active l'emporte sur une mission terminée : c'est le tarif en
 * vigueur qui convertit une recette récente en jours, pas celui d'un contrat
 * clos il y a deux ans.
 */
export function tarifsParClient(faits: Faits): ReadonlyMap<string, Euros> {
  const tarifs = new Map<string, Euros>();
  for (const m of [...faits.missions].sort(prioriteMission)) {
    const nom = m.clientNom;
    if (nom === '' || m.tjm <= 0) continue;
    if (!tarifs.has(nom)) tarifs.set(nom, m.tjm);
  }
  return tarifs;
}

/** Les missions actives d'abord, puis les terminées, puis les prospects. */
function prioriteMission(a: Mission, b: Mission): number {
  const rang = (m: Mission) => (m.statut === 'active' ? 0 : m.statut === 'terminee' ? 1 : 2);
  return rang(a) - rang(b);
}

/** Une mission accompagnée de ce qu'elle a produit. */
export interface LigneMission {
  readonly mission: Mission;
  readonly facture: Euros;
  readonly encaisse: Euros;
  readonly resteARentrer: Euros;
}

export interface EtatActivite {
  readonly mois: Mois;
  readonly calendrier: readonly Jour[];
  readonly plan: PlanDeCharge;
  /** Recettes du mois dont le tarif est inconnu : la mesure est partielle. */
  readonly recettesSansTarif: number;
  readonly missions: readonly LigneMission[];
  readonly delais: readonly DelaiClient[];
  /** Jours de congé posés sur l'année du mois affiché. */
  readonly congesDeLAnnee: number;
}

/**
 * L'état de l'écran Activité, pour un mois donné.
 *
 * Le mois est un paramètre et non une constante : l'ancienne application
 * recalculait tout sur « le mois courant » lu à l'affichage, si bien que
 * consulter un mois passé était impossible sans changer l'horloge du poste.
 */
export function etatActivite(
  faits: Faits,
  m: Mois,
  maintenant: Date = new Date()
): EtatActivite {
  const tarifs = tarifsParClient(faits);
  const charge = chargeDuMois(faits.recettes, tarifs, m);
  const annee = m.slice(0, 4);

  return {
    mois: m,
    calendrier: calendrierDuMois(m, faits.conges),
    plan: planDeCharge(m, faits.conges, charge.jours),
    recettesSansTarif: charge.recettesSansTarif,
    missions: lignesDeMission(faits),
    delais: delaisParClient(faits.recettes, dateDuJour(maintenant)),
    congesDeLAnnee: faits.conges.filter((d) => d.startsWith(annee)).length
  };
}

/**
 * Ce que chaque mission a produit.
 *
 * Le rattachement se fait par nom de client, l'ancien modèle ne portant pas de
 * lien entre une facture et la mission qui l'a produite. Un client à plusieurs
 * missions voit donc son chiffre d'affaires porté par la première d'entre
 * elles : c'est une approximation, et l'écran ne la présente pas autrement.
 */
function lignesDeMission(faits: Faits): readonly LigneMission[] {
  const dejaCompte = new Set<string>();
  return [...faits.missions].sort(prioriteMission).map((mission) => {
    const premiere = !dejaCompte.has(mission.clientNom);
    dejaCompte.add(mission.clientNom);
    const recettes = premiere
      ? faits.recettes.filter((r) => r.clientNom === mission.clientNom)
      : [];

    const facture = recettes.reduce<number>((s, r) => s + r.montant, 0);
    const encaisse = recettes
      .filter((r) => r.encaisseeLe !== null)
      .reduce<number>((s, r) => s + r.montant, 0);

    return {
      mission,
      facture: euros(facture),
      encaisse: euros(encaisse),
      resteARentrer: euros(facture - encaisse)
    };
  });
}

/** La date du jour, au format ISO, sans passer par le fuseau local. */
export function dateDuJour(maintenant: Date = new Date()): DateISO {
  return maintenant.toISOString().slice(0, 10) as DateISO;
}

/* ─────────────────────────────────────────────────────────────────────────
   Écran Achats
   ───────────────────────────────────────────────────────────────────────── */

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
    banqueSynchronisee: faits.banqueReliee
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
  /** Dépenses dont la date de paiement manque : ni exercice, ni régime. */
  readonly sansDate: number;
}

/**
 * L'état de l'écran Achats.
 *
 * Les dépenses sont rendues de la plus récente à la plus ancienne, celles sans
 * date en tête : une dépense non datée est le premier problème à traiter, pas
 * une ligne à reléguer en bas de liste.
 */
export function etatAchats(faits: Faits, maintenant: Date = new Date()): EtatAchats {
  const contexte = contexteDepense(faits, maintenant);

  const lignes = [...faits.depenses]
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
    lignes,
    resume: resumerDepenses(faits.depenses, contexte),
    banqueReliee: faits.banqueReliee,
    sansDate: faits.depenses.filter((d) => d.payeeLe === null).length
  };
}

function comparerParDate(a: Depense, b: Depense): number {
  if (a.payeeLe === null) return b.payeeLe === null ? 0 : -1;
  if (b.payeeLe === null) return 1;
  return b.payeeLe.localeCompare(a.payeeLe);
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
  /** Écart entre facturé et encaissé : ce qui reste à rentrer. */
  readonly resteARentrer: Euros;
  readonly tresorerie: ResultatTresorerie;
  readonly voletConstate: Euros;
  readonly voletAProvisionner: Euros;
}

export function etatArgent(
  faits: Faits,
  echeances: readonly Echeance[] = [],
  maintenant: Date = new Date()
): EtatArgent {
  const annee = maintenant.getFullYear();
  const parMois = chiffreParMois(faits, annee);
  const caRealise = euros(parMois.reduce<number>((s, m) => s + m.realise, 0));
  const caEncaisse = euros(parMois.reduce<number>((s, m) => s + m.encaisse, 0));
  const pilote = etatPilote(faits, echeances, maintenant);

  return {
    annee,
    parMois,
    caEncaisse,
    caRealise,
    // Jamais négatif : un encaissé supérieur au réalisé de l'année signifie
    // qu'on a encaissé des factures d'une année antérieure, pas qu'il reste
    // un montant négatif à rentrer.
    resteARentrer: euros(Math.max(0, caRealise - caEncaisse)),
    tresorerie: pilote.tresorerie,
    voletConstate: pilote.voletConstate,
    voletAProvisionner: pilote.voletAProvisionner
  };
}
