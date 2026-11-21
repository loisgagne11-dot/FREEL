/**
 * La Trésorerie à douze mois (lot 49) : ce que le compte a fait, ce qu'il
 * fera, et les seuils de l'année. Chargé avec l'écran, jamais au premier
 * rendu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE SEULE PROJECTION, LUE DE TROIS FAÇONS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les mois à venir viennent tous de `etatProjection` — le versement tenable,
 * le disponible, le solde prévu, ce qui entre et ce qui sort. La vue « douze
 * mois », la vue « année » et les deux « et si » la lisent ; aucune n'en
 * refait une. Un « et si » ne la recopie pas non plus : il change les FAITS
 * qu'elle lit (`faitsDuScenario`), en mémoire, et elle refait le même calcul.
 */

import { type DateISO, type Euros, type Mois, type Resolution, euros } from '../domain/types';
import { type NatureDette, type VentilationProvisions, estPayee } from '../domain/calculs/provisions';
import type { ResultatTresorerie } from '../domain/calculs/tresorerie';
import type { SortieDeCharge } from '../domain/calculs/sortiesDeCharges';
import { decalerMois } from '../domain/calculs/periode';
import { type Franchissement, franchissementPrevu } from '../domain/calculs/allure';
import {
  type FranchissementPipeline, franchissementParLePipeline, joursFacturablesAvantSeuil
} from '../domain/calculs/seuilsPipeline';
import type { Faits, Mission } from './schema';
import {
  dateDuJour, echeancesDuComptePro, etatPilote, moisCourant, recettesEncaissees, remunerationDuMois, solde,
  tvaDesDepensesPayees, vlAu
} from './selecteurs';
import { moisDeclares } from '../domain/calculs/declarations.declarees';
import { type EtatProjection, type EtatSeuils, etatArgent, etatProjection } from './selecteurs.argent';
import { encaissementsAttendusParMois, finDuMoisISO } from './selecteurs.pipeline';

/* ─────────────────────────────────────────────────────────────────────────
   Les « et si » : des faits changés en mémoire, jamais enregistrés
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Un « et si » de l'écran. ÉTAT D'ÉCRAN, jamais un fait : rien de ceci n'est
 * persisté, et quitter l'écran le remet à zéro.
 */
export interface ScenarioTresorerie {
  /** Compter les prospects comme signés — en entier. */
  readonly prospects: boolean;
  /** Arrêter une mission signée à une date : son planning d'après disparaît. */
  readonly arret: { readonly missionId: string; readonly le: DateISO } | null;
}

export const SANS_SCENARIO: ScenarioTresorerie = { prospects: false, arret: null };

export const scenarioActif = (s: ScenarioTresorerie): boolean => s.prospects || s.arret !== null;

/**
 * Les faits tels que le « et si » les suppose.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN PROSPECT COMPTE EN ENTIER, OU PAS DU TOUT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Si signé » : le prospect devient une mission signée, son planning entre
 * au pipeline tel qu'il est. Pas pondéré par sa probabilité — 40 % d'une
 * mission de 12 000 € n'arrive jamais sur un compte : ce sont 12 000 € ou
 * rien. Un montant pondéré ferait dessiner une courbe qu'aucun avenir ne
 * suivra.
 *
 * L'arrêt coupe les plages de rythme et les journées ajustées après la date —
 * c'est le planning qui fait le pipeline, pas la date de fin de la fiche. Les
 * factures déjà émises restent : elles sont parties.
 */
export function faitsDuScenario(faits: Faits, s: ScenarioTresorerie): Faits {
  if (!scenarioActif(s)) return faits;
  const arreter = (m: Mission, le: DateISO): Mission => ({
    ...m,
    fin: m.fin === null || m.fin > le ? le : m.fin,
    entites: m.entites.map((e) => ({
      ...e,
      rythmes: e.rythmes.filter((r) => r.du <= le).map((r) => (r.au > le ? { ...r, au: le } : r)),
      ajustements: Object.fromEntries(Object.entries(e.ajustements).filter(([d]) => d <= le))
    }))
  });
  return {
    ...faits,
    missions: faits.missions.map((m) => {
      const signee = s.prospects && m.statut === 'prospect' ? { ...m, statut: 'active' as const } : m;
      return s.arret !== null && s.arret.missionId === m.id ? arreter(signee, s.arret.le) : signee;
    })
  };
}

/** Les missions qu'un « et si » peut arrêter : signées et pas finies. */
export function missionsArretables(faits: Faits, aujourdhui: DateISO): readonly Mission[] {
  return faits.missions.filter((m) => m.statut === 'active' && (m.fin === null || m.fin > aujourdhui));
}

/* ─────────────────────────────────────────────────────────────────────────
   Le passé : le disponible d'une fin de mois, reconstitué depuis les faits
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Les faits tels qu'ils étaient connus le soir de `d`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DISPONIBLE D'UN MOIS PASSÉ SE RECALCULE, IL NE SE STOCKE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le solde d'une fin de mois est un fait (`soldeAuDernierJourDe`). Le dû de
 * ce jour-là aussi, à condition de ne lire que ce qui existait : un
 * encaissement d'après n'était pas encaissé, une échéance payée après ne
 * l'était pas, une déclaration faite après n'était pas faite. La même règle
 * du dû, appliquée à ces faits-là, donne le dû de ce soir-là — et le
 * disponible qu'on lisait. Aucun nombre n'est gardé de mois en mois : il
 * aurait cessé d'être juste à la première facture corrigée.
 *
 * Ce que les faits ne datent pas reste tel qu'aujourd'hui : une déclaration
 * sans date est réputée faite, une échéance compte dès sa date — ou dès la
 * déclaration qui l'a appelée. C'est dit dans l'aide de la courbe.
 */
export function faitsAu(faits: Faits, d: DateISO): Faits {
  const apres = (x: DateISO | null | undefined): boolean => x != null && x > d;
  const declarees = faits.periodesDeclarees.filter((p) => !apres(p.declareeLe));
  const moisDeclares = new Set(declarees.filter((p) => p.nature === 'urssaf').map((p) => p.periode));
  const appelee = (periode: string | null | undefined): boolean => typeof periode === 'string'
    && (/T\d$/u.test(periode)
      ? [0, 1, 2].every((k) => moisDeclares.has(
        `${periode.slice(0, 4)}-${String((Number(periode.slice(6)) - 1) * 3 + 1 + k).padStart(2, '0')}`))
      : moisDeclares.has(periode));
  return {
    ...faits,
    recettes: faits.recettes
      .filter((r) => !(apres(r.emiseLe) && (r.encaisseeLe === null || apres(r.encaisseeLe))))
      .map((r) => (apres(r.encaisseeLe) ? { ...r, encaisseeLe: null, modeReglement: null } : r)),
    depenses: faits.depenses.map((x) => (apres(x.payeeLe) ? { ...x, payeeLe: null } : x)),
    echeances: faits.echeances
      .filter((e) => !apres(e.echeanceLe) || (e.payeeLe !== null && !apres(e.payeeLe)) || appelee(e.periode))
      .map((e) => (apres(e.payeeLe) ? { ...e, payeeLe: null, montantPaye: null } : e)),
    periodesDeclarees: declarees,
    mouvementsBancaires: faits.mouvementsBancaires.filter((m) => !apres(m.date))
  };
}

/** Midi le jour dit, à l'heure de la personne : `moisCourant` lit l'heure locale. */
const midi = (d: DateISO): Date => new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)), 12);

/**
 * Le disponible et le solde à la fin d'un mois passé, ou `null` quand le mois
 * s'achève avant le solde de départ : rien n'y est connu.
 */
function finDeMoisConstatee(faits: Faits, m: Mois): { readonly disponible: Euros; readonly solde: Euros } | null {
  const fin = finDuMoisISO(m);
  if (faits.soldeInitialAu !== null && fin <= faits.soldeInitialAu) return null;
  const alors = faitsAu(faits, fin);
  const t = etatPilote(alors, alors.echeances, midi(fin)).tresorerie;
  return { disponible: t.dispo, solde: t.solde };
}

/* ─────────────────────────────────────────────────────────────────────────
   Un mois de trésorerie, constaté ou prévu
   ───────────────────────────────────────────────────────────────────────── */

export interface MoisDeTresorerie {
  readonly mois: Mois;
  /** `constate` : un mois clos, lu dans les faits ; `prevu` : la projection. */
  readonly nature: 'constate' | 'prevu';
  /** Encaissé (constaté) ou attendu (prévu), hors taxes comme le pipeline. */
  readonly entrees: Euros;
  /** Prévu : la part des factures émises, à leur échéance. */
  readonly entreesFactures: Euros;
  /** Prévu : la part du planning signé, au délai de paiement du client. */
  readonly entreesPlanning: Euros;
  /** Le dû qui quitte le compte ce mois-ci, ligne par ligne. */
  readonly charges: readonly SortieDeCharge[];
  /** Ce qui sort pour toi : versé (constaté), versement tenable (prévu). */
  readonly pourToi: Euros;
  /** Dépenses payées (constaté), moyenne des six derniers mois (prévu). */
  readonly depenses: Euros;
  /** Constaté : les autres débits du relevé (mis de côté pour l'impôt, autre). */
  readonly autres: Euros;
  readonly sorties: Euros;
  /** Le disponible à la fin du mois — versement tenable pris, pour un mois prévu. `null` : inconnu. */
  readonly disponible: Euros | null;
  /** Prévu : le disponible sans rien te verser. */
  readonly disponibleSansVersement: Euros | null;
  /** Le solde du compte à la fin du mois. */
  readonly solde: Euros | null;
}

const somme = (xs: readonly number[]): Euros => euros(xs.reduce((t, x) => t + x, 0));

/** Un mois clos, tel que les faits le disent. */
export function moisConstate(faits: Faits, m: Mois): MoisDeTresorerie {
  const dans = (d: DateISO | null | undefined): boolean => d != null && d.startsWith(m);
  const entrees = somme(recettesEncaissees(faits).filter((r) => dans(r.encaisseeLe)).map((r) => r.montant));
  const charges: SortieDeCharge[] = echeancesDuComptePro(faits)
    .filter((e) => estPayee(e) && dans(e.payeeLe))
    .map((e) => ({
      nature: e.nature, le: e.payeeLe as DateISO, montant: e.montantPaye ?? e.montant, origine: 'du'
    }));
  const pourToi = remunerationDuMois(faits, m);
  const depenses = somme(faits.depenses.filter((x) => dans(x.payeeLe)).map((x) => x.montantTtc));
  const autres = somme(faits.mouvementsBancaires
    .filter((mv) => !mv.ignoree && dans(mv.date) && mv.montant < 0
      && (mv.sansContrepartie === 'impot' || mv.sansContrepartie === 'autre'))
    .map((mv) => -mv.montant));
  const fin = finDeMoisConstatee(faits, m);
  return {
    mois: m,
    nature: 'constate',
    entrees,
    entreesFactures: euros(0),
    entreesPlanning: euros(0),
    charges,
    pourToi,
    depenses,
    autres,
    sorties: somme([...charges.map((c) => c.montant), pourToi, depenses, autres]),
    disponible: fin?.disponible ?? null,
    disponibleSansVersement: null,
    solde: fin?.solde ?? null
  };
}

/** Les douze mois de la projection, lus mois par mois. */
function moisPrevus(p: EtatProjection): readonly MoisDeTresorerie[] {
  const v = p.projection.versementMensuel;
  return p.projection.mois.map((m, i) => {
    const charges = p.sorties[i] ?? [];
    return {
      mois: m.mois,
      nature: 'prevu',
      entrees: m.encaissements,
      entreesFactures: p.attendus[i]?.factures ?? euros(0),
      entreesPlanning: p.attendus[i]?.planning ?? euros(0),
      charges,
      pourToi: v,
      depenses: m.depenses,
      autres: euros(0),
      sorties: somme([m.chargesPayees, v, m.depenses]),
      disponible: m.avecVersement,
      disponibleSansVersement: m.sansVersement,
      solde: m.solde
    };
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Les douze mois à venir — la vue par défaut
   ───────────────────────────────────────────────────────────────────────── */

/** Combien de mois constatés précèdent aujourd'hui, pour le contexte (maquette). */
export const MOIS_CONSTATES = 3;

export interface ResumeDeProjection {
  readonly versementTenable: Euros;
  readonly moisContraignant: Mois | null;
  readonly pointBas: { readonly mois: Mois; readonly montant: Euros } | null;
  /** Le disponible de chaque mois prévu, ce versement pris chaque mois. */
  readonly disponibles: readonly Euros[];
}

/**
 * Une ligne de « Ce qui est dû » : une charge telle qu'on la paie — l'URSSAF
 * et la formation ensemble, puisqu'elles partent ensemble.
 */
export interface LigneDuDu {
  readonly cle: 'urssaf' | 'impot' | 'tva' | 'cfe';
  readonly natures: readonly NatureDette[];
  readonly montant: Euros;
  /** Le prochain jour où une part en sort ; `null` quand rien n'est daté. */
  readonly prochaine: DateISO | null;
  /** URSSAF : le premier mois encaissé et pas encore déclaré. */
  readonly depuis: Mois | null;
  /** Impôt : payé avec l'URSSAF (versement libératoire au mois courant). */
  readonly avecUrssaf: boolean;
  /** TVA : une part vient d'un achat autoliquidé. */
  readonly autoliquidee: boolean;
}

export interface TresorerieDouzeMois extends ResumeDeProjection {
  readonly aujourdhui: DateISO;
  readonly moisCourant: Mois;
  readonly disponible: Euros;
  readonly solde: Euros;
  readonly reserve: Euros;
  /** Le solde d'aujourd'hui découpé — dû, disponible, réserve, à te verser : celui du Pilote. */
  readonly tresorerie: ResultatTresorerie;
  /** Ce qu'on s'est versé ce mois-ci, lu au relevé. */
  readonly verseCeMois: Euros;
  /** Trois mois constatés, puis le mois courant et les onze suivants, prévus. */
  readonly mois: readonly MoisDeTresorerie[];
  readonly depensesMensuelles: Euros | null;
  readonly tauxDeCharges: number | null;
  /** Le dernier mois prévu, dans les deux scénarios — « Dans un an : … ». */
  readonly dansUnAn: { readonly sansVersement: Euros; readonly avecVersement: Euros; readonly verseCumule: Euros } | null;
  /** Ce qui est dû, par charge, avec ses dates — dans l'ordre de la maquette. */
  readonly du: readonly LigneDuDu[];
}

const resume = (p: EtatProjection): ResumeDeProjection => ({
  versementTenable: p.projection.versementMensuel,
  moisContraignant: p.projection.moisContraignant,
  pointBas: p.projection.pointBas,
  disponibles: p.projection.mois.map((m) => m.avecVersement)
});

export function tresorerieDouzeMois(faits: Faits, maintenant: Date = new Date()): TresorerieDouzeMois {
  const m0 = moisCourant(maintenant);
  const p = etatProjection(faits, maintenant);
  const pilote = etatPilote(faits, faits.echeances, maintenant);
  const constates = Array.from({ length: MOIS_CONSTATES }, (_, i) => moisConstate(faits, decalerMois(m0, i - MOIS_CONSTATES)));
  const dernier = p.projection.mois[p.projection.mois.length - 1];
  return {
    ...resume(p),
    aujourdhui: dateDuJour(maintenant),
    moisCourant: m0,
    disponible: p.projection.depart,
    solde: p.solde,
    reserve: faits.reserve,
    tresorerie: pilote.tresorerie,
    verseCeMois: remunerationDuMois(faits, m0),
    mois: [...constates, ...moisPrevus(p)],
    depensesMensuelles: p.depensesMensuelles,
    tauxDeCharges: p.tauxDeCharges,
    dansUnAn: dernier === undefined ? null : {
      sansVersement: dernier.sansVersement, avecVersement: dernier.avecVersement, verseCumule: dernier.verseCumule
    },
    du: lignesDuDu(faits, p, pilote.provisionsParNature, maintenant)
  };
}

/**
 * La même projection, sur les faits d'un « et si » — `null` sans « et si ».
 * Séparée de `tresorerieDouzeMois` : basculer un « et si » ne refait pas le
 * passé ni le dû, qui n'en dépendent pas.
 */
export function projectionDuScenario(
  faits: Faits, scenario: ScenarioTresorerie, maintenant: Date = new Date()
): ResumeDeProjection | null {
  return scenarioActif(scenario) ? resume(etatProjection(faitsDuScenario(faits, scenario), maintenant)) : null;
}

/**
 * Les quatre lignes de « Ce qui est dû », chacune avec ce qui la date. Les
 * montants viennent de la ventilation du dû (`provisionsParNature`), les dates
 * du même dû posé à ses échéances : la ligne et la marche du solde prévu
 * lisent le même calcul.
 */
function lignesDuDu(
  faits: Faits, p: EtatProjection, parNature: VentilationProvisions, maintenant: Date
): readonly LigneDuDu[] {
  const declares = new Set(moisDeclares(faits.periodesDeclarees));
  const nonDeclares = recettesEncaissees(faits)
    .map((r) => r.encaisseeLe.slice(0, 7) as Mois)
    .filter((m) => !declares.has(m))
    .sort();
  const ligne = (cle: LigneDuDu['cle'], natures: readonly NatureDette[]): LigneDuDu => {
    const dates = p.duDate.filter((s) => natures.includes(s.nature)).map((s) => s.le).sort();
    return {
      cle,
      natures,
      montant: somme(natures.map((n) => parNature[n])),
      /* La plus proche, en retard comprise : un trimestre dont la limite est
         passée presse plus que le suivant. Le jeu d'essai l'a montré — le
         troisième trimestre, non déclaré au 15 décembre, se cachait derrière
         « à payer le 1ᵉʳ février ». */
      prochaine: dates[0] ?? null,
      depuis: cle === 'urssaf' ? nonDeclares[0] ?? null : null,
      avecUrssaf: cle === 'impot' && vlAu(faits, moisCourant(maintenant)),
      autoliquidee: cle === 'tva' && tvaDesDepensesPayees(faits).autoliquidee > 0
    };
  };
  return [ligne('urssaf', ['urssaf', 'cfp']), ligne('impot', ['impot']), ligne('tva', ['tva']), ligne('cfe', ['cfe'])];
}

/* ─────────────────────────────────────────────────────────────────────────
   L'année civile — pour relire le passé
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Les douze mois d'une année civile : clos, ils sont constatés ; à venir, ils
 * sont ceux de la projection — la même, pas une seconde. Au-delà de ses douze
 * mois, rien n'est prévu, et le mois reste vide plutôt que de prolonger une
 * fiction : `null` partout.
 */
export function tresorerieDeLAnnee(
  faits: Faits,
  annee: number,
  maintenant: Date = new Date()
): readonly MoisDeTresorerie[] {
  const m0 = moisCourant(maintenant);
  const moisAnnee = Array.from({ length: 12 }, (_, i) => `${annee}-${String(i + 1).padStart(2, '0')}` as Mois);
  const prevus = moisAnnee.some((m) => m >= m0) ? moisPrevus(etatProjection(faits, maintenant)) : [];
  const parMois = new Map(prevus.map((x) => [x.mois, x]));
  return moisAnnee.map((m) => {
    if (m < m0) return moisConstate(faits, m);
    return parMois.get(m) ?? {
      mois: m, nature: 'prevu', entrees: euros(0), entreesFactures: euros(0), entreesPlanning: euros(0),
      charges: [], pourToi: euros(0), depenses: euros(0), autres: euros(0), sorties: euros(0),
      disponible: null, disponibleSansVersement: null, solde: null
    };
  });
}

/** Le solde et le disponible d'aujourd'hui : le point « aujourd'hui » des deux vues. */
export function aujourdhuiDeTresorerie(faits: Faits, maintenant: Date = new Date()): { readonly disponible: Euros; readonly solde: Euros } {
  return { disponible: etatPilote(faits, faits.echeances, maintenant).tresorerie.dispo, solde: solde(faits) };
}

/* ─────────────────────────────────────────────────────────────────────────
   Les seuils de l'année
   ───────────────────────────────────────────────────────────────────────── */

export interface SeuilDeLAnnee {
  readonly nom: 'plafond' | 'franchise' | 'majore';
  readonly seuil: Euros;
  readonly encaisse: Euros;
  /** Franchi par ce qui est émis et signé, encaissé à son échéance. */
  readonly parLePipeline: FranchissementPipeline;
  /** Franchi au rythme de l'encaissé depuis janvier, prolongé — la source d'avant, inchangée. */
  readonly auRythme: Franchissement;
  readonly joursFacturables: Resolution<number>;
}

export interface SeuilsDeLAnnee {
  readonly annee: number;
  readonly seuils: EtatSeuils;
  readonly lignes: readonly SeuilDeLAnnee[];
}

/**
 * Les trois seuils de l'année — plafond du régime, franchise de TVA, seuil
 * majoré —, chacun avec ses deux dates de franchissement et les jours
 * facturables qui restent. Les montants des seuils et l'encaissé viennent de
 * `etatArgent` : la jauge et ses dates lisent la même assiette.
 */
export function seuilsDeLAnnee(faits: Faits, maintenant: Date = new Date()): SeuilsDeLAnnee {
  const etat = etatArgent(faits, faits.echeances, maintenant);
  const aujourdhui = dateDuJour(maintenant);
  const m0 = moisCourant(maintenant);
  const annee = etat.annee;
  const reste = Array.from({ length: 13 - Number(m0.slice(5, 7)) }, (_, i) => decalerMois(m0, i));
  const attendu = encaissementsAttendusParMois(faits, reste, maintenant);
  const attendus = reste.map((m) => ({ mois: m, montant: euros(attendu.get(m) ?? 0) }));
  const debut = `${annee}-01-01`;
  const finAnnee = `${annee}-12-31`;
  const tjms = faits.missions
    .filter((m) => (m.statut === 'active' || m.statut === 'terminee')
      && (m.debut === null || m.debut <= finAnnee) && (m.fin === null || m.fin >= debut))
    .map((m) => m.tjm);
  const encaisse = etat.seuils.caEncaisse;
  const ligne = (nom: SeuilDeLAnnee['nom'], seuil: Euros): SeuilDeLAnnee => ({
    nom, seuil, encaisse,
    parLePipeline: franchissementParLePipeline(encaisse, seuil, attendus),
    auRythme: franchissementPrevu(encaisse, seuil, aujourdhui),
    joursFacturables: joursFacturablesAvantSeuil({ seuil, dejaCompte: encaisse, tjms, mois: m0, aujourdhui })
  });
  const { plafondMicro, franchiseTva } = etat.seuils;
  return {
    annee,
    seuils: etat.seuils,
    lignes: [
      ...(plafondMicro.statut === 'refuse' ? [] : [ligne('plafond', plafondMicro.valeur)]),
      ...(franchiseTva.statut === 'refuse' ? [] : [
        ligne('franchise', franchiseTva.valeur.franchise), ligne('majore', franchiseTva.valeur.majore)
      ])
    ]
  };
}
