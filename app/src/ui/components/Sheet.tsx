import { useEffect, useId, useRef } from 'react';
import styles from './Sheet.module.css';

/**
 * Panneau latéral de détail.
 *
 * Le prototype de design posait un `aside` et un voile, sans plus : ni
 * `role="dialog"`, ni `aria-modal`, ni piège de focus, ni restitution du focus
 * à la fermeture. L'audit du design system l'a relevé. Conséquences concrètes
 * de ces manques : au clavier, la tabulation sortait du panneau et parcourait
 * la page derrière le voile — l'utilisateur se retrouvait à activer des
 * contrôles qu'il ne voyait pas ; et un lecteur d'écran continuait d'annoncer
 * le contenu masqué.
 *
 * Ce composant porte donc, en propre :
 *   · la sémantique de dialogue modal ;
 *   · le piège de focus, dans les deux sens de tabulation ;
 *   · la fermeture par Échap et par clic sur le voile ;
 *   · la restitution du focus à l'élément qui a ouvert le panneau ;
 *   · le verrouillage du défilement de la page derrière.
 */

export interface ProprietesSheet {
  readonly ouvert: boolean;
  readonly titre: string;
  readonly onFermer: () => void;
  readonly children: React.ReactNode;
}

/** Éléments focusables, dans l'ordre du document. */
const SELECTEUR_FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function Sheet({ ouvert, titre, onFermer, children }: ProprietesSheet) {
  const panneau = useRef<HTMLElement | null>(null);
  const declencheur = useRef<HTMLElement | null>(null);
  const idTitre = useId();

  useEffect(() => {
    if (!ouvert) return;

    // Mémorise qui a ouvert, pour lui rendre le focus à la fermeture. Sans
    // cela, refermer le panneau renvoie le focus au début du document et
    // l'utilisateur au clavier perd sa place.
    declencheur.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const element = panneau.current;
    if (element === null) return;

    // Le focus entre dans le panneau : sur le premier élément interactif, ou
    // sur le panneau lui-même s'il n'en contient aucun.
    const focusables = () => [...element.querySelectorAll<HTMLElement>(SELECTEUR_FOCUSABLE)];
    const premier = focusables()[0];
    (premier ?? element).focus();

    function auClavier(evenement: KeyboardEvent): void {
      if (evenement.key === 'Escape') {
        evenement.preventDefault();
        onFermer();
        return;
      }
      if (evenement.key !== 'Tab') return;

      // Piège de focus. La liste est recalculée à chaque frappe : le contenu
      // du panneau peut changer pendant qu'il est ouvert.
      const liste = focusables();
      if (liste.length === 0) {
        evenement.preventDefault();
        return;
      }
      const debut = liste[0] as HTMLElement;
      const fin = liste[liste.length - 1] as HTMLElement;
      const actif = document.activeElement;

      if (evenement.shiftKey && (actif === debut || actif === element)) {
        evenement.preventDefault();
        fin.focus();
      } else if (!evenement.shiftKey && actif === fin) {
        evenement.preventDefault();
        debut.focus();
      }
    }

    document.addEventListener('keydown', auClavier);

    // Le défilement de la page est verrouillé pendant l'ouverture, sinon le
    // contenu derrière le voile bouge sous le doigt en portrait.
    const debordementInitial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', auClavier);
      document.body.style.overflow = debordementInitial;
      declencheur.current?.focus();
    };
  }, [ouvert, onFermer]);

  if (!ouvert) return null;

  return (
    <>
      {/* Le voile est un fond cliquable, pas un contrôle : il ne doit pas être
          atteignable au clavier, la touche Échap jouant ce rôle. */}
      <div className={styles.voile} onClick={onFermer} aria-hidden="true" />
      <aside
        ref={panneau}
        className={styles.panneau}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        tabIndex={-1}
      >
        <header className={styles.entete}>
          <h2 id={idTitre} className={styles.titre}>{titre}</h2>
          <button
            type="button"
            className={styles.fermer}
            onClick={onFermer}
            aria-label="Fermer le panneau"
          >
            {/* Croix décorative : le nom accessible vient d'aria-label. */}
            <span aria-hidden="true">✕</span>
          </button>
        </header>
        <div className={styles.corps}>{children}</div>
      </aside>
    </>
  );
}
