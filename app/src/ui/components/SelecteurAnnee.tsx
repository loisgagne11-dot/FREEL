import { useId } from 'react';
import styles from './SelecteurAnnee.module.css';

export interface ProprietesSelecteurAnnee {
  /** Les années proposables — voir `anneesDisponibles`, qui les borne aux faits du dossier. */
  readonly annees: readonly number[];
  readonly valeur: number;
  readonly onChange: (annee: number) => void;
}

/**
 * La bascule d'année de la barre du haut.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE CHANGE, ET CE QU'ELLE NE CHANGE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle pilote le chiffre d'affaires, les seuils et les provisions affichés —
 * tout ce qui se lit « sur » une année. Elle ne touche JAMAIS au solde du
 * compte : c'est un état instantané, pas une période, et le déplacer avec
 * l'année reviendrait à faire croire que le compte en banque change de
 * valeur parce qu'on regarde ailleurs. Voir `EtatArgent` et le test qui tient
 * cette frontière.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN SEUL CHOIX N'EST PAS UN CHOIX
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un dossier neuf n'a que l'année courante à proposer. Un menu à une seule
 * entrée n'apprend rien et n'offre rien à faire : il se masque plutôt que
 * d'occuper la barre pour rien.
 */
export function SelecteurAnnee({ annees, valeur, onChange }: ProprietesSelecteurAnnee) {
  const idChamp = useId();

  if (annees.length <= 1) return null;

  return (
    <div className={styles.champ}>
      <label htmlFor={idChamp} className={styles.libelle}>Année</label>
      <select
        id={idChamp}
        className={styles.choix}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {annees.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
    </div>
  );
}
