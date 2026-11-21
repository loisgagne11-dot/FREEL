import styles from './AnneauSeuil.module.css';

const RAYON = 34;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

/**
 * La jauge de seuil de la planche : un anneau, une seule valeur, le
 * pourcentage au centre (`DIRECTION-VISUELLE.md`, « Anneau »).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ANNEAU S'ARRÊTE À 100 %, LE NOMBRE NON
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un seuil dépassé remplit l'anneau ; le pourcentage écrit au centre continue
 * — « 193 % » —, parce que c'est lui qui dit de combien. Un arc qui ferait un
 * second tour ne se lirait plus. La couleur dit l'état, jamais seule : la
 * phrase à côté porte toujours un signe et un mot.
 *
 * `role="img"` et la phrase de l'appelant : les deux nombres — atteint, seuil
 * — sont écrits à côté en texte.
 */
export function AnneauSeuil(
  { part, teinte, libelle }: {
    /** Atteint / seuil ; au-delà de 1, l'anneau est plein. */
    readonly part: number;
    readonly teinte: 'vert' | 'tva' | 'ambre' | 'rouge';
    readonly libelle: string;
  }
) {
  const borne = Math.max(0, Math.min(1, part));
  return (
    <svg className={styles.anneau} viewBox="0 0 84 84" role="img" aria-label={libelle}>
      <circle className={styles.fond} cx={42} cy={42} r={RAYON} />
      {borne > 0 && (
        <circle
          className={`${styles.arc} ${styles[teinte]}`}
          cx={42} cy={42} r={RAYON}
          strokeDasharray={`${(borne * CIRCONFERENCE).toFixed(1)} ${CIRCONFERENCE.toFixed(1)}`}
        />
      )}
      <text className={styles.centre} x={42} y={47.5}>{Math.round(part * 100)}%</text>
    </svg>
  );
}
