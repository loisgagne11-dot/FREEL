import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ConfigSupabase } from '../../infra/supabase';
import {
  type Constat, type StatutConstat, type VerificationProjet, constatsDuProjet, verifierProjet
} from '../../infra/supabase.verification';
import { AlertesAcces, LignesAcces } from './Compte.acces';
import styles from './Compte.module.css';

/**
 * « Santé du projet » — ce que la relecture constate, une fois le projet relié.
 *
 * La même vérification que l'étape 3 du guide (`supabase.verification`), relue
 * à chaque ouverture de l'écran : une règle retirée, des inscriptions rouvertes
 * ou une table supprimée depuis la dernière fois doivent se voir ici, pas à la
 * prochaine panne. Le verdict n'est jamais conservé.
 */

/** Un signe par statut : un état ne se lit jamais par la seule couleur. */
const SIGNES: Readonly<Record<StatutConstat | 'info', string>> = {
  ok: '✓', ko: '✗', inconnu: '?', attente: '·', info: 'i'
};

/** « le 22/11 à 9 h 40 » — l'heure à la française, dans le fuseau de l'appareil. */
export function quandFr(iso: string, maintenant: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const heure = `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
  const memeJour = d.toDateString() === maintenant.toDateString();
  return memeJour
    ? `à ${heure}`
    : `le ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} à ${heure}`;
}

/** Une liste de constats : signe, libellé, et le geste qui répare. */
export function ListeConstats(
  { constats, libelle, complement, children }: {
    readonly constats: readonly Constat[];
    readonly libelle: string;
    /** Ce qu'un constat porte de plus à cet endroit (une heure, un bouton). */
    readonly complement?: (c: Constat) => ReactNode;
    readonly children?: ReactNode;
  }
) {
  return (
    <ul className={styles.constats} aria-label={libelle}>
      {constats.map((c) => (
        <li key={c.maillon} className={`${styles.constat} ${styles[c.statut]}`}>
          <span className={styles.signe} aria-hidden="true">{SIGNES[c.statut]}</span>
          <div>
            {c.libelle}
            {c.detail !== null && <small>{c.detail}</small>}
            {complement?.(c)}
          </div>
        </li>
      ))}
      {children}
    </ul>
  );
}

/** La ligne d'information de l'offre gratuite : un rappel, pas une vérification. */
export function LigneOffreGratuite() {
  return (
    <li className={`${styles.constat} ${styles.info}`}>
      <span className={styles.signe} aria-hidden="true">{SIGNES.info}</span>
      <div>
        Offre gratuite
        <small>
          Supabase met en pause un projet sans activité pendant une semaine&nbsp;;
          tes données restent sur l’appareil, il suffit de le rouvrir depuis
          supabase.com.
        </small>
      </div>
    </li>
  );
}

export interface ProprietesSante {
  readonly config: ConfigSupabase;
  /** Les gestes posés en pied de carte : changer de projet, états précédents. */
  readonly pied: ReactNode;
  /** Ce que ces gestes ouvrent (la liste des états précédents), sous le pied. */
  readonly suite?: ReactNode;
  /** Injectable pour les tests. */
  readonly verifier?: typeof verifierProjet;
}

export function SanteDuProjet({ config, pied, suite, verifier = verifierProjet }: ProprietesSante) {
  const [verification, setVerification] = useState<VerificationProjet | null>(null);
  const [enCours, setEnCours] = useState(false);
  const vivant = useRef(true);
  const id = useId();

  const lancer = useCallback(async () => {
    setEnCours(true);
    const v = await verifier(config);
    if (!vivant.current) return;
    setVerification(v);
    setEnCours(false);
  }, [config, verifier]);

  useEffect(() => {
    vivant.current = true;
    void lancer();
    return () => { vivant.current = false; };
  }, [lancer]);

  // Le projet et la clé ne se montrent que lorsqu'ils cassent : relié, c'est
  // l'état attendu, et deux ✓ de plus diraient moins que les trois qui restent.
  const constats = verification === null ? null
    : constatsDuProjet(verification, ['joignable', 'cle', 'base', 'acces', 'inscriptions'])
      .filter((c) => !((c.maillon === 'joignable' || c.maillon === 'cle') && c.statut === 'ok'));
  const acces = verification?.acces ?? null;
  const accesEnDefaut = constats?.some((c) => c.maillon === 'acces' && c.statut !== 'ok') ?? false;

  return (
    <section className={styles.carte} aria-labelledby={id}>
      <h3 id={id} className={styles.titreCarte}>Santé du projet</h3>
      {constats === null
        ? <p className={styles.consequence}>Vérification en cours…</p>
        : (
          <ListeConstats
            constats={constats}
            libelle="Santé du projet"
            complement={(c) => c.maillon === 'acces' && c.statut === 'ok' && verification !== null && (
              <small>règles d’accès vérifiées {quandFr(verification.le)}</small>
            )}
          >
            <LigneOffreGratuite />
          </ListeConstats>
        )}

      {acces !== null && (
        <>
          <AlertesAcces verdict={acces} />
          {/* Le détail table par table, ouvert d'office quand quelque chose
              cloche : c'est là qu'on lit laquelle. */}
          <details className={styles.repli} open={accesEnDefaut}>
            <summary><span className={styles.chevron} aria-hidden="true" />Le détail, table par table</summary>
            <LignesAcces verdict={acces} />
          </details>
        </>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.action} disabled={enCours} onClick={() => void lancer()}>
          Vérifier à nouveau
        </button>
        {pied}
      </div>
      {suite}
    </section>
  );
}
