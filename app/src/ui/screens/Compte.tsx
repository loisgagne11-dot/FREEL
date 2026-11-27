import { Suspense, useEffect, useId, useState } from 'react';
import {
  type ConfigSupabase, type Session, type StockageLocal, configDeBuild, configEffective,
  ecrireConfig, ecrireSession, lireSession, reprendreSession
} from '../../infra/supabase';
import { oublierRetourDuLien, retourDuLien } from '../../infra/retourDuLien';
import type { verifierProjet } from '../../infra/supabase.verification';
import type { MoteurSynchro } from '../../infra/synchro.moteur';
import type { EtapeGuide } from './Compte.guide';
import { composantALaDemande } from '../composantALaDemande';
import { SanteDuProjet } from './Compte.sante';
import styles from './Compte.module.css';

/**
 * Réglages › Compte & synchronisation — le parcours de première connexion
 * (maquette `docs/design/direction/compte.html`, retenue le 22/11).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE L'ÉCRAN MONTRE, ET DANS QUEL ORDRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  · rien n'est relié : le pourquoi en une phrase, et deux portes — être guidé,
 *    ou aller droit à l'adresse et à la clé (« J'ai déjà un projet ») ;
 *  · le guide, en cinq étapes vérifiées (`Compte.guide`) ;
 *  · relié mais pas connecté : « Ton compte » (`Compte.connexion`) et la santé
 *    du projet ;
 *  · connecté : la réponse d'abord — « Sauvegardé, à jour » —, puis la santé,
 *    puis les gestes rares (`Compte.relie`) ;
 *  · revenu d'un lien de courriel : son code, échangé (`Compte.connexion`).
 *
 * Il demandait autrefois l'adresse et la clé d'emblée, et renvoyait à un
 * fichier du dépôt pour préparer la base : le propriétaire n'a pas pu relier
 * son compte (21/11). Chaque morceau est chargé à la demande — l'écran
 * entier dépassait le budget d'un écran différé (34,6 Ko sur 40) avant même
 * le guide.
 */

const Guide = composantALaDemande(() => import('./Compte.guide').then((m) => m.Guide), false);
const TonCompte = composantALaDemande(() => import('./Compte.connexion').then((m) => m.TonCompte), false);
const RetourDuLien = composantALaDemande(() => import('./Compte.connexion').then((m) => m.RetourDuLien), false);
const Relie = composantALaDemande(() => import('./Compte.relie').then((m) => m.Relie), false);

/** Le stockage du navigateur, ou un substitut inerte s'il est bloqué. */
function stockageNavigateur(
  type: 'localStorage' | 'sessionStorage' = 'localStorage'
): StockageLocal {
  try {
    const s = window[type];
    s.setItem('__freel_test__', '1');
    s.removeItem('__freel_test__');
    return s;
  } catch {
    const memoire = new Map<string, string>();
    return {
      getItem: (c: string) => memoire.get(c) ?? null,
      setItem: (c: string, v: string) => { memoire.set(c, v); },
      removeItem: (c: string) => { memoire.delete(c); }
    };
  }
}

/**
 * L'étape du guide en cours, dans le stockage de SESSION de l'onglet.
 *
 * C'est un état d'écran, pas un fait : il survit à l'aller-retour vers
 * supabase.com et à un rechargement, pas à la fermeture de l'onglet. Le
 * mettre dans les faits l'aurait fait voyager sur le compte vers les autres
 * appareils, qui n'en ont que faire.
 */
const CLE_GUIDE = 'freel.compte.guide';

function lireEtape(s: StockageLocal): EtapeGuide | null {
  const n = Number(s.getItem(CLE_GUIDE));
  return n >= 1 && n <= 5 && Number.isInteger(n) ? n as EtapeGuide : null;
}

function ecrireEtape(s: StockageLocal, e: EtapeGuide | null): void {
  try {
    if (e === null) s.removeItem(CLE_GUIDE);
    else s.setItem(CLE_GUIDE, String(e));
  } catch { /* sans stockage, le guide reprendra à l'accueil : rien de perdu */ }
}

export interface ProprietesCompte {
  /** Injectable pour les tests, où `window` n'a pas de stockage utile. */
  readonly stockage?: StockageLocal;
  /** Le stockage de l'onglet, où vit l'étape du guide. Injectable aussi. */
  readonly ecran?: StockageLocal;
  /** La vérification du projet. Injectable pour les tests. */
  readonly verifier?: typeof verifierProjet;
  /** Le moteur de la synchronisation automatique. Injectable pour les tests. */
  readonly moteur?: MoteurSynchro;
}

export function Compte({ stockage, ecran, verifier, moteur }: ProprietesCompte = {}) {
  const [local] = useState(() => stockage ?? stockageNavigateur());
  const [memoireEcran] = useState(() => ecran ?? stockageNavigateur('sessionStorage'));
  const projetFixe = configDeBuild() !== null;

  const [config, setConfig] = useState<ConfigSupabase | null>(() => configEffective(local));
  const [session, setSession] = useState<Session | null>(null);
  // Une session conservée se reprend de façon asynchrone ; sans session
  // conservée, rien à attendre — le formulaire s'affiche d'emblée.
  const [repriseFaite, setRepriseFaite] = useState(() => config === null || lireSession(local) === null);
  const [etape, setEtapeEtat] = useState<EtapeGuide | null>(() => (projetFixe ? null : lireEtape(memoireEcran)));
  const [retour, setRetour] = useState<URLSearchParams | null>(() => retourDuLien());
  const [message, setMessage] = useState<string | null>(null);

  function allerA(e: EtapeGuide | null): void {
    setEtapeEtat(e);
    ecrireEtape(memoireEcran, e);
  }

  // Une session conservée est reprise au chargement, et renouvelée si elle
  // approche de son terme : sans cela, il faudrait se reconnecter à chaque
  // ouverture de l'application. Le renouvellement passe par un verrou commun
  // aux onglets : voir `reprendreSession`, et pourquoi deux onglets se
  // déconnectaient.
  useEffect(() => {
    if (config === null || repriseFaite) return;
    let vivant = true;
    void reprendreSession(config, local).then((s) => {
      if (!vivant) return;
      if (s !== null) setSession(s);
      setRepriseFaite(true);
    });
    return () => { vivant = false; };
    // `local` et `config` sont ceux de l'ouverture de l'écran : une reprise, pas un suivi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function seConnecte(s: Session, texte: string | null): void {
    ecrireSession(local, s);
    setSession(s);
    setRepriseFaite(true);
    setMessage(texte);
    if (etape === 4) allerA(5);
  }

  function relier(c: ConfigSupabase): void {
    ecrireConfig(local, c);
    setConfig(c);
  }

  /**
   * « Changer de projet » mène droit à l'adresse et à la clé : c'est ce qu'on
   * vient changer. Une adresse enregistrée par erreur ne se corrigeait plus
   * (21/11) ; on ne change de projet que déconnecté, une session ouverte
   * appartenant au projet d'avant.
   */
  function oublierProjet(): void {
    ecrireConfig(local, null);
    setConfig(null);
    setSession(null);
    setMessage(null);
    allerA(3);
  }

  const attente = <p className={styles.consequence}>Chargement…</p>;
  const statut = message !== null && <p role="status" className={styles.succes}>{message}</p>;

  let vue;
  if (retour !== null) {
    vue = (
      <RetourDuLien
        config={config}
        stockage={local}
        retour={retour}
        onSession={(s, motif, texte) => {
          seConnecte(s, texte);
          // Une inscription confirmée : il reste à fermer la porte.
          if (motif === 'inscription' && !projetFixe) allerA(5);
        }}
        onFini={() => { oublierRetourDuLien(); setRetour(null); }}
      />
    );
  } else if (etape !== null) {
    vue = (
      <Guide
        etape={etape}
        onEtape={allerA}
        config={config}
        onConfig={relier}
        stockage={local}
        session={session}
        onSession={seConnecte}
        onQuitter={() => allerA(null)}
        {...(verifier === undefined ? {} : { verifier })}
      />
    );
  } else if (config === null) {
    vue = <Accueil onGuider={() => allerA(1)} onDejaProjet={() => allerA(3)} />;
  } else if (!repriseFaite) {
    vue = <p className={styles.consequence}>Lecture de la session…</p>;
  } else if (session === null) {
    vue = (
      <div className={styles.pile}>
        <TonCompte
          titre="Ton compte"
          config={config}
          stockage={local}
          onSession={seConnecte}
          entete={(
            <p className={styles.explication}>
              Projet relié&nbsp;: <strong className={styles.mono}>{new URL(config.url).host}</strong>
            </p>
          )}
        />
        <SanteDuProjet
          config={config}
          {...(verifier === undefined ? {} : { verifier })}
          pied={!projetFixe && (
            <button type="button" className={styles.action} onClick={oublierProjet}>Changer de projet</button>
          )}
        />
      </div>
    );
  } else {
    const relie = config;
    vue = (
      <Relie
        config={relie}
        session={session}
        local={local}
        projetFixe={projetFixe}
        onDeconnecte={(texte) => { setSession(null); setMessage(texte); }}
        onChangerDeProjet={oublierProjet}
        {...(moteur === undefined ? {} : { moteur })}
        sante={(pied, suite) => (
          <SanteDuProjet config={relie} pied={pied} suite={suite} {...(verifier === undefined ? {} : { verifier })} />
        )}
      />
    );
  }

  return (
    <div className={styles.pile}>
      <Suspense fallback={attente}>{vue}</Suspense>
      {statut}
    </div>
  );
}

/**
 * Rien n'est relié (maquette, état 1) : le pourquoi, en une phrase, et deux
 * portes. Plus de champs techniques d'emblée.
 */
function Accueil({ onGuider, onDejaProjet }: { onGuider: () => void; onDejaProjet: () => void }) {
  const id = useId();
  return (
    <div className={styles.pile}>
      <section className={styles.carte} aria-labelledby={`${id}-relier`}>
        <h3 id={`${id}-relier`} className={styles.titreCarte}>Tes données sont sur cet appareil</h3>
        <p className={styles.explication}>
          Si ce navigateur est effacé, elles partent avec lui. Pour les
          {' '}<strong>sauvegarder</strong> et les retrouver <strong>sur ton
          téléphone</strong>, relie FREEL à ton propre espace Supabase&nbsp;:
          gratuit, à ton nom. FREEL n’y a pas accès, et personne d’autre.
        </p>
        <div className={styles.choix}>
          <button type="button" className={`${styles.actionPrincipale} ${styles.actionVerte} ${styles.pleineLargeur}`}
            onClick={onGuider}>
            Me guider pas à pas
          </button>
          <button type="button" className={`${styles.actionPrincipale} ${styles.pleineLargeur}`} onClick={onDejaProjet}>
            J’ai déjà un projet Supabase
          </button>
        </div>
      </section>
      <section className={styles.carte} aria-labelledby={`${id}-sans`}>
        <h3 id={`${id}-sans`} className={styles.titreCarte}>Sans compte</h3>
        <p className={styles.explication}>
          Une sauvegarde en fichier, à ranger où tu veux (ton Drive, une clé USB).
        </p>
        <a className={styles.lien} href="#/reglages/donnees">Réglages › Données &amp; export ›</a>
      </section>
    </div>
  );
}
