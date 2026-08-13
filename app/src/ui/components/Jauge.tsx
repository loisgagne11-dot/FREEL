import styles from './Jauge.module.css';

/**
 * Un entier lisible : séparateurs de milliers, jamais de décimales.
 *
 * Un seuil s'annonce en dizaines de milliers d'euros ; le centime n'y apporte
 * rien et allonge la ligne. Mais « 27700 » se déchiffre, il ne se lit pas —
 * et cet écran sert justement à savoir d'un coup d'œil où l'on en est.
 */
const nombre = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);

/**
 * Une jauge de seuil — le `Gauge` de la spec de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA BARRE N'EST PAS L'INFORMATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une barre remplie à 86 % se lit d'un coup d'œil, et c'est tout son intérêt.
 * Mais elle ne dit ni combien il reste, ni à partir de quand ça devient un
 * problème. Les deux chiffres sont donc écrits à côté — la barre les résume,
 * elle ne les remplace pas.
 *
 * `role="img"` avec un nom accessible : sans lui, un lecteur d'écran ne
 * rencontre que deux `<div>` vides.
 */
export function Jauge(
  { libelle, atteint, seuil, unite, alerteA = 0.85 }: {
    readonly libelle: string;
    readonly atteint: number;
    readonly seuil: number;
    readonly unite: string;
    /** Part du seuil à partir de laquelle la jauge passe en alerte. */
    readonly alerteA?: number;
  }
) {
  const part = seuil > 0 ? atteint / seuil : 0;
  // Au-delà du seuil, la barre reste pleine : elle ne peut pas déborder de sa
  // piste, et le dépassement se lit dans le texte, en clair.
  const largeur = Math.min(100, Math.max(0, part * 100));
  const depasse = atteint > seuil;
  const ton = depasse ? styles.depasse : part >= alerteA ? styles.proche : styles.normal;
  const reste = Math.max(0, seuil - atteint);

  return (
    <div className={styles.jauge}>
      <div className={styles.entete}>
        <span className={styles.libelle}>{libelle}</span>
        <span className={styles.part}>{Math.round(part * 100)} %</span>
      </div>

      <div
        className={styles.piste}
        role="img"
        aria-label={`${libelle} : ${Math.round(part * 100)} % du seuil de ${nombre(seuil)} ${unite}`}
      >
        <div className={`${styles.remplissage} ${ton}`} style={{ width: `${largeur}%` }} />
      </div>

      <p className={styles.detail}>
        {depasse
          ? <>Seuil dépassé de <strong>{nombre(atteint - seuil)}&nbsp;{unite}</strong>.</>
          : (
            <>
              Il reste <strong>{nombre(reste)}&nbsp;{unite}</strong> avant le
              seuil de {nombre(seuil)}&nbsp;{unite}.
            </>
          )}
      </p>
    </div>
  );
}
