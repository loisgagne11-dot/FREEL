/**
 * Ce que je gagne vraiment (lot 50) — les calculs d'Activité › Analyse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS CHIFFRES VOISINS, AUCUN QUI RÉPONDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Résultat projeté ~33 900 € après cotisations », « ce qu'il te reste,
 * charges déduites : 288 € par jour », le versable : aucun ne répond à la
 * question qu'un indépendant se pose le plus — combien je gagne par mois, net
 * de tout, et combien de jours il me faut pour vivre
 * (`AUDIT-PRODUIT-ET-INTERFACE.md`, F5 et §5).
 *
 * Le net de poche n'est pas un résultat fiscal : c'est de l'argent compté en
 * trésorerie — l'encaissé hors taxes, moins ce qu'il fait naître de
 * cotisations, de formation et d'impôt, moins la CFE et les dépenses payées.
 * Chaque terme se lit sur la source qui le compte déjà ailleurs :
 *
 *  · cotisations, formation, versement libératoire : `voletAProvisionner`, la
 *    règle du dû, période déclarée ou non — sans quoi le net et le dû
 *    diraient deux cotisations pour le même encaissement ;
 *  · impôt sur le revenu au barème : la provision de l'année (`provisionIrDe`),
 *    au taux de l'année et jamais au taux du solde ;
 *  · CFE : les avis saisis, à leur date ;
 *  · dépenses : payées, TVA récupérable retirée et TVA autoliquidée d'un
 *    franchisé ajoutée — la règle de `tvaDesDepensesPayees`.
 *
 * Rien n'est stocké : tout se recalcule depuis les faits. Chargé avec l'écran
 * qui le lira, jamais au premier rendu.
 */

import type { DateISO, Euros, Mois, Resolution } from '../domain/types';
import { euros } from '../domain/types';
import { voletAProvisionner } from '../domain/calculs/provisions';
import { tvaDeDepense } from '../domain/calculs/depenses.tva';
import { planDeCharge } from '../domain/calculs/activite';
import { decalerMois } from '../domain/calculs/periode';
import { tjmNet } from '../domain/calculs/tjm';
import type { Faits } from './schema';
import {
  dateDuJour, moisCourant, periodesUrssafEffectives, provisionIrDe, recettesEncaissees, regimeTvaAu,
  soldeEstSuivi, sousAcreLe, tauxImpotAu, vlAu
} from './selecteurs';
import { planningDuMois, tarifDeLaJournee, tauxCotisationsAu } from './selecteurs.activite';
import { facturesSuivies } from './selecteurs.pipeline';

/* ─────────────────────────────────────────────────────────────────────────
   Le net de poche
   ───────────────────────────────────────────────────────────────────────── */

/** Chaque terme du net, pour l'afficher au clic : un total seul ne se vérifie pas. */
export interface CompositionDuNet {
  /** Encaissé hors taxes : la TVA collectée n'est pas à soi. */
  readonly encaisse: Euros;
  readonly cotisations: Euros;
  /** La contribution à la formation professionnelle, payée avec l'URSSAF. */
  readonly formation: Euros;
  /**
   * Versement libératoire et impôt sur le revenu au barème attribuable à
   * l'activité. `null` — et non zéro — quand l'impôt ne se calcule pas : le
   * net est alors « avant impôt », et le dit.
   */
  readonly impot: Euros | null;
  /** Les avis de CFE saisis sur la période ; zéro sans avis. */
  readonly cfe: Euros;
  readonly depenses: Euros;
  readonly net: Euros;
}

export interface NetDePoche {
  readonly du: Mois;
  readonly au: Mois;
  /** Les mois comptés, bornes comprises. */
  readonly mois: number;
  readonly composition: CompositionDuNet;
  /** Pourquoi l'impôt n'y est pas ; `null` quand il y est. */
  readonly avantImpot: string | null;
}

/**
 * Le premier mois dont on sait quelque chose : le début d'activité, sinon le
 * premier encaissement. Un mois d'avant l'activité compté pour zéro ferait
 * lire un net moyen d'un tiers trop bas à qui a commencé en octobre.
 */
export function premierMoisConnu(faits: Faits): Mois | null {
  const dates = [
    faits.entreprise.debutActivite,
    ...faits.recettes.map((r) => r.encaisseeLe)
  ].filter((d): d is DateISO => d !== null).sort();
  return (dates[0]?.slice(0, 7) as Mois | undefined) ?? null;
}

/** Les mois de `du` à `au`, bornes comprises. */
function moisEntre(du: Mois, au: Mois): readonly Mois[] {
  const liste: Mois[] = [];
  for (let m = du; m <= au; m = decalerMois(m, 1)) liste.push(m);
  return liste;
}

/**
 * Le taux de l'impôt au barème d'une année, attribuable à l'activité : celui
 * de la provision — l'impôt de l'année projetée sur son chiffre d'affaires
 * projeté. L'année en cours lit le pipeline ; une année close, son encaissé
 * seul. `null` sous le versement libératoire toute l'année.
 */
function tauxImpotBareme(faits: Faits, annee: number, maintenant: Date): Resolution<number> | null {
  const close = annee < maintenant.getFullYear();
  const p = close
    ? provisionIrDe(faits, new Date(annee, 11, 31, 12), euros(0))
    : provisionIrDe(faits, maintenant);
  if (p === null || p.statut === 'refuse') return p;
  const taux = p.valeur.assiette > 0 ? p.valeur.impotAnneeProjetee / p.valeur.assiette : 0;
  return { ...p, valeur: taux };
}

/**
 * Le net de poche de `du` à `au`, mois entiers.
 *
 * Refusé quand une cotisation ne se calcule pas : un net sans cotisations
 * serait d'un quart trop haut. Une hypothèse quand un barème l'est, ou quand
 * l'impôt ne se calcule pas (parts non saisies) — jamais un impôt deviné.
 */
export function netDePocheEntre(
  faits: Faits, du: Mois, au: Mois, maintenant: Date = new Date()
): Resolution<NetDePoche> {
  const mois = moisEntre(du, au);
  const dans = (d: DateISO | null): boolean => d !== null && d.slice(0, 7) >= du && d.slice(0, 7) <= au;
  const recettes = recettesEncaissees(faits).filter((r) => dans(r.encaisseeLe));

  const v = voletAProvisionner(recettes, { mois: [] }, {
    typeActivite: faits.entreprise.typeActivite,
    sousAcreLe: sousAcreLe(faits),
    debutActivite: faits.entreprise.debutActivite,
    tauxImpotEtContributions: tauxImpotAu(faits),
    periodesUrssaf: periodesUrssafEffectives(faits)
  });
  const premierRefus = v.nonCalculables[0];
  if (premierRefus !== undefined) return { statut: 'refuse', motif: premierRefus.motif };

  /* L'impôt au barème, année par année : le taux de l'année appliqué à son
     encaissé hors versement libératoire. */
  let impotBareme = 0;
  let avantImpot: string | null = null;
  let hypothese = false;
  for (const annee of new Set(mois.map((m) => Number(m.slice(0, 4))))) {
    const assiette = recettes
      .filter((r) => r.encaisseeLe.startsWith(String(annee)) && !vlAu(faits, r.encaisseeLe.slice(0, 7) as Mois))
      .reduce((t, r) => t + r.montant, 0);
    if (assiette === 0) continue;
    const taux = tauxImpotBareme(faits, annee, maintenant);
    if (taux === null) continue;
    if (taux.statut === 'refuse') { avantImpot = taux.motif; continue; }
    if (taux.statut === 'hypothese') hypothese = true;
    impotBareme += assiette * taux.valeur;
  }

  const banqueSynchronisee = soldeEstSuivi(faits);
  const depenses = faits.depenses
    .filter((d) => dans(d.payeeLe))
    .reduce((t, d) => {
      const regimeTva = regimeTvaAu(faits, (d.payeeLe as DateISO).slice(0, 7) as Mois);
      const tva = tvaDeDepense(d, { regimeTva, banqueSynchronisee });
      return t + d.montantTtc - tva.recuperable + (regimeTva === 'franchise' ? tva.aAutoliquider : 0);
    }, 0);
  const cfe = faits.echeances
    .filter((e) => e.nature === 'cfe' && dans(e.echeanceLe))
    .reduce((t, e) => t + (e.montantPaye ?? e.montant), 0);

  const encaisse = recettes.reduce((t, r) => t + r.montant, 0);
  const impot = avantImpot === null ? v.parNature.impot + impotBareme : null;
  const composition: CompositionDuNet = {
    encaisse: euros(encaisse),
    cotisations: v.parNature.urssaf,
    formation: v.parNature.cfp,
    impot: impot === null ? null : euros(impot),
    cfe: euros(cfe),
    depenses: euros(depenses),
    net: euros(encaisse - v.parNature.urssaf - v.parNature.cfp - (impot ?? 0) - cfe - depenses)
  };

  const taux = mois.map((m) => tauxCotisationsAu(faits, m));
  if (taux.some((t) => t.statut === 'hypothese')) hypothese = true;
  const reference = taux.find((t): t is Exclude<typeof t, { statut: 'refuse' }> => t.statut !== 'refuse');
  const valeur: NetDePoche = { du, au, mois: mois.length, composition, avantImpot };
  const source = 'encaissements, dépenses et avis saisis ; cotisations et impôt au barème de chaque mois'
    + (avantImpot === null ? '' : ' ; avant impôt sur le revenu');
  const verifieLe = reference?.verifieLe ?? dateDuJour(maintenant);
  return hypothese || avantImpot !== null
    ? { statut: 'hypothese', valeur, source, verifieLe, depuis: du }
    : { statut: 'publie', valeur, source, verifieLe };
}

/**
 * Le net de poche d'une année civile, du 1ᵉʳ janvier à aujourd'hui pour
 * l'année en cours. Refusé pour une année d'avant l'activité.
 */
export function netDePocheDeLAnnee(
  faits: Faits, annee: number, maintenant: Date = new Date()
): Resolution<NetDePoche> {
  const premier = premierMoisConnu(faits);
  const debut = `${annee}-01` as Mois;
  const fin = annee === maintenant.getFullYear() ? moisCourant(maintenant) : `${annee}-12` as Mois;
  const du = premier !== null && premier > debut ? premier : debut;
  if (du > fin) return { statut: 'refuse', motif: `Aucune activité en ${annee}.` };
  return netDePocheEntre(faits, du, fin, maintenant);
}

/** Le net de poche ramené au mois, et la courbe de ses douze derniers mois. */
export interface MoisLisse {
  /** Le net des mois comptés — leur composition se lit au clic. */
  readonly periode: NetDePoche;
  /** Le net ÷ les mois comptés. */
  readonly parMois: Euros;
  /** Le net de chaque mois compté, du plus ancien au plus récent : la tendance de la tuile. */
  readonly tendance: readonly { readonly mois: Mois; readonly net: Euros }[];
}

/**
 * Le mois lissé : le net des douze derniers mois ENTIERS, divisé par les mois
 * comptés.
 *
 * Douze mois, parce qu'un mois seul ne dit rien — l'URSSAF trimestrielle, la
 * CFE de décembre, un client qui paie en retard le font sauter d'un tiers.
 * Entiers, parce que le mois en cours n'a encore ni ses encaissements ni ses
 * dépenses : le compter tirerait la moyenne vers le bas tous les débuts de
 * mois. Bornés au début de l'activité : une démonstration qui commence en
 * octobre se divise par huit, pas par douze — sinon quatre mois qui n'ont pas
 * existé compteraient pour zéro.
 */
export function moisLisse(faits: Faits, maintenant: Date = new Date()): Resolution<MoisLisse> {
  const m0 = moisCourant(maintenant);
  const au = decalerMois(m0, -1);
  const premier = premierMoisConnu(faits);
  const douze = decalerMois(m0, -12);
  const du = premier !== null && premier > douze ? premier : douze;
  if (du > au) {
    return { statut: 'refuse', motif: 'Pas encore un mois entier d’activité : le net d’un mois se lira le mois prochain.' };
  }
  const periode = netDePocheEntre(faits, du, au, maintenant);
  if (periode.statut === 'refuse') return periode;
  const tendance = moisEntre(du, au).map((m) => {
    const n = netDePocheEntre(faits, m, m, maintenant);
    return { mois: m, net: n.statut === 'refuse' ? euros(0) : n.valeur.composition.net };
  });
  return {
    ...periode,
    valeur: {
      periode: periode.valeur,
      parMois: euros(periode.valeur.composition.net / periode.valeur.mois),
      tendance
    }
  };
}

/**
 * Le taux de prélèvement : (cotisations + formation + impôt + CFE) ÷ encaissé.
 *
 * Les dépenses n'y sont pas : elles ne dépendent pas de ce qu'on encaisse, et
 * les mêler au taux ferait croire qu'un mois de plus en coûte autant. Refusé
 * sans encaissement — zéro sur zéro n'est pas un taux. « Avant impôt » quand
 * l'impôt manque, comme le net.
 */
export function tauxDePrelevement(n: Resolution<NetDePoche>): Resolution<number> {
  if (n.statut === 'refuse') return n;
  const c = n.valeur.composition;
  if (c.encaisse <= 0) return { statut: 'refuse', motif: 'Rien d’encaissé sur la période : aucun taux à lire.' };
  return { ...n, valeur: (c.cotisations + c.formation + (c.impot ?? 0) + c.cfe) / c.encaisse };
}

/* ─────────────────────────────────────────────────────────────────────────
   Combien de jours pour vivre, et à quel prix
   ───────────────────────────────────────────────────────────────────────── */

/** Ce qu'une journée laisse, et ce qu'il faut pour couvrir un mois. */
export interface BesoinEnJours {
  readonly besoin: Euros;
  /** Les dépenses payées des mois lissés, ramenées au mois. */
  readonly depensesMensuelles: Euros;
  /** Le tarif moyen des contrats de l'année, sur les journées du planning. */
  readonly tarif: Euros;
  readonly taux: number;
  /** Ce qu'une journée laisse, prélèvements retirés : `tjmNet` au taux de prélèvement. */
  readonly tarifNet: Euros;
  /** Le chiffre d'affaires d'un mois qui couvre le besoin et les dépenses. */
  readonly caMensuel: Euros;
  readonly jours: number;
}

/**
 * Le taux et les dépenses des douze derniers mois — ce que les quatre
 * calculs suivants lisent, une seule fois et du même endroit.
 */
function socle(faits: Faits, maintenant: Date) {
  const lisse = moisLisse(faits, maintenant);
  const taux = tauxDePrelevement(lisse.statut === 'refuse' ? lisse : { ...lisse, valeur: lisse.valeur.periode });
  const depensesMensuelles = lisse.statut === 'refuse'
    ? null
    : euros(lisse.valeur.periode.composition.depenses / lisse.valeur.periode.mois);
  return { lisse, taux, depensesMensuelles };
}

/** Une résolution qui garde la qualification d'une autre, avec une nouvelle valeur. */
function comme<T>(r: Exclude<Resolution<unknown>, { statut: 'refuse' }>, valeur: T): Resolution<T> {
  return { ...r, valeur } as Resolution<T>;
}

/**
 * Combien de jours il faut facturer par mois pour couvrir son besoin.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DÉPENSES Y SONT, ET LA FORMULE DE L'AUDIT LES OUBLIAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Besoin ÷ tarif net d'une journée » répond combien de jours versent le
 * besoin — si rien d'autre ne sortait. Or les dépenses sortent du même
 * chiffre d'affaires, prélevé avant elles : un besoin de 2 300 € et 400 € de
 * dépenses demandent les jours de 2 700 €, et le net de poche du mois tombait
 * sinon sous le besoin de tout leur montant. Le calcul résout donc le net de
 * poche à l'envers : CA × (1 − taux) − dépenses = besoin.
 *
 * Le tarif est celui des contrats, moyenné sur les journées du planning de
 * l'année (`tjmEffectif().affiche`) : le tarif « effectif » divise ce qui est
 * déjà facturé par les journées de toute l'année, à venir comprises, et se
 * lit trop bas tant que l'année n'est pas finie.
 */
export function joursNecessaires(faits: Faits, maintenant: Date = new Date()): Resolution<BesoinEnJours> {
  const besoin = faits.besoinMensuel;
  if (!(besoin > 0)) {
    return { statut: 'refuse', motif: 'Indique ton besoin mensuel dans Réglages › Réserve : c’est lui qui se compte en jours.' };
  }
  const { taux, depensesMensuelles } = socle(faits, maintenant);
  if (taux.statut === 'refuse') return taux;
  const tarif = tarifDeLaJournee(faits, maintenant.getFullYear()).effectif.affiche;
  if (tarif === null || tarif <= 0) {
    return { statut: 'refuse', motif: 'Aucune journée au planning cette année : pas de tarif pour compter en jours.' };
  }
  const net = tjmNet(tarif, taux);
  if (net.statut === 'refuse' || net.valeur <= 0) {
    return { statut: 'refuse', motif: 'Le taux de prélèvement ne laisse rien d’une journée.' };
  }
  const depenses = depensesMensuelles ?? euros(0);
  const caMensuel = (besoin + depenses) / (1 - taux.valeur);
  return comme(taux, {
    besoin, depensesMensuelles: depenses, tarif, taux: taux.valeur, tarifNet: net.valeur,
    caMensuel: euros(caMensuel),
    jours: caMensuel / tarif
  });
}

/** Le plus bas tarif qui couvre une année : besoin, dépenses, prélèvements. */
export interface TarifPlancher {
  readonly tarif: Euros;
  readonly besoinAnnuel: Euros;
  readonly depensesAnnuelles: Euros;
  /** Jours ouvrés de l'année, fériés et congés posés retirés — le dénominateur de l'occupation. */
  readonly joursFacturables: number;
  readonly taux: number;
}

/** Sous trois mois d'historique, le taux et les dépenses ne disent encore rien. */
export const MOIS_MINIMUM_PLANCHER = 3;

/**
 * Le tarif plancher : (besoin annuel + dépenses annuelles) ÷ (jours
 * facturables × (1 − taux de prélèvement)).
 *
 * Les jours facturables sont ceux de l'occupation (`planDeCharge`), sur
 * l'année entière : jours ouvrés, fériés et congés posés retirés. Un congé
 * qui n'est pas encore posé n'est pas retiré — le plancher est donc un
 * minimum, et il monte à mesure qu'on pose ses vacances.
 *
 * Refusé sous trois mois d'historique : un taux de prélèvement tiré d'un
 * mois sous ACRE, ou des dépenses d'un mois d'installation, donneraient un
 * plancher qu'on prendrait pour un prix.
 */
export function tarifPlancher(
  faits: Faits, maintenant: Date = new Date(), annee: number = maintenant.getFullYear()
): Resolution<TarifPlancher> {
  const besoin = faits.besoinMensuel;
  if (!(besoin > 0)) {
    return { statut: 'refuse', motif: 'Indique ton besoin mensuel dans Réglages › Réserve : le plancher en part.' };
  }
  const premier = premierMoisConnu(faits);
  const m0 = moisCourant(maintenant);
  const historique = premier === null ? 0 : moisEntre(premier, decalerMois(m0, -1)).length;
  if (historique < MOIS_MINIMUM_PLANCHER) {
    return {
      statut: 'refuse',
      motif: `Il faut ${MOIS_MINIMUM_PLANCHER} mois d’activité pour lire un plancher : le taux et les dépenses d’un début ne disent pas encore une année.`
    };
  }
  const { lisse, taux } = socle(faits, maintenant);
  if (taux.statut === 'refuse') return taux;
  if (lisse.statut === 'refuse') return lisse;
  const p = lisse.valeur.periode;
  const depensesAnnuelles = euros((p.composition.depenses / p.mois) * 12);
  const joursFacturables = moisEntre(`${annee}-01` as Mois, `${annee}-12` as Mois)
    .reduce((t, m) => t + planDeCharge(m, faits.conges, 0).joursOuvrables, 0);
  if (joursFacturables <= 0 || taux.valeur >= 1) {
    return { statut: 'refuse', motif: 'Aucun jour facturable sur l’année.' };
  }
  const besoinAnnuel = euros(besoin * 12);
  return comme(taux, {
    tarif: euros((besoinAnnuel + depensesAnnuelles) / (joursFacturables * (1 - taux.valeur))),
    besoinAnnuel, depensesAnnuelles, joursFacturables, taux: taux.valeur
  });
}

/** L'objectif de chiffre d'affaires, lu en net — sans toucher au fait, qui reste en CA. */
export interface ObjectifEnNet {
  readonly objectif: Euros;
  /** Ce que l'objectif laisse par mois, prélèvements et dépenses retirés. */
  readonly netParMois: Euros;
  readonly taux: number;
  readonly depensesAnnuelles: Euros;
}

/**
 * « Ton objectif de X € de CA te laisse ≈ Y € net par mois. »
 *
 * Le fait stocké reste en chiffre d'affaires (`objectifCaAnnuel`) : c'est ce
 * qu'on compare aux seuils, et un objectif saisi en net changerait de valeur
 * à chaque changement de taux. Ce n'est qu'une lecture.
 *
 * L'autre sens — le chiffre d'affaires et les jours qu'il faut pour un net
 * donné — est `joursNecessaires` : un seul calcul, pour qu'« il te faut
 * 34 000 € » et « 5,6 jours par mois » ne se contredisent jamais.
 */
export function objectifEnNet(faits: Faits, maintenant: Date = new Date()): Resolution<ObjectifEnNet> {
  const objectif = faits.objectifCaAnnuel;
  if (objectif === null || objectif <= 0) {
    return { statut: 'refuse', motif: 'Aucun objectif de chiffre d’affaires : fixe-le dans Réglages › Réserve.' };
  }
  const { taux, depensesMensuelles } = socle(faits, maintenant);
  if (taux.statut === 'refuse') return taux;
  const depensesAnnuelles = euros((depensesMensuelles ?? 0) * 12);
  return comme(taux, {
    objectif,
    netParMois: euros((objectif * (1 - taux.valeur) - depensesAnnuelles) / 12),
    taux: taux.valeur,
    depensesAnnuelles
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   L'encours par ancienneté
   ───────────────────────────────────────────────────────────────────────── */

export type Anciennete = 'non_echue' | 'retard_1_30' | 'retard_31_60' | 'retard_au_dela';

export interface TrancheDEncours {
  readonly anciennete: Anciennete;
  readonly montant: Euros;
  readonly nombre: number;
}

/**
 * Les factures non réglées, rangées par retard : non échues, 1 à 30 jours,
 * 31 à 60, au-delà.
 *
 * Mêmes factures que le reste à encaisser (`encoursDe` : émises, envoyées, en
 * retard), et la somme des tranches retombe sur lui. Un montant total ne dit
 * pas si l'argent est en route ou perdu : 6 000 € dont 5 000 non échus sont la
 * respiration d'un délai de paiement ; 6 000 € à soixante jours, une relance
 * qu'on aurait dû faire.
 */
export function encoursParAnciennete(faits: Faits, maintenant: Date = new Date()): readonly TrancheDEncours[] {
  const aujourdhui = Date.parse(dateDuJour(maintenant));
  const tranches = new Map<Anciennete, { montant: number; nombre: number }>(
    (['non_echue', 'retard_1_30', 'retard_31_60', 'retard_au_dela'] as const).map((a) => [a, { montant: 0, nombre: 0 }])
  );
  for (const f of facturesSuivies(faits, maintenant)) {
    if (f.statut !== 'emise' && f.statut !== 'envoyee' && f.statut !== 'en_retard') continue;
    const retard = f.statut === 'en_retard' && f.echeanceLe !== null
      ? Math.round((aujourdhui - Date.parse(f.echeanceLe)) / 86_400_000)
      : 0;
    const cle: Anciennete = retard <= 0 ? 'non_echue'
      : retard <= 30 ? 'retard_1_30'
        : retard <= 60 ? 'retard_31_60'
          : 'retard_au_dela';
    const t = tranches.get(cle) as { montant: number; nombre: number };
    t.montant += f.recette.montant;
    t.nombre += 1;
  }
  return [...tranches.entries()].map(([anciennete, t]) => ({ anciennete, montant: euros(t.montant), nombre: t.nombre }));
}

/* ─────────────────────────────────────────────────────────────────────────
   L'an passé, à la même date
   ───────────────────────────────────────────────────────────────────────── */

export interface PeriodeComparee {
  readonly du: DateISO;
  readonly au: DateISO;
  /** Encaissé hors taxes. */
  readonly encaisse: Euros;
  /** Journées retenues au planning, la source du compte rendu et de la facture du mois. */
  readonly jours: number;
}

export interface ComparaisonAnPasse {
  readonly cetteAnnee: PeriodeComparee;
  readonly anPasse: PeriodeComparee;
}

/** « octobre 2026 » : un motif se lit, il ne se décode pas. */
const enLettres = (m: Mois): string => new Date(`${m}-01T00:00:00Z`)
  .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Douze mois d'historique : en deçà, l'an passé à la même date n'existe pas. */
export const MOIS_MINIMUM_COMPARAISON = 12;

/**
 * Cette année du 1ᵉʳ janvier à aujourd'hui, face à l'an passé du 1ᵉʳ janvier
 * à la même date : l'encaissé et les jours travaillés.
 *
 * La même période, et non l'année passée entière : à la mi-juin, comparer six
 * mois à douze dirait « deux fois moins » d'une année qui va peut-être mieux.
 * Le 29 février d'une année bissextile se compare au 28. Refusé sous douze
 * mois d'historique.
 */
export function comparaisonAnPasse(faits: Faits, maintenant: Date = new Date()): Resolution<ComparaisonAnPasse> {
  const premier = premierMoisConnu(faits);
  const m0 = moisCourant(maintenant);
  const anciennete = premier === null ? 0 : moisEntre(premier, m0).length - 1;
  if (anciennete < MOIS_MINIMUM_COMPARAISON) {
    const quand = premier === null ? null : decalerMois(premier, MOIS_MINIMUM_COMPARAISON);
    return {
      statut: 'refuse',
      motif: `Il faut douze mois d’activité pour te comparer à l’an passé${quand === null ? '' : ` : la comparaison viendra en ${enLettres(quand)}`}.`
    };
  }
  const au = dateDuJour(maintenant);
  const annee = maintenant.getFullYear();
  const jourAnPasse = au.slice(5) === '02-29' ? '02-28' : au.slice(5);
  const periode = (a: number, fin: string): PeriodeComparee => {
    const du = `${a}-01-01` as DateISO;
    const jusqua = `${a}-${fin}` as DateISO;
    const encaisse = recettesEncaissees(faits)
      .filter((r) => r.encaisseeLe >= du && r.encaisseeLe <= jusqua)
      .reduce((t, r) => t + r.montant, 0);
    const jours = moisEntre(`${a}-01` as Mois, jusqua.slice(0, 7) as Mois)
      .flatMap((m) => planningDuMois(faits, m).jours)
      .filter((j) => j.date <= jusqua)
      .reduce((t, j) => t + j.retenu, 0);
    return { du, au: jusqua, encaisse: euros(encaisse), jours };
  };
  return {
    statut: 'publie',
    valeur: { cetteAnnee: periode(annee, au.slice(5)), anPasse: periode(annee - 1, jourAnPasse) },
    source: 'encaissements et planning saisis',
    verifieLe: au
  };
}
