import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  type ConfigSupabase, type Session, type StockageLocal, adresseDuProjet
} from '../../infra/supabase';
import {
  type VerificationProjet, constatsDuProjet, projetJoint, projetPret, verifierProjet
} from '../../infra/supabase.verification';
import { TonCompte } from './Compte.connexion';
import { ListeConstats, quandFr } from './Compte.sante';
import styles from './Compte.module.css';

/**
 * Relier FREEL en cinq étapes (maquette `direction/compte.html`, états 2 à 4).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN GUIDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'écran demandait d'emblée une adresse et une clé, et renvoyait à un fichier
 * du dépôt pour préparer la base. Le propriétaire n'a pas pu relier son compte
 * (21/11) et a jugé la procédure « pas claire, même pour moi ». Le guide dit
 * chaque geste, dans l'ordre, là où il se fait — et VÉRIFIE avant de passer au
 * suivant : une étape sautée se voit à l'étape d'après, avec le geste qui la
 * rattrape, au lieu d'un échec générique à la connexion.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉTAPE EST UN ÉTAT D'ÉCRAN, JAMAIS UN FAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'étape en cours vit dans le stockage de SESSION de l'onglet (voir
 * `Compte.tsx`) : elle survit à l'aller-retour vers supabase.com et à un
 * rechargement, pas à la fermeture de l'onglet. Ce qui est vrai du projet —
 * base préparée, inscriptions fermées — se constate à chaque fois ; l'étape ne
 * fait que dire où l'on en est dans la lecture.
 */
export type EtapeGuide = 1 | 2 | 3 | 4 | 5;

export interface ProprietesGuide {
  readonly etape: EtapeGuide;
  readonly onEtape: (e: EtapeGuide) => void;
  /** Le projet relié, s'il l'est déjà : l'étape 3 le reprend. */
  readonly config: ConfigSupabase | null;
  /** Le projet et la clé ont tenu : le parent l'enregistre. */
  readonly onConfig: (c: ConfigSupabase) => void;
  readonly stockage: StockageLocal;
  readonly session: Session | null;
  readonly onSession: (session: Session, message: string | null) => void;
  /** Fini, ou remis à plus tard : on rejoint l'écran du compte. */
  readonly onQuitter: () => void;
  /** Injectable pour les tests. */
  readonly verifier?: typeof verifierProjet;
}

const ETAPES: readonly { readonly titre: string; readonly resume: string }[] = [
  { titre: 'Créer ton projet', resume: 'Un compte et un projet sur supabase.com.' },
  { titre: 'Préparer la base', resume: 'Un script à coller dans ton projet.' },
  { titre: 'Relier FREEL', resume: 'L’adresse du projet et sa clé publique.' },
  { titre: 'Ton compte', resume: 'Ton courriel et un mot de passe.' },
  { titre: 'Fermer les inscriptions', resume: 'Pour que personne d’autre ne s’installe chez toi.' }
];

export function Guide(props: ProprietesGuide) {
  const { etape, config, onQuitter } = props;
  // Sans projet relié, les étapes 4 et 5 n'ont rien sur quoi s'appuyer : on
  // reprend à l'étape 3 plutôt que d'afficher un formulaire qui échouerait.
  const effective: EtapeGuide = etape >= 4 && config === null ? 3 : etape;

  return (
    <div className={styles.pile}>
      {effective <= 2 && <FilDesEtapes {...props} etape={effective} />}
      {effective === 3 && <EtapeRelier {...props} />}
      {effective === 4 && config !== null && props.session === null && (
        <TonCompte
          titre="4. Ton compte"
          config={config}
          stockage={props.stockage}
          onSession={props.onSession}
          pied={<Navigation onPrecedente={() => props.onEtape(3)} onQuitter={onQuitter} />}
        />
      )}
      {/* Revenu à l'étape 4 déjà connecté : rien à saisir, on le dit. */}
      {effective === 4 && config !== null && props.session !== null && (
        <section className={styles.carte} aria-label="4. Ton compte">
          <h3 className={styles.titreCarte}>4. Ton compte</h3>
          <p className={styles.explication}>Tu es connecté&nbsp;: <strong>{props.session.email}</strong>.</p>
          <div className={styles.actions}>
            <button type="button" className={`${styles.actionPrincipale} ${styles.actionVerte}`}
              onClick={() => props.onEtape(5)}>
              Continuer
            </button>
          </div>
        </section>
      )}
      {effective === 5 && config !== null && <EtapeInscriptions {...props} config={config} />}
    </div>
  );
}

function Navigation({ onPrecedente, onQuitter }: { onPrecedente: (() => void) | null; onQuitter: () => void }) {
  // « Quitter » n'efface rien : ce qui a été relié le reste, et l'écran du
  // compte dit, dans sa santé, ce qui manque encore.
  return (
    <div className={styles.actions}>
      {onPrecedente !== null && (
        <button type="button" className={styles.action} onClick={onPrecedente}>‹ Étape précédente</button>
      )}
      <button type="button" className={styles.action} onClick={onQuitter}>Quitter le guide</button>
    </div>
  );
}

/* ── Étapes 1 et 2 : le fil ────────────────────────────────────────────── */

function FilDesEtapes({ etape, onEtape, onQuitter }: ProprietesGuide) {
  const id = useId();
  return (
    <section className={styles.carte} aria-labelledby={`${id}-titre`}>
      <h3 id={`${id}-titre`} className={styles.titreCarte}>Relier FREEL en cinq étapes</h3>
      <p className={styles.explication}>
        Dix minutes, une seule fois. Chaque étape est vérifiée avant la suivante.
      </p>
      <ol className={styles.etapes}>
        {ETAPES.map((e, i) => {
          const n = (i + 1) as EtapeGuide;
          const classe = n < etape ? styles.fait : n === etape ? styles.ici : styles.plusTard;
          return (
            <li key={e.titre} className={`${styles.etape} ${classe}`} aria-current={n === etape ? 'step' : undefined}>
              <b>
                {e.titre}
                {n < etape && <span className={styles.horsEcran}> — fait</span>}
              </b>
              {n === 1 && (
                <>
                  <small>
                    Sur supabase.com&nbsp;: un compte, puis «&nbsp;New project&nbsp;», région
                    {' '}<strong>Europe (Paris ou Francfort)</strong>. Note le mot de passe de la
                    base, FREEL n’en a pas besoin.
                  </small>
                  {/* Une simple navigation, dans un autre onglet : rien n'est
                      chargé d'ailleurs dans cette page, la politique de contenu
                      ne s'ouvre pas, et aucun référent ne part (`index.html`). */}
                  <a className={styles.lien} href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">
                    Ouvrir supabase.com&nbsp;↗
                  </a>
                  {etape === 1 && (
                    <div className={styles.actions}>
                      <button type="button" className={`${styles.actionPrincipale} ${styles.actionVerte}`}
                        onClick={() => onEtape(2)}>
                        C’est fait
                      </button>
                    </div>
                  )}
                </>
              )}
              {n === 2 && etape === 2 && <PreparerLaBase onFait={() => onEtape(3)} />}
              {n > etape && <small>{e.resume}</small>}
            </li>
          );
        })}
      </ol>
      <Navigation onPrecedente={etape === 2 ? () => onEtape(1) : null} onQuitter={onQuitter} />
    </section>
  );
}

/**
 * L'étape 2 : copier le script d'un geste.
 *
 * Il se charge dès que l'étape s'affiche : le presse-papiers n'accepte
 * d'écrire que juste après un clic, et attendre le réseau entre les deux le
 * faisait refuser dans certains navigateurs. Si la copie échoue malgré tout,
 * le script s'affiche, sélectionné : Ctrl+C suffit.
 */
function PreparerLaBase({ onFait }: { onFait: () => void }) {
  const [script, setScript] = useState<string | null>(null);
  const [copie, setCopie] = useState<'copie' | 'echec' | null>(null);
  const pre = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let vivant = true;
    void import('./Compte.script').then((m) => { if (vivant) setScript(m.SCRIPT_SUPABASE); });
    return () => { vivant = false; };
  }, []);

  useEffect(() => {
    if (copie !== 'echec' || pre.current === null) return;
    const plage = document.createRange();
    plage.selectNodeContents(pre.current);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(plage);
  }, [copie]);

  async function copier(): Promise<void> {
    const texte = script ?? (await import('./Compte.script')).SCRIPT_SUPABASE;
    setScript(texte);
    try {
      await navigator.clipboard.writeText(texte);
      setCopie('copie');
    } catch {
      setCopie('echec');
    }
  }

  return (
    <>
      <small>
        Dans ton projet&nbsp;: <strong>SQL Editor › New query</strong>, colle le
        script, puis <strong>Run</strong>. Il crée la table de tes données et les
        règles qui la protègent. Il se relance sans rien perdre.
      </small>
      <div className={styles.actions}>
        <button type="button" className={`${styles.actionPrincipale} ${styles.actionVerte}`} onClick={() => void copier()}>
          Copier le script
        </button>
        <button type="button" className={styles.actionPrincipale} onClick={onFait}>C’est fait</button>
      </div>
      {copie === 'copie' && (
        <p role="status" className={styles.succes}>Script copié : colle-le dans l’éditeur SQL du projet.</p>
      )}
      {copie === 'echec' && (
        <>
          <p role="status" className={styles.consequence}>
            Le navigateur refuse la copie : le script est sélectionné ci-dessous, copie-le avec Ctrl+C.
          </p>
          <pre ref={pre} className={styles.script}>{script}</pre>
        </>
      )}
    </>
  );
}

/* ── Étape 3 : relier ──────────────────────────────────────────────────── */

function EtapeRelier({ config, onConfig, onEtape, onQuitter, verifier = verifierProjet }: ProprietesGuide) {
  const id = useId();
  const [url, setUrl] = useState(config?.url ?? '');
  const [cle, setCle] = useState(config?.cleAnon ?? '');
  const [verification, setVerification] = useState<VerificationProjet | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function verifierLeProjet(): Promise<void> {
    // L'adresse ramenée à son origine AVANT d'être vérifiée : collée avec
    // `/rest/v1/`, elle doublait chaque chemin (21/11). Le champ montre ce qui
    // est vérifié et enregistré.
    const candidate: ConfigSupabase = { url: adresseDuProjet(url), cleAnon: cle.trim() };
    setUrl(candidate.url);
    setEnCours(true);
    const v = await verifier(candidate);
    setEnCours(false);
    setVerification(v);
    if (projetJoint(v)) onConfig(candidate);
  }

  const constats = verification === null ? null
    : constatsDuProjet(verification, ['joignable', 'cle', 'base', 'acces']);

  return (
    <section className={styles.carte} aria-labelledby={`${id}-titre`}>
      <h3 id={`${id}-titre`} className={styles.titreCarte}>3. Relier FREEL</h3>
      <p className={styles.explication}>
        Dans ton projet&nbsp;: <strong>Project Settings › API</strong>.
      </p>
      <form className={styles.formulaire} onSubmit={(e) => { e.preventDefault(); void verifierLeProjet(); }}>
        <div className={styles.champ}>
          <label htmlFor={`${id}-url`}>Adresse du projet</label>
          <input id={`${id}-url`} type="text" inputMode="url" placeholder="https://identifiant.supabase.co"
            autoComplete="off" spellCheck={false}
            value={url} onChange={(e) => setUrl(e.target.value)} required aria-describedby={`${id}-url-aide`} />
          <small id={`${id}-url-aide`} className={styles.aide}>
            Celle qui finit par <span className={styles.mono}>.supabase.co</span> — si tu colles
            l’adresse avec <span className={styles.mono}>/rest/v1</span>, FREEL la raccourcit.
          </small>
        </div>
        <div className={styles.champ}>
          <label htmlFor={`${id}-cle`}>Clé publique (anon)</label>
          <input id={`${id}-cle`} type="text" autoComplete="off" spellCheck={false}
            value={cle} onChange={(e) => setCle(e.target.value)} required aria-describedby={`${id}-cle-aide`} />
          <small id={`${id}-cle-aide`} className={styles.aide}>
            La longue, qui commence par <span className={styles.mono}>eyJ</span>. Jamais la clé
            {' '}<span className={styles.mono}>service_role</span>.
          </small>
        </div>
        <button type="submit" className={`${styles.actionPrincipale} ${styles.actionVerte} ${styles.pleineLargeur}`}
          disabled={enCours}>
          {enCours ? 'Vérification…' : 'Vérifier'}
        </button>
      </form>

      {constats !== null && (
        <ListeConstats
          constats={constats}
          libelle="Vérification"
          complement={(c) => c.maillon === 'base' && c.statut === 'ko' && (
            <button type="button" className={styles.lien} onClick={() => onEtape(2)}>‹ Revoir l’étape 2</button>
          )}
        />
      )}

      {verification !== null && projetPret(verification) && (
        <div className={styles.actions}>
          <button type="button" className={styles.actionPrincipale} onClick={() => onEtape(4)}>Continuer</button>
        </div>
      )}
      <Navigation onPrecedente={() => onEtape(2)} onQuitter={onQuitter} />
    </section>
  );
}

/* ── Étape 5 : fermer les inscriptions ─────────────────────────────────── */

function EtapeInscriptions(
  { config, onQuitter, verifier = verifierProjet }: ProprietesGuide & { readonly config: ConfigSupabase }
) {
  const id = useId();
  const [verification, setVerification] = useState<VerificationProjet | null>(null);
  const [enCours, setEnCours] = useState(false);
  const vivant = useRef(true);

  const relire = useCallback(async () => {
    setEnCours(true);
    const v = await verifier(config);
    if (!vivant.current) return;
    setVerification(v);
    setEnCours(false);
  }, [config, verifier]);

  useEffect(() => {
    vivant.current = true;
    void relire();
    return () => { vivant.current = false; };
  }, [relire]);

  // La consigne est dans le paragraphe : la ligne ne redit que le constat.
  const constat = verification === null ? null
    : constatsDuProjet(verification, ['inscriptions']).map((c) => ({ ...c, detail: null }));
  const fermees = constat?.[0]?.statut === 'ok';

  return (
    <section className={styles.carte} aria-labelledby={`${id}-titre`}>
      <h3 id={`${id}-titre`} className={styles.titreCarte}>5. Fermer les inscriptions</h3>
      <p className={styles.explication}>
        Ton compte existe&nbsp;: plus personne n’a à en créer. Dans ton projet,
        {' '}<strong>Authentication › Sign In / Providers</strong>, décoche
        «&nbsp;Allow new users to sign up&nbsp;».
      </p>
      {constat === null
        ? <p className={styles.consequence}>Vérification en cours…</p>
        : (
          <ListeConstats
            constats={constat}
            libelle="Inscriptions"
            complement={() => verification !== null && (
              <small>vérifié {quandFr(verification.le)} — FREEL relit ce réglage</small>
            )}
          />
        )}
      <div className={styles.actions}>
        {fermees
          ? (
            <button type="button" className={`${styles.actionPrincipale} ${styles.actionVerte}`} onClick={onQuitter}>
              Terminer
            </button>
          )
          : (
            <>
              <button type="button" className={`${styles.actionPrincipale} ${styles.actionVerte}`} disabled={enCours}
                onClick={() => void relire()}>
                Vérifier à nouveau
              </button>
              <button type="button" className={styles.action} onClick={onQuitter}>Plus tard</button>
            </>
          )}
      </div>
    </section>
  );
}
