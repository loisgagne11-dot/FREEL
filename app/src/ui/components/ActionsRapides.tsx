import styles from './ActionsRapides.module.css';

/**
 * La rangée d'actions rapides du Pilote — `.quickacts` de la spec de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE RÉPARE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le Pilote répondait à « où j'en suis » et à rien d'autre : pour émettre une
 * facture il fallait ouvrir Facturer, puis trouver « Nouvelle facture » ; pour
 * saisir une dépense, ouvrir Achats, puis trouver « Ajouter une dépense ».
 * Deux gestes pour chaque action quotidienne, depuis l'écran qui s'ouvre en
 * premier. C'est exactement ce qui a été rapporté : « je ne comprends pas trop
 * où elles sont, ce n'est pas ergonomique ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CHAQUE ACTION MÈNE OÙ ELLE DIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une action rapide qui dépose sur un écran sans rien ouvrir ne fait pas
 * gagner le second geste, elle le déplace. Chaque entrée pointe donc une
 * sous-route qui ouvre réellement la saisie — `#/facture/nouvelle`,
 * `#/achats/depense` — et le test de cet écran vérifie que la destination
 * existe, pour qu'aucune ne devienne un lien mort par renommage.
 *
 * Ce sont des liens, pas des boutons : ils s'ouvrent dans un nouvel onglet,
 * se copient, se mettent en favori. Une action fréquente mérite une adresse.
 */

/** Une action rapide : ce qu'elle fait, et où elle mène. */
export interface ActionRapide {
  readonly libelle: string;
  readonly href: string;
  /** Icône au trait, attribut `d` d'un unique `<path>` sur un viewBox 24×24. */
  readonly icone: string;
}

export const ACTIONS_RAPIDES: readonly ActionRapide[] = [
  {
    libelle: 'Nouvelle facture',
    href: '#/facture/nouvelle',
    icone: 'M6 3 H15 L19 7 V21 H6 Z M15 3 V7 H19 M12 11 V17 M9 14 H15'
  },
  {
    libelle: 'Ajouter une dépense',
    href: '#/achats/depense',
    icone: 'M3 4 H6 L8.5 15 H18 L20 7 H7.5 M8 19 H10 V21 H8 Z M14 19 H16 V21 H14 Z'
  },
  {
    libelle: 'Importer un relevé',
    href: '#/achats/releve',
    icone: 'M12 3 V14 M8 10 L12 14 L16 10 M4 17 V20 H20 V17'
  },
  {
    libelle: 'Activité & congés',
    href: '#/activite',
    icone: 'M4 5 H20 V20 H4 Z M4 10 H20 M8 3 V7 M16 3 V7'
  },
  {
    libelle: 'Mes données',
    href: '#/config',
    icone: 'M8 3 H16 L21 8 V16 L16 21 H8 L3 16 V8 Z M10 12 H14 M12 10 V14'
  }
];

export function ActionsRapides() {
  return (
    <nav className={styles.rangee} aria-label="Actions rapides">
      <span className={styles.intitule}>Actions rapides</span>
      {/* Défile horizontalement en portrait plutôt que de passer à la ligne :
          une rangée qui s'empile sur trois niveaux repousse le flux du mois
          hors de l'écran, et c'est lui qu'on vient voir. */}
      <ul className={styles.liste}>
        {ACTIONS_RAPIDES.map((a) => (
          <li key={a.href}>
            <a className={styles.action} href={a.href}>
              <svg className={styles.icone} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d={a.icone} fill="none" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {a.libelle}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
