import { Montant } from './Montant';
import styles from './Repartition.module.css';

/**
 * Les teintes disponibles.
 *
 * Les trois premières découpent le SOLDE — ce qui n'est pas à vous, le
 * matelas, le reste. Les cinq suivantes découpent la PROVISION par nature de
 * dette, et reprennent les couleurs déjà employées par l'échéancier : une même
 * dette doit avoir la même couleur d'un écran à l'autre, sinon la couleur
 * cesse d'être une information.
 */
export type TonPart =
  | 'provisions' | 'reserve' | 'versable'
  | 'urssaf' | 'tva' | 'impot' | 'cfe' | 'cfp';

export interface PartSolde {
  readonly libelle: string;
  readonly montant: number;
  readonly ton: TonPart;
}

/**
 * « Ton solde n'est pas tout à toi » — la carte de répartition de la spec.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA PHRASE QUE L'APPLICATION EXISTE POUR DIRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le solde bancaire est le chiffre le plus trompeur de la vie d'un
 * indépendant : il contient les cotisations d'un trimestre qu'on n'a pas
 * encore déclaré. Le regarder et se sentir riche, c'est le mécanisme exact du
 * rappel URSSAF qu'on ne peut plus payer.
 *
 * Une barre segmentée dit en une image ce qu'une liste de quatre montants
 * demande de reconstituer : la part qui n'est pas à vous est visible AVANT
 * celle qui l'est.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES SEGMENTS SONT UNE IMAGE, PAS LA DONNÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Sous une certaine part, un segment devient invisible — quelques pixels sur
 * un téléphone. La légende porte donc chaque montant en toutes lettres, et
 * reste la source : la barre ne fait que les mettre en proportion.
 */
export function Repartition(
  { parts, total, deficit }: {
    readonly parts: readonly PartSolde[];
    readonly total: number;
    /**
     * Ce qui manque quand les provisions dépassent le solde.
     *
     * Ce cas n'est pas une nuance d'affichage : l'argent des cotisations a
     * déjà été dépensé. La barre ne peut pas le représenter — elle
     * n'exprime que des parts d'un tout — donc il est dit.
     */
    readonly deficit: number;
  }
) {
  const visibles = parts.filter((p) => p.montant > 0);

  return (
    <div className={styles.repartition}>
      {total > 0 && visibles.length > 0 && (
        <div
          className={styles.barre}
          role="img"
          aria-label={visibles
            .map((p) => `${p.libelle} ${Math.round(p.montant)} euros`)
            .join(', ')}
        >
          {visibles.map((p) => (
            <div
              key={p.libelle}
              className={`${styles.segment} ${styles[p.ton]}`}
              style={{ width: `${(p.montant / total) * 100}%` }}
            />
          ))}
        </div>
      )}

      <ul className={styles.legende}>
        {parts.map((p) => (
          <li key={p.libelle} className={styles.entree}>
            <span className={`${styles.pastille} ${styles[p.ton]}`} aria-hidden="true" />
            <span className={styles.libelle}>{p.libelle}</span>
            <span className={styles.montant}><Montant>{montant(p.montant)}</Montant></span>
          </li>
        ))}
      </ul>

      {deficit > 0 && (
        <p className={styles.deficit}>
          Il manque <strong><Montant>{montant(deficit)}</Montant></strong> pour couvrir les
          provisions&nbsp;: une partie de l’argent dû a déjà été dépensée.
        </p>
      )}
    </div>
  );
}

const montant = (n: number): string =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(n);
