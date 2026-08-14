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
/** Un congé posé, tel que le calendrier a besoin de le connaître. */
export interface CongePose {
  readonly date: DateISO;
  readonly quotite: number;
}

export function calendrierDuMois(
  m: Mois,
  conges: readonly CongePose[],
  zone: ZoneFeries = 'general'
): readonly Jour[] {
  const feries = new Set(joursFeries(Number(m.slice(0, 4)), zone));
  // Une demi-journée posée reste un jour « en congé » au calendrier : la case
  // doit se voir. C'est le DÉCOMPTE qui distingue la moitié de l'entier.
  const posesEnConge = new Set(conges.filter((c) => c.quotite > 0).map((c) => c.date));
  return joursDuMois(m).map((date) => ({
    date,
    nature: estWeekEnd(date) ? 'week_end'
      : feries.has(date) ? 'ferie'
      : posesEnConge.has(date) ? 'conge'
      : 'ouvrable'
  }));
}

/**
 * Les jours d'une plage sur lesquels un congé a un sens.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POSER UN CONGÉ UN DIMANCHE N'EST PAS UNE ERREUR DE SAISIE, C'EST UN FAUX
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Du 1er au 21 août » veut dire quinze jours ouvrés, pas vingt et un. Enregistrer
 * les week-ends et les fériés gonflerait le solde de congés de moitié, et
 * gonflerait aussi le dénominateur d'occupation — deux chiffres faux tirés d'un
 * geste juste.
 *
 * La plage est donc réduite ici, dans le domaine, et non dans l'écran : c'est
 * une règle, pas une commodité d'affichage, et un second écran qui poserait des
 * congés autrement finirait par compter autrement.
 *
 * Les bornes sont inclusives et acceptées dans les deux sens : sélectionner du
 * 21 au 1er est un geste courant, pas une faute à sanctionner.
 */
export function joursCongeables(
  debut: DateISO,
  fin: DateISO,
  zone: ZoneFeries = 'general'
): readonly DateISO[] {
  const [du, au] = debut <= fin ? [debut, fin] : [fin, debut];

  // Les fériés de toutes les années traversées : une plage peut enjamber le
  // 31 décembre, et ne prendre que l'année de départ laisserait passer le
  // 1er janvier.
  const feries = new Set<string>();
  for (let a = Number(du.slice(0, 4)); a <= Number(au.slice(0, 4)); a++) {
    for (const f of joursFeries(a, zone)) feries.add(f);
  }

  const jours: DateISO[] = [];
  const curseur = new Date(`${du}T00:00:00Z`);
  const borne = new Date(`${au}T00:00:00Z`);
  // Garde-fou : une plage démesurée viendrait d'une saisie aberrante, pas d'un
  // congé. On s'arrête plutôt que de bloquer l'onglet.
  const MAXIMUM = 400;
  while (curseur <= borne && jours.length < MAXIMUM) {
    const date = curseur.toISOString().slice(0, 10) as DateISO;
    if (!estWeekEnd(date) && !feries.has(date)) jours.push(date);
    curseur.setUTCDate(curseur.getUTCDate() + 1);
  }
  return jours;
}

/**
 * Le décompte des jours d'une période : ouvrés, et parmi eux ceux en congé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN MOT NE PEUT PAS DÉSIGNER DEUX NOMBRES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le plan de charge du mois compte comme « jours ouvrables » les jours ni
 * week-end, ni fériés, **ni posés en congé** : c'est le dénominateur du taux
 * d'occupation, et retirer les congés est juste — sinon partir en vacances
 * ferait chuter un taux qui ne mesure plus rien.
 *
 * La vue semaine, elle, a d'abord compté les jours ouvrés **congés compris**.
 * Les deux nombres portaient le même nom, sur le même écran, à quinze
 * centimètres l'un de l'autre : une semaine avec deux jours de congé annonçait
 * « 5 jours ouvrés » pendant que le mois n'en comptait que 3 pour cette
 * semaine-là. C'est la famille de défaut que la refonte existe pour supprimer —
 * deux vérités pour la même réalité.
 *
 * La sortie de crise n'est pas de trancher pour l'un des deux : les DEUX sont
 * justes, pour deux questions différentes. « Combien de jours cette semaine
 * n'étaient ni week-end ni fériés » et « sur combien de jours mon occupation se
 * calcule » ne sont pas la même question.
 *
 * Ils reçoivent donc deux noms, et l'écran les dit ensemble : « 5 jours ouvrés,
 * dont 2 de congé ». Personne n'a plus à deviner lequel il regarde.
 */
export interface DecompteJours {
  /** Ni week-end, ni férié. Les congés y sont COMPRIS. */
  readonly ouvres: number;
  /** Parmi les ouvrés, ceux posés en congé. */
  readonly enConge: number;
  /** Les ouvrés moins les congés : le dénominateur du taux d'occupation. */
  readonly travaillables: number;
}

/**
 * Décompte une suite de jours déjà qualifiés.
 *
 * Prend le strict nécessaire — férié, week-end, congé — plutôt qu'un type
 * d'écran : la vue semaine et le calendrier du mois ne portent pas la même
 * structure, et c'est la règle qui doit être partagée, pas la forme.
 */
export function decompterJours(
  jours: readonly { readonly ferie: boolean; readonly weekEnd: boolean; readonly conge: number }[]
): DecompteJours {
  const ouvrables = jours.filter((j) => !j.ferie && !j.weekEnd);
  const enConge = ouvrables.filter((j) => j.conge > 0).length;
  return { ouvres: ouvrables.length, enConge, travaillables: ouvrables.length - enConge };
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

/**
 * D'où viennent les jours travaillés d'un mois.
 *
 * `planning` : comptés sur les journées réellement retenues, ajustements
 * compris. C'est un FAIT.
 *
 * `facturation` : déduits du montant facturé divisé par le tarif journalier.
 * C'est une ESTIMATION, et elle se trompe dans trois cas au moins — un mois
 * sans facture émise (facturation trimestrielle) affiche zéro alors qu'on a
 * travaillé plein temps ; un forfait au résultat divise n'importe quoi ; un
 * client à deux tarifs prend celui de sa première mission.
 */
export type SourceCharge = 'planning' | 'facturation';

export interface ChargeDuMois {
  readonly jours: number;
  /** Ce qui a produit ce nombre — l'écran doit pouvoir le dire. */
  readonly source: SourceCharge;
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
 * ─────────────────────────────────────────────────────────────────────────
 * LE REPLI, PAS LA MESURE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Depuis que le planning existe, les journées travaillées sont un FAIT : le
 * rythme et ses ajustements les donnent directement. Les déduire d'un montant
 * quand on dispose des jours, c'est fabriquer une approximation là où l'on a
 * la chose même.
 *
 * Cette fonction ne sert donc plus que lorsque AUCUN planning n'a été saisi —
 * une mission sans rythme, un mois entièrement hors contrat. Et le résultat
 * porte alors `source: 'facturation'`, pour que l'écran ne présente pas une
 * estimation comme une mesure.
 *
 * Le rattachement se fait par nom de client, faute de lien entre une recette et
 * la mission qui l'a produite. Un client qui a plusieurs missions à des tarifs
 * différents fausse la conversion — raison de plus pour parler
 * d'équivalent-jours.
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
  return { jours, source: 'facturation', recettesSansTarif };
}

export function planDeCharge(
  m: Mois,
  conges: readonly CongePose[],
  joursFactures: number,
  zone: ZoneFeries = 'general'
): PlanDeCharge {
  const calendrier = calendrierDuMois(m, conges, zone);
  const compter = (n: NatureJour) => calendrier.filter((j) => j.nature === n).length;
  const joursOuvrables = compter('ouvrable');

  // Le décompte suit les QUOTITÉS : deux demi-journées valent un jour, et
  // compter les cases en donnerait deux. C'est le solde de congés de
  // l'utilisateur qui s'en trouverait faux.
  const joursDeConge = conges
    .filter((c) => c.date.startsWith(m) && calendrier.some(
      (j) => j.date === c.date && j.nature === 'conge'
    ))
    .reduce((s, c) => s + c.quotite, 0);

  return {
    mois: m,
    joursOuvrables,
    joursFeries: compter('ferie'),
    joursDeConge,
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
