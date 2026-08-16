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
import { prochainNumero } from '../domain/calculs/ecritureRecette';
import {
 type FactureSuivie, type StatutFacture,
  encoursDe, suivre
} from '../domain/calculs/facturier';
import { dansLaPeriode, type Periode } from '../domain/calculs/periode';
import type { DateISO, Euros } from '../domain/types';
import { euros } from '../domain/types';
import type { Client, Faits, Recette } from './schema';
import type { Mois } from '../domain/types';
import {
  type BrouillonDeFacture, type LigneDeBrouillon, brouillonsDuMois
} from '../domain/calculs/brouillon';
import { previsionDuMoisParMission } from './selecteurs.activite';
import {
  FORMULE_PAR_DEFAUT, echeanceDe
} from '../domain/calculs/delaiPaiement';

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
    delaiPaiement: client.delaiPaiement
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
  /* Secours : l'échéance manque sur la recette (bloc écrit à la main, jeu
     d'essai). On la reconstruit depuis les conditions actuelles du client —
     faute de mieux, et sans l'écrire nulle part. */
  const formules = new Map(faits.clients.map((c) => [c.nom, c.delaiPaiement]));
  const secours = (nom: string, emiseLe: DateISO) =>
    echeanceDe(emiseLe, formules.get(nom) ?? FORMULE_PAR_DEFAUT);
  const aujourdhui = maintenant.toISOString().slice(0, 10) as DateISO;

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

/* ─────────────────────────────────────────────────────────────────────────
   La facture du mois, avant qu'elle existe
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Les brouillons de facture du mois, dérivés du planning.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IL SUIT L'ACTIVITÉ PARCE QU'IL N'EN EST PAS SÉPARÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « La facture du mois en cours est créée en brouillon et se met à jour en
 * fonction de mes modifications d'Activité. » Un brouillon enregistré serait
 * juste à l'instant de sa création puis faux dès la première journée corrigée,
 * et il faudrait le resynchroniser — c'est-à-dire réécrire un fait à partir
 * d'un calcul, ce que cette application s'interdit partout ailleurs.
 *
 * Celui-ci n'est stocké nulle part. Il vient du même planning que le CRA et
 * que la prévision, ce qui garantit que les trois disent le même nombre de
 * journées : une facture qui ne collerait pas au compte rendu signé est
 * exactement le document qu'on ne veut pas envoyer.
 *
 * Les journées valorisées sont les journées RETENUES — ajustements compris —
 * et non les journées prévues : on facture ce qui a été fait.
 */
export function brouillonsDeFacture(
  faits: Faits,
  m: Mois
): readonly BrouillonDeFacture[] {
  const parMission = new Map(faits.missions.map((mi) => [mi.id, mi]));

  const lignes: LigneDeBrouillon[] = previsionDuMoisParMission(faits, m)
    .map((p) => ({
      missionId: p.missionId,
      entiteId: p.entiteId,
      libelle: p.libelle,
      // Le client qui REÇOIT la facture, et non celui chez qui l'on travaille :
      // une mission passée par une agence a les deux, et c'est l'agence qui paie.
      clientNom: parMission.get(p.missionId)?.clientNom ?? '',
      jours: p.prevision.joursRetenus,
      montant: p.prevision.montantRetenu
    }))
    .filter((l) => l.clientNom !== '');

  return brouillonsDuMois(m, lignes, facturesEmisesDuMois(faits, m));
}

/**
 * Les factures déjà émises ce mois-là, par client.
 *
 * Sert à marquer un brouillon plutôt qu'à le supprimer : voir côte à côte ce
 * qui a été facturé et ce que le planning compte est la seule façon de
 * remarquer un écart avant que le client le remarque.
 *
 * La date retenue est celle d'ÉMISSION : c'est celle que porte le document, et
 * celle qu'on a en tête en cherchant « la facture de juin ».
 */
function facturesEmisesDuMois(faits: Faits, m: Mois): ReadonlyMap<string, string> {
  const parClient = new Map<string, string>();
  for (const r of faits.recettes) {
    if (r.emiseLe === null || !r.emiseLe.startsWith(m)) continue;
    if (typeof r.annuleEcriture === 'string') continue;
    if (!parClient.has(r.clientNom)) parClient.set(r.clientNom, r.numero);
  }
  return parClient;
}
