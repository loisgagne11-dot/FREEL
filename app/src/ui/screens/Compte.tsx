import { useEffect, useId, useState } from 'react';
import { useFaits } from '../../state/store';
import {
  type ConfigSupabase, type DonneesLegacy, type InstantaneDistant, type Session,
  bundleDepuisLegacy, chargerDonneesLegacy, configDeBuild, configEffective,
  ecrireConfig, ecrireSession, lireSession, pousserFaits, rafraichir,
  seConnecter, seDeconnecter, sessionValide, tirerFaits
} from '../../infra/supabase';
import {
  VERSION_SCHEMA, type Faits, completerFaits, motifRefusFaits
} from '../../state/schema';
import { convertirBundle, type RapportMigration } from '../../infra/migration';
import { Info } from '../components/Info';
import { dateCourte } from '../format';
import styles from './Compte.module.css';

/**
 * Compte distant — connexion, chargement et enregistrement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ON MONTRE AVANT DE REMPLACER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Récupérer les données du compte ÉCRASE l'état local. C'est ce qu'on veut
 * — c'est le sens d'un compte partagé entre appareils — mais le faire en
 * silence ferait disparaître une saisie faite hors ligne sans que personne le
 * voie. L'écran affiche donc d'abord ce qui serait chargé, et attend une
 * confirmation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX TABLES, ET UNE SEULE REÇOIT DES ÉCRITURES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La table de l'ancienne application est LUE, jamais modifiée : c'est la
 * condition pour que l'ancienne version reste utilisable pendant toute la
 * cohabitation, et pour qu'un essai de la nouvelle ne puisse pas abîmer des
 * données comptables. Les faits de cette version-ci vont dans une table
 * distincte, la seule où l'écran écrive.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUCUN ENVOI À L'AVEUGLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque envoi porte la version qu'on a lue. Si le compte a bougé depuis, le
 * serveur refuse, et l'écran présente les deux états côte à côte : c'est à
 * l'utilisateur de trancher, en sachant ce qu'il perd de chaque côté. Tant
 * que l'état du compte n'est pas connu, l'envoi reste indisponible — envoyer
 * sans savoir sur quoi on écrit est précisément ce qu'il faut empêcher.
 */

/** Le stockage du navigateur, ou un substitut inerte s'il est bloqué. */
function stockageNavigateur() {
  try {
    window.localStorage.setItem('__freel_test__', '1');
    window.localStorage.removeItem('__freel_test__');
    return window.localStorage;
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
 * Ce qu'on sait de la ligne du compte.
 *
 * `'inconnu'` n'est pas `null` : l'un dit « le compte est vide », l'autre
 * « on n'a pas réussi à regarder ». Les confondre autoriserait un premier
 * envoi qui écraserait en fait des données existantes.
 */
type EtatDistant = InstantaneDistant | null | 'inconnu';

type Etat =
  | { readonly phase: 'deconnecte' }
  | { readonly phase: 'connecte'; readonly session: Session }
  | {
    readonly phase: 'apercu-legacy';
    readonly session: Session;
    readonly donnees: DonneesLegacy;
    readonly rapport: RapportMigration;
  }
  | {
    readonly phase: 'apercu-distant';
    readonly session: Session;
    readonly instantane: InstantaneDistant;
    readonly faits: Faits;
  }
  | {
    readonly phase: 'conflit';
    readonly session: Session;
    readonly distant: InstantaneDistant | null;
  };

interface Resume {
  readonly clients: number;
  readonly missions: number;
  readonly recettes: number;
  readonly depenses: number;
}

function resumer(faits: Faits): Resume {
  return {
    clients: faits.clients.length,
    missions: faits.missions.length,
    recettes: faits.recettes.length,
    depenses: faits.depenses.length
  };
}

export interface ProprietesCompte {
  /** Injectable pour les tests, où `window` n'a pas de stockage utile. */
  readonly stockage?: ReturnType<typeof stockageNavigateur>;
}

export function Compte({ stockage }: ProprietesCompte = {}) {
  const local = stockage ?? stockageNavigateur();
  const remplacerParBundle = useFaits((e) => e.remplacerParBundle);
  const adopterFaitsDistants = useFaits((e) => e.adopterFaitsDistants);
  const faitsLocaux = useFaits((e) => e.faits);

  const [config, setConfig] = useState<ConfigSupabase | null>(() => configEffective(local));
  const [etat, setEtat] = useState<Etat>({ phase: 'deconnecte' });
  const [distant, setDistant] = useState<EtatDistant>('inconnu');
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const idChamp = useId();

  // Une session conservée est reprise au chargement, et renouvelée si elle
  // approche de son terme : sans cela, il faudrait se reconnecter à chaque
  // ouverture de l'application.
  useEffect(() => {
    const session = lireSession(local);
    if (session === null || config === null) return;

    if (sessionValide(session)) {
      setEtat({ phase: 'connecte', session });
      void relireEtatDistant(session);
      return;
    }
    void rafraichir(config, session).then((r) => {
      if (r.statut === 'ok') {
        ecrireSession(local, r.valeur);
        setEtat({ phase: 'connecte', session: r.valeur });
        void relireEtatDistant(r.valeur);
      } else {
        ecrireSession(local, null);
      }
    });
    // `local` et `config` sont stables sur la durée de vie de l'écran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (config === null) {
    return <SaisieConfig idChamp={idChamp} onValider={(c) => {
      ecrireConfig(local, c);
      setConfig(c);
    }} />;
  }

  /**
   * Va chercher où en est le compte.
   *
   * Un échec laisse l'état à `'inconnu'`, ce qui interdit l'envoi. C'est
   * voulu : écrire sans savoir ce qu'on recouvre est la seule façon de perdre
   * des données sans s'en apercevoir.
   */
  async function relireEtatDistant(session: Session): Promise<InstantaneDistant | null> {
    if (config === null) return null;
    const r = await tirerFaits(config, session);
    if (r.statut === 'erreur') {
      setDistant('inconnu');
      setErreur(r.motif);
      return null;
    }
    setDistant(r.valeur);
    return r.valeur;
  }

  async function connecter(email: string, motDePasse: string): Promise<void> {
    if (config === null) return;
    setEnCours(true);
    setErreur(null);
    const r = await seConnecter(config, email, motDePasse);
    if (r.statut === 'erreur') { setEnCours(false); setErreur(r.motif); return; }
    ecrireSession(local, r.valeur);
    setEtat({ phase: 'connecte', session: r.valeur });
    await relireEtatDistant(r.valeur);
    setEnCours(false);
  }

  /* ── Envoyer ─────────────────────────────────────────────────────────── */

  async function envoyer(session: Session, versionAttendue: number | null): Promise<void> {
    if (config === null) return;
    setEnCours(true);
    setErreur(null);
    setMessage(null);

    const r = await pousserFaits(
      config, session, faitsLocaux, VERSION_SCHEMA, versionAttendue
    );
    setEnCours(false);

    if (r.statut === 'erreur') { setErreur(r.motif); return; }
    if (r.statut === 'conflit') {
      setDistant(r.distant);
      setEtat({ phase: 'conflit', session, distant: r.distant });
      return;
    }
    setDistant(r.instantane);
    setEtat({ phase: 'connecte', session });
    setMessage('Données de cet appareil enregistrées sur le compte.');
  }

  /* ── Récupérer ───────────────────────────────────────────────────────── */

  async function recuperer(session: Session): Promise<void> {
    setEnCours(true);
    setErreur(null);
    setMessage(null);

    const instantane = await relireEtatDistant(session);
    setEnCours(false);
    if (instantane === null) {
      setMessage('Ce compte ne contient encore aucune donnée de cette version.');
      return;
    }

    // Un bloc écrit par une version plus récente est refusé ici, avant tout
    // remplacement : le charger reviendrait à effacer ce que ce code ne sait
    // pas lire dès le premier renvoi.
    const motif = motifRefusFaits(instantane.faits);
    if (motif !== null) { setErreur(motif); return; }

    setEtat({
      phase: 'apercu-distant', session, instantane, faits: completerFaits(instantane.faits)
    });
  }

  function confirmerRecuperation(session: Session, faits: Faits): void {
    const motif = adopterFaitsDistants(faits);
    if (motif !== null) { setErreur(motif); return; }
    setEtat({ phase: 'connecte', session });
    setMessage('Données du compte chargées. Elles remplacent l’état de cet appareil.');
  }

  /* ── Ancienne application ────────────────────────────────────────────── */

  async function apercevoirLegacy(session: Session): Promise<void> {
    if (config === null) return;
    setEnCours(true);
    setErreur(null);
    setMessage(null);

    const r = await chargerDonneesLegacy(config, session);
    setEnCours(false);
    if (r.statut === 'erreur') { setErreur(r.motif); return; }
    if (r.valeur === null) {
      setMessage('Ce compte ne contient aucune donnée de l’ancienne application.');
      return;
    }
    const { rapport } = convertirBundle(bundleDepuisLegacy(r.valeur));
    setEtat({ phase: 'apercu-legacy', session, donnees: r.valeur, rapport });
  }

  function confirmerLegacy(donnees: DonneesLegacy, session: Session): void {
    remplacerParBundle(bundleDepuisLegacy(donnees));
    setEtat({ phase: 'connecte', session });
    setMessage('Données de l’ancienne application chargées sur cet appareil.');
  }

  async function deconnecter(session: Session): Promise<void> {
    if (config !== null) await seDeconnecter(config, session);
    ecrireSession(local, null);
    setEtat({ phase: 'deconnecte' });
    setDistant('inconnu');
    setMessage(null);
  }

  return (
    <section className={styles.carte} aria-labelledby={`${idChamp}-titre`}>
      <h2 id={`${idChamp}-titre`} className={styles.titreCarte}>
        Compte et synchronisation
        <Info libelle="Ce que fait la connexion au compte">
          Elle enregistre et relit les données de cette version dans une table
          qui lui est propre. <strong>La table de l’ancienne application n’est
          jamais modifiée</strong>&nbsp;: elle reste utilisable, et un essai de
          cette version ne peut pas abîmer ses données.
        </Info>
      </h2>

      {etat.phase === 'deconnecte' && (
        <FormulaireConnexion idChamp={idChamp} enCours={enCours} onConnecter={connecter} />
      )}

      {etat.phase !== 'deconnecte' && (
        <>
          <dl className={styles.detail}>
            <div className={styles.ligne}>
              <dt>Connecté</dt>
              <dd>{etat.session.email}</dd>
            </div>
            <div className={styles.ligne}>
              <dt>Serveur</dt>
              <dd className={styles.url}>{config.url}</dd>
            </div>
          </dl>

          {etat.phase === 'connecte' && (
            <>
              <EtatDuCompte distant={distant} local={resumer(faitsLocaux)} />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.actionPrincipale}
                  disabled={enCours || distant === 'inconnu'}
                  onClick={() => void envoyer(
                    etat.session, distant === 'inconnu' ? null : distant?.version ?? null
                  )}
                >
                  {enCours ? 'Envoi…' : 'Envoyer sur le compte'}
                </button>
                <button
                  type="button"
                  className={styles.action}
                  disabled={enCours}
                  onClick={() => void recuperer(etat.session)}
                >
                  Récupérer depuis le compte
                </button>
                <button
                  type="button"
                  className={styles.action}
                  disabled={enCours}
                  onClick={() => void apercevoirLegacy(etat.session)}
                >
                  Reprendre l’ancienne application
                </button>
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => void deconnecter(etat.session)}
                >
                  Se déconnecter
                </button>
              </div>
            </>
          )}

          {etat.phase === 'apercu-legacy' && (
            <Apercu
              titre="Données de l’ancienne application"
              rapport={etat.rapport}
              majLe={etat.donnees.updated_at}
              onConfirmer={() => confirmerLegacy(etat.donnees, etat.session)}
              onAnnuler={() => setEtat({ phase: 'connecte', session: etat.session })}
            />
          )}

          {etat.phase === 'apercu-distant' && (
            <ApercuDistant
              resume={resumer(etat.faits)}
              majLe={etat.instantane.majLe}
              onConfirmer={() => confirmerRecuperation(etat.session, etat.faits)}
              onAnnuler={() => setEtat({ phase: 'connecte', session: etat.session })}
            />
          )}

          {etat.phase === 'conflit' && (
            <Conflit
              distant={etat.distant}
              local={resumer(faitsLocaux)}
              enCours={enCours}
              onEcraser={() => void envoyer(etat.session, etat.distant?.version ?? null)}
              onAbandonner={() => {
                setEtat({ phase: 'connecte', session: etat.session });
                setMessage('Envoi abandonné. Rien n’a été modifié sur le compte.');
              }}
            />
          )}
        </>
      )}

      {erreur !== null && <p role="alert" className={styles.echec}>{erreur}</p>}
      {message !== null && <p role="status" className={styles.succes}>{message}</p>}
    </section>
  );
}

/**
 * Où en est le compte par rapport à cet appareil.
 *
 * Sans ce repère, « Envoyer » et « Récupérer » sont deux boutons qu'on
 * actionne au hasard, dont l'un écrase toujours quelque chose.
 */
function EtatDuCompte({ distant, local }: { distant: EtatDistant; local: Resume }) {
  if (distant === 'inconnu') {
    return (
      <p className={styles.avertissement}>
        L’état du compte n’a pas pu être lu. L’envoi reste indisponible tant
        qu’on ignore ce qu’il contient&nbsp;: écrire sans le savoir pourrait
        recouvrir des données sans que rien ne l’annonce.
      </p>
    );
  }

  if (distant === null) {
    return (
      <p className={styles.explication}>
        Ce compte ne contient encore rien pour cette version. Le premier envoi
        y déposera les {local.recettes} recette(s) et {local.depenses} dépense(s)
        de cet appareil.
      </p>
    );
  }

  return (
    <dl className={styles.detail}>
      <div className={styles.ligne}>
        <dt>Compte enregistré le</dt>
        <dd>{distant.majLe === null ? '—' : dateCourte(distant.majLe.slice(0, 10))}</dd>
      </div>
      <div className={styles.ligne}>
        <dt>Cet appareil</dt>
        <dd>{local.recettes} recette(s), {local.depenses} dépense(s)</dd>
      </div>
    </dl>
  );
}

/**
 * Le compte a bougé entre la lecture et l'envoi.
 *
 * Aucune fusion automatique n'est tentée. Réunir deux jeux d'écritures
 * comptables demande de savoir, ligne à ligne, laquelle fait foi ; le deviner
 * produirait un registre que personne n'a validé. On présente donc les deux
 * états et on laisse choisir — en disant ce que chaque choix efface.
 */
function Conflit(
  { distant, local, enCours, onEcraser, onAbandonner }: {
    distant: InstantaneDistant | null;
    local: Resume;
    enCours: boolean;
    onEcraser: () => void;
    onAbandonner: () => void;
  }
) {
  const lisible = distant !== null && motifRefusFaits(distant.faits) === null;
  const cote = lisible && distant !== null ? resumer(completerFaits(distant.faits)) : null;

  return (
    <div className={styles.apercu}>
      <p className={styles.avertissement}>
        Le compte a été modifié depuis la dernière lecture, sans doute par un
        autre appareil. <strong>Rien n’a été enregistré</strong>&nbsp;: écraser
        ces modifications sans les montrer les aurait fait disparaître en
        silence.
      </p>

      <dl className={styles.detail}>
        <div className={styles.ligne}>
          <dt>Cet appareil</dt>
          <dd>{local.recettes} recette(s), {local.depenses} dépense(s)</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Le compte</dt>
          <dd>
            {cote === null
              ? 'contenu illisible'
              : `${cote.recettes} recette(s), ${cote.depenses} dépense(s)`}
          </dd>
        </div>
        {distant?.majLe != null && (
          <div className={styles.ligne}>
            <dt>Enregistré le</dt>
            <dd>{dateCourte(distant.majLe.slice(0, 10))}</dd>
          </div>
        )}
      </dl>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          disabled={enCours}
          onClick={onEcraser}
        >
          Écraser le compte avec cet appareil
        </button>
        <button type="button" className={styles.actionPrincipale} onClick={onAbandonner}>
          Abandonner l’envoi
        </button>
      </div>
    </div>
  );
}

/** Ce qui serait chargé depuis la table de cette version. */
function ApercuDistant(
  { resume, majLe, onConfirmer, onAnnuler }: {
    resume: Resume;
    majLe: string | null;
    onConfirmer: () => void;
    onAnnuler: () => void;
  }
) {
  return (
    <div className={styles.apercu}>
      <p className={styles.avertissement}>
        Ces données <strong>remplaceront</strong> l’état actuel de cet appareil.
        Ce qui n’a pas été envoyé sur le compte sera perdu.
      </p>

      <dl className={styles.detail}>
        {majLe !== null && (
          <div className={styles.ligne}>
            <dt>Enregistré le</dt>
            <dd>{dateCourte(majLe.slice(0, 10))}</dd>
          </div>
        )}
        <div className={styles.ligne}><dt>Clients</dt><dd>{resume.clients}</dd></div>
        <div className={styles.ligne}><dt>Missions</dt><dd>{resume.missions}</dd></div>
        <div className={styles.ligne}><dt>Recettes</dt><dd>{resume.recettes}</dd></div>
        <div className={styles.ligne}><dt>Dépenses</dt><dd>{resume.depenses}</dd></div>
      </dl>

      <div className={styles.actions}>
        <button type="button" className={styles.actionPrincipale} onClick={onConfirmer}>
          Remplacer les données de cet appareil
        </button>
        <button type="button" className={styles.action} onClick={onAnnuler}>
          Annuler
        </button>
      </div>
    </div>
  );
}

/**
 * Ce qui serait chargé depuis l'ancienne application.
 *
 * Le même rapport que la migration locale : nombres par entité, anomalies, et
 * champs sans destination. Un chargement qui ne dit rien de ce qu'il apporte
 * ne permet pas de constater une perte.
 */
function Apercu(
  { titre, rapport, majLe, onConfirmer, onAnnuler }: {
    titre: string;
    rapport: RapportMigration;
    majLe: string | null;
    onConfirmer: () => void;
    onAnnuler: () => void;
  }
) {
  const { comptes } = rapport;
  return (
    <div className={styles.apercu}>
      <p className={styles.avertissement}>
        {titre} — elles <strong>remplaceront</strong> l’état actuel de cet
        appareil. Ce qui n’a pas été enregistré sur le compte sera perdu.
      </p>

      <dl className={styles.detail}>
        {majLe !== null && (
          <div className={styles.ligne}>
            <dt>Enregistré le</dt>
            <dd>{dateCourte(majLe.slice(0, 10))}</dd>
          </div>
        )}
        <div className={styles.ligne}><dt>Clients</dt><dd>{comptes.clients}</dd></div>
        <div className={styles.ligne}><dt>Missions</dt><dd>{comptes.missions}</dd></div>
        <div className={styles.ligne}><dt>Recettes</dt><dd>{comptes.recettes}</dd></div>
        <div className={styles.ligne}><dt>Dépenses</dt><dd>{comptes.depenses}</dd></div>
      </dl>

      {rapport.anomalies.length > 0 && (
        <details className={styles.repli}>
          <summary>{rapport.anomalies.length} point(s) à connaître</summary>
          <ul className={styles.anomalies}>
            {rapport.anomalies.slice(0, 15).map((a, i) => (
              <li key={`${a.gravite}-${i}`}>{a.message}</li>
            ))}
            {rapport.anomalies.length > 15 && (
              <li>…et {rapport.anomalies.length - 15} autre(s).</li>
            )}
          </ul>
        </details>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.actionPrincipale} onClick={onConfirmer}>
          Remplacer les données de cet appareil
        </button>
        <button type="button" className={styles.action} onClick={onAnnuler}>
          Annuler
        </button>
      </div>
    </div>
  );
}

function FormulaireConnexion(
  { idChamp, enCours, onConnecter }: {
    idChamp: string;
    enCours: boolean;
    onConnecter: (email: string, motDePasse: string) => Promise<void>;
  }
) {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');

  return (
    <form
      className={styles.formulaire}
      onSubmit={(e) => { e.preventDefault(); void onConnecter(email, motDePasse); }}
    >
      <p className={styles.champ}>
        <label htmlFor={`${idChamp}-email`}>Adresse électronique</label>
        <input id={`${idChamp}-email`} type="email" autoComplete="username"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
      </p>
      <p className={styles.champ}>
        <label htmlFor={`${idChamp}-mdp`}>Mot de passe</label>
        <input id={`${idChamp}-mdp`} type="password" autoComplete="current-password"
          value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required />
      </p>
      <button type="submit" className={styles.actionPrincipale} disabled={enCours}>
        {enCours ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}

/**
 * Saisie de l'adresse du projet.
 *
 * Ni l'adresse ni la clé ne figurent dans le code : l'adresse d'un projet
 * désigne le compte de quelqu'un et n'a rien à faire dans un dépôt public. La
 * clé « anon », elle, est publique par conception — la protection vient des
 * règles RLS du serveur, pas de son secret.
 */
function SaisieConfig(
  { idChamp, onValider }: { idChamp: string; onValider: (c: ConfigSupabase) => void }
) {
  const [url, setUrl] = useState('');
  const [cle, setCle] = useState('');

  return (
    <section className={styles.carte} aria-labelledby={`${idChamp}-config`}>
      <h2 id={`${idChamp}-config`} className={styles.titreCarte}>
        Relier un compte
        <Info libelle="Où trouver ces informations">
          Dans le tableau de bord Supabase, section <em>Project Settings → API</em>
          &nbsp;: l’URL du projet et la clé <em>anon public</em>. Cette clé est
          faite pour être publique&nbsp;; ce qui protège les données, ce sont les
          règles d’accès définies sur le serveur. Le script de préparation de la
          base est fourni dans <em>docs/supabase.sql</em>.
        </Info>
      </h2>

      <p className={styles.explication}>
        {configDeBuild() === null
          ? 'Aucun compte n’est relié à cette installation. Renseignez l’adresse du projet pour vous connecter.'
          : 'Un compte est configuré à la compilation.'}
      </p>

      <form
        className={styles.formulaire}
        onSubmit={(e) => { e.preventDefault(); onValider({ url: url.trim(), cleAnon: cle.trim() }); }}
      >
        <p className={styles.champ}>
          <label htmlFor={`${idChamp}-url`}>URL du projet</label>
          <input id={`${idChamp}-url`} type="url" placeholder="https://exemple.supabase.co"
            value={url} onChange={(e) => setUrl(e.target.value)} required />
        </p>
        <p className={styles.champ}>
          <label htmlFor={`${idChamp}-cle`}>Clé publique (anon)</label>
          <input id={`${idChamp}-cle`} value={cle}
            onChange={(e) => setCle(e.target.value)} required />
        </p>
        <button type="submit" className={styles.actionPrincipale}>Enregistrer</button>
      </form>
    </section>
  );
}
