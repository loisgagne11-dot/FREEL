import type { ReactNode } from 'react';
import styles from './Etiquette.module.css';

/**
 * Une étiquette d'état, posée à droite du titre d'écran.
 *
 * Elle accompagnait les piliers de l'écran Argent ; les piliers sont partis
 * avec lui (lot 51 : Trésorerie et Analyse vivent sur deux écrans, il n'y a
 * plus de choix à faire entre eux), l'étiquette reste — elle dit la
 * couverture du dû en tête de la Trésorerie.
 */
export function Etiquette(
  { children, ton = 'neutre' }: {
    readonly children: ReactNode;
    readonly ton?: 'neutre' | 'ok' | 'attention';
  }
) {
  const classe = ton === 'ok' ? styles.ok : ton === 'attention' ? styles.attention : '';
  return <span className={`${styles.etiquette} ${classe}`}>{children}</span>;
}
