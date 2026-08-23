/**
 * La composition des quatre chiffres de trésorerie, telle que l'écran la lit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE À PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ces compositions ne sont lues qu'au clic sur une tuile — un geste qu'on ne
 * fait pas tous les jours. Les poser dans `selecteurs.ts`, que le premier
 * rendu emporte en entier, ferait payer leur poids à l'ouverture de
 * l'application à qui ne clique jamais une tuile. C'est le même motif que
 * `selecteurs.dette` et `selecteurs.activite`, et il n'est pas théorique : le
 * paquet d'entrée est à quelques centaines d'octets de son plafond, et
 * l'invariant du projet est d'extraire plutôt que de relever le plafond.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES MÊMES SOURCES QUE LES TUILES, OU RIEN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque total vient de `etatPilote` — donc du même appel que celui qui
 * alimente les tuiles — et non d'un second calcul monté ici. Une composition
 * qui ne retomberait pas sur le chiffre qu'elle prétend expliquer serait pire
 * que pas de composition du tout : elle donnerait une raison supplémentaire de
 * ne pas croire l'écran.
 *
 * L'exception apparente est `soldeDerive`, rappelée ici pour ses PARTS. C'est
 * le même appel que celui de `solde()`, aux mêmes arguments — pas une seconde
 * règle : les parts et le montant sortent ensemble de la même fonction, et
 * leur somme signée est le montant par construction.
 */

import type { CleComposition, Composition } from '../domain/calculs/composition';
import {
  compositionDisponible, compositionProvisions, compositionSolde, compositionVersable
} from '../domain/calculs/composition';
import { provisions as calculerProvisions } from '../domain/calculs/provisions';
import { soldeDerive } from '../domain/calculs/solde';
import { tauxImpotEtContributions } from '../domain/bareme';
import type { Faits } from './schema';
import {
  etatPilote, moisCourant, periodesUrssafEffectives, provisionIrDe, recettesEncaissees,
  regimeDe, resteAProvisionnerDe, sousAcreLe
} from './selecteurs';

export function compositionDe(
  faits: Faits,
  cle: CleComposition,
  maintenant: Date = new Date()
): Composition {
  const etat = etatPilote(faits, faits.echeances, maintenant);

  switch (cle) {
    case 'solde': {
      // Le même appel que `solde()`, aux mêmes arguments : les parts et le
      // montant sortent ensemble, et leur somme signée EST le montant. Reprendre
      // `etat.tresorerie.solde` en face de parts calculées à part aurait rouvert
      // la porte à deux chiffres pour une seule notion.
      const detaille = soldeDerive(
        faits.soldeInitial, faits.soldeInitialAu,
        recettesEncaissees(faits), faits.depenses, faits.echeances,
        faits.mouvementsBancaires
      );
      return compositionSolde(detaille.parts, detaille.montant, faits.soldeInitialAu);
    }

    case 'provisions':
      return compositionProvisions(detailProvisionsDe(faits, maintenant));

    case 'disponible':
      return compositionDisponible(
        etat.tresorerie.solde, etat.tresorerie.provisions, etat.tresorerie.dispo
      );

    case 'versable':
      return compositionVersable(
        etat.tresorerie.dispo, etat.tresorerie.reserve, etat.tresorerie.versable
      );
  }
}

/**
 * Le détail des provisions, au contexte que `etatPilote` monte lui-même.
 *
 * `EtatPilote` ne rend que le total, les deux volets et la ventilation — pas
 * l'objet `DetailProvisions` complet, dont la composition a besoin pour ses
 * réserves (encaissements non calculables, impôt non provisionné). Le
 * contexte est reconstruit à l'identique plutôt qu'approximé : le reconstruire
 * autrement ferait diverger la composition de son total au premier changement
 * de barème.
 */
function detailProvisionsDe(faits: Faits, maintenant: Date) {
  const m = moisCourant(maintenant);
  const type = faits.entreprise.typeActivite;
  const tauxR = tauxImpotEtContributions(regimeDe(faits), m, type);

  return calculerProvisions(
    faits.echeances,
    recettesEncaissees(faits),
    { mois: faits.periodesDeclarees },
    {
      typeActivite: type,
      sousAcreLe: sousAcreLe(faits),
      // Un taux refusé vaut zéro ici, comme dans `etatPilote` : on ne fabrique
      // pas de taux, et la réserve dira que le total est sous-évalué.
      tauxImpotEtContributions: tauxR.statut === 'refuse' ? 0 : tauxR.valeur,
      impotRevenu: resteAProvisionnerDe(provisionIrDe(faits, maintenant)),
      periodesUrssaf: periodesUrssafEffectives(faits)
    }
  );
}
