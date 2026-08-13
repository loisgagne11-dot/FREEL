import { Info } from './Info';
import { eur, moisTexte } from '../format';
import styles from './SanteCard.module.css';

export type EtatIndicateur = 'bon' | 'attention' | 'alerte';

export interface Indicateur {
  readonly libelle: string;
  readonly valeur: string;
  readonly etat: EtatIndicateur;
}

/**
 * « Santé société » — la carte de synthèse du Pilote dans la spec de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'Y A PAS DE SCORE SUR 100
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La maquette affiche « 78/100 », décomposé en 28/30, 20/35 et 30/35. La spec
 * le relève elle-même : ces valeurs sont **écrites en dur dans le HTML**, et
 * aucune fonction ne les calcule nulle part.
 *
 * Il aurait fallu inventer la formule : quel poids pour les provisions, pour
 * les impayés, pour les déclarations ? Chaque réponse est défendable, aucune
 * n'est vérifiable, et le résultat serait un chiffre d'apparence officielle
 * que personne n'a validé. Un « 78/100 » se retient et se compare d'un mois
 * sur l'autre — c'est-à-dire qu'il commande des décisions.
 *
 * Les trois indicateurs, eux, sont vrais et se lisent directement : les
 * provisions sont couvertes ou non, il y a des impayés ou non, des périodes
 * en retard ou non. On perd la satisfaction d'une note ; on gagne de ne rien
 * affirmer qu'on ne puisse démontrer.
 */
export function SanteCard(
  { indicateurs, autonomie }: {
    readonly indicateurs: readonly Indicateur[];
    /** Mois d'autonomie, ou `null` quand le besoin mensuel n'est pas renseigné. */
    readonly autonomie: number | null;
  }
) {
  return (
    <section className={styles.carte} aria-labelledby="titre-sante">
      <header className={styles.entete}>
        <h2 id="titre-sante" className={styles.titreCarte}>
          Santé
          <Info libelle="Pourquoi aucune note globale">
            La maquette affichait un score sur 100. Il aurait fallu en inventer
            la formule&nbsp;: quel poids donner aux provisions, aux impayés, aux
            déclarations&nbsp;? Chaque réponse est défendable, aucune n’est
            vérifiable — et une note se retient, se compare, puis commande des
            décisions. Les trois constats ci-dessous, eux, se démontrent.
          </Info>
        </h2>
        <p className={styles.autonomie}>
          {autonomie === null
            ? 'Autonomie inconnue'
            : `${moisTexte(autonomie)} d’autonomie`}
        </p>
      </header>

      <ul className={styles.indicateurs}>
        {indicateurs.map((i) => (
          <li key={i.libelle} className={styles.indicateur}>
            <span className={`${styles.pastille} ${styles[i.etat]}`} aria-hidden="true" />
            <span className={styles.libelle}>{i.libelle}</span>
            <span className={styles.valeur}>{i.valeur}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Les trois constats, tirés des faits.
 *
 * Aucun seuil n'est inventé ici : « couvertes » signifie que le disponible
 * n'est pas négatif, « à jour » qu'aucune période déclarable ne traîne. Ce
 * sont des états binaires observables, pas des appréciations.
 */
export function indicateursDeSante(
  { dispo, provisions, impayes, montantImpaye, periodesEnRetard }: {
    readonly dispo: number;
    readonly provisions: number;
    readonly impayes: number;
    readonly montantImpaye: number;
    readonly periodesEnRetard: number;
  }
): readonly Indicateur[] {
  return [
    {
      libelle: 'Provisions couvertes',
      valeur: provisions === 0
        ? 'rien à provisionner'
        : dispo >= 0 ? `${eur(provisions)} de côté` : `il manque ${eur(-dispo)}`,
      etat: provisions === 0 ? 'bon' : dispo >= 0 ? 'bon' : 'alerte'
    },
    {
      libelle: 'Factures',
      valeur: impayes === 0
        ? 'aucun impayé'
        : `${impayes} en attente · ${eur(montantImpaye)}`,
      etat: impayes === 0 ? 'bon' : 'attention'
    },
    {
      libelle: 'Déclarations',
      valeur: periodesEnRetard === 0
        ? 'à jour'
        : `${periodesEnRetard} période${periodesEnRetard > 1 ? 's' : ''} en retard`,
      etat: periodesEnRetard === 0 ? 'bon' : 'alerte'
    }
  ];
}
