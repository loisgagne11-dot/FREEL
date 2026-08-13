import type { Euros, Mois, Ratio, Resolution, TypeActivite } from '../types';
import { euros } from '../types';
import { irParTranches, tauxVersementLiberatoire, tranchesIR } from '../bareme/impot';
import { revenuApresAbattement } from '../bareme/abattement';

/**
 * Versement libératoire ou barème progressif ?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE SEUL ARBITRAGE DU PROJET QUI PORTE UNE DATE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'option pour le versement libératoire s'exerce avant le **30 septembre**
 * de l'année N pour s'appliquer à l'année N+1. Passée cette date, le choix
 * est fait pour douze mois, quel que soit ce qu'on découvre ensuite.
 *
 * C'est la raison d'être de ce module : mettre les deux montants côte à côte
 * pendant qu'il est encore temps de choisir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL COMPARE, ET CE QU'IL NE SAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le versement libératoire est un pourcentage du CHIFFRE D'AFFAIRES : il se
 * paie même sans bénéfice, et il ignore la situation du foyer. Le barème
 * s'applique au revenu APRÈS abattement, dans un foyer qui a ses propres
 * revenus et ses propres parts.
 *
 * On ne peut donc pas comparer « l'impôt de l'activité » d'un côté à un taux
 * de l'autre : il faut mesurer ce que l'activité AJOUTE à l'impôt du foyer —
 * l'impôt avec elle, moins l'impôt sans elle. C'est ce surcroît qui se
 * compare aux 2,2 %.
 *
 * Trois simplifications sont assumées, et l'écran les dit :
 *
 *   · pas de décote, qui allège l'impôt des revenus modestes — le barème est
 *     donc SURESTIMÉ en bas de l'échelle, au désavantage du barème ;
 *   · pas de plafonnement du quotient familial, qui le renchérit pour les
 *     foyers aisés à plusieurs parts — le barème est donc SOUS-estimé en
 *     haut ;
 *   · aucune réduction ni crédit d'impôt.
 *
 * Le sens de chaque écart est donné parce qu'il change la lecture : un
 * résultat serré ne se tranche pas sur ces chiffres seuls.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE CONDITION QUE CE MODULE NE VÉRIFIE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'option n'est ouverte que si le revenu fiscal de référence du foyer, deux
 * ans plus tôt, ne dépasse pas un plafond. Ce plafond est un nombre officiel
 * daté que l'application ne porte pas — et l'invariant n°1 interdit de
 * l'écrire au jugé. Le comparateur rend donc l'arithmétique, jamais
 * l'éligibilité, et l'écran doit le dire.
 */

export interface FoyerFiscal {
  /** Nombre de parts. 1 pour un célibataire sans enfant, 2 pour un couple… */
  readonly parts: number;
  /**
   * Revenu imposable du foyer HORS cette activité — salaire du conjoint,
   * revenus fonciers…
   *
   * C'est lui qui décide de la tranche où le revenu de l'activité vient
   * s'empiler, et donc du taux réellement supporté. L'ignorer reviendrait à
   * comparer les 2,2 % à un impôt calculé comme si l'activité était le seul
   * revenu du foyer — c'est-à-dire à toujours conclure en faveur du barème.
   */
  readonly autresRevenus: Euros;
}

export interface Comparaison {
  /** Impôt dû au titre de l'activité, en versement libératoire. */
  readonly versementLiberatoire: Euros;
  readonly tauxVl: Ratio;
  /** Surcroît d'impôt du foyer imputable à l'activité, au barème. */
  readonly bareme: Euros;
  /** Revenu de l'activité après abattement, l'assiette du barème. */
  readonly revenuApresAbattement: Euros;
  /**
   * Écart, positif quand le versement libératoire coûte PLUS.
   *
   * Le signe est celui de la question posée — « est-ce que le VL me coûte
   * plus cher ? » — et non l'inverse : une économie affichée en négatif se
   * lit à contresens une fois sur deux.
   */
  readonly ecart: Euros;
  /** Ce qui est le moins cher, ou `null` à égalité stricte. */
  readonly avantage: 'versement_liberatoire' | 'bareme' | null;
}

/**
 * Compare les deux régimes sur un chiffre d'affaires annuel.
 *
 * Rend un `Resolution` : si le barème ou le taux ne couvrent pas la période,
 * on REFUSE plutôt que d'avancer un chiffre. Un arbitrage qui engage douze
 * mois ne se prend pas sur une extrapolation silencieuse.
 */
export function comparerRegimes(
  caAnnuel: Euros,
  m: Mois,
  type: TypeActivite,
  foyer: FoyerFiscal
): Resolution<Comparaison> {
  const tauxR = tauxVersementLiberatoire(m, type);
  if (tauxR.statut === 'refuse') return tauxR;

  const revenuR = revenuApresAbattement(caAnnuel, m, type);
  if (revenuR.statut === 'refuse') return revenuR;

  const tranchesR = tranchesIR(m);
  if (tranchesR.statut === 'refuse') return tranchesR;

  const vl = euros(caAnnuel * tauxR.valeur);
  const tranches = tranchesR.valeur;

  // Le surcroît : l'impôt du foyer AVEC l'activité, moins celui SANS elle.
  const parts = Math.max(1, foyer.parts);
  const sans = irDuFoyer(foyer.autresRevenus, parts, tranches);
  const avec = irDuFoyer(euros(foyer.autresRevenus + revenuR.valeur), parts, tranches);
  const bareme = euros(Math.max(0, avec - sans));

  const ecart = euros(vl - bareme);
  const valeur: Comparaison = {
    versementLiberatoire: vl,
    tauxVl: tauxR.valeur,
    bareme,
    revenuApresAbattement: revenuR.valeur,
    ecart,
    avantage: ecart === 0 ? null : (ecart > 0 ? 'bareme' : 'versement_liberatoire')
  };

  // L'hypothèse se propage : si l'un des trois éléments est extrapolé, le
  // résultat l'est. Le taire ferait passer une projection pour un fait.
  const hypothese = [tauxR, revenuR, tranchesR].find((r) => r.statut === 'hypothese');
  if (hypothese !== undefined && hypothese.statut === 'hypothese') {
    return {
      statut: 'hypothese',
      valeur,
      source: hypothese.source,
      verifieLe: hypothese.verifieLe,
      depuis: hypothese.depuis
    };
  }

  return {
    statut: 'publie', valeur, source: tauxR.source, verifieLe: tauxR.verifieLe
  };
}

/**
 * L'impôt d'un foyer, par quotient familial.
 *
 * Le revenu est divisé par les parts, le barème s'applique au quotient, et le
 * résultat est remultiplié. Sans plafonnement du quotient ni décote — voir
 * l'en-tête : les deux écarts jouent en sens contraire, et l'écran les dit.
 */
function irDuFoyer(revenu: Euros, parts: number, tranches: Parameters<typeof irParTranches>[1]): number {
  if (revenu <= 0) return 0;
  return irParTranches(euros(revenu / parts), tranches) * parts;
}
