import { useId, useState } from 'react';
import {
  type Theme, appliquerTheme, lireTheme, themesDisponibles
} from '../theme';
import styles from './PastillesSysteme.module.css';

/**
 * Les indicateurs système de la barre du haut.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI SEULEMENT LA PALETTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La cible prévoit quatre pastilles : Cloud, Documents, Qonto, Palette. Trois
 * n'ont rien derrière elles — l'audit relevait « 0 intégration : ni Drive, ni
 * OneDrive, ni Dropbox, ni coffre », et aucune connexion bancaire n'existe.
 *
 * Les afficher quand même donnerait une barre conforme en apparence et
 * mensongère en pratique : une pastille « Documents » qui n'ouvre rien
 * apprend à l'utilisateur que les pastilles ne servent à rien, et il cessera
 * aussi de regarder celles qui marchent. On pose celle qui fonctionne, les
 * autres viendront avec ce qu'elles indiquent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA PALETTE ÉTAIT INACCESSIBLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les quatre palettes existent, sont testées, et le vérificateur responsive
 * les parcourt toutes — mais uniquement en écrivant dans `localStorage`.
 * Aucun bouton de l'application n'en changeait. Une fonction sans porte
 * d'entrée n'existe pas pour celui qui s'en sert.
 */
export function PastillesSysteme() {
  const [theme, setTheme] = useState<Theme>(() => lireTheme());
  const idChamp = useId();

  function choisir(valeur: Theme): void {
    appliquerTheme(valeur);
    setTheme(valeur);
  }

  return (
    <div className={styles.pastilles}>
      <div className={styles.pastille}>
        {/* Le libellé disparaît sous 1320 px (exigence de la cible), mais
            reste dans l'arbre d'accessibilité : un `display: none` priverait
            le champ de son nom accessible. */}
        <label htmlFor={`${idChamp}-theme`} className={styles.libelle}>Palette</label>
        <select
          id={`${idChamp}-theme`}
          className={styles.choix}
          value={theme}
          onChange={(e) => choisir(e.target.value as Theme)}
        >
          {themesDisponibles.map((t) => (
            <option key={t.id} value={t.id}>{t.libelle}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
