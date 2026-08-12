import type { IdEcran } from '../navigation';
import { ECRANS } from '../navigation';
import styles from './RailNav.module.css';

export interface ProprietesRailNav {
  readonly ecranActif: IdEcran;
  /**
   * Compteur « à traiter » par écran, pour le badge de nav. Optionnel : le
   * domaine qui les produira n'existe pas encore à ce stade du projet, et
   * l'invariant du projet interdit d'inventer un chiffre à l'écran.
   */
  readonly compteurs?: Partial<Record<IdEcran, number>>;
}

/**
 * Navigation principale, seule et unique implémentation pour les deux
 * formes (rail latéral desktop, dock flottant en portrait). Le choix de
 * forme est entièrement porté par les media queries de RailNav.module.css :
 * aucune mesure de fenêtre n'intervient ici, pour ne pas reproduire le bug
 * vérifié de l'ancienne version (`placeFab()`, qui reparentait un nœud
 * selon `window.innerWidth` et ne revenait jamais en arrière au-delà de
 * 600px une fois basculé).
 */
export function RailNav({ ecranActif, compteurs }: ProprietesRailNav) {
  return (
    <nav className={styles.rail} aria-label="Navigation principale">
      {ECRANS.map((ecran) => {
        const actif = ecran.id === ecranActif;
        const compteur = compteurs?.[ecran.id];
        const aCompteur = typeof compteur === 'number' && compteur > 0;
        return (
          <a
            key={ecran.id}
            href={ecran.chemin}
            // Nom accessible fixé ici, indépendant de la technique CSS qui
            // masque le libellé visuel en portrait — un lecteur d'écran
            // doit connaître chaque destination, même icône seule.
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
            {aCompteur && (
              // Décoratif pour l'instant : la sémantique du compteur (quoi,
              // combien) viendra avec le domaine qui le produit ; on ne
              // fabrique pas un texte d'annonce sur une valeur qu'on n'a pas.
              <span className={styles.badge} aria-hidden="true">
                {compteur}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}
