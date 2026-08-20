import type { ReactNode } from 'react';
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
  { libelle, valeur, ton = 'neutre', note }: {
    readonly libelle: string;
    readonly valeur: string;
    readonly ton?: 'neutre' | 'accent' | 'attention' | 'danger';
    /**
     * La ligne sous le montant : ce que ce chiffre recouvre au juste.
     *
     * Le dessin en met une sous chacune des quatre tuiles — « facturé, cumulé »,
     * « reçu sur le compte », « après cotisations · fin 2026 ». Ce n'est pas un
     * ornement : « 59,4 k€ » et « 53,4 k€ » sont deux définitions du chiffre
     * d'affaires, et sans la note rien ne dit laquelle on lit. C'est aussi là
     * qu'une tuile avoue ce qu'elle ignore.
     *
     * Hors de `Montant` à dessein : elle ne porte pas de somme, et la flouter
     * en mode confidentiel effacerait justement l'étiquette qui reste lisible
     * quand les montants ne le sont plus.
     */
    readonly note?: ReactNode;
  }
) {
  const classe = ton === 'danger' ? styles.danger
    : ton === 'attention' ? styles.attention
    : ton === 'accent' ? styles.accent : '';

  return (
    <div className={styles.chiffre}>
      <span className={styles.libelle}>{libelle}</span>
      <span className={`${styles.montant} ${classe}`}><Montant>{valeur}</Montant></span>
      {note !== undefined && <span className={styles.note}>{note}</span>}
    </div>
  );
}
