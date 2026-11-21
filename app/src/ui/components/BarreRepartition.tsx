import styles from './BarreRepartition.module.css';

/** Les teintes d'une part : les quatre charges, ce qui est à soi, la série en retrait. */
export type TeintePart = 'impot' | 'urssaf' | 'tva' | 'cfe' | 'vert' | 'retrait';

export interface PartRepartition {
  readonly cle: string;
  readonly montant: number;
  readonly teinte: TeintePart;
}

/**
 * La barre de répartition de la planche (`e-split`) : un total en segments
 * proportionnels, à bouts ronds, séparés de 3 px.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE IMAGE DES NOMBRES, JAMAIS LEUR SEULE PLACE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle dit d'un coup d'œil que l'URSSAF pèse six fois l'impôt ; elle ne dit
 * pas combien. Les montants sont écrits à côté, ligne par ligne — et la barre
 * porte en `aria-label` la phrase que l'appelant écrit, sans quoi un lecteur
 * d'écran ne rencontrerait que des `<i>` vides.
 *
 * Une part minuscule garde 8 px : 29 € de TVA sur 1 999 € feraient un trait
 * d'un pixel, qu'on prendrait pour une bordure. Une part nulle n'a pas de
 * segment — un rond de 8 px dirait qu'il y a quelque chose.
 *
 * Construite au lot 49 avec son premier usage (« Ce qui est dû »), commune dès
 * lui : le Pilote la reprend au lot 52 pour l'équation du solde.
 */
export function BarreRepartition(
  { parts, libelle }: { readonly parts: readonly PartRepartition[]; readonly libelle: string }
) {
  const visibles = parts.filter((p) => p.montant > 0);
  if (visibles.length === 0) return null;
  return (
    <div className={styles.barre} role="img" aria-label={libelle}>
      {visibles.map((p) => (
        <i
          key={p.cle}
          className={styles[p.teinte]}
          style={{ flex: `${p.montant} 1 0`, minWidth: 8 }}
        />
      ))}
    </div>
  );
}
