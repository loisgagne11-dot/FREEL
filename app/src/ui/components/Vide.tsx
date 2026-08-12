import type { ReactNode } from 'react';
import styles from './Vide.module.css';

/**
 * L'état vide, avec sa sortie.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * « AUCUNE MISSION ENREGISTRÉE » NE DIT PAS QUOI FAIRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque écran avait son propre message d'absence, correct mais terminal :
 * il constatait le vide sans indiquer par où en sortir. L'audit de design le
 * relevait — états vides « partiels, pas de motif systématisé ».
 *
 * Le vide est pourtant le premier écran que voit quelqu'un qui commence, et
 * le seul moment où il ne peut RIEN déduire de ce qu'il a sous les yeux.
 * C'est donc là qu'une indication vaut le plus cher, pas là qu'on peut s'en
 * passer.
 *
 * Ce composant tient les deux ensemble : le constat, et l'action qui le lève
 * quand elle existe. Quand elle n'existe pas — un mois sans prestation
 * intracommunautaire n'appelle aucune action — le constat suffit, et rien
 * n'est inventé pour meubler.
 */
export function Vide(
  { message, action }: {
    /** Ce qui manque, dit sans détour. */
    readonly message: ReactNode;
    /** Par où en sortir, quand une sortie existe. */
    readonly action?: ReactNode;
  }
) {
  return (
    <div className={styles.vide}>
      <p className={styles.message}>{message}</p>
      {action !== undefined && <div className={styles.action}>{action}</div>}
    </div>
  );
}
