import { type Euros, type Ratio, euros, ratio } from '../types';
import type { ContexteDepenses, Depense, TvaDepense } from './depenses';

/*
 * Isolées de `depenses.ts` pour le paquet d'entrée : la provision de TVA,
 * calculée au premier rendu, retranche la TVA déductible des dépenses payées
 * (lot 4). Importer la règle depuis `depenses.ts` y tirait tout le module —
 * résumés, rapprochement, libellés des motifs — qu'aucun écran du premier
 * rendu n'emploie. Une seule règle de déductibilité, deux lecteurs.
 */

/** Part de TVA contenue dans un montant TTC. */
export function tvaContenue(montantTtc: Euros, taux: Ratio): Euros {
  if (taux <= 0) return euros(0);
  return euros(montantTtc - montantTtc / (1 + taux));
}

/**
 * TVA d'une dépense : ce qui est récupérable, ce qui ne l'est pas et pourquoi,
 * et ce qui doit être autoliquidé.
 *
 * L'ordre des conditions n'est pas indifférent. Le régime est vérifié en
 * premier parce qu'il rend la question sans objet : en franchise, l'absence de
 * justificatif n'est pas le motif de non-récupération, et l'annoncer ainsi
 * enverrait l'utilisateur chercher une pièce qui ne changerait rien.
 */
export function tvaDeDepense(depense: Depense, contexte: ContexteDepenses): TvaDepense {
  const brute = tvaContenue(depense.montantTtc, depense.tauxTva);

  // Achat hors de France : l'acheteur autoliquide. La TVA est due ET non
  // déductible pour un assujetti en franchise — c'est ce double effet que
  // l'ancienne application ignorait complètement.
  if (depense.provenance !== 'france') {
    const aAutoliquider = contexte.regimeTva === 'franchise'
      ? tvaContenue(depense.montantTtc, ratio(0.20))
      : brute;
    return {
      recuperable: euros(0),
      motifNonRecuperable: 'autoliquidation',
      aAutoliquider
    };
  }

  if (contexte.regimeTva === 'franchise') {
    return { recuperable: euros(0), motifNonRecuperable: 'franchise', aAutoliquider: euros(0) };
  }

  if (depense.tauxTva <= 0) {
    return { recuperable: euros(0), motifNonRecuperable: 'taux_nul', aAutoliquider: euros(0) };
  }

  // L'invariant central : pas de pièce, pas de récupération.
  if (depense.justificatifId === null) {
    return {
      recuperable: euros(0),
      motifNonRecuperable: 'justificatif_manquant',
      aAutoliquider: euros(0)
    };
  }

  return { recuperable: brute, motifNonRecuperable: null, aAutoliquider: euros(0) };
}
