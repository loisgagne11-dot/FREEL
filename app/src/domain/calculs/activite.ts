/**
 * Plan de charge, occupation et délai de paiement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LES JOURS OUVRÉS SONT CALCULÉS ET NON SAISIS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un taux d'occupation n'a de sens que rapporté à un nombre de jours
 * réellement travaillables. L'ancienne application divisait par 20 — une
 * constante — si bien qu'un mois de mai à 19 jours ouvrés donnait 95 %
 * d'occupation à quelqu'un qui avait travaillé tous les jours ouvrables, et
 * qu'un mois de 22 jours en donnait 110 %. Un chiffre supérieur à 100 % qui
 * s'affiche sans broncher est le signe qu'aucun dénominateur n'a été pensé.
 *
 * Les jours fériés sont ici **calculés**, pas listés. Ce n'est pas une
 * exception à l'invariant « aucun chiffre officiel en dur » : les onze jours
 * fériés légaux sont fixés par l'article L3133-1 du Code du travail et n'ont
 * pas bougé depuis 1948. Quatre d'entre eux dépendent de Pâques, dont la date
 * se déduit par un calcul stable depuis le concile de Nicée. Les lister
 * année par année reviendrait à réintroduire une table à maintenir là où une
 * règle suffit.
 */

import { type DateISO, type Euros, type Mois, type Ratio, euros, ratio } from '../types';

/**
 * Zone d'application des jours fériés.
 *
 * L'Alsace-Moselle conserve deux jours fériés supplémentaires du droit local :
 * le Vendredi saint et la Saint-Étienne. Les ignorer ferait surestimer les
 * jours ouvrés — et donc sous-estimer l'occupation — pour qui y travaille.
 */
export type ZoneFeries = 'general' | 'alsace_moselle';

/**
 * Dimanche de Pâques, par le comput grégorien (algorithme de Meeus).
 *
 * Quatre des onze jours fériés en découlent. Le calcul est reproduit ici parce
 * qu'aucune dépendance ne mérite d'être ajoutée pour vingt lignes, et parce
 * qu'une table de dates serait à compléter chaque année.
 */
export function paques(annee: number): DateISO {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return dateDe(annee, mois, jour);
}

function dateDe(annee: number, mois: number, jour: number): DateISO {
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}` as DateISO;
}

/** Décale une date ISO d'un nombre de jours, sans passer par le fuseau local. */
function decaler(d: DateISO, jours: number): DateISO {
  const t = Date.UTC(
    Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))
  ) + jours * 86_400_000;
  return new Date(t).toISOString().slice(0, 10) as DateISO;
}

/**
 * Les jours fériés légaux d'une année.
 *
 * Le 1er mai est le seul obligatoirement chômé ; les autres le sont par usage.
 * La distinction ne change rien ici : un indépendant qui ne facture pas ces
 * jours-là ne doit pas les voir comptés dans son dénominateur.
 */
export function joursFeries(annee: number, zone: ZoneFeries = 'general'): readonly DateISO[] {
  const p = paques(annee);
  const dates: DateISO[] = [
    dateDe(annee, 1, 1),    // Jour de l'an
    decaler(p, 1),          // Lundi de Pâques
    dateDe(annee, 5, 1),    // Fête du Travail
    dateDe(annee, 5, 8),    // Victoire 1945
    decaler(p, 39),         // Ascension
    decaler(p, 50),         // Lundi de Pentecôte
    dateDe(annee, 7, 14),   // Fête nationale
    dateDe(annee, 8, 15),   // Assomption
    dateDe(annee, 11, 1),   // Toussaint
    dateDe(annee, 11, 11),  // Armistice 1918
    dateDe(annee, 12, 25)   // Noël
  ];
  if (zone === 'alsace_moselle') {
    dates.push(decaler(p, -2)); // Vendredi saint
    dates.push(dateDe(annee, 12, 26)); // Saint-Étienne
  }
  return [...dates].sort();
}

/** Un samedi ou un dimanche. */
export function estWeekEnd(d: DateISO): boolean {
  const jour = new Date(`${d}T00:00:00Z`).getUTCDay();
  return jour === 0 || jour === 6;
}

/** Toutes les dates d'un mois, dans l'ordre. */
export function joursDuMois(m: Mois): readonly DateISO[] {
  const annee = Number(m.slice(0, 4));
  const mois = Number(m.slice(5, 7));
  const nombre = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  const dates: DateISO[] = [];
  for (let j = 1; j <= nombre; j++) dates.push(dateDe(annee, mois, j));
  return dates;
}

/** Nature d'un jour, pour le calendrier de l'écran. */
export type NatureJour = 'ouvrable' | 'week_end' | 'ferie' | 'conge';

export interface Jour {
  readonly date: DateISO;
  readonly nature: NatureJour;
}

/**
 * Le calendrier d'un mois, jour par jour.
 *
 * L'ordre des tests compte : un congé posé sur un jour férié n'est pas un
 * congé consommé. Le classer comme tel ferait payer deux fois le même jour à
 * l'utilisateur, une fois sur son solde de congés et une fois sur son
 * occupation.
 */
export function calendrierDuMois(
  m: Mois,
  conges: readonly DateISO[],
  zone: ZoneFeries = 'general'
): readonly Jour[] {
  const feries = new Set(joursFeries(Number(m.slice(0, 4)), zone));
  const posesEnConge = new Set(conges);
  return joursDuMois(m).map((date) => ({
    date,
    nature: estWeekEnd(date) ? 'week_end'
      : feries.has(date) ? 'ferie'
      : posesEnConge.has(date) ? 'conge'
      : 'ouvrable'
  }));
}

export interface PlanDeCharge {
  readonly mois: Mois;
  /** Jours ni week-end, ni fériés, ni posés en congé. Le dénominateur. */
  readonly joursOuvrables: number;
  readonly joursFeries: number;
  readonly joursDeConge: number;
  /** Jours effectivement facturés, déduits du chiffre d'affaires et du TJM. */
  readonly joursFactures: number;
  /**
   * Part des jours ouvrables effectivement facturés, ou `null` quand il n'y a
   * aucun jour ouvrable — un mois entièrement pris en congé n'a pas un taux
   * d'occupation de 0 %, il n'en a pas.
   */
  readonly occupation: Ratio | null;
}

/**
 * Jours facturés d'un mois, déduits du montant facturé et du tarif journalier.
 *
 * L'application ne tient pas de feuille de temps, et en tenir une serait une
 * saisie de plus à faire chaque jour. Le montant facturé divisé par le TJM en
 * donne l'équivalent, à ceci près qu'un forfait au résultat plutôt qu'à la
 * journée fausse la division. C'est pourquoi le résultat est présenté comme un
 * **équivalent-jours** et non comme un relevé.
 */
export function joursEquivalents(montant: Euros, tjm: Euros): number {
  if (tjm <= 0) return 0;
  return montant / tjm;
}

export interface ChargeDuMois {
  readonly jours: number;
  /**
   * Recettes du mois dont le tarif journalier est inconnu.
   *
   * Elles ne sont pas comptées dans les jours : les inclure à un tarif
   * supposé fabriquerait de l'occupation. Le nombre est remonté pour que
   * l'écran puisse dire que la mesure est partielle, plutôt que de laisser
   * croire à un mois creux.
   */
  readonly recettesSansTarif: number;
}

/**
 * Jours facturés d'un mois, à partir des recettes émises et des tarifs connus.
 *
 * Le rattachement se fait par nom de client, faute de lien entre une recette et
 * la mission qui l'a produite dans l'ancien modèle. Un client qui a plusieurs
 * missions à des tarifs différents fausse donc la conversion — raison de plus
 * pour parler d'équivalent-jours.
 */
export function chargeDuMois(
  recettes: readonly { readonly clientNom: string; readonly montant: Euros; readonly emiseLe: DateISO | null }[],
  tarifParClient: ReadonlyMap<string, Euros>,
  m: Mois
): ChargeDuMois {
  let jours = 0;
  let recettesSansTarif = 0;
  for (const r of recettes) {
    if (r.emiseLe === null || r.emiseLe.slice(0, 7) !== m) continue;
    const tjm = tarifParClient.get(r.clientNom);
    if (tjm === undefined || tjm <= 0) {
      recettesSansTarif += 1;
      continue;
    }
    jours += joursEquivalents(r.montant, tjm);
  }
  return { jours, recettesSansTarif };
}

export function planDeCharge(
  m: Mois,
  conges: readonly DateISO[],
  joursFactures: number,
  zone: ZoneFeries = 'general'
): PlanDeCharge {
  const calendrier = calendrierDuMois(m, conges, zone);
  const compter = (n: NatureJour) => calendrier.filter((j) => j.nature === n).length;
  const joursOuvrables = compter('ouvrable');

  return {
    mois: m,
    joursOuvrables,
    joursFeries: compter('ferie'),
    joursDeConge: compter('conge'),
    joursFactures,
    // Diviser par une constante donnerait des taux supérieurs à 100 % les mois
    // longs, et inférieurs à la réalité les mois courts.
    occupation: joursOuvrables === 0 ? null : ratio(joursFactures / joursOuvrables)
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Délai de paiement
   ───────────────────────────────────────────────────────────────────────── */

export interface RecettePayee {
  readonly clientNom: string;
  readonly montant: Euros;
  readonly emiseLe: DateISO | null;
  readonly encaisseeLe: DateISO | null;
}

export interface DelaiClient {
  readonly clientNom: string;
  /** Nombre de factures encaissées et datées des deux côtés. */
  readonly facturesMesurees: number;
  /**
   * Délai médian en jours, ou `null` si rien n'est mesurable.
   *
   * La médiane, pas la moyenne : un client qui paie à 30 jours neuf fois et à
   * 300 jours une fois n'est pas un client à 57 jours. La moyenne décrit un
   * client qui n'existe pas ; la médiane décrit le comportement habituel.
   */
  readonly delaiMedian: number | null;
  readonly delaiMaximum: number | null;
  /** Montant émis mais pas encore encaissé. */
  readonly enAttente: Euros;
  /** Factures émises depuis plus longtemps que le délai médian observé. */
  readonly enRetard: number;
}

/** Nombre de jours entre deux dates ISO. */
export function joursEntre(debut: DateISO, fin: DateISO): number {
  const a = Date.UTC(Number(debut.slice(0, 4)), Number(debut.slice(5, 7)) - 1, Number(debut.slice(8, 10)));
  const b = Date.UTC(Number(fin.slice(0, 4)), Number(fin.slice(5, 7)) - 1, Number(fin.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

function mediane(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 1
    ? triees[milieu] as number
    : ((triees[milieu - 1] as number) + (triees[milieu] as number)) / 2;
}

/**
 * Délai de paiement observé, par client.
 *
 * Le délai contractuel est une intention ; celui-ci est un constat. L'écart
 * entre les deux est ce qui décide s'il faut relancer, demander un acompte, ou
 * cesser de travailler avec quelqu'un.
 */
export function delaisParClient(
  recettes: readonly RecettePayee[],
  aujourdhui: DateISO
): readonly DelaiClient[] {
  const parClient = new Map<string, RecettePayee[]>();
  for (const r of recettes) {
    const nom = r.clientNom || 'Client non renseigné';
    const liste = parClient.get(nom);
    if (liste) liste.push(r); else parClient.set(nom, [r]);
  }

  const resultat: DelaiClient[] = [];
  for (const [clientNom, liste] of parClient) {
    const delais = liste
      .filter((r) => r.emiseLe !== null && r.encaisseeLe !== null)
      .map((r) => joursEntre(r.emiseLe as DateISO, r.encaisseeLe as DateISO))
      // Un encaissement antérieur à l'émission est une saisie fautive, pas un
      // délai négatif : l'inclure tirerait la médiane vers le bas.
      .filter((d) => d >= 0);

    const delaiMedian = mediane(delais);
    const attente = liste.filter((r) => r.encaisseeLe === null);

    resultat.push({
      clientNom,
      facturesMesurees: delais.length,
      delaiMedian,
      delaiMaximum: delais.length === 0 ? null : Math.max(...delais),
      enAttente: euros(attente.reduce((s, r) => s + r.montant, 0)),
      // « En retard » se juge au comportement observé du client, faute de
      // connaître ses conditions contractuelles ici. Sans historique, aucune
      // facture n'est déclarée en retard : accuser sans référence serait pire
      // que se taire.
      enRetard: delaiMedian === null
        ? 0
        : attente.filter((r) =>
            r.emiseLe !== null && joursEntre(r.emiseLe, aujourdhui) > delaiMedian).length
    });
  }

  return resultat.sort((a, b) => b.enAttente - a.enAttente);
}
