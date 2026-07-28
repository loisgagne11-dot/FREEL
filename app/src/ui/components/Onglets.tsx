import { useRef } from 'react';
import styles from './Onglets.module.css';

/**
 * Onglets de section.
 *
 * Le prototype posait des `div` cliquables sans sémantique : ni `role="tablist"`,
 * ni `aria-selected`, ni navigation aux flèches. Un lecteur d'écran annonçait
 * une suite de textes sans dire qu'il s'agissait d'un choix, ni lequel était
 * actif ; et au clavier il fallait tabuler sur chaque onglet.
 *
 * Le modèle d'onglets ARIA impose une règle contre-intuitive mais essentielle :
 * **un seul onglet est dans l'ordre de tabulation**, l'actif. On entre dans le
 * groupe par Tab, on circule aux **flèches**, on en sort par Tab. C'est ce qui
 * évite qu'un groupe de six onglets impose six tabulations pour être franchi.
 */

export interface Onglet<T extends string> {
  readonly id: T;
  readonly libelle: string;
}

export interface ProprietesOnglets<T extends string> {
  readonly onglets: readonly Onglet<T>[];
  readonly actif: T;
  readonly onChange: (id: T) => void;
  /** Nom du groupe, pour les lecteurs d'écran. */
  readonly libelle: string;
  /**
   * Identifiant du groupe, à générer par l'appelant avec `useId()` et à passer
   * aussi à chaque `PanneauOnglet`.
   *
   * Il serait plus commode de le générer ici, mais le panneau doit référencer
   * exactement le même : le laisser interne rendrait le lien onglet-panneau
   * impossible à établir depuis l'extérieur. Un paramètre visible vaut mieux
   * qu'un contexte implicite qui masquerait l'oubli.
   */
  readonly idGroupe: string;
}

export function Onglets<T extends string>(
  { onglets, actif, onChange, libelle, idGroupe }: ProprietesOnglets<T>
) {
  const prefixe = idGroupe;
  const boutons = useRef<Map<T, HTMLButtonElement>>(new Map());

  function auClavier(evenement: React.KeyboardEvent, index: number): void {
    const derniere = onglets.length - 1;
    let cible: number | null = null;

    switch (evenement.key) {
      case 'ArrowRight': cible = index === derniere ? 0 : index + 1; break;
      case 'ArrowLeft': cible = index === 0 ? derniere : index - 1; break;
      case 'Home': cible = 0; break;
      case 'End': cible = derniere; break;
      default: return;
    }

    evenement.preventDefault();
    const onglet = onglets[cible];
    if (onglet === undefined) return;
    // Activation immédiate au déplacement : le panneau suit la flèche. C'est le
    // motif « activation automatique », adapté quand le contenu est déjà chargé
    // et que changer d'onglet ne coûte rien.
    onChange(onglet.id);
    boutons.current.get(onglet.id)?.focus();
  }

  return (
    <div className={styles.rangee} role="tablist" aria-label={libelle}>
      {onglets.map((onglet, index) => {
        const estActif = onglet.id === actif;
        return (
          <button
            key={onglet.id}
            ref={(element) => {
              if (element) boutons.current.set(onglet.id, element);
              else boutons.current.delete(onglet.id);
            }}
            type="button"
            role="tab"
            id={`${prefixe}-${onglet.id}`}
            aria-selected={estActif}
            aria-controls={`${prefixe}-panneau-${onglet.id}`}
            // Un seul onglet dans l'ordre de tabulation : voir l'en-tête.
            tabIndex={estActif ? 0 : -1}
            className={`${styles.onglet} ${estActif ? styles.actif : ''}`}
            onClick={() => onChange(onglet.id)}
            onKeyDown={(e) => auClavier(e, index)}
          >
            {onglet.libelle}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Le panneau d'un onglet. Séparé du groupe pour que l'appelant place le
 * contenu où il veut dans sa mise en page, sans devoir l'imbriquer.
 *
 * ⚠️ `idGroupe` doit être exactement celui passé au groupe d'onglets : c'est
 * lui qui relie le panneau à son onglet.
 */
export function PanneauOnglet(
  { idGroupe, id, actif, children }: {
    idGroupe: string;
    id: string;
    actif: boolean;
    children: React.ReactNode;
  }
) {
  if (!actif) return null;
  return (
    <div
      role="tabpanel"
      id={`${idGroupe}-panneau-${id}`}
      aria-labelledby={`${idGroupe}-${id}`}
      // Focusable pour que Tab, en sortant du groupe d'onglets, entre dans le
      // panneau plutôt que de sauter par-dessus son contenu.
      tabIndex={0}
      className={styles.panneau}
    >
      {children}
    </div>
  );
}
