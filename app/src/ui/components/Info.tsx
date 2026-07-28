import { useId, useState } from 'react';
import styles from './Info.module.css';

/**
 * Motif « texte replié derrière un i ».
 *
 * Le design remplace toute explication de plus de 70 caractères par un petit
 * « i » : survol pour révéler, clic pour figer. Deux écarts assumés par
 * rapport au prototype, tous deux relevés par l'audit :
 *
 *  1. **La cible fait 44 px, pas 18.** Le prototype posait un bouton de 18 px,
 *     sous le minimum recommandé. Le rond visible reste petit — c'est
 *     l'intention graphique — mais la zone atteignable est agrandie autour.
 *  2. **Le texte est lié au bouton par `aria-describedby`** et le repli est un
 *     `aria-expanded`. Dans le prototype, le texte n'était qu'un bloc masqué
 *     en CSS : un lecteur d'écran ne pouvait pas le rattacher au « i », et le
 *     survol n'existe pas au clavier ni au toucher.
 *
 * Un troisième écart, imposé par un bug réel : le texte est rendu **dans le
 * flux** quand il est déplié, et non en infobulle absolument positionnée. Cette
 * dernière causait un débordement horizontal détecté par la vérification
 * automatisée — un bloc absolument positionné compte dans la largeur du
 * document même invisible. Conséquence assumée : le survol ne révèle plus, seul
 * le clic ouvre. Le détail du raisonnement est dans `Info.module.css`.
 */

export interface ProprietesInfo {
  /** L'explication. Peut contenir de la mise en forme légère. */
  readonly children: React.ReactNode;
  /**
   * Nom accessible du bouton. Par défaut « Explication », mais préciser de
   * quoi il s'agit vaut mieux quand plusieurs « i » cohabitent : entendre
   * « Explication » trois fois de suite n'aide personne.
   */
  readonly libelle?: string;
}

export function Info({ children, libelle = 'Explication' }: ProprietesInfo) {
  const [fige, setFige] = useState(false);
  const idTexte = useId();

  return (
    <span className={styles.enveloppe}>
      <button
        type="button"
        className={styles.bouton}
        aria-label={libelle}
        aria-expanded={fige}
        aria-describedby={idTexte}
        onClick={() => setFige((v) => !v)}
      >
        <span className={styles.rond} aria-hidden="true">i</span>
      </button>
      {/* Toujours présent dans l'arbre d'accessibilité, y compris replié :
          c'est ce qui permet à `aria-describedby` de le désigner. Le repli est
          purement visuel. */}
      <span
        id={idTexte}
        className={`${styles.texte} ${fige ? styles.fige : ''}`}
        role="note"
      >
        {children}
      </span>
    </span>
  );
}
