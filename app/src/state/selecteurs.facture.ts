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
  type RegimeFacture, type TotauxFacture,
  amendeMentions, mentionsAPorter, mentionsManquantes, regimeDeLaFacture, totaux
} from '../domain/calculs/facture';
import { prochainNumero } from '../domain/calculs/livreRecettes';
import {
  DELAI_PAIEMENT_DEFAUT, type FactureSuivie, type StatutFacture,
  encoursDe, suivre
} from '../domain/calculs/facturier';
import { dansLaPeriode, type Periode } from '../domain/calculs/periode';
import type { DateISO, Euros } from '../domain/types';
import { euros } from '../domain/types';
import type { Client, Faits, Recette } from './schema';

/** L'émetteur, tel qu'il doit figurer sur une facture. */
export function emetteurDe(faits: Faits): Emetteur {
  const e = faits.entreprise;
  return {
    nom: e.nom,
    siret: e.siret,
    adresse: e.adresse,
    codePostal: e.codePostal,
    ville: e.ville,
    tvaIntracom: e.tvaIntracom,
    // La franchise se déduit de l'absence de mois d'assujettissement : c'est
    // le même fait qui commande la TVA déductible des dépenses, et deux
    // sources se contrediraient.
    enFranchise: e.tvaDepuis === null,
    // Ils existaient au schéma et n'atteignaient jamais le document : la
    // facture partait sans dire où payer.
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
    delaiPaiementJours: client.delaiPaiementJours
  };
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
  const delais = new Map(faits.clients.map((c) => [c.nom, c.delaiPaiementJours]));
  const aujourdhui = maintenant.toISOString().slice(0, 10) as DateISO;

  const toutes = suivre(
    faits.recettes,
    (nom) => delais.get(nom) ?? DELAI_PAIEMENT_DEFAUT,
    aujourdhui
  );

  const factures = toutes
    .filter((f) => f.statut === 'brouillon' || dansLaPeriode(f.recette.emiseLe, periode))
    .sort(parDateDecroissante);

  const parStatut: Record<StatutFacture, number> = {
    brouillon: 0, emise: 0, en_retard: 0, encaissee: 0, annulee: 0, annulation: 0
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
    encaisse: somme((f) => f.statut === 'encaissee')
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
