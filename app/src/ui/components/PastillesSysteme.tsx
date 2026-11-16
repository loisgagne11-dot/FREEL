import { useConfidentialite } from '../useConfidentialite';
import { type StockageLocal, lireSession, sessionValide } from '../../infra/session';
import styles from './PastillesSysteme.module.css';

/**
 * Les indicateurs système de la barre du haut : la synchronisation, et le
 * masquage des montants.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX PASTILLES, ET PAS QUATRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La cible en prévoit quatre : Cloud, Documents, Qonto, Palette.
 *
 * Cloud a quelque chose derrière elle — le compte distant, sa session, sa
 * synchronisation. Documents et Qonto, non : l'audit relevait « 0 intégration :
 * ni Drive, ni OneDrive, ni Dropbox, ni coffre », et aucune connexion bancaire
 * n'existe. Une pastille qui n'ouvre rien apprend que les pastilles ne servent à
 * rien, et on cesse aussi de regarder celles qui marchent.
 *
 * La palette est partie dans Réglages › Affichage (lot 51, décision 4) : on
 * choisit son thème une fois, et la barre du haut se garde pour ce qu'on
 * touche tous les jours.
 */
export function PastillesSysteme() {
  const [confidentiel, setConfidentiel] = useConfidentialite();

  return (
    <div className={styles.pastilles}>
      <PastilleCloud />

      {/* Une icône, nommée (maquette `navigation.html`). Le nom dit l'ACTION,
          pas l'état : « masquer les montants » dit ce qui va se passer, là où
          « confidentialité » laisse deviner dans quel sens on bascule.
          `aria-pressed` porte l'état, qui est le rôle de l'attribut. */}
      <button
        type="button"
        className={`${styles.icone} ${confidentiel ? styles.actif : ''}`}
        aria-pressed={confidentiel}
        title={confidentiel ? 'Montants masqués' : 'Masquer les montants'}
        onClick={() => setConfidentiel(!confidentiel)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="2.8" />
          {confidentiel && <path d="M4 4l16 16" />}
        </svg>
        <span className={styles.horsEcran}>
          {confidentiel ? 'Montants masqués' : 'Masquer les montants'}
        </span>
      </button>
    </div>
  );
}

/**
 * L'état du compte : la synchronisation, ÉCRITE au bureau.
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
 * ÉCRITE À TOUTE LARGEUR DE BUREAU, ICÔNE AU TÉLÉPHONE (décision 2)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le libellé disparaissait sous 1 680 px, c'est-à-dire sur presque tous les
 * écrans de bureau : il restait un point de huit pixels dont la couleur seule
 * portait l'état. La barre ne porte plus ni période, ni « Exporter », ni
 * « à traiter » : la place existe. Au téléphone, une icône dont le tracé change
 * avec l'état, et dont le nom accessible porte le détail.
 *
 * La maquette écrit « Synchronisé à 9 h 41 ». Aucune heure de dernière
 * synchronisation n'est conservée aujourd'hui : l'écrire serait l'inventer. La
 * pastille dit donc l'état du compte, qui est connu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Aucune requête. La pastille lit une clé de stockage et compare une date :
 * elle vit dans la barre du haut, présente sur tous les écrans, et une
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
    <a className={`${styles.cloud} ${styles[etat.ton]}`} href="#/config/compte" title={etat.detail}>
      <span className={styles.etiquette} data-role="libelle-synchro">
        <span className={styles.point} aria-hidden="true" />
        <span>{etat.libelle}</span>
      </span>
      <svg className={styles.iconeCloud} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 18h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.2 4.4 4.4 0 0 0 7 18z" />
        <path d={MARQUES[etat.ton]} />
      </svg>
      {/* Le nom accessible porte le DÉTAIL, que le libellé visuel doit
          abréger pour tenir dans la barre — et qui est seul à parler au
          téléphone, où le libellé cède la place à l'icône. */}
      <span className={styles.horsEcran}>{etat.detail}</span>
    </a>
  );
}

/** Ce que l'icône porte dans son nuage : une coche, un point d'exclamation, un trait. */
const MARQUES: Readonly<Record<EtatCompte['ton'], string>> = {
  relie: 'M9.5 13.5l2 2 3.5-4',
  expire: 'M12 10.5v3M12 16v.01',
  local: 'M9.5 13.5h5'
};

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
      libelle: 'Non synchronisé',
      detail: 'Tes données restent sur cet appareil. Ouvrir Config › Compte & synchronisation pour les '
        + 'synchroniser.'
    };
  }
  if (!sessionValide(session)) {
    return {
      ton: 'expire',
      libelle: 'Session expirée',
      detail: `Session expirée pour ${session.email}. Tes saisies ne remontent plus : `
        + 'ouvrir Config › Compte & synchronisation pour se reconnecter.'
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
