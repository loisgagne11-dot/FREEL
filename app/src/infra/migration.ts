/**
 * Migration des données de l'ancienne application vers le nouveau schéma.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EST TRAITÉ COMME UN LIVRABLE DE PREMIÈRE CLASSE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'audit a identifié la migration comme le risque n°1 du projet, et il n'est
 * pas de nature technique mais réglementaire : les données de l'utilisateur
 * comprennent son livre des recettes et ses justificatifs, c'est-à-dire des
 * pièces comptables à conservation obligatoire. Une migration qui perd des
 * données ne fait pas perdre du confort, elle fait perdre des documents que
 * la loi oblige à conserver.
 *
 * Trois garanties, dans cet ordre :
 *
 *  1. RAPPORT À BLANC. `analyser()` ne touche à rien et dit exactement ce
 *     qui serait migré, combien, et ce qui pose problème. On regarde avant
 *     d'agir.
 *  2. INSTANTANÉ AVANT ÉCRITURE. `migrer()` copie l'intégralité des clés de
 *     l'ancienne application dans une clé d'archive AVANT la moindre
 *     écriture. Si quoi que ce soit tourne mal, l'état d'origine est
 *     récupérable.
 *  3. IDEMPOTENCE. Relancer la migration sur des données déjà migrées ne
 *     duplique rien et n'écrase rien.
 *
 * Ce module ne SUPPRIME jamais les anciennes clés. Le legacy doit rester
 * lisible : c'est la condition pour qu'il puisse cohabiter en lecture seule.
 */

import { type DateISO, type Mois, type TypeActivite, euros, ratio } from '../domain/types';
import {
  CLE_INSTANTANE_AVANT_MIGRATION, CLE_STOCKAGE, VERSION_SCHEMA,
  type Client, type Conge, type Depense, type Faits, type Mission, type Recette,
  type Rythme, completerFaits, entrepriseVide, faitsVides, motifRefusFaits
} from '../state/schema';
import { JOURS_SEMAINE } from '../domain/calculs/planning';
import type { Echeance, NatureDette } from '../domain/calculs/provisions';

/** Préfixe de l'ancienne application. Ne jamais écrire dessus. */
export const PREFIXE_LEGACY = 'freel_v50_';
export const CLE_BUNDLE_LEGACY = `${PREFIXE_LEGACY}bundle`;
/** Clés annexes de l'ancienne application, sauvegardées dans l'instantané. */
export const CLES_ANNEXES_LEGACY = [
  'freel_ts', 'freel_theme', 'freel_goal_ca', 'freel_notif_read',
  'freel_supabase', 'freel_app_version'
] as const;

/** Interface minimale de stockage, pour que le module reste testable sans navigateur. */
export interface Stockage {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface Anomalie {
  readonly gravite: 'bloquante' | 'avertissement';
  readonly message: string;
}

export interface RapportMigration {
  readonly aDesDonneesLegacy: boolean;
  readonly dejaMigre: boolean;
  readonly comptes: {
    readonly clients: number;
    readonly missions: number;
    readonly recettes: number;
    readonly depenses: number;
    readonly periodesDeclarees: number;
  };
  readonly anomalies: readonly Anomalie[];
  /** Champs de l'ancienne structure qu'aucun champ du nouveau schéma n'accueille. */
  readonly champsNonRepris: readonly string[];
}

type Inconnu = Record<string, unknown>;

const objet = (v: unknown): Inconnu => (typeof v === 'object' && v !== null ? v as Inconnu : {});
const tableau = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texte = (v: unknown): string => (typeof v === 'string' ? v : '');
const nombre = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number.parseFloat(texte(v));
  return Number.isFinite(n) ? n : 0;
};
const booleen = (v: unknown): boolean => v === true;

const dateOuNull = (v: unknown): DateISO | null =>
  /^\d{4}-\d{2}-\d{2}$/.test(texte(v)) ? texte(v) as DateISO : null;

const moisOuNull = (v: unknown): Mois | null =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(texte(v)) ? texte(v) as Mois : null;

function typeActivite(v: unknown): TypeActivite {
  const t = texte(v);
  return t === 'BIC_vente' || t === 'BIC_service' ? t : 'BNC';
}

function periodicite(v: unknown): 'mensuel' | 'trimestriel' {
  return texte(v) === 'trimestriel' ? 'trimestriel' : 'mensuel';
}

function modeReglement(v: unknown): Recette['modeReglement'] {
  const m = texte(v).toLowerCase();
  if (m === 'virement' || m === 'cheque' || m === 'especes' || m === 'carte') return m;
  return m === '' ? null : 'autre';
}

/** Lit le bundle de l'ancienne application, en gérant le format par clé plus ancien. */
function lireLegacy(stockage: Stockage): Inconnu | null {
  const brut = stockage.getItem(CLE_BUNDLE_LEGACY);
  if (brut !== null) {
    try {
      return objet(JSON.parse(brut));
    } catch {
      return null;
    }
  }
  // Format antérieur : une clé par entité. Reconstitué pour ne pas laisser de
  // côté un utilisateur qui n'aurait pas rouvert l'app depuis longtemps.
  const parCle: Inconnu = {};
  const paires: readonly [string, string][] = [
    ['company', 'c'], ['missions', 'm'], ['clients', 'cl'],
    ['treasury', 't'], ['ir_config', 'ir']
  ];
  let trouve = false;
  for (const [suffixe, champ] of paires) {
    const v = stockage.getItem(PREFIXE_LEGACY + suffixe);
    if (v === null) continue;
    trouve = true;
    try {
      parCle[champ] = JSON.parse(v);
    } catch {
      // Une entité illisible ne doit pas empêcher les autres de migrer.
    }
  }
  return trouve ? parCle : null;
}

/**
 * Extrait les recettes des missions de l'ancienne structure.
 *
 * Dans l'ancien modèle, les factures étaient imbriquées dans les missions.
 * Le nouveau schéma les remonte au premier plan : le livre des recettes est
 * une obligation à part entière, pas un sous-produit d'une mission.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES NOMS DE CHAMPS SONT RELEVÉS DU CODE LEGACY, PAS SUPPOSÉS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une première version cherchait `montant`, `date`, `datePaiement` et
 * `payee` — des noms plausibles, et tous faux. L'ancienne application emploie
 * `ht`, `dateEnvoi`, `datePaiementReel` et `status`. Conséquence : les
 * recettes arrivaient à zéro euro, sans date et jamais encaissées, ce qui
 * vidait le chiffre d'affaires, les provisions et le livre des recettes.
 *
 * Le jeu d'essai reproduisait la supposition au lieu de la structure réelle :
 * il passait donc, et ne prouvait rien. Il est désormais copié sur les noms
 * effectivement lus dans `index.html`.
 *
 * Le montant retenu est le HT : c'est l'assiette du chiffre d'affaires en
 * micro, et c'est lui que l'URSSAF réclame. En franchise en base, HT et TTC
 * se confondent de toute façon.
 */
function extraireRecettes(missions: unknown[], anomalies: Anomalie[]): Recette[] {
  const recettes: Recette[] = [];
  /** Montants des brouillons écartés. Signalés, jamais perdus en silence. */
  const brouillonsIgnores: number[] = [];

  missions.forEach((mBrut, iMission) => {
    const m = objet(mBrut);
    const factures = tableau(m['factures']);
    factures.forEach((fBrut, iFacture) => {
      const f = objet(fBrut);

      // ── Les brouillons ne sont PAS des recettes ────────────────────────
      //
      // L'ancienne application fabrique une facture par mois à venir de
      // chaque mission, jusqu'à la date de fin, avec `status: 'brouillon'`
      // (voir `buildMission`). Ce sont des PROJECTIONS de chiffre d'affaires,
      // pas des factures : rien n'a été émis, rien n'est dû, le client ne les
      // a jamais reçues.
      //
      // Les importer remplissait le livre des recettes d'écritures datées de
      // plusieurs mois dans le futur, gonflait le chiffre d'affaires de
      // l'année, faisait apparaître des « factures en retard » qui n'existent
      // pas et des périodes à déclarer sur du néant. Un livre des recettes
      // qui contient des prévisions n'est pas un livre des recettes.
      //
      // Constaté le 12/08 sur des données réelles : 22 écritures dont une
      // datée de janvier 2027, et un « facturé sur l'année » deux fois trop
      // élevé.
      if (texte(f['status']).toLowerCase() === 'brouillon') {
        brouillonsIgnores.push(nombre(f['ht'] ?? f['montantHT'] ?? f['montant']));
        return;
      }

      const encaisseeLe = dateOuNull(
        f['datePaiementReel'] ?? f['datePaiement'] ?? f['paidAt'] ?? f['dateEncaissement']
      );
      // Le statut legacy s'écrit « payée » ou « payé » selon l'endroit du code
      // qui l'a posé. Les deux comptent, et une date de paiement vaut preuve
      // d'encaissement même si le statut n'a pas suivi.
      const statut = texte(f['status']).toLowerCase();
      const estEncaissee = statut === 'payée' || statut === 'payee' || statut === 'payé'
        || booleen(f['payee'] ?? f['paid'])
        || encaisseeLe !== null;

      // Mention obligatoire du livre des recettes. L'ancienne structure ne la
      // portait pas : on ne peut pas l'inventer, on la signale.
      if (estEncaissee && encaisseeLe === null) {
        anomalies.push({
          gravite: 'avertissement',
          message: `Recette encaissée sans date d'encaissement (mission ${iMission + 1}, `
            + `facture ${iFacture + 1}) : mention obligatoire du livre des recettes, à ressaisir.`
        });
      }
      if (estEncaissee && modeReglement(f['modeReglement']) === null) {
        anomalies.push({
          gravite: 'avertissement',
          message: `Recette encaissée sans mode de règlement (mission ${iMission + 1}, `
            + `facture ${iFacture + 1}) : mention obligatoire du livre des recettes, à ressaisir.`
        });
      }

      recettes.push({
        id: texte(f['id']) || `rec-${iMission}-${iFacture}`,
        clientNom: texte(m['client']),
        libelle: texte(f['libelle'] ?? f['description'] ?? m['description']),
        montant: euros(nombre(f['ht'] ?? f['montantHT'] ?? f['montant'] ?? f['total'])),
        // `dateEnvoi` est la date d'émission réelle. À défaut, le mois de la
        // facture donne au moins la période : la perdre empêcherait la
        // déclaration européenne de services de voir la prestation.
        emiseLe: dateOuNull(f['dateEnvoi'] ?? f['date'] ?? f['dateEmission'])
          ?? premierJourDuMois(texte(f['mois'])),
        encaisseeLe,
        modeReglement: modeReglement(f['modeReglement']),
        numero: texte(f['numero'] ?? f['num'])
      });
    });
  });

  if (brouillonsIgnores.length > 0) {
    const total = brouillonsIgnores.reduce((s, m) => s + m, 0);
    anomalies.push({
      gravite: 'avertissement',
      message: `${brouillonsIgnores.length} facture(s) à l'état de brouillon `
        + `(${Math.round(total)} € au total) n'ont pas été reprises : l'ancienne `
        + `application les fabriquait à l'avance, mois par mois, pour projeter le `
        + `chiffre d'affaires. Rien n'a été émis, donc rien n'entre au livre des `
        + `recettes. Les factures réellement dues restent à émettre depuis l'écran `
        + `Facturer.`
    });
  }
  return recettes;
}

/**
 * Statut de mission, tel que l'ancienne application l'écrivait.
 *
 * Elle employait `en_cours`, `perdue`, `prospect` et `active` selon l'endroit
 * du code. Une première version rabattait tout ce qui n'était ni `terminee`
 * ni `prospect` sur `active` : une mission perdue s'affichait donc comme en
 * cours, et son chiffre d'affaires prévisionnel comptait encore.
 */
function statutMission(brut: string): Mission['statut'] {
  switch (brut.toLowerCase()) {
    case 'terminee':
    case 'terminée':
    case 'done':
    case 'finie':
      return 'terminee';
    case 'prospect':
      return 'prospect';
    case 'perdue':
    case 'perdu':
      return 'perdue';
    default:
      return 'active';
  }
}

/**
 * Convertit les congés de l'ancienne structure en dates pleines.
 *
 * L'ancien format groupait les numéros de jour par mois — `{ '2025-08':
 * [1, 2, 3] }` — ce qui obligeait à reconstruire une date à chaque lecture et
 * rendait impossible une plage à cheval sur deux mois. Un numéro de jour hors
 * du mois (un 31 février, par exemple) est écarté : reporter silencieusement
 * sur le mois suivant poserait un congé un jour où l'utilisateur travaillait.
 */
/**
 * Les congés, là où l'ancienne application les écrit VRAIMENT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * JE LISAIS UN CHAMP VIDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `treasury.conges` existe dans les valeurs par défaut du legacy — un `{}`
 * commenté « { '2025-08': [1,2,3] } » — mais rien ne l'alimente. L'écriture
 * réelle se fait dans `mission.congesDates`, une liste de dates ISO avec le
 * suffixe `_half` pour les demi-journées.
 *
 * La conversion lisait donc un objet vide pendant que les congés de
 * l'utilisateur étaient ailleurs, et son calendrier arrivait vierge. Même
 * famille d'erreur que `ht` contre `montant` sur les factures : un champ
 * plausible, au mauvais endroit.
 *
 * L'ancien format est conservé en repli : rien ne dit qu'aucune installation
 * ne l'a jamais rempli, et le perdre pour rien serait dommage.
 */
function congesDesMissions(missions: readonly unknown[]): Conge[] {
  const parDate = new Map<string, Conge>();

  for (const mBrut of missions) {
    for (const cd of tableau(objet(mBrut)['congesDates'])) {
      const brut = texte(cd);
      const demi = brut.endsWith('_half');
      const date = demi ? brut.slice(0, -5) : brut;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      // Une même date posée sur deux missions reste UN jour de congé : la
      // personne ne peut pas être deux fois en vacances. La quotité la plus
      // forte l'emporte.
      const existant = parDate.get(date);
      const quotite = demi ? 0.5 : 1;
      if (existant === undefined || quotite > existant.quotite) {
        parDate.set(date, { date: date as DateISO, quotite });
      }
    }
  }

  return [...parDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Le rythme de travail, tel que l'ancienne application le décrit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * C'EST LE FAIT QUI REMPLIT LE PLANNING
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `mission.periodes[]` porte `joursMap` — `{ lun: 1, …, ven: 0.5 }` — et un
 * TJM propre à la plage. Sans lui, le planning de la nouvelle application
 * resterait vide et il faudrait tout ressaisir, alors que la donnée existe.
 *
 * `joursSemaine` est un format plus ancien : un simple nombre de jours par
 * semaine, sans dire lesquels. On le convertit en semaine ouvrée pleine
 * plutôt que de le perdre — c'est faux pour un quatre-cinquièmes du mercredi,
 * mais les ajustements sont là pour corriger, et rien ne vaut mieux que rien.
 */
function rythmesDeLaMission(m: Inconnu): Rythme[] {
  const rythmes: Rythme[] = [];

  for (const pBrut of tableau(m['periodes'])) {
    const p = objet(pBrut);
    const du = dateOuNull(p['debut']);
    const au = dateOuNull(p['fin']);
    if (du === null || au === null) continue;

    const brut = objet(p['joursMap']);
    const parJour: Record<string, number> = {};
    for (const j of JOURS_SEMAINE) {
      const q = nombre(brut[j]);
      if (q > 0) parJour[j] = q;
    }

    // Repli sur `joursSemaine` quand `joursMap` manque.
    if (Object.keys(parJour).length === 0 && nombre(p['joursSemaine']) > 0) {
      for (const j of ['lun', 'mar', 'mer', 'jeu', 'ven']) parJour[j] = 1;
    }

    const tjm = nombre(p['tjm']);
    rythmes.push({ du, au, parJour, tjm: tjm > 0 ? euros(tjm) : null });
  }

  return rythmes;
}

/**
 * Les ajustements : ce qui a réellement été travaillé.
 *
 * L'ancienne application les range par mois, dans `mission.lignes[].
 * ajustements`. Le nouveau schéma les met à plat par date : un ajustement
 * n'appartient pas à un mois, il appartient à un jour, et les regrouper
 * obligeait à retrouver la ligne avant de lire la valeur.
 *
 * Une quotité à zéro est CONSERVÉE. C'est même le cas le plus important :
 * elle dit « ce jour-là, prévu par le rythme, je n'ai pas travaillé ». La
 * filtrer laisserait le rythme le remettre, et le CRA facturerait un jour qui
 * n'a pas eu lieu.
 */
function ajustementsDeLaMission(m: Inconnu): Record<string, number> {
  const parDate: Record<string, number> = {};

  for (const ligneBrute of tableau(m['lignes'])) {
    const ajustements = objet(objet(ligneBrute)['ajustements']);
    for (const [date, valeur] of Object.entries(ajustements)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (typeof valeur !== 'number' || !Number.isFinite(valeur)) continue;
      parDate[date] = valeur;
    }
  }

  return parDate;
}

/**
 * Réunit deux sources de congés sans jamais compter un jour deux fois.
 *
 * La quotité la plus forte l'emporte : si une source dit demi-journée et
 * l'autre journée entière, retenir la moitié amputerait le solde de congés
 * de l'utilisateur.
 */
function fusionnerConges(a: readonly Conge[], b: readonly Conge[]): Conge[] {
  const parDate = new Map<string, Conge>();
  for (const c of [...a, ...b]) {
    const existant = parDate.get(c.date);
    if (existant === undefined || c.quotite > existant.quotite) parDate.set(c.date, c);
  }
  return [...parDate.values()].sort((x, y) => x.date.localeCompare(y.date));
}

function extraireConges(parMois: Inconnu): Conge[] {
  const dates = new Set<string>();
  for (const [m, jours] of Object.entries(parMois)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) continue;
    const dansLeMois = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
    for (const jourBrut of tableau(jours)) {
      const jour = Math.trunc(nombre(jourBrut));
      if (jour < 1 || jour > dansLeMois) continue;
      dates.add(`${m}-${String(jour).padStart(2, '0')}`);
    }
  }
  return [...dates].sort().map((d) => ({ date: d as DateISO, quotite: 1 }));
}

/**
 * Extrait les dépenses des mouvements de trésorerie de l'ancienne structure.
 *
 * L'ancien modèle ne connaissait pas la dépense : il avait des « mouvements »
 * de trésorerie, dont certains de type `Charge`. Ces mouvements portaient un
 * montant, une TVA déductible calculée à la saisie et un mois — mais **aucune
 * pièce**, aucun fournisseur, aucune provenance. C'est ce que l'audit
 * comptable relevait : la TVA était annoncée déductible sans qu'aucun
 * justificatif n'existe nulle part.
 *
 * La migration ne peut pas inventer les pièces manquantes. Elle fait la seule
 * chose honnête : reprendre les montants, poser `justificatifId: null`, et
 * laisser le domaine en tirer la conséquence — cette TVA n'est pas
 * récupérable tant que la pièce n'est pas déposée. L'écran Achats chiffre
 * alors ce que l'absence de pièces coûte, au lieu de la passer sous silence.
 */
/**
 * La catégorie d'un mouvement `Charge` de l'ancienne trésorerie, traduite en
 * nature de dette — ou `null` si c'est une vraie dépense professionnelle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE TRI N'EST PAS UN DÉTAIL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application rangeait tout sous « Charge » : cotisations URSSAF,
 * TVA reversée, avis d'impôt, CFE — et abonnements logiciels. La migration
 * les reprenait TOUS en dépenses.
 *
 * Or une cotisation sociale n'est pas un achat. En micro, elle n'est pas
 * déductible — l'abattement forfaitaire en tient lieu — et elle ne porte
 * aucune TVA. Les importer en dépenses gonflait l'écran Achats de lignes qui
 * n'y ont pas leur place, et leur faisait réclamer un justificatif de TVA
 * qu'elles n'auront jamais.
 *
 * Elles deviennent donc des ÉCHÉANCES payées, ce qu'elles sont : un appel
 * reçu, et honoré.
 */
function natureDeLaCategorie(categorie: string): NatureDette | null {
  const c = categorie.trim().toLowerCase();
  if (c.startsWith('urssaf')) return 'urssaf';
  if (c.startsWith('tva')) return 'tva';
  if (c === 'cfe') return 'cfe';
  if (c === 'cfp') return 'cfp';
  // « IR », « Impôt PL », « Impôt sur le revenu », « IR Estimé »… L'ancienne
  // application employait plusieurs libellés pour la même dette.
  if (c.startsWith('ir') || c.includes('impôt') || c.includes('impot')) return 'impot';
  return null;
}

/**
 * Les échéances reprises des mouvements `Charge` de nature fiscale ou sociale.
 *
 * Elles arrivent PAYÉES : le mouvement existait parce que l'argent était
 * sorti. Une échéance payée ne pèse plus sur les provisions — le solde
 * bancaire la reflète déjà.
 */
function extraireEcheances(mouvements: unknown[], anomalies: Anomalie[]): Echeance[] {
  const echeances: Echeance[] = [];
  mouvements.forEach((mvBrut, i) => {
    const mv = objet(mvBrut);
    if (texte(mv['type']) !== 'Charge') return;
    const nature = natureDeLaCategorie(texte(mv['categorie']));
    if (nature === null) return;

    const date = dateOuNull(mv['date']) ?? premierJourDuMois(texte(mv['mois']));
    if (date === null) {
      anomalies.push({
        gravite: 'avertissement',
        message: `Échéance « ${texte(mv['description']) || i + 1} » sans date exploitable : `
          + 'elle est datée d\'aujourd\'hui et reste à corriger.'
      });
    }

    echeances.push({
      id: texte(mv['id']) || `ech-${i}`,
      nature,
      // Une charge sociale ou fiscale n'a pas de TVA : le TTC EST le montant.
      montant: euros(nombre(mv['montantTTC']) || nombre(mv['montant'])),
      echeanceLe: date ?? (new Date().toISOString().slice(0, 10) as DateISO),
      payee: true
    });
  });

  if (echeances.length > 0) {
    anomalies.push({
      gravite: 'avertissement',
      message: `${echeances.length} charge(s) fiscale(s) ou sociale(s) reprise(s) en `
        + 'échéances PAYÉES, et non en dépenses : une cotisation n\'est pas un achat, '
        + 'elle n\'est pas déductible en micro et ne porte aucune TVA. Les échéances '
        + 'encore à payer sont à saisir depuis l\'écran Argent.'
    });
  }
  return echeances;
}

function extraireDepenses(mouvements: unknown[], anomalies: Anomalie[]): Depense[] {
  const depenses: Depense[] = [];
  mouvements.forEach((mvBrut, i) => {
    const mv = objet(mvBrut);
    if (texte(mv['type']) !== 'Charge') return;
    // Les charges fiscales et sociales partent en échéances, pas ici.
    if (natureDeLaCategorie(texte(mv['categorie'])) !== null) return;

    // L'ancien modèle stockait le HT dans `montant` et le TTC à part, ce
    // dernier n'étant renseigné que si la saisie s'était faite en TTC.
    const ttc = nombre(mv['montantTTC']) || nombre(mv['montant']);
    // `tvaRate` était en points de pourcentage (20), pas en ratio (0,20).
    const taux = nombre(mv['tvaRate']) / 100;

    const payeeLe = dateOuNull(mv['date']) ?? premierJourDuMois(texte(mv['mois']));
    if (payeeLe === null) {
      anomalies.push({
        gravite: 'avertissement',
        message: `Charge « ${texte(mv['description']) || i + 1} » sans date exploitable : `
          + 'la date de paiement est à ressaisir. Sans elle, la dépense ne peut être '
          + 'rattachée ni à un exercice, ni à un régime de TVA.'
      });
    }

    depenses.push({
      id: texte(mv['id']) || `dep-${i}`,
      libelle: texte(mv['description']),
      // Le fournisseur n'existait pas ; la catégorie en tient lieu le temps
      // que l'utilisateur le renseigne. La perdre serait pire.
      fournisseur: texte(mv['categorie']),
      // Aucune provenance n'était saisie : tout est réputé français, ce qui
      // était l'hypothèse implicite de l'ancienne application. Les achats
      // hors de France sont à requalifier à la main.
      provenance: 'france',
      montantTtc: euros(ttc),
      tauxTva: ratio(taux),
      payeeLe,
      justificatifId: null,
      rapprochement: 'en_attente'
    });
  });

  if (depenses.length > 0) {
    anomalies.push({
      gravite: 'avertissement',
      message: `${depenses.length} charge(s) reprise(s) en dépenses, toutes sans `
        + 'justificatif : l\'ancien modèle n\'en conservait aucun. La TVA de ces '
        + 'dépenses n\'est pas récupérable tant que la pièce n\'est pas déposée.'
    });
  }
  return depenses;
}

/**
 * Repli sur le premier jour quand seul le mois était connu.
 *
 * Le mois est l'information que l'ancienne application saisissait réellement ;
 * le premier du mois ne fabrique donc pas une période, il en choisit un jour à
 * l'intérieur de celle qui était connue. Quand même le mois manque, la
 * fonction rend `null` plutôt qu'une date d'apparence plausible.
 */
function premierJourDuMois(m: string): DateISO | null {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? `${m}-01` as DateISO : null;
}

function convertir(legacy: Inconnu, anomalies: Anomalie[], champsNonRepris: string[]): Faits {
  const c = objet(legacy['c']);
  const t = objet(legacy['t']);
  const missionsBrutes = tableau(legacy['m']);
  const clientsBruts = tableau(legacy['cl']);

  const clients: Client[] = clientsBruts.map((cliBrut, i) => {
    const cli = objet(cliBrut);
    return {
      id: texte(cli['id']) || `cli-${i}`,
      nom: texte(cli['nom']),
      adresse: texte(cli['adresse']),
      siret: texte(cli['siret']),
      email: texte(cli['email']),
      delaiPaiementJours: nombre(cli['delaiPaiement']),
      // L'ancien modèle ne connaissait ni pays ni numéro de TVA du client :
      // il ne pouvait donc pas voir qu'une déclaration européenne de services
      // était due. Les champs sont créés vides, et tout client est réputé
      // français jusqu'à ce que l'utilisateur en décide autrement.
      pays: texte(cli['pays']),
      tvaIntracom: texte(cli['tvaIntracom'])
    };
  });

  const parNom = new Map(clients.map((cli) => [cli.nom, cli.id]));

  const missions: Mission[] = missionsBrutes.map((mBrut, i) => {
    const m = objet(mBrut);
    const nom = texte(m['client']);
    const statutBrut = texte(m['statut']);
    // Le rattachement se fait par nom, l'ancien modèle ne portant pas
    // d'identifiant de client sur la mission. Un nom non retrouvé n'est pas
    // une perte : il est conservé en clair dans `clientNom`.
    const clientId = parNom.get(nom);
    if (nom !== '' && clientId === undefined) {
      anomalies.push({
        gravite: 'avertissement',
        message: `Mission « ${texte(m['description']) || i + 1} » : client « ${nom} » `
          + `absent de la liste des clients. Le nom est conservé, le rattachement est à refaire.`
      });
    }
    return {
      id: texte(m['id']) || `mis-${i}`,
      clientId: clientId ?? null,
      clientNom: nom,
      description: texte(m['description']),
      tjm: euros(nombre(m['tjm'])),
      rythmes: rythmesDeLaMission(m),
      ajustements: ajustementsDeLaMission(m),
      debut: dateOuNull(m['debut']),
      fin: dateOuNull(m['fin']),
      statut: statutMission(statutBrut)
    };
  });

  // Champs de l'ancienne trésorerie qu'aucun champ du nouveau schéma n'accueille.
  // Ils sont listés au lieu d'être perdus en silence.
  for (const champ of ['rendementActif', 'rendementTaux', 'rendementHistorique', 'actionsDone', 'paidCharges']) {
    if (champ in t) champsNonRepris.push(`treasury.${champ}`);
  }
  // Des mouvements, seules les charges sont reprises — en dépenses. Les autres
  // (salaires, apports) n'ont pas encore de place dans le nouveau schéma, et
  // le taire les ferait disparaître sans trace.
  const mouvements = tableau(t['mouvements']);
  const depenses = extraireDepenses(mouvements, anomalies);
  const echeances = extraireEcheances(mouvements, anomalies);
  if (mouvements.length > depenses.length + echeances.length) {
    champsNonRepris.push('treasury.mouvements (hors charges)');
  }

  return {
    version: VERSION_SCHEMA,
    entreprise: {
      ...entrepriseVide(),
      nom: texte(c['nom']),
      siret: texte(c['siret']),
      debutActivite: dateOuNull(c['debut']),
      typeActivite: typeActivite(c['typeActivite']),
      acre: booleen(c['acre']),
      versementLiberatoire: booleen(c['prelevementLiberatoire']),
      tvaDepuis: moisOuNull(c['tvaDepuis']),
      tvaIntracom: texte(c['tvaIntracom']),
      iban: texte(c['iban']),
      bic: texte(c['bic']),
      adresse: texte(c['adresse']),
      codePostal: texte(c['codePostal']),
      ville: texte(c['ville']),
      codeApe: texte(c['codeApe']),
      email: texte(c['email']),
      telephone: texte(c['telephone']),
      urssafPeriodicite: periodicite(c['urssafPeriodicite']),
      onboardingFait: booleen(c['onboardingDone'])
    },
    clients,
    missions,
    recettes: extraireRecettes(missionsBrutes, anomalies),
    depenses,
    // Les deux sources sont réunies : `mission.congesDates` est celle que
    // l'application alimente, `treasury.conges` un format plus ancien qu'on
    // ne perd pas pour rien.
    conges: fusionnerConges(
      congesDesMissions(missionsBrutes), extraireConges(objet(t['conges']))
    ),
    // L'ancienne application rapprochait contre un relevé importé à la main,
    // jamais contre un compte relié. Aucun fait ne permet de dire qu'un compte
    // l'est : on part de `false`, l'utilisateur le renseignera.
    // L'ancienne application n'importait pas de relevé : elle appariait des
    // opérations saisies à la main, sans les conserver comme des faits.
    mouvementsBancaires: [],
    // L'ancien modèle n'avait pas de barème éditable : les taux y étaient en
    // dur dans le code. Rien à reprendre.
    periodesUrssafAjoutees: [],
    soldeInitial: euros(nombre(t['soldeInitial'])),
    // La réserve unifiée (D4) reprend le plancher de compte de l'ancienne
    // version, seule des trois implémentations concurrentes à être un montant.
    reserve: euros(nombre(t['reserveCompte'])),
    besoinMensuel: euros(nombre(t['salaireEstime'])),
    // Aucune période n'était marquée comme déclarée dans l'ancien modèle :
    // ce fait n'y existait pas. Il devra être renseigné par l'utilisateur,
    // sinon le volet 2 des provisions surestimera la dette.
    periodesDeclarees: [],
    echeances,
    configImpotBrute: objet(legacy['ir'])
  };
}

/**
 * Convertit un bundle en faits, avec son rapport.
 *
 * Exposé pour que les données venues de Supabase passent par EXACTEMENT la
 * même conversion que celles du navigateur. Deux chemins de conversion
 * distincts finiraient par diverger, et l'application dirait alors deux choses
 * différentes selon l'origine de la donnée — le genre d'écart que l'audit a
 * relevé partout dans l'ancienne version.
 */
export function convertirBundle(
  bundle: Readonly<Record<string, unknown>>
): { readonly faits: Faits; readonly rapport: RapportMigration } {
  const anomalies: Anomalie[] = [];
  const champsNonRepris: string[] = [];
  const faits = convertir(bundle as Inconnu, anomalies, champsNonRepris);

  return {
    faits,
    rapport: {
      aDesDonneesLegacy: true,
      dejaMigre: false,
      comptes: {
        clients: faits.clients.length,
        missions: faits.missions.length,
        recettes: faits.recettes.length,
        depenses: faits.depenses.length,
        periodesDeclarees: faits.periodesDeclarees.length
      },
      anomalies,
      champsNonRepris
    }
  };
}

/** Rapport à blanc. N'écrit rien, ne modifie rien. */
export function analyser(stockage: Stockage): RapportMigration {
  const dejaMigre = stockage.getItem(CLE_STOCKAGE) !== null;
  const legacy = lireLegacy(stockage);

  if (legacy === null) {
    return {
      aDesDonneesLegacy: false, dejaMigre,
      comptes: { clients: 0, missions: 0, recettes: 0, depenses: 0, periodesDeclarees: 0 },
      anomalies: stockage.getItem(CLE_BUNDLE_LEGACY) !== null
        ? [{ gravite: 'bloquante', message: 'Données de l\'ancienne application illisibles (JSON invalide).' }]
        : [],
      champsNonRepris: []
    };
  }

  const anomalies: Anomalie[] = [];
  const champsNonRepris: string[] = [];
  const faits = convertir(legacy, anomalies, champsNonRepris);

  anomalies.push({
    gravite: 'avertissement',
    message: 'Aucune période déclarée n\'existe dans l\'ancien modèle. Tant qu\'elles ne '
      + 'sont pas renseignées, les provisions surestiment la dette : les recettes déjà '
      + 'déclarées sont comptées comme restant à provisionner.'
  });

  return {
    aDesDonneesLegacy: true,
    dejaMigre,
    comptes: {
      clients: faits.clients.length,
      missions: faits.missions.length,
      recettes: faits.recettes.length,
      depenses: faits.depenses.length,
      periodesDeclarees: faits.periodesDeclarees.length
    },
    anomalies,
    champsNonRepris
  };
}

/** Copie toutes les clés de l'ancienne application, avant toute écriture. */
export function prendreInstantane(stockage: Stockage): Record<string, string> {
  const instantane: Record<string, string> = {};
  for (let i = 0; i < stockage.length; i++) {
    const cle = stockage.key(i);
    if (cle === null) continue;
    if (!cle.startsWith(PREFIXE_LEGACY) && !CLES_ANNEXES_LEGACY.includes(cle as never)) continue;
    const v = stockage.getItem(cle);
    if (v !== null) instantane[cle] = v;
  }
  return instantane;
}

export type ResultatMigration =
  | { readonly statut: 'migre'; readonly faits: Faits; readonly rapport: RapportMigration }
  | { readonly statut: 'deja-migre'; readonly faits: Faits }
  | { readonly statut: 'rien-a-migrer'; readonly faits: Faits }
  | { readonly statut: 'echec'; readonly motif: string };

/**
 * Migre, en prenant un instantané au préalable.
 *
 * Idempotent : si le nouveau stockage existe déjà, on le renvoie tel quel
 * sans rien réécrire. C'est ce qui évite qu'un rechargement de page ou un
 * second onglet ne duplique ou n'écrase des données.
 */
export function migrer(stockage: Stockage): ResultatMigration {
  const existant = stockage.getItem(CLE_STOCKAGE);
  if (existant !== null) {
    try {
      // Passe par la MÊME validation que le compte distant. Un transtypage
      // laisserait entrer un bloc au schéma 1 — congés en simples chaînes —
      // qui viderait le calendrier sans lever d'erreur.
      const brut: unknown = JSON.parse(existant);
      const motif = motifRefusFaits(brut);
      if (motif !== null) return { statut: 'echec', motif };
      return { statut: 'deja-migre', faits: completerFaits(brut) };
    } catch {
      return {
        statut: 'echec',
        motif: 'Le stockage de la nouvelle version est illisible. Migration interrompue '
          + 'pour ne rien écraser. L\'instantané d\'origine reste disponible.'
      };
    }
  }

  const rapport = analyser(stockage);
  if (rapport.anomalies.some((a) => a.gravite === 'bloquante')) {
    return {
      statut: 'echec',
      motif: rapport.anomalies.filter((a) => a.gravite === 'bloquante').map((a) => a.message).join(' ')
    };
  }
  if (!rapport.aDesDonneesLegacy) {
    return { statut: 'rien-a-migrer', faits: faitsVides() };
  }

  const legacy = lireLegacy(stockage);
  if (legacy === null) {
    return { statut: 'echec', motif: 'Données de l\'ancienne application devenues illisibles.' };
  }

  // L'instantané est écrit AVANT les faits migrés. Cet ordre n'est pas
  // négociable : si l'écriture des faits échoue (quota dépassé, par exemple),
  // l'archive de l'état d'origine existe déjà.
  try {
    if (stockage.getItem(CLE_INSTANTANE_AVANT_MIGRATION) === null) {
      stockage.setItem(
        CLE_INSTANTANE_AVANT_MIGRATION,
        JSON.stringify({ pris: new Date().toISOString(), cles: prendreInstantane(stockage) })
      );
    }
  } catch {
    return {
      statut: 'echec',
      motif: 'Impossible d\'archiver l\'état d\'origine (stockage plein ?). Migration '
        + 'interrompue : on ne migre pas sans filet.'
    };
  }

  const faits = convertir(legacy, [], []);
  try {
    stockage.setItem(CLE_STOCKAGE, JSON.stringify(faits));
  } catch {
    return {
      statut: 'echec',
      motif: 'Impossible d\'écrire les données migrées (stockage plein ?). L\'état '
        + 'd\'origine est intact et archivé.'
    };
  }

  return { statut: 'migre', faits, rapport };
}

/**
 * Invariant d'absence de perte, vérifié par les tests.
 *
 * Compare ce que contenait l'ancienne structure et ce qui se retrouve dans
 * les faits migrés. Renvoie la liste des pertes ; vide si tout est passé.
 */
export function verifierAbsenceDePerte(legacy: Inconnu, faits: Faits): readonly string[] {
  const pertes: string[] = [];
  const missionsBrutes = tableau(legacy['m']);
  const clientsBruts = tableau(legacy['cl']);

  if (faits.clients.length !== clientsBruts.length) {
    pertes.push(`Clients : ${clientsBruts.length} en entrée, ${faits.clients.length} en sortie.`);
  }
  if (faits.missions.length !== missionsBrutes.length) {
    pertes.push(`Missions : ${missionsBrutes.length} en entrée, ${faits.missions.length} en sortie.`);
  }

  const facturesAttendues = missionsBrutes.reduce<number>(
    (n, m) => n + tableau(objet(m)['factures']).length, 0
  );
  if (faits.recettes.length !== facturesAttendues) {
    pertes.push(`Recettes : ${facturesAttendues} factures en entrée, ${faits.recettes.length} en sortie.`);
  }

  const totalEntree = missionsBrutes.reduce<number>(
    (somme, m) => somme + tableau(objet(m)['factures']).reduce<number>(
      // Même champ que la conversion — `ht`. Lire ici un nom différent
      // ferait comparer zéro à zéro, et ce contrôle conclurait « aucune
      // perte » sur une migration qui n'a rien repris. C'est exactement ce
      // qui s'est produit.
      (s, f) => s + nombre(
        objet(f)['ht'] ?? objet(f)['montantHT'] ?? objet(f)['montant'] ?? objet(f)['total']
      ), 0
    ), 0
  );
  const totalSortie = faits.recettes.reduce<number>((s, r) => s + r.montant, 0);
  if (Math.abs(totalEntree - totalSortie) > 0.01) {
    pertes.push(`Montant total des recettes : ${totalEntree} en entrée, ${totalSortie} en sortie.`);
  }

  // Les charges de l'ancienne trésorerie se répartissent entre DEUX
  // destinations : les fiscales et sociales deviennent des échéances payées,
  // les autres des dépenses. Le contrôle porte donc sur la somme des deux —
  // ne compter que les dépenses ferait crier à la perte à chaque cotisation
  // correctement triée.
  //
  // Il porte sur le NOMBRE et pas sur le montant : le TTC reconstitué diffère
  // légitimement du HT stocké côté legacy.
  const chargesBrutes = tableau(objet(legacy['t'])['mouvements'])
    .filter((mv) => texte(objet(mv)['type']) === 'Charge');
  const reprises = faits.depenses.length + faits.echeances.length;
  if (reprises !== chargesBrutes.length) {
    pertes.push(
      `Charges : ${chargesBrutes.length} en entrée, ${reprises} en sortie `
      + `(${faits.depenses.length} dépense(s), ${faits.echeances.length} échéance(s)).`
    );
  }

  return pertes;
}

/** Implémentation de `Stockage` en mémoire, pour les tests et le mode lecture seule. */
export function stockageMemoire(initial: Record<string, string> = {}): Stockage & {
  readonly contenu: Record<string, string>;
} {
  const contenu: Record<string, string> = { ...initial };
  return {
    contenu,
    getItem: (cle) => (cle in contenu ? contenu[cle] as string : null),
    setItem: (cle, valeur) => { contenu[cle] = valeur; },
    key: (i) => Object.keys(contenu)[i] ?? null,
    get length() { return Object.keys(contenu).length; }
  };
}
