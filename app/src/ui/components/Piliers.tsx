import { useRef, type ReactNode } from 'react';
import { Montant } from './Montant';
import styles from './Piliers.module.css';

/**
 * Deux piliers de section, chacun portant sa question et son chiffre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA CHANGE PAR RAPPORT À UN ONGLET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `Onglets` sait afficher « Trésorerie » et « Performance ». Le dessin, lui,
 * met sous chaque nom la QUESTION à laquelle la section répond — « combien
 * j'ai là, pour de vrai ? », « combien je gagne, je me verse ? » — et à droite
 * le chiffre qui y répond déjà.
 *
 * Ce n'est pas de l'ornement. Avec deux onglets nus, il faut ouvrir chaque
 * section pour savoir laquelle regarder ; avec les deux chiffres visibles en
 * permanence, on lit la réponse sans changer d'onglet, et on n'y va que si
 * elle surprend. C'est l'écran le plus dense de l'application : lui épargner
 * un aller-retour n'est pas rien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA SÉMANTIQUE RESTE CELLE DES ONGLETS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `role="tablist"`, `aria-selected`, un seul pilier dans l'ordre de tabulation,
 * circulation aux flèches : mêmes règles que `Onglets`, pour la même raison —
 * sans elles un lecteur d'écran annonce deux textes sans dire qu'il s'agit d'un
 * choix. Les panneaux se rendent avec `PanneauOnglet`, qui n'a rien à savoir de
 * la présentation.
 *
 * Le chiffre passe par `Montant` : il est ici en dehors du panneau, donc rien
 * d'autre ne le masquerait en mode confidentiel — et un solde lisible sur un
 * écran partagé est exactement ce que ce mode existe pour éviter.
 */

export interface Pilier<T extends string> {
  readonly id: T;
  readonly libelle: string;
  /** La question à laquelle la section répond. Une ligne, à la deuxième personne. */
  readonly question: string;
  /** La réponse déjà connue : un montant formaté. */
  readonly chiffre: string;
  /** Ce que ce chiffre est — « disponible », « CA réalisé 2026 ». */
  readonly precision: string;
  /** Icône au trait, attribut `d` d'un `<path>` sur un viewBox 24×24. */
  readonly icone: string;
}

export function Piliers<T extends string>(
  { piliers, actif, onChange, libelle, idGroupe }: {
    readonly piliers: readonly Pilier<T>[];
    readonly actif: T;
    readonly onChange: (id: T) => void;
    readonly libelle: string;
    /** À générer par l'appelant avec `useId()`, et à passer aussi aux panneaux. */
    readonly idGroupe: string;
  }
) {
  const boutons = useRef<Map<T, HTMLButtonElement>>(new Map());

  function auClavier(evenement: React.KeyboardEvent, index: number): void {
    const derniere = piliers.length - 1;
    let cible: number | null = null;
    switch (evenement.key) {
      case 'ArrowRight': cible = index === derniere ? 0 : index + 1; break;
      case 'ArrowLeft': cible = index === 0 ? derniere : index - 1; break;
      case 'Home': cible = 0; break;
      case 'End': cible = derniere; break;
      default: return;
    }
    evenement.preventDefault();
    const pilier = piliers[cible];
    if (pilier === undefined) return;
    onChange(pilier.id);
    boutons.current.get(pilier.id)?.focus();
  }

  return (
    <div className={styles.rangee} role="tablist" aria-label={libelle}>
      {piliers.map((pilier, index) => {
        const estActif = pilier.id === actif;
        return (
          <button
            key={pilier.id}
            ref={(element) => {
              if (element) boutons.current.set(pilier.id, element);
              else boutons.current.delete(pilier.id);
            }}
            type="button"
            role="tab"
            id={`${idGroupe}-${pilier.id}`}
            aria-selected={estActif}
            aria-controls={`${idGroupe}-panneau-${pilier.id}`}
            tabIndex={estActif ? 0 : -1}
            className={`${styles.pilier} ${estActif ? styles.actif : ''}`}
            onClick={() => onChange(pilier.id)}
            onKeyDown={(e) => auClavier(e, index)}
          >
            <span className={styles.icone} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path
                  d={pilier.icone}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={styles.texte}>
              <span className={styles.nom}>{pilier.libelle}</span>
              <span className={styles.question}>{pilier.question}</span>
            </span>
            <span className={styles.reponse}>
              <span className={styles.chiffre}><Montant>{pilier.chiffre}</Montant></span>
              <span className={styles.precision}>{pilier.precision}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Une étiquette d'état, posée à droite du titre d'écran. */
export function Etiquette(
  { children, ton = 'neutre' }: {
    readonly children: ReactNode;
    readonly ton?: 'neutre' | 'ok' | 'attention';
  }
) {
  const classe = ton === 'ok' ? styles.ok : ton === 'attention' ? styles.attentionEtiquette : '';
  return <span className={`${styles.etiquette} ${classe}`}>{children}</span>;
}
