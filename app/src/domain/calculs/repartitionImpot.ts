import { type DateISO, type Euros, type Mois, euros, mois } from '../types';

/**
 * La provision d'impôt sur le revenu, mois par mois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN MONTANT DU JOUR NE DIT PAS D'OÙ IL VIENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application posait une ligne d'impôt par mois encaissé
 * (`addIRMonthlyProvisions`) : « CA encaissé en mai : 6 000 € HT → 540 € ».
 * La nouvelle ne donnait qu'un total, juste mais muet : un encaissement
 * important en mars et rien depuis, ou douze mois réguliers, produisaient la
 * même phrase. Or c'est la question qu'on se pose en fin de mois, au moment
 * de faire un virement vers l'épargne : « combien aurais-je dû mettre de côté
 * à ce jour ? »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA MÊME RÈGLE QUE LE TOTAL, DÉPLIÉE — PAS UNE SECONDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque mois porte `impôt de l'année projetée × encaissé du mois ÷ CA
 * projeté` : la règle de `provisionImpotRevenu`, appliquée mois par mois.
 * Le cumul se calcule sur l'encaissé cumulé puis s'arrondit, et la part du
 * mois en est la différence : arrondir chaque mois puis additionner ferait
 * dériver le dernier cumul de quelques centimes du total affiché au-dessus.
 *
 * « À garder » retranche les acomptes PRÉLEVÉS à la fin du mois, pas ceux
 * seulement appelés : un acompte appelé et non payé est encore sur le compte,
 * et l'argent qui le réglera doit y rester aussi.
 */

export interface MoisDImpot {
  readonly mois: Mois;
  readonly encaisse: Euros;
  /** L'impôt que l'encaissé du mois ajoute à l'année. */
  readonly impot: Euros;
  /** Les acomptes de l'année prélevés dans le mois. */
  readonly preleve: Euros;
  /** Ce qu'il fallait avoir de côté à la fin du mois, pour cette année. */
  readonly aGarder: Euros;
}

export interface EntreeRepartition {
  readonly annee: number;
  /** Le dernier mois de la répartition : le mois courant. */
  readonly jusquA: Mois;
  readonly impotAnneeProjetee: Euros;
  readonly caProjete: Euros;
  readonly encaissements: readonly { readonly le: DateISO; readonly montant: Euros }[];
  readonly prelevements: readonly { readonly le: DateISO; readonly montant: Euros }[];
}

export function repartitionMensuelleImpot(e: EntreeRepartition): readonly MoisDImpot[] {
  const dernier = e.jusquA.startsWith(`${e.annee}-`) ? Number(e.jusquA.slice(5, 7)) : 12;
  const duMois = (liste: EntreeRepartition['encaissements'], m: Mois) =>
    liste.filter((x) => x.le.startsWith(m)).reduce<number>((s, x) => s + x.montant, 0);

  const lignes: MoisDImpot[] = [];
  let encaisseCumule = 0;
  let impotCumulePrecedent = 0;
  let preleveCumule = 0;
  for (let n = 1; n <= dernier; n += 1) {
    const m = mois(`${e.annee}-${String(n).padStart(2, '0')}`);
    const encaisse = duMois(e.encaissements, m);
    const preleve = duMois(e.prelevements, m);
    encaisseCumule += encaisse;
    preleveCumule += preleve;
    const impotCumule = e.caProjete > 0
      ? Math.round(e.impotAnneeProjetee * encaisseCumule / e.caProjete * 100) / 100
      : 0;
    lignes.push({
      mois: m,
      encaisse: euros(encaisse),
      impot: euros(impotCumule - impotCumulePrecedent),
      preleve: euros(preleve),
      aGarder: euros(Math.max(0, impotCumule - preleveCumule))
    });
    impotCumulePrecedent = impotCumule;
  }
  return lignes;
}
