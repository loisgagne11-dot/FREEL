import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './Toasts.module.css';

/**
 * Les confirmations éphémères — `.freel-toast` de la spec de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SEULEMENT LÀ OÙ RIEN NE SE VOIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un toast qui répète ce que l'écran montre déjà est du bruit : poser un
 * congé colore la case, ajuster une journée change le total sous les yeux.
 * Ces gestes-là n'en reçoivent pas.
 *
 * Il reste les actions dont l'effet est INVISIBLE au moment où on les fait :
 * enregistrer depuis un panneau latéral, qui se referme sur la liste ;
 * supprimer un élément qu'on ne regardait pas. Là, sans confirmation, on
 * recommence — et on crée un doublon.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ANNONCÉ, PAS SEULEMENT AFFICHÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `role="status"` : la confirmation est lue par les lecteurs d'écran sans
 * voler le focus. `alert` interromprait la saisie en cours, ce qui est
 * disproportionné pour un « enregistré ».
 *
 * Le message reste visible cinq secondes. Trois ne suffisent pas pour lire
 * une phrase quand on est en train de taper ailleurs ; au-delà de cinq, il
 * masque le contenu qu'il commente.
 */

interface Toast {
  readonly id: number;
  readonly message: string;
}

const Contexte = createContext<(message: string) => void>(() => { /* sans conteneur */ });

/** Signale une action dont l'effet ne se voit pas à l'écran. */
export function useToast(): (message: string) => void {
  return useContext(Contexte);
}

export function FournisseurToasts({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  // Un compteur plutôt que `Date.now()` : deux confirmations dans la même
  // milliseconde partageraient sinon la même clé React.
  const prochain = useRef(0);

  const signaler = useCallback((message: string) => {
    const id = prochain.current;
    prochain.current += 1;
    setToasts((liste) => [...liste, { id, message }]);
    setTimeout(() => {
      setToasts((liste) => liste.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  // `useMemo` sur la valeur : sans lui, chaque rendu du conteneur ferait
  // re-rendre tous les écrans qui consomment le contexte.
  const valeur = useMemo(() => signaler, [signaler]);

  return (
    <Contexte.Provider value={valeur}>
      {children}
      <div className={styles.pile} role="status" aria-live="polite">
        {toasts.map((t) => (
          <p key={t.id} className={styles.toast}>{t.message}</p>
        ))}
      </div>
    </Contexte.Provider>
  );
}
