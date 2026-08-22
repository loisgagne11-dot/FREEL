import type { DateISO, Euros, Mois } from '../types';
import { euros } from '../types';

/**
 * Le planning : ce qui est prévu, ce qui a été fait, et le CRA qui en sort.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CRA EST UN LIVRABLE, PAS UNE SAISIE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'enchaînement réel du métier va dans ce sens :
 *
 *     rythme de mission → planning rempli d'office → ajustements → CRA
 *
 * On déclare une fois « je travaille lundi à jeudi, et le vendredi à
 * mi-temps », le planning se remplit tout seul, on corrige à la semaine ce
 * qui s'est passé autrement, et le compte rendu d'activité tombe à la fin.
 *
 * Deux faits seulement sont donc conservés : le RYTHME et les AJUSTEMENTS.
 * Le planning et le CRA sont dérivés — les stocker les ferait diverger de
 * leurs sources dès la première correction, ce qui est le défaut que ce
 * projet combat partout ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ORDRE DE PRIORITÉ EST UNE RÈGLE, PAS UNE COMMODITÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un ajustement l'emporte TOUJOURS sur le rythme, y compris pour dire « je
 * n'ai pas travaillé ». Sans cela, effacer une journée serait impossible :
 * le rythme la remettrait à chaque calcul, et le CRA facturerait un jour
 * qui n'a pas eu lieu.
 *
 * Un jour férié ou un week-end ne se travaille pas — sauf ajustement
 * explicite. Cette exception compte : les astreintes et les rendus de nuit
 * existent, et un CRA qui les efface fait perdre de l'argent.
 */

/** Quotité travaillée un jour donné : 0, 0,5 ou 1 dans l'usage courant. */
export type Quotite = number;

/** Les sept jours, du lundi au dimanche, tels que l'ancienne app les nomme. */
export const JOURS_SEMAINE = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const;
export type JourDeSemaine = typeof JOURS_SEMAINE[number];

/**
 * Un rythme de travail, sur une plage de dates.
 *
 * Le TJM y figure parce qu'il change en cours de mission : une renégociation
 * en juin ne doit pas réécrire ce qui a été facturé en mai.
 */
export interface Rythme {
  readonly du: DateISO;
  readonly au: DateISO;
  readonly parJour: Readonly<Partial<Record<JourDeSemaine, Quotite>>>;
  /** TJM de la période. `null` quand celui de la mission s'applique. */
  readonly tjm: Euros | null;
}

/** Les deux moitiés d'une journée. Le dessin ne connaît qu'elles. */
export const CRENEAUX = ['matin', 'apresMidi'] as const;
export type Creneau = typeof CRENEAUX[number];

/**
 * Où la demi-journée s'est passée.
 *
 * Ce n'est pas une commodité d'affichage : le télétravail se compte. Il entre
 * dans « 78 % de télétravail » du plan de charge, et surtout il se justifie —
 * une mission facturée « sur site » qui ne l'a pas été se conteste.
 */
export const LIEUX = ['teletravail', 'sur_site'] as const;
export type Lieu = typeof LIEUX[number];

/**
 * Ce qui a réellement été travaillé un jour donné, quand ça diffère du rythme.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PLUS UN NOMBRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * C'était `Record<date, Quotite>` : une quantité par jour, 0, 0,5 ou 1. Cela
 * suffit à totaliser un CRA, et c'est tout ce que le modèle savait dire.
 *
 * Le dessin en demande deux de plus, et aucun des deux ne se déduit d'une
 * quotité. « 0,5 » ne dit pas SI c'était le matin ou l'après-midi — or deux
 * clients le même jour, c'est exactement un matin chez l'un et un après-midi
 * chez l'autre, et sans le créneau on ne peut ni le saisir ni le rendre. Et
 * « 0,5 » ne dit rien du LIEU, qui se compte (« 78 % de télétravail ») et se
 * justifie.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA QUOTITÉ RESTE, ET RESTE LA SOURCE DU TOTAL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * On aurait pu la déduire des créneaux — deux créneaux valent un jour. Ce
 * serait une seconde définition du même nombre, et l'invariant l'interdit :
 * une journée dont les créneaux ne sont pas renseignés vaudrait alors zéro,
 * alors qu'elle a été travaillée. Les créneaux PRÉCISENT la quotité, ils ne la
 * remplacent pas — et une journée d'avant ce schéma n'en a aucun.
 */
export interface AjustementJour {
  /** Ce qui compte pour le total. Un fait, saisi ou migré. */
  readonly quotite: Quotite;
  /**
   * Les créneaux effectivement occupés, quand on les connaît.
   *
   * Absent sur toute journée saisie avant ce schéma : la migration ne les
   * invente pas. Une demi-journée dont on ignore la moitié se lit « 0,5 j »
   * sans position, ce qui est la vérité.
   */
  readonly creneaux?: readonly Creneau[];
  /** Le lieu de la journée, quand il est renseigné. */
  readonly lieu?: Lieu;
}

export type Ajustements = Readonly<Record<string, AjustementJour>>;

export interface JourPlanifie {
  readonly date: DateISO;
  /** Ce que le rythme prévoit, avant tout ajustement. */
  readonly prevu: Quotite;
  /** Ce qui compte réellement : ajustement s'il existe, rythme sinon. */
  readonly retenu: Quotite;
  readonly ajuste: boolean;
  readonly ferie: boolean;
  readonly weekEnd: boolean;
  /** Quotité de congé posée ce jour-là : 0, 0,5 ou 1. */
  readonly conge: Quotite;
  /**
   * Les créneaux occupés, ou `null` quand on ne les connaît pas.
   *
   * `null` et non un tableau vide : le vide dirait « aucun créneau travaillé »,
   * alors qu'il s'agit d'une journée dont on ignore la répartition. La vue
   * semaine doit pouvoir distinguer les deux — elle affiche une journée pleine
   * sans position dans un cas, et rien dans l'autre.
   */
  readonly creneaux: readonly Creneau[] | null;
  readonly lieu: Lieu | null;
}

/** Le jour de la semaine d'une date ISO, sans dépendre du fuseau local. */
export function jourDeSemaine(date: DateISO): JourDeSemaine {
  // `getUTCDay()` rend 0 pour dimanche ; nos clés commencent au lundi.
  const n = new Date(`${date}T00:00:00Z`).getUTCDay();
  return JOURS_SEMAINE[(n + 6) % 7] as JourDeSemaine;
}

/** Le rythme qui couvre une date, ou `undefined`. Le dernier déclaré l'emporte. */
export function rythmePour(date: DateISO, rythmes: readonly Rythme[]): Rythme | undefined {
  // Parcours à l'envers : quand deux rythmes se chevauchent — ce que
  // l'ancienne application autorisait — le plus récemment déclaré décrit
  // l'intention la plus fraîche.
  for (let i = rythmes.length - 1; i >= 0; i -= 1) {
    const r = rythmes[i] as Rythme;
    if (date >= r.du && date <= r.au) return r;
  }
  return undefined;
}

/** Ce que le rythme prévoit pour une date, hors ajustement. */
export function quotitePrevue(date: DateISO, rythmes: readonly Rythme[]): Quotite {
  const r = rythmePour(date, rythmes);
  return r === undefined ? 0 : r.parJour[jourDeSemaine(date)] ?? 0;
}

/**
 * Le planning d'une plage de dates.
 *
 * `feries` et `conges` viennent du contexte : ce module ne sait pas calculer
 * Pâques ni lire les faits, et n'a pas à le savoir.
 */
export function planifier(
  dates: readonly DateISO[],
  {
    rythmes, ajustements, feries, conges
  }: {
    readonly rythmes: readonly Rythme[];
    readonly ajustements: Ajustements;
    readonly feries: ReadonlySet<string>;
    /** Quotité de congé par date. Absent = aucun congé. */
    readonly conges: Readonly<Record<string, Quotite>>;
  }
): readonly JourPlanifie[] {
  return dates.map((date) => {
    const jour = jourDeSemaine(date);
    const weekEnd = jour === 'sam' || jour === 'dim';
    const ferie = feries.has(date);
    const conge = conges[date] ?? 0;

    const prevuBrut = quotitePrevue(date, rythmes);
    // Ni les fériés ni les week-ends ne sont prévus par le rythme : les
    // laisser passer gonflerait le CRA de journées que personne n'a
    // travaillées.
    const prevu = weekEnd || ferie ? 0 : Math.max(0, prevuBrut - conge);

    const ajuste = Object.hasOwn(ajustements, date);
    // L'ajustement l'emporte TOUJOURS, y compris à zéro et y compris un jour
    // férié : c'est la seule façon de dire « j'ai travaillé ce jour-là », ou
    // « finalement non ».
    const pose = ajustements[date];
    const retenu = ajuste && pose !== undefined ? pose.quotite : prevu;

    return {
      date, prevu, retenu, ajuste, ferie, weekEnd, conge,
      creneaux: pose?.creneaux ?? null,
      lieu: pose?.lieu ?? null
    };
  });
}

/**
 * Ce qu'un créneau porte : le travail lui-même, et d'où on le sait.
 *
 * `sur` distingue le fait de la convention. Une journée dont les créneaux ont
 * été SAISIS dit « j'étais chez ce client le matin » ; une journée qui n'a
 * qu'une quotité ne le dit pas — l'application la répartit pour pouvoir la
 * dessiner, et c'est tout. Confondre les deux ferait lire une position que
 * personne n'a renseignée, et le lieu affiché à côté serait celui d'une
 * demi-journée dont on ignore la moitié.
 */
export interface OccupationCreneau {
  readonly creneau: Creneau;
  /** `saisi` : les créneaux sont un fait. `reparti` : c'est la convention. */
  readonly sur: 'saisi' | 'reparti';
}

/**
 * Quels créneaux une journée occupe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA CONVENTION N'EST QUE LE RECOURS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Avant le schéma 14, la position d'une demi-journée n'existait pas : le seul
 * moyen de dessiner « 0,5 j » était de remplir le premier créneau et de le dire
 * ailleurs. C'était une convention d'affichage, pas une donnée — et elle reste
 * le recours pour toutes les journées d'avant, qu'aucune migration ne peut
 * renseigner.
 *
 * Dès que les créneaux sont saisis, ce sont EUX qui font foi, y compris quand
 * ils contredisent la convention : une demi-journée d'après-midi remplit le
 * second créneau et laisse le premier vide, ce que la convention seule ne
 * saurait jamais rendre.
 *
 * La fonction vit dans le domaine parce que la vue semaine ET la vue mois en
 * ont besoin. Deux implémentations finiraient par ne pas tomber d'accord, et
 * l'écart se verrait exactement là où on ne le cherche pas : deux dessins du
 * même jour, sur deux onglets du même écran.
 */
export function creneauxOccupes(
  retenu: Quotite, creneaux: readonly Creneau[] | null
): readonly OccupationCreneau[] {
  if (creneaux !== null) {
    // Un tableau VIDE est une réponse : « aucun créneau », et non « on ne sait
    // pas ». Le distinguer de `null` est tout l'objet du champ.
    return CRENEAUX
      .filter((c) => creneaux.includes(c))
      .map((creneau) => ({ creneau, sur: 'saisi' as const }));
  }
  if (retenu <= 0) return [];
  // La convention : une journée entière remplit les deux, une demi-journée le
  // premier. Toute quotité intermédiaire — 0,25 d'une astreinte — occupe au
  // moins la matinée : l'arrondir à rien effacerait du travail réel.
  return retenu >= 1
    ? CRENEAUX.map((creneau) => ({ creneau, sur: 'reparti' as const }))
    : [{ creneau: 'matin', sur: 'reparti' as const }];
}

/**
 * Un clic sur un créneau : l'ajustement à écrire, ou `null` pour l'effacer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE BASCULE, ET NON UN CYCLE DE TROIS ÉTATS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'écran faisait tourner la JOURNÉE : entière → demie → rien → retour au
 * rythme. C'était la seule manœuvre possible tant que la position d'une
 * demi-journée n'existait pas — « 0,5 » ne disait pas laquelle des deux
 * moitiés, donc cliquer une moitié précise n'avait pas de sens.
 *
 * Depuis le schéma 14, elle existe. Un clic sur l'après-midi retire
 * l'après-midi, et le matin reste — ce qu'aucun cycle sur la journée entière
 * ne pouvait exprimer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REVENIR EXACTEMENT AU RYTHME EFFACE L'AJUSTEMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * C'est ce que le troisième état du cycle tenait vraiment, et il faut le
 * garder : sans lui, une correction annulée à la main laisserait derrière elle
 * un ajustement qui dit la même chose que le rythme. Il ne se verrait pas —
 * jusqu'au jour où le rythme change et où cette journée-là ne suit pas.
 *
 * Une quotité intermédiaire — 0,25 d'astreinte, qu'aucun écran ne sait poser —
 * est arrondie au créneau par ce geste. C'est le prix d'un clic qui dit « cette
 * moitié, oui ou non » : la demander autrement voudrait un autre geste.
 */
export function basculerCreneau(jour: JourPlanifie, creneau: Creneau): AjustementJour | null {
  const occupes = creneauxOccupes(jour.retenu, jour.creneaux).map((o) => o.creneau);
  const apres = occupes.includes(creneau)
    ? occupes.filter((c) => c !== creneau)
    : CRENEAUX.filter((c) => c === creneau || occupes.includes(c));

  const duRythme = creneauxOccupes(jour.prevu, null).map((o) => o.creneau);
  const memeQueLeRythme = apres.length === duRythme.length
    && apres.every((c) => duRythme.includes(c));
  if (memeQueLeRythme) return null;

  return {
    quotite: apres.length * 0.5,
    creneaux: apres,
    // Le lieu SURVIT : retirer une matinée ne dit pas qu'on ne sait plus d'où
    // l'après-midi a été travaillé. `exactOptionalPropertyTypes` interdit de le
    // poser à `undefined`, d'où l'étalement conditionnel.
    ...(jour.lieu !== null ? { lieu: jour.lieu } : {})
  };
}

/**
 * Sur quoi porte une saisie : une moitié de journée, ou la journée entière.
 *
 * Le dessin propose les trois — « Matin / Après-midi / Journée » — et la
 * troisième n'est pas un raccourci pour deux clics. Poser une journée de congé
 * en deux gestes laisse un état intermédiaire d'une demi-journée qui n'a jamais
 * été voulu, et c'est celui-là que l'utilisateur verra si le second clic
 * échoue.
 */
export const PORTEES = ['matin', 'apresMidi', 'journee'] as const;
export type Portee = typeof PORTEES[number];

/** Les créneaux qu'une portée recouvre. */
export function creneauxDeLaPortee(portee: Portee): readonly Creneau[] {
  return portee === 'journee' ? CRENEAUX : [portee];
}

/**
 * Ce qu'on déclare sur une portée.
 *
 * Le dessin en propose un quatrième — « Indispo » — et il n'est PAS repris :
 * le schéma ne connaît que le congé, et rien ne distingue les deux dans un
 * calcul. Inventer un statut stocké pour l'occasion contredirait l'invariant
 * qui veut que les statuts se dérivent ; le poser comme un congé sous un autre
 * nom mentirait sur le solde de congés. On s'abstient, et on le note.
 */
export type TypeDeSaisie = 'travail' | 'conge' | 'libre';

/**
 * L'ajustement à écrire pour UNE affectation, après une saisie sur une portée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE MOITIÉ DE JOURNÉE N'A QU'UN OCCUPANT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `occupe` dit si CETTE affectation tient la portée après la saisie. Celle
 * qu'on désigne la prend, toutes les autres la rendent — c'est l'appelant qui
 * appelle cette fonction une fois par affectation, avec le bon `occupe`.
 *
 * Sans cette libération, déclarer « mercredi matin, client B » sur une matinée
 * que le rythme du client A prévoyait déjà donnerait DEUX occupants pour une
 * seule matinée : une journée et demie sur un mercredi, une occupation
 * au-dessus de 100 %, et un CRA qui facture du temps qui n'a pas existé. C'est
 * exactement l'anomalie que « Le mois en chiffres » signale — ce geste est
 * celui qui la corrige.
 */
export function saisirSurPortee(
  jour: JourPlanifie,
  portee: Portee,
  occupe: boolean,
  lieu: Lieu | null
): AjustementJour | null {
  const vises = creneauxDeLaPortee(portee);
  const actuels = creneauxOccupes(jour.retenu, jour.creneaux).map((o) => o.creneau);

  const apres = occupe
    ? CRENEAUX.filter((c) => vises.includes(c) || actuels.includes(c))
    : actuels.filter((c) => !vises.includes(c));

  const duRythme = creneauxOccupes(jour.prevu, null).map((o) => o.creneau);
  const memeQueLeRythme = apres.length === duRythme.length
    && apres.every((c) => duRythme.includes(c));
  // Le lieu compte dans la comparaison : une journée que le rythme prévoyait
  // déjà, mais dont on vient de préciser qu'elle s'est faite sur site, n'est
  // plus « la même que le rythme ». Effacer l'ajustement perdrait le lieu que
  // l'utilisateur vient de saisir, sans rien signaler.
  if (memeQueLeRythme && lieu === null) return null;

  return {
    quotite: apres.length * 0.5,
    creneaux: apres,
    ...(lieu !== null ? { lieu } : jour.lieu !== null ? { lieu: jour.lieu } : {})
  };
}

/**
 * La quotité de congé du jour après une saisie.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CONGÉ EST UNE QUOTITÉ, PAS DEUX CRÉNEAUX
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le schéma stocke « 0,5 j de congé ce jour-là », sans dire laquelle des deux
 * moitiés. On ne peut donc pas savoir si poser un congé sur le matin, alors
 * qu'une demi-journée est déjà posée, ajoute une moitié ou répète la même.
 *
 * D'où un maximum plutôt qu'une somme : poser un congé ne peut qu'amener la
 * journée AU MOINS à ce que la portée demande. Une somme ferait qu'un second
 * clic sur la même moitié compterait un jour de congé qui n'a pas été pris —
 * et le solde de congés est justement ce que ce chiffre alimente.
 *
 * Le retrait, lui, soustrait : « libre » sur l'après-midi d'une journée
 * entièrement en congé la ramène à une demi-journée, ce qui rend le geste
 * réversible moitié par moitié.
 */
export function congeApresSaisie(
  congeActuel: Quotite, portee: Portee, type: TypeDeSaisie
): Quotite {
  const part = creneauxDeLaPortee(portee).length * 0.5;
  if (type === 'conge') return Math.max(congeActuel, part);
  if (type === 'libre') return Math.max(0, congeActuel - part);
  // Déclarer du travail sur une moitié en congé retire ce congé de la même
  // moitié : les deux ne peuvent pas tenir sur le même créneau, et laisser les
  // deux ferait sortir le jour du dénominateur pendant qu'il compte au
  // numérateur.
  return Math.max(0, congeActuel - part);
}

export interface LigneCra {
  readonly date: DateISO;
  readonly quotite: Quotite;
}

export interface Cra {
  readonly mois: Mois;
  readonly lignes: readonly LigneCra[];
  readonly totalJours: Quotite;
  /** Valorisation au TJM en vigueur à chaque date. */
  readonly montant: Euros;
}

/**
 * Le compte rendu d'activité d'un mois — le livrable.
 *
 * Seuls les jours effectivement travaillés y figurent : un CRA qui liste des
 * zéros n'est pas plus complet, il est seulement plus long à relire, et le
 * client le signe moins volontiers.
 *
 * Chaque jour est valorisé au TJM en vigueur À SA DATE. Appliquer le tarif du
 * jour de l'édition réécrirait le passé à chaque renégociation.
 */
export function craDuMois(
  mois: Mois,
  planning: readonly JourPlanifie[],
  rythmes: readonly Rythme[],
  tjmMission: Euros
): Cra {
  const lignes = planning
    .filter((j) => j.date.startsWith(mois) && j.retenu > 0)
    .map((j) => ({ date: j.date, quotite: j.retenu }));

  const totalJours = lignes.reduce((s, l) => s + l.quotite, 0);
  const montant = lignes.reduce((s, l) => {
    const r = rythmePour(l.date, rythmes);
    const tjm = r?.tjm ?? tjmMission;
    return s + l.quotite * tjm;
  }, 0);

  return { mois, lignes, totalJours, montant: euros(montant) };
}
