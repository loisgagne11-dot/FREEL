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
import { euros, mois } from '../domain/types';
import { assujettissementTva, plafondMicro, seuilsTvaPourAnnee } from '../domain/bareme';
import type { SeuilsTva, StatutAssujettissementTva } from '../domain/bareme';
import type { Resolution } from '../domain/types';
import type { Echeance, VentilationProvisions } from '../domain/calculs/provisions';
import type { ResultatTresorerie } from '../domain/calculs/tresorerie';
import type { ProvisionImpotRevenu } from '../domain/calculs/provisionImpotRevenu';
import { encoursDe } from '../domain/calculs/facturier';
import { decalerMois } from '../domain/calculs/periode';
import type { Faits } from './schema';
import { dateDuJour, etatPilote, moisCourant, remunerationDuMois } from './selecteurs';
import { tauxDeChargesAu } from './selecteurs.activite';
import {
  type ProjectionSolde, depensesMensuellesMoyennes, projeterDisponible
} from '../domain/calculs/projectionSolde';
import { encaissementsAttendusDetailles, facturesSuivies } from './selecteurs.pipeline';
import { type SortieDeCharge, sortiesParMois, totalDesSorties } from '../domain/calculs/sortiesDeCharges';
import { dateDeLEtape } from '../domain/calculs/obligations';
import { decaler } from '../domain/calculs/calendrier';
import { sortiesAVenir, sortiesDuDu } from './selecteurs.sorties';
import { obligationsEntre } from './selecteurs.obligations';

// Réexport : les lecteurs existants (performance) importent d'ici.
export { facturesSuivies };

/**
 * Les années que le sélecteur d'année d'un écran peut proposer — voir
 * `ChoixAnnee`, qui le pose dans l'en-tête d'Argent et d'Outils.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE BORNE SE LIT DANS LES FAITS, ELLE NE S'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un intervalle fixe — « les dix dernières années », disons — ferait
 * proposer neuf années vides à un dossier ouvert cette année, et en
 * cacherait une à un dossier repris avec dix ans d'historique. La borne
 * basse est donc celle du plus ancien fait daté du dossier ; la borne haute
 * est l'année courante, sauf si un fait existe déjà l'année suivante — une
 * mission planifiée en janvier prochain, typiquement, ou une échéance saisie
 * d'avance.
 *
 * L'intervalle est CONTINU entre les deux bornes, même si certaines années
 * intermédiaires n'ont aucun fait : un dossier de 2023 qui n'a rien saisi en
 * 2024 doit quand même pouvoir afficher 2024 — à zéro, ce qui est une
 * réponse, pas une année absente du menu.
 *
 * Un dossier vide ne propose que l'année courante : il n'y a rien à
 * comparer, et un menu à une seule entrée n'en est pas un — voir
 * `SelecteurAnnee`, qui se masque dans ce cas.
 *
 * Vit ici, et non dans `selecteurs.ts` : cette fonction ne sert qu'au
 * sélecteur de l'écran Argent, chargé à la demande (voir l'en-tête du
 * fichier). L'ajouter au module toujours chargé aurait fait franchir son
 * budget pour un contrôle que cinq écrans sur six n'affichent jamais —
 * constaté en pratique en écrivant ce lot.
 */
export function anneesDisponibles(faits: Faits, maintenant: Date = new Date()): readonly number[] {
  const courante = maintenant.getFullYear();
  const datees: readonly (DateISO | null)[] = [
    ...faits.recettes.flatMap((r) => [r.emiseLe, r.encaisseeLe]),
    ...faits.depenses.map((d) => d.payeeLe),
    ...faits.echeances.map((e): DateISO => e.echeanceLe),
    ...faits.missions.flatMap((m) => [m.debut, m.fin])
  ];
  const annees = new Set(
    datees.flatMap((d) => (d === null ? [] : [Number(d.slice(0, 4))]))
  );

  const plusAncienne = annees.size === 0 ? courante : Math.min(courante, ...annees);
  const resultat: number[] = [];
  for (let a = plusAncienne; a <= courante; a++) resultat.push(a);
  if (annees.has(courante + 1)) resultat.push(courante + 1);
  return resultat;
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
  /**
   * L'année dont on regarde le chiffre d'affaires, les seuils et les
   * provisions — un CHOIX de lecture, porté par le sélecteur de la barre du
   * haut, jamais un fait. `tresorerie` juste en dessous n'en dépend PAS : le
   * solde du compte a une valeur actuelle, elle ne se recalcule pas parce
   * qu'on regarde 2024. Voir `etatArgent`.
   */
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
  /** Le solde estimé de l'impôt de l'année précédente, tant que son avis manque. */
  readonly soldeImpotPrecedent: Resolution<ProvisionImpotRevenu> | null;
  /**
   * Quelle part de ce qui est dû est effectivement sur le compte, entre 0 et 1.
   *
   * ─────────────────────────────────────────────────────────────────────
   * BORNÉE À 1, ET ZÉRO PROVISION VAUT 1
   * ─────────────────────────────────────────────────────────────────────
   *
   * C'est l'étiquette du haut de l'écran — « Dû · N % couvert ». Elle
   * répond à une seule question : si tout tombait demain, le compte suivrait-il ?
   *
   * Au-delà de 1, il n'y a rien de plus à dire : avoir deux fois de quoi payer
   * ne rend pas la dette « 200 % couverte », et afficher un tel chiffre ferait
   * lire un excédent là où il n'y a qu'une réserve. Rien de dû rend 1
   * et non 0 : une division par zéro rendrait « 0 % couvert » sur un compte
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
  /**
   * Les deux seuils de TVA de l'année en cours, prorata temporis compris la
   * première année d'activité (voir `seuilsTvaPourAnnee`) — ce n'est PLUS le
   * seuil plein de la table pour une entreprise créée en cours d'année.
   */
  readonly franchiseTva: Resolution<SeuilsTva>;
  /**
   * Depuis quand collecter, en tenant compte du CA encaissé l'année
   * PRÉCÉDENTE — c'est la question que `franchiseTva` seul ne peut pas
   * répondre : il ne regarde que l'année en cours, donc jamais un
   * encaissement de décembre dernier. Voir `assujettissementTva`.
   */
  readonly assujettissementTva: Resolution<StatutAssujettissementTva>;
  /** Chiffre d'affaires encaissé de l'année, l'assiette des deux seuils. */
  readonly caEncaisse: Euros;
}

/**
 * L'état de l'écran Argent, pour l'année choisie et à l'instant présent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX PARAMÈTRES DE TEMPS, ET ILS NE SE CONFONDENT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `maintenant` est un FAIT : l'instant où on regarde l'écran, qui gouverne
 * tout ce qui est instantané — le solde du compte, le disponible,
 * l'autonomie. Ces chiffres viennent tous de `pilote.tresorerie`, calculé
 * ci-dessous sur `maintenant` et sur RIEN d'autre.
 *
 * `annee` est un CHOIX : celle que l'en-tête de l'écran affiche.
 * Elle gouverne le chiffre d'affaires, les seuils et les provisions de
 * l'année — tout ce qui se compte « sur 2025 » plutôt qu'« à cet instant ».
 *
 * Par défaut, `annee` vaut l'année de `maintenant` : c'est le mois de
 * l'ouverture, avant tout choix, et c'est aussi ce qui permet à tous les
 * appelants antérieurs à ce paramètre — tests compris — de continuer à
 * fonctionner sans le fournir.
 *
 * Le bug corrigé par ce paramètre : au 1ᵉʳ janvier, `annee` valait la
 * nouvelle année de `maintenant`, `chiffreParMois` ne trouvait plus aucune
 * recette dedans, et le pilier Performance s'affichait vide — sans qu'aucun
 * geste ne permette de revoir l'année qui venait de se terminer.
 */
export function etatArgent(
  faits: Faits,
  echeances: readonly Echeance[] = faits.echeances,
  maintenant: Date = new Date(),
  annee: number = maintenant.getFullYear()
): EtatArgent {
  const parMois = chiffreParMois(faits, annee);
  const caRealise = euros(parMois.reduce<number>((s, m) => s + m.realise, 0));
  const caEncaisse = euros(parMois.reduce<number>((s, m) => s + m.encaisse, 0));
  // `maintenant`, jamais `annee` : c'est le compte en banque à l'instant où on
  // regarde, quelle que soit l'année parcourue à l'écran. Voir la note
  // ci-dessus et le test « changer l'année ne change pas le solde ».
  const pilote = etatPilote(faits, echeances, maintenant);

  // Un mois quelconque de l'année choisie : `plafondMicro` ne distingue que
  // des PÉRIODES pluriannuelles (voir sa table), donc n'importe quel mois de
  // `annee` désigne la même période que n'importe quel autre. Prendre le mois
  // réel de `maintenant` désignerait la période de 2026 en consultant 2024.
  const m = mois(`${annee}-01`);
  const type = faits.entreprise.typeActivite;
  const debutActivite = faits.entreprise.debutActivite;
  const encours = encoursDe(facturesSuivies(faits, maintenant));

  // Le CA de l'année PRÉCÉDENTE : c'est lui que l'ancien calcul ignorait
  // entièrement, et c'est le bug remonté — un encaissement de décembre
  // dernier, avec TVA déjà collectée dessus, restait invisible une fois
  // l'application ouverte l'année suivante.
  const parMoisPrecedent = chiffreParMois(faits, annee - 1);
  const caEncaissePrecedent = euros(
    parMoisPrecedent.reduce<number>((s, mc) => s + mc.encaisse, 0)
  );

  return {
    seuils: {
      plafondMicro: plafondMicro(m, type, debutActivite),
      franchiseTva: seuilsTvaPourAnnee(annee, type, debutActivite),
      assujettissementTva: assujettissementTva({
        annee, type, debutActivite,
        caAnneePrecedente: caEncaissePrecedent,
        parMoisAnneeEnCours: parMois.map((mc) => ({ mois: mc.mois, encaisse: mc.encaisse }))
      }),
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
    soldeImpotPrecedent: pilote.soldeImpotPrecedent,
    couvertureProvisions: pilote.tresorerie.provisions <= 0
      ? 1
      : Math.min(1, Math.max(0, pilote.tresorerie.solde / pilote.tresorerie.provisions))
  };
}
// Le dossier de TVA d'une période vit à part, avec le contexte des dépenses :
// les obligations le lisent aussi, et ce module emporterait sinon toute la
// trésorerie dans le paquet différé de « à traiter ».
export { dossierTvaDuTrimestre } from './selecteurs.dossierTva';

/* ─────────────────────────────────────────────────────────────────────────
   Où va l'argent disponible, mois après mois
   ───────────────────────────────────────────────────────────────────────── */

/** Combien de mois la projection couvre. Un an : au-delà, tout est fiction. */
const MOIS_PROJETES = 12;

/** Sur combien de mois passés on moyenne les dépenses courantes. */
const MOIS_D_HISTORIQUE = 6;


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
  /**
   * Les encaissements attendus de chaque mois, en deux parts — les factures
   * émises, le planning signé —, alignés sur `projection.mois`.
   */
  readonly attendus: readonly { readonly factures: Euros; readonly planning: Euros }[];
  /** Ce qui quitte le compte pour le dû, mois par mois, aligné sur `projection.mois`. */
  readonly sorties: readonly (readonly SortieDeCharge[])[];
  /** Le dû d'aujourd'hui, posé à ses dates — au-delà de l'horizon compris. */
  readonly duDate: readonly SortieDeCharge[];
  /** Le solde du compte aujourd'hui, le point de départ du solde prévu. */
  readonly solde: Euros;
}

/**
 * Six mois d'historique de dépenses payées, ramenés à leur moyenne — ou
 * `null` si l'historique est trop court.
 *
 * Six mois à zéro ne sont pas six mois d'historique : sans AUCUNE dépense
 * enregistrée, on ne sait pas ce que coûte le mois — on ne sait pas non plus
 * qu'il ne coûte rien. Moyenner des zéros répondrait « zéro » à une question
 * qui n'a pas de réponse.
 */
function depensesMoyennesRecentes(faits: Faits, m0: Mois): Euros | null {
  if (faits.depenses.length === 0) return null;
  return depensesMensuellesMoyennes(
    Array.from({ length: MOIS_D_HISTORIQUE }, (_, i) => {
      const m = decalerMois(m0, -(i + 1));
      return euros(faits.depenses
        .filter((d) => d.payeeLe !== null && d.payeeLe.startsWith(m))
        .reduce<number>((s, d) => s + d.montantTtc, 0));
    })
  );
}

/**
 * Ce que le compte devient sur douze mois, avec et sans se verser.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENNENT LES ENCAISSEMENTS ATTENDUS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * De deux sources, et d'aucune autre — surtout pas d'une extrapolation du
 * passé (voir `encaissementsAttendusParMois`) :
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
  const { factures, planning } = encaissementsAttendusDetailles(faits, moisProjetes, maintenant);

  const pilote = etatPilote(faits, faits.echeances, maintenant);
  const taux = tauxDeChargesAu(faits, m0);
  const depenses = depensesMoyennesRecentes(faits, m0);
  // Faute de barème, zéro : la projection est alors trop haute d'un quart,
  // et `tauxDeCharges` à `null` oblige l'écran à le dire.
  const tauxRetenu = taux.statut === 'refuse' ? 0 : taux.valeur;
  const entrees = moisProjetes.map((m) => ({
    mois: m, encaissements: euros((factures.get(m) ?? 0) + (planning.get(m) ?? 0))
  }));
  const duDate = sortiesDuDu(faits, pilote, maintenant, () => prochaineLimiteDeTva(faits, maintenant));
  const sorties = sortiesParMois([...duDate, ...sortiesAVenir(faits, entrees, tauxRetenu, maintenant)], moisProjetes);

  return {
    depensesMensuelles: depenses,
    tauxDeCharges: taux.statut === 'refuse' ? null : taux.valeur,
    projection: projeterDisponible({
      depart: pilote.tresorerie.dispo,
      reserve: pilote.tresorerie.reserve,
      entrees,
      tauxDeCharges: tauxRetenu,
      depensesMensuelles: depenses ?? euros(0),
      soldeDepart: pilote.tresorerie.solde,
      chargesPayees: sorties.map(totalDesSorties)
    }),
    attendus: moisProjetes.map((m) => ({
      factures: euros(factures.get(m) ?? 0), planning: euros(planning.get(m) ?? 0)
    })),
    sorties,
    duDate,
    solde: pilote.tresorerie.solde,
    // Sur l'année écoulée, mois courant inclus : c'est la question « est-ce
    // que je me verse plus ou moins que ce que je peux ? ».
    versementsPasses: Array.from({ length: 12 }, (_, i) => {
      const m = decalerMois(m0, i - 11);
      return { mois: m, montant: remunerationDuMois(faits, m) };
    })
  };
}



/**
 * Le jour où la TVA à reverser quitte le compte : la prochaine déclaration de
 * TVA à payer — CA3, CA12 ou celle d'un achat autoliquidé —, lue sur les
 * obligations (lot 53), qui seules connaissent ces calendriers. Une
 * déclaration en retard compte : elle se paie maintenant. `null` quand aucune
 * n'est prévue sur l'année qui vient.
 */
function prochaineLimiteDeTva(faits: Faits, maintenant: Date): DateISO | null {
  const aujourdhui = dateDuJour(maintenant);
  return obligationsEntre(faits, decaler(aujourdhui, -120), decaler(aujourdhui, 400), aujourdhui)
    .flatMap((o) => (o.nature === 'tva' && o.paiement !== undefined && o.paiement.etat !== 'fait'
      ? [dateDeLEtape(o.paiement)]
      : []))
    .sort()[0] ?? null;
}
