import { Montant } from './Montant';
import styles from './Chiffre.module.css';

/**
 * Une tuile de chiffre : un libellé, un montant, un ton.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE VIT DANS SON PROPRE FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle était définie DANS l'écran Argent. En sortir le registre a rendu la
 * chose visible : deux modules avaient besoin de la même tuile, et la
 * dupliquer aurait garanti qu'elles finissent par diverger — l'une gagnant un
 * ton que l'autre n'aurait pas.
 *
 * Le montant passe par `Montant`, qui porte `data-montant` : sans lui, le mode
 * confidentiel laisserait lire un solde en clair sur un écran partagé.
 */
export function Chiffre(
  { libelle, valeur, ton = 'neutre' }: {
    readonly libelle: string;
    readonly valeur: string;
    readonly ton?: 'neutre' | 'accent' | 'attention' | 'danger';
  }
) {
  const classe = ton === 'danger' ? styles.danger
    : ton === 'attention' ? styles.attention
    : ton === 'accent' ? styles.accent : '';

  return (
    <div className={styles.chiffre}>
      <span className={styles.libelle}>{libelle}</span>
      <span className={`${styles.montant} ${classe}`}><Montant>{valeur}</Montant></span>
    </div>
  );
}
