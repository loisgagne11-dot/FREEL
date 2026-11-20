import type { DateISO, Mois } from '../../domain/types';
import { decaler } from '../../domain/calculs/calendrier';
import {
  type Etape, type NatureObligation, type Obligation, NOM_NATURE, dateDeLEtape, etapePrincipale,
  finDuMois, obligationsATraiter
} from '../../domain/calculs/obligations';
import type { TonStatut } from '../components/Statut';

/**
 * Ce que l'écran Obligations lit des obligations : le signe d'une ligne de
 * frise, la pastille d'une ligne de liste, le titre, les années, le dossier
 * ouvert par défaut. Des fonctions pures, à part du rendu : chacune porte une
 * règle que la maquette ne dit pas, et une règle se teste sans monter un écran.
 *
 * Elles ne CALCULENT aucun état : l'état d'une étape vient de `etatEtape`, la
 * seule règle du cycle. Ici, on le met en mots et en signes.
 */

/* ─────────────────────────────────────────────────────────────────────────
   Les lignes de la frise
   ───────────────────────────────────────────────────────────────────────── */

/** Cinq lignes, dans l'ordre de la maquette. */
export type LigneFrise = 'urssaf' | 'tva' | 'impot' | 'cfe' | 'formalite';
export const LIGNES_FRISE: readonly LigneFrise[] = ['urssaf', 'tva', 'impot', 'cfe', 'formalite'];

/**
 * La DES se déclare aux douanes, mais elle vit sur la ligne TVA : c'est une
 * déclaration de TVA intracommunautaire, et une sixième ligne pour un
 * franchisé qui n'en a qu'une par an aurait fait une frise à moitié vide.
 * La CFP est déjà rangée sous l'URSSAF par la source ; la 1447-C sous la CFE.
 */
export const LIGNE_DE_NATURE: Readonly<Record<NatureObligation, LigneFrise>> = {
  urssaf: 'urssaf', tva: 'tva', des: 'tva', impot: 'impot', cfe: 'cfe', formalite: 'formalite'
};

/** Le nom d'une ligne : celui de la nature, dit une fois au domaine. */
export const nomDeLigne = (l: LigneFrise): string => NOM_NATURE[l];

/* ─────────────────────────────────────────────────────────────────────────
   Le signe d'une obligation
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Les quatre signes de la légende, et un cinquième sans place dans la
 * légende : `non_suivi`, une limite passée avant que l'application sache
 * noter l'étape. Ni faite, ni en retard — on ne sait pas.
 */
export type Signe = 'fait' | 'a_faire' | 'a_venir' | 'en_retard' | 'non_suivi';

/** Du plus pressant au moins pressant : deux obligations du même mois prennent le premier. */
export const RANG_SIGNE: Readonly<Record<Signe, number>> = {
  en_retard: 0, a_faire: 1, a_venir: 2, non_suivi: 3, fait: 4
};

const etapesDe = (o: Obligation): readonly Etape[] =>
  [o.declaration, o.paiement, o.formalite].filter((e): e is Etape => e !== undefined);

/**
 * Le signe d'une obligation entière.
 *
 * Une obligation DÉCLARÉE et pas encore payée est « à faire », même quand le
 * prélèvement est dans trois semaines : le rond creux « à venir » la
 * rangeait avec ce qu'on n'a pas encore commencé, et l'appel qui reste à
 * payer disparaissait de la lecture. Un prélèvement d'impôt passé sans
 * paiement noté est à pointer — « à faire », jamais « en retard » : c'est
 * l'administration qui le fait.
 */
export function signeDe(o: Obligation): Signe {
  const etapes = etapesDe(o);
  if (etapes.some((e) => e.etat === 'en_retard')) return 'en_retard';
  if (etapes.some((e) => e.etat === 'a_faire' || e.etat === 'a_pointer')) return 'a_faire';
  if (etapes.every((e) => e.etat === 'fait')) return 'fait';
  if (o.declaration?.etat === 'fait' && o.paiement !== undefined && o.paiement.etat !== 'fait') return 'a_faire';
  if (etapes.every((e) => e.etat === 'fait' || e.etat === 'non_suivi')) return 'non_suivi';
  return 'a_venir';
}

/** Une ligne qui n'attend plus rien : elle se replie sous « Voir les N faites ». */
export const estTerminee = (o: Obligation): boolean => {
  const s = signeDe(o);
  return s === 'fait' || s === 'non_suivi';
};

/** La date où placer une obligation : celle de son étape principale. */
export const dateDe = (o: Obligation): DateISO => dateDeLEtape(etapePrincipale(o));

/** L'étape qui attend encore, dans l'ordre du cycle ; `null` quand tout est fait. */
export function etapeEnCours(o: Obligation): Etape | null {
  return etapesDe(o).find((e) => e.etat !== 'fait') ?? null;
}

/* ─────────────────────────────────────────────────────────────────────────
   Les mots
   ───────────────────────────────────────────────────────────────────────── */

const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août',
  'sept.', 'oct.', 'nov.', 'déc.'];

const jourDe = (d: string): string => (Number(d.slice(8, 10)) === 1 ? '1ᵉʳ' : String(Number(d.slice(8, 10))));

/** « 31 juillet », « 1ᵉʳ juin ». */
export const jourMois = (d: string): string => `${jourDe(d)} ${MOIS_LONGS[Number(d.slice(5, 7)) - 1] ?? ''}`;
/** « 31 juil. », « 1ᵉʳ juin ». */
export const jourMoisCourt = (d: string): string => `${jourDe(d)} ${MOIS_COURTS[Number(d.slice(5, 7)) - 1] ?? ''}`;
/** « juil. » : le mois sous le jour du bloc date. */
export const moisCourt = (d: string): string => MOIS_COURTS[Number(d.slice(5, 7)) - 1] ?? '';
/** « juillet ». */
export const moisLongDe = (d: string): string => MOIS_LONGS[Number(d.slice(5, 7)) - 1] ?? '';

/**
 * « deux jours avant la limite », « le jour même », « trois jours après » —
 * l'avance que la maquette écrit sous une déclaration faite. `null` quand le
 * jour de la déclaration n'est pas connu : un écart à une date inconnue n'est
 * pas un écart nul.
 */
export function avanceLisible(avance: number | null): string | null {
  if (avance === null) return null;
  if (avance === 0) return 'le jour de la limite';
  const n = Math.abs(avance);
  const jours = `${n <= 10 ? NOMBRES[n - 1]?.toLowerCase() ?? String(n) : String(n)} jour${n > 1 ? 's' : ''}`;
  return avance > 0 ? `${jours} avant la limite` : `${jours} après la limite`;
}

const NOMBRES = ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf', 'Dix'];
/** « Une chose », « Deux choses », « 12 choses » : « chose » est féminin. */
const choses = (n: number): string =>
  `${n === 1 ? 'Une' : n <= 10 ? NOMBRES[n - 1] ?? String(n) : String(n)} chose${n > 1 ? 's' : ''}`;
const enLettres = (n: number): string => (n === 1 ? 'une' : n <= 10 ? (NOMBRES[n - 1] ?? '').toLowerCase() : String(n));

/* ─────────────────────────────────────────────────────────────────────────
   La pastille d'une ligne
   ───────────────────────────────────────────────────────────────────────── */

export interface Pastille {
  readonly libelle: string;
  /** La forme courte, au téléphone (« Le 1ᵉʳ juil. » pour « Déclarable le 1ᵉʳ juillet »). */
  readonly court: string;
  readonly ton: TonStatut;
}

/** Au-delà d'un mois, « Déclarable le … » cède à « À venir » : la date n'appelle encore rien. */
const ANNONCE_OUVERTURE_JOURS = 31;

/**
 * Où en est une ligne, en un signe et un mot : l'étape en cours, et ce
 * qu'elle attend.
 */
export function pastilleDe(o: Obligation, aujourdhui: DateISO): Pastille {
  const p = (libelle: string, ton: TonStatut, court = libelle): Pastille => ({ libelle, court, ton });
  const e = etapeEnCours(o);
  if (e === null) {
    const derniere = o.paiement ?? o.declaration ?? o.formalite;
    const le = derniere?.faiteLe ?? null;
    const verbe = o.paiement !== undefined ? 'Payée' : o.declaration !== undefined
      ? (o.dossier === 'des' ? 'Déposée' : 'Déclarée') : 'Faite';
    return le === null ? p(verbe, 'ok') : p(`${verbe} le ${jourMoisCourt(le)}`, 'ok');
  }
  const piece = o.dossier === 'piece';
  const declaration = e === o.declaration;
  switch (e.etat) {
    case 'en_retard':
      return p(declaration || o.declaration === undefined ? 'En retard' : 'Paiement en retard', 'retard');
    case 'a_pointer':
      return p('À pointer', 'attente');
    case 'non_suivi':
      return p('Non suivie', 'neutre');
    case 'a_faire':
      return declaration ? p(o.dossier === 'des' ? 'À déposer' : 'À déclarer', 'attente')
        : e === o.paiement ? p('À payer', 'attente')
          : p(piece ? 'À renouveler' : 'À faire', 'attente');
    default: {
      // Déclarée, le prélèvement à venir : il reste à payer, ce n'est plus « à venir ».
      if (e === o.paiement && o.declaration?.etat === 'fait') return p('À payer', 'attente');
      if (piece) return p('À renouveler', 'neutre');
      if (declaration && e.ouverture > aujourdhui && e.ouverture <= decaler(aujourdhui, ANNONCE_OUVERTURE_JOURS)) {
        return p(`Déclarable le ${jourMois(e.ouverture)}`, 'neutre', `Le ${jourMoisCourt(e.ouverture)}`);
      }
      return p('À venir', 'neutre');
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Le titre de l'écran
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Le titre d'Obligations : « Deux choses à faire d'ici fin juillet. »
 *
 * `nombre` vient de `nombreAFaire` — la fonction qui fait la pastille du
 * rail, et aucune autre : un titre qui compte de son côté aurait dit « une
 * chose » au-dessus d'une pastille « 4 » dès quatre périodes à déclarer.
 * Les obligations ne servent qu'à dater : la limite la plus lointaine de ce
 * qui est à faire (« d'ici »), ou la prochaine de ce qui vient (« rien
 * avant »). Un retard prend la place de la date : « d'ici fin juillet »
 * au-dessus d'une déclaration en retard depuis mars promettrait du temps
 * qui n'existe plus.
 */
export function titreObligations(
  nombre: number,
  obligations: readonly Obligation[],
  aujourdhui: DateISO
): string {
  const annee = aujourdhui.slice(0, 4);
  const quand = (d: DateISO): string => {
    const an = d.slice(0, 4) === annee ? '' : ` ${d.slice(0, 4)}`;
    return d === finDuMois(d.slice(0, 7) as Mois) ? `fin ${moisLongDe(d)}${an}` : `le ${jourMois(d)}${an}`;
  };

  if (nombre === 0) {
    const prochaine = obligations
      .filter((o) => signeDe(o) === 'a_venir')
      .map((o) => etapeEnCours(o))
      .filter((e): e is Etape => e !== null && e.limite.statut !== 'refuse')
      .map((e) => dateDeLEtape(e))
      .filter((d) => d >= aujourdhui)
      .sort()[0];
    // « avant le 31 octobre », jamais « avant fin octobre » : la limite est
    // un jour, et c'est ce jour-là que rien ne presse avant.
    if (prochaine === undefined) return 'Rien à faire, et rien de prévu.';
    const an = prochaine.slice(0, 4) === annee ? '' : ` ${prochaine.slice(0, 4)}`;
    return `Rien à faire avant le ${jourMois(prochaine)}${an}.`;
  }

  const aFaire = obligationsATraiter(obligations, aujourdhui);
  const retards = aFaire.filter((o) => signeDe(o) === 'en_retard').length;
  if (retards > 0) {
    return retards >= nombre
      ? `${choses(nombre)} en retard.`
      : `${choses(nombre)} à faire, dont ${enLettres(retards)} en retard.`;
  }
  const horizon = aFaire
    .map((o) => etapeEnCours(o))
    .filter((e): e is Etape => e !== null && e.limite.statut !== 'refuse')
    .map((e) => dateDeLEtape(e))
    .sort()
    .at(-1);
  return horizon === undefined ? `${choses(nombre)} à faire.` : `${choses(nombre)} à faire d’ici ${quand(horizon)}.`;
}

/* ─────────────────────────────────────────────────────────────────────────
   Les années, la liste, le dossier par défaut
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Les années du segment : celles qui portent une obligation jusqu'à
 * l'année courante, l'année courante, l'année de la prochaine obligation à
 * venir — en décembre, l'URSSAF du quatrième trimestre tombe en janvier —, et
 * l'année affichée, d'où qu'elle vienne : le mois partagé avec les autres
 * écrans peut la mener ailleurs, et un segment sans l'année montrée ne
 * dirait plus ce qu'on regarde.
 */
export function anneesDuSegment(
  obligations: readonly Obligation[],
  aujourdhui: DateISO,
  affichee: number
): readonly number[] {
  const courante = Number(aujourdhui.slice(0, 4));
  const annees = new Set<number>([courante, affichee]);
  for (const o of obligations) {
    const a = Number(dateDe(o).slice(0, 4));
    if (a <= courante) annees.add(a);
  }
  // La prochaine qui VIENT, pas la prochaine à faire : le 15 décembre, la
  // CFE du jour cachait l'URSSAF de janvier, et l'année qui la porte.
  const prochaine = obligations.filter((o) => signeDe(o) === 'a_venir').map(dateDe).filter((d) => d >= aujourdhui).sort()[0];
  if (prochaine !== undefined) annees.add(Number(prochaine.slice(0, 4)));
  return [...annees].sort((a, b) => a - b);
}

const parDate = (a: Obligation, b: Obligation): number =>
  dateDe(a).localeCompare(dateDe(b)) || a.id.localeCompare(b.id);

/**
 * La liste d'une année : ce qui reste, et ce qui est fait.
 *
 * L'année courante reprend aussi ce qui est à traiter d'AILLEURS : une
 * déclaration de 2025 en retard, une attestation qui expire en janvier et
 * se renouvelle en décembre. Sans elles, le titre en comptait une de plus
 * que la liste n'en montrait.
 */
export function listeDeLAnnee(
  obligations: readonly Obligation[],
  annee: number,
  aujourdhui: DateISO
): { readonly aFaire: readonly Obligation[]; readonly faites: readonly Obligation[] } {
  const dans = obligations.filter((o) => dateDe(o).startsWith(String(annee)));
  const aFaire = new Set(dans.filter((o) => !estTerminee(o)));
  if (annee === Number(aujourdhui.slice(0, 4))) {
    for (const o of obligationsATraiter(obligations, aujourdhui)) aFaire.add(o);
  }
  return {
    aFaire: [...aFaire].sort(parDate),
    faites: dans.filter(estTerminee).sort(parDate)
  };
}

/**
 * Le dossier ouvert quand rien n'est choisi : la prochaine chose à faire de
 * la liste, sinon la prochaine qui vient, sinon la dernière faite — une
 * colonne vide à droite de la liste ne dirait rien.
 */
export function dossierParDefaut(
  liste: { readonly aFaire: readonly Obligation[]; readonly faites: readonly Obligation[] }
): Obligation | null {
  const urgentes = liste.aFaire.filter((o) => {
    const s = signeDe(o);
    return s === 'en_retard' || s === 'a_faire';
  });
  return urgentes[0] ?? liste.aFaire[0] ?? liste.faites.at(-1) ?? null;
}

/* ─────────────────────────────────────────────────────────────────────────
   L'adresse d'un dossier
   ───────────────────────────────────────────────────────────────────────── */

/**
 * L'obligation que désigne une adresse `#/obligations/<clé>` : son
 * identifiant, ou `saisie-<id>` pour une échéance saisie — la Trésorerie et
 * le flux du Pilote ne connaissent que l'échéance, pas l'obligation qui la
 * porte (une période URSSAF, une CFE réunie à son avis).
 */
export function obligationDeLaCle(obligations: readonly Obligation[], cle: string): Obligation | undefined {
  return obligations.find((o) => o.id === cle)
    ?? obligations.find((o) => o.saisies.some((e) => `saisie-${e.id}` === cle));
}

/** Les montants d'une ligne : « ≈ » pour une estimation ; « — » quand il n'y a rien à dire. */
export function montantLisible(o: Obligation, formater: (n: number) => string): string {
  const m = o.montant;
  if (m === null || m.statut === 'refuse') return '—';
  return m.statut === 'hypothese' ? `≈ ${formater(m.valeur)}` : formater(m.valeur);
}
