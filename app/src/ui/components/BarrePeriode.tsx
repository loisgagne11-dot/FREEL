import type { Granularite, Periode } from '../../domain/calculs/periode';
import styles from './BarrePeriode.module.css';

const CHOIX: readonly { readonly id: Granularite; readonly libelle: string }[] = [
  { id: 'mois', libelle: 'Mois' },
  { id: 'trimestre', libelle: 'Trimestre' },
  { id: 'annee', libelle: 'Année' },
  { id: 'tout', libelle: 'Tout' }
];

/**
 * La barre de période — `PeriodBar` de la spec de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUATRE MAILLES PARCE QU'ON DÉCLARE DANS TROIS D'ENTRE ELLES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le mois, le trimestre et l'année ne sont pas des commodités de tri : ce sont
 * les mailles dans lesquelles on déclare. Pouvoir lire ses dépenses dans la
 * maille de la déclaration qu'on prépare évite de recomposer un total à la
 * main — l'opération où l'on se trompe.
 *
 * « Tout » est la quatrième, et elle a une fonction précise : une dépense sans
 * date de paiement n'appartient à aucune période bornée, et c'est là qu'on la
 * retrouve pour la corriger.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES FLÈCHES DISPARAISSENT SUR « TOUT »
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Naviguer dans un ensemble qui contient déjà tout ne mène nulle part. Une
 * flèche inerte apprend que les flèches ne servent parfois à rien, et on
 * cesse de les essayer là où elles marchent.
 */
export function BarrePeriode(
  { periode, onGranularite, onDecaler }: {
    readonly periode: Periode;
    readonly onGranularite: (g: Granularite) => void;
    readonly onDecaler: (pas: number) => void;
  }
) {
  const navigable = periode.granularite !== 'tout';

  return (
    <div className={styles.barre}>
      <div className={styles.segments} role="group" aria-label="Granularité de la période">
        {CHOIX.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`${styles.segment} ${periode.granularite === c.id ? styles.actif : ''}`}
            aria-pressed={periode.granularite === c.id}
            onClick={() => onGranularite(c.id)}
          >
            {c.libelle}
          </button>
        ))}
      </div>

      {navigable && (
        <div className={styles.navigation}>
          <button
            type="button"
            className={styles.pas}
            onClick={() => onDecaler(-1)}
            aria-label="Période précédente"
          >
            <span aria-hidden="true">‹</span>
          </button>
          {/* Annoncé à chaque changement : sans cela, les flèches déplacent une
              vue dont on n'entend jamais l'état. */}
          <span className={styles.courante} role="status">{periode.libelle}</span>
          <button
            type="button"
            className={styles.pas}
            onClick={() => onDecaler(1)}
            aria-label="Période suivante"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      )}
    </div>
  );
}
