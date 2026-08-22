import type { Euros, Mois } from '../types';
import { euros } from '../types';

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
 */

/** Une ligne de facture, telle que le planning la produit. */
export interface LigneDeBrouillon {
  readonly missionId: string;
  readonly entiteId: string;
  /** Ce que la ligne désigne : la mission, et le client opérationnel s'il y en a plusieurs. */
  readonly libelle: string;
  /** Le client qui reçoit la facture — celui qui paie. */
  readonly clientNom: string;
  readonly jours: number;
  readonly montant: Euros;
}

/** La facture du mois pour un client, telle qu'elle se présenterait. */
export interface BrouillonDeFacture {
  readonly mois: Mois;
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
 * Rassemble les journées du mois en brouillons de facture, un par client.
 *
 * `emisesParClient` associe un nom de client à la facture déjà émise pour ce
 * mois — son numéro ET son montant. Un brouillon dont le client y figure est
 * marqué, pas supprimé, et l'écart entre les deux montants est calculé.
 *
 * Les lignes sans journée ne produisent rien : facturer zéro jour n'est pas
 * une facture à zéro euro, c'est une facture qui n'a pas lieu d'être.
 */
export function brouillonsDuMois(
  mois: Mois,
  lignes: readonly LigneDeBrouillon[],
  emisesParClient: ReadonlyMap<string, FactureEmise> = new Map()
): readonly BrouillonDeFacture[] {
  const parClient = new Map<string, LigneDeBrouillon[]>();

  for (const l of lignes) {
    if (l.jours <= 0) continue;
    const groupe = parClient.get(l.clientNom);
    if (groupe === undefined) parClient.set(l.clientNom, [l]);
    else groupe.push(l);
  }

  return [...parClient.entries()]
    .map(([clientNom, sesLignes]) => {
      const total = euros(sesLignes.reduce((s, l) => s + l.montant, 0));
      const emise = emisesParClient.get(clientNom);
      return {
        mois,
        clientNom,
        lignes: sesLignes,
        jours: sesLignes.reduce((s, l) => s + l.jours, 0),
        total,
        dejaEmise: emise?.numero ?? null,
        ecart: emise === undefined
          ? null
          : { facture: emise.montant, montant: euros(total - emise.montant) }
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
