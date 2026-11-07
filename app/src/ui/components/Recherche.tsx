import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import styles from './Recherche.module.css';

/**
 * Le champ de recherche de la barre du haut : un bouton, et rien d'autre tant
 * qu'on ne s'en sert pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LA PALETTE N'EST PAS ICI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La barre du haut vit dans le paquet d'ENTRÉE, téléchargé par tout le monde
 * avant la première ligne utile, dont le budget est serré. La palette (index,
 * moteur, liste, styles) ne sert qu'à qui cherche : elle arrive à la demande,
 * au premier ⌘K ou au premier clic. Le coût est un aller-retour réseau, une
 * fois, au moment où l'utilisateur a déjà décidé de chercher.
 *
 * Ce fichier ne doit donc importer NI le moteur de recherche, NI le magasin :
 * les y ajouter les ferait entrer dans l'entrée par la porte de derrière.
 */

const Palette = lazy(() => import('./Recherche.palette'));

/** ⌘ sur Mac, Ctrl ailleurs : afficher ⌘K à qui n'a pas cette touche est faux. */
const surMac = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function Recherche() {
  const [ouverte, setOuverte] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function surTouche(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        // Sans cela, Ctrl+K place le focus dans la barre d'adresse de certains
        // navigateurs et la palette s'ouvre derrière.
        e.preventDefault();
        setOuverte((o) => !o);
      }
    }
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, []);

  const fermer = useCallback(() => {
    setOuverte(false);
    // Le focus revient là d'où l'on est parti : sans cela il retombe sur <body>
    // et le clavier doit retraverser toute la page.
    bouton.current?.focus();
  }, []);

  const raccourci = surMac() ? '⌘K' : 'Ctrl K';

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className={styles.champ}
        aria-label="Rechercher"
        aria-haspopup="dialog"
        aria-keyshortcuts={surMac() ? 'Meta+K' : 'Control+K'}
        onClick={() => setOuverte(true)}
      >
        <svg className={styles.icone} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M11 4 a7 7 0 1 0 0.01 0 M16 16 L21 21" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className={styles.libelle}>Rechercher…</span>
        <kbd className={styles.raccourci}>{raccourci}</kbd>
      </button>
      {ouverte && (
        <Suspense fallback={null}>
          <Palette onFermer={fermer} />
        </Suspense>
      )}
    </>
  );
}
