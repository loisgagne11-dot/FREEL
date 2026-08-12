import { useEffect, useId, useState } from 'react';
import { useFaits } from '../../state/store';
import {
  type ConfigSupabase, type DonneesLegacy, type Session,
  bundleDepuisLegacy, chargerDonneesLegacy, configDeBuild, configEffective,
  ecrireConfig, ecrireSession, lireSession, rafraichir, seConnecter,
  seDeconnecter, sessionValide
} from '../../infra/supabase';
import { convertirBundle, type RapportMigration } from '../../infra/migration';
import { Info } from '../components/Info';
import { dateCourte } from '../format';
import styles from './Compte.module.css';

/**
 * Compte distant — connexion et chargement des données.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ON MONTRE AVANT DE REMPLACER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Charger les données du compte ÉCRASE l'état local. C'est ce qu'on veut
 * — c'est le sens d'un compte partagé entre appareils — mais le faire en
 * silence ferait disparaître une saisie faite hors ligne sans que personne le
 * voie. L'écran affiche donc d'abord ce qui serait chargé, avec le même
 * rapport que la migration locale, et attend une confirmation.
 *
 * La conversion passe par `convertirBundle`, celle-là même qu'emploie la
 * migration depuis le navigateur : deux chemins distincts finiraient par
 * diverger, et l'application dirait alors deux choses différentes selon
 * l'origine de la donnée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS ÉCRIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Rien n'est envoyé au serveur. La table de l'ancienne application est lue,
 * jamais modifiée : c'est la condition pour que l'ancienne version reste
 * utilisable pendant toute la cohabitation, et pour qu'un essai de la nouvelle
 * ne puisse pas abîmer des données comptables.
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

type Etat =
  | { readonly phase: 'deconnecte' }
  | { readonly phase: 'connecte'; readonly session: Session }
  | {
    readonly phase: 'apercu';
    readonly session: Session;
    readonly donnees: DonneesLegacy;
    readonly rapport: RapportMigration;
  };

export interface ProprietesCompte {
  /** Injectable pour les tests, où `window` n'a pas de stockage utile. */
  readonly stockage?: ReturnType<typeof stockageNavigateur>;
}

export function Compte({ stockage }: ProprietesCompte = {}) {
  const local = stockage ?? stockageNavigateur();
  const remplacerParBundle = useFaits((e) => e.remplacerParBundle);

  const [config, setConfig] = useState<ConfigSupabase | null>(() => configEffective(local));
  const [etat, setEtat] = useState<Etat>({ phase: 'deconnecte' });
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
      return;
    }
    void rafraichir(config, session).then((r) => {
      if (r.statut === 'ok') {
        ecrireSession(local, r.valeur);
        setEtat({ phase: 'connecte', session: r.valeur });
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

  async function connecter(email: string, motDePasse: string): Promise<void> {
    if (config === null) return;
    setEnCours(true);
    setErreur(null);
    const r = await seConnecter(config, email, motDePasse);
    setEnCours(false);
    if (r.statut === 'erreur') { setErreur(r.motif); return; }
    ecrireSession(local, r.valeur);
    setEtat({ phase: 'connecte', session: r.valeur });
  }

  async function apercevoir(session: Session): Promise<void> {
    if (config === null) return;
    setEnCours(true);
    setErreur(null);
    setMessage(null);

    const r = await chargerDonneesLegacy(config, session);
    setEnCours(false);
    if (r.statut === 'erreur') { setErreur(r.motif); return; }
    if (r.valeur === null) {
      setMessage('Ce compte ne contient encore aucune donnée.');
      return;
    }
    const { rapport } = convertirBundle(bundleDepuisLegacy(r.valeur));
    setEtat({ phase: 'apercu', session, donnees: r.valeur, rapport });
  }

  function confirmer(donnees: DonneesLegacy, session: Session): void {
    remplacerParBundle(bundleDepuisLegacy(donnees));
    setEtat({ phase: 'connecte', session });
    setMessage('Données du compte chargées. Elles remplacent l’état local.');
  }

  async function deconnecter(session: Session): Promise<void> {
    if (config !== null) await seDeconnecter(config, session);
    ecrireSession(local, null);
    setEtat({ phase: 'deconnecte' });
    setMessage(null);
  }

  return (
    <section className={styles.carte} aria-labelledby={`${idChamp}-titre`}>
      <h2 id={`${idChamp}-titre`} className={styles.titreCarte}>
        Compte et synchronisation
        <Info libelle="Ce que fait la connexion au compte">
          Elle lit les données enregistrées par l’ancienne application et les
          convertit dans le nouveau modèle. <strong>Rien n’est écrit sur le
          serveur</strong>&nbsp;: l’ancienne version reste utilisable, et un
          essai de la nouvelle ne peut pas abîmer des données comptables.
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
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.actionPrincipale}
                disabled={enCours}
                onClick={() => void apercevoir(etat.session)}
              >
                {enCours ? 'Lecture…' : 'Charger les données du compte'}
              </button>
              <button
                type="button"
                className={styles.action}
                onClick={() => void deconnecter(etat.session)}
              >
                Se déconnecter
              </button>
            </div>
          )}

          {etat.phase === 'apercu' && (
            <Apercu
              rapport={etat.rapport}
              majLe={etat.donnees.updated_at}
              onConfirmer={() => confirmer(etat.donnees, etat.session)}
              onAnnuler={() => setEtat({ phase: 'connecte', session: etat.session })}
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
 * Ce qui serait chargé.
 *
 * Le même rapport que la migration locale : nombres par entité, anomalies, et
 * champs sans destination. Un chargement qui ne dit rien de ce qu'il apporte
 * ne permet pas de constater une perte.
 */
function Apercu(
  { rapport, majLe, onConfirmer, onAnnuler }: {
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
        Ces données <strong>remplaceront</strong> l’état actuel de cet appareil.
        Ce qui n’a pas été enregistré sur le compte sera perdu.
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
          règles d’accès définies sur le serveur.
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
