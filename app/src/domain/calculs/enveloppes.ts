import type { DateISO, Euros } from '../types';
import { euros } from '../types';
import type { Echeance, NatureDette, VentilationProvisions } from './provisions';
import { NATURES_DETTE } from './provisions';

/**
 * Les enveloppes de provision : ce qui est dû par nature, et ce que le compte
 * en couvre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME QUE CE MODULE TRANCHE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le dessin met sur chaque vignette « 1 980 € / 1 980 € » — un montant mis de
 * côté, face au montant dû. Or **aucun fait ne dit qu'un euro du compte est
 * affecté à l'URSSAF plutôt qu'à la TVA**. L'argent est fongible ; il n'y a
 * qu'un solde, et plusieurs dettes.
 *
 * Trois réponses possibles, dont deux mauvaises :
 *
 *  1. **Inventer une affectation** — au prorata, par exemple. C'est le chiffre
 *     plausible et faux que ce projet s'interdit : à 60 % de couverture, chaque
 *     enveloppe afficherait « 60 % » et aucune ne dirait laquelle ne passera
 *     pas. Or elles ne tombent pas le même jour.
 *  2. **Ne rien afficher** — et perdre la seule question qui compte devant une
 *     enveloppe : « si celle-là tombe, est-ce que je peux la payer ? »
 *  3. **Poser une règle, et l'écrire.** C'est ce qui est fait ici.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE : L'ÉCHÉANCE LA PLUS PROCHE EST SERVIE D'ABORD
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le solde est affecté aux natures dans l'ordre de leur prochaine échéance. Ce
 * n'est pas un choix esthétique : c'est ce qui se passera réellement. Le 5
 * juillet, l'URSSAF prélève ; ce qui reste après elle est ce dont disposera
 * l'échéance suivante. Une répartition au prorata décrirait un monde où toutes
 * les dettes tombent en même temps, ce qui n'arrive jamais.
 *
 * Conséquence voulue, et c'est tout l'intérêt : sur un compte insuffisant, les
 * premières enveloppes sont **pleines** et les dernières **vides**. On voit
 * alors laquelle ne passera pas, et il reste le temps d'y faire quelque chose.
 * Un prorata aurait montré quatre enveloppes à moitié pleines, c'est-à-dire
 * quatre problèmes également flous.
 *
 * Une nature dont rien n'est encore appelé n'a pas d'échéance : elle passe en
 * dernier. C'est juste — une dette sans date n'a pas de date, et rien
 * n'obligera à la payer avant celles qui en ont une.
 */

export interface EnveloppeProvision {
  readonly nature: NatureDette;
  /** Total dû sur cette nature : appelé ou non. */
  readonly du: Euros;
  /**
   * Ce que le solde couvre sur cette enveloppe, l'échéance la plus proche
   * servie d'abord. Jamais supérieur à `du`.
   */
  readonly couvert: Euros;
  /** La part de `du` que l'administration a déjà appelée, avec une date. */
  readonly appele: Euros;
  /** La prochaine date à laquelle cette nature sort du compte, si elle existe. */
  readonly prochaineEcheance: DateISO | null;
}

/**
 * Ce qui est dû par nature, et ce que le compte en couvre.
 *
 * Rend TOUTES les natures, y compris celles à zéro : le dessin en montre quatre
 * côte à côte, et une vignette qui disparaît quand son montant tombe à zéro
 * décale les autres d'une case. Une enveloppe vide se lit très bien ; une
 * enveloppe qui a bougé de place ne se lit plus.
 *
 * L'appelant décide lesquelles montrer — c'est une question de place à l'écran,
 * pas de vérité.
 */
export function enveloppesDeProvision(
  solde: Euros,
  parNature: VentilationProvisions,
  echeances: readonly Echeance[]
): readonly EnveloppeProvision[] {
  const impayees = echeances.filter((e) => e.payeeLe === null);

  const prochaine = new Map<NatureDette, DateISO>();
  const appele = new Map<NatureDette, number>();
  for (const e of impayees) {
    // `montantPaye` est optionnel avant le schéma qui l'a introduit : un bloc
    // ancien le porte à `null`, et « montant − null » vaut le montant en
    // JavaScript par coïncidence, pas par intention.
    const reste = Math.max(0, e.montant - (e.montantPaye ?? 0));
    appele.set(e.nature, (appele.get(e.nature) ?? 0) + reste);

    const deja = prochaine.get(e.nature);
    if (deja === undefined || e.echeanceLe < deja) prochaine.set(e.nature, e.echeanceLe);
  }

  /*
   * L'ordre de service. Une nature sans échéance passe après toutes celles qui
   * en ont une : `null` est comparé comme « après le dernier », et non comme
   * une date vide qui remonterait en tête.
   */
  const ordre = [...NATURES_DETTE].sort((a, b) => {
    const da = prochaine.get(a);
    const db = prochaine.get(b);
    if (da === undefined && db === undefined) return 0;
    if (da === undefined) return 1;
    if (db === undefined) return -1;
    return da < db ? -1 : da > db ? 1 : 0;
  });

  let disponible = Math.max(0, solde);
  const couverture = new Map<NatureDette, number>();
  for (const nature of ordre) {
    const du = parNature[nature];
    const couvert = Math.min(du, disponible);
    couverture.set(nature, couvert);
    disponible -= couvert;
  }

  // Rendu dans l'ordre canonique des natures, pas dans l'ordre de service : les
  // vignettes ne doivent pas changer de place d'un mois à l'autre parce qu'une
  // échéance est passée.
  return NATURES_DETTE.map((nature) => ({
    nature,
    du: parNature[nature],
    couvert: euros(couverture.get(nature) ?? 0),
    appele: euros(Math.min(appele.get(nature) ?? 0, parNature[nature])),
    prochaineEcheance: prochaine.get(nature) ?? null
  }));
}
