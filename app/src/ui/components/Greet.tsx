import type { ReactNode } from 'react';
import styles from './Greet.module.css';

/**
 * L'en-tête d'écran de la spec de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN TITRE QUI SITUE, PAS QUI NOMME
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les écrans portaient un `<h1>` nu — « Pilote », « Argent ». Le nom de
 * l'écran est déjà dans le rail et dans la barre du haut : le répéter une
 * troisième fois n'apprend rien. La spec y met autre chose — une phrase qui
 * dit ce qui attend, et un repère chiffré à droite.
 *
 * C'est ce qui fait la différence entre un écran qu'on ouvre et un écran qui
 * vous accueille : « quatre décisions t'attendent » se lit en une seconde,
 * là où quatre tuiles demandent d'être comparées.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE TITRE RESTE UN `H1`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un seul par page, en tête du contenu principal : c'est le repère qu'un
 * lecteur d'écran annonce à l'arrivée, et le point de saut du lien
 * d'évitement. Le sous-titre et le repère chiffré ne sont pas des titres et
 * n'en prennent pas le rôle.
 */
export function Greet(
  { titre, sousTitre, repere, actions }: {
    readonly titre: ReactNode;
    /** La phrase qui situe : ce qui attend, ce qui vient de changer. */
    readonly sousTitre?: ReactNode;
    /** Le repère chiffré de droite — solde, période, total. Se lit, ne se clique pas. */
    readonly repere?: ReactNode;
    /**
     * Les commandes de l'écran : navigation de mois, ajout.
     *
     * Séparées du repère parce qu'elles ne sont pas de même nature — l'un
     * s'annonce comme du texte, les autres doivent être atteignables au
     * clavier et annoncées comme des commandes.
     */
    readonly actions?: ReactNode;
  }
) {
  return (
    <header className={styles.greet}>
      <div className={styles.texte}>
        <h1 className={styles.titre}>{titre}</h1>
        {sousTitre !== undefined && <p className={styles.sousTitre}>{sousTitre}</p>}
      </div>
      {(repere !== undefined || actions !== undefined) && (
        <div className={styles.cote}>
          {repere !== undefined && <p className={styles.repere}>{repere}</p>}
          {actions !== undefined && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
    </header>
  );
}
