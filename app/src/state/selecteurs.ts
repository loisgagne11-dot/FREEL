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
import { plafondMicro, seuilsTva, tauxImpotEtContributions } from '../domain/bareme';
import {
  type Periode, dansLaPeriode, periodeCourante
} from '../domain/calculs/periode';
import type { RegimeImposition, SeuilsTva } from '../domain/bareme';
import type { Resolution } from '../domain/types';
import {
  type Echeance, type NatureDette, type RecetteEncaissee,
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
  PERIODES_URSSAF, type PeriodeBareme, fusionnerPeriodes
} from '../domain/bareme/urssaf';
import {
  type EcartConformite, type TotalLivre,
  ecrituresDuLivre, totaliser, verifierConformite
} from '../domain/calculs/livreRecettes';
import {
  type EcritureRapprochable, type MouvementBancaire, type ResumeRapprochement,
  candidatsPour, resumerRapprochement, soldeBancaire
} from '../domain/calculs/banque';
import {
  type DeclarationDes, type DeclarationEnRetard, type PreneurService,
  amendeEncourue, declarationDuMois, declarationsEnRetard
} from '../domain/calculs/des';
import { DELAI_PAIEMENT_DEFAUT, echeanceDe } from '../domain/calculs/facturier';
import type { Depense, Faits, Recette } from './schema';

/**
 * Le barème URSSAF effectivement appliqué.
 *
 * Une seule source pour toute l'application : les périodes livrées avec le
 * code, complétées par celles que l'utilisateur a saisies. Tout calcul qui
 * lirait `PERIODES_URSSAF` directement verrait un barème différent de celui
 * affiché dans Config — exactement le genre de divergence que la refonte
 * cherche à rendre impossible.
 */
export function periodesUrssafEffectives(faits: Faits): readonly PeriodeBareme[] {
  return fusionnerPeriodes(PERIODES_URSSAF, faits.periodesUrssafAjoutees);
}

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
 * Solde initial plus les mouvements importés. Cette fonction avait été isolée
 * dès le départ pour que l'arrivée des mouvements n'ait qu'un seul endroit à
 * changer : c'est ce qui vient de se produire, et aucun écran n'a eu à être
 * touché.
 *
 * Sans relevé importé, elle rend le solde initial — et l'écran doit alors dire
 * que le solde n'est pas suivi, plutôt que d'afficher un chiffre figé comme
 * s'il était à jour. Voir `soldeEstSuivi`.
 */
export function solde(faits: Faits): Euros {
  return soldeBancaire(faits.soldeInitial, faits.mouvementsBancaires);
}

/**
 * Un relevé est-il disponible ?
 *
 * Dérivé, jamais stocké : un booléen `banqueReliee` à `true` pourrait
 * coexister avec une liste de mouvements vide, et rien ne le signalerait.
 */
export function soldeEstSuivi(faits: Faits): boolean {
  return faits.mouvementsBancaires.length > 0;
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
 *
 * Le défaut et le calcul d'échéance viennent de `calculs/facturier` : le suivi
 * des factures applique la MÊME règle, et deux lectures de l'exigibilité
 * finiraient par diverger d'un jour — celui qui décide d'une relance.
 */

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
    periodesUrssaf: periodesUrssafEffectives(faits),
    desEnRetard: declarationsEnRetard(
      faits.recettes, preneursDeServices(faits), dateISOde(maintenant)
    ),
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
/**
 * Les échéances par défaut viennent des FAITS, plus d'une liste vide.
 *
 * Le paramètre existait avec `= []` pour défaut, et aucun appelant ne le
 * renseignait : le volet « échéances émises » valait donc zéro en permanence,
 * et le flux du mois n'avait aucune sortie. L'erreur allait dans le sens
 * dangereux — moins de provisions, donc plus de disponible, donc plus de
 * versable. L'application invitait à se verser de l'argent déjà dû.
 *
 * Le paramètre reste, pour les tests qui veulent poser un jeu précis ; mais
 * son défaut est désormais ce que porte le compte.
 */
export function etatPilote(
  faits: Faits,
  echeances: readonly Echeance[] = faits.echeances,
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
    {
      typeActivite: type,
      sousAcreLe: sousAcreLe(faits),
      tauxImpotEtContributions: tauxImpot,
      periodesUrssaf: periodesUrssafEffectives(faits)
    }
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


/**
 * Les factures émises et non réglées, avec leur échéance.
 *
 * Le délai vient du carnet ; à défaut de client rattaché, on retient le délai
 * légal supplétif plutôt que zéro — une facture ne devient pas exigible le
 * jour de son émission, et l'afficher « en retard » dès le premier jour
 * apprendrait à ignorer l'étiquette.
 */
function recettesEnAttente(
  faits: Faits,
  maintenant: Date = new Date()
): readonly RecetteEnAttente[] {
  const delais = new Map(faits.clients.map((c) => [c.nom, c.delaiPaiementJours]));
  const aujourdhui = dateDuJour(maintenant);

  return faits.recettes
    .filter((r) => r.encaisseeLe === null && r.emiseLe !== null)
    .map((r) => {
      const jours = delais.get(r.clientNom) ?? DELAI_PAIEMENT_DEFAUT;
      const echeanceLe = echeanceDe(r.emiseLe as DateISO, jours);
      return { ...r, echeanceLe, enRetard: echeanceLe < aujourdhui };
    })
    .sort((a, b) => (b.emiseLe as DateISO).localeCompare(a.emiseLe as DateISO));
}

/* ─────────────────────────────────────────────────────────────────────────
   Le flux du mois
   ───────────────────────────────────────────────────────────────────────── */

/** Une ligne du flux : une facture attendue, ou une échéance à payer. */
export interface LigneFlux {
  readonly id: string;
  readonly libelle: string;
  readonly montant: Euros;
  readonly date: DateISO | null;
  /** Ce qui est fait, et ce qui ne l'est pas encore. */
  readonly regle: boolean;
}

export interface FluxDuMois {
  readonly entrees: {
    /** Encaissé sur le mois observé. */
    readonly encaisse: Euros;
    /** Émis et non encore encaissé, tous mois confondus : l'argent qui manque. */
    readonly enAttente: Euros;
    readonly lignes: readonly LigneFlux[];
  };
  readonly sorties: {
    readonly total: Euros;
    /** Échéances déjà émises et non payées : la dette est chiffrée par l'appelant. */
    readonly constate: Euros;
    /** Charges nées d'encaissements non encore déclarés : la dette existe déjà. */
    readonly aProvisionner: Euros;
    readonly lignes: readonly LigneFlux[];
  };
  readonly remuneration: {
    readonly versable: Euros;
    /** Ce qui reste de côté, et qui explique l'écart avec le solde. */
    readonly provisions: Euros;
  };
}

const LIBELLE_NATURE: Readonly<Record<NatureDette, string>> = {
  urssaf: 'Cotisations URSSAF',
  tva: 'TVA',
  impot: 'Impôt sur le revenu',
  cfe: 'CFE',
  cfp: 'Contribution à la formation'
};

/**
 * Le flux du mois : ce qui rentre, ce qui sort, ce qui reste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS COLONNES PARCE QUE CE SONT TROIS QUESTIONS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Combien est rentré ce mois-ci », « combien doit sortir », « combien
 * reste-t-il pour moi » ne se répondent pas avec le même chiffre, et les
 * empiler dans une seule liste oblige à faire la soustraction de tête. La
 * spec de design les met côte à côte ; ce sélecteur les produit d'un seul
 * calcul, pour qu'aucune colonne ne puisse diverger d'une autre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * « EN ATTENTE » N'EST PAS BORNÉ AU MOIS, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'encaissement est daté : le limiter au mois observé a un sens. Une facture
 * impayée, elle, n'appartient à aucun mois — elle traîne. La borner au mois
 * ferait disparaître de l'écran la facture de mars toujours pas réglée en
 * août, c'est-à-dire précisément celle qu'il faut relancer.
 */
export function fluxDuMois(
  faits: Faits,
  m: Mois,
  etat: EtatPilote,
  echeances: readonly Echeance[] = faits.echeances
): FluxDuMois {
  const encaisseesDuMois = faits.recettes.filter(
    (r) => r.encaisseeLe !== null && r.encaisseeLe.startsWith(m)
  );
  // Une écriture d'annulation porte un montant négatif : elle doit diminuer
  // l'encaissé, pas s'y ajouter comme une recette de plus.
  const enAttente = faits.recettes.filter((r) => r.emiseLe !== null && r.encaisseeLe === null);

  const echeancesDuMois = echeances.filter((e) => e.echeanceLe.startsWith(m));

  const total = (liste: readonly { readonly montant: Euros }[]): Euros =>
    euros(liste.reduce((s, x) => s + x.montant, 0));

  return {
    entrees: {
      encaisse: total(encaisseesDuMois),
      enAttente: total(enAttente),
      lignes: [
        ...encaisseesDuMois.map((r) => ({
          id: r.id,
          libelle: r.clientNom !== '' ? r.clientNom : r.libelle,
          montant: r.montant,
          date: r.encaisseeLe,
          regle: true
        })),
        ...enAttente.map((r) => ({
          id: r.id,
          libelle: r.clientNom !== '' ? r.clientNom : r.libelle,
          montant: r.montant,
          date: r.emiseLe,
          regle: false
        }))
      ]
    },
    sorties: {
      // Le total vient des PROVISIONS, pas de la liste d'échéances.
      //
      // Tant qu'aucune échéance n'est saisie, la liste est vide — mais la
      // dette, elle, existe : elle naît de l'encaissement. Additionner la
      // liste afficherait « 0 € de sorties » à quelqu'un qui doit plusieurs
      // milliers d'euros de cotisations, ce qui est le pire chiffre possible
      // sur cet écran.
      total: etat.tresorerie.provisions,
      constate: etat.voletConstate,
      aProvisionner: etat.voletAProvisionner,
      lignes: echeancesDuMois.map((e) => ({
        id: e.id,
        libelle: LIBELLE_NATURE[e.nature],
        montant: e.montant,
        date: e.echeanceLe,
        regle: e.payee
      }))
    },
    remuneration: {
      versable: etat.tresorerie.versable,
      provisions: etat.tresorerie.provisions
    }
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Déclaration européenne de services
   ───────────────────────────────────────────────────────────────────────── */

/** Les clients, indexés par nom, au format attendu par le calcul de DES. */
export function preneursDeServices(faits: Faits): ReadonlyMap<string, PreneurService> {
  return new Map(faits.clients.map((c) => [
    c.nom,
    { nom: c.nom, pays: c.pays, tvaIntracom: c.tvaIntracom }
  ]));
}

export interface EtatDes {
  readonly moisAffiche: Mois;
  readonly declaration: DeclarationDes;
  readonly retards: readonly DeclarationEnRetard[];
  readonly amendeEncourue: Euros;
  /**
   * `true` quand l'entreprise n'a pas de numéro de TVA intracommunautaire.
   *
   * Il en faut un pour déposer une DES, y compris en franchise en base. Sans
   * lui, l'écran doit dire qu'il faut le demander plutôt que d'afficher une
   * déclaration qu'on ne pourra pas transmettre.
   */
  readonly sansNumeroIntracom: boolean;
}

export function etatDes(
  faits: Faits,
  m: Mois,
  maintenant: Date = new Date()
): EtatDes {
  const preneurs = preneursDeServices(faits);
  const retards = declarationsEnRetard(faits.recettes, preneurs, dateDuJour(maintenant));

  return {
    moisAffiche: m,
    declaration: declarationDuMois(faits.recettes, preneurs, m),
    retards,
    amendeEncourue: amendeEncourue(retards),
    sansNumeroIntracom: faits.entreprise.tvaIntracom.trim() === ''
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Livre des recettes
   ───────────────────────────────────────────────────────────────────────── */

export interface EtatLivre {
  readonly ecritures: readonly Recette[];
  readonly total: TotalLivre;
  readonly ecarts: readonly EcartConformite[];
  /** Écarts rattachés à une écriture, pour les afficher sur la ligne. */
  readonly ecartsParEcriture: ReadonlyMap<string, readonly EcartConformite[]>;
  /** Factures émises et non encaissées : elles n'entrent pas encore au livre. */
  readonly enAttente: readonly RecetteEnAttente[];
}

/**
 * Une facture émise, en attente de règlement.
 *
 * `enRetard` est calculé ICI, pas dans l'écran : c'est une règle — l'échéance
 * dépend du délai convenu avec le client, qui se lit dans le carnet. Un écran
 * qui la recalculerait à sa façon finirait par en donner une autre lecture.
 */
export interface RecetteEnAttente extends Recette {
  readonly echeanceLe: DateISO | null;
  readonly enRetard: boolean;
}

/**
 * L'état du livre des recettes.
 *
 * Le registre ne contient QUE des encaissements : une facture émise et non
 * réglée n'y figure pas, et l'y faire figurer serait déclarer une recette qui
 * n'a pas eu lieu. Elle est rendue à part, pour rester visible sans être
 * comptée.
 */
export function etatLivre(faits: Faits): EtatLivre {
  const ecarts = verifierConformite(faits.recettes);
  const parEcriture = new Map<string, EcartConformite[]>();
  for (const ecart of ecarts) {
    if (ecart.ecritureId === null) continue;
    const liste = parEcriture.get(ecart.ecritureId);
    if (liste) liste.push(ecart); else parEcriture.set(ecart.ecritureId, [ecart]);
  }

  return {
    ecritures: ecrituresDuLivre(faits.recettes) as readonly Recette[],
    total: totaliser(faits.recettes),
    ecarts,
    ecartsParEcriture: parEcriture,
    enAttente: recettesEnAttente(faits)
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Écran Activité
   ───────────────────────────────────────────────────────────────────────── */


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
    // Jamais négatif : un encaissé supérieur au réalisé de l'année signifie
    // qu'on a encaissé des factures d'une année antérieure, pas qu'il reste
    // un montant négatif à rentrer.
    resteARentrer: euros(Math.max(0, caRealise - caEncaisse)),
    tresorerie: pilote.tresorerie,
    voletConstate: pilote.voletConstate,
    voletAProvisionner: pilote.voletAProvisionner
  };
}
