import type { Mois } from '../../domain/types';
import { decalerMois } from '../../domain/calculs/periode';
import { moisLong } from '../format';
import styles from './NavigateurMois.module.css';

/**
 * « ‹ juin 2026 › » — le mois qu'on regarde, dans l'en-tête de ce qu'il
 * commande : la carte du flux, sur le Pilote.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN SEUL MOIS POUR TOUTE L'APPLICATION, UNE COMMANDE PAR ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Activité avait ses propres flèches, le Pilote n'en avait pas, Argent ne
 * connaissait que l'année : trois périodes indépendantes, et en passant
 * d'un écran à l'autre on ne savait plus ce qu'on regardait. Le mois vit donc
 * dans `App`, et chaque écran en tire ce qui le concerne (le mois, ou son
 * année). Il a été affiché un temps en tête de la barre du haut ; depuis le
 * lot 51, chaque écran porte sa commande dans son en-tête, et une seule.
 *
 * « Aujourd'hui » n'apparaît que loin du mois courant : c'est le chemin du
 * retour, inutile quand on y est déjà.
 */
export function NavigateurMois(
  { mois, courant, onMois }: {
    readonly mois: Mois;
    readonly courant: Mois;
    readonly onMois: (m: Mois) => void;
  }
) {
  return (
    <div className={styles.navigateur} role="group" aria-label="Mois affiché">
      <button type="button" className={styles.pas} aria-label="Mois précédent"
        onClick={() => onMois(decalerMois(mois, -1))}>
        <span aria-hidden="true">‹</span>
      </button>
      {/* Annoncé à chaque changement : sans cela, les flèches déplacent une
          vue dont on n'entend jamais l'état. */}
      <span className={styles.mois} role="status">{moisLong(mois)}</span>
      <button type="button" className={styles.pas} aria-label="Mois suivant"
        onClick={() => onMois(decalerMois(mois, 1))}>
        <span aria-hidden="true">›</span>
      </button>
      {mois !== courant && (
        <button type="button" className={styles.retour} onClick={() => onMois(courant)}>
          Aujourd’hui
        </button>
      )}
    </div>
  );
}
