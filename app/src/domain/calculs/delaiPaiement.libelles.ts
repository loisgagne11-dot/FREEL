import type { FormuleDelai } from './delaiPaiement';

/**
 * Comment les conditions de paiement se DISENT, et ce que la loi en pense.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS DANS `delaiPaiement.ts`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le calcul d'échéance est tiré dans le paquet d'entrée par le schéma : la
 * migration en a besoin au chargement. Les libellés et les mentions légales,
 * eux, ne servent qu'aux écrans de saisie, qui sont chargés à la demande.
 *
 * La coupure suit donc le sens autant que le budget : d'un côté ce qui
 * CALCULE une date, de l'autre ce qui la NOMME. Le paquet d'entrée franchissait
 * son plafond de cent-dix octets, et la règle du projet est d'extraire ce qui
 * n'a pas à voyager avec le reste plutôt que de relever le plafond.
 */

/**
 * Les formules, dans l'ordre où la liste déroulante les propose.
 *
 * Elle vit ici et non avec le calcul : seule la SAISIE a besoin d'énumérer,
 * et la saisie est chargée à la demande. Le calcul, lui, reconnaît une formule
 * par son motif.
 */
export const FORMULES_DELAI: readonly FormuleDelai[] = [
  'reception',
  'net_30', 'net_45', 'net_60',
  'fdm_30', 'fdm_45', 'fdm_60',
  'fin_de_mois_plus_30', 'fin_de_mois_plus_45'
];

const LIBELLES: Readonly<Record<FormuleDelai, string>> = {
  reception: 'Paiement à réception',
  net_30: '30 jours nets',
  net_45: '45 jours nets',
  net_60: '60 jours nets',
  fdm_30: '30 jours fin de mois',
  fdm_45: '45 jours fin de mois',
  fdm_60: '60 jours fin de mois',
  fin_de_mois_plus_30: 'Fin de mois + 30 jours',
  fin_de_mois_plus_45: 'Fin de mois + 45 jours'
};

/**
 * Le libellé lisible d'une formule.
 *
 * Une seule source : la liste déroulante et la facture imprimée s'en servent
 * toutes deux. Deux libellés concurrents pour la même formule finiraient par
 * diverger, et le client lirait sur le document autre chose que ce qui a été
 * saisi.
 */
export function libelleDelai(formule: FormuleDelai): string {
  return LIBELLES[formule];
}

/**
 * Ce qu'une formule dépasse, ou `null` si elle tient dans la loi.
 *
 * L'article L441-10 du code de commerce plafonne le délai convenu à soixante
 * jours nets à compter de l'émission, ou quarante-cinq jours fin de mois.
 *
 * On CONSTATE, on ne refuse pas : il arrive de signer ce qu'on n'a pas choisi,
 * et une application qui interdirait de saisir ses conditions réelles
 * obligerait à mentir sur ses propres factures. Le dire au moment de la saisie
 * est en revanche une information qui sert quand on négocie.
 */
export function depassementLegal(formule: FormuleDelai): string | null {
  if (formule === 'fdm_60') {
    return 'Au-delà du plafond légal : 45 jours fin de mois au maximum '
      + '(art. L441-10 du code de commerce).';
  }
  if (formule === 'fin_de_mois_plus_45') {
    return 'Au-delà du plafond légal : une échéance « fin de mois + 45 jours » '
      + 'dépasse les 45 jours fin de mois autorisés '
      + '(art. L441-10 du code de commerce).';
  }
  return null;
}

