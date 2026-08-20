import { useId, useState } from 'react';
import {
  type Theme, appliquerTheme, lireTheme, themesDisponibles
} from '../theme';
import { appliquerConfidentialite, lireConfidentialite } from '../confidentialite';
import { type StockageLocal, lireSession, sessionValide } from '../../infra/session';
import styles from './PastillesSysteme.module.css';

/**
 * Les indicateurs système de la barre du haut.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX PASTILLES, ET PAS QUATRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La cible en prévoit quatre : Cloud, Documents, Qonto, Palette.
 *
 * Cloud a désormais quelque chose derrière elle — le compte distant, sa
 * session, sa synchronisation — et elle est donc posée. Documents et Qonto,
 * non : l'audit relevait « 0 intégration : ni Drive, ni OneDrive, ni Dropbox,
 * ni coffre », et aucune connexion bancaire n'existe.
 *
 * Les afficher quand même donnerait une barre conforme en apparence et
 * mensongère en pratique : une pastille « Documents » qui n'ouvre rien
 * apprend à l'utilisateur que les pastilles ne servent à rien, et il cessera
 * aussi de regarder celles qui marchent.
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
  const [confidentiel, setConfidentiel] = useState<boolean>(() => lireConfidentialite());
  const idChamp = useId();

  function choisir(valeur: Theme): void {
    appliquerTheme(valeur);
    setTheme(valeur);
  }

  function basculerConfidentialite(): void {
    const actif = !confidentiel;
    appliquerConfidentialite(actif);
    setConfidentiel(actif);
  }

  return (
    <div className={styles.pastilles}>
      <PastilleCloud />

      {/* Le libellé du bouton dit l'ACTION, pas l'état : « masquer les
          montants » indique ce qui va se passer, là où « confidentialité »
          laisse deviner dans quel sens on bascule. `aria-pressed` porte
          l'état, qui est le rôle de l'attribut. */}
      <button
        type="button"
        className={`${styles.bouton} ${confidentiel ? styles.actif : ''}`}
        aria-pressed={confidentiel}
        onClick={basculerConfidentialite}
      >
        <span aria-hidden="true">{confidentiel ? '🙈' : '👁'}</span>
        <span className={styles.libelleBouton}>
          {confidentiel ? 'Montants masqués' : 'Masquer les montants'}
        </span>
      </button>

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

/**
 * L'état du compte distant.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, PAS DEUX
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Relié » et « hors ligne » ne suffisent pas : entre les deux se trouve la
 * session EXPIRÉE, qui est le cas dangereux. L'utilisateur croit être
 * synchronisé, saisit une semaine de travail, et rien n'est remonté. Un point
 * vert dans ce cas serait un mensonge, un point gris un contresens — c'est un
 * avertissement, et il porte la couleur des avertissements.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Aucune requête. La pastille lit une clé de stockage et compare une date :
 * elle vit dans la barre du haut, présente sur les sept écrans, et une
 * pastille qui interroge le réseau à chaque montage coûterait plus cher que
 * ce qu'elle indique. Le rafraîchissement du jeton reste le travail de
 * l'écran Compte, qui le fait quand on s'y rend.
 *
 * C'est un lien vers `#/config/compte` : dire qu'une session a expiré sans
 * offrir le chemin pour s'y reconnecter serait un reproche, pas un outil.
 */
function PastilleCloud() {
  const etat = etatDuCompte();
  return (
    <a
      className={`${styles.bouton} ${styles[etat.ton]}`}
      href="#/config/compte"
      title={etat.detail}
    >
      <span className={styles.point} data-ton={etat.ton} aria-hidden="true" />
      <span className={styles.libelleBouton}>{etat.libelle}</span>
      {/* Le nom accessible porte le DÉTAIL, que le libellé visuel doit
          abréger pour tenir dans la barre. */}
      <span className={styles.horsEcran}>{etat.detail}</span>
    </a>
  );
}

type EtatCompte = {
  readonly ton: 'relie' | 'expire' | 'local';
  readonly libelle: string;
  readonly detail: string;
};

function etatDuCompte(): EtatCompte {
  const local = stockageLocal();
  const session = local === null ? null : lireSession(local);
  if (session === null) {
    return {
      ton: 'local',
      libelle: 'Local',
      detail: 'Tes données restent sur cet appareil. Ouvrir Config › Compte pour les '
        + 'synchroniser.'
    };
  }
  if (!sessionValide(session)) {
    return {
      ton: 'expire',
      libelle: 'Session expirée',
      detail: `Session expirée pour ${session.email}. Tes saisies ne remontent plus : `
        + 'ouvrir Config › Compte pour se reconnecter.'
    };
  }
  return { ton: 'relie', libelle: 'Compte relié', detail: `Compte relié — ${session.email}` };
}

/** Le stockage local, ou `null` quand il est bloqué (navigation privée). */
function stockageLocal(): StockageLocal | null {
  try {
    window.localStorage.setItem('__freel_test__', '1');
    window.localStorage.removeItem('__freel_test__');
    return window.localStorage;
  } catch {
    return null;
  }
}
