/**
 * Le pipeline des encaissements attendus : une seule source, deux lecteurs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le pipeline vivait dans `selecteurs.argent.ts`, qui importe `etatPilote`.
 * Or `etatPilote` doit désormais connaître l'argent à venir pour provisionner
 * l'impôt au taux de l'année : le lire depuis l'écran Argent aurait formé un
 * cycle, et le recopier aurait donné deux projections du même chiffre
 * d'affaires, qui finissent toujours par se contredire. Il vit donc ici, en
 * amont des deux : la projection de trésorerie et la provision d'impôt
 * lisent le même calcul.
 */

import type { DateISO, Euros, Mois } from '../domain/types';
import { euros } from '../domain/types';
import { suivre } from '../domain/calculs/facturier';
import {
  FORMULE_PAR_DEFAUT, echeanceDe, formuleOuNull
} from '../domain/calculs/delaiPaiement';
import type { Faits } from './schema';
import { dateDuJour, moisCourant } from './selecteurs';
import { previsionDuMoisParMission } from './selecteurs.prevision';

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

/** Le dernier jour d'un mois, au format ISO. */
export function finDuMoisISO(m: Mois): DateISO {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10) as DateISO;
}

/**
 * Les encaissements attendus, mois par mois, sur l'horizon fourni.
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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SERT TROIS HORIZONS DIFFÉRENTS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `etatProjection` l'appelle sur douze mois glissants — la carte « Où va ton
 * disponible ». `evolutionCompte` l'appelle sur un horizon variable, qui
 * dépend de l'année regardée. La provision d'impôt l'appelle du mois courant
 * à décembre. Un seul calcul d'attente, plusieurs fenêtres — jamais une
 * seconde implémentation qui aurait pu diverger de la première.
 *
 * Le premier mois d'`horizon` sert de PLANCHER : une facture déjà échue
 * retombe dessus plutôt que sur sa date passée, qui n'a plus de sens une fois
 * l'horizon commencé. Voir l'appelant pour ce que ce plancher vaut dans
 * chaque cas — le mois courant pour `etatProjection`, le mois suivant pour
 * `evolutionCompte`, qui traite le mois courant comme un fait et non comme
 * une projection.
 */
export function encaissementsAttendusParMois(
  faits: Faits,
  horizon: readonly Mois[],
  maintenant: Date
): Map<Mois, number> {
  const attendu = new Map<Mois, number>(horizon.map((m) => [m, 0]));
  if (horizon.length === 0) return attendu;
  const plancher = horizon[0] as Mois;

  /* Le décalage de l'encaissement attendu suit la FORMULE, pas un nombre de
     jours : « 30 jours fin de mois » repousse une facture du 12 juin au
     31 juillet, dix-neuf jours plus loin qu'une simple addition. Sur une
     prévision de trésorerie, dix-neuf jours changent le mois. */
  const formulesClient = new Map(faits.clients.map((c) => [c.nom, c.delaiPaiement]));

  const ajouter = (m: Mois, montant: number): void => {
    // Hors fenêtre : ni avant le plancher — l'argent d'hier est déjà au
    // solde — ni au-delà de l'horizon.
    if (attendu.has(m)) attendu.set(m, (attendu.get(m) ?? 0) + montant);
  };

  // 1. Les factures émises et non réglées, à l'échéance. Une échéance déjà
  //    passée retombe sur le plancher : la somme est toujours due.
  for (const f of facturesSuivies(faits, maintenant)) {
    if (f.statut !== 'emise' && f.statut !== 'envoyee' && f.statut !== 'en_retard') continue;
    const echeance = (f.echeanceLe ?? plancher).slice(0, 7) as Mois;
    ajouter(echeance < plancher ? plancher : echeance, f.recette.montant);
  }

  /* 2. Le revenu prévu au planning, daté à son ÉCHÉANCE réelle.
        Le mois M se facture le dernier jour du mois, et l'échéance suit la
        formule convenue. Le calcul précédent divisait un nombre de jours par
        trente et arrondissait au mois supérieur : « 30 jours fin de mois »
        s'y traduisait par un mois de décalage, alors qu'une facture du
        31 juillet à cette formule n'est due que le 30 septembre. Un mois
        d'écart sur chaque mission, sur toute la prévision. */
  const parMission = new Map(faits.missions.map((mi) => [mi.id, mi]));
  for (const m of horizon) {
    for (const p of previsionDuMoisParMission(faits, m)) {
      const mission = parMission.get(p.missionId);
      const nom = mission?.clientNom ?? '';
      const emiseLe = finDuMoisISO(m);
      const formule = formuleOuNull(mission?.delaiPaiement)
        ?? formulesClient.get(nom) ?? FORMULE_PAR_DEFAUT;
      ajouter(echeanceDe(emiseLe, formule).slice(0, 7) as Mois, p.prevision.montantRetenu);
    }
  }

  return attendu;
}

/**
 * Ce qui reste à encaisser d'ici le 31 décembre de l'année courante.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE ÉCHÉANCE AU-DELÀ DE DÉCEMBRE N'EST PAS DE L'ANNÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le revenu de décembre, à trente jours, s'encaisse en janvier : il est
 * hors fenêtre et n'entre pas ici. Le compter ferait payer à l'année en cours
 * l'impôt de la suivante — l'impôt sur un micro suit l'encaissement.
 */
export function encaissementsAttendusDeLAnnee(
  faits: Faits,
  maintenant: Date = new Date()
): Euros {
  const m0 = moisCourant(maintenant);
  const annee = m0.slice(0, 4);
  const horizon: Mois[] = [];
  for (let n = Number(m0.slice(5, 7)); n <= 12; n++) {
    horizon.push(`${annee}-${String(n).padStart(2, '0')}` as Mois);
  }
  let somme = 0;
  for (const v of encaissementsAttendusParMois(faits, horizon, maintenant).values()) somme += v;
  return euros(somme);
}
