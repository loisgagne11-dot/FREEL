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
import { plafondMicro, seuilsTva, tauxImpotEtContributions } from '../domain/bareme';
import type { SeuilsTva } from '../domain/bareme';
import type { Resolution } from '../domain/types';
import type { Echeance, VentilationProvisions } from '../domain/calculs/provisions';
import type { ResultatTresorerie } from '../domain/calculs/tresorerie';
import type { ProvisionImpotRevenu } from '../domain/calculs/provisionImpotRevenu';
import { DELAI_PAIEMENT_DEFAUT, encoursDe, suivre } from '../domain/calculs/facturier';
import {
  type CapaciteDuMois, capaciteDuMois
} from '../domain/calculs/capaciteVersement';
import type { Faits, Mission } from './schema';
import {
  dateDuJour, etatPilote, moisCourant, regimeDe, remunerationDuMois
} from './selecteurs';
import {
  previsionDuMoisParMission, tauxCotisationsAu, tauxDeChargesAu
} from './selecteurs.activite';
import {
  type ProjectionSolde, depensesMensuellesMoyennes, projeterDisponible
} from '../domain/calculs/projectionSolde';
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
  /**
   * La provision d'impôt sur le revenu, avec ce qu'elle ignore — reprise telle
   * quelle de `EtatPilote`, jamais recalculée : la ligne « impôt » de la
   * ventilation et l'explication qui l'accompagne doivent venir du même
   * calcul, faute de quoi l'écran commenterait un chiffre qu'il n'affiche pas.
   *
   * `null` sous le versement libératoire.
   */
  readonly provisionImpotRevenu: Resolution<ProvisionImpotRevenu> | null;
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
    provisionsParNature: pilote.provisionsParNature,
    provisionImpotRevenu: pilote.provisionImpotRevenu
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

  const delais = new Map(faits.clients.map((c) => [c.nom, c.delaiPaiementJours]));
  const delaiDe = (nom: string) => delais.get(nom) ?? DELAI_PAIEMENT_DEFAUT;

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

  // 2. Le revenu prévu au planning, décalé du délai de paiement. Le mois M se
  //    facture à sa fin et s'encaisse `delai` jours plus tard.
  const parMission = new Map(faits.missions.map((mi) => [mi.id, mi]));
  for (const m of moisProjetes) {
    for (const p of previsionDuMoisParMission(faits, m)) {
      const client = parMission.get(p.missionId)?.clientNom ?? '';
      const decalage = Math.ceil(delaiDe(client) / 30);
      ajouter(decalerMois(m, decalage), p.prevision.montantRetenu);
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

/* ─────────────────────────────────────────────────────────────────────────
   Capacité de versement, mois par mois
   ───────────────────────────────────────────────────────────────────────── */

/** Le mois `n` de l'année, au format `YYYY-MM`. */
const moisDeLAnnee = (annee: number, n: number): Mois =>
  `${annee}-${String(n).padStart(2, '0')}` as Mois;

/** Encaissé constaté d'un mois : un fait, pas une projection. */
function encaisseDuMois(faits: Faits, m: Mois): Euros {
  return euros(faits.recettes
    .filter((r) => r.encaisseeLe !== null && r.encaisseeLe.startsWith(m))
    .reduce<number>((s, r) => s + r.montant, 0));
}

/** Dépenses payées sur un mois : un fait, pas une hypothèse. */
function depensesDuMois(faits: Faits, m: Mois): Euros {
  return euros(faits.depenses
    .filter((d) => d.payeeLe !== null && d.payeeLe.startsWith(m))
    .reduce<number>((s, d) => s + d.montantTtc, 0));
}

/**
 * La capacité de versement de chaque mois de l'année civile.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES MOIS PASSÉS SONT DES FAITS, LES MOIS À VENIR SONT LE PIPELINE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un mois écoulé prend son encaissé et ses dépenses tels qu'ils sont. Un mois à
 * venir prend les encaissements attendus de `etatProjection` — factures émises
 * non réglées et revenu prévu au planning — et l'hypothèse de dépenses
 * courantes. Aucun des deux n'extrapole le rythme du passé : c'est le point sur
 * lequel une seconde projection finirait par ne pas tomber d'accord avec la
 * première.
 *
 * La projection est un paramètre plutôt qu'un appel interne : l'écran la
 * calcule déjà pour ses courbes, et la refaire ici coûterait douze passages de
 * planning pour un résultat identique.
 *
 * Un mois dont le taux se dérobe rend une `Resolution` en `refuse` : sa barre
 * ne se dessine pas. Le retirer de la liste aurait décalé les onze autres d'une
 * case.
 */
export function capaciteParMois(
  faits: Faits,
  maintenant: Date = new Date(),
  projection: EtatProjection = etatProjection(faits, maintenant)
): readonly Resolution<CapaciteDuMois>[] {
  const m0 = moisCourant(maintenant);
  const annee = maintenant.getFullYear();
  const attendu = new Map(projection.projection.mois.map((p) => [p.mois, p.encaissements]));

  return Array.from({ length: 12 }, (_, i) => {
    const m = moisDeLAnnee(annee, i + 1);
    const futur = m > m0;
    return capaciteDuMois({
      mois: m,
      encaisse: futur ? euros(attendu.get(m) ?? 0) : encaisseDuMois(faits, m),
      // Faute d'historique, zéro dépense projetée : `depensesMensuelles` à
      // `null` oblige déjà l'écran à dire que la projection est optimiste, et
      // inventer un montant serait pire que de le taire.
      depenses: futur ? (projection.depensesMensuelles ?? euros(0)) : depensesDuMois(faits, m),
      tauxDeCharges: tauxDeChargesAu(faits, m),
      verse: remunerationDuMois(faits, m)
    }, m0);
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Le résultat projeté de l'année
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Ce que ce chiffre NE contient PAS, énuméré pour que l'écran puisse l'écrire.
 *
 * Une tuile « Résultat projeté » qui ne dit pas ce qu'elle ignore est plus
 * dangereuse qu'une tuile absente : on la lit comme « ce qu'il me restera », et
 * on décide dessus.
 *
 *  · `avant_impot_sur_le_revenu` — sous le régime du barème, AUCUN impôt sur le
 *    revenu n'est déduit. `tauxImpotEtContributions` ne rend alors que la CFP à
 *    0,2 %, et il ne refuse jamais : aucun garde-fou ne se déclencherait.
 *    Reconstituer l'IR à partir d'un taux rouvrirait la double imposition déjà
 *    fermée — l'acompte de prélèvement à la source est un fait SAISI depuis
 *    l'avis, jamais une sortie de calcul (en-tête de `domain/bareme/impot.ts`).
 *  · `depenses_professionnelles_retirees` — elles sortent du compte, donc elles
 *    sont retirées ; mais elles ne sont pas déductibles en micro, et le chiffre
 *    cesse alors d'être une base imposable. À ne pas reporter sur un formulaire.
 *  · `abattement_non_applique` — l'abattement forfaitaire ne rend aucun euro au
 *    compte, il ne sert qu'à calculer un revenu imposable. Ce résultat-ci est
 *    de la trésorerie.
 *  · `depenses_a_venir_inconnues` — sans historique, les dépenses des mois
 *    restants valent zéro : le résultat est trop élevé, d'un montant qu'on ne
 *    sait pas.
 */
export type ReserveDuResultat =
  | 'avant_impot_sur_le_revenu'
  | 'depenses_professionnelles_retirees'
  | 'abattement_non_applique'
  | 'depenses_a_venir_inconnues';

export interface ResultatProjete {
  readonly annee: number;
  /** Encaissé déjà constaté sur l'année : un fait. */
  readonly caDejaEncaisse: Euros;
  /** Encaissements attendus sur les mois restants de l'année : le pipeline. */
  readonly caAttendu: Euros;
  /** La somme des deux, assiette de tous les taux ci-dessous. */
  readonly caProjete: Euros;
  /** Cotisations sociales, sommées mois par mois au taux de chaque mois. */
  readonly cotisations: Euros;
  /**
   * Impôt et contributions retenus : la CFP toujours, le versement libératoire
   * si l'option est prise. Jamais un impôt sur le revenu reconstitué.
   */
  readonly impotEtContributions: Euros;
  /** Dépenses professionnelles de l'année, constatées puis extrapolées. */
  readonly depensesProfessionnelles: Euros;
  readonly resultat: Euros;
  /** `hypothese` dès qu'un seul mois s'appuie sur un barème extrapolé. */
  readonly statut: 'publie' | 'hypothese';
  readonly reserves: readonly ReserveDuResultat[];
}

/**
 * Le résultat projeté de l'année civile.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ASSIETTE EST LE PIPELINE, PAS UNE RÈGLE DE TROIS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `projectionAnnuelle` de `allure.ts` existe et rendrait un chiffre tout de
 * suite : l'encaissé à ce jour, divisé par la part de l'année écoulée. C'est
 * une extrapolation du rythme passé, et elle n'a pas sa place ici — deux
 * projections du même chiffre d'affaires finissent par ne pas tomber d'accord,
 * et personne ne sait alors laquelle fait foi. L'assiette vient donc des
 * encaissements attendus de `etatProjection`, construits depuis les faits :
 * factures émises non réglées, revenu prévu au planning.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES COTISATIONS SE SOMMENT MOIS PAR MOIS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un taux annuel unique se tromperait du simple au double sur une année où
 * l'ACRE s'éteint en juin, et dans le sens qui gonfle le résultat. Chaque mois
 * porte donc son taux, appliqué à son propre encaissé.
 *
 * Rend `null` si la projection ou l'un des taux se dérobent. Trois chiffres
 * justes valent mieux que quatre dont un engage à faux.
 */
export function resultatProjete(
  faits: Faits,
  maintenant: Date = new Date(),
  projection: EtatProjection = etatProjection(faits, maintenant)
): ResultatProjete | null {
  const annee = maintenant.getFullYear();
  const m0 = moisCourant(maintenant);
  const type = faits.entreprise.typeActivite;
  const regime = regimeDe(faits);
  const attendu = new Map(projection.projection.mois.map((p) => [p.mois, p.encaissements]));

  let dejaEncaisse = 0;
  let caAttendu = 0;
  let cotisations = 0;
  let impot = 0;
  let hypothese = false;

  for (let i = 1; i <= 12; i++) {
    const m = moisDeLAnnee(annee, i);
    const constate = encaisseDuMois(faits, m);
    // Le pipeline ne commence qu'au mois courant. Avant lui, l'argent est
    // rentré ou ne rentrera pas ce mois-là : l'ajouter le compterait deux fois.
    const aVenir = m >= m0 ? (attendu.get(m) ?? 0) : 0;
    dejaEncaisse += constate;
    caAttendu += aVenir;

    const assiette = constate + aVenir;
    // Un mois sans assiette n'engendre aucune charge : exiger son barème ferait
    // taire l'année entière à cause d'un janvier antérieur au début d'activité.
    if (assiette <= 0) continue;

    const cotis = tauxCotisationsAu(faits, m);
    if (cotis.statut === 'refuse') return null;
    const imp = tauxImpotEtContributions(regime, m, type);
    if (imp.statut === 'refuse') return null;

    cotisations += assiette * cotis.valeur;
    impot += assiette * imp.valeur;
    if (cotis.statut === 'hypothese' || imp.statut === 'hypothese') hypothese = true;
  }

  const depensesPassees = Array.from({ length: 12 }, (_, i) => moisDeLAnnee(annee, i + 1))
    .filter((m) => m <= m0)
    .reduce<number>((s, m) => s + depensesDuMois(faits, m), 0);
  const moisRestants = Math.max(0, 12 - Number(m0.slice(5, 7)));
  const depensesFutures = (projection.depensesMensuelles ?? 0) * moisRestants;
  const depenses = euros(depensesPassees + depensesFutures);

  const caProjete = euros(dejaEncaisse + caAttendu);
  const reserves: ReserveDuResultat[] = ['abattement_non_applique'];
  if (regime.regime === 'bareme') reserves.push('avant_impot_sur_le_revenu');
  if (depenses > 0) reserves.push('depenses_professionnelles_retirees');
  if (projection.depensesMensuelles === null && moisRestants > 0) {
    reserves.push('depenses_a_venir_inconnues');
  }

  return {
    annee,
    caDejaEncaisse: euros(dejaEncaisse),
    caAttendu: euros(caAttendu),
    caProjete,
    cotisations: euros(cotisations),
    impotEtContributions: euros(impot),
    depensesProfessionnelles: depenses,
    resultat: euros(caProjete - cotisations - impot - depenses),
    statut: hypothese ? 'hypothese' : 'publie',
    reserves
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Ce qu'un mois a émis, encaissé, et ce qu'il lui reste à encaisser
   ───────────────────────────────────────────────────────────────────────── */

export interface ResteAEncaisserDuMois {
  readonly mois: Mois;
  /** Émis ce mois-là et toujours pas réglé, compté facture par facture. */
  readonly resteAEncaisser: Euros;
  /** La part de ce reste dont l'échéance est passée. */
  readonly enRetard: Euros;
  /** Tout ce qui est entré sur le compte ce mois-là, toutes origines. */
  readonly encaisse: Euros;
  /** La part venue de factures émises CE mois-là. */
  readonly encaisseDuMois: Euros;
  /** La part venue de factures émises un mois antérieur. */
  readonly encaisseDeMoisAnterieurs: Euros;
  /**
   * La part encaissée AVANT toute émission : un acompte.
   *
   * C'est le seul « encaissé d'avance » qui ait un sens facture par facture, et
   * il se lit sur la pièce : la date d'encaissement précède la date d'émission,
   * ou aucune facture n'a encore été établie.
   */
  readonly encaisseDAvance: Euros;
}

/**
 * Le reste à encaisser d'un mois — facture par facture, jamais par différence.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX AGRÉGATS MENSUELS NE SE SOUSTRAIENT PAS PLUS QUE DEUX ANNUELS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le prototype fait « réalisé du mois − encaissé du mois ». L'application a
 * déjà refusé cette soustraction sur l'année (voir `encoursDe`), et l'argument
 * vaut au mois avec plus de force encore : l'encaissé de juin règle des
 * factures d'avril. Sur un juin qui émet 8 000 € et encaisse 12 000 € venus
 * d'avril, la soustraction rend −4 000 € — donc zéro une fois bornée — alors
 * que les 8 000 € de juin sont intégralement dus.
 *
 * On compte donc les factures ÉMISES ce mois-là qui ne sont pas réglées, et on
 * ventile séparément l'encaissé du mois selon son origine. Les trois parts sont
 * disjointes et somment exactement à `encaisse` : c'est ce qui permet à l'écran
 * d'expliquer un mois qui a encaissé plus qu'il n'a émis sans rien soustraire.
 */
export function resteAEncaisserDuMois(
  faits: Faits,
  m: Mois,
  maintenant: Date = new Date()
): ResteAEncaisserDuMois {
  const emisesDuMois = facturesSuivies(faits, maintenant).filter(
    (f) => f.recette.emiseLe !== null && f.recette.emiseLe.startsWith(m)
  );
  const encours = encoursDe(emisesDuMois);

  let duMois = 0;
  let anterieurs = 0;
  let avance = 0;
  for (const r of faits.recettes) {
    if (r.encaisseeLe === null || !r.encaisseeLe.startsWith(m)) continue;
    // L'ordre des cas n'est pas indifférent : une facture établie APRÈS son
    // règlement est un acompte, même si les deux tombent dans le même mois.
    if (r.emiseLe === null || r.emiseLe > r.encaisseeLe) avance += r.montant;
    else if (r.emiseLe.startsWith(m)) duMois += r.montant;
    else anterieurs += r.montant;
  }

  return {
    mois: m,
    resteAEncaisser: encours.resteARentrer,
    enRetard: encours.enRetard,
    encaisse: euros(duMois + anterieurs + avance),
    encaisseDuMois: euros(duMois),
    encaisseDeMoisAnterieurs: euros(anterieurs),
    encaisseDAvance: euros(avance)
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   La composition d'un mois
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Une ligne de réalisé : ce qu'un ensemble de missions a émis sur le mois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN ENSEMBLE DE MISSIONS, ET NON UNE MISSION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `Recette` ne porte pas de `missionId` : le modèle ne relie qu'un nom de
 * client. Le rattachement se reconstruit par client ET par fenêtre de dates, ce
 * qui sépare correctement deux missions successives d'un même client — le cas
 * courant. Il reste un cas que rien ne départage : deux missions d'un même
 * client qui couraient EN MÊME TEMPS. Aucune date ne tranche.
 *
 * Choisir au hasard donnerait « 0 € » en face d'une mission qui facture.
 * Donner le même montant aux deux ferait un total supérieur au réalisé du mois.
 * La ligne porte donc les deux missions et `indetermine` à `true` : la somme
 * des lignes reste exactement le réalisé, et l'écran peut dire pourquoi cette
 * ligne-là en nomme deux.
 */
export interface LigneRealiseDuMois {
  /** Les missions candidates. Une seule dans le cas courant, zéro si aucune. */
  readonly missionIds: readonly string[];
  readonly libelle: string;
  readonly clientNom: string;
  /** Journées retenues au planning sur le mois, ajustements compris. */
  readonly jours: number;
  /** Le tarif journalier, `null` si les missions de la ligne n'ont pas le même. */
  readonly tjm: Euros | null;
  /** Ce que ces journées valent au planning — ce qui rend la ligne vérifiable. */
  readonly produitAuPlanning: Euros;
  /** Émis sur le mois et rattaché à cette ligne. */
  readonly facture: Euros;
  /** `true` quand deux missions simultanées d'un même client se partagent la ligne. */
  readonly indetermine: boolean;
}

/** Un encaissement du mois, avec la pièce qui le justifie. */
export interface LigneEncaisseeDuMois {
  readonly recetteId: string;
  readonly numero: string;
  readonly clientNom: string;
  readonly libelle: string;
  readonly montant: Euros;
  readonly encaisseeLe: DateISO;
  /**
   * Le mois d'émission de la facture, `null` si elle n'a jamais été émise.
   *
   * C'est lui qui permet de dire « venu d'avril » ou « encaissé d'avance »
   * ligne par ligne, sans que l'écran ait à refaire le rattachement.
   */
  readonly emiseAu: Mois | null;
}

export interface CompositionDuMois {
  readonly mois: Mois;
  /**
   * Le réalisé du mois : ce qui a été ÉMIS. Même définition que
   * `chiffreParMois`, et volontairement la même — deux définitions du réalisé
   * finiraient par afficher deux totaux sur le même écran.
   */
  readonly realiseFacture: Euros;
  /**
   * Le travail du mois valorisé au planning, facturé ou non.
   *
   * ─────────────────────────────────────────────────────────────────────
   * SUR SA PROPRE LIGNE, JAMAIS FONDU DANS LE RÉALISÉ
   * ─────────────────────────────────────────────────────────────────────
   *
   * Le dessin range des missions « En cours » — donc non facturées — sous un
   * titre « Réalisé · facturé ». Les additionner au réalisé mélangerait du
   * chiffre d'affaires et une intention : tant qu'aucune facture n'est partie,
   * rien n'est dû, rien n'entre au livre des recettes et l'URSSAF ne réclame
   * rien. Le chiffre est utile — c'est ce qui reste à facturer — mais il se lit
   * à côté, pas dedans.
   */
  readonly travailAuPlanning: Euros;
  readonly realiseParMission: readonly LigneRealiseDuMois[];
  readonly encaisse: Euros;
  readonly encaisseParFacture: readonly LigneEncaisseeDuMois[];
  readonly aEncaisser: ResteAEncaisserDuMois;
}

/** La facture tombe-t-elle dans la fenêtre de la mission ? */
function dansLaFenetre(mission: Mission, date: DateISO): boolean {
  if (mission.debut !== null && date < mission.debut) return false;
  if (mission.fin !== null && date > mission.fin) return false;
  return true;
}

/**
 * Ce qui compose le réalisé et l'encaissé d'un mois.
 *
 * Le réalisé est ventilé par mission avec les journées et le tarif qui le
 * composent : c'est ce qui rend la ligne vérifiable, et l'ancienne application
 * le faisait (`showMonthCARealisations`). Un montant seul ne se conteste pas ;
 * « 8 j × 650 € » se conteste, et c'est ainsi qu'on trouve la journée oubliée.
 */
export function compositionDuMois(
  faits: Faits,
  m: Mois,
  maintenant: Date = new Date()
): CompositionDuMois {
  const missions = faits.missions.filter(
    (mi) => mi.statut === 'active' || mi.statut === 'terminee'
  );
  const emises = faits.recettes.filter(
    (r) => r.emiseLe !== null && r.emiseLe.startsWith(m)
  );

  // Les journées du planning, par mission. Même source que le CRA et que la
  // prévision : en produire une seconde garantirait qu'elles divergent.
  const joursParMission = new Map<string, number>();
  for (const p of previsionDuMoisParMission(faits, m)) {
    joursParMission.set(
      p.missionId, (joursParMission.get(p.missionId) ?? 0) + p.prevision.joursRetenus
    );
  }

  interface Groupe {
    readonly ids: readonly string[];
    readonly clientNom: string;
    readonly libelle: string;
    facture: number;
  }
  const groupes = new Map<string, Groupe>();

  for (const r of emises) {
    const emiseLe = r.emiseLe as DateISO;
    const candidates = missions
      .filter((mi) => mi.clientNom === r.clientNom && dansLaFenetre(mi, emiseLe))
      .map((mi) => mi.id)
      .sort();
    const cle = `${r.clientNom} ${candidates.join('|')}`;
    const existant = groupes.get(cle);
    if (existant === undefined) {
      groupes.set(cle, {
        ids: candidates,
        clientNom: r.clientNom,
        libelle: libelleDuGroupe(missions, candidates, r.clientNom, r.libelle),
        facture: r.montant
      });
    } else {
      existant.facture += r.montant;
    }
  }

  // Les journées vont au premier groupe qui contient la mission. Une mission ne
  // peut appartenir à deux groupes que si elle a facturé le même mois une fois
  // seule et une fois en chevauchement d'une autre — auquel cas mieux vaut ses
  // journées rangées quelque part que comptées deux fois.
  const joursAttribues = new Set<string>();
  const lignes: LigneRealiseDuMois[] = [...groupes.values()].map((g) => {
    let jours = 0;
    for (const id of g.ids) {
      if (joursAttribues.has(id)) continue;
      joursAttribues.add(id);
      jours += joursParMission.get(id) ?? 0;
    }
    return ligneDeRealise(missions, g.ids, g.clientNom, g.libelle, jours, euros(g.facture));
  });

  // Les missions qui ont travaillé sans rien facturer ce mois-ci n'ont aucune
  // recette, donc aucun groupe. Les omettre effacerait précisément les missions
  // « en cours » que le dessin veut voir.
  for (const mi of missions) {
    if (joursAttribues.has(mi.id)) continue;
    const jours = joursParMission.get(mi.id) ?? 0;
    if (jours <= 0) continue;
    joursAttribues.add(mi.id);
    lignes.push(ligneDeRealise(
      missions, [mi.id], mi.clientNom,
      mi.description !== '' ? mi.description : mi.clientNom,
      jours, euros(0)
    ));
  }

  const encaisseParFacture: LigneEncaisseeDuMois[] = faits.recettes
    .filter((r): r is typeof r & { encaisseeLe: DateISO } =>
      r.encaisseeLe !== null && r.encaisseeLe.startsWith(m))
    .map((r) => ({
      recetteId: r.id,
      numero: r.numero,
      clientNom: r.clientNom,
      libelle: r.libelle,
      montant: r.montant,
      encaisseeLe: r.encaisseeLe,
      emiseAu: r.emiseLe === null ? null : (r.emiseLe.slice(0, 7) as Mois)
    }));

  return {
    mois: m,
    realiseFacture: euros(emises.reduce<number>((s, r) => s + r.montant, 0)),
    travailAuPlanning: euros(lignes.reduce<number>((s, l) => s + l.produitAuPlanning, 0)),
    realiseParMission: [...lignes].sort((a, b) => b.facture - a.facture || b.jours - a.jours),
    encaisse: euros(encaisseParFacture.reduce<number>((s, l) => s + l.montant, 0)),
    encaisseParFacture,
    aEncaisser: resteAEncaisserDuMois(faits, m, maintenant)
  };
}

/** Comment nommer une ligne qui peut couvrir plusieurs missions. */
function libelleDuGroupe(
  missions: readonly Mission[],
  ids: readonly string[],
  clientNom: string,
  libelleRecette: string
): string {
  const noms = ids
    .map((id) => missions.find((mi) => mi.id === id))
    .map((mi) => (mi === undefined ? '' : (mi.description !== '' ? mi.description : mi.clientNom)))
    .filter((n) => n !== '');
  if (noms.length > 0) return noms.join(' · ');
  // Aucune mission ne couvre cette facture : on n'invente pas de rattachement,
  // on nomme la pièce. Une ligne sans mission à 12 000 € est la première chose
  // à aller vérifier, et elle doit rester lisible.
  return clientNom !== '' ? clientNom : libelleRecette;
}

function ligneDeRealise(
  missions: readonly Mission[],
  ids: readonly string[],
  clientNom: string,
  libelle: string,
  jours: number,
  facture: Euros
): LigneRealiseDuMois {
  const tarifs = ids
    .map((id) => missions.find((mi) => mi.id === id)?.tjm)
    .filter((t): t is Euros => t !== undefined && t > 0);
  // Un tarif unique, ou rien : afficher celui de la première mission d'une
  // ligne qui en couvre deux ferait croire à une vérification qui n'a pas eu
  // lieu.
  const tjm = tarifs.length > 0 && tarifs.every((t) => t === tarifs[0])
    ? (tarifs[0] as Euros)
    : null;

  return {
    missionIds: ids,
    libelle,
    clientNom,
    jours,
    tjm,
    produitAuPlanning: euros(jours * (tjm ?? 0)),
    facture,
    indetermine: ids.length > 1
  };
}
