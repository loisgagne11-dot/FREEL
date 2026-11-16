import type { DateISO, Euros, Mois, Ratio } from '../types';
import { euros } from '../types';
import type { LigneFacture } from './facture';
import type { Rythme } from './planning';
import { rythmePour } from './planification';

/**
 * La facture du mois, avant qu'elle existe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN BROUILLON QU'ON NE DEMANDE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « La facture du mois en cours est créée en brouillon et se met à jour en
 * fonction de mes modifications d'Activité. » Trois exigences distinctes, et
 * c'est la deuxième qui commande la conception.
 *
 * Un brouillon ENREGISTRÉ ne suivrait rien. Il serait juste à l'instant de sa
 * création, puis faux dès la première journée corrigée au planning — et on ne
 * saurait jamais lequel des deux croire. Il faudrait alors le resynchroniser,
 * c'est-à-dire réécrire un fait à partir d'un calcul, ce que cette application
 * s'interdit partout ailleurs.
 *
 * Le brouillon est donc DÉRIVÉ. Il n'est stocké nulle part, il se recalcule à
 * chaque lecture depuis le planning, et il suit l'Activité par construction —
 * non par un mécanisme de mise à jour, mais parce qu'il n'a pas d'existence
 * séparée à faire diverger.
 *
 * Il ne devient un fait qu'au moment de l'ÉMISSION, qui est le geste qui
 * engage : à partir de là, la facture porte un numéro, entre au registre, et
 * ne bouge plus qu'à l'annulation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN BROUILLON PAR CLIENT QUI PAIE, PAS PAR MISSION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * On envoie une facture, pas quatre. Deux missions chez le même donneur
 * d'ordre font deux LIGNES d'un même document, et c'est aussi ce que le client
 * attend de recevoir.
 *
 * Le client qui paie n'est pas toujours celui chez qui l'on travaille — une
 * mission passée par une agence a les deux. Le regroupement suit donc celui
 * qui reçoit la facture, tandis que le détail des lignes garde le nom de qui
 * a occupé les journées.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SAUF QUAND LA MISSION SE FACTURE CLIENT PAR CLIENT (décision 14)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une mission à plusieurs clients opérationnels peut aussi se facturer à
 * chacun : B passe en direct en septembre, A reste derrière l'agence. Chaque
 * journée part alors au payeur de la PLAGE qui la couvre, et chaque client
 * opérationnel a son brouillon — même quand deux d'entre eux paient au même
 * nom : la facture de l'un ne doit pas porter le volume de l'autre, pour la
 * raison qui fait déjà un CRA par client. D'où la clé : le nom du payeur en
 * commun, le payeur, la mission et le client opérationnel sinon.
 */

/** Comment une mission à plusieurs clients se facture. Voir `Mission.facturation`. */
export type ModeDeFacturation = 'commune' | 'par_client';

/** Ce qu'une mission porte et que la lecture du payeur demande. */
export interface PayeurDeMission {
  /** Le payeur de la mission : celui qui reçoit la facture commune. */
  readonly clientNom: string;
  readonly facturation?: ModeDeFacturation;
}

/** Ce qu'une mission porte et que la facturation lit. */
export interface MissionFacturee extends PayeurDeMission {
  readonly id: string;
}

/**
 * Le mode de facturation d'une mission — le seul lecteur du champ.
 *
 * Absent vaut `commune` : c'est ce que toute mission faisait avant le schéma
 * 24. Lire l'absence ailleurs, à la main, finirait par la lire autrement.
 */
export function modeDeFacturation(m: { readonly facturation?: ModeDeFacturation }): ModeDeFacturation {
  return m.facturation ?? 'commune';
}

/**
 * Qui paie les journées d'une plage — le seul lecteur de `facturerA`.
 *
 * En commun, toujours le payeur de la mission : le champ est ignoré, et le
 * lire quand même ferait éclater la facture qu'une agence attend unique. Par
 * client, le payeur de la plage s'il en a un, celui de la mission sinon. Une
 * journée qu'aucune plage ne couvre — une correction posée hors rythme — n'a
 * pas d'autre payeur que celui de la mission.
 */
export function payeurDeLaPlage(r: Rythme | undefined, m: PayeurDeMission): string {
  if (modeDeFacturation(m) === 'commune') return m.clientNom;
  const payeur = r?.facturerA?.trim() ?? '';
  return payeur !== '' ? payeur : m.clientNom;
}

/** Tous ceux qui peuvent recevoir une facture de cette mission, payeur de la mission compris. */
export function payeursDeLaMission(
  m: PayeurDeMission & { readonly entites: readonly { readonly rythmes: readonly Rythme[] }[] }
): ReadonlySet<string> {
  const payeurs = new Set([m.clientNom]);
  for (const e of m.entites) for (const r of e.rythmes) payeurs.add(payeurDeLaPlage(r, m));
  return payeurs;
}

/**
 * Les journées d'un client opérationnel, réparties entre leurs payeurs.
 *
 * Chaque journée va au payeur de la plage qui la couvre — `rythmePour`, la
 * même règle que le planning, pour que la plage qui paie soit celle qui a
 * rempli la journée. En commun, une seule entrée : le payeur de la mission,
 * avec toutes les journées.
 *
 * Une partition, jamais un partage : la somme des brouillons par client doit
 * retomber exactement sur le brouillon commun, sans quoi passer d'un mode à
 * l'autre ferait apparaître ou disparaître du chiffre d'affaires.
 */
export function ventilerParFacturation<J extends { readonly date: DateISO }>(
  jours: readonly J[],
  rythmes: readonly Rythme[],
  m: MissionFacturee
): ReadonlyMap<string, readonly J[]> {
  const parPayeur = new Map<string, J[]>();
  for (const j of jours) {
    const payeur = payeurDeLaPlage(rythmePour(j.date, rythmes), m);
    const groupe = parPayeur.get(payeur);
    if (groupe === undefined) parPayeur.set(payeur, [j]);
    else groupe.push(j);
  }
  return parPayeur;
}

/** La clé d'un brouillon : le payeur en commun ; payeur, mission et client opérationnel sinon. */
export function cleDuBrouillon(payeur: string, m: MissionFacturee, entiteId: string): string {
  return modeDeFacturation(m) === 'commune' ? payeur : `${payeur}\u00b7${m.id}\u00b7${entiteId}`;
}

/** Une ligne de facture, telle que le planning la produit. */
export interface LigneDeBrouillon {
  readonly missionId: string;
  readonly entiteId: string;
  /** Ce que la ligne désigne : la mission, et le client opérationnel s'il y en a plusieurs. */
  readonly libelle: string;
  /** Le client qui reçoit la facture — celui qui paie. */
  readonly clientNom: string;
  /** Le brouillon où la ligne se range. Voir `cleDuBrouillon`. */
  readonly cle: string;
  readonly jours: number;
  readonly montant: Euros;
}

/** La facture du mois pour un client, telle qu'elle se présenterait. */
export interface BrouillonDeFacture {
  readonly mois: Mois;
  /**
   * Ce qui désigne ce brouillon parmi ceux du mois. Le nom du payeur ne suffit
   * plus : par client, deux brouillons peuvent partir au même nom.
   */
  readonly cle: string;
  readonly clientNom: string;
  readonly lignes: readonly LigneDeBrouillon[];
  readonly jours: number;
  readonly total: Euros;
  /**
   * Le numéro de la facture DÉJÀ émise pour ce client et ce mois, s'il y en a
   * une.
   *
   * Le brouillon ne disparaît pas pour autant : il reste affiché à côté de ce
   * qui a été émis. Le faire disparaître empêcherait de voir qu'on a facturé
   * douze jours là où le planning en compte quatorze — l'écart qu'on veut
   * justement pouvoir constater avant que le client le constate.
   */
  readonly dejaEmise: string | null;
  /**
   * L'écart entre ce qui a été facturé et ce que le planning compte
   * MAINTENANT. `null` quand rien n'a été émis : il n'y a alors rien à
   * comparer.
   *
   * ─────────────────────────────────────────────────────────────────────
   * MONTRER LES DEUX NOMBRES NE SUFFISAIT PAS
   * ─────────────────────────────────────────────────────────────────────
   *
   * Le brouillon restait affiché à côté de la facture émise « pour que
   * l'écart se voie ». Il se voyait au sens où les deux montants étaient à
   * l'écran — mais il fallait les soustraire de tête, sur une carte qui en
   * porte déjà plusieurs. Un écart qu'on doit calculer soi-même est un écart
   * qu'on ne remarque pas.
   *
   * Il est donc CALCULÉ. Positif : le planning compte plus que ce qui a été
   * facturé — du travail fait et non facturé, qui se perd si personne ne le
   * voit avant la clôture. Négatif : on a facturé plus que le planning ne
   * porte, et c'est le client qui le remarquera.
   */
  readonly ecart: EcartDeFacturation | null;
}

/** De combien la facture émise et le planning divergent. */
export interface EcartDeFacturation {
  /** Ce que porte la facture déjà émise. */
  readonly facture: Euros;
  /** Planning moins facturé. Signé : le sens de l'écart est l'information. */
  readonly montant: Euros;
}

/** Ce qu'une facture émise porte, pour la comparer au planning. */
export interface FactureEmise {
  readonly numero: string;
  readonly montant: Euros;
}

/**
 * Rassemble les journées du mois en brouillons de facture, un par clé.
 *
 * `emisesParClient` associe un nom de client à la facture déjà émise pour ce
 * mois — son numéro ET son montant. Un brouillon dont le client y figure est
 * marqué, pas supprimé, et l'écart entre les deux montants est calculé.
 *
 * L'écart se mesure sur l'ENSEMBLE des brouillons d'un même payeur : une
 * facture émise ne dit pas de quel client opérationnel elle portait les
 * journées, et la comparer à un seul des brouillons du même nom ferait lire
 * un écart qui n'existe pas.
 *
 * Les lignes sans journée ne produisent rien : facturer zéro jour n'est pas
 * une facture à zéro euro, c'est une facture qui n'a pas lieu d'être.
 */
export function brouillonsDuMois(
  mois: Mois,
  lignes: readonly LigneDeBrouillon[],
  emisesParClient: ReadonlyMap<string, FactureEmise> = new Map()
): readonly BrouillonDeFacture[] {
  const parCle = new Map<string, LigneDeBrouillon[]>();
  const parPayeur = new Map<string, number>();

  for (const l of lignes) {
    if (l.jours <= 0) continue;
    const groupe = parCle.get(l.cle);
    if (groupe === undefined) parCle.set(l.cle, [l]);
    else groupe.push(l);
    parPayeur.set(l.clientNom, (parPayeur.get(l.clientNom) ?? 0) + l.montant);
  }

  return [...parCle.entries()]
    .map(([cle, sesLignes]) => {
      const clientNom = (sesLignes[0] as LigneDeBrouillon).clientNom;
      const total = euros(sesLignes.reduce((s, l) => s + l.montant, 0));
      const emise = emisesParClient.get(clientNom);
      return {
        mois,
        cle,
        clientNom,
        lignes: sesLignes,
        jours: sesLignes.reduce((s, l) => s + l.jours, 0),
        total,
        dejaEmise: emise?.numero ?? null,
        ecart: emise === undefined
          ? null
          : {
            facture: emise.montant,
            montant: euros((parPayeur.get(clientNom) ?? 0) - emise.montant)
          }
      };
    })
    // Le plus gros montant d'abord : c'est celui qu'on veut envoyer en premier,
    // et celui dont un écart coûte le plus cher.
    .sort((a, b) => b.total - a.total);
}

/**
 * Le libellé que portera la facture émise.
 *
 * Il dit la période et ce qu'elle contient, parce que c'est ce que le client
 * lira six mois plus tard en cherchant à quoi correspondait ce virement. Un
 * libellé qui ne porte que le nom de la mission oblige à rouvrir le compte
 * rendu pour savoir de quel mois il s'agit.
 */
export function libelleDeLaFacture(b: BrouillonDeFacture): string {
  const periode = new Date(`${b.mois}-01T00:00:00Z`)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const detail = b.lignes.length === 1 && b.lignes[0] !== undefined
    ? b.lignes[0].libelle
    : `${b.lignes.length} missions`;

  return `${detail} — ${periode}`;
}

/**
 * Les lignes d'une facture tirée de son brouillon : une par mission, en jours
 * × prix journalier — le détail que le client lit.
 *
 * Le prix journalier se retrouve en divisant ; quand la division ne tombe pas
 * juste au centime (un montant ajusté à la main), la ligne garde le montant en
 * une seule quantité, et les jours dans sa désignation : un prix arrondi dont le
 * produit ne retomberait pas sur le total contredirait le livre.
 *
 * Le taux vient de l'appelant, parce qu'il n'est pas le même partout : zéro
 * pour l'émission en un clic d'une franchise, qui le sait ; le taux proposé
 * par l'éditeur pour le préremplissage, où il se choisit avant d'émettre.
 */
export function lignesDuBrouillon(b: BrouillonDeFacture, tauxTva: Ratio): readonly LigneFacture[] {
  return b.lignes.map((l) => {
    const prix = Math.round((l.montant / l.jours) * 100) / 100;
    const juste = l.jours > 0 && Math.abs(prix * l.jours - l.montant) < 0.005;
    return juste
      ? { designation: l.libelle, quantite: l.jours, prixUnitaireHt: euros(prix), tauxTva }
      : { designation: `${l.libelle} — ${l.jours} j`, quantite: 1, prixUnitaireHt: l.montant, tauxTva };
  });
}
