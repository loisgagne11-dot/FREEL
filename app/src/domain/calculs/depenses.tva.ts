import { TAUX_TVA_NORMAL } from '../bareme/tva';
import { type Euros, type Ratio, euros } from '../types';
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

  // Achat hors de France : l'acheteur autoliquide. En franchise, la TVA est
  // due ET non déductible — double effet que l'ancienne application ignorait.
  // Le prestataire facture HORS TAXE : la TVA due est base × 20 % (art. 283-2
  // CGI), pas la part « contenue » dans un TTC. Extraire 20 % d'un montant
  // pris pour un TTC donnait 1/6 au lieu de 1/5 : 16,67 € pour 100 € facturés,
  // 20 € dus. Sources : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051214570
  // et https://www.impots.gouv.fr/professionnel/questions/je-suis-micro-entrepreneur-ou-la-tete-dune-micro-entreprise-ai-je-des
  // (vérifiées le 2026-11-07).
  if (depense.provenance !== 'france') {
    const aAutoliquider = contexte.regimeTva === 'franchise'
      ? euros(depense.montantTtc * TAUX_TVA_NORMAL.taux)
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

/**
 * Base hors taxe d'un achat autoliquidé — la ligne que la déclaration reçoit
 * avec la TVA due.
 *
 * Elle vit ici, à côté de `tvaDeDepense`, parce que les deux se répondent :
 * en franchise le prestataire facture hors taxe, la base est le montant payé
 * et la TVA due en est 20 % ; chez un redevable le montant est lu comme un
 * TTC et la TVA due en est la part contenue, donc base = TTC − TVA due.
 * Recalculée à côté, la base cesserait un jour de valoir « TVA due / taux ».
 */
export function baseHtAutoliquidee(depense: Depense, contexte: ContexteDepenses): Euros {
  if (contexte.regimeTva === 'franchise') return depense.montantTtc;
  return euros(depense.montantTtc - tvaDeDepense(depense, contexte).aAutoliquider);
}
