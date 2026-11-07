import type { IdEcran } from '../navigation';
import { ECRANS, ECRANS_DU_RAIL, entreeDuRail } from '../navigation';
import { Suspense, lazy } from 'react';
import styles from './RailNav.module.css';

/**
 * Le pied du rail — livre des recettes et carte de l'utilisateur — arrive à
 * la demande : il n'existe qu'en grand écran, tout en bas, et le paquet
 * d'entrée a franchi son budget au lot 6. Il apparaît quelques millisecondes
 * après les entrées, là où personne ne regarde en premier.
 */
const PiedDuRail = lazy(() => import('./RailNav.pied').then((m) => ({ default: m.PiedDuRail })));

export interface ProprietesRailNav {
  readonly ecranActif: IdEcran;
  readonly compteurs?: Partial<Record<IdEcran, number>>;
}

/**
 * Le rail : six entrées, et en pied le livre des recettes et la carte de
 * l'utilisateur — la disposition du handoff (décision n° 2, formule A).
 *
 * Le compteur d'une entrée additionne ceux des écrans qu'elle accueille : les
 * sujets des factures (TVA à régulariser…) s'affichaient sur « Facturer »,
 * ils s'affichent désormais sur « Activité », où vit leur liste.
 */
export function RailNav({ ecranActif, compteurs }: ProprietesRailNav) {
  const allumee = entreeDuRail(ecranActif);
  return (
    <nav className={styles.rail} aria-label="Navigation principale">
      {ECRANS_DU_RAIL.map((ecran) => {
        const actif = ecran.id === allumee;
        const compteur = ECRANS
          .filter((e) => e.id === ecran.id || e.rattacheA === ecran.id)
          .reduce((n, e) => n + (compteurs?.[e.id] ?? 0), 0);
        return (
          <a
            key={ecran.id}
            href={ecran.chemin}
            // Les entrées, distinguées des liens du pied : c'est sur elles
            // que se mesurent le nombre d'onglets et les cibles tactiles.
            data-role="entree"
            aria-label={ecran.libelle}
            aria-current={actif ? 'page' : undefined}
            className={actif ? `${styles.lien} ${styles.actif}` : styles.lien}
          >
            <span className={styles.icone} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d={ecran.icone} />
              </svg>
            </span>
            {/* `data-role` nomme le libellé pour le vérificateur responsive :
                l'exigence « un seul onglet nommé en portrait » se mesure sur
                CET élément, pas sur le texte du lien — qui contient aussi le
                chiffre du badge. */}
            <span className={styles.libelle} data-role="libelle" aria-hidden="true">
              {ecran.libelle}
            </span>
            {compteur > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {compteur}
              </span>
            )}
          </a>
        );
      })}
      <Suspense fallback={null}><PiedDuRail /></Suspense>
    </nav>
  );
}

