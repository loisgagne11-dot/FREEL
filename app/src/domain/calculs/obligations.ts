import { type DateISO, type Euros, type Mois, type Resolution, euros } from '../types';
import { joursEntre } from '../dates';
import { decaler } from './calendrier';
import type { Echeance } from './provisions';

/**
 * Les obligations : ce qu'il faut déclarer, payer ou fournir, et où chacune en
 * est. La source unique du cycle — l'écran Obligations, la frise, le compteur
 * du rail, la requête « à traiter » et le calendrier `.ics` lisent tous ici.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DES ÉTAPES, PAS UN ÉTAT À PLAT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le premier plan donnait à chaque obligation UN état parmi « à déclarer, à
 * payer, déclarée, payée, en retard ». C'était une fausse symétrie : « en
 * retard » ne disait pas s'il fallait déclarer ou payer, et un prélèvement
 * d'impôt non pointé — que l'administration fait seule — se serait lu comme
 * une faute de l'utilisateur. Une obligation porte donc jusqu'à deux ÉTAPES,
 * chacune avec sa limite, le jour où elle a été faite et son état :
 *
 *   nature                          déclaration   paiement
 *   URSSAF                          oui           oui — jamais « payée » parce que « déclarée »
 *   CA3, CA12                       oui           oui — aucun si crédit ou néant
 *   acomptes de TVA (simplifié)     —             oui
 *   DES                             oui           —
 *   CFE (solde, acompte)            —             oui
 *   1447-C                          oui           —
 *   déclaration de revenus          oui           —
 *   solde et acomptes d'impôt       —             oui, « à pointer », jamais « en retard »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PRÉVUE OU SAISIE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une obligation est PRÉVUE quand l'application la calcule — une période
 * URSSAF, une CFE au 15 décembre, une CA3 —, SAISIE quand une échéance reçue
 * la porte. Les deux se rejoignent par une clé (`cle`) : une CFE prévue et
 * l'avis saisi ne font qu'une ligne. Sans cette fusion, chaque échéance
 * reçue apparaissait deux fois, une fois à la date que la règle prévoit, une
 * fois à celle de l'avis.
 *
 * Une obligation prévue n'entre JAMAIS dans le dû : le volet 2 des
 * provisions et la provision d'impôt portent déjà ce qu'elle annonce. La
 * compter encore ferait payer deux fois la même somme. Le dû ne lit que les
 * échéances saisies (`duSaisi`).
 */

/** La ligne de la frise, et la famille d'un dossier. */
export type NatureObligation = 'urssaf' | 'tva' | 'des' | 'impot' | 'cfe' | 'formalite';

/**
 * Les noms des lignes, dits une seule fois. La CFP se paie à l'URSSAF avec
 * la déclaration : elle est sur la ligne URSSAF, et n'a pas de nom à elle.
 */
export const NOM_NATURE: Readonly<Record<NatureObligation, string>> = {
  urssaf: 'URSSAF', tva: 'TVA', des: 'DES', impot: 'Impôt', cfe: 'CFE', formalite: 'Formalités'
};

/** Le dossier qu'une ligne ouvre. La déclaration de revenus a le sien, distinct de l'impôt prélevé. */
export type DossierObligation = 'urssaf' | 'tva' | 'des' | 'impot' | 'revenus' | 'cfe' | 'formalite' | 'piece';

/**
 * Où en est une étape.
 *
 *  · `a_venir` — pas encore faisable : la période n'est pas close, ou la date
 *    est loin ;
 *  · `a_faire` — faisable, et la limite n'est pas passée — ou passée sans
 *    sanction (une formalité en vigueur, une pièce à renouveler) ;
 *  · `en_retard` — la limite est passée, rien n'est noté ;
 *  · `fait` — fait, à une date connue ou non (`faiteLe` le dit) ;
 *  · `a_pointer` — un prélèvement dont la date est passée et qu'aucun
 *    paiement ne note : l'administration l'a fait seule, il reste à le
 *    constater ; ce n'est pas un retard de l'utilisateur ;
 *  · `non_suivi` — la limite est passée avant que l'application ne sache
 *    noter cette étape : ni faite, ni en retard — on ne sait pas.
 */
export type EtatEtape = 'a_venir' | 'a_faire' | 'en_retard' | 'fait' | 'a_pointer' | 'non_suivi';

export interface Etape {
  /**
   * La limite, report au jour ouvré compris. `hypothese` quand elle est
   * calculée et non publiée (une CA3 : « ton espace professionnel fait
   * foi ») ; `refuse` quand le jour ne se sait pas — un nom à demander, une
   * date que l'administration publie au printemps.
   */
  readonly limite: Resolution<DateISO>;
  /** Le mois de la limite, connu même quand son jour ne l'est pas : de quoi placer l'étape. */
  readonly mois: Mois;
  /** Le jour où l'étape a été faite ; `null` s'il n'est pas connu, faite ou non. */
  readonly faiteLe: DateISO | null;
  readonly etat: EtatEtape;
  /**
   * L'avance sur la limite, en jours : 2 pour « deux jours avant la
   * limite », −3 pour trois jours de retard. Mesurée contre la limite
   * REPORTÉE — celle que l'administration applique. `null` quand le jour où
   * l'étape a été faite n'est pas connu (toute déclaration d'avant le
   * schéma 21) ou que la limite elle-même manque : un écart à une date
   * inconnue n'est pas un écart nul.
   */
  readonly avance: number | null;
}

export interface Obligation {
  /** Stable d'un calcul à l'autre : le `.ics` en fait l'identifiant de l'événement. */
  readonly id: string;
  readonly nature: NatureObligation;
  readonly dossier: DossierObligation;
  readonly libelle: string;
  readonly detail: string;
  /** `AAAA-MM`, `AAAA-Tn` ou `AAAA` selon ce qui se déclare ; un identifiant de pièce sinon. */
  readonly periode: string;
  readonly declaration?: Etape;
  readonly paiement?: Etape;
  /**
   * Une formalité, ni déclaration ni paiement : renouveler une pièce avant
   * qu'elle n'expire, inscrire sa plateforme de facturation électronique.
   */
  readonly formalite?: Etape;
  /**
   * Ce que l'obligation coûte : `publie` quand une échéance saisie le dit,
   * `hypothese` quand l'application l'estime (« ≈ »), `refuse` quand un taux
   * manque. `null` quand il n'y a pas de montant à dire — une déclaration
   * sans paiement, une CFE dont l'avis n'est pas arrivé.
   */
  readonly montant: Resolution<Euros> | null;
  /** Ce qui a été encaissé sur la période — la base que la déclaration reprend. */
  readonly assiette?: Euros;
  /**
   * Les cases de la 2042-C-PRO, pour la déclaration de revenus : des montants,
   * gardés à part du `detail` pour que le mode confidentiel les masque.
   */
  readonly cases?: { readonly '5TE': Euros; readonly '5HQ': Euros };
  /** Les échéances saisies qu'elle porte. Vide : l'obligation est prévue par la règle. */
  readonly saisies: readonly Echeance[];
  /**
   * Combien de jours avant sa limite une obligation à venir mérite d'être
   * annoncée — une CFE à provisionner dès octobre. Absent : rien à annoncer
   * avant qu'elle ne soit à faire.
   */
  readonly preavisJours?: number;
}

/** Une obligation que la règle calcule et qu'aucune échéance ne porte encore. */
export const estPrevue = (o: Obligation): boolean => o.saisies.length === 0;

/** L'étape qui décide de la date d'une ligne : la déclaration quand il y en a une. */
export const etapePrincipale = (o: Obligation): Etape =>
  (o.declaration ?? o.paiement ?? o.formalite) as Etape;

/** Le dernier jour d'un mois : le jour zéro du mois d'après. */
export function finDuMois(m: Mois): DateISO {
  return new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0))
    .toISOString().slice(0, 10) as DateISO;
}

/** La date où placer une étape : sa limite, ou la fin de son mois quand le jour manque. */
export function dateDeLEtape(e: Etape): DateISO {
  return e.limite.statut !== 'refuse' ? e.limite.valeur : finDuMois(e.mois);
}

/**
 * L'état d'une étape, depuis les faits et la date du jour. La SEULE règle :
 * la frise, la liste, le rail et le Pilote la lisent ici.
 *
 * L'ordre des cas est voulu :
 *  1. fait l'emporte sur tout — y compris une limite passée ;
 *  2. un prélèvement (impôt) n'est jamais « à faire » ni « en retard » :
 *     l'administration le fait seule ; passé sa date, il est à pointer ;
 *  3. une limite antérieure au suivi de l'étape ne dit rien ;
 *  4. avant l'ouverture, rien n'est encore faisable ;
 *  5. le jour même de la limite reste « à faire » : on a la journée — la
 *     même comparaison stricte que l'échéancier ;
 *  6. une limite inconnue ne fait jamais passer en retard : on s'abstient.
 */
export function etatEtape(p: {
  readonly limite: Resolution<DateISO>;
  readonly mois: Mois;
  /** Le premier jour où l'étape peut être faite : le lendemain de la période déclarée. */
  readonly ouverture: DateISO;
  readonly faite: boolean;
  readonly aujourdhui: DateISO;
  /** Un prélèvement que l'administration fait seule. */
  readonly prelevee?: boolean;
  /** `false` : passée, l'étape reste « à faire » — rien ne la sanctionne à date. */
  readonly retardPossible?: boolean;
  /** Le jour où l'application a su noter l'étape ; une limite antérieure n'est pas suivie. */
  readonly suiviDepuis?: DateISO;
}): EtatEtape {
  if (p.faite) return 'fait';
  const limite = p.limite.statut === 'refuse' ? null : p.limite.valeur;
  if (p.prelevee === true) {
    return limite !== null && p.aujourdhui > limite ? 'a_pointer' : 'a_venir';
  }
  const repere = limite ?? finDuMois(p.mois);
  if (p.suiviDepuis !== undefined && repere < p.suiviDepuis) return 'non_suivi';
  if (p.aujourdhui < p.ouverture) return 'a_venir';
  if (limite !== null && p.aujourdhui > limite && p.retardPossible !== false) return 'en_retard';
  return 'a_faire';
}

/** L'avance d'une étape faite sur sa limite (voir `Etape.avance`). */
export function avanceSur(faiteLe: DateISO | null, limite: Resolution<DateISO>): number | null {
  if (faiteLe === null || limite.statut === 'refuse') return null;
  return joursEntre(faiteLe, limite.valeur);
}

/** Une étape complète, état et avance compris. */
export function etape(p: Parameters<typeof etatEtape>[0] & { readonly faiteLe: DateISO | null }): Etape {
  return {
    limite: p.limite,
    mois: p.mois,
    faiteLe: p.faiteLe,
    etat: etatEtape(p),
    avance: avanceSur(p.faiteLe, p.limite)
  };
}

/**
 * Combien de jours avant une limite une étape SANS période à clore devient
 * « à faire » : un paiement, une déclaration annuelle dont l'ouverture n'est
 * pas relevée. Trente jours, comme les échéances réglementaires l'ont
 * toujours été — au-delà, une date lointaine n'appelle pas encore de geste.
 */
export const PREAVIS_A_FAIRE = 30;

/** L'ouverture d'une étape sans période : `PREAVIS_A_FAIRE` jours avant sa limite. */
export const ouvertureParPreavis = (limite: DateISO): DateISO => decaler(limite, -PREAVIS_A_FAIRE);

/**
 * Au-delà de deux ans, une DES omise relève d'une régularisation avec les
 * douanes, pas d'un rappel dans une liste de tâches. La fenêtre est celle de
 * `declarationsEnRetard`, que lit le panneau DES : les vingt-quatre mois qui
 * précèdent le mois courant — compter en jours depuis la limite y aurait
 * ajouté un mois, et l'amende du Pilote aurait dépassé celle du panneau.
 */
const MOIS_DES_A_TRAITER = 24;

const moisAvant = (m: string, n: number): string => {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

const enCours = (e: Etape | undefined): boolean =>
  e !== undefined && (e.etat === 'a_faire' || e.etat === 'en_retard');

/**
 * Les obligations qui demandent un geste : une étape à faire ou en retard.
 * Le titre d'Obligations et le compteur du rail comptent CECI — deux
 * décomptes séparés auraient divergé au premier cas (quatre périodes à
 * déclarer, un seul sujet).
 */
export function obligationsATraiter(
  obligations: readonly Obligation[],
  aujourdhui: DateISO
): readonly Obligation[] {
  const plancherDes = moisAvant(aujourdhui.slice(0, 7), MOIS_DES_A_TRAITER);
  return obligations.filter((o) => {
    if (!enCours(o.declaration) && !enCours(o.paiement) && !enCours(o.formalite)) return false;
    return o.dossier !== 'des' || o.periode >= plancherDes;
  });
}

/**
 * Le dû que portent les obligations : les échéances SAISIES et non payées,
 * rien d'autre. Une obligation prévue n'y entre pas, même avec un montant
 * estimé — le volet 2 et la provision d'impôt la comptent déjà.
 *
 * C'est la porte par laquelle un lecteur des obligations (un solde prévu,
 * les prochaines échéances) doit passer pour additionner des montants : elle
 * vaut, au centime, le volet 1 des provisions.
 */
export function duSaisi(obligations: readonly Obligation[]): Euros {
  return euros(obligations.reduce(
    (t, o) => t + o.saisies.reduce((s, e) => (e.payeeLe === null ? s + e.montant : s), 0),
    0
  ));
}

/**
 * Rattache les échéances saisies aux obligations prévues de même clé, et fait
 * des autres des obligations à part.
 *
 * `cleDe` dit, pour une saisie, l'obligation prévue qu'elle règle — ou
 * `null` quand elle n'en règle aucune (un appel de régularisation). `reunir`
 * reconstruit l'obligation prévue autour de ses saisies ; `seule` fait une
 * obligation d'une saisie orpheline. Une saisie ne se rattache qu'une fois,
 * et une obligation prévue reste unique par clé : aucune ligne n'apparaît
 * deux fois.
 */
export function fusionner(
  prevues: readonly { readonly cle: string; readonly obligation: Obligation }[],
  saisies: readonly Echeance[],
  cleDe: (e: Echeance) => string | null,
  reunir: (prevue: Obligation, saisies: readonly Echeance[]) => Obligation,
  seule: (e: Echeance) => Obligation
): readonly Obligation[] {
  const parCle = new Map<string, Echeance[]>();
  const orphelines: Echeance[] = [];
  const cles = new Set(prevues.map((p) => p.cle));
  for (const e of saisies) {
    const cle = cleDe(e);
    if (cle === null || !cles.has(cle)) { orphelines.push(e); continue; }
    const liste = parCle.get(cle);
    if (liste === undefined) parCle.set(cle, [e]); else liste.push(e);
  }
  return [
    ...prevues.map((p) => {
      const rattachees = parCle.get(p.cle);
      return rattachees === undefined ? p.obligation : reunir(p.obligation, rattachees);
    }),
    ...orphelines.map(seule)
  ];
}

/**
 * L'étape de paiement que portent des échéances saisies : la limite est la
 * plus proche des échéances non payées (toutes payées : la dernière), le
 * jour du paiement le plus tardif quand toutes le sont — la période n'était
 * pas réglée en entier avant lui.
 */
export function paiementDesSaisies(
  saisies: readonly Echeance[],
  aujourdhui: DateISO,
  prelevee = false
): Etape {
  const impayees = saisies.filter((e) => e.payeeLe === null);
  const dates = (impayees.length > 0 ? impayees : saisies).map((e) => e.echeanceLe).sort();
  const limite = (impayees.length > 0 ? dates[0] : dates[dates.length - 1]) as DateISO;
  const faiteLe = impayees.length > 0
    ? null
    : (saisies.map((e) => e.payeeLe as DateISO).sort().at(-1) ?? null);
  // Une échéance saisie est recopiée d'un avis : elle n'a pas d'autre date
  // de vérification que la sienne.
  const resolution: Resolution<DateISO> = {
    statut: 'publie', valeur: limite, source: 'échéance saisie', verifieLe: limite
  };
  return etape({
    limite: resolution,
    mois: limite.slice(0, 7) as Mois,
    ouverture: ouvertureParPreavis(limite),
    faite: impayees.length === 0,
    faiteLe,
    aujourdhui,
    prelevee
  });
}

/** Ce qu'ont coûté ou coûteront des échéances saisies : le payé quand il diffère de l'appelé. */
export function montantDesSaisies(saisies: readonly Echeance[]): Resolution<Euros> {
  const valeur = euros(saisies.reduce((s, e) => s + (e.montantPaye ?? e.montant), 0));
  const premiere = saisies.map((e) => e.echeanceLe).sort()[0] as DateISO;
  return { statut: 'publie', valeur, source: 'échéance saisie', verifieLe: premiere };
}
