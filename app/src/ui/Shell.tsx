import { type MouseEvent, type ReactNode, Suspense, lazy } from 'react';
import { RailNav } from './components/RailNav';
import { IndicateurATraiter } from './components/IndicateurATraiter';
import { useRoute } from './useRoute';
import type { IdEcran } from './navigation';
import styles from './Shell.module.css';

/**
 * Les pastilles système (stockage, mode confidentiel, palette), chargées à la
 * demande — comme le sélecteur d'année.
 *
 * Le paquet d'entrée a dépassé son budget au lot 3 (80,08 / 80 Ko) et
 * l'invariant n°7 dit d'extraire. Elles sont sûres à différer : le mode
 * confidentiel est appliqué AVANT React par le script de `index.html`, et ces
 * pastilles ne font que le basculer. Les montants ne sont donc jamais visibles
 * le temps qu'elles arrivent ; seuls les boutons apparaissent quelques
 * millisecondes plus tard.
 */
const PastillesSysteme = lazy(() =>
  import('./components/PastillesSysteme').then((m) => ({ default: m.PastillesSysteme })));

export interface ProprietesShell {
  readonly children: ReactNode;
  /**
   * Compteurs « à traiter » par écran, pour les badges de navigation. La
   * coquille ne les calcule pas : elle les reçoit, pour rester ignorante du
   * métier.
   */
  readonly compteurs?: Partial<Record<IdEcran, number>>;
  /**
   * Le sélecteur de période de l'écran courant, ou rien.
   *
   * La coquille ne sait pas ce qu'une période représente — année, mois,
   * trimestre — ni quel écran en a besoin : seul l'appelant, qui connaît la
   * route active, peut en décider. Elle se contente de lui réserver la place
   * prévue par le dessin, en tête de barre.
   */
  readonly periode?: ReactNode;
  /**
   * Les services transverses de la barre : recherche, export, création.
   * Fournis par l'appelant pour la même raison que `periode` — ils lisent
   * l'année choisie, que la coquille n'a pas à connaître.
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
 */
export function Shell({ children, compteurs, periode, actions }: ProprietesShell) {
  const { ecran } = useRoute();

  return (
    <div className={styles.app}>
      <a href={`#${ID_CONTENU}`} onClick={surClicEvitement} className={styles.lienEvitement}>
        Aller au contenu
      </a>

      <RailNav ecranActif={ecran.id} {...(compteurs ? { compteurs } : {})} />

      <div className={styles.colonne}>
        <header className={styles.topbar}>
          {/* La période en tête de barre, comme le handoff (« ‹ juin 2026 › »).
              Son contenu est fourni par l'appelant, qui seul sait quelle route
              est active ; quand il ne rend rien (Config, rédaction d'une
              facture), le nom de l'écran reprend la place — voir la feuille. */}
          <div data-emplacement="selecteur-periode" className={styles.periode}>{periode}</div>
          <span className={styles.titre}>{ecran.libelle}</span>
          <div className={styles.grow} />
          {/* En tête des pastilles, jamais au-dessus d'un contrôle : en
              portrait il flotte au-dessus du dock, en paysage il vit ici. */}
          <IndicateurATraiter ecranActif={ecran.id} />
          <Suspense fallback={null}><PastillesSysteme /></Suspense>
          <div data-emplacement="actions" className={styles.actions}>{actions}</div>
        </header>

        <main id={ID_CONTENU} tabIndex={-1} className={styles.contenu}>
          {children}
        </main>
      </div>
    </div>
  );
}
