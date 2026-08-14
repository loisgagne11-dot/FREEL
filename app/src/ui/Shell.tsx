import type { MouseEvent, ReactNode } from 'react';
import { RailNav } from './components/RailNav';
import { PastillesSysteme } from './components/PastillesSysteme';
import { IndicateurATraiter } from './components/IndicateurATraiter';
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
 */
export function Shell({ children, compteurs }: ProprietesShell) {
  const { ecran } = useRoute();

  return (
    <div className={styles.app}>
      <a href={`#${ID_CONTENU}`} onClick={surClicEvitement} className={styles.lienEvitement}>
        Aller au contenu
      </a>

      <RailNav ecranActif={ecran.id} {...(compteurs ? { compteurs } : {})} />

      <div className={styles.colonne}>
        <header className={styles.topbar}>
          <span className={styles.titre}>{ecran.libelle}</span>
          <div className={styles.grow} />
          {/* Emplacements réservés — leur contenu est propre à chaque écran
              (sélecteur de période) ou vient de services transverses pas
              encore construits (actions Exporter/Nouveau). On ne les invente
              pas ici. */}
          <div data-emplacement="selecteur-periode" />
          {/* En tête des pastilles, jamais au-dessus d'un contrôle : en
              portrait il flotte au-dessus du dock, en paysage il vit ici. */}
          <IndicateurATraiter ecranActif={ecran.id} />
          <PastillesSysteme />
          <div data-emplacement="actions" />
        </header>

        <main id={ID_CONTENU} tabIndex={-1} className={styles.contenu}>
          {children}
        </main>
      </div>
    </div>
  );
}
