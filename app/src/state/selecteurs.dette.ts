/**
 * Le détail d'une dette, tel que l'écran le demande.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE À PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ce sélecteur n'est lu qu'à l'ouverture d'une enveloppe — un geste ponctuel,
 * sur un écran déjà différé. Le poser dans `selecteurs.ts`, que le premier
 * rendu emporte en entier, ferait payer son poids à l'ouverture de
 * l'application à qui ne clique jamais une enveloppe. C'est le même motif que
 * `selecteurs.activite`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CONTEXTE VIENT DE LA MÊME SOURCE QUE LES PROVISIONS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Taux de cotisations, fenêtre d'ACRE, périodes URSSAF, taux d'impôt : ce sont
 * exactement les paramètres que `etatArgent` passe à `provisions()`. Les
 * reconstruire autrement ici ferait diverger le détail de son total au premier
 * changement de barème — et l'écran afficherait deux chiffres pour une seule
 * dette, dont on ne saurait lequel croire.
 *
 * L'IMPÔT SUR LE REVENU EST LA SEULE PIÈCE QUI NE SE VENTILE PAS. C'est une
 * dette annuelle du foyer, pas une part d'encaissement : elle n'a pas de mois
 * auquel se rattacher. Elle reste donc dans le total des provisions sans
 * apparaître ligne à ligne, et l'écart entre les deux est exactement elle.
 */

import type { NatureDette } from '../domain/calculs/provisions';
import { type DetailDette, detailDette } from '../domain/calculs/detailDette';
import type { Faits } from './schema';
import {
  moisCourant, periodesUrssafEffectives, provisionIrDe, recettesEncaissees,
  regimeDe, resteAProvisionnerDe, sousAcreLe
} from './selecteurs';
import { tauxImpotEtContributions } from '../domain/bareme';

export function detailDeLaDette(
  faits: Faits,
  nature: NatureDette,
  maintenant: Date = new Date()
): DetailDette {
  const type = faits.entreprise.typeActivite;
  // Le taux du MOIS COURANT, comme `etatArgent` : c'est celui qui s'applique
  // aux encaissements qu'on est en train de provisionner.
  const tauxR = tauxImpotEtContributions(regimeDe(faits), moisCourant(maintenant), type);
  // Un taux refusé vaut zéro ici, comme dans `etatArgent` : on ne fabrique pas
  // de taux, et la ligne d'impôt manquera plutôt que d'être fausse.
  const taux = tauxR.statut === 'refuse' ? 0 : tauxR.valeur;

  return detailDette(
    nature,
    faits.echeances,
    recettesEncaissees(faits),
    { mois: faits.periodesDeclarees },
    {
      typeActivite: type,
      sousAcreLe: sousAcreLe(faits),
      tauxImpotEtContributions: taux,
      impotRevenu: resteAProvisionnerDe(provisionIrDe(faits, maintenant)),
      periodesUrssaf: periodesUrssafEffectives(faits)
    }
  );
}
