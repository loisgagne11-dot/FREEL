/**
 * Sélecteurs de l'écran Facturer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE À PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Même motif que `selecteurs.activite.ts` : le Pilote puise `etatPilote` dans
 * `selecteurs.ts`, donc l'empaqueteur emporte ce fichier ENTIER dans le lot de
 * premier rendu. Les mentions obligatoires, le calcul d'amende et la
 * numérotation n'y ont rien à faire — ils ne servent qu'à un écran chargé à la
 * demande, et le premier rendu les téléchargeait pour rien.
 *
 * La règle qui en découle : un sélecteur qui ne sert qu'à un écran différé
 * vit dans le module de cet écran. Sinon le budget d'entrée grossit à chaque
 * ajout, et on finit par relever le plafond — ce qui revient à ne plus rien
 * mesurer.
 */

import {
  type Destinataire, type Emetteur, type Facture, type Manque,
  type ReeditionFacture, type RegimeFacture, type TotauxFacture,
  amendeMentions, factureDepuisRecette, mentionsAPorter, mentionsManquantes,
  regimeDeLaFacture, totaux
} from '../domain/calculs/facture';
import { prochainNumero } from '../domain/calculs/ecritureRecette';
import { emiseParFreel } from '../domain/calculs/emission';
import {
 type FactureSuivie, type StatutFacture,
  encoursDe, suivre
} from '../domain/calculs/facturier';
import { type Recouvrement, recouvrementDe } from '../domain/calculs/recouvrement';
import { dansLaPeriode, type Periode } from '../domain/calculs/periode';
import type { DateISO, Euros } from '../domain/types';
import { euros } from '../domain/types';
import type { Client, Faits, Recette } from './schema';
import { dateDuJour, debutTvaEffectif } from './selecteurs';
import {
  FORMULE_PAR_DEFAUT, echeanceDe
} from '../domain/calculs/delaiPaiement';

/** L'émetteur, tel qu'il doit figurer sur une facture. */
export function emetteurDe(faits: Faits, maintenant: Date = new Date()): Emetteur {
  const e = faits.entreprise;
  const debutTva = debutTvaEffectif(faits);
  return {
    nom: e.nom,
    siret: e.siret,
    adresse: e.adresse,
    codePostal: e.codePostal,
    ville: e.ville,
    tvaIntracom: e.tvaIntracom,
    // La même source que la TVA déductible des dépenses : l'option saisie ou
    // le franchissement des seuils. Au franchissement, les factures portent la
    // TVA d'elles-mêmes — ce que promet le handoff.
    enFranchise: debutTva === null || dateDuJour(maintenant).slice(0, 7) < debutTva,
    // Ils existaient au schéma et n'atteignaient jamais le document : la
    // facture partait sans dire où payer.
    optionTvaDebits: e.optionTvaDebits,
    iban: e.iban,
    bic: e.bic
  };
}

/** Un client du carnet, tel qu'il doit figurer sur une facture. */
export function destinataireDe(client: Client): Destinataire {
  return {
    nom: client.nom,
    adresse: client.adresse,
    siret: client.siret,
    pays: client.pays,
    tvaIntracom: client.tvaIntracom,
    delaiPaiement: client.delaiPaiement
  };
}

/**
 * Le document d'une facture DÉJÀ ÉMISE, retrouvé depuis les faits.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE FACTURE ÉMISE N'AVAIT AUCUN CHEMIN DE RETOUR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le document n'existait qu'à l'instant de l'émission, dans l'écran de
 * rédaction. Passé cet instant : plus moyen de le revoir, ni de le renvoyer à
 * un client qui dit ne pas l'avoir reçu — la réponse la plus courante à une
 * relance — ni même d'en garder une copie.
 *
 * Rien n'est stocké de plus pour autant : le document se RECONSTRUIT depuis la
 * recette, l'entreprise et le carnet. C'est la même règle que le brouillon du
 * mois — ce qui se dérive ne se persiste pas, sous peine de diverger de sa
 * source à la première correction.
 *
 * Le client vient du CARNET, par son nom. Une facture émise à un client
 * absent du carnet ne peut pas être rééditée : son adresse est une mention
 * obligatoire, et l'inventer produirait un document irrégulier sous un numéro
 * déjà utilisé.
 */
export function reediterFacture(faits: Faits, numero: string): ReeditionFacture {
  const recette = faits.recettes.find((r) => r.numero === numero);
  if (recette === undefined) {
    return { cas: 'impossible', motif: 'Aucune facture ne porte ce numéro.' };
  }
  /* Une facture de Tiime n'a pas de document FREEL : le reconstruire produirait,
     sous son numéro, un papier que le client n'a jamais reçu. L'adresse
     `#/facture/<numéro>` se colle à la main ; le bouton seul ne suffit pas. */
  if (!emiseParFreel(recette)) {
    return {
      cas: 'impossible',
      motif: 'Elle a été émise dans ton logiciel de facturation : FREEL n’en produit pas le document. '
        + 'Sa pièce jointe s’ouvre depuis Factures.'
    };
  }

  const client = faits.clients.find((c) => c.nom === recette.clientNom);
  if (client === undefined) {
    return {
      cas: 'impossible',
      motif: `« ${recette.clientNom || 'Client non renseigné'} » n’est pas dans `
        + 'ton carnet. Son adresse est une mention obligatoire de la facture, '
        + 'et elle ne s’invente pas. Ajoute-le pour pouvoir rééditer.'
    };
  }

  return factureDepuisRecette(recette, emetteurDe(faits), destinataireDe(client));
}

export interface EtatFacture {
  readonly facture: Facture;
  readonly totaux: TotauxFacture;
  readonly manques: readonly Manque[];
  readonly mentions: readonly string[];
  readonly amendeEncourue: Euros;
  readonly regime: RegimeFacture;
}

/**
 * L'état d'une facture en cours de rédaction.
 *
 * Recalculé à chaque frappe : les mentions manquantes doivent se voir pendant
 * la saisie, pas au moment d'émettre. Découvrir qu'il manque l'adresse du
 * client après avoir tout rempli fait perdre la saisie.
 */
export function etatFacture(facture: Facture): EtatFacture {
  const t = totaux(facture);
  const manques = mentionsManquantes(facture);
  return {
    facture,
    totaux: t,
    manques,
    mentions: mentionsAPorter(facture),
    amendeEncourue: amendeMentions(manques, t.totalHt),
    regime: regimeDeLaFacture(facture.emetteur, facture.destinataire)
  };
}

/** Le prochain numéro de facture de l'année en cours. */
export function numeroSuivant(faits: Faits, maintenant: Date = new Date()): string {
  return prochainNumero(faits.recettes, maintenant.getFullYear());
}

/* ─────────────────────────────────────────────────────────────────────────
   Le facturier — toutes les factures, dans un seul endroit
   ───────────────────────────────────────────────────────────────────────── */

export interface EtatFacturier {
  /** Toutes les factures de la période, la plus récente en tête. */
  readonly factures: readonly FactureSuivie<Recette>[];
  /** Combien il y en a par état, y compris les états sans aucune facture. */
  readonly parStatut: Readonly<Record<StatutFacture, number>>;
  /** Ce qui reste à rentrer : émis et non réglé, annulations déduites. */
  readonly resteARentrer: Euros;
  /** La part de ce reste dont l'échéance est passée. */
  readonly enRetard: Euros;
  /** Encaissé sur la période — le seul chiffre qui compte pour l'URSSAF. */
  readonly encaisse: Euros;
  /**
   * Ce qui rentre, et en combien de temps.
   *
   * Sur la MÊME assiette que les trois montants ci-dessus — les factures de la
   * période. Un taux calculé sur toute l'histoire à côté de montants filtrés
   * répondrait à une autre question que celle que la barre de période pose, et
   * rien à l'écran ne dirait laquelle.
   */
  readonly recouvrement: Recouvrement;
}

/**
 * L'état du facturier sur une période.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUELLE DATE FILTRE ?
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Celle d'ÉMISSION. C'est la date que porte le document, celle qu'on a en
 * tête en cherchant « la facture de juin ». Filtrer sur l'encaissement ferait
 * disparaître de juin une facture émise en juin et réglée en août — alors que
 * c'est précisément celle qu'on cherche quand on relance.
 *
 * Les brouillons n'ont pas de date d'émission : ils restent visibles quelle
 * que soit la période. Un brouillon caché est un brouillon oublié, et il tient
 * un numéro.
 */
export function etatFacturier(
  faits: Faits,
  periode: Periode,
  maintenant: Date = new Date()
): EtatFacturier {
  /* Secours : l'échéance manque sur la recette (bloc écrit à la main, jeu
     d'essai). On la reconstruit depuis les conditions actuelles du client —
     faute de mieux, et sans l'écrire nulle part. */
  const formules = new Map(faits.clients.map((c) => [c.nom, c.delaiPaiement]));
  const secours = (nom: string, emiseLe: DateISO) =>
    echeanceDe(emiseLe, formules.get(nom) ?? FORMULE_PAR_DEFAUT);
  const aujourdhui = dateDuJour(maintenant);

  const toutes = suivre(faits.recettes, secours, aujourdhui);

  const factures = toutes
    .filter((f) => f.statut === 'brouillon' || dansLaPeriode(f.recette.emiseLe, periode))
    .sort(parDateDecroissante);

  const parStatut: Record<StatutFacture, number> = {
    brouillon: 0, emise: 0, envoyee: 0, en_retard: 0, encaissee: 0,
    annulee: 0, annulation: 0
  };
  for (const f of factures) parStatut[f.statut] += 1;

  const somme = (garde: (f: FactureSuivie<Recette>) => boolean): Euros =>
    euros(factures.filter(garde).reduce((t, f) => t + f.recette.montant, 0));

  // L'encours vient du domaine, et non d'un calcul local : l'écran Argent pose
  // la même question sur une autre assiette, et deux soustractions écrites
  // séparément finissent par répondre différemment.
  return {
    factures,
    parStatut,
    ...encoursDe(factures),
    encaisse: somme((f) => f.statut === 'encaissee'),
    recouvrement: recouvrementDe(factures)
  };
}

/**
 * La plus récente en tête, brouillons d'abord.
 *
 * Un brouillon est un travail en cours : il se termine, ou il se jette. Le
 * noyer au milieu de factures émises le fait oublier — et il tient un numéro
 * pendant ce temps.
 */
function parDateDecroissante(
  a: FactureSuivie<Recette>, b: FactureSuivie<Recette>
): number {
  if (a.statut === 'brouillon' && b.statut !== 'brouillon') return -1;
  if (b.statut === 'brouillon' && a.statut !== 'brouillon') return 1;
  return (b.recette.emiseLe ?? '').localeCompare(a.recette.emiseLe ?? '');
}

/* La facture du mois, avant qu'elle existe, vit dans `selecteurs.brouillon` :
   « À faire » la lit au démarrage du Pilote, et ce module-ci emporte les
   mentions et la réédition. Réexportée pour ses lecteurs d'avant. */
export { brouillonsDeFacture } from './selecteurs.brouillon';
