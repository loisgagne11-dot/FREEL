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
 * auquel se rattacher. Elle ne s'affiche donc pas ligne à ligne mais dans un
 * bloc à part (`DetailDette.impotRevenu`), lu de `impotRevenuAProvisionner` —
 * la fonction même que le versable appelle. Quand le détail la taisait,
 * l'écart avec la vignette était exactement elle, et rien ne le disait.
 */

import { moisDeclares } from '../domain/calculs/declarations.declarees';
import type { NatureDette, VentilationProvisions } from '../domain/calculs/provisions';
import { type Euros, type Resolution, euros } from '../domain/types';
import { type DetailDette, detailDette } from '../domain/calculs/detailDette';
import type { Faits } from './schema';
import {
  echeancesDuComptePro, etatPilote, impotRevenuAProvisionner, moisCourant, tvaAReverserDe, tvaDesDepensesPayees,
  periodesUrssafEffectives, recettesEncaissees,
  regimeDe, sousAcreLe
} from './selecteurs';
import { tauxImpotEtContributions } from '../domain/bareme';
import { AUTOLIQUIDATION_TVA } from '../domain/bareme/tva';

/* La part autoliquidée de la provision de TVA vivait dans `selecteurs.ts`,
   donc au premier rendu, pour le seul détail de la dette qui la lit. Le
   paquet d'entrée a franchi son plafond au lot 34-bis : elle a rejoint son
   lecteur. */

/**
 * La part de la provision de TVA qui vient d'achats autoliquidés, pour la dire
 * à l'écran — `null` quand il n'y en a pas, ou plus.
 *
 * Plafonnée à la provision elle-même : un « dont » ne peut pas dépasser son
 * total, et quand des échéances payées ont réglé une partie seulement, on ne
 * sait pas laquelle des deux TVA elles ont réglée. Afficher les 20 € quand il
 * ne reste que 5 € provisionnés serait annoncer une somme que rien ne retient.
 *
 * Une `hypothese`, jamais un `publie` : le montant est sûr, la date de dépôt
 * ne l'est pas, et aucune échéance n'est inventée.
 */
export function tvaAutoliqueeProvisionnee(
  faits: Faits,
  maintenant: Date = new Date()
): Resolution<Euros> | null {
  const part = Math.min(tvaDesDepensesPayees(faits).autoliquidee, tvaAReverserDe(faits));
  if (part <= 0) return null;
  return {
    statut: 'hypothese',
    valeur: euros(part),
    source: AUTOLIQUIDATION_TVA.source,
    verifieLe: AUTOLIQUIDATION_TVA.verifieLe,
    depuis: moisCourant(maintenant)
  };
}

/**
 * « Reste à sortir » : tout ce qui est sur le compte et dû à quelqu'un d'autre
 * — cotisations URSSAF et CFP, TVA, impôt sur le revenu, CFE —, appelé ou
 * couru (décision 8). LA source unique : le total de provisions du Pilote et
 * sa ventilation, que lisent la vignette des enveloppes, la composition et le
 * détail de la dette. Rien ne le recalcule ailleurs.
 */
export function resteASortir(
  faits: Faits, maintenant: Date = new Date()
): { readonly total: Euros; readonly parNature: VentilationProvisions } {
  const pilote = etatPilote(faits, faits.echeances, maintenant);
  return { total: pilote.tresorerie.provisions, parNature: pilote.provisionsParNature };
}

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
    // Les mêmes échéances que la source : l'impôt réglé depuis le compte
    // personnel n'y est pas, il n'a rien à faire dans le détail non plus.
    echeancesDuComptePro(faits),
    recettesEncaissees(faits),
    { mois: moisDeclares(faits.periodesDeclarees) },
    {
      typeActivite: type,
      sousAcreLe: sousAcreLe(faits),
      debutActivite: faits.entreprise.debutActivite,
      tauxImpotEtContributions: taux,
      impotRevenu: impotRevenuAProvisionner(faits, maintenant),
      tvaAReverser: tvaAReverserDe(faits),
      tvaAutoliquidee: tvaAutoliqueeProvisionnee(faits, maintenant),
      periodesUrssaf: periodesUrssafEffectives(faits)
    },
    resteASortir(faits, maintenant).parNature[nature]
  );
}
