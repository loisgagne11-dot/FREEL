/**
 * Émission de factures.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE FACTURE INCOMPLÈTE EST UNE FACTURE CONTESTABLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les mentions obligatoires ne sont pas des ornements. Une facture qui en
 * manque une expose à une amende de 15 € par mention et par facture, plafonnée
 * au quart du montant facturé ; surtout, elle donne à un client de mauvaise foi
 * un motif de refuser le paiement, et à l'administration un motif de refuser la
 * déduction chez lui.
 *
 * Ce module ne se contente donc pas d'assembler un document : il CONSTATE ce
 * qui manque, mention par mention, avant émission. L'ancienne application
 * produisait un PDF sans vérifier quoi que ce soit — et son pied de page
 * annonçait une immatriculation au registre du commerce, codée en dur avec
 * une ville : mention qui ne concerne pas un micro-BNC, donc fausse pour
 * tout le monde, et qui exposait au passage le domicile de l'utilisateur.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS MENTIONS QUI DÉPENDENT DU RÉGIME ET DU CLIENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  1. **Franchise en base** : « TVA non applicable, article 293 B du CGI ».
 *     L'omettre en facturant sans TVA laisse croire à un oubli de taxe.
 *  2. **Client assujetti d'un autre État membre** : pas de TVA française, et
 *     mention d'autoliquidation. Cette facture déclenche aussi une DES.
 *  3. **Entre professionnels** : pénalités de retard ET indemnité forfaitaire
 *     de recouvrement de 40 €. Les deux sont dues de plein droit, mais ne
 *     peuvent être réclamées que si la facture les annonce.
 */

import { type DateISO, type Euros, type Ratio, euros, ratio } from '../types';
import { estDansLUe } from './des';
import { type FormuleDelai, echeanceDe } from './delaiPaiement';

/**
 * Indemnité forfaitaire pour frais de recouvrement.
 *
 * Donnée officielle, donc datée et sourcée comme les taux de cotisations.
 */
export const INDEMNITE_RECOUVREMENT = {
  valeur: euros(40),
  source: 'Code de commerce, art. L441-10 — indemnité forfaitaire de recouvrement',
  verifieLe: '2026-08-12' as DateISO
};

/**
 * Amende encourue par mention manquante.
 *
 * 15 € par mention et par facture, dans la limite du quart du montant facturé.
 */
export const AMENDE_PAR_MENTION = {
  valeur: euros(15),
  plafondPartDuMontant: ratio(0.25),
  source: 'CGI, art. 1737 II — défaut de mention obligatoire sur facture',
  verifieLe: '2026-08-12' as DateISO
};

/** L'émetteur, tel qu'il doit figurer sur la facture. */
export interface Emetteur {
  readonly nom: string;
  readonly siret: string;
  readonly adresse: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly tvaIntracom: string;
  /** `true` si l'entreprise est en franchise en base de TVA. */
  readonly enFranchise: boolean;
  /**
   * Les coordonnées bancaires, telles qu'elles doivent figurer sur la facture.
   *
   * ───────────────────────────────────────────────────────────────────────
   * ELLES MANQUAIENT, ET LA FACTURE ÉTAIT IMPAYABLE
   * ───────────────────────────────────────────────────────────────────────
   *
   * `entreprise.iban` existait dans le schéma et était même repris de
   * l'ancienne application à la migration — mais aucun écran ne le montrait, et
   * le document imprimé ne le portait pas. Le client recevait une facture
   * régulière sur laquelle rien n'indiquait où payer.
   *
   * Ce n'est pas une mention obligatoire au sens de l'article L441-9 : une
   * facture sans IBAN reste valide. Elle est seulement impayable sans un
   * échange de courriels de plus, à chaque fois.
   */
  readonly iban: string;
  readonly bic: string;
}

/** Le destinataire. */
export interface Destinataire {
  readonly nom: string;
  readonly adresse: string;
  readonly siret: string;
  /** Code pays ISO. Vide ou `FR` pour la France. */
  readonly pays: string;
  readonly tvaIntracom: string;
  /**
   * Les conditions de paiement retenues pour CETTE facture.
   *
   * Celles de la mission si elle en a, sinon celles du client. Elles servent à
   * calculer l'échéance une fois, à l'émission — c'est ensuite la date figée
   * dans la recette qui fait foi, parce que c'est elle qui est imprimée.
   */
  readonly delaiPaiement: FormuleDelai;
}

export interface LigneFacture {
  readonly designation: string;
  readonly quantite: number;
  readonly prixUnitaireHt: Euros;
  readonly tauxTva: Ratio;
}

export interface Facture {
  readonly numero: string;
  readonly emiseLe: DateISO;
  readonly emetteur: Emetteur;
  readonly destinataire: Destinataire;
  readonly lignes: readonly LigneFacture[];
}

/**
 * Les taux de TVA en vigueur en France, du plus courant au plus rare.
 *
 * Ils servent à RECONNAÎTRE un taux, pas à en proposer un : voir
 * `factureDepuisRecette`. Une liste qui sert à reconnaître peut être fermée,
 * là où une liste qui sert à proposer devrait suivre les évolutions du barème.
 */
const TAUX_TVA_CONNUS: readonly number[] = [0.2, 0.1, 0.055, 0.021, 0];

/**
 * Ce qu'on peut rééditer d'une facture déjà émise.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE RÉÉDITION PEUT ÉCHOUER, ET POURQUOI C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une facture émise n'était plus atteignable : le document n'existait qu'à
 * l'instant de l'émission, dans l'écran de rédaction. Passé cet instant, plus
 * moyen de le revoir, de le renvoyer à un client qui dit ne pas l'avoir reçu,
 * ni d'en garder une copie.
 *
 * Le rééditer demande de retrouver ses LIGNES, et la recette ne les conserve
 * pas — elle porte le total HT et la TVA du document, pas leur détail. On les
 * reconstruit donc à partir de ce qui est su : une désignation, le total HT,
 * et le taux qui relie le HT à la TVA enregistrée.
 *
 * Ce taux ne se devine que s'il est UNIQUE. Une facture qui mêlait 20 % et
 * 10 % donne un rapport intermédiaire qui ne correspond à aucun taux légal :
 * imprimer ce rapport comme s'il était un taux mettrait sur un document
 * comptable un chiffre qui n'a jamais existé — sous le même numéro que
 * l'original, donc indiscernable de lui. On refuse, et on dit pourquoi.
 */
export type ReeditionFacture =
  | { readonly cas: 'reeditee'; readonly facture: Facture }
  | { readonly cas: 'impossible'; readonly motif: string };

/**
 * Reconstruit le document d'une facture déjà émise.
 *
 * La désignation vient du libellé enregistré, en UNE ligne. C'est la forme
 * réelle de ces factures — « Prestation de juin 2026, 18 j » — et non un
 * appauvrissement : le libellé est écrit à l'émission précisément pour que le
 * client sache six mois plus tard à quoi correspondait le virement.
 */
export function factureDepuisRecette(
  recette: {
    readonly numero: string;
    readonly libelle: string;
    readonly montant: Euros;
    readonly emiseLe: DateISO | null;
    readonly tvaCollectee?: Euros | null;
  },
  emetteur: Emetteur,
  destinataire: Destinataire
): ReeditionFacture {
  if (recette.emiseLe === null) {
    return {
      cas: 'impossible',
      motif: 'Cette écriture ne porte pas de date d’émission : ce n’est pas une facture.'
    };
  }

  const tva = recette.tvaCollectee ?? null;
  if (tva === null) {
    return {
      cas: 'impossible',
      motif: 'La TVA de cette facture n’a pas été conservée. La rééditer '
        + 'obligerait à en supposer une, sur un document qui porte le même '
        + 'numéro que l’original.'
    };
  }

  /*
   * LE RÉGIME D'AUJOURD'HUI N'EST PAS CELUI DU JOUR DE L'ÉMISSION.
   *
   * `totaux` met la TVA à zéro quand l'émetteur est en franchise — c'est
   * juste pour une facture qu'on établit maintenant. Mais une facture émise
   * AVANT le passage en franchise en portait une, et la rééditer sous le
   * régime du jour l'effacerait : le document contredirait l'original tout en
   * portant son numéro.
   *
   * Le régime historique n'est pas conservé, et il ne se devine pas. On
   * refuse plutôt que de choisir entre deux documents dont l'un est faux.
   */
  if (tva > 0 && emetteur.enFranchise) {
    return {
      cas: 'impossible',
      motif: 'Cette facture porte de la TVA alors que ton entreprise est '
        + 'aujourd’hui en franchise. La rééditer sous le régime actuel '
        + 'effacerait cette TVA, sur un document qui porte le même numéro que '
        + 'l’original.'
    };
  }

  const taux = tauxReconnu(recette.montant, tva);
  if (taux === null) {
    return {
      cas: 'impossible',
      motif: 'Cette facture mêlait plusieurs taux de TVA, et leur détail n’a '
        + 'pas été conservé. Le rapport entre son total et sa TVA ne '
        + 'correspond à aucun taux légal.'
    };
  }

  return {
    cas: 'reeditee',
    facture: {
      numero: recette.numero,
      emiseLe: recette.emiseLe,
      emetteur,
      destinataire,
      lignes: [{
        designation: recette.libelle,
        // Une quantité de 1 au prix du total : le détail « 18 j × 430 € »
        // n'est pas conservé, et le fabriquer par division donnerait un prix
        // unitaire arrondi dont le produit ne retomberait pas sur le total.
        quantite: 1,
        prixUnitaireHt: recette.montant,
        tauxTva: taux as Ratio
      }]
    }
  };
}

/**
 * Le taux de TVA d'une facture, s'il est reconnaissable.
 *
 * `null` quand le rapport ne tombe sur aucun taux légal — ce qui arrive dès
 * que la facture en mêlait deux. La tolérance d'un demi-centime absorbe les
 * arrondis d'affichage sans jamais accepter un taux voisin : le plus serré des
 * écarts entre deux taux légaux est de 3,4 points, très loin devant.
 */
function tauxReconnu(ht: Euros, tva: Euros): number | null {
  if (ht <= 0) return tva === 0 ? 0 : null;
  return TAUX_TVA_CONNUS.find((t) => Math.abs(ht * t - tva) < 0.005) ?? null;
}

/* ── Totaux ────────────────────────────────────────────────────────────── */

export interface TotauxFacture {
  readonly totalHt: Euros;
  readonly totalTva: Euros;
  readonly totalTtc: Euros;
  /** Détail par taux : une facture peut mêler plusieurs taux de TVA. */
  readonly parTaux: readonly { readonly taux: Ratio; readonly base: Euros; readonly tva: Euros }[];
  readonly echeanceLe: DateISO;
}

/**
 * Régime de TVA applicable à CETTE facture.
 *
 * Trois cas, et non deux : la franchise en base et l'autoliquidation aboutissent
 * toutes deux à une facture sans TVA, mais pour des raisons différentes et avec
 * des mentions différentes. Les confondre ferait porter la mauvaise mention.
 */
export type RegimeFacture = 'franchise' | 'autoliquidation_ue' | 'tva_francaise';

export function regimeDeLaFacture(
  emetteur: Emetteur,
  destinataire: Destinataire
): RegimeFacture {
  const pays = destinataire.pays.trim().toUpperCase();
  const horsFrance = pays !== '' && pays !== 'FR';

  // L'autoliquidation l'emporte sur la franchise : une prestation à un
  // assujetti d'un autre État membre sort du champ de la TVA française quel
  // que soit le régime du prestataire, et sa mention est différente.
  if (horsFrance && estDansLUe(pays) && destinataire.tvaIntracom.trim() !== '') {
    return 'autoliquidation_ue';
  }
  return emetteur.enFranchise ? 'franchise' : 'tva_francaise';
}

/**
 * Les totaux d'une facture.
 *
 * La TVA est calculée par taux et arrondie au centime **par groupe de taux**,
 * pas ligne par ligne : arrondir chaque ligne puis sommer produit des écarts
 * d'un ou deux centimes avec le total attendu par le client, et ces écarts
 * font perdre plus de temps en réclamations qu'ils n'en font gagner.
 */
export function totaux(facture: Facture): TotauxFacture {
  const regime = regimeDeLaFacture(facture.emetteur, facture.destinataire);
  const sansTva = regime !== 'tva_francaise';

  const bases = new Map<number, number>();
  let totalHt = 0;

  for (const ligne of facture.lignes) {
    const montant = ligne.quantite * ligne.prixUnitaireHt;
    totalHt += montant;
    const taux = sansTva ? 0 : ligne.tauxTva;
    bases.set(taux, (bases.get(taux) ?? 0) + montant);
  }

  const parTaux = [...bases.entries()]
    .filter(([taux]) => taux > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([taux, base]) => ({
      taux: ratio(taux),
      base: euros(base),
      tva: euros(base * taux)
    }));

  const totalTva = parTaux.reduce<number>((s, g) => s + g.tva, 0);

  return {
    totalHt: euros(totalHt),
    totalTva: euros(totalTva),
    totalTtc: euros(totalHt + totalTva),
    parTaux,
    echeanceLe: echeanceDe(facture.emiseLe, facture.destinataire.delaiPaiement)
  };
}

/* ── Mentions obligatoires ─────────────────────────────────────────────── */

export type MentionManquante =
  | 'numero'
  | 'date_emission'
  | 'identite_emetteur'
  | 'siret_emetteur'
  | 'adresse_emetteur'
  | 'identite_destinataire'
  | 'adresse_destinataire'
  | 'designation'
  | 'montant'
  | 'tva_intracom_emetteur'
  | 'tva_intracom_destinataire';

export interface Manque {
  readonly mention: MentionManquante;
  readonly message: string;
}

/**
 * Ce qui manque à la facture pour être régulière.
 *
 * Le contrôle porte sur les mentions dont l'absence est sanctionnée, pas sur
 * la mise en forme. Il vaut mieux refuser d'émettre que produire un document
 * qu'un client pourra contester : une facture irrégulière ne se corrige pas,
 * elle s'annule par un avoir et se réémet sous un nouveau numéro.
 */
export function mentionsManquantes(facture: Facture): readonly Manque[] {
  const manques: Manque[] = [];
  const { emetteur, destinataire } = facture;
  const regime = regimeDeLaFacture(emetteur, destinataire);

  const exiger = (
    present: boolean, mention: MentionManquante, message: string
  ): void => { if (!present) manques.push({ mention, message }); };

  exiger(facture.numero.trim() !== '', 'numero',
    'Numéro de facture absent. Il doit suivre une séquence continue, sans trou : '
    + 'un numéro manquant se lit en contrôle comme une facture retirée.');
  exiger(/^\d{4}-\d{2}-\d{2}$/.test(facture.emiseLe), 'date_emission',
    'Date d’émission absente ou invalide.');

  exiger(emetteur.nom.trim() !== '', 'identite_emetteur',
    'Ton nom ou ta dénomination est absent. À renseigner dans Config → Profil.');
  exiger(emetteur.siret.trim() !== '', 'siret_emetteur',
    'Ton SIRET est absent. À renseigner dans Config → Profil.');
  exiger(
    emetteur.adresse.trim() !== '' || emetteur.ville.trim() !== '',
    'adresse_emetteur',
    'Ton adresse est absente. À renseigner dans Config → Profil.'
  );

  exiger(destinataire.nom.trim() !== '', 'identite_destinataire',
    'Le nom du client est absent.');
  exiger(destinataire.adresse.trim() !== '', 'adresse_destinataire',
    'L’adresse du client est absente : elle est obligatoire sur la facture.');

  const lignesUtiles = facture.lignes.filter((l) => l.designation.trim() !== '');
  exiger(lignesUtiles.length > 0, 'designation',
    'Aucune ligne désignée. La nature de la prestation doit être décrite.');
  exiger(
    facture.lignes.some((l) => l.quantite * l.prixUnitaireHt > 0),
    'montant',
    'Le montant est nul : une facture doit porter un montant.'
  );

  // Une prestation intracommunautaire suppose que les deux parties aient un
  // numéro de TVA : sans celui de l'émetteur, l'autoliquidation ne peut pas
  // être invoquée ; sans celui du client, elle ne peut pas être justifiée.
  if (regime === 'autoliquidation_ue') {
    exiger(emetteur.tvaIntracom.trim() !== '', 'tva_intracom_emetteur',
      'Ton numéro de TVA intracommunautaire est absent : il est obligatoire pour '
      + 'facturer un client assujetti d’un autre État membre, y compris en '
      + 'franchise en base.');
    exiger(destinataire.tvaIntracom.trim() !== '', 'tva_intracom_destinataire',
      'Le numéro de TVA du client est absent : sans lui, l’autoliquidation ne peut '
      + 'pas être justifiée et la facture devrait porter la TVA française.');
  }

  return manques;
}

/** Amende encourue au titre des mentions manquantes, plafonnée. */
export function amendeMentions(
  manques: readonly Manque[],
  totalHt: Euros
): Euros {
  const brute = manques.length * AMENDE_PAR_MENTION.valeur;
  const plafond = totalHt * AMENDE_PAR_MENTION.plafondPartDuMontant;
  return euros(Math.min(brute, plafond));
}

/* ── Mentions à porter ─────────────────────────────────────────────────── */

/**
 * Les mentions que la facture doit AFFICHER, selon le régime.
 *
 * Rendues comme des textes prêts à imprimer : les composer dans l'écran
 * ferait dépendre une obligation légale de la mise en page, et un changement
 * de gabarit pourrait en faire disparaître une.
 */
export function mentionsAPorter(facture: Facture): readonly string[] {
  const regime = regimeDeLaFacture(facture.emetteur, facture.destinataire);
  const mentions: string[] = [];

  if (regime === 'franchise') {
    mentions.push('TVA non applicable, article 293 B du CGI.');
  }
  if (regime === 'autoliquidation_ue') {
    mentions.push(
      'Autoliquidation — TVA due par le preneur, article 283-2 du CGI. '
      + 'Prestation de services intracommunautaire.'
    );
  }

  // Dues de plein droit entre professionnels, mais réclamables seulement si la
  // facture les annonce.
  mentions.push(
    'En cas de retard de paiement, des pénalités sont dues au taux d’intérêt '
    + 'légal majoré, ainsi qu’une indemnité forfaitaire de '
    + `${INDEMNITE_RECOUVREMENT.valeur} € pour frais de recouvrement `
    + '(articles L441-10 et L441-11 du code de commerce).'
  );

  return mentions;
}

/** Contrôle d'intégrité, agrégé par `bareme/index`. */
export function verifierIntegriteFacture(): readonly string[] {
  const ecarts: string[] = [];
  if (INDEMNITE_RECOUVREMENT.valeur <= 0) {
    ecarts.push('facture : l’indemnité de recouvrement doit être positive.');
  }
  if (AMENDE_PAR_MENTION.valeur <= 0) {
    ecarts.push('facture : l’amende par mention doit être positive.');
  }
  if (AMENDE_PAR_MENTION.plafondPartDuMontant <= 0
    || AMENDE_PAR_MENTION.plafondPartDuMontant > 1) {
    ecarts.push('facture : le plafond d’amende doit être une part entre 0 et 1.');
  }
  return ecarts;
}
