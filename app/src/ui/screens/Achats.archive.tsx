import { useEffect, useState } from 'react';
import type { StockageJustificatifs } from '../../infra/justificatifs';
import { lireDerniereArchive, piecesNonArchivees } from '../../infra/archive.derniere';
import styles from './Achats.archive.module.css';

/**
 * « N justificatifs pas encore archivés » — là où on les dépose.
 *
 * L'archive se crée dans Config › Données & export, un écran qu'on n'ouvre
 * pas en saisissant ses achats. Sans rappel ici, des mois de pièces
 * pouvaient s'accumuler dans ce seul navigateur sans que rien le dise.
 *
 * Chargé à part : l'écran Achats est au bord de son budget, et ce rappel
 * lit IndexedDB de son côté, sans retarder l'affichage des dépenses.
 */
export default function RappelArchive({ stockage }: { readonly stockage: StockageJustificatifs }) {
  const [nombre, setNombre] = useState<number | null>(null);

  useEffect(() => {
    let vivant = true;
    stockage.lister().then(
      (metas) => { if (vivant) setNombre(piecesNonArchivees(metas, lireDerniereArchive())); },
      // Pièces illisibles : se taire plutôt qu'inventer un compte.
      () => { if (vivant) setNombre(null); }
    );
    return () => { vivant = false; };
  }, [stockage]);

  if (nombre === null || nombre === 0) return null;
  return (
    <p className={styles.rappel} role="status">
      <span>
        {nombre}&nbsp;justificatif{nombre > 1 ? 's' : ''} pas encore archivé{nombre > 1 ? 's' : ''}&nbsp;:
        {nombre > 1 ? ' ils n’existent' : ' il n’existe'} que dans ce navigateur.
      </span>
      <a className={styles.lien} href="#/config/donnees">Créer une archive</a>
    </p>
  );
}
