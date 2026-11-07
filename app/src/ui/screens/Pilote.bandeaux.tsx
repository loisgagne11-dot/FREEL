import type { ReactNode } from 'react';
import styles from './Pilote.module.css';

/**
 * Les bandeaux d'exception du Pilote, chargés à la demande — voir `Pilote`.
 *
 * `Bandeau` sert aussi à l'alerte de conservation (`AlerteConservation`),
 * elle aussi différée : une seule forme pour dire « attention » partout.
 */
export function Bandeau(
  { ton, titre, children }: {
    ton: 'info' | 'alerte';
    titre: string;
    children: ReactNode;
  }
) {
  return (
    // `role="status"` plutôt que `alert` : ces bandeaux sont présents au
    // rendu, ils n'interrompent pas l'utilisateur en cours de tâche.
    <section className={`${styles.bandeau} ${ton === 'alerte' ? styles.bandeauAlerte : styles.bandeauInfo}`} role="status">
      <strong className={styles.bandeauTitre}>{titre}</strong>
      <div className={styles.bandeauCorps}>{children}</div>
    </section>
  );
}

export function BandeauxDuPilote(
  { migration, motifsIncomplets, motifTauxImpot }: {
    readonly migration: boolean;
    /** Les motifs d'un calcul incomplet, ou `null` quand il est complet. */
    readonly motifsIncomplets: readonly string[] | null;
    readonly motifTauxImpot: string | null;
  }
) {
  return (
    <>
      {migration && (
        <Bandeau ton="info" titre="Données reprises de la version précédente">
          Une sauvegarde de l’état d’origine a été archivée avant toute écriture.
        </Bandeau>
      )}

      {/* Un calcul incomplet n'est jamais présenté comme un résultat : un
          versable trop élevé conduirait à se verser de l'argent déjà dû. */}
      {motifsIncomplets !== null && (
        <Bandeau ton="alerte" titre="Montants sous-évalués">
          {/* Chaque motif se dit lui-même : « recette hors barème » nommait
              une cause qui n'était pas toujours la bonne. */}
          Une partie de ce qui est dû n’a pas pu être provisionnée. Les montants
          ci-dessous sont donc <strong>plus élevés que la réalité</strong>.
          <ul className={styles.motifs}>
            {motifsIncomplets.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </Bandeau>
      )}

      {motifTauxImpot !== null && (
        <Bandeau ton="alerte" titre="Barème d’imposition manquant">
          {motifTauxImpot}
        </Bandeau>
      )}
    </>
  );
}
