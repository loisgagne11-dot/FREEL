import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  type ConfigSupabase, type Session, type StockageLocal, seConnecter
} from '../../infra/supabase';
import {
  type IssueRetour, type MotifLien, adresseDeRetour, changerMotDePasse, creerCompte,
  demanderLienDeReinitialisation, echangerCode, lireRetour, motifDuRetour
} from '../../infra/supabase.inscription';
import { Onglets, PanneauOnglet } from '../components/Onglets';
import styles from './Compte.module.css';

/**
 * « Ton compte » — se connecter, créer son compte, retrouver l'accès.
 *
 * Chargé à la demande : une fois connecté, on ne le revoit plus, et l'écran
 * relié n'a pas à porter l'inscription ni le retour des liens.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX COMPTES QUI SE CONFONDAIENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le compte du site supabase.com (celui qui crée et administre le projet) et
 * le compte DANS le projet (celui que FREEL connecte) portent souvent la même
 * adresse — et pas le même mot de passe. L'écran le dit sous le formulaire :
 * c'est la confusion que le propriétaire a faite, et rien ne l'en avertissait.
 */

type Bilan = { readonly echec: boolean; readonly texte: string };

function Retour({ bilan }: { bilan: Bilan | null }) {
  if (bilan === null) return null;
  return (
    <p role={bilan.echec ? 'alert' : 'status'} className={bilan.echec ? styles.echec : styles.succes}>
      {bilan.texte}
    </p>
  );
}

/**
 * L'adresse où le lien d'un courriel doit ramener — à déclarer dans le projet.
 *
 * Supabase ne ramène qu'aux adresses qu'on lui a déclarées ; les autres sont
 * remplacées par l'adresse du site du projet, `localhost:3000` par défaut.
 * Sans cette ligne, le lien de réinitialisation ouvre une page d'erreur, et
 * rien ne dit pourquoi.
 */
export function AdresseDeRetour() {
  const adresse = adresseDeRetour();
  const [copie, setCopie] = useState<string | null>(null);
  return (
    <div className={styles.aide}>
      Pour que le lien te ramène ici, cette adresse doit figurer dans ton projet,
      {' '}<strong>Authentication › URL Configuration</strong> (Redirect URLs)&nbsp;:
      <div className={styles.adresse}>
        <span className={styles.mono}>{adresse}</span>
        <button type="button" className={styles.action} onClick={() => {
          navigator.clipboard.writeText(adresse).then(
            () => setCopie('Adresse copiée.'),
            () => setCopie('Copie impossible ici : sélectionne l’adresse à la main.')
          );
        }}>
          Copier l’adresse
        </button>
      </div>
      {copie !== null && <span role="status">{copie}</span>}
    </div>
  );
}

export interface ProprietesTonCompte {
  readonly config: ConfigSupabase;
  readonly stockage: StockageLocal;
  /** « 4. Ton compte » dans le guide, « Ton compte » ensuite. */
  readonly titre: string;
  /** Ce qui précède le formulaire : le projet relié, hors du guide. */
  readonly entete?: ReactNode;
  /** Ce qui ferme la carte : la navigation du guide. */
  readonly pied?: ReactNode;
  readonly onSession: (session: Session, message: string | null) => void;
}

type OngletCompte = 'connexion' | 'inscription';

const ONGLETS = [
  { id: 'connexion' as const, libelle: 'Me connecter' },
  { id: 'inscription' as const, libelle: 'Créer mon compte' }
];

export function TonCompte({ config, stockage, titre, entete, pied, onSession }: ProprietesTonCompte) {
  const id = useId();
  const [onglet, setOnglet] = useState<OngletCompte>('connexion');
  const [oubli, setOubli] = useState(false);
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [bilan, setBilan] = useState<Bilan | null>(null);

  function changerDOnglet(o: OngletCompte): void {
    setOnglet(o);
    setOubli(false);
    setBilan(null);
  }

  async function connecter(): Promise<void> {
    setEnCours(true);
    setBilan(null);
    const r = await seConnecter(config, email, motDePasse);
    setEnCours(false);
    if (r.statut === 'erreur') { setBilan({ echec: true, texte: r.motif }); return; }
    onSession(r.valeur, null);
  }

  async function inscrire(): Promise<void> {
    setEnCours(true);
    setBilan(null);
    const r = await creerCompte(config, email, motDePasse, stockage);
    setEnCours(false);
    switch (r.statut) {
      case 'connecte':
        onSession(r.session, 'Compte créé : tu es connecté.');
        return;
      case 'confirmation':
        setBilan({
          echec: false,
          texte: `Un courriel de confirmation est parti à ${email} : clique le lien, puis reviens te connecter ici.`
        });
        return;
      case 'deja-inscrit':
        setOnglet('connexion');
        setBilan({ echec: false, texte: 'Cette adresse a déjà un compte dans ce projet : connecte-toi.' });
        return;
      case 'refus':
        setBilan({ echec: true, texte: r.motif });
    }
  }

  async function demanderLien(): Promise<void> {
    setEnCours(true);
    setBilan(null);
    const r = await demanderLienDeReinitialisation(config, email, stockage);
    setEnCours(false);
    setBilan(r.statut === 'envoye'
      ? {
        echec: false,
        texte: `Si un compte existe pour ${email} dans ce projet, le courriel est parti. `
          + 'Ouvre son lien dans ce navigateur-ci : il te ramène ici pour choisir le nouveau mot de passe.'
      }
      : { echec: true, texte: r.motif });
  }

  const champEmail = (
    <p className={styles.champ}>
      <label htmlFor={`${id}-email`}>Courriel</label>
      <input id={`${id}-email`} type="email" autoComplete="username"
        value={email} onChange={(e) => setEmail(e.target.value)} required />
    </p>
  );

  return (
    <section className={styles.carte} aria-labelledby={`${id}-titre`}>
      <h3 id={`${id}-titre`} className={styles.titreCarte}>{titre}</h3>
      {entete}

      {oubli
        ? (
          <form className={styles.formulaire} onSubmit={(e) => { e.preventDefault(); void demanderLien(); }}>
            <p className={styles.explication}>
              FREEL demande au projet de t’envoyer un lien. Ouvre-le dans ce
              navigateur-ci&nbsp;: il te ramène ici pour choisir ton nouveau mot de passe.
            </p>
            {champEmail}
            <button type="submit" className={`${styles.actionPrincipale} ${styles.actionVerte} ${styles.pleineLargeur}`}
              disabled={enCours}>
              {enCours ? 'Envoi…' : 'M’envoyer le lien'}
            </button>
            <AdresseDeRetour />
            <button type="button" className={styles.lien} onClick={() => { setOubli(false); setBilan(null); }}>
              ‹ Revenir à la connexion
            </button>
          </form>
        )
        : (
          <>
            <Onglets onglets={ONGLETS} actif={onglet} onChange={changerDOnglet} libelle="Ton compte" idGroupe={id} />
            <PanneauOnglet idGroupe={id} id={onglet} actif>
              <form
                className={styles.formulaire}
                onSubmit={(e) => { e.preventDefault(); void (onglet === 'connexion' ? connecter() : inscrire()); }}
              >
                {champEmail}
                <p className={styles.champ}>
                  <label htmlFor={`${id}-mdp`}>Mot de passe</label>
                  <input id={`${id}-mdp`} type="password"
                    autoComplete={onglet === 'connexion' ? 'current-password' : 'new-password'}
                    value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required />
                </p>
                <button type="submit" className={`${styles.actionPrincipale} ${styles.actionVerte} ${styles.pleineLargeur}`}
                  disabled={enCours}>
                  {onglet === 'connexion'
                    ? (enCours ? 'Connexion…' : 'Me connecter')
                    : (enCours ? 'Création…' : 'Créer mon compte')}
                </button>
              </form>
              {onglet === 'connexion' && (
                <button type="button" className={styles.lien} onClick={() => { setOubli(true); setBilan(null); }}>
                  Mot de passe oublié&nbsp;?
                </button>
              )}
              {onglet === 'inscription' && (
                <>
                  <p className={styles.aide}>
                    Si le projet demande de confirmer l’adresse, un courriel part&nbsp;: son
                    lien te ramène ici.
                  </p>
                  <AdresseDeRetour />
                </>
              )}
            </PanneauOnglet>
            <p className={styles.aide}>
              Ce sont les identifiants de <strong>ton compte dans le projet</strong>,
              pas ceux du site supabase.com.
            </p>
          </>
        )}
      <Retour bilan={bilan} />
      {pied}
    </section>
  );
}

/* ── Le retour d'un lien ───────────────────────────────────────────────── */

/**
 * Un code ne s'échange qu'une fois : le second essai serait refusé. En
 * développement, React monte deux fois chaque effet ; sans cette mémoire, le
 * second échange effaçait le succès du premier par « ce lien ne vaut plus ».
 */
const echanges = new Map<string, Promise<IssueRetour>>();

export interface ProprietesRetour {
  readonly config: ConfigSupabase | null;
  readonly stockage: StockageLocal;
  /** Ce que l'adresse apportait, lu et retiré par `retourDuLien` avant le premier rendu. */
  readonly retour: URLSearchParams;
  readonly onSession: (session: Session, motif: MotifLien, message: string) => void;
  readonly onFini: () => void;
}

type PhaseRetour =
  | { readonly phase: 'echange' }
  | { readonly phase: 'refus'; readonly motif: string; readonly reessayable: boolean }
  | { readonly phase: 'mot-de-passe'; readonly session: Session };

/**
 * Le lien d'un courriel vient de ramener ici : on échange son code, puis —
 * pour un mot de passe oublié — on fait choisir le nouveau.
 */
export function RetourDuLien({ config, stockage, retour, onSession, onFini }: ProprietesRetour) {
  const id = useId();
  const [phase, setPhase] = useState<PhaseRetour>({ phase: 'echange' });
  const [essai, setEssai] = useState(0);
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [bilan, setBilan] = useState<Bilan | null>(null);

  useEffect(() => {
    const lu = lireRetour(retour);
    if ('erreur' in lu) { setPhase({ phase: 'refus', motif: motifDuRetour(lu.erreur), reessayable: false }); return; }
    if (config === null) {
      setPhase({
        phase: 'refus', reessayable: false,
        motif: 'Aucun projet n’est relié dans ce navigateur : le lien ne peut pas servir ici. '
          + 'Ouvre-le dans celui où tu as relié FREEL.'
      });
      return;
    }
    const cle = `${lu.code}#${essai}`;
    let promesse = echanges.get(cle);
    if (promesse === undefined) {
      promesse = echangerCode(config, lu.code, stockage);
      echanges.set(cle, promesse);
    }
    let vivant = true;
    void promesse.then((r) => {
      if (!vivant) return;
      if (r.statut === 'refus') { setPhase({ phase: 'refus', motif: r.motif, reessayable: r.reessayable }); return; }
      if (r.motif === 'inscription') {
        onSession(r.session, 'inscription', 'Adresse confirmée : tu es connecté.');
        onFini();
        return;
      }
      setPhase({ phase: 'mot-de-passe', session: r.session });
    });
    return () => { vivant = false; };
    // `onSession` et `onFini` viennent du parent et changent à chaque rendu ;
    // l'échange, lui, ne doit partir qu'une fois par essai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retour, config, stockage, essai]);

  async function changer(session: Session): Promise<void> {
    if (config === null) return;
    if (nouveau !== confirmation) { setBilan({ echec: true, texte: 'Les deux saisies diffèrent : retape-les.' }); return; }
    setEnCours(true);
    setBilan(null);
    const r = await changerMotDePasse(config, session, nouveau);
    setEnCours(false);
    if (r.statut === 'refus') { setBilan({ echec: true, texte: r.motif }); return; }
    onSession(session, 'recuperation', 'Mot de passe changé : tu es connecté.');
    onFini();
  }

  return (
    <section className={styles.carte} aria-labelledby={`${id}-titre`}>
      <h3 id={`${id}-titre`} className={styles.titreCarte}>
        {phase.phase === 'mot-de-passe' ? 'Choisis ton nouveau mot de passe' : 'Le lien de ton courriel'}
      </h3>
      {phase.phase === 'echange' && <p className={styles.consequence}>Vérification du lien…</p>}
      {phase.phase === 'refus' && (
        <>
          <p role="alert" className={styles.echec}>{phase.motif}</p>
          <div className={styles.actions}>
            {phase.reessayable && (
              <button type="button" className={styles.actionPrincipale} onClick={() => {
                setPhase({ phase: 'echange' });
                setEssai((n) => n + 1);
              }}>
                Réessayer
              </button>
            )}
            <button type="button" className={styles.action} onClick={onFini}>Continuer</button>
          </div>
        </>
      )}
      {phase.phase === 'mot-de-passe' && (
        <form className={styles.formulaire} onSubmit={(e) => { e.preventDefault(); void changer(phase.session); }}>
          <p className={styles.explication}>
            Le lien est valable&nbsp;: choisis le mot de passe de <strong>ton compte
            dans le projet</strong> ({phase.session.email}).
          </p>
          <p className={styles.champ}>
            <label htmlFor={`${id}-nouveau`}>Nouveau mot de passe</label>
            <input id={`${id}-nouveau`} type="password" autoComplete="new-password"
              value={nouveau} onChange={(e) => setNouveau(e.target.value)} required />
          </p>
          <p className={styles.champ}>
            <label htmlFor={`${id}-confirmation`}>Retape-le</label>
            <input id={`${id}-confirmation`} type="password" autoComplete="new-password"
              value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required />
          </p>
          <button type="submit" className={`${styles.actionPrincipale} ${styles.actionVerte} ${styles.pleineLargeur}`}
            disabled={enCours}>
            {enCours ? 'Enregistrement…' : 'Enregistrer ce mot de passe'}
          </button>
          {/* Le lien a prouvé que l'adresse est la sienne : la session vaut,
              même sans nouveau mot de passe — la jeter ferait redemander un
              lien pour rien. */}
          <button type="button" className={styles.lien} onClick={() => {
            onSession(phase.session, 'recuperation', 'Tu es connecté ; ton mot de passe n’a pas changé.');
            onFini();
          }}>
            Plus tard
          </button>
        </form>
      )}
      <Retour bilan={bilan} />
    </section>
  );
}
