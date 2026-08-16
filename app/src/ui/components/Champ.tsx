import type { ReactNode } from 'react';
import type { ControleIdentifiant } from '../../domain/calculs/identifiants';
import styles from '../screens/Config.module.css';

/**
 * Un champ de formulaire : intitulé, contrôle, aide, et l'avertissement d'une
 * clé de contrôle quand le champ en porte une.
 *
 * Extrait de `Config.tsx` le jour où la section Barème est partie dans son
 * propre paquet : les deux s'en servent, et le dupliquer aurait fait diverger
 * deux formulaires qui doivent se ressembler.
 */
export function Champ(
  { id, libelle, aide, controle, children }: {
    id: string; libelle: string; aide?: string;
    /**
     * Le résultat d'une clé de contrôle, quand le champ en porte une.
     *
     * `role="status"` et non `alert` : l'avertissement apparaît pendant qu'on
     * tape, et une alerte à chaque caractère interromprait la saisie qu'elle
     * prétend aider.
     */
    controle?: ControleIdentifiant;
    children: ReactNode;
  }
) {
  const idAide = `${id}-aide`;
  return (
    <p className={styles.champ}>
      <label htmlFor={id}>{libelle}</label>
      {children}
      {aide !== undefined && <span id={idAide} className={styles.aide}>{aide}</span>}
      {controle !== undefined && controle.statut === 'suspect' && (
        <span className={styles.suspect} role="status">{controle.motif}</span>
      )}
    </p>
  );
}
