/**
 * Carnet de clients et de missions — règles d'intégrité.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE RATTACHEMENT SE FAIT PAR NOM, ET C'EST UN PIÈGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application ne liait pas une facture à un identifiant de client :
 * elle recopiait le nom. Le nouveau schéma a conservé cette forme pour les
 * recettes, faute de pouvoir reconstituer un lien qui n'a jamais existé.
 *
 * Conséquence directe : **renommer un client casse silencieusement le
 * rattachement de ses missions et de ses recettes.** Un client « Dupont »
 * devenu « Dupont SARL » laisse derrière lui des recettes attachées à un nom
 * que plus aucun client ne porte — le délai de paiement disparaît des
 * statistiques, et la déclaration européenne de services cesse de voir les
 * prestations.
 *
 * Ce module dit ce qu'un renommage doit entraîner, et ce qu'une suppression
 * doit refuser. La propagation est faite par le magasin en une seule écriture :
 * un renommage à moitié appliqué serait pire que pas de renommage du tout.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI NE PAS PASSER AUX IDENTIFIANTS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ce serait la bonne forme, et le schéma la portera un jour. Mais les données
 * existantes n'ont que des noms : la bascule supposerait de deviner à quel
 * client rattacher chaque recette historique, c'est-à-dire d'inventer un lien.
 * Le nom reste donc la clé, et la propagation la remplace.
 */

import { type PayeurDeMission, payeursDeLaMission } from './brouillon';
import type { Rythme } from './planning';

/** Ce qu'un client doit porter pour être exploitable. */
export interface ClientCarnet {
  readonly id: string;
  readonly nom: string;
  readonly pays: string;
  readonly tvaIntracom: string;
}

export type RefusCarnet =
  | { readonly motif: 'nom_vide'; readonly message: string }
  | { readonly motif: 'nom_deja_pris'; readonly message: string }
  | { readonly motif: 'rattachements_existants'; readonly message: string }
  | { readonly motif: 'introuvable'; readonly message: string };

/**
 * Contrôle un nom de client.
 *
 * L'unicité n'est pas un raffinement : le nom EST la clé de rattachement. Deux
 * clients homonymes rendraient indécidable l'appartenance de chaque recette,
 * et les délais de paiement comme la DES s'appuieraient sur le premier trouvé.
 */
export function validerNomClient(
  nom: string,
  existants: readonly ClientCarnet[],
  idAExclure: string | null = null
): RefusCarnet | null {
  const propre = nom.trim();
  if (propre === '') {
    return {
      motif: 'nom_vide',
      message: 'Le nom du client est obligatoire : c’est lui qui rattache les '
        + 'missions et les recettes.'
    };
  }

  const homonyme = existants.find(
    (c) => c.id !== idAExclure && c.nom.trim().toLowerCase() === propre.toLowerCase()
  );
  if (homonyme !== undefined) {
    return {
      motif: 'nom_deja_pris',
      message: `Un client s’appelle déjà « ${homonyme.nom} ». Comme le nom sert de `
        + 'clé de rattachement, deux homonymes rendraient indécidable '
        + 'l’appartenance de chaque recette.'
    };
  }
  return null;
}

export interface RattachementsClient {
  readonly missions: number;
  readonly recettes: number;
  /** Plages de rythme qui le désignent comme payeur (schéma 24). */
  readonly plages: number;
}

/**
 * Une mission telle que le carnet la lit : son payeur et, depuis le schéma 24,
 * les plages qui peuvent en désigner un autre.
 */
export interface MissionDuCarnet {
  readonly clientNom: string;
  readonly entites?: readonly { readonly rythmes: readonly { readonly facturerA?: string | null }[] }[];
}

/** Ce qui pointe vers un client, par son nom. */
export function rattachementsDe(
  nomClient: string,
  missions: readonly MissionDuCarnet[],
  recettes: readonly { readonly clientNom: string }[]
): RattachementsClient {
  const cible = nomClient.trim().toLowerCase();
  const correspond = (n: string) => n.trim().toLowerCase() === cible;
  return {
    missions: missions.filter((m) => correspond(m.clientNom)).length,
    recettes: recettes.filter((r) => correspond(r.clientNom)).length,
    /* Quel que soit le mode de facturation : une plage qui nomme ce client est
       un fait enregistré, et repasser la mission en facturation par client le
       ferait payer à un nom absent du carnet. */
    plages: (missions.flatMap((m) => m.entites ?? []))
      .flatMap((e) => e.rythmes)
      .filter((r) => typeof r.facturerA === 'string' && correspond(r.facturerA)).length
  };
}

/**
 * Un client peut-il être supprimé ?
 *
 * Non s'il porte des missions ou des recettes. Supprimer le client laisserait
 * des recettes rattachées à un nom qui n'existe plus : elles resteraient au
 * livre — c'est un registre en ajout seul — mais sortiraient des délais de
 * paiement et de la DES, sans que rien ne le signale.
 */
export function peutSupprimerClient(
  nomClient: string,
  missions: readonly MissionDuCarnet[],
  recettes: readonly { readonly clientNom: string }[]
): RefusCarnet | null {
  const liens = rattachementsDe(nomClient, missions, recettes);
  if (liens.missions === 0 && liens.recettes === 0 && liens.plages === 0) return null;

  const parties: string[] = [];
  if (liens.missions > 0) {
    parties.push(`${liens.missions} mission${liens.missions > 1 ? 's' : ''}`);
  }
  if (liens.recettes > 0) {
    parties.push(`${liens.recettes} recette${liens.recettes > 1 ? 's' : ''}`);
  }
  if (liens.plages > 0) {
    parties.push(`${liens.plages} période${liens.plages > 1 ? 's' : ''} de rythme facturée`
      + `${liens.plages > 1 ? 's' : ''} à son nom`);
  }

  return {
    motif: 'rattachements_existants',
    message: `${parties.slice(0, -1).join(', ')}${parties.length > 1 ? ' et ' : ''}`
      + `${parties[parties.length - 1] ?? ''} sont rattachées à ce client. Le supprimer les `
      + 'laisserait attachées à un nom qui n’existe plus : elles sortiraient des '
      + 'délais de paiement et de la déclaration européenne de services sans que '
      + 'rien ne le signale.'
  };
}

/**
 * Une mission peut-elle être supprimée ?
 *
 * Non si des recettes ont été émises pour son client sur sa période : une
 * facture émise ne se retire pas du registre, et supprimer la mission qui la
 * justifie rendrait sa présence inexplicable en contrôle.
 *
 * « Son client », ce sont tous ceux qui peuvent recevoir une facture de la
 * mission : son payeur, et ceux des plages quand elle se facture client par
 * client (schéma 24). Les factures envoyées en direct à un client final sont
 * justifiées par cette mission comme celles de l'agence.
 */
export function peutSupprimerMission(
  mission: PayeurDeMission & {
    readonly debut: string | null;
    readonly fin: string | null;
    readonly entites?: readonly { readonly rythmes: readonly Rythme[] }[];
  },
  recettes: readonly { readonly clientNom: string; readonly emiseLe: string | null }[]
): RefusCarnet | null {
  const payeurs = new Set([...payeursDeLaMission({ ...mission, entites: mission.entites ?? [] })]
    .map((n) => n.trim().toLowerCase()));
  const liees = recettes.filter((r) => {
    if (!payeurs.has(r.clientNom.trim().toLowerCase())) return false;
    if (r.emiseLe === null) return true;
    if (mission.debut !== null && r.emiseLe < mission.debut) return false;
    if (mission.fin !== null && r.emiseLe > mission.fin) return false;
    return true;
  });

  if (liees.length === 0) return null;
  return {
    motif: 'rattachements_existants',
    message: `${liees.length} recette${liees.length > 1 ? 's' : ''} de ce client `
      + 'relève(nt) de la période de cette mission. Une facture émise ne se retire '
      + 'pas du registre, et supprimer la mission qui la justifie rendrait sa '
      + 'présence inexplicable en contrôle.'
  };
}

/**
 * Le nouveau nom à propager, ou `null` si le renommage n'en est pas un.
 *
 * Comparer sur le nom exact plutôt qu'insensiblement à la casse : corriger
 * « dupont » en « Dupont » EST un renommage, et les rattachements doivent
 * suivre, faute de quoi la casse d'origine subsisterait dans les recettes.
 */
export function nomAPropager(ancien: string, nouveau: string): string | null {
  const propre = nouveau.trim();
  return propre === ancien ? null : propre;
}
