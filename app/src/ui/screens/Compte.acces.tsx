import { useRef, useState } from 'react';
import {
  type VerdictAcces, type VerdictTable, sqlProtectionFaits, sqlProtectionLegacy
} from '../../infra/supabase.acces';
import { sqlMemoireDuCompte } from '../../infra/supabase.memoire';
import styles from './Compte.acces.module.css';

/**
 * Règles d'accès du projet : ce qu'un inconnu muni de la seule clé publique lit,
 * table par table, et le SQL qui ferme une table exposée.
 *
 * La sonde n'est plus lancée ici : la santé du projet (`Compte.sante`) la mène
 * avec le reste de la vérification, et passe son verdict. Le verdict n'est
 * jamais mémorisé : une règle posée entre-temps doit se voir au clic suivant,
 * et un « protégée » périmé serait pire que pas de verdict.
 */
function Ligne({ titre, verdict }: { titre: string; verdict: VerdictTable }) {
  let classe: string | undefined;
  let texte: string;
  switch (verdict.statut) {
    case 'protegee':
      classe = styles['protegee']; texte = 'ne se lisent pas sans connexion'; break;
    case 'exposee':
      classe = styles['exposee'];
      texte = `EXPOSÉES : ${verdict.lignes} ligne(s) se lisent sans connexion`; break;
    case 'absente':
      classe = styles['absente']; texte = 'table absente — rien à protéger'; break;
    case 'inconnu':
      classe = styles['inconnu']; texte = `vérification impossible : ${verdict.motif}`; break;
  }
  return (
    <div className={styles['table']}>
      <span>{titre}</span>
      <span className={`${styles['verdict']} ${classe ?? ''}`}>{texte}</span>
    </div>
  );
}

/** Le verdict de chaque table, en toutes lettres. */
export function LignesAcces({ verdict }: { verdict: VerdictAcces }) {
  return (
    <div className={styles['bloc']}>
      <p className={styles['pied']}>
        La clé publique du projet figure dans toute page servie ; seules les règles
        d’accès empêchent un inconnu de lire tes données. Cette vérification compte
        ce qui se lit sans connexion, sans rien lire.
      </p>
      <Ligne titre="Données de cette application" verdict={verdict.faits} />
      <Ligne titre="Données de l’ancienne application" verdict={verdict.legacy} />
      <Ligne titre="États précédents du compte" verdict={verdict.historique} />
    </div>
  );
}

/** Le SQL à appliquer pour chaque table exposée — rien quand aucune ne l'est. */
export function AlertesAcces({ verdict }: { verdict: VerdictAcces }) {
  return (
    <>
      {verdict.legacy.statut === 'exposee' && (
        <AlerteSql
          titre="Les données de l’ancienne application sont lisibles par n’importe qui."
          consigne="À exécuter dans l’éditeur SQL du projet Supabase. L’ancienne application continue de fonctionner : c’est la règle qu’elle documentait."
          sql={sqlProtectionLegacy()}
        />
      )}
      {verdict.faits.statut === 'exposee' && (
        <AlerteSql
          titre="Les données de cette application sont lisibles par n’importe qui."
          consigne="À exécuter dans l’éditeur SQL du projet Supabase (section « ACCÈS » de docs/supabase.sql)."
          sql={sqlProtectionFaits()}
        />
      )}
      {verdict.historique.statut === 'exposee' && (
        <AlerteSql
          titre="Les états précédents du compte sont lisibles par n’importe qui."
          consigne="À exécuter dans l’éditeur SQL du projet Supabase (section « MÉMOIRE DU COMPTE » de docs/supabase.sql)."
          sql={sqlMemoireDuCompte()}
        />
      )}
    </>
  );
}

/** Exportée pour les états précédents du compte : le même geste, copier et exécuter. */
export function AlerteSql(
  { titre, consigne, sql }: { titre: string; consigne: string; sql: string }
) {
  const pre = useRef<HTMLPreElement>(null);
  const [copie, setCopie] = useState<string | null>(null);

  async function copier(): Promise<void> {
    try {
      await navigator.clipboard.writeText(sql);
      setCopie('SQL copié.');
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : on
      // sélectionne le texte pour que Ctrl+C suffise, plutôt que d'échouer muet.
      const noeud = pre.current;
      if (noeud !== null) {
        const sel = window.getSelection();
        const plage = document.createRange();
        plage.selectNodeContents(noeud);
        sel?.removeAllRanges();
        sel?.addRange(plage);
      }
      setCopie('Copie impossible ici : le texte est sélectionné, copie-le à la main.');
    }
  }

  return (
    <div role="alert" className={styles['alerte']}>
      <strong>{titre}</strong>
      <p>{consigne}</p>
      <pre ref={pre} className={styles['sql']}>{sql}</pre>
      <button type="button" className={styles['bouton']} onClick={() => void copier()}>
        Copier le SQL
      </button>
      {copie !== null && <span role="status"> {copie}</span>}
    </div>
  );
}
