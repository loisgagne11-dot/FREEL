import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import styles from './Exporter.module.css';

/**
 * Le bouton « Exporter » de la barre du haut.
 *
 * Comme `Recherche`, il n'est qu'un bouton dans le paquet d'entrée : le menu et
 * la génération des fichiers (CSV, JSON) arrivent à la demande, au premier clic.
 * Ce fichier n'importe donc ni le magasin ni le générateur de CSV.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PAS D'« EXPORT FEC », ET C'EST UN RENONCEMENT DÉLIBÉRÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le handoff propose un « Export FEC ». Nous ne le faisons pas : le micro-BNC
 * tient un LIVRE DES RECETTES, pas une comptabilité en partie double. Un FEC
 * (fichier des écritures comptables) suppose des journaux, des comptes et des
 * écritures équilibrées débit/crédit. En fabriquer un depuis un livre de
 * recettes donnerait un document d'apparence comptable qui ne correspond à
 * aucune comptabilité réellement tenue — pire qu'une absence : un comptable ou
 * un contrôleur le lirait comme tel. Le livre des recettes en CSV couvre le
 * besoin réel de cette personne.
 */

const Menu = lazy(() => import('./Exporter.menu'));

export function Exporter({ annee }: { readonly annee: number }) {
  const [ouvert, setOuvert] = useState(false);
  const enveloppe = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);

  const fermer = useCallback((rendreLeFocus: boolean) => {
    setOuvert(false);
    if (rendreLeFocus) bouton.current?.focus();
  }, []);

  return (
    <div className={styles.enveloppe} ref={enveloppe}>
      <button
        ref={bouton}
        type="button"
        className={styles.bouton}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
      >
        <svg className={styles.icone} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3 V14 M8 10 L12 14 L16 10 M4 17 V20 H20 V17" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className={styles.libelle}>Exporter</span>
      </button>
      {ouvert && (
        <Suspense fallback={null}>
          <Menu annee={annee} ancre={enveloppe} onFermer={fermer} />
        </Suspense>
      )}
    </div>
  );
}
