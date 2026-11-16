import { useId, useState } from 'react';
import { type Theme, appliquerTheme, lireTheme, themesDisponibles } from '../theme';
import { useConfidentialite } from '../useConfidentialite';
import styles from './Config.module.css';
import affichage from './Config.affichage.module.css';

/**
 * Réglages › Affichage : le thème, et le masquage des montants (lot 51,
 * décision 4 — maquette `docs/design/direction/navigation.html`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LE THÈME QUITTE LA BARRE DU HAUT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * On le choisit une fois. Un menu « Palette » sur tous les écrans occupait la
 * place de ce qu'on touche tous les jours, et ne montrait que des noms — un
 * nom de thème ne dit pas à quoi il ressemble. Ici, chaque carte porte trois
 * pastilles : le fond, l'accent et l'alerte du thème.
 *
 * Les pastilles ne portent AUCUNE couleur écrite : chacune est posée sous un
 * `data-theme` à elle, et lit les jetons de ce thème dans `tokens.css`. Une
 * teinte changée là change ici, sans qu'on y pense.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * « MASQUER LES MONTANTS » EST AUSSI DANS LA BARRE DU HAUT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Là-haut pour le geste — on partage son écran, on masque, tout de suite —,
 * ici pour le trouver en cherchant ce qui règle l'affichage. Les deux
 * commandes suivent le même état (`useConfidentialite`) : basculer l'une se
 * voit sur l'autre.
 */
export function Affichage() {
  const [theme, setTheme] = useState<Theme>(() => lireTheme());
  const [confidentiel, setConfidentiel] = useConfidentialite();
  const id = useId();

  function choisir(valeur: Theme): void {
    appliquerTheme(valeur);
    setTheme(valeur);
  }

  return (
    <>
      <section className={styles.carte} aria-labelledby={`${id}-theme`}>
        <h3 id={`${id}-theme`} className={styles.titreCarte}>Thème</h3>
        <div className={affichage.themes} role="group" aria-labelledby={`${id}-theme`}>
          {themesDisponibles.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${affichage.theme} ${t.id === theme ? affichage.choisi : ''}`}
              aria-pressed={t.id === theme}
              onClick={() => choisir(t.id)}
            >
              <span className={affichage.pastilles} data-theme={t.id} aria-hidden="true">
                <i className={affichage.fond} />
                <i className={affichage.accent} />
                <i className={affichage.alerte} />
              </span>
              <span className={affichage.nom}>{t.libelle}</span>
              <small className={affichage.description}>{t.description}</small>
            </button>
          ))}
        </div>
        {/* Le choix survit à la fermeture : sans le dire, on le referait à
            chaque ouverture par précaution. */}
        <p className={styles.aide}>Le thème choisi reste mémorisé sur cet appareil.</p>
      </section>

      <section className={styles.carte} aria-label="Montants">
        <div className={styles.interrupteur}>
          <label htmlFor={`${id}-montants`}>Masquer les montants</label>
          <input
            id={`${id}-montants`}
            type="checkbox"
            role="switch"
            checked={confidentiel}
            onChange={(e) => setConfidentiel(e.target.checked)}
            aria-describedby={`${id}-montants-aide`}
          />
        </div>
        {/* Ce que le mode fait vraiment : un flou, que le survol lève le temps
            de lire. Promettre « des points » ou « illisible » ferait croire à
            une protection qu'un passage de souris défait. */}
        <p id={`${id}-montants-aide`} className={styles.aide}>
          Pour ouvrir l’application dans un lieu public ou partager ton écran&nbsp;: les
          montants se floutent, et le survol de l’un d’eux le rend lisible le temps de le lire.
        </p>
      </section>
    </>
  );
}
