import { useEffect } from 'react';
import { useConfidentialite } from '../useConfidentialite';
import { type Session, type StockageLocal, lireSession, sessionValide } from '../../infra/session';
import { lireBase } from '../../infra/synchro.appareil';
import type { EtatSynchroAppareil } from '../../infra/synchro.etat';
import { quandSynchro, useEtatSynchro } from '../synchro.affichage';
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
 * ELLE DIT LA VÉRITÉ, OU ELLE SE TAIT (lot 42)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Synchronisé, elle donne l'HEURE de la dernière synchronisation réussie —
 * « Synchronisé à 9 h 41 », « Synchronisé hier » : c'est le retard qu'on veut
 * voir d'un coup d'œil. Puis ce qui se passe : « Envoi… », « Hors ligne —
 * changements à envoyer », « À choisir », « Reconnecte-toi ». L'heure vient de
 * ce que l'appareil retient de sa dernière synchronisation
 * (`infra/synchro.appareil`) ; l'état, du moteur (`infra/synchro.etat`).
 * Jusqu'au lot 42, aucune heure n'était conservée et la pastille ne disait
 * que « relié » : écrire une heure aurait été l'inventer.
 *
 * Un appareil qui n'a JAMAIS synchronisé garde les trois états d'avant, et le
 * cas qui les justifiait : la session EXPIRÉE. L'utilisateur croit être
 * synchronisé, saisit une semaine de travail, et rien n'est remonté. Un point
 * vert dans ce cas serait un mensonge, un point gris un contresens — c'est un
 * avertissement, et il porte la couleur des avertissements. Synchronisé, une
 * session expirée n'a rien d'alarmant : le moteur la renouvelle ; seul un
 * REFUS du serveur fait dire « Reconnecte-toi ».
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
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Aucune requête. La pastille lit deux clés de stockage et l'état publié par
 * le moteur : elle vit dans la barre du haut, présente sur tous les écrans, et
 * une pastille qui interroge le réseau à chaque montage coûterait plus cher
 * que ce qu'elle indique. Le réseau, c'est le moteur ; le jeton d'un appareil
 * jamais synchronisé, l'écran Compte, quand on s'y rend.
 *
 * C'est un lien vers `#/reglages/compte` : dire qu'il faut choisir, ou se
 * reconnecter, sans offrir le chemin serait un reproche, pas un outil.
 */
function PastilleCloud() {
  const synchro = useEtatSynchro();
  const etat = etatDuCompte(synchro);
  const relie = etat.session;
  /*
   * La synchronisation automatique démarre ici, et pas dans `main.tsx` : le
   * paquet d'entrée est à 79,67 Ko sur 80, et cette barre est déjà différée.
   * Elle arrive après le premier rendu, sur tous les écrans, et seulement si
   * une session existe — qui n'a jamais relié de compte ne télécharge rien.
   */
  useEffect(() => {
    if (!relie) return;
    void import('../../infra/synchro.moteur').then((m) => m.demarrerSynchroAutomatique(), () => undefined);
  }, [relie]);
  return (
    <a className={`${styles.cloud} ${styles[etat.ton]}`} href="#/reglages/compte" title={etat.detail}
      data-etat={synchro.phase}>
      <span className={styles.etiquette} data-role="libelle-synchro">
        <span className={styles.point} aria-hidden="true" />
        <span className={etat.libelleCourt === undefined ? undefined : styles.libelleLong}>{etat.libelle}</span>
        {etat.libelleCourt !== undefined && (
          <span className={styles.libelleCourt} aria-hidden="true">{etat.libelleCourt}</span>
        )}
      </span>
      <svg className={styles.iconeCloud} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 18h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.2 4.4 4.4 0 0 0 7 18z" />
        <path d={MARQUES[etat.marque]} />
      </svg>
      {/* Le nom accessible porte le DÉTAIL, que le libellé visuel doit
          abréger pour tenir dans la barre — et qui est seul à parler au
          téléphone, où le libellé cède la place à l'icône. */}
      <span className={styles.horsEcran}>{etat.detail}</span>
    </a>
  );
}

/**
 * Ce que l'icône porte dans son nuage, au téléphone : une coche (synchronisé),
 * une flèche (envoi), un point d'exclamation (il faut agir), une barre (hors
 * ligne), un trait (rien de relié, ou rien qui bouge). La couleur suit le ton ;
 * le tracé, lui, se lit sans elle.
 */
const MARQUES: Readonly<Record<EtatCompte['marque'], string>> = {
  coche: 'M9.5 13.5l2 2 3.5-4',
  fleche: 'M12 16v-5M9.8 13l2.2-2.2 2.2 2.2',
  alerte: 'M12 10.5v3M12 16v.01',
  barre: 'M9 11l6 5',
  trait: 'M9.5 13.5h5'
};

type EtatCompte = {
  readonly ton: 'relie' | 'expire' | 'local';
  readonly marque: 'coche' | 'fleche' | 'alerte' | 'barre' | 'trait';
  readonly libelle: string;
  /**
   * Le libellé d'un bureau étroit (761 à 1 000 px), quand le long ne tient
   * pas : capturé à 800 px, « Hors ligne — changements à envoyer » écrasait la
   * recherche à une loupe et une lettre. Le nom accessible garde le détail.
   */
  readonly libelleCourt?: string;
  readonly detail: string;
  /** Une session existe : la synchronisation automatique a de quoi démarrer. */
  readonly session: boolean;
};

const VERS_COMPTE = 'Ouvrir Réglages › Compte & synchronisation';

const MOTIFS_ANOMALIE: Readonly<Record<Extract<EtatSynchroAppareil, { phase: 'anomalie' }>['pourquoi'], string>> = {
  'compte-efface': 'Le compte ne contient plus rien : il a sans doute été effacé depuis un autre appareil.',
  'version-anterieure': 'Le compte est revenu à un état plus ancien que celui que cet appareil a vu.',
  'compte-illisible': 'Le contenu du compte ne se lit pas ici.'
};

function etatDuCompte(synchro: EtatSynchroAppareil): EtatCompte {
  const local = stockageLocal();
  const session = local === null ? null : lireSession(local);
  // AVANT l'absence de session : un refus du serveur l'efface
  // (`reprendreSession`), et la pastille aurait dit « Non synchronisé » à
  // quelqu'un dont les modifications attendent seulement qu'il se reconnecte.
  if (synchro.phase === 'reconnecter') {
    return {
      ton: 'expire', marque: 'alerte', session: session !== null, libelle: 'Reconnecte-toi',
      detail: `La session${session === null ? '' : ` de ${session.email}`} a été refusée. Tes données restent `
        + `sur cet appareil, rien n’est perdu : ${VERS_COMPTE} pour te reconnecter.`
    };
  }
  if (session === null) {
    return {
      ton: 'local', marque: 'trait', session: false,
      libelle: 'Non synchronisé',
      detail: `Tes données restent sur cet appareil. ${VERS_COMPTE} pour les synchroniser.`
    };
  }
  const base = local === null ? null : lireBase(local, session.utilisateurId);
  if (base === null) return { ...avantLaPremiere(session), session: true };
  const etat = (e: Omit<EtatCompte, 'session'>): EtatCompte => ({ ...e, session: true });
  const derniere = quandSynchro(synchro.phase === 'a-jour' ? synchro.le : base.le);
  const depuis = `Dernière synchronisation ${derniere.long}.`;
  switch (synchro.phase) {
    // `inactif` avec une base : le moteur n'a pas encore parlé. L'heure de la
    // dernière synchronisation reste vraie en attendant.
    case 'inactif':
    case 'a-jour':
      return etat({
        ton: 'relie', marque: 'coche', libelle: `Synchronisé ${derniere.court}`,
        detail: `Synchronisé ${derniere.long} — ${session.email}. Tes autres appareils le reçoivent à leur `
          + 'prochaine ouverture, ou quand tu y reviens.'
      });
    case 'envoi':
      return etat({
        ton: 'relie', marque: 'fleche', libelle: 'Envoi…',
        detail: `Envoi de tes dernières modifications vers le compte. ${depuis}`
      });
    case 'hors-ligne':
      return synchro.aEnvoyer
        ? etat({
          ton: 'expire', marque: 'barre', libelle: 'Hors ligne — changements à envoyer',
          libelleCourt: 'Hors ligne · à envoyer',
          detail: 'Hors ligne. Tes modifications sont enregistrées sur cet appareil et partiront au retour '
            + `du réseau. ${depuis}`
        })
        : etat({
          ton: 'local', marque: 'barre', libelle: 'Hors ligne',
          detail: `Hors ligne. ${depuis} FREEL regardera le compte au retour du réseau.`
        });
    case 'a-choisir':
      return etat({
        ton: 'expire', marque: 'alerte', libelle: 'À choisir',
        detail: synchro.pourquoi === 'appareil-vide'
          ? 'Cet appareil a été vidé, le compte porte encore tes données : FREEL ne le vide pas sans te le '
            + `demander. ${VERS_COMPTE} pour choisir.`
          : 'Cet appareil et le compte ont changé chacun de leur côté : FREEL ne mélange pas les deux. '
            + `${VERS_COMPTE} pour choisir lequel garder.`
      });
    case 'attente-saisie':
      return etat({
        ton: 'local', marque: 'trait', libelle: 'Mise à jour en attente',
        detail: 'Le compte a changé depuis un autre appareil. FREEL le prendra quand tu auras fermé le '
          + 'formulaire en cours : rien ne change sous tes doigts.'
      });
    case 'mettre-a-jour':
      return etat({
        ton: 'expire', marque: 'alerte', libelle: 'Mets FREEL à jour',
        detail: 'Le compte a été enregistré par une version plus récente de FREEL. Recharge la page pour '
          + 'la mettre à jour : d’ici là, rien n’est envoyé ni reçu.'
      });
    case 'anomalie':
      return etat({
        ton: 'expire', marque: 'alerte', libelle: 'À vérifier',
        detail: `${MOTIFS_ANOMALIE[synchro.pourquoi]} Rien n’est envoyé tout seul : ${VERS_COMPTE}.`
      });
    case 'demonstration':
      return etat({
        ton: 'local', marque: 'trait', libelle: 'Démonstration',
        detail: `Cet appareil montre la démonstration : rien n’est envoyé ni reçu. ${VERS_COMPTE} pour `
          + 'reprendre tes données.'
      });
    case 'erreur':
      return etat({
        ton: 'expire', marque: 'alerte', libelle: synchro.aEnvoyer ? 'Envoi en échec' : 'Synchro en échec',
        detail: `Le serveur n’a pas accepté la synchronisation ; nouvel essai dans quelques minutes. ${depuis} `
          + `${VERS_COMPTE} pour le détail.`
      });
  }
}

/** Relié, mais jamais synchronisé : les trois états d'avant le lot 42. */
function avantLaPremiere(session: Session): Omit<EtatCompte, 'session'> {
  if (!sessionValide(session)) {
    return {
      ton: 'expire', marque: 'alerte',
      libelle: 'Session expirée',
      detail: `Session expirée pour ${session.email}. Tes saisies ne remontent plus : `
        + 'ouvrir Réglages › Compte & synchronisation pour se reconnecter.'
    };
  }
  return { ton: 'relie', marque: 'coche', libelle: 'Compte relié', detail: `Compte relié — ${session.email}` };
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
