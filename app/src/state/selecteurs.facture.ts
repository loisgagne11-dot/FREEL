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
import type { Euros } from '../domain/types';
import type { Client, Faits } from './schema';

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
    enFranchise: e.tvaDepuis === null
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
