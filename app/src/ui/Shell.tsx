import { type MouseEvent, type ReactNode } from 'react';
import { RailNav } from './components/RailNav';
import { useRoute } from './useRoute';
import type { IdEcran } from './navigation';
import styles from './Shell.module.css';

export interface ProprietesShell {
  readonly children: ReactNode;
  /**
   * Compteurs « à traiter » par écran, pour les badges de navigation. La
   * coquille ne les calcule pas : elle les reçoit, pour rester ignorante du
   * métier.
   */
  readonly compteurs?: Partial<Record<IdEcran, number>>;
  /**
   * Les services transverses de la barre : recherche, synchronisation,
   * masquage des montants, création. Fournis par l'appelant, qui les charge à
   * la demande — voir l'en-tête de `BarreActions`.
   */
  readonly actions?: ReactNode;
}

const ID_CONTENU = 'contenu-principal';

/**
 * Focus le contenu principal sans jamais toucher au hash de l'URL.
 *
 * Un lien d'évitement classique (`<a href="#contenu-principal">`) entrerait
 * en collision avec le routage par hash de `useRoute` : cliquer dessus
 * déclencherait un `hashchange` vers un fragment qui ne correspond à aucun
 * écran, et `resoudreEcran` renverrait Pilote — l'utilisateur serait
 * silencieusement renvoyé sur un autre écran en voulant seulement sauter
 * la navigation. On garde le `href` pour la sémantique de lien (focusable,
 * visible dans les outils d'accessibilité) mais on intercepte le clic.
 */
function surClicEvitement(evenement: MouseEvent<HTMLAnchorElement>): void {
  evenement.preventDefault();
  document.getElementById(ID_CONTENU)?.focus();
}

/**
 * Coquille de page : lien d'évitement, rail de navigation, barre du haut
 * et zone de contenu. Ne connaît aucune donnée métier — `ecran` vient
 * uniquement de `useRoute`, qui lit la même source (`navigation.ts`) que
 * RailNav, donc les deux ne peuvent jamais diverger sur « quel écran ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA BARRE DU HAUT NE PORTE PLUS DE PÉRIODE (lot 51, décision 2)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle portait « ‹ juin 2026 › » et l'année au-dessus de tous les écrans. Deux
 * défauts : sur Config ou la rédaction d'une facture, elle ne commandait rien ;
 * sur Achats ou Activité, elle doublait la commande que l'écran portait déjà, et
 * les deux pouvaient se contredire. Chaque écran porte désormais la sienne,
 * dans son en-tête, et une seule. Le mois reste PARTAGÉ — il vit dans `App` —
 * pour qu'un changement d'écran ne le remette pas au mois courant.
 *
 * Le nom de l'écran n'y est plus non plus : le rail le dit au bureau, et le
 * titre de chaque écran le situe mieux qu'un mot.
 */
export function Shell({ children, compteurs, actions }: ProprietesShell) {
  const { ecran } = useRoute();

  return (
    <div className={styles.app}>
      <a href={`#${ID_CONTENU}`} onClick={surClicEvitement} className={styles.lienEvitement}>
        Aller au contenu
      </a>

      <RailNav ecranActif={ecran.id} {...(compteurs ? { compteurs } : {})} />

      <div className={styles.colonne}>
        <header className={styles.topbar} aria-label="Barre du haut">
          <div className={styles.grow} />
          <div data-emplacement="actions" className={styles.actions}>{actions}</div>
        </header>

        <main id={ID_CONTENU} tabIndex={-1} className={styles.contenu}>
          {children}
        </main>
      </div>
    </div>
  );
}
