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
import type { ProvisionImpotRevenu } from '../domain/calculs/provisionImpotRevenu';
import { encoursDe, suivre } from '../domain/calculs/facturier';
import type { Faits } from './schema';
import {
  dateDuJour, etatPilote, moisCourant, remunerationDuMois
} from './selecteurs';
import {
  previsionDuMoisParMission, tauxDeChargesAu
} from './selecteurs.activite';
import {
  type ProjectionSolde, depensesMensuellesMoyennes, projeterDisponible
} from '../domain/calculs/projectionSolde';
import { contexteDepense } from './selecteurs.achats';
import { tvaDeDepense } from '../domain/calculs/depenses';
import {
  type DossierTva, type PieceCollectee, type PieceDeduite, dossierTva
} from '../domain/calculs/dossierTva';
import {
  FORMULE_PAR_DEFAUT, echeanceDe, formuleOuNull
} from '../domain/calculs/delaiPaiement';

/**
 * Toutes les factures, avec leur statut dérivé à la date du jour.
 *
 * Le délai de paiement vient du carnet ; à défaut de client rattaché, le délai
 * légal supplétif. Retenir zéro afficherait « en retard » dès l'émission.
 */
export function facturesSuivies(faits: Faits, maintenant: Date = new Date()) {
  /* Secours : l'échéance manque sur la recette (bloc écrit à la main, jeu
     d'essai). On la reconstruit depuis les conditions actuelles du client —
     faute de mieux, et sans l'écrire nulle part. */
  const formules = new Map(faits.clients.map((c) => [c.nom, c.delaiPaiement]));
  const secours = (nom: string, emiseLe: DateISO) =>
    echeanceDe(emiseLe, formules.get(nom) ?? FORMULE_PAR_DEFAUT);
  return suivre(
    faits.recettes,
    secours,
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
  /** Combien de factures composent ce reste — compté par `encoursDe`, pas ici. */
  readonly resteARentrerNombre: number;
  /** Le total de provision, ventilé par nature — voir `EtatPilote`. */
  readonly provisionsParNature: VentilationProvisions;
  readonly tresorerie: ResultatTresorerie;
  readonly voletConstate: Euros;
  readonly voletAProvisionner: Euros;
  readonly seuils: EtatSeuils;
  /**
   * La provision d'impôt sur le revenu, avec ce qu'elle ignore — reprise telle
   * quelle de `EtatPilote`, jamais recalculée : la ligne « impôt » de la
   * ventilation et l'explication qui l'accompagne doivent venir du même
   * calcul, faute de quoi l'écran commenterait un chiffre qu'il n'affiche pas.
   *
   * `null` sous le versement libératoire.
   */
  readonly provisionImpotRevenu: Resolution<ProvisionImpotRevenu> | null;
  /**
   * Quelle part de ce qui est dû est effectivement sur le compte, entre 0 et 1.
   *
   * ─────────────────────────────────────────────────────────────────────
   * BORNÉE À 1, ET ZÉRO PROVISION VAUT 1
   * ─────────────────────────────────────────────────────────────────────
   *
   * C'est l'étiquette du haut de l'écran — « Provisions · N % couvertes ». Elle
   * répond à une seule question : si tout tombait demain, le compte suivrait-il ?
   *
   * Au-delà de 1, il n'y a rien de plus à dire : avoir deux fois de quoi payer
   * ne rend pas la dette « 200 % couverte », et afficher un tel chiffre ferait
   * lire un excédent là où il n'y a qu'un matelas. Rien à provisionner rend 1
   * et non 0 : une division par zéro rendrait « 0 % couvertes » sur un compte
   * qui ne doit rien — l'alerte exactement à l'envers.
   */
  readonly couvertureProvisions: number;
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
  const encours = encoursDe(facturesSuivies(faits, maintenant));

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
    resteARentrer: encours.resteARentrer,
    resteARentrerNombre: encours.nombre,
    tresorerie: pilote.tresorerie,
    voletConstate: pilote.voletConstate,
    voletAProvisionner: pilote.voletAProvisionner,
    provisionsParNature: pilote.provisionsParNature,
    provisionImpotRevenu: pilote.provisionImpotRevenu,
    couvertureProvisions: pilote.tresorerie.provisions <= 0
      ? 1
      : Math.min(1, Math.max(0, pilote.tresorerie.solde / pilote.tresorerie.provisions))
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

/* ─────────────────────────────────────────────────────────────────────────
   Où va l'argent disponible, mois après mois
   ───────────────────────────────────────────────────────────────────────── */

/** Combien de mois la projection couvre. Un an : au-delà, tout est fiction. */
const MOIS_PROJETES = 12;

/** Sur combien de mois passés on moyenne les dépenses courantes. */
const MOIS_D_HISTORIQUE = 6;

/** Le mois décalé de `pas`. */
function decalerMois(m: Mois, pas: number): Mois {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) + pas;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}` as Mois;
}

export interface EtatProjection {
  readonly projection: ProjectionSolde;
  /**
   * L'hypothèse de dépenses courantes retenue, ou `null` si l'historique est
   * trop court pour en tirer une.
   *
   * L'écran doit le dire : une projection sans dépenses est optimiste, et
   * l'optimisme est le sens dangereux de l'erreur sur une trésorerie.
   */
  readonly depensesMensuelles: Euros | null;
  /**
   * Le taux de charges appliqué aux encaissements à venir.
   *
   * `null` quand le barème ne couvre pas la période : la projection retient
   * alors zéro et surestime le disponible d'un quart. Elle doit le dire au
   * lieu de présenter le résultat comme un chiffre.
   */
  readonly tauxDeCharges: number | null;
  /** Ce qu'on s'est réellement versé, mois par mois, sur l'année écoulée. */
  readonly versementsPasses: readonly { readonly mois: Mois; readonly montant: Euros }[];
}

/**
 * Ce que le compte devient sur douze mois, avec et sans se verser.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENNENT LES ENCAISSEMENTS ATTENDUS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * De deux sources, et d'aucune autre — surtout pas d'une extrapolation du
 * passé :
 *
 *  1. les factures **déjà émises et non réglées**, portées au mois de leur
 *     échéance. C'est un fait : le document est parti, la somme est due ;
 *  2. le **revenu prévu au planning** des mois à venir, décalé du délai de
 *     paiement du client. C'est le rythme que l'utilisateur a lui-même saisi,
 *     pas une tendance devinée.
 *
 * Une facture échue depuis longtemps et toujours impayée est portée au mois
 * COURANT plutôt qu'à sa date passée : l'argent n'est pas rentré, mais il
 * n'est pas perdu non plus, et le faire disparaître de la projection
 * reviendrait à l'abandonner sans le dire.
 */
export function etatProjection(
  faits: Faits,
  maintenant: Date = new Date()
): EtatProjection {
  const m0 = moisCourant(maintenant);
  const moisProjetes = Array.from({ length: MOIS_PROJETES }, (_, i) => decalerMois(m0, i));

  /* Le décalage de l'encaissement attendu suit la FORMULE, pas un nombre de
     jours : « 30 jours fin de mois » repousse une facture du 12 juin au
     31 juillet, dix-neuf jours plus loin qu'une simple addition. Sur une
     prévision de trésorerie, dix-neuf jours changent le mois. */
  const formulesClient = new Map(faits.clients.map((c) => [c.nom, c.delaiPaiement]));


  const attendu = new Map<Mois, number>(moisProjetes.map((m) => [m, 0]));
  const ajouter = (m: Mois, montant: number): void => {
    // Hors fenêtre : ni avant le mois courant — l'argent d'hier est déjà au
    // solde — ni au-delà de l'horizon.
    if (attendu.has(m)) attendu.set(m, (attendu.get(m) ?? 0) + montant);
  };

  // 1. Les factures émises et non réglées, à l'échéance. Une échéance déjà
  //    passée retombe sur le mois courant : la somme est toujours due.
  for (const f of facturesSuivies(faits, maintenant)) {
    if (f.statut !== 'emise' && f.statut !== 'envoyee' && f.statut !== 'en_retard') continue;
    const echeance = (f.echeanceLe ?? m0).slice(0, 7) as Mois;
    ajouter(echeance < m0 ? m0 : echeance, f.recette.montant);
  }

  /* 2. Le revenu prévu au planning, daté à son ÉCHÉANCE réelle.
        Le mois M se facture le dernier jour du mois, et l'échéance suit la
        formule convenue. Le calcul précédent divisait un nombre de jours par
        trente et arrondissait au mois supérieur : « 30 jours fin de mois »
        s'y traduisait par un mois de décalage, alors qu'une facture du
        31 juillet à cette formule n'est due que le 30 septembre. Un mois
        d'écart sur chaque mission, sur toute la prévision. */
  const parMission = new Map(faits.missions.map((mi) => [mi.id, mi]));
  for (const m of moisProjetes) {
    for (const p of previsionDuMoisParMission(faits, m)) {
      const mission = parMission.get(p.missionId);
      const nom = mission?.clientNom ?? '';
      const emiseLe = finDuMoisISO(m);
      const formule = formuleOuNull(mission?.delaiPaiement)
        ?? formulesClient.get(nom) ?? FORMULE_PAR_DEFAUT;
      ajouter(echeanceDe(emiseLe, formule).slice(0, 7) as Mois, p.prevision.montantRetenu);
    }
  }

  const pilote = etatPilote(faits, faits.echeances, maintenant);
  const taux = tauxDeChargesAu(faits, m0);
  // Six mois à zéro ne sont pas six mois d'historique : sans AUCUNE dépense
  // enregistrée, on ne sait pas ce que coûte le mois — on ne sait pas non plus
  // qu'il ne coûte rien. Moyenner des zéros répondrait « zéro » à une question
  // qui n'a pas de réponse.
  const depenses = faits.depenses.length === 0 ? null : depensesMensuellesMoyennes(
    Array.from({ length: MOIS_D_HISTORIQUE }, (_, i) => {
      const m = decalerMois(m0, -(i + 1));
      return euros(faits.depenses
        .filter((d) => d.payeeLe !== null && d.payeeLe.startsWith(m))
        .reduce<number>((s, d) => s + d.montantTtc, 0));
    })
  );

  return {
    depensesMensuelles: depenses,
    tauxDeCharges: taux.statut === 'refuse' ? null : taux.valeur,
    projection: projeterDisponible({
      depart: pilote.tresorerie.dispo,
      reserve: pilote.tresorerie.reserve,
      entrees: moisProjetes.map((m) => ({
        mois: m, encaissements: euros(attendu.get(m) ?? 0)
      })),
      // Faute de barème, zéro : la projection est alors trop haute d'un quart,
      // et `tauxDeCharges` à `null` oblige l'écran à le dire.
      tauxDeCharges: taux.statut === 'refuse' ? 0 : taux.valeur,
      depensesMensuelles: depenses ?? euros(0)
    }),
    // Sur l'année écoulée, mois courant inclus : c'est la question « est-ce
    // que je me verse plus ou moins que ce que je peux ? ».
    versementsPasses: Array.from({ length: 12 }, (_, i) => {
      const m = decalerMois(m0, i - 11);
      return { mois: m, montant: remunerationDuMois(faits, m) };
    })
  };
}



/** Le dernier jour d'un mois, au format ISO. */
function finDuMoisISO(m: Mois): DateISO {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10) as DateISO;
}
